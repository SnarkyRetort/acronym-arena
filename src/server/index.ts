import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, context, reddit, redis } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { active, advance, aiLabel, availableSlots, boardById, chooseNext, comment, createGame, dismiss, endorse, enter, finish, leaderboard, start, vote, type Game, type AiMode } from '../shared/arena';

const app=new Hono();
const PREFIX='acro:reddit:v2:';
const gameKey=PREFIX+'game';
const hqKey=PREFIX+'headquarters';
const postKey=(id:string)=>PREFIX+'post:'+id;
type PostRole={kind:'hq'|'challenge';challengeId?:number};
const getPostId=()=>{if(!context.postId)throw Error('Open Acro Arena in its Reddit post.');return context.postId};
const getUser=async()=>{const u=await reddit.getCurrentUsername();if(!u)throw Error('Sign in to Reddit.');return u.toLowerCase()};
const readGame=async():Promise<Game>=>{const v=await redis.get(gameKey);if(!v)throw Error('Create Acro Arena Headquarters from the subreddit menu first.');return JSON.parse(v) as Game};
const saveGame=async(g:Game)=>redis.set(gameKey,JSON.stringify(g));
const readPost=async(id:string):Promise<PostRole>=>{const value=await redis.get(postKey(id));if(!value)throw Error('This is an older Acro Arena preview post. Open the Headquarters or a new challenge post.');return JSON.parse(value) as PostRole};
const ensureHost=(g:Game,u:string)=>{if(!g.hosts.includes(u))throw Error('Only an Arena Host can do that.')};
const error=(e:unknown)=>e instanceof Error?e.message:'Unexpected error.';
const num=(v:unknown)=>{const n=Number(v);if(!Number.isInteger(n)||n<1)throw Error('Invalid challenge or entry ID.');return n};
const ai=(v:unknown):AiMode=>v==='ok'?'ok':'free';
const url=(id:string)=>'https://www.reddit.com/r/'+context.subredditName+'/comments/'+id+'/';
const publish=async(g:Game,theme:string,mode:AiMode,by:string)=>{
 // Create the game record only after Reddit accepts the new custom post.
 const next=g.nextId;
 if(!availableSlots(g).length)throw Error('A challenge is already active. Finish or dismiss it first.');
 const post=await reddit.submitCustomPost({title:'🎙️ Acro Arena #'+next+' · '+theme.slice(0,75)});
 const b=start(g,theme,mode);
 b.postId=post.id;
 await redis.set(postKey(post.id),JSON.stringify({kind:'challenge',challengeId:b.id} satisfies PostRole));
 await saveGame(g);
 return {board:b,url:url(post.id)};
};
const snapshot=(g:Game,user:string,role:PostRole)=>{
 const isHost=g.hosts.includes(user);
 const hq=g.hosts[0]??'';
 return {game:g,me:user,isHost,kind:role.kind,challengeId:role.challengeId??null,hqUrl:hq,headquartersId:undefined,active:active(g),leaderboard:leaderboard(g),slots:availableSlots(g)};
};

app.post('/internal/menu/create',async c=>{
 try{
  const existing=await redis.get(hqKey);
  if(existing)return c.json<UiResponse>({navigateTo:url(existing)});
  const user=await getUser();
  const post=await reddit.submitCustomPost({title:'📌 Acro Arena Headquarters · Rules, leaderboard and hosts'});
  await redis.set(postKey(post.id),JSON.stringify({kind:'hq'} satisfies PostRole));
  await saveGame(createGame(user));
  await redis.set(hqKey,post.id);
  return c.json<UiResponse>({navigateTo:url(post.id)});
 }catch(e){console.error('Create HQ failed',e);return c.json<UiResponse>({showToast:error(e)},400)}
});

app.get('/api/game',async c=>{
 try{
  const user=await getUser(),id=getPostId(),role=await readPost(id),g=await readGame();
  const updates=advance(g);
  if(updates)await saveGame(g);
  return c.json({...snapshot(g,user,role),headquartersUrl:url((await redis.get(hqKey))??id)});
 }catch(e){return c.json({error:error(e)},400)}
});

app.post('/api/action',async c=>{
 try{
  const user=await getUser(),id=getPostId(),role=await readPost(id),g=await readGame();
  const data=await c.req.json() as Record<string,unknown>;
  advance(g);
  const op=String(data.op??'');
  const board=()=>{if(role.kind!=='challenge')throw Error('Open the challenge post to play.');return boardById(g,role.challengeId!)};
  let message='Saved.',navigate:string|undefined;
  if(op==='start'){
   if(role.kind!=='hq')throw Error('Start challenges from Headquarters.');
   ensureHost(g,user);
   const r=await publish(g,String(data.theme??'').trim(),ai(data.ai),user);
   navigate=r.url;message='Challenge #'+r.board.id+' published as a new Reddit post.';
  }else if(op==='entry'){
   const b=board(),result=enter(b,user,String(data.answer??''));
   if(result.isNew){g.scores[user]=(g.scores[user]??0)+1;g.ledger.push(b.id+':entry:'+user)}
   message=result.isNew?'Entry accepted (+1).':'Answer updated.';
  }else if(op==='vote'){
   const b=board();vote(b,user,num(data.first),data.second?num(data.second):undefined);
   message='Vote saved; you may change it before closing.';
  }else if(op==='endorse'){
   const b=board(),entryId=num(data.entryId),e=b.entries.find(x=>x.id===entryId);
   const prev=e?.onThemeBy.includes(user)??false;
   endorse(b,user,entryId);
   g.scores[e!.user]=(g.scores[e!.user]??0)+(prev?-5:5);
   message=prev?'On Theme endorsement withdrawn.':'On Theme endorsement added (+5).';
  }else if(op==='comment'){
   comment(board(),user,String(data.body??''));message='Discussion reply posted.';
  }else if(op==='finish'){
   ensureHost(g,user);const b=board();finish(g,b);
   message=b.winner?'Winner: u/'+b.winner+'. Player’s Choice unlocked.':'Challenge finished in a tie or without votes.';
  }else if(op==='dismiss'){
   ensureHost(g,user);dismiss(board());message='Challenge dismissed without declaring a winner.';
  }else if(op==='choice'){
   const b=board();
   if(b.phase!=='choice'||b.winner!==user)throw Error('Only this challenge’s winner can choose.');
   if(b.choiceDeadline&&Date.now()>b.choiceDeadline)throw Error('Player’s Choice expired.');
   // The winner decides the new theme and AI rule; the new challenge gets a new Reddit post.
   b.phase='done';
   const r=await publish(g,String(data.theme??'').trim(),ai(data.ai),user);
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
 try{const g=await readGame(),n=advance(g);if(n)await saveGame(g);return c.json({changed:n})}
 catch(e){return c.json({error:error(e)},500)}
});

serve({fetch:app.fetch,createServer,port:getServerPort()});
