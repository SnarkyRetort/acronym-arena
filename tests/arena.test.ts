import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,start,enter,vote,endorse,comment,finish,chooseNext,advance,aiLabel,availableSlots,enforceSingle,parseAnswer,rankedChallenges,tally} from '../src/shared/arena.ts';

test('AI label is compact with honor system only for AI-free',()=>{assert.equal(aiLabel('ok'),'🤖 AI OK');assert.equal(aiLabel('free'),'🧠 AI FREE · HONOR SYSTEM')});
test('one live challenge slot and sequential identifiers',()=>{const g=createGame('host');const b=start(g,'Theme','free',0,'ABC');assert.equal(b.id,1);assert.deepEqual(availableSlots(g),[]);assert.throws(()=>start(g,'Theme','free',0,'ABC'),/occupied/);finish(g,b,100);assert.deepEqual(availableSlots(g),[1]);assert.equal(start(g,'Another','ok',200,'XYZ').id,2)});
test('answer must match exact acronym, edits do not duplicate entries',()=>{const g=createGame('host'),b=start(g,'Theme','ok',100,'EETTBO');assert.equal(enter(b,'alice','Evil Elves Turn Tourists Back Outside',200).isNew,true);assert.equal(enter(b,'alice','Evil Elves Toss Tourists Back Outside',300).isNew,false);assert.equal(b.entries.length,1);assert.throws(()=>parseAnswer('EETTBO','Evil Elves Turn Tourists Into Bacon Omelets'),/exactly 6/);assert.throws(()=>parseAnswer('ABC','A B Dog'),/Word 3/)});
test('no self vote; ranked voting requires two players and can change',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'alice','Ants Bake Cookies',200);assert.throws(()=>vote(b,'alice',1,undefined,300),/two/);enter(b,'bob','All Boats Crash',300);assert.throws(()=>vote(b,'alice',1,undefined,400),/another/);vote(b,'alice',2,undefined,500);vote(b,'alice',2,undefined,600);assert.equal(b.votes.length,1)});
test('On Theme endorsements toggle and discussion archives at finish',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);endorse(b,'b',1);assert.deepEqual(b.entries[0]?.onThemeBy,['b']);endorse(b,'b',1);assert.deepEqual(b.entries[0]?.onThemeBy,[]);comment(b,'a','nice',300);vote(b,'a',2,undefined,400);finish(g,b,500);assert.equal(b.archived,true);assert.equal(b.phase,'choice');assert.throws(()=>comment(b,'b','more',600),/archived/);assert.equal(g.scores.b,26)});
test('winner chooses theme and independent AI mode in same slot',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);vote(b,'a',2,undefined,400);finish(g,b,500);const next=chooseNext(g,b,'b','New theme','ok',600);assert.equal(next.ai,'ok');assert.equal(next.slot,b.slot);assert.equal(next.id,2);assert.equal(b.phase,'done');assert.throws(()=>chooseNext(g,b,'b','More','free',700),/Only/)});
test('ties do not award winner: scoring remains current provisional behavior',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);vote(b,'a',2,undefined,300);vote(b,'b',1,undefined,300);finish(g,b,400);assert.equal(b.winner,undefined);assert.equal(b.phase,'done');assert.equal(g.scores.a,1);assert.equal(g.scores.b,1)});
test('24 hour timer advances, including one hour Player Choice expiry',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');assert.equal(advance(g,86400101),1);assert.equal(b.phase,'done');assert.equal(advance(g,86400101),0)});
test('five-board preview migrates to one active without removing history',()=>{const g=createGame('host');const one=start(g,'Theme','free',0,'ABC');g.boards.push(...[2,3,4,5].map(id=>({...one,id,slot:id,entries:[],votes:[],discussion:[]})));g.nextId=6;assert.equal(enforceSingle(g),4);assert.equal(g.boards.filter(b=>b.phase==='open'||b.phase==='choice').length,1);assert.deepEqual(g.boards.slice(1).map(b=>b.phase),['dismissed','dismissed','dismissed','dismissed']);assert.equal(enforceSingle(g),0);assert.deepEqual(availableSlots(g),[])});

test('challenge posts can be attached to individual board IDs',()=>{const g=createGame('host');const b=start(g,'Theme','free',0,'ABC');b.postId='t3_newpost';assert.equal(g.boards[0]?.postId,'t3_newpost');finish(g,b,100);const n=start(g,'Next','ok',200,'XYZ');n.postId='t3_another';assert.notEqual(n.postId,b.postId)});

test('HQ Best and On Theme rankings use in-game vote and endorsement data without changing scores',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');b.postId='t3_board';enter(b,'alice','Ants Bake Cookies',200);enter(b,'bob','All Boats Crash',200);vote(b,'alice',2,undefined,300);endorse(b,'alice',2);assert.equal(rankedChallenges(g,'best')[0]?.score,1);assert.equal(rankedChallenges(g,'on-theme')[0]?.score,1);assert.deepEqual(g.scores,{});});


test('every player has an independent regular hosting slot',()=>{
 const g=createGame('mod');
 const a=start(g,'First','free',0,'ABC',1,'alice');
 const b=start(g,'Second','free',0,'XYZ',1,'bob');
 assert.equal(a.host,'alice');assert.equal(b.host,'bob');
 assert.deepEqual(availableSlots(g,'alice'),[]);assert.deepEqual(availableSlots(g,'charlie'),[1]);
 assert.throws(()=>start(g,'Another','free',0,'ABC',1,'alice'),/occupied/);
});
test('winner gets one non-stacking bonus slot while still able to host regular',()=>{
 const g=createGame('mod'),b=start(g,'Theme','free',100,'ABC',1,'alice');
 enter(b,'alice','Ants Bake Cookies',200);
 enter(b,'bob','All Boats Crash',200);
 vote(b,'alice',2,undefined,300);
 finish(g,b,500);
 assert.equal(g.winnerTokens?.bob,true);
 const bonus=start(g,'Victory','ok',600,'XYZ',1,'bob','winner',true);
 assert.equal(bonus.kind,'winner');assert.equal(bonus.nsfw,true);
 assert.deepEqual(availableSlots(g,'bob','winner'),[]);
 assert.deepEqual(availableSlots(g,'bob','regular'),[1]);
 start(g,'Standard','free',600,'ABC',1,'bob');
 assert.deepEqual(availableSlots(g,'bob','regular'),[]);
 assert.throws(()=>start(g,'More','free',600,'ABC',1,'bob','winner'),/Winner/);
});

test('single vote ignores second place, allows changing and preserves one ballot',()=>{
 const g=createGame('mod'),b=start(g,'Theme','free',100,'ABC');
 enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);enter(b,'c','Angry Bears Climb',200);
 vote(b,'a',2,3,300);
 assert.equal(b.votes[0]?.first,2);assert.equal(b.votes[0]?.second,undefined);
 vote(b,'a',3,undefined,400);
 assert.equal(b.votes.length,1);assert.equal(b.votes[0]?.first,3);
 assert.equal(tally(b).find(r=>r.entry.id===3)?.votes,1);
 assert.equal(tally(b).find(r=>r.entry.id===2)?.votes,0);
});
test('Theme Leader award is separate and does not add points',()=>{
 const g=createGame('mod'),b=start(g,'Theme','free',100,'ABC');
 enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);
 endorse(b,'a',2);vote(b,'a',2,undefined,300);finish(g,b,400);
 assert.equal(b.themeLeader,'b');assert.equal(g.scores.b,26);
});
test('tied Theme Leader endorsements award neither player',()=>{
 const g=createGame('mod'),b=start(g,'Theme','free',100,'ABC');
 enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);
 endorse(b,'a',2);endorse(b,'b',1);finish(g,b,400);
 assert.equal(b.themeLeader,undefined);
});


