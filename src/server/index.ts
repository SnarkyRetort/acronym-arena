import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, context, reddit, redis } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { mergeVotes, storeVote } from '../shared/vote-store';
import { optimisticRetry } from '../shared/optimistic-retry';
import { active, advance, aiLabel, availableSlots, boardById, chooseNext, comment, createGame, DEFAULT_THEMES, dismiss, endorse, enter, finish, leaderboard, start, startAttempt, chooseVoteOnly, chooseBlitzPlay, maySeeAnswers, maySeeLetters, vote, type Game, type AiMode, type ChallengeKind, type DurationHours, type ChoiceHours, type LetterCount, type BlitzVoteSeconds, isBlitzVoteSeconds, isLetterCount, randomLetters, isDuration, participation, hostName, hallOfFame, leaderboardStats, autoSettings, autoDeficit, randomAutoTheme, randomAutoLetterCount, liveCount } from '../shared/arena';

const app=new Hono();
const PREFIX='acro:reddit:v2:';
const gameKey=PREFIX+'game';
const voteKey=(id:number)=>PREFIX+'votes:'+id;
const entryKey=(id:number)=>PREFIX+'entries:'+id;
const entryUserKey=(id:number,user:string)=>PREFIX+'entry:'+id+':'+user;
const entrySequenceKey=(id:number)=>PREFIX+'entry-sequence:'+id;
const accessKey=(id:number)=>PREFIX+'access:'+id;
const accessUserKey=(id:number,user:string)=>PREFIX+'access:'+id+':'+user;
type AccessState={attempt?:number;voteOnly?:boolean;playBlitz?:boolean};
const mergeBoardShards=async(g:Game,onlyId?:number)=>{
 await Promise.all(g.boards.filter(b=>onlyId===undefined||b.id===onlyId).map(async b=>{
  const [entries,ballots,access]=await Promise.all([
   redis.hGetAll(entryKey(b.id)),redis.hGetAll(voteKey(b.id)),redis.hGetAll(accessKey(b.id))
  ]);
  const byUser=new Map(b.entries.map(e=>[e.user,e]));
  for(const [user,raw] of Object.entries(entries)){
   const item=JSON.parse(raw) as (typeof b.entries)[number];
   if(item.user!==user||!Number.isSafeInteger(item.id)||item.id<1)throw Error('Corrupt entry for '+user);
   byUser.set(user,item);
  }
  b.entries=[...byUser.values()].sort((x,y)=>x.id-y.id);
  b.votes=mergeVotes(b.votes,ballots);
  for(const [user,raw] of Object.entries(access)){
   const state=JSON.parse(raw) as AccessState;
   if(state.attempt!==undefined){b.attempts??={};b.attempts[user]=state.attempt;}
   if(state.voteOnly){b.voteOnly??={};b.voteOnly[user]=true;}
   if(state.playBlitz){b.playBlitz??={};b.playBlitz[user]=true;}
  }
 }));
 return g;
};
const hqKey=PREFIX+'headquarters';
const postKey=(id:string)=>PREFIX+'post:'+id;
type PostRole={kind:'hq'|'challenge';challengeId?:number};
const getPostId=()=>{if(!context.postId)throw Error('Open Acro Arena in its Reddit post.');return context.postId};
const getUser=async()=>{const u=await reddit.getCurrentUsername();if(!u)throw Error('Sign in to Reddit.');return u.toLowerCase()};
const readGame=async():Promise<Game>=>{const v=await redis.get(gameKey);if(!v)throw Error('Create Acro Arena Headquarters from the subreddit menu first.');const g=JSON.parse(v) as Game;const bank=new Set(g.themes??[]);let changed=false;for(const theme of DEFAULT_THEMES){if(!bank.has(theme)){bank.add(theme);changed=true;}}if(changed)g.themes=[...bank]; // Read-only requests never rewrite shared game state.
 // Merge independent player fields into each read-only snapshot.
 await mergeBoardShards(g);
 return g};
