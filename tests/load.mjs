// Offline deterministic player-load simulation. No Reddit APIs or production Redis touched.
// Usage: npm run test:load -- --players=1500
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createGame,start,startAttempt,enter,vote,finish,tally} from '../src/shared/arena.ts';
import {mergeVotes,storeVote} from '../src/shared/vote-store.ts';

const flag=process.argv.find(v=>v.startsWith('--players='));
const players=flag?Number(flag.slice('--players='.length)):1500;
if(!Number.isSafeInteger(players)||players<2||players>10000){
 console.error('Use --players=N where N is between 2 and 10000.');
 process.exit(2);
}
const clock=()=>Number(performance.now().toFixed(1));
const t0=performance.now();
const game=createGame('loadhost');
const board=start(game,'Offline load test','ok',1000,'ABC',1,'loadhost','regular',false,1,1,3,60,true);
const members=Array.from({length:players},(_,i)=>'loadplayer'+String(i).padStart(5,'0'));
const answer='Ants Bake Cookies';
const began=10000,submitted=20000,ballotTime=30000;
let stage=performance.now();
for(const user of members){
 startAttempt(board,user,began);
 const result=enter(board,user,answer,submitted);
 assert.equal(result.isNew,true);
 const key=board.id+':entry:'+user;
 assert.equal(game.ledger.includes(key),false);
 game.ledger.push(key);game.scores[user]=(game.scores[user]??0)+1;
}
const entriesMs=clock()-Number(stage.toFixed(1));
assert.equal(board.entries.length,players);
assert.equal(new Set(board.entries.map(e=>e.user)).size,players);
const ids=board.entries.map(e=>e.id);
assert.equal(new Set(ids).size,players);

// Per-voter hash emulates the Redis ballot data shape, not Redis latency, WATCH or network concurrency.
const fields=new Map();
const localHash={
 async hSet(_key,record){
  await new Promise(resolve=>setImmediate(resolve));
  for(const [field,value] of Object.entries(record))fields.set(field,value);
 },
 async hGetAll(_key){return Object.fromEntries(fields);}
};
stage=performance.now();
const batchSize=100;
for(let from=0;from<players;from+=batchSize){
 await Promise.all(members.slice(from,from+batchSize).map(async(user,j)=>{
  const i=from+j,choice=i===0?ids[1]:ids[0];
  vote(board,user,choice,undefined,ballotTime);
  const ballot=board.votes.find(v=>v.user===user);
  assert.ok(ballot);
  await storeVote(localHash,'local:ballots',ballot);
 }));
}
const ballotMs=clock()-Number(stage.toFixed(1));
assert.equal(board.votes.length,players);
assert.equal(fields.size,players);

// All voters except player 0 switch their ballot to entry #1; player 0 must vote for somebody else.
// A second wave proves ballot updates replace, rather than duplicate, records.
stage=performance.now();
for(let from=0;from<players;from+=batchSize){
 await Promise.all(members.slice(from,from+batchSize).map(async(user,j)=>{
  const i=from+j,choice=i===0?ids[1]:ids[0];
  vote(board,user,choice,undefined,ballotTime+1000);
  const ballot=board.votes.find(v=>v.user===user);
  assert.ok(ballot);
  await storeVote(localHash,'local:ballots',ballot);
 }));
}
const updateMs=clock()-Number(stage.toFixed(1));
const merged=mergeVotes([],await localHash.hGetAll('local:ballots'));
assert.equal(merged.length,players);
assert.equal(new Set(merged.map(v=>v.user)).size,players);
assert.equal(merged.filter(v=>v.first===ids[0]).length,players-1);
assert.equal(merged.filter(v=>v.first===ids[1]).length,1);
assert.deepEqual(new Map(merged.map(v=>[v.user,v.first])),new Map(board.votes.map(v=>[v.user,v.first])));
assert.throws(()=>vote(board,members[0],ids[0],undefined,ballotTime+2000),/another player/);
assert.throws(()=>enter(board,members[0],answer,submitted+1000),/One answer per player/);

stage=performance.now();
const winner=finish(game,board,ballotTime+5000);
const finishMs=clock()-Number(stage.toFixed(1));
assert.equal(winner,members[0]);
assert.equal(board.winner,members[0]);
assert.equal(tally(board)[0].votes,players-1);
const actualTotal=Object.values(game.scores).reduce((sum,v)=>sum+v,0);
const expectedTotal=players+players+25;
assert.equal(actualTotal,expectedTotal);
assert.equal(game.scores[members[0]],1+(players-1)+25);
for(let i=1;i<players;i++)assert.equal(game.scores[members[i]],1+(i===1?1:0));
const ledgerCount=game.ledger.length;
assert.equal(ledgerCount,players+players+1);

const summary={
 test:'OFFLINE logic + ballot-hash concurrency simulation',
 players,entries:board.entries.length,ballots:merged.length,
 voteUpdates:players,uniqueVoters:fields.size,
 winningVotes:players-1,points:actualTotal,expectedPoints:expectedTotal,
 timingsMs:{entries:entriesMs,initialVotes:ballotMs,voteChanges:updateMs,finish:finishMs,total:clock()-Number(t0.toFixed(1))},
 result:'PASS',
 caveat:'Not a benchmark of live Devvit, Reddit, distributed Redis transactions, or real network traffic.'
};
console.log(JSON.stringify(summary,null,2));
