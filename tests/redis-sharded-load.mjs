// Isolated Redis write-contention benchmark for per-user hashes.
// This is a prototype, NOT the Acro Arena production entry/vote pipeline.
// npm run test:redis:sharded -- --players=250 --concurrency=25
import Redis from 'ioredis';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
const arg=(name,def)=>{const raw=process.argv.find(s=>s.startsWith('--'+name+'='));return raw?Number(raw.split('=')[1]):def};
const players=arg('players',250),concurrency=arg('concurrency',25);
if(!Number.isSafeInteger(players)||players<2||players>10000||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>200)throw Error('Specify 2–10000 players and 1–200 connections.');
const url=process.env.ACRO_REDIS_URL??'redis://127.0.0.1:6380';
const parsed=new URL(url);
if(parsed.protocol!=='redis:'||!['127.0.0.1','localhost','::1','[::1]'].includes(parsed.hostname))throw Error('Only local Redis is allowed.');
const prefix='acro:stress:sharded:'+randomUUID();
const entryKey=prefix+':entries',voteKey=prefix+':votes';
const clients=[];
const client=()=>{const c=new Redis(url,{lazyConnect:true,maxRetriesPerRequest:1,connectTimeout:3000,enableOfflineQueue:false});c.on('error',()=>{});clients.push(c);return c;};
const admin=client();
const users=Array.from({length:players},(_,i)=>'player'+String(i).padStart(5,'0'));
const p=(values,q)=>{const a=[...values].sort((x,y)=>x-y);return Math.round(a[Math.max(0,Math.ceil(a.length*q)-1)]*10)/10;};
const phase=async(kind)=>{
 let next=0,ok=0,failed=0,errors={};const latencies=[];const start=performance.now();
 const jobs=Array.from({length:Math.min(concurrency,players)},async()=>{
  const c=client();await c.connect();
  while(next<players){
   const i=next++,user=users[i],begin=performance.now();
   try{
    const value=kind==='entry'?JSON.stringify({user,answer:'Ants Bake Cookies'}):JSON.stringify({user,choice:users[i===0?1:0]});
    const n=await c.hset(kind==='entry'?entryKey:voteKey,user,value);
    if(n!==1)throw Error('Duplicate submission for '+user);
    ok++;
   }catch(e){failed++;const err=e instanceof Error?e.message:String(e);errors[err]=(errors[err]??0)+1;}
   latencies.push(performance.now()-begin);
  }
 });
 await Promise.all(jobs);
 return {requests:players,succeeded:ok,failed,conflicts:0,latencyMs:{p50:p(latencies,.5),p95:p(latencies,.95),p99:p(latencies,.99)},durationSeconds:Math.round((performance.now()-start)*10)/10000,errors};
};
try{
 await admin.connect();
 if(await admin.ping()!=='PONG')throw Error('Redis unavailable');
 const entries=await phase('entry');
 const votes=await phase('vote');
 const savedEntries=await admin.hgetall(entryKey),savedVotes=await admin.hgetall(voteKey);
 const entryUsers=new Set(Object.keys(savedEntries)),voteUsers=new Set(Object.keys(savedVotes));
 const allVotesValid=Object.entries(savedVotes).every(([user,json])=>{
  const v=JSON.parse(json);return v.user===user&&v.choice!==user&&entryUsers.has(v.choice);
 });
 const allEntriesValid=Object.entries(savedEntries).every(([user,json])=>{
  const v=JSON.parse(json);return v.user===user&&v.answer==='Ants Bake Cookies';
 });
 const result=entries.failed===0&&votes.failed===0&&entryUsers.size===players&&voteUsers.size===players&&allVotesValid&&allEntriesValid?'PASS':'FAIL';
 console.log(JSON.stringify({
  test:'LOCAL REDIS PER-PLAYER HASH PROTOTYPE',players,concurrency,entries,votes,
  assertions:{savedEntries:entryUsers.size,savedVotes:voteUsers.size,allEntriesValid,allVotesValid},
  result,
  caveat:'Benchmark of independent Redis hashes only; no game-phase gating, 60-second validation, score settling, Devvit integration or production guarantees.'
 },null,2));
 if(result!=='PASS')process.exitCode=1;
}catch(e){console.error('Sharded Redis test failed:',e instanceof Error?e.message:e);process.exitCode=1;}
finally{try{await admin.del(entryKey,voteKey);}catch{}await Promise.all(clients.map(c=>c.quit().catch(()=>c.disconnect())));}