const saveGame=async(g:Game)=>redis.set(gameKey,JSON.stringify(g));
const readPost=async(id:string):Promise<PostRole>=>{const value=await redis.get(postKey(id));if(!value)throw Error('This is an older Acro Arena preview post. Open the Headquarters or a new challenge post.');return JSON.parse(value) as PostRole};
const ensureHost=(g:Game,u:string)=>{if(!g.hosts.includes(u))throw Error('Only an Arena moderator can do that.')};
const ensureBoardHost=(g:Game,b:ReturnType<typeof boardById>,u:string)=>{
 if(hostName(g,b)!==u&&!g.hosts.includes(u))throw Error('Only this challenge’s host or an Arena moderator can do that.');
};
const error=(e:unknown)=>e instanceof Error?e.message:'Unexpected error.';
const num=(v:unknown)=>{const n=Number(v);if(!Number.isInteger(n)||n<1)throw Error('Invalid challenge or entry ID.');return n};
const ai=(v:unknown):AiMode=>v==='ok'?'ok':'free';
const url=(id:string)=>'https://www.reddit.com/r/'+context.subredditName+'/comments/'+id+'/';
// A removed post can survive in Redis indefinitely. Do not confuse API outages
// with actual deletion: transient fetch errors must not silently erase a game.
const visiblePost=async(id:string):Promise<boolean>=>{
 try{
  const post=await reddit.getPostById(id as `t3_${string}`);
  return !post.removed&&!post.spam;
 }catch(e){
  const message=error(e);
  if(/404|not found|does not exist|deleted/i.test(message))return false;
  throw e;
 }
};
const reconcileRemovedChallenges=async(g:Game):Promise<boolean>=>{
 let changed=false;
 for(const b of active(g)){
  if(!b.postId||await visiblePost(b.postId))continue;
  b.phase='dismissed';
  b.archived=true;
  b.discardedReason='Reddit challenge post was removed; new challenges may be published';
  changed=true;
 }
 return changed;
};
const publish=async(g:Game,theme:string,mode:AiMode,by:string,kind:ChallengeKind='regular',nsfw=false,durationHours:DurationHours=24,choiceWindowHours:ChoiceHours=1,letterCount:LetterCount=4,blitzVoteSeconds:BlitzVoteSeconds=60,automated=false)=>{
 const next=g.nextId;
 const slot=availableSlots(g,by,kind)[0];
 if(!slot)throw Error(kind==='winner'?'Win a challenge to unlock Winner’s Choice. Only one can be hosted at a time.':'All your regular hosting slots are occupied.');
 const validated=JSON.parse(JSON.stringify(g)) as Game;
 const planned=start(validated,theme,mode,Date.now(),randomLetters(letterCount),slot,by,kind,nsfw,durationHours,choiceWindowHours,letterCount,blitzVoteSeconds,kind!=='blitz');
 const title=(nsfw?'🔞 ':'')+(kind==='blitz'?'⚡ Blitz':'🎙️ Acro Arena')+' #'+next+' · '+theme.slice(0,75);
 // Post as the creator where supported, with Reddit-native NSFW marking.
 let post;
 try{
  post=await reddit.submitCustomPost({title,subredditName:context.subredditName,entry:'challenge',nsfw,runAs:automated?'APP':'USER',userGeneratedContent:{text:theme},textFallback:{text:'Play Acro Arena: '+theme}});
 }catch(e){
  console.error('Challenge Reddit post creation failed',e);
  throw Error('Reddit could not publish this challenge: '+error(e));
 }
 const b=start(g,theme,mode,planned.started,planned.letters,slot,by,kind,nsfw,durationHours,choiceWindowHours,letterCount,blitzVoteSeconds,kind!=='blitz');
 b.postId=post.id;
 if(automated)b.autoGenerated=true;
 // Winning players can contribute a new theme to the shared rotation.
 if(kind==='winner'&&!g.themes.some(t=>t.toLowerCase()===b.theme.toLowerCase()))g.themes.push(b.theme);
 await redis.set(postKey(post.id),JSON.stringify({kind:'challenge',challengeId:b.id} satisfies PostRole));
 await saveGame(g);
 return {board:b,url:url(post.id)};
};
/** Scheduler refills at most one challenge per run to avoid spam bursts.
 * Manual Fill Now is limited to three; admin can repeat if desired.
 * A failed Reddit API call stops the batch without creating a phantom board.
 */