test('configurable challenge windows enforce 1, 4, 8 and 24 hours',()=>{
 const g=createGame('mod');
 const one=start(g,'Fast','free',100,'ABC',1,'alice','regular',false,1,4);
 assert.equal(one.deadline,3600100);
 assert.equal(one.choiceWindowHours,4);
 assert.equal(advance(g,3600099),0);
 assert.equal(advance(g,3600100),1);
 const four=start(g,'Casual','free',200,'XYZ',1,'bob','regular',false,4,24);
 assert.equal(four.deadline,14400200);
 const eight=start(g,'Extended','free',250,'XYZ',1,'dana','regular',false,8,8);
 assert.equal(eight.deadline,28800250);
 assert.equal(eight.choiceWindowHours,8);
 const daily=start(g,'Daily','free',300,'ABC',1,'charlie');
 assert.equal(daily.deadline,86400300);
 assert.equal(daily.choiceWindowHours,1);
 assert.throws(()=>start(g,'Bad','free',400,'ABC',1,'d','regular',false,3 as never,1),/1, 4, 8, or 24/);
});
test('winner reward expires after selected choice window',()=>{
 const g=createGame('mod'),b=start(g,'Fast','free',100,'ABC',1,'alice','regular',false,1,4);
 enter(b,'alice','Ants Bake Cookies',200);enter(b,'bob','All Boats Crash',200);vote(b,'alice',2,undefined,300);
 finish(g,b,1000);
 assert.equal(b.choiceDeadline,1000+4*3600000);
 assert.deepEqual(availableSlots(g,'bob','winner',b.choiceDeadline-1),[1]);
 assert.deepEqual(availableSlots(g,'bob','winner',b.choiceDeadline),[]);
 advance(g,b.choiceDeadline);
 assert.equal(g.winnerTokens?.bob,false);
});
