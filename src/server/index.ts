import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, context, reddit, redis } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { active, advance, aiLabel, availableSlots, boardById, chooseNext, comment, createGame, dismiss, endorse, enter, finish, leaderboard, start, tally, vote, type Game, type AiMode } from '../shared/arena';

const app=new Hono();
const key=(post:string)=>`acro:reddit:v1:${post}`;
const registry='acro:reddit:v1:posts';
const read=async(post:string):Promise<Game>=>{const data=await redis.get(key(post));if(!data)throw Error('Game not initialized. Create an Acro Arena post first.');return JSON.parse(data) as Game};
const save=async(post:string,g:Game)=>{await redis.set(key(post),JSON.stringify(g))};
const identity=async()=>{const name=await reddit.getCurrentUsername();if(!name)throw Error('Sign in to Reddit.');return name.toLowerCase()};
const postId=()=>{if(!context.postId)throw Error('Open Acro Arena inside its Reddit post.');return context.postId};
const host=(g:Game,user:string)=>{if(!g.hosts.includes(user))throw Error('Only an Arena Host can perform that action.')};
const aiMode=(v:unknown):AiMode=>v==='ok'?'ok':'free';
const number=(v:unknown)=>{const n=Number(v);if(!Number.isInteger(n)||n<1)throw Error('Invalid number.');return n};
const error=(e:unknown)=>e instanceof Error?e.message:'Unexpected error.';

app.post('/internal/menu/create',async c=>{
 try{
  const username=await identity();
  const post=await reddit.submitCustomPost({title:'🎙️ Acro Arena · Play the acronym game'});
  const g=createGame(username);
  await save(post.id,g);
  const ids=JSON.parse((await redis.get(registry))??'[]') as string[];
  if(!ids.includes(post.id)){ids.push(post.id);await redis.set(registry,JSON.stringify(ids));}
  return c.json<UiResponse>({navigateTo:`https://reddit.com/r/${context.subredditName}/comments/${post.id}`});
 }catch(e){console.error(e);return c.json<UiResponse>({showToast:error(e)},400)}
});

app.get('/api/game',async c=>{
 try{const user=await identity(),g=await read(postId());
  advance(g);await save(postId(),g);
  return c.json({game:g,me:user,isHost:g.hosts.includes(user),active:active(g),leaderboard:leaderboard(g),slots:availableSlots(g)});
 }catch(e){return c.json({error:error(e)},400)}
});

app.post('/api/action',async c=>{
 try{
  const user=await identity(),post=postId(),g=await read(post),data=await c.req.json() as Record<string,unknown>;
  advance(g);
  const op=String(data.op??'');let message='Saved.';
  if(op==='start'){
   host(g,user);const theme=String(data.theme??'').trim();
   const b=start(g,theme,aiMode(data.ai));message=`Challenge #${b.id} started: ${aiLabel(b.ai)}`;
  }else if(op==='entry'){
   const b=boardById(g,number(data.id)),result=enter(b,user,String(data.answer??''));
   if(result.isNew){g.scores[user]=(g.scores[user]??0)+1;g.ledger.push(`${b.id}:entry:${user}`);}
   message=result.isNew?'Entry accepted (+1).':'Answer updated.';
  }else if(op==='vote'){
   const b=boardById(g,number(data.id));vote(b,user,number(data.first),data.second?number(data.second):undefined);message='Vote saved; you may change it until the challenge closes.';
  }else if(op==='endorse'){
   const b=boardById(g,number(data.id)),entryId=number(data.entryId);
   const previous=b.entries.find(e=>e.id===entryId)?.onThemeBy.includes(user)??false;
   endorse(b,user,entryId);
   const author=b.entries.find(e=>e.id===entryId)!.user;
   g.scores[author]=(g.scores[author]??0)+(previous?-5:5);
   message=previous?'On Theme endorsement withdrawn.':'On Theme endorsement added (+5 for author).';
  }else if(op==='comment'){
   comment(boardById(g,number(data.id)),user,String(data.body??''));message='Discussion reply posted.';
  }else if(op==='finish'){
   host(g,user);const b=boardById(g,number(data.id));finish(g,b);message=b.winner?`Winner: u/${b.winner}. Player’s Choice unlocked.`:'Challenge finished in a tie or without votes.';
  }else if(op==='dismiss'){
   host(g,user);dismiss(boardById(g,number(data.id)));message='Challenge dismissed without choosing a winner.';
  }else if(op==='choice'){
   const b=boardById(g,number(data.id));const next=chooseNext(g,b,user,String(data.theme??''),aiMode(data.ai));message=`Player’s Choice started Challenge #${next.id}.`;
  }else if(op==='host_add'){
   host(g,user);const candidate=String(data.username??'').toLowerCase().replace(/^u\//,'').trim();
   if(!/^[a-z0-9_-]{3,20}$/.test(candidate))throw Error('Invalid Reddit username.');
   if(!g.hosts.includes(candidate))g.hosts.push(candidate);message=`u/${candidate} is an Arena Host.`;
  }else throw Error('Unknown action.');
  await save(post,g);return c.json({ok:true,message,game:g,me:user,isHost:g.hosts.includes(user),active:active(g),leaderboard:leaderboard(g),slots:availableSlots(g)});
 }catch(e){return c.json({error:error(e)},400)}
});

app.post('/internal/scheduler/tick',async c=>{
 let changed=0;const ids=JSON.parse((await redis.get(registry))??'[]') as string[];
 for(const id of ids){try{const g=await read(id);const n=advance(g);if(n){await save(id,g);changed+=n}}catch(e){console.error('Acro timer error',id,e)}}
 return c.json({checked:ids.length,changed});
});

serve({fetch:app.fetch,createServer,port:getServerPort()});