const replenish=async(g:Game,limit=1):Promise<number>=>{
 let created=0;
 for(let i=0;i<Math.min(3,limit)&&autoDeficit(g)>0;i++){
  const settings=autoSettings(g);
  const theme=randomAutoTheme(g);
  const count=randomAutoLetterCount(settings.letters);
  await publish(g,theme,'free','acro-arena','regular',false,settings.durationHours,1,count,60,true);
  created++;
 }
 return created;
};
const snapshot=(g:Game,user:string,role:PostRole)=>{
 const isHost=g.hosts.includes(user);
 const hq=g.hosts[0]??'';
 const stats=leaderboardStats(g);
 const personal=stats.find(p=>p.user===user);
 const playerScore={total:personal?.total??0,rank:personal?stats.indexOf(personal)+1:0,entered:personal?.entered??0,votesCast:personal?.votesCast??0,onThemeGiven:personal?.onThemeGiven??0,wins:personal?.first??0};
 const visible=JSON.parse(JSON.stringify(g)) as Game;
 // Filter every board, including Headquarters snapshots.
 const now=Date.now();
 for(const board of visible.boards){
  const real=boardById(g,board.id);
  board.letterCount=real.letters.length;
  board.entryCount=real.entries.length;board.voteCount=real.votes.length;
  const started=real.attempts?.[user]!==undefined;
  const entered=real.entries.some(e=>e.user===user);
  const blitzPlaying=!!real.playBlitz?.[user];
  // Headquarters is publicly pinned. Never put live answers or ballots in its
  // response, even for a visitor who has already played another challenge.
  if(role.kind==='hq'&&(real.phase==='open'||real.phase==='voting')){
   board.entries=[];board.votes=[];board.letters='';
  }else if(real.kind==='blitz'&&real.phase==='open'){
   board.entries=board.entries.filter(e=>e.user===user);board.votes=[];
  }else if(!maySeeAnswers(real,user,now)){board.entries=[];board.votes=[];}
  // Per-user reveal is enforced on the server, including for the challenge host.
  // The pinned HQ also remains spoiler-free even after a host plays.
  if(!maySeeLetters(real,user))board.letters='';
  // Discussion is also a source of hints. Keep in-app discussion private
  // until this player has submitted, chosen Just Vote, or their attempt expired.
  if(real.timedEntry&&!maySeeAnswers(real,user,now))board.discussion=[];
  board.attempts=started?{[user]:real.attempts![user]!}:{};
  board.voteOnly=real.voteOnly?.[user]?{[user]:true}:{};
  board.playBlitz=blitzPlaying?{[user]:true}:{};
 }
 return {game:visible,playerScore,me:user,isHost,kind:role.kind,challengeId:role.challengeId??null,hqUrl:hq,headquartersId:undefined,active:active(visible),leaderboard:stats.map(p=>({user:p.user,points:p.total})),hallOfFame:role.kind==='hq'?hallOfFame(g):[],autoStatus:{...autoSettings(g),live:liveCount(g),vacancies:autoDeficit(g)},slots:availableSlots(g,user),winnerSlots:availableSlots(g,user,'winner'),participation:participation(g,user)};
};

