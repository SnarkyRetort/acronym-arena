import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, context, reddit, redis } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { active, advance, aiLabel, availableSlots, boardById, chooseNext, comment, createGame, DEFAULT_THEMES, dismiss, endorse, enter, finish, leaderboard, start, vote, type Game, type AiMode, type ChallengeKind, type DurationHours, type ChoiceHours, type LetterCount, type BlitzVoteSeconds, isBlitzVoteSeconds, isLetterCount, randomLetters, isDuration, participation, hostName } from '../shared/arena';

const app=new Hono();
const PREFIX='acro:reddit:v2:';
const gameKey=PREFIX+'game';
const hqKey=PREFIX+'headquarters';
const postKey=(id:string)=>PREFIX+'post:'+id;
type PostRole={kind:'hq'|'challenge';challengeId?:number};
const getPostId=()=>{if(!context.postId)throw Error('Open Acro Arena in its Reddit post.');return context.postId};
const getUser=async()=>{const u=await reddit.getCurrentUsername();if(!u)throw Error('Sign in to Reddit.');return u.toLowerCase()};
const readGame=async():Promise<Game>=>{const v=await redis.get(gameKey);if(!v)throw Error('Create Acro Arena Headquarters from the subreddit menu first.');const g=JSON.parse(v) as Game;const bank=new Set(g.themes??[]);let changed=false;for(const theme of DEFAULT_THEMES){if(!bank.has(theme)){bank.add(theme);changed=true;}}if(changed){g.themes=[...bank];await redis.set(gameKey,JSON.stringify(g));}return g};
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
const publish=async(g:Game,theme:string,mode:AiMode,by:string,kind:ChallengeKind='regular',nsfw=false,durationHours:DurationHours=24,choiceWindowHours:ChoiceHours=1,letterCount:LetterCount=4,blitzVoteSeconds:BlitzVoteSeconds=60)=>{
 const next=g.nextId;
 const slot=availableSlots(g,by,kind)[0];
 if(!slot)throw Error(kind==='winner'?'Win a challenge to unlock Winner’s Choice. Only one can be hosted at a time.':'All your regular hosting slots are occupied.');
 const validated=JSON.parse(JSON.stringify(g)) as Game;
 const planned=start(validated,theme,mode,Date.now(),randomLetters(letterCount),slot,by,kind,nsfw,durationHours,choiceWindowHours,letterCount,blitzVoteSeconds);
 const title=(nsfw?'🔞 ':'')+(kind==='blitz'?'⚡ Blitz':'🎙️ Acro Arena')+' #'+next+' · '+theme.slice(0,75);
 // Post as the creator where supported, with Reddit-native NSFW marking.
 let post;
 try{
  post=await reddit.submitCustomPost({title,subredditName:context.subredditName,entry:'challenge',nsfw,runAs:'USER',userGeneratedContent:{text:theme},textFallback:{text:'Play Acro Arena: '+theme}});
 }catch(e){
  console.error('Challenge Reddit post creation failed',e);
  throw Error('Reddit could not publish this challenge: '+error(e));
 }
 const b=start(g,theme,mode,planned.started,planned.letters,slot,by,kind,nsfw,durationHours,choiceWindowHours,letterCount,blitzVoteSeconds);
 b.postId=post.id;
 // Winning players can contribute a new theme to the shared rotation.
 if(kind==='winner'&&!g.themes.some(t=>t.toLowerCase()===b.theme.toLowerCase()))g.themes.push(b.theme);
 await redis.set(postKey(post.id),JSON.stringify({kind:'challenge',challengeId:b.id} satisfies PostRole));
 await saveGame(g);
 return {board:b,url:url(post.id)};
};
const snapshot=(g:Game,user:string,role:PostRole)=>{
 const isHost=g.hosts.includes(user);
 const hq=g.hosts[0]??'';
 const visible=JSON.parse(JSON.stringify(g)) as Game;
 // Never send another player's Blitz answers before the shared reveal/voting phase.
 for(const board of visible.boards){if(board.kind==='blitz'&&board.phase==='open'){board.entries=board.entries.filter(e=>e.user===user);board.votes=[];}}
 return {game:visible,me:user,isHost,kind:role.kind,challengeId:role.challengeId??null,hqUrl:hq,headquartersId:undefined,active:active(g),leaderboard:leaderboard(g),slots:availableSlots(g,user),winnerSlots:availableSlots(g,user,'winner'),participation:participation(g,user)};
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
  const updates=advance(g);
  const repaired=await reconcileRemovedChallenges(g);
  if(updates||repaired)await saveGame(g);
  return c.json({...snapshot(g,user,role),headquartersUrl:url((await redis.get(hqKey))??id)});
 }catch(e){return c.json({error:error(e)},400)}
});

