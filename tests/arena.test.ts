import test from 'node:test';
import assert from 'node:assert/strict';
import {formatScoreShare} from '../src/client/share-score.ts';
import {createGame,start,enter,vote,endorse,comment,finish,chooseNext,advance,aiLabel,availableSlots,enforceSingle,parseAnswer,rankedChallenges,tally,leaderboardStats,DEFAULT_THEMES,drawThemeChoices,randomLetters,isLetterCount,blitzAnswerSeconds,isBlitzVoteSeconds,startAttempt,chooseVoteOnly,chooseBlitzPlay,maySeeAnswers,maySeeLetters,hallOfFame,autoSettings,autoDeficit,liveCount,randomAutoTheme,randomAutoLetterCount,winnerOverflow} from '../src/shared/arena.ts';

test('AI label is compact with honor system only for AI-free',()=>{assert.equal(aiLabel('ok'),'🤖 AI OK');assert.equal(aiLabel('free'),'🧠 AI FREE · HONOR SYSTEM')});
test('one regular player slot and sequential identifiers',()=>{const g=createGame('mod');const b=start(g,'Theme','free',0,'ABC',1,'player');assert.equal(b.id,1);assert.deepEqual(availableSlots(g,'player'),[]);assert.throws(()=>start(g,'Theme','free',0,'ABC',1,'player'),/occupied/);finish(g,b,100);assert.deepEqual(availableSlots(g,'player'),[1]);assert.equal(start(g,'Another','ok',200,'XYZ',1,'player').id,2)});
test('answer must match exact acronym, edits do not duplicate entries',()=>{const g=createGame('host'),b=start(g,'Theme','ok',100,'EETTBO');assert.equal(enter(b,'alice','Evil Elves Turn Tourists Back Outside',200).isNew,true);assert.equal(enter(b,'alice','Evil Elves Toss Tourists Back Outside',300).isNew,false);assert.equal(b.entries.length,1);assert.throws(()=>parseAnswer('EETTBO','Evil Elves Turn Tourists Into Bacon Omelets'),/exactly 6/);assert.throws(()=>parseAnswer('ABC','A B Dog'),/Word 3/)});
test('no self vote; ranked voting requires two players and can change',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'alice','Ants Bake Cookies',200);assert.throws(()=>vote(b,'alice',1,undefined,300),/two/);enter(b,'bob','All Boats Crash',300);assert.throws(()=>vote(b,'alice',1,undefined,400),/another/);vote(b,'alice',2,undefined,500);vote(b,'alice',2,undefined,600);assert.equal(b.votes.length,1)});
test('On Theme endorsements toggle and discussion archives at finish',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);endorse(b,'b',1);assert.deepEqual(b.entries[0]?.onThemeBy,['b']);endorse(b,'b',1);assert.deepEqual(b.entries[0]?.onThemeBy,[]);comment(b,'a','nice',300);vote(b,'a',2,undefined,400);finish(g,b,500);assert.equal(b.archived,true);assert.equal(b.phase,'choice');assert.throws(()=>comment(b,'b','more',600),/archived/);assert.equal(g.scores.b,26)});
test('winner chooses theme and independent AI mode in same slot',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);vote(b,'a',2,undefined,400);finish(g,b,500);const next=chooseNext(g,b,'b','New theme','ok',600);assert.equal(next.ai,'ok');assert.equal(next.slot,b.slot);assert.equal(next.id,2);assert.equal(b.phase,'done');assert.throws(()=>chooseNext(g,b,'b','More','free',700),/Only/)});
test('ties do not award winner: scoring remains current provisional behavior',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');enter(b,'a','Ants Bake Cookies',200);enter(b,'b','All Boats Crash',200);vote(b,'a',2,undefined,300);vote(b,'b',1,undefined,300);finish(g,b,400);assert.equal(b.winner,undefined);assert.equal(b.phase,'done');assert.equal(g.scores.a,1);assert.equal(g.scores.b,1)});
test('24 hour timer advances, including one hour Player Choice expiry',()=>{const g=createGame('host'),b=start(g,'Theme','free',100,'ABC');assert.equal(advance(g,86400101),1);assert.equal(b.phase,'done');assert.equal(advance(g,86400101),0)});
test('five-board preview migrates to one active without removing history',()=>{const g=createGame('host');const one=start(g,'Theme','free',0,'ABC');g.boards.push(...[2,3,4,5].map(id=>({...one,id,slot:id,entries:[],votes:[],discussion:[]})));g.nextId=6;assert.equal(enforceSingle(g),4);assert.equal(g.boards.filter(b=>b.phase==='open'||b.phase==='choice').length,1);assert.deepEqual(g.boards.slice(1).map(b=>b.phase),['dismissed','dismissed','dismissed','dismissed']);assert.equal(enforceSingle(g),0);assert.deepEqual(availableSlots(g),[2,3,4,5,6,7,8,9,10])});

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


test('moderators can host ten simultaneous regular challenges, but not eleven',()=>{
 const g=createGame('mod');
 for(let slot=1;slot<=10;slot++){
  assert.equal(availableSlots(g,'mod')[0],slot);
  const b=start(g,'Theme '+slot,'free',100,'ABC',slot,'mod');
  assert.equal(b.slot,slot);
 }
 assert.deepEqual(availableSlots(g,'mod'),[]);
 assert.throws(()=>start(g,'Eleventh','free',100,'ABC',1,'mod'),/Ten live challenges already exist/);
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
 chooseBlitzPlay(b,'alice',1050);enter(b,'alice','Ants Bake Cakes During Every Friday Game',1100);
 chooseBlitzPlay(b,'bob',1150);enter(b,'bob','All Big Cats Dance Every Friday Gracefully',1200);
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

test('personal 60-second challenge locks one entry, enforces expiration and cannot restart',()=>{
 const g=createGame('host'),b=start(g,'Theme','free',1000,'ABC',1,'host','regular',false,24,1,3,60,true);
 assert.equal(b.timedEntry,true);
 assert.equal(b.entrySeconds,60);
 assert.throws(()=>enter(b,'alice','Ants Bake Cookies',1200),/Press Play/);
 assert.equal(startAttempt(b,'alice',1300),1300);
 assert.equal(startAttempt(b,'alice',1500),1300); // refresh never restarts countdown
 assert.equal(enter(b,'alice','Ants Bake Cookies',60000).isNew,true);
 assert.throws(()=>enter(b,'alice','Ants Bake Cakes',60500),/locked/);
 assert.equal(b.entries[0]?.answer,'Ants Bake Cookies');
 assert.throws(()=>startAttempt(b,'alice',61000),/locked/);
 assert.equal(startAttempt(b,'bob',62000),62000);
 assert.throws(()=>enter(b,'bob','All Boats Crash',122001),/expired/);
 assert.throws(()=>startAttempt(b,'charlie',b.deadline-59999),/Not enough time/);
});
test('timed attempts do not alter existing legacy or Blitz rule sets',()=>{
 const g=createGame('host');
 const b=start(g,'Legacy','ok',1000,'ABC');
 enter(b,'a','Ants Bake Cookies',2000);
 assert.equal(enter(b,'a','Ants Bake Cakes',2100).isNew,false);
 assert.throws(()=>startAttempt(b,'a',2200),/does not use/);
});

test('Blitz answers are also immutable after first submission',()=>{
 const g=createGame('host'),b=start(g,'Theme','ok',1000,'ABC',1,'bob','blitz',false,24,1,3,60);
 chooseBlitzPlay(b,'bob',1500);enter(b,'bob','Ants Bake Cookies',2000);
 assert.throws(()=>enter(b,'bob','Ants Bake Cakes',3000),/locked/);
});

test('Just Vote permanently forbids a timed entry but permits a ballot',()=>{
 const g=createGame('host'),b=start(g,'Theme','free',1000,'ABC',1,'host','regular',false,24,1,3,60,true);
 enterAfterTwoPlayers(b);
 assert.equal(maySeeAnswers(b,'viewer',2000),false);
 chooseVoteOnly(b,'viewer');
 assert.equal(maySeeAnswers(b,'viewer',2000),true);
 assert.throws(()=>startAttempt(b,'viewer',2100),/Just Vote/);
 assert.throws(()=>enter(b,'viewer','Ants Bake Cookies',2100),/Just Vote/);
 vote(b,'viewer',1,undefined,2200);
 vote(b,'viewer',2,undefined,2300);
 assert.equal(b.votes.filter(v=>v.user==='viewer').length,1);
 assert.equal(b.votes.find(v=>v.user==='viewer')?.first,2);
 assert.equal(b.entries.length,2);
});
const enterAfterTwoPlayers=(b:ReturnType<typeof start>)=>{
 startAttempt(b,'alice',1200);enter(b,'alice','Ants Bake Cookies',1300);
 startAttempt(b,'bob',1400);enter(b,'bob','All Boats Crash',1500);
};
test('live attempt cannot peek at other answers or select Just Vote',()=>{
 const g=createGame('host'),b=start(g,'Theme','ok',1000,'ABC',1,'host','regular',false,24,1,3,60,true);
 startAttempt(b,'alice',2000);
 assert.equal(maySeeAnswers(b,'alice',3000),false);
 assert.throws(()=>chooseVoteOnly(b,'alice'),/already chose Play/);
 assert.throws(()=>vote(b,'alice',1,undefined,3000),/Finish your entry/);
 assert.equal(maySeeAnswers(b,'alice',62000),true);
 assert.throws(()=>enter(b,'alice','Ants Bake Cookies',62001),/expired/);
});
test('Blitz needs a permanent choice and keeps its shared entry and voting windows',()=>{
 const g=createGame('host'),b=start(g,'Theme','ok',1000,'ABC',1,'host','blitz',false,24,1,3,60);
 assert.throws(()=>enter(b,'alice','Ants Bake Cookies',2000),/Press Play/);
 chooseBlitzPlay(b,'alice',2000);
 enter(b,'alice','Ants Bake Cookies',3000);
 chooseVoteOnly(b,'bob');
 assert.throws(()=>chooseBlitzPlay(b,'bob',4000),/Just Vote/);
 assert.throws(()=>enter(b,'bob','All Boats Crash',4000),/Just Vote/);
 chooseBlitzPlay(b,'charlie',4000);
 enter(b,'charlie','All Boats Crash',5000);
 assert.equal(maySeeAnswers(b,'bob',6000),false);
 advance(g,b.deadline);
 assert.equal(maySeeAnswers(b,'bob',b.deadline),true);
 vote(b,'bob',1,undefined,b.deadline+1000);
 assert.equal(b.votes.length,1);
});

test('existing two-minute boards preserve historical attempts on migration',()=>{
 const g=createGame('host'),b=start(g,'Old post','free',1000,'ABC',1,'host','regular',false,24,1,3,60,true);
 delete b.entrySeconds; // Existing stored boards did not include this field.
 assert.equal(startAttempt(b,'oldplayer',1500),1500);
 assert.equal(maySeeAnswers(b,'oldplayer',61500),false);
 assert.equal(enter(b,'oldplayer','Ants Bake Cookies',118000).isNew,true);
});

test('Hall of Fame shows only finished answers, never live or dismissed entries',()=>{
 const g=createGame('host');
 const completed=start(g,'Finished','free',1000,'ABC',1,'host');
 enter(completed,'alice','Ants Bake Cookies',1200);
 enter(completed,'bob','All Boats Crash',1300);
 vote(completed,'fan1',1,undefined,1400);
 vote(completed,'fan2',1,undefined,1500);
 vote(completed,'fan3',2,undefined,1600);
 finish(g,completed,2000);
 const activeBoard=start(g,'Live','free',3000,'ABC',2,'host');
 enter(activeBoard,'alice','All Bats Cry',3300);
 enter(activeBoard,'bob','Angry Bears Charge',3400);
 vote(activeBoard,'fan4',1,undefined,3500);
 vote(activeBoard,'fan5',1,undefined,3600);
 vote(activeBoard,'fan6',1,undefined,3700);
 const deleted=start(g,'Dismissed','free',4000,'ABC',3,'host');
 enter(deleted,'alice','Always Bring Cake',4200);
 deleted.phase='dismissed';
 const hall=hallOfFame(g,3);
 const alice=hall.find(p=>p.user==='alice');
 assert.ok(alice);
 assert.ok(alice.answers.some(a=>a.answer==='Ants Bake Cookies'&&a.votes===2));
 assert.ok(!hall.some(p=>p.answers.some(a=>a.answer==='All Bats Cry'||a.answer==='Always Bring Cake')));
 assert.ok(hall.every(p=>p.answers.length<=3));
});
test('Hall of Fame orders each player’s completed answers by votes',()=>{
 const g=createGame('host');
 const examples:[string,number][]=[['Ants Bake Cookies',2],['All Boats Crash',1],['Angry Birds Chat',3],['Always Bring Cake',4]];
 examples.forEach(([answer,count],i)=>{
  const b=start(g,'Theme '+i,'free',1000+i*10000,'ABC',i+1,'host');
  enter(b,'alice',answer,1100+i*10000);
  enter(b,'bob','Aliens Buy Cheese',1200+i*10000);
  for(let v=0;v<count;v++)vote(b,'voter'+v,1,undefined,1400+i*10000);
  finish(g,b,2000+i*10000);
 });
 const alice=hallOfFame(g).find(p=>p.user==='alice');
 assert.deepEqual(alice?.answers.map(a=>a.votes),[4,3,2]);
});

test('acronym letters unlock only with personal Play or irrevocable Just Vote, including for hosts',()=>{
 const g=createGame('host'),b=start(g,'Mysterious theme','free',1000,'AVW',1,'host','regular',false,24,1,3,60,true);
 assert.equal(maySeeLetters(b,'host'),false);
 assert.equal(maySeeLetters(b,'alice'),false);
 startAttempt(b,'host',2000);
 assert.equal(maySeeLetters(b,'host'),true);
 assert.equal(maySeeLetters(b,'alice'),false);
 chooseVoteOnly(b,'alice');
 assert.equal(maySeeLetters(b,'alice'),true);
 assert.throws(()=>startAttempt(b,'alice',2500),/Just Vote/);
 startAttempt(b,'bob',3000);
 assert.equal(maySeeLetters(b,'bob'),true);
 enter(b,'bob','Amenities Vary Wildly',4000);
 assert.equal(maySeeLetters(b,'bob'),true);
 assert.equal(maySeeLetters(b,'charlie'),false);
 finish(g,b,5000);
 assert.equal(maySeeLetters(b,'charlie'),true);
});

test('score sharing includes personal points, placement and challenge link without leaking answers',()=>{
 const result=formatScoreShare({total:47,rank:2,entered:4,votesCast:3,onThemeGiven:2,wins:1},
  'sampleplayer',10,'Things found in a villain’s junk drawer','https://www.reddit.com/r/acro_arena_dev/comments/t3_sample/');
 assert.match(result,/u\/sampleplayer · 47 points · Rank #2/);
 assert.match(result,/✍ 4 entries · ★ 3 ballots/);
 assert.match(result,/Challenge #10/);
 assert.match(result,/https:\/\/www.reddit.com\/r\/acro_arena_dev\/comments\/t3_sample\//);
 assert.ok(!result.includes('Obnoxious Underwear Worn Nightly'));
});

test('Auto Arena defaults off and can maintain ten concurrent challenges without consuming player slots',()=>{
 const g=createGame('moderator');
 assert.equal(autoSettings(g).enabled,false);
 assert.equal(autoDeficit(g),0);
 g.auto={enabled:true,target:10,letters:'weighted',durationHours:24};
 assert.equal(autoDeficit(g),10);
 for(let i=0;i<10;i++){
  const b=start(g,'Auto Theme '+i,'free',1000,'ABC',i+1,'acro-arena','regular',false,24,1,3,60,true);
  assert.equal(b.slot,i+1);
 }
 assert.equal(liveCount(g),10);
 assert.equal(autoDeficit(g),0);
 assert.deepEqual(availableSlots(g,'acro-arena'),[]);
 assert.deepEqual(availableSlots(g,'alice'),[1]);
 finish(g,g.boards[0]!,2000);
 assert.equal(autoDeficit(g),1);
 assert.deepEqual(availableSlots(g,'acro-arena'),[1]);
});
test('Auto Arena weights 3/4/5 letters at 50/30/20 without 6–8 letter rounds',()=>{
 assert.equal(randomAutoLetterCount('weighted',()=>0),3);
 assert.equal(randomAutoLetterCount('weighted',()=>0.49999),3);
 assert.equal(randomAutoLetterCount('weighted',()=>0.5),4);
 assert.equal(randomAutoLetterCount('weighted',()=>0.79999),4);
 assert.equal(randomAutoLetterCount('weighted',()=>0.8),5);
 assert.equal(randomAutoLetterCount('weighted',()=>0.99999),5);
 assert.equal(randomAutoLetterCount('uniform',()=>0),3);
 assert.equal(randomAutoLetterCount('uniform',()=>0.3334),4);
 assert.equal(randomAutoLetterCount('uniform',()=>0.6667),5);
 assert.equal(randomAutoLetterCount('uniform',()=>0.9999),5);
 for(let i=0;i<1000;i++){
  const sample=i/1000;
  assert.ok(randomAutoLetterCount('weighted',()=>sample)>=3&&randomAutoLetterCount('weighted',()=>sample)<=5);
 }
});
test('Automatic theme selection never repeats an already live challenge theme',()=>{
 const g=createGame('mod');
 const a=start(g,'Terrible restaurant specials','free',100,'ABC',1,'mod');
 const b=start(g,'Things aliens find confusing','free',100,'DEF',2,'mod');
 assert.notEqual(randomAutoTheme(g,()=>0),a.theme);
 assert.notEqual(randomAutoTheme(g,()=>0),b.theme);
});

test('Winner Choice temporarily expands 10 live games to 11, then contracts before auto-refill',()=>{
 const g=createGame('mod');
 g.auto={enabled:true,target:10,letters:'weighted',durationHours:24};
 const regular=Array.from({length:10},(_,i)=>start(g,'Regular '+(i+1),'free',1000,'ABC',i+1,'mod'));
 assert.equal(liveCount(g),10);
 assert.equal(autoDeficit(g),0);
 assert.throws(()=>start(g,'Eleventh standard','free',1500,'DEF',1,'alice'),/Ten live challenges/);
 enter(regular[0]!,'alice','Ants Bake Cookies',1100);
 enter(regular[0]!,'bob','All Boats Crash',1100);
 vote(regular[0]!,'alice',2,undefined,1200);
 finish(g,regular[0]!,1300);
 assert.equal(g.winnerTokens?.bob,true);
 assert.equal(liveCount(g),9);
 const fill=start(g,'Back to ten','free',1400,'DEF',1,'mod');
 assert.equal(liveCount(g),10);
 const bonus=start(g,'Winner bonus','free',1500,'XYZ',1,'bob','winner',false,24,1,3,60,true);
 assert.equal(bonus.kind,'winner');
 assert.equal(liveCount(g),11);
 assert.equal(winnerOverflow(g),1);
 assert.equal(autoDeficit(g),0);
 assert.throws(()=>start(g,'Regular at eleven','free',1600,'HIJ',1,'charlie'),/Ten live challenges/);
 finish(g,fill,2000);
 assert.equal(liveCount(g),10);
 assert.equal(autoDeficit(g),0);
 assert.equal(winnerOverflow(g),0);
 finish(g,regular[1]!,2100);
 assert.equal(liveCount(g),9);
 assert.equal(autoDeficit(g),1);
 start(g,'Auto refills now','free',2200,'DEF',1,'acro-arena','regular',false,24,1,3,60,true);
 assert.equal(liveCount(g),10);
 assert.equal(autoDeficit(g),0);
 assert.equal(bonus.phase,'open');
});
