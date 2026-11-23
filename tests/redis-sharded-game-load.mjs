// End-to-end local Redis sharding simulation for Acro Arena rules.
// Exercises per-user Play/Entry/Vote, single-writer settlement and scoring.
// This simulates the server persistence protocol against ioredis, not Devvit.
import Redis from 'ioredis';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {createGame,start,startAttempt,enter,vote,finish,advance,tally} from '../src/shared/arena.ts';
import {mergeVotes} from '../src/shared/vote-store.ts';
import {optimisticRetry} from '../src/shared/optimistic-retry.ts';

const option=(name,fallback)=>{const arg=process.argv.find(s=>s.startsWith('--'+name+'='));return arg?Number(arg.split('=')[1]):fallback;};
const players=option('players',250),concurrency=option('concurrency',25);
if(!Number.isSafeInteger(players)||players<2||players>10000||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>200)throw Error('Use 2-10000 players and 1-200 connections.');
const url=process.env.ACRO_REDIS_URL??'redis://127.0.0.1:6380',parsed=new URL(url);
if(parsed.protocol!=='redis:'||!['localhost','127.0.0.1','::1','[::1]'].includes(parsed.hostname))throw Error('Only local Redis allowed.');
const prefix='acro:stress:game:'+randomUUID(),gameKey=prefix+':game',entryKey=prefix+':entries',voteKey=prefix+':votes',accessKey=prefix+':access',sequenceKey=prefix+':seq';
const akey=user=>prefix+':access:'+user,ekey=user=>prefix+':entry:'+user;
const ids=Array.from({length:players},(_,i)=>'player'+String(i).padStart(5,'0'));
const clients=[];
const client=()=>{const c=new Redis(url,{lazyConnect:true,connectTimeout:3000,maxRetriesPerRequest:1,enableOfflineQueue:false});c.on('error',()=>{});clients.push(c);return c;};
const admin=client();
const startAt=Date.now(),now=startAt+1000;
const game=createGame('host');
start(game,'Stress Test','ok',startAt,'ABC',1,'host','regular',false,24,1,3,60,true);
const stats=()=>({succeeded:0,failed:0,conflicts:0,errors:{},times:[]});
const percentile=(a,q)=>{const v=[...a].sort((x,y)=>x-y);return Math.round((v[Math.max(0,Math.ceil(v.length*q)-1)]??0)*10)/10;};
const load=async(c)=>{
 const g=JSON.parse(await c.get(gameKey)),b=g.boards[0];
 const [entries,ballots,access]=await Promise.all([c.hgetall(entryKey),c.hgetall(voteKey),c.hgetall(accessKey)]);
 const emap=new Map(b.entries.map(e=>[e.user,e]));
 for(const [user,raw] of Object.entries(entries))emap.set(user,JSON.parse(raw));
 b.entries=[...emap.values()].sort((a,z)=>a.id-z.id);
 b.votes=mergeVotes(b.votes,ballots);
 for(const [user,raw] of Object.entries(access)){
  const state=JSON.parse(raw);
  if(state.attempt!==undefined){b.attempts??={};b.attempts[user]=state.attempt;}
  if(state.voteOnly){b.voteOnly??={};b.voteOnly[user]=true;}
 }
 return g;
};
const action=async(c,kind,user,st)=>{
 const begin=performance.now();
 try{
  await optimisticRetry(
   async()=>{await c.watch(gameKey,akey(user),ekey(user));return c;},
   async tx=>{
    const g=await load(tx),b=g.boards[0];
    advance(g,now);
    let access,entry,ballot;
    if(kind==='play'){
     startAttempt(b,user,now);
     access=JSON.stringify({attempt:b.attempts[user]});
    }else if(kind==='entry'){
     const result=enter(b,user,'Ants Bake Cookies',now);
     if(result.isNew)result.entry.id=1000000000+await tx.incr(sequenceKey);
     entry=JSON.stringify(result.entry);
    }else if(kind==='vote'){
     const choice=b.entries.find(e=>e.user!==user)?.id;
     if(choice===undefined)throw Error('No opponent');
     vote(b,user,choice,undefined,now);
     ballot=JSON.stringify(b.votes.find(v=>v.user===user));
    }
    const multi=tx.multi();
    if(access){multi.set(akey(user),access);multi.hset(accessKey,user,access);}
    if(entry){multi.set(ekey(user),entry);multi.hset(entryKey,user,entry);}
    if(ballot)multi.hset(voteKey,user,ballot);
    const result=await multi.exec();
    return result===null?{ok:false}:{ok:true,value:undefined};
   },
   tx=>tx.unwatch(),24,()=>{st.conflicts++;}
  );
  st.succeeded++;
 }catch(e){st.failed++;const msg=e instanceof Error?e.message:String(e);st.errors[msg]=(st.errors[msg]??0)+1;}
 finally{st.times.push(performance.now()-begin);}
};
const phase=async kind=>{
 const st=stats();let next=0;const started=performance.now();
 await Promise.all(Array.from({length:Math.min(concurrency,players)},async()=>{
  const c=client();await c.connect();
  while(next<players){const idx=next++;await action(c,kind,ids[idx],st);}
 }));
 return {kind,requests:players,succeeded:st.succeeded,failed:st.failed,conflicts:st.conflicts,
  p95Ms:percentile(st.times,.95),p99Ms:percentile(st.times,.99),
  durationSeconds:Math.round((performance.now()-started)/100)/10,errors:st.errors};
};
try{
 await admin.connect();if(await admin.ping()!=='PONG')throw Error('Redis unavailable');
 await admin.set(gameKey,JSON.stringify(game));
 const play=await phase('play'),entries=await phase('entry'),votes=await phase('vote');
 const c=client();await c.connect();
 const settled=await optimisticRetry(
  async()=>{await c.watch(gameKey,entryKey,voteKey,accessKey);return c;},
  async tx=>{
   const g=await load(tx),b=g.boards[0];finish(g,b,now+2000);
   const multi=tx.multi();multi.set(gameKey,JSON.stringify(g));
   const result=await multi.exec();
   return result===null?{ok:false}:{ok:true,value:g};
  },tx=>tx.unwatch()
 );
 const b=settled.boards[0],storedEntries=Object.keys(await admin.hgetall(entryKey)).length,storedVotes=Object.keys(await admin.hgetall(voteKey)).length;
 const entryLedger=settled.ledger.filter(k=>k.endsWith(':entry:'+k.split(':').at(-1)));
 const totalPoints=Object.values(settled.scores).reduce((sum,x)=>sum+x,0);
 const expected=players+players+25; // Every vote targets the same first eligible entry except their own.
 const actualVotePoints=tally(b).reduce((sum,x)=>sum+x.votes,0);
 let afterFinishRejected=false;
 try{await action(c,'entry','late-player',stats());const g=await load(c);afterFinishRejected=!g.boards[0].entries.some(e=>e.user==='late-player');}catch{afterFinishRejected=true;}
 const allSaved=play.failed===0&&entries.failed===0&&votes.failed===0&&storedEntries===players&&storedVotes===players;
 const assertions={allActionsSaved:allSaved,entryLedger:entryLedger.length===players,
  voteTally:actualVotePoints===players,oneEntryEach:new Set(b.entries.map(e=>e.user)).size===players,
  noSelfVotes:b.votes.every(v=>b.entries.some(e=>e.id===v.first&&e.user!==v.user)),
  finalPoints:totalPoints===expected,lateEntryRejected:afterFinishRejected};
 const result=Object.values(assertions).every(Boolean)?'PASS':'FAIL';
 console.log(JSON.stringify({test:'LOCAL REDIS SHARDED GAMEPLAY STRESS',players,concurrency,play,entries,votes,
  storedEntries,storedVotes,assertions,result,
  caveat:'Simulated Devvit storage transactions against local Redis; not production Devvit backend or exact network latency.'},null,2));
 if(result!=='PASS')process.exitCode=1;
}catch(e){console.error('Sharded gameplay stress error:',e instanceof Error?e.message:e);process.exitCode=1;}
finally{
 try{await admin.del(gameKey,entryKey,voteKey,accessKey,sequenceKey,...ids.flatMap(u=>[akey(u),ekey(u)]));}catch{}
 await Promise.all(clients.map(c=>c.quit().catch(()=>c.disconnect())));
}
