// Local REAL-Redis WATCH/MULTI/EXEC test. Never touches Reddit or Devvit Redis.
// Requires a disposable Redis on 127.0.0.1:6380, e.g. Docker port 6380:6379.
// npm run test:redis -- --players=1500 --concurrency=50
import Redis from 'ioredis';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {createGame,start,enter,vote,advance,tally} from '../src/shared/arena.ts';
import {mergeVotes} from '../src/shared/vote-store.ts';
import {optimisticRetry} from '../src/shared/optimistic-retry.ts';

const option=(name,def)=>{const v=process.argv.find(a=>a.startsWith('--'+name+'='));return v?Number(v.split('=')[1]):def};
const players=option('players',1500);
const concurrency=option('concurrency',50);
const attempts=option('attempts',8);
for(const [name,value,min,max] of [['players',players,2,10000],['concurrency',concurrency,1,200],['attempts',attempts,1,100]]){
 if(!Number.isSafeInteger(value)||value<min||value>max)throw Error(name+' must be an integer from '+min+' to '+max);
}
const endpoint=process.env.ACRO_REDIS_URL??'redis://127.0.0.1:6380';
const parsed=new URL(endpoint);
if(!['127.0.0.1','localhost','::1','[::1]'].includes(parsed.hostname))throw Error('For safety, only local Redis is allowed.');
if(parsed.protocol!=='redis:')throw Error('Use a local redis:// URL.');
const stamp='acro:stress:'+randomUUID();
const gameKey=stamp+':game';
const ballotKey=stamp+':votes:1';
const clients=[];
const makeClient=()=>{
 const client=new Redis(endpoint,{lazyConnect:true,maxRetriesPerRequest:1,connectTimeout:3000,enableOfflineQueue:false});
 clients.push(client);
 return client;
};
const admin=makeClient();
const ids=Array.from({length:players},(_,i)=>'player'+String(i).padStart(5,'0'));
const now=Date.now();
const base=createGame('host');
const board=start(base,'Stress test','ok',now,'ABC',1,'host');
const answer='Ants Bake Cookies';
const round=n=>Math.round(n*10)/10;
const percentile=(values,p)=>{
 if(!values.length)return 0;
 const sorted=[...values].sort((a,b)=>a-b);
 return round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]);
};
const stats=()=>({ok:0,failed:0,conflicts:0,latencies:[],errors:{}});
let event=now+1000;