app.post('/api/action',async c=>{
 try{
  const user=await getUser(),id=getPostId(),role=await readPost(id),g=await readGame();
  const data=await c.req.json() as Record<string,unknown>;
  advance(g);
  const repaired=await reconcileRemovedChallenges(g);
  if(repaired)await saveGame(g);
  const op=String(data.op??'');
  const board=()=>{if(role.kind!=='challenge')throw Error('Open the challenge post to play.');return boardById(g,role.challengeId!)};
  let message='Saved.',navigate:string|undefined;
  if(op==='start'){
   if(role.kind!=='hq')throw Error('Start challenges from Headquarters.');
   const kind:ChallengeKind=data.kind==='winner'?'winner':data.kind==='blitz'?'blitz':'regular';
   const duration=Number(data.durationHours??24),choiceWindow=Number(data.choiceWindowHours??1),letterCount=Number(data.letterCount??4),blitzVoteSeconds=Number(data.blitzVoteSeconds??60);
   if(!isLetterCount(letterCount))throw Error('Letter count must be 3 through 8.');
   if(!isDuration(duration)||!isDuration(choiceWindow))throw Error('Timer must be 1, 4, 8, or 24 hours.');
   if(kind==='blitz'&&!isBlitzVoteSeconds(blitzVoteSeconds))throw Error('Blitz voting must be 30, 60, 90, 120 or 180 seconds.');
   const r=await publish(g,String(data.theme??'').trim(),ai(data.ai),user,kind,data.nsfw===true,duration,choiceWindow,letterCount,blitzVoteSeconds as BlitzVoteSeconds);
   navigate=r.url;message=(kind==='blitz'?'Blitz':'Challenge')+' #'+r.board.id+' published as a new Reddit post.';
  }else if(op==='entry'){
   const b=board(),result=enter(b,user,String(data.answer??''));
   if(result.isNew){g.scores[user]=(g.scores[user]??0)+1;g.ledger.push(b.id+':entry:'+user)}
   message=result.isNew?'Entry accepted (+1).':'Answer updated.';
  }else if(op==='vote'){
   const b=board();vote(b,user,num(data.first));
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
  }else if(op==='host_add'){
   if(role.kind!=='hq')throw Error('Manage hosts from Headquarters.');
   ensureHost(g,user);
   const name=String(data.username??'').toLowerCase().replace(/^u\//,'').trim();
   if(!/^[a-z0-9_-]{3,20}$/.test(name))throw Error('Invalid Reddit username.');
   if(!g.hosts.includes(name))g.hosts.push(name);
   message='u/'+name+' is an Arena Host.';
  }else throw Error('Unknown action.');
  await saveGame(g);
  return c.json({ok:true,message,navigate,...snapshot(g,user,role),headquartersUrl:url((await redis.get(hqKey))??id)});
 }catch(e){console.error('Acro action failed',e);return c.json({error:error(e)},400)}
});

app.post('/internal/scheduler/tick',async c=>{
 try{const g=await readGame(),n=advance(g),repaired=await reconcileRemovedChallenges(g);if(n||repaired)await saveGame(g);return c.json({changed:n,removedPostsRepaired:repaired})}
 catch(e){return c.json({error:error(e)},500)}
});

serve({fetch:app.fetch,createServer,port:getServerPort()});