// Gameplay mutations use optimistic concurrency control. Watching both the
// game snapshot and this board's per-player ballots prevents a finishing round
// from settling an out-of-date tally. Never call external Reddit APIs inside
// this retry loop: only repeatable, local state transitions belong here.
const playerOps=new Set(['play_entry','just_vote','entry','vote']);
const transactionalOps=new Set(['endorse','comment','finish','dismiss','host_add','auto_config']);
const atomicAction=async(user:string,role:PostRole,data:Record<string,unknown>):Promise<{message:string;g:Game}>=>{
 const op=String(data.op??'');
 return optimisticRetry<Awaited<ReturnType<typeof redis.watch>>,{message:string;g:Game}>(
  async()=>{
   // A transition may finish any expired board, so protect every live shard
   // from concurrent entries and ballots while calculating final scores.
   const raw=await redis.get(gameKey);
   if(!raw)throw Error('Arena game missing.');
   const g=JSON.parse(raw) as Game;
   const keys=[gameKey,...g.boards.filter(b=>b.phase==='open'||b.phase==='voting'||b.phase==='choice')
    .flatMap(b=>[entryKey(b.id),voteKey(b.id),accessKey(b.id)])];
   return redis.watch(...keys);
  },
  async tx=>{
   const raw=await redis.get(gameKey);
   if(!raw)throw Error('Create Acro Arena Headquarters from the subreddit menu first.');
   const g=JSON.parse(raw) as Game;
   await mergeBoardShards(g);
   // Always evaluate time-based transitions against the latest watched state.
   advance(g);
   const board=()=>{
    if(role.kind!=='challenge')throw Error('Open the challenge post to play.');
    return boardById(g,role.challengeId!);
   };
   let message='Saved.', ballot:ReturnType<typeof board>['votes'][number]|undefined;
   let endorsedEntry:ReturnType<typeof board>['entries'][number]|undefined;
   if(op==='play_entry'){
    const b=board();
    if(b.kind==='blitz'){chooseBlitzPlay(b,user);message='Blitz letters revealed. Submit before the shared countdown expires.';}
    else{startAttempt(b,user);message='Clock started. You have '+(b.entrySeconds??120)+' seconds to submit one locked answer.';}
   }else if(op==='just_vote'){
    chooseVoteOnly(board(),user);message='Voting-only confirmed. You cannot submit an answer to this challenge.';
   }else if(op==='entry'){
    const b=board(),result=enter(b,user,String(data.answer??''));
    if(result.isNew){const key=b.id+':entry:'+user;if(!g.ledger.includes(key)){g.scores[user]=(g.scores[user]??0)+1;g.ledger.push(key);}}
    message=result.isNew?'Entry accepted (+1).':'Answer updated.';
   }else if(op==='vote'){
    const b=board();vote(b,user,num(data.first));
    ballot=b.votes.find(v=>v.user===user)!;
    message='Vote saved; you may change it before voting closes.';
   }else if(op==='endorse'){
    const b=board(),entryId=num(data.entryId),e=b.entries.find(x=>x.id===entryId);
    const prev=e?.onThemeBy.includes(user)??false;
    endorse(b,user,entryId);endorsedEntry=b.entries.find(e=>e.id===entryId);
    message=prev?'On Theme endorsement withdrawn.':'On Theme endorsement recorded (Theme Leader achievement only).';
   }else if(op==='comment'){
    comment(board(),user,String(data.body??''));message='Discussion reply posted.';
   }else if(op==='finish'){
    const b=board();ensureBoardHost(g,b,user);finish(g,b);
    message=b.winner?'Winner: u/'+b.winner+'. Player’s Choice unlocked.':'Challenge finished in a tie or without votes.';
   }else if(op==='dismiss'){
    const b=board();ensureBoardHost(g,b,user);dismiss(b);message='Challenge dismissed without declaring a winner.';
   }else if(op==='host_add'){
    if(role.kind!=='hq')throw Error('Manage hosts from Headquarters.');
    ensureHost(g,user);
    const name=String(data.username??'').toLowerCase().replace(/^u\//,'').trim();
    if(!/^[a-z0-9_-]{3,20}$/.test(name))throw Error('Invalid Reddit username.');
    if(!g.hosts.includes(name))g.hosts.push(name);
    message='u/'+name+' is an Arena Host.';
   }else if(op==='auto_config'){
    if(role.kind!=='hq')throw Error('Open Headquarters to change automation settings.');
    ensureHost(g,user);
    const target=Number(data.target),duration=Number(data.durationHours);
    if(!Number.isInteger(target)||target<1||target>10)throw Error('Choose between 1 and 10 concurrent challenges.');
    if(!isDuration(duration))throw Error('Choose a duration of 1, 4, 8 or 24 hours.');
    if(data.letters!=='weighted'&&data.letters!=='uniform')throw Error('Choose weighted or evenly random letter lengths.');
    g.auto={enabled:data.enabled===true,target,letters:data.letters,durationHours:duration};
    message=(g.auto.enabled?'Automatic challenge refills enabled.':'Automatic challenge refills paused.')+' Target: '+target+' live challenges.';
   }
   await tx.multi();
   if(ballot)await tx.hSet(voteKey(role.challengeId!),{[user]:JSON.stringify(ballot)});
   if(endorsedEntry)await tx.hSet(entryKey(role.challengeId!),{[endorsedEntry.user]:JSON.stringify(endorsedEntry)});
   await tx.set(gameKey,JSON.stringify(g));
   const result=await tx.exec();
   if(result===null)return {ok:false as const}; // WATCH conflict: re-read current state and retry.
   return {ok:true as const,value:{message,g}};
  },
  tx=>tx.unwatch()
 );
};

// Each player's write watches the shared challenge state and that player's own
// access/entry record, never another player's entry or vote. These transactions
// do not rewrite the game record.
const playerAction=async(user:string,role:PostRole,data:Record<string,unknown>):Promise<string>=>{
 if(role.kind!=='challenge'||!role.challengeId)throw Error('Open the challenge post to play.');
 const id=role.challengeId,op=String(data.op??'');
 const personal=[accessUserKey(id,user),entryUserKey(id,user)];
 return optimisticRetry<Awaited<ReturnType<typeof redis.watch>>,string>(
  ()=>redis.watch(gameKey,...personal),
  async tx=>{
   const raw=await redis.get(gameKey);
   if(!raw)throw Error('Create Acro Arena Headquarters from the subreddit menu first.');
   const g=JSON.parse(raw) as Game;
   await mergeBoardShards(g,id);
   const b=boardById(g,id);
   // Deadline enforcement is local here; only the scheduler persists transitions.
   if(b.phase==='open'&&Date.now()>=b.deadline){
    if(b.kind==='blitz'){b.phase='voting';b.votingDeadline=b.deadline+(b.blitzVoteSeconds??60)*1000;}
    else b.phase='done';
   }
   if(b.phase==='voting'&&Date.now()>=(b.votingDeadline??0))b.phase='done';
   let message='Saved.';
   let access:AccessState|undefined;
   let entry:typeof b.entries[number]|undefined;
   let ballot:typeof b.votes[number]|undefined;
   if(op==='play_entry'){
    if(b.kind==='blitz'){chooseBlitzPlay(b,user);message='Blitz letters revealed. Submit before the shared countdown expires.';}
    else{startAttempt(b,user);message='Clock started. You have '+(b.entrySeconds??120)+' seconds to submit one locked answer.';}
    access={attempt:b.attempts?.[user],voteOnly:b.voteOnly?.[user],playBlitz:b.playBlitz?.[user]};
   }else if(op==='just_vote'){
    chooseVoteOnly(b,user);message='Voting-only confirmed. You cannot submit an answer to this challenge.';
    access={attempt:b.attempts?.[user],voteOnly:b.voteOnly?.[user],playBlitz:b.playBlitz?.[user]};
   }else if(op==='entry'){
    const result=enter(b,user,String(data.answer??''));
    if(result.isNew){
     // Allocation is atomic. Failed attempts may leave harmless sequence gaps.
     // High IDs cannot collide with small legacy board-local entry IDs.
     result.entry.id=1_000_000_000+await redis.incrBy(entrySequenceKey(id),1);
    }
    entry=result.entry;
    message=result.isNew?'Entry accepted (+1).':'Answer updated.';
   }else if(op==='vote'){
    vote(b,user,num(data.first));
    ballot=b.votes.find(v=>v.user===user)!;
    message='Vote saved; you may change it before voting closes.';
   }else throw Error('Unsupported player action.');
   await tx.multi();
   if(access){
    const serialized=JSON.stringify(access);
    await tx.set(accessUserKey(id,user),serialized);
    await tx.hSet(accessKey(id),{[user]:serialized});
   }
   if(entry){
    const serialized=JSON.stringify(entry);
    await tx.set(entryUserKey(id,user),serialized);
    await tx.hSet(entryKey(id),{[user]:serialized});
   }
   if(ballot)await tx.hSet(voteKey(id),{[user]:JSON.stringify(ballot)});
   const result=await tx.exec();
   if(result===null)return {ok:false as const};
   return {ok:true as const,value:message};
  },
  tx=>tx.unwatch()
 );
};

app.post('/internal/menu/create',async c=>{
 try{
  const existing=await redis.get(hqKey);
  if(existing&&await visiblePost(existing))return c.json<UiResponse>({navigateTo:url(existing)});
  const user=await getUser();
  const post=await reddit.submitCustomPost({title:'📌 Acro Arena Headquarters · Rules, leaderboard and hosts'});
  await redis.set(postKey(post.id),JSON.stringify({kind:'hq'} satisfies PostRole));
  // Replacing a removed HQ must preserve its scores, hosts, and challenge history.
  const previous=await redis.get(gameKey);
  if(!previous)await saveGame(createGame(user));
  await redis.set(hqKey,post.id);
  return c.json<UiResponse>({navigateTo:url(post.id)});
 }catch(e){console.error('Create HQ failed',e);return c.json<UiResponse>({showToast:error(e)},400)}
});

app.get('/api/game',async c=>{
 try{
  const user=await getUser(),id=getPostId(),role=await readPost(id),g=await readGame();
  // GET is deliberately read-only. The scheduler persists timed transitions;
  // a viewer must never overwrite simultaneous player actions.
  advance(g);
  return c.json({...snapshot(g,user,role),headquartersUrl:url((await redis.get(hqKey))??id)});
 }catch(e){return c.json({error:error(e)},400)}
});

app.post('/api/action',async c=>{
 try{
  const user=await getUser(),id=getPostId(),role=await readPost(id);
  const data=await c.req.json() as Record<string,unknown>;
  if(playerOps.has(String(data.op??''))){
   const message=await playerAction(user,role,data);
   const g=await readGame();
   advance(g);
   return c.json({ok:true,message,...snapshot(g,user,role),headquartersUrl:url((await redis.get(hqKey))??id)});
  }
  if(transactionalOps.has(String(data.op??''))){
   const {message,g}=await atomicAction(user,role,data);
   return c.json({ok:true,message,...snapshot(g,user,role),headquartersUrl:url((await redis.get(hqKey))??id)});
  }
  const g=await readGame();
  advance(g);
  const repaired=await reconcileRemovedChallenges(g);
  if(repaired)await saveGame(g);
  const op=String(data.op??'');
  const board=()=>{if(role.kind!=='challenge')throw Error('Open the challenge post to play.');return boardById(g,role.challengeId!)};
  let message='Saved.',navigate:string|undefined,persistGame=true;
  if(op==='start'){
   if(role.kind!=='hq')throw Error('Start challenges from Headquarters.');
   const kind:ChallengeKind=data.kind==='winner'?'winner':data.kind==='blitz'?'blitz':'regular';
   const duration=Number(data.durationHours??24),choiceWindow=Number(data.choiceWindowHours??1),letterCount=Number(data.letterCount??4),blitzVoteSeconds=Number(data.blitzVoteSeconds??60);
   if(!isLetterCount(letterCount))throw Error('Letter count must be 3 through 8.');
   if(!isDuration(duration)||!isDuration(choiceWindow))throw Error('Timer must be 1, 4, 8, or 24 hours.');
   if(kind==='blitz'&&!isBlitzVoteSeconds(blitzVoteSeconds))throw Error('Blitz voting must be 30, 60, 90, 120 or 180 seconds.');
   const r=await publish(g,String(data.theme??'').trim(),ai(data.ai),user,kind,data.nsfw===true,duration,choiceWindow,letterCount,blitzVoteSeconds as BlitzVoteSeconds);
   navigate=r.url;message=(kind==='blitz'?'Blitz':'Challenge')+' #'+r.board.id+' published as a new Reddit post.';
  }else if(op==='play_entry'){
   const b=board();
   if(b.kind==='blitz'){chooseBlitzPlay(b,user);message='Blitz letters revealed. Submit before the shared countdown expires.';}
   else{startAttempt(b,user);message='Clock started. You have '+(b.entrySeconds??120)+' seconds to submit one locked answer.';}
  }else if(op==='just_vote'){
   const b=board();chooseVoteOnly(b,user);
   message='Voting-only confirmed. You cannot submit an answer to this challenge.';
  }else if(op==='entry'){
   const b=board(),result=enter(b,user,String(data.answer??''));
   if(result.isNew){g.scores[user]=(g.scores[user]??0)+1;g.ledger.push(b.id+':entry:'+user)}
   message=result.isNew?'Entry accepted (+1).':'Answer updated.';
  }else if(op==='vote'){
   const b=board();vote(b,user,num(data.first));
    // Independent hash fields avoid lost ballots from concurrent players.
    await storeVote(redis,voteKey(b.id),b.votes.find(v=>v.user===user)!);
    persistGame=false;
   message='Vote saved; you may change it before voting closes.';
  }else if(op==='endorse'){
   const b=board(),entryId=num(data.entryId),e=b.entries.find(x=>x.id===entryId);
   const prev=e?.onThemeBy.includes(user)??false;
   endorse(b,user,entryId);
   message=prev?'On Theme endorsement withdrawn.':'On Theme endorsement recorded (Theme Leader achievement only).';
  }else if(op==='comment'){
   comment(board(),user,String(data.body??''));message='Discussion reply posted.';
  }else if(op==='finish'){
   const b=board();ensureBoardHost(g,b,user);finish(g,b);
   message=b.winner?'Winner: u/'+b.winner+'. Player’s Choice unlocked.':'Challenge finished in a tie or without votes.';
  }else if(op==='dismiss'){
   const b=board();ensureBoardHost(g,b,user);dismiss(b);message='Challenge dismissed without declaring a winner.';
  }else if(op==='choice'){
   const b=board();
   if(b.winner!==user||!g.winnerTokens?.[user]||(g.winnerExpires?.[user]!==undefined&&Date.now()>=g.winnerExpires[user]))throw Error('Winner’s Choice reward is missing or expired.');
   const r=await publish(g,String(data.theme??'').trim(),ai(data.ai),user,'winner',data.nsfw===true);
   b.phase='done';
   navigate=r.url;message='Player’s Choice published Challenge #'+r.board.id+'.';
  }else if(op==='auto_config'){
   if(role.kind!=='hq')throw Error('Open Headquarters to change automation settings.');
   ensureHost(g,user);
   const target=Number(data.target),duration=Number(data.durationHours);
   if(!Number.isInteger(target)||target<1||target>10)throw Error('Choose between 1 and 10 concurrent challenges.');
   if(!isDuration(duration))throw Error('Choose a duration of 1, 4, 8 or 24 hours.');
   if(data.letters!=='weighted'&&data.letters!=='uniform')throw Error('Choose weighted or evenly random letter lengths.');
   g.auto={enabled:data.enabled===true,target,letters:data.letters,durationHours:duration};
   message=(g.auto.enabled?'Automatic challenge refills enabled.':'Automatic challenge refills paused.')+' Target: '+target+' live challenges.';
  }else if(op==='auto_fill'){
   if(role.kind!=='hq')throw Error('Open Headquarters to refill the Arena.');
   ensureHost(g,user);
   if(!autoSettings(g).enabled)throw Error('Enable automatic refills first.');
   const n=await replenish(g,3);
   message=n?'Published '+n+' automatic challenge'+(n===1?'':'s')+'. '+autoDeficit(g)+' remaining vacancies.':'The Arena is at its target or all automatic slots are occupied.';
  }else if(op==='auto_create'){
   if(role.kind!=='hq')throw Error('Open Headquarters to generate a challenge.');
   ensureHost(g,user);
   if(liveCount(g)>=10)throw Error('Ten live challenges already exist.');
   const settings=autoSettings(g),theme=randomAutoTheme(g),count=randomAutoLetterCount(settings.letters);
   const r=await publish(g,theme,'free','acro-arena','regular',false,settings.durationHours,1,count,60,true);
   message='Generated Challenge #'+r.board.id+' · '+theme+'.';
  }else if(op==='host_add'){
   if(role.kind!=='hq')throw Error('Manage hosts from Headquarters.');
   ensureHost(g,user);
   const name=String(data.username??'').toLowerCase().replace(/^u\//,'').trim();
   if(!/^[a-z0-9_-]{3,20}$/.test(name))throw Error('Invalid Reddit username.');
   if(!g.hosts.includes(name))g.hosts.push(name);
   message='u/'+name+' is an Arena Host.';
  }else throw Error('Unknown action.');
  if(persistGame)await saveGame(g);
  return c.json({ok:true,message,navigate,...snapshot(g,user,role),headquartersUrl:url((await redis.get(hqKey))??id)});
 }catch(e){const message=error(e);if(!/Your timed attempt has expired|Your answer is already locked|This challenge is closed/.test(message))console.error('Acro action failed',e);return c.json({error:message},400)}
});

// Settlement must read the same entry/vote versions it commits. Watching all
// active shards makes a late submission retry against the finalized phase.
const settleTimedBoards=async():Promise<number>=>optimisticRetry<Awaited<ReturnType<typeof redis.watch>>,number>(
 async()=>{
  const raw=await redis.get(gameKey);
  if(!raw)throw Error('Arena game missing.');
  const g=JSON.parse(raw) as Game;
  return redis.watch(gameKey,...g.boards.filter(b=>b.phase==='open'||b.phase==='voting'||b.phase==='choice')
   .flatMap(b=>[entryKey(b.id),voteKey(b.id),accessKey(b.id)]));
 },
 async tx=>{
  const raw=await redis.get(gameKey);
  if(!raw)throw Error('Arena game missing.');
  const g=JSON.parse(raw) as Game;
  await mergeBoardShards(g);
  const changed=advance(g);
  if(!changed){await tx.unwatch();return {ok:true as const,value:0};}
  await tx.multi();
  await tx.set(gameKey,JSON.stringify(g));
  const committed=await tx.exec();
  return committed===null?{ok:false as const}:{ok:true as const,value:changed};
 },
 tx=>tx.unwatch()
);
app.post('/internal/scheduler/tick',async c=>{
 try{
  const n=await settleTimedBoards();
  const g=await readGame(),repaired=await reconcileRemovedChallenges(g);
  if(repaired)await saveGame(g);
  let created=0;
  if(autoDeficit(g)>0){
   try{created=await replenish(g,1)}
   catch(e){console.error('Acro auto-refill failed; retry on the next scheduled tick',e);}
  }
  return c.json({changed:n,removedPostsRepaired:repaired,autoCreated:created,live:liveCount(g)});
 }catch(e){return c.json({error:error(e)},500)}
});

serve({fetch:app.fetch,createServer,port:getServerPort()});
