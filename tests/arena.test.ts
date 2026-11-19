import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,start,enter,vote,endorse,comment,finish,chooseNext,advance,aiLabel,availableSlots,enforceSingle,parseAnswer,rankedChallenges,tally,leaderboardStats,DEFAULT_THEMES,drawThemeChoices,randomLetters,isLetterCount,blitzAnswerSeconds,isBlitzVoteSeconds,startAttempt} from '../src/shared/arena.ts';

test('AI label is compact with honor system only for AI-free',()=>{assert.equal(aiLabel('ok'),'🤖 AI OK');assert.equal(aiLabel('free'),'🧠 AI FREE · HONOR SYSTEM')});
test('one regular player slot and sequential identifiers',()=>{const g=createGame('mod');const b=start(g,'Theme','free',0,'ABC',1,'player');assert.equal(b.id,1);assert.deepEqual(availableSlots(g,'player'),[]);assert.throws(()=>start(g,'Theme','free',0,'ABC',1,'player'),/occupied/);finish(g,b,100);assert.deepEqual(availableSlots(g,'player'),[1]);assert.equal(start(g,'Another','ok',200,'XYZ',1,'player').id,2)});
test('answer must match exact acronym, edits do not duplicate entries',()=>{const g=createGame('host'),b=start(g,'Theme','ok',100,'EETTBO');assert.equal(enter(b,'alice','Evil Elves Turn Tourists Back Outside',200).isNew,true);assert.equal(enter(b,'alice','Evil Elves Toss Tourists Back Outside',300).isNew,false);assert.equal(b.entries.length,1);assert.throws(()=>parseAnswer('EETTBO','Evil Elves Turn Tourists Into Bacon Omelets'),/exactly 6/);assert.throws(()=>parseAnswer('ABC','A B Dog'),/Word 3/)});
test('no self vote; ranked voting requires two players and can change',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'alice','Ants Bake Cookies',200);assert.throws(()=>vote(b,'alice',1,undefined,300),/two/);enter(b,'bob','All Boats Crash',300);assert.throws(()=>vote(b,'alice',1,undefined,400),/another/);vote(b,'alice',2,undefined,500);vote(b,'alice',2,undefined,600);assert.equal(b.votes.length,1)});
test('On Theme endorsements toggle and discussion archives at finish',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);endorse(b,'b',1);assert.deepEqual(b.entries[0]?.onThemeBy,['b']);endorse(b,'b',1);assert.deepEqual(b.entries[0]?.onThemeBy,[]);comment(b,'a','nice',300);vote(b,'a',2,undefined,400);finish(g,b,500);assert.equal(b.archived,true);assert.equal(b.phase,'choice');assert.throws(()=>comment(b,'b','more',600),/archived/);assert.equal(g.scores.b,26)});
test('winner chooses theme and independent AI mode in same slot',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);vote(b,'a',2,undefined,400);finish(g,b,500);const next=chooseNext(g,b,'b','New theme','ok',600);assert.equal(next.ai,'ok');assert.equal(next.slot,b.slot);assert.equal(next.id,2);assert.equal(b.phase,'done');assert.throws(()=>chooseNext(g,b,'b','More','free',700),/Only/)});
test('ties do not award winner: scoring remains current provisional behavior',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);vote(b,'a',2,undefined,300);vote(b,'b',1,undefined,300);finish(g,b,400);assert.equal(b.winner,undefined);assert.equal(b.phase,'done');assert.equal(g.scores.a,1);assert.equal(g.scores.b,1)});
test('24 hour timer advances, including one hour Player Choice expiry',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');assert.equal(advance(g,86400101),1);assert.equal(b.phase,'done');assert.equal(advance(g,86400101),0)});
test('five-board preview migrates to one active without removing history',()=>{const g=createGame('host');const one=start(g,'Theme','free',0,'ABC');g.boards.push(...[2,3,4,5].map(id=>({...one,id,slot:id,entries:[],votes:[],discussion:[]})));g.nextId=6;assert.equal(enforceSingle(g),4);assert.equal(g.boards.filter(b=>b.phase==='open'||b.phase==='choice').length,1);assert.deepEqual(g.boards.slice(1).map(b=>b.phase),['dismissed','dismissed','dismissed','dismissed']);assert.equal(enforceSingle(g),0);assert.deepEqual(availableSlots(g),[2,3,4,5])});

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


test('moderators can host five simultaneous regular challenges, but not six',()=>{
 const g=createGame('mod');
 for(let slot=1;slot<=5;slot++){
  assert.equal(availableSlots(g,'mod')[0],slot);
  const b=start(g,'Theme '+slot,'free',100,'ABC',slot,'mod');
  assert.equal(b.slot,slot);
 }
 assert.deepEqual(availableSlots(g,'mod'),[]);
 assert.throws(()=>start(g,'Sixth','free',100,'ABC',1,'mod'),/occupied/);
 finish(g,g.boards[2]!,200);
 assert.deepEqual(availableSlots(g,'mod'),[3]);
 const next=start(g,'Reused','free',300,'ABC',undefined,'mod');
 assert.equal(next.slot,3);
});

test('non-moderators cannot claim a second hosting slot manually',()=>{
 const g=createGame('mod');
 start(g,'First','free',100,'ABC',1,'alice');
 assert.deepEqual(availableSlots(g,'alice'),[]);
 assert.throws(()=>start(g,'Sneaky','free',100,'ABC',2,'alice'),/occupied/);
 assert.throws(()=>start(g,'Bad slot','free',100,'ABC',2,'bob'),/available hosting slot/);
});

test('detailed player standings show podium, vote points, theme points, and capped interactions',()=>{
 const g=createGame('mod'),b=start(g,'Theme','free',100,'ABC',1,'mod');
 enter(b,'alice','Ants Bake Cookies',200);
 enter(b,'bob','Angry Birds Chat',200);
 enter(b,'cara','Aliens Buy Cheese',200);
 enter(b,'alice','Apples Bring Cookies',210); // Editing is not another participation event.
 for(const voter of ['d','e','f'])vote(b,voter,1,undefined,300);
 for(const voter of ['g','h'])vote(b,voter,2,undefined,300);
 vote(b,'i',3,undefined,300);
 vote(b,'d',1,undefined,350); // Changing/saving a vote is not another event.
 endorse(b,'d',1);
 endorse(b,'d',1); // A withdrawn endorsement must not count.
 endorse(b,'d',1);
 for(let i=0;i<5;i++)comment(b,'alice','Reply '+i,400+i);
 const live=leaderboardStats(g);
 assert.equal(live.find(s=>s.user==='alice')?.first,0); // No live podium awards.
 assert.equal(live.find(s=>s.user==='mod')?.hosted,1);
 assert.equal(live.find(s=>s.user==='d')?.votesCast,1);
 assert.equal(live.find(s=>s.user==='d')?.onThemeGiven,1);
 assert.equal(live.find(s=>s.user==='alice')?.comments,3);
 finish(g,b,500);
 const byUser=new Map(leaderboardStats(g).map(s=>[s.user,s]));
 assert.equal(byUser.get('alice')?.first,1);
 assert.equal(byUser.get('bob')?.second,1);
 assert.equal(byUser.get('cara')?.third,1);
 assert.equal(byUser.get('alice')?.votePoints,3);
 assert.equal(byUser.get('alice')?.themePoints,1);
 assert.equal(byUser.get('alice')?.participation,4); // One entry, three scored comments.
 assert.equal(byUser.get('alice')?.winBonus,25);
 assert.equal(byUser.get('alice')?.total,33);
 assert.equal(byUser.get('mod')?.participation,1);
 assert.equal(byUser.get('d')?.participation,2); // One ballot, one On Theme.
});

test('50 unique backup themes supply four reshufflable choices without repeats',()=>{
 assert.equal(DEFAULT_THEMES.length,50);
 assert.equal(new Set(DEFAULT_THEMES).size,50);
 const first=drawThemeChoices(DEFAULT_THEMES,[],4,()=>0.42);
 assert.equal(first.length,4);
 assert.equal(new Set(first).size,4);
 const second=drawThemeChoices(DEFAULT_THEMES,first,4,()=>0.42);
 assert.equal(second.length,4);
 assert.ok(second.every(theme=>!first.includes(theme)));
 assert.ok(second.every(theme=>DEFAULT_THEMES.includes(theme)));
 const oldGame=createGame('host');
 assert.equal(oldGame.themes.length,50);
});

test('selected acronym length 3 through 8 is respected',()=>{
 for(const n of [3,4,5,6,7,8] as const){
  assert.equal(isLetterCount(n),true);
  const letters=randomLetters(n);
  assert.equal(letters.length,n);
  const g=createGame('mod');
  const b=start(g,'Theme','free',100,letters,1,'mod','regular',false,24,1,n);
  assert.equal(b.letters.length,n);
 }
 assert.equal(isLetterCount(2),false);
 assert.equal(isLetterCount(9),false);
 const g=createGame('mod');
 assert.throws(()=>start(g,'Theme','ok',100,'ABCDE',1,'mod','regular',false,24,1,8),/length/);
});

test('Blitz answer timer scales one minute per letter from 2 minutes at 3 letters',()=>{
 assert.deepEqual([3,4,5,6,7,8].map(blitzAnswerSeconds),[120,180,240,300,360,420]);
 assert.deepEqual([30,60,90,120,180].map(isBlitzVoteSeconds),[true,true,true,true,true]);
 assert.equal(isBlitzVoteSeconds(40),false);
});
test('Blitz answers stay open until answer deadline, then voting begins for selected duration',()=>{
 const g=createGame('host');
 const b=start(g,'Theme','free',1000,'ABCDEFG',1,'alice','blitz',false,24,1,7,90);
 assert.equal(b.deadline,361000);
 assert.equal(b.blitzVoteSeconds,90);
 enter(b,'alice','Ants Bake Cakes During Every Friday Game',1100);
 enter(b,'bob','All Big Cats Dance Every Friday Gracefully',1200);
 assert.throws(()=>vote(b,'alice',2,undefined,1300),/closed/);
 assert.equal(advance(g,360999),0);
 assert.equal(advance(g,361000),1);
 assert.equal(b.phase,'voting');
 assert.equal(b.votingDeadline,451000);
 assert.deepEqual(availableSlots(g,'alice','blitz',362000),[]);
 vote(b,'alice',2,undefined,362000);
 vote(b,'bob',1,undefined,363000);
 vote(b,'alice',2,undefined,364000);
 assert.equal(b.votes.length,2);
 assert.equal(advance(g,450999),0);
 assert.equal(advance(g,451000),1);
 assert.ok(['done','choice'].includes(b.phase));
 assert.throws(()=>vote(b,'alice',2,undefined,451001),/closed/);
});
test('Blitz handles delayed scheduler transition in one call',()=>{
 const g=createGame('host'),b=start(g,'Theme','ok',1000,'ABC',1,'alice','blitz',false,24,1,3,60);
 assert.equal(advance(g,1000+120000+60000+1),2);
 assert.equal(b.phase,'done');
});

test('personal timed challenge reveals letters only after Play and locks the first submission',()=>{
 const g=createGame('host'),b=start(g,'Theme','free',1000,'ABC',1,'host','regular',false,24,1,3,60,true);
 assert.equal(b.timedEntry,true);
 assert.throws(()=>enter(b,'alice','Ants Bake Cookies',1200),/Press Play/);
 assert.equal(startAttempt(b,'alice',1300),1300);
 assert.equal(startAttempt(b,'alice',1500),1300); // refresh never restarts countdown
 assert.equal(enter(b,'alice','Ants Bake Cookies',120000).isNew,true);
 assert.throws(()=>enter(b,'alice','Ants Bake Cakes',120500),/locked/);
 assert.equal(b.entries[0]?.answer,'Ants Bake Cookies');
 assert.throws(()=>startAttempt(b,'alice',121000),/locked/);
 assert.equal(startAttempt(b,'bob',122000),122000);
 assert.throws(()=>enter(b,'bob','All Boats Crash',242001),/expired/);
 assert.throws(()=>startAttempt(b,'charlie',b.deadline-119999),/Not enough time/);
});
test('timed attempts do not alter existing legacy or Blitz rule sets',()=>{
 const g=createGame('host');
 const b=start(g,'Legacy','ok',1000,'ABC');
 enter(b,'a','Ants Bake Cookies',2000);
 assert.equal(enter(b,'a','Ants Bake Cakes',2100).isNew,false);
 assert.throws(()=>startAttempt(b,'a',2200),/does not use/);
});