// Exactly the same optimistic retry helper and watched game-record + ballot-hash
// persistence pattern as src/server/index.ts; against genuine Redis connections.
const applyAction=async(client,kind,user,st)=>{
 const begin=performance.now();
 try{
  await optimisticRetry(
   async()=>{await client.watch(gameKey,ballotKey);return client;},
   async tx=>{
    const raw=await tx.get(gameKey);
    if(!raw)throw Error('Test game missing');
    const g=JSON.parse(raw);
    const b=g.boards[0];
    b.votes=mergeVotes(b.votes,await tx.hgetall(ballotKey));
    advance(g,event);
    let ballot;
    if(kind==='entry'){
     const result=enter(b,user,answer,event);
     if(result.isNew){
      const key=b.id+':entry:'+user;
      if(!g.ledger.includes(key)){g.ledger.push(key);g.scores[user]=(g.scores[user]??0)+1;}
     }
    }else if(kind==='vote'){
     const i=Number(user.slice('player'.length)),choice=i===0?2:1;
     vote(b,user,choice,undefined,event);
     ballot=b.votes.find(v=>v.user===user);
    }else throw Error('Unknown phase');
    const txm=tx.multi();
    if(ballot)txm.hset(ballotKey,user,JSON.stringify(ballot));
    txm.set(gameKey,JSON.stringify(g));
    const committed=await txm.exec();
    return committed===null?{ok:false}:{ok:true,value:undefined};
   },
   tx=>tx.unwatch(),
   attempts,
   ()=>{st.conflicts++;}
  );
  st.ok++;
 }catch(e){
  st.failed++;
  const message=e instanceof Error?e.message:String(e);
  st.errors[message]=(st.errors[message]??0)+1;
 }finally{st.latencies.push(performance.now()-begin);}
};
const phase=async(kind)=>{
 const st=stats(),startMs=performance.now();
 let cursor=0;
 const workers=Array.from({length:Math.min(players,concurrency)},async()=>{
  const client=makeClient();await client.connect();
  while(cursor<players){
   const index=cursor++;
   await applyAction(client,kind,ids[index],st);
  }
 });
 await Promise.all(workers);
 const stored=JSON.parse(await admin.get(gameKey));
 const b=stored.boards[0];
 const hash=await admin.hgetall(ballotKey);
 return {
  kind,requests:players,succeeded:st.ok,failed:st.failed,conflicts:st.conflicts,
  latencyMs:{p50:percentile(st.latencies,.5),p95:percentile(st.latencies,.95),p99:percentile(st.latencies,.99)},
  durationSeconds:round((performance.now()-startMs)/1000),
  storedEntries:b.entries.length,storedVotes:Object.keys(hash).length,
  errors:st.errors
 };
};
try{
 await admin.connect();
 if(await admin.ping()!=='PONG')throw Error('No Redis PONG');
 await admin.set(gameKey,JSON.stringify(base));
 const entries=await phase('entry');
 const stored=JSON.parse(await admin.get(gameKey));
 const missing=ids.filter(user=>!stored.boards[0].entries.some(e=>e.user===user));
 // Fill rejected entries so the voting phase always starts with all valid players.
 // This is test fixture setup, not counted as a successful simulated submission.
 for(const user of missing){
  const b=stored.boards[0],result=enter(b,user,answer,event);
  if(result.isNew){const key=b.id+':entry:'+user;stored.ledger.push(key);stored.scores[user]=1;}
 }
 await admin.set(gameKey,JSON.stringify(stored));
 event+=1000;
 const votes=await phase('vote');
 const saved=JSON.parse(await admin.get(gameKey));
 const final=saved.boards[0];
 const hash=await admin.hgetall(ballotKey);
 const merged=mergeVotes(final.votes,hash);
 const uniqueEntries=new Set(final.entries.map(e=>e.user));
 const uniqueVotes=new Set(merged.map(v=>v.user));
 const voteValid=merged.every(v=>final.entries.some(e=>e.id===v.first&&e.user!==v.user));
 const scoreTotal=Object.values(saved.scores).reduce((n,v)=>n+v,0);
 const consistent=final.entries.length===players&&uniqueEntries.size===players&&
  merged.length===votes.succeeded&&uniqueVotes.size===votes.succeeded&&
  voteValid&&scoreTotal===players&&
  tally({...final,votes:merged}).reduce((n,r)=>n+r.votes,0)===votes.succeeded;
 const result={
  test:'LOCAL REDIS TRANSACTION STRESS',redis:parsed.hostname+':'+(parsed.port||'6379'),
  players,concurrency,attempts,entries,votes,
  assertions:{allPlayersSeeded:uniqueEntries.size===players,noLostVotes:merged.length===votes.succeeded,
   noDuplicateVoters:uniqueVotes.size===votes.succeeded,selfVotesBlocked:voteValid,
   entryPoints:scoreTotal===players,voteTally:tally({...final,votes:merged}).reduce((n,r)=>n+r.votes,0)===votes.succeeded},
  result:consistent&&entries.failed===0&&votes.failed===0?'PASS':'FAIL',
  caveat:'Actual local Redis transactions, but not Devvit backend, Reddit API, or production performance.'
 };
 console.log(JSON.stringify(result,null,2));
 if(result.result!=='PASS')process.exitCode=1;
}catch(e){console.error('Redis stress test could not complete:',e instanceof Error?e.message:e);process.exitCode=1;}
finally{
 try{await admin.del(gameKey,ballotKey);}catch{}
 await Promise.all(clients.map(c=>c.quit().catch(()=>c.disconnect())));
}
