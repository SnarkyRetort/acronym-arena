import React,{useEffect,useState} from 'react';
import{createRoot}from'react-dom/client';
import {navigateTo} from '@devvit/web/client';
import type{Board,Game,AiMode,ChallengeKind}from'../shared/arena';
import{aiLabel,tally,rankedChallenges,themeRanking}from'../shared/arena';
import './style.css';
const arenaBanner=new URL('./acro_arena_banner.jpg',import.meta.url).href;

type State={game:Game;me:string;isHost:boolean;kind:'hq'|'challenge';challengeId:number|null;headquartersUrl:string;slots:number[];winnerSlots:number[];participation:number;leaderboard:{user:string;points:number}[]};
const api=async(op?:Record<string,unknown>):Promise<State & {message?:string;navigate?:string}>=>{
 const r=await fetch(op?'/api/action':'/api/game',op?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op)}:undefined);
 const data=await r.json();if(!r.ok)throw Error(data.error??'Could not load Acro Arena.');return data;
};
const asTime=(t:number)=>new Date(t).toLocaleString();
const GIF_CHOICES=[
 {name:'Applause',tags:'clap bravo congratulations',id:'l3q2XhfQ8oCkm1Ts'},
 {name:'Laughing',tags:'lol laughing funny',id:'10JhviFuU2gWD6'},
 {name:'Thumbs up',tags:'yes approved good',id:'3o7abGQa0aRJUurpII'},
 {name:'Facepalm',tags:'oops fail facepalm',id:'3og0INyCmHlNylks9O'},
 {name:'Nope',tags:'no not happening',id:'spfi6nabVuq5y'},
 {name:'Mind blown',tags:'wow shock surprised',id:'26ufdipQqU2lhNA4g'},
 {name:'Excited',tags:'happy excited dance',id:'artj92V8o75VPL7AeQ'},
 {name:'Popcorn',tags:'watching popcorn drama',id:'pUeXcg80cO8I8'}
];
const gifSource=(id:string)=>'https://i.giphy.com/media/'+id+'/giphy.gif';
const closesIn=(deadline:number)=>{
 const ms=deadline-Date.now();
 if(ms<=0)return 'Closing / complete';
 const hrs=Math.ceil(ms/3600000);
 return hrs>=24?Math.ceil(hrs/24)+' days':hrs+' hours';
};
function App(){
 const[s,setS]=useState<State|null>(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[focus,setFocus]=useState<number|null>(null),[mode,setMode]=useState<'play'|'discussion'|'results'|'best'|'on-theme'>('play');
 const[durationHours,setDurationHours]=useState<1|4|8|24>(24),[choiceWindowHours,setChoiceWindowHours]=useState<1|4|8|24>(1);const[publishError,setPublishError]=useState(''),[nsfw,setNsfw]=useState(false),[hostKind,setHostKind]=useState<ChallengeKind>('regular');const[editing,setEditing]=useState(false);const[answer,setAnswer]=useState(''),[theme,setTheme]=useState(''),[ai,setAi]=useState<AiMode>('free'),[reply,setReply]=useState(''),[first,setFirst]=useState(''),[hostName,setHostName]=useState('');
 const[showGifs,setShowGifs]=useState(false),[gifSearch,setGifSearch]=useState(''),[gifUrl,setGifUrl]=useState('');
 const load=async()=>{try{setS(await api())}catch(e){setMsg(String(e))}};
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer)},[]);
 const act=async(op:Record<string,unknown>)=>{setBusy(true);if(op.op==='start')setPublishError('');try{const result=await api(op);setS(result);setMsg(result.message??'Saved.');if(result.navigate){try{navigateTo(result.navigate)}catch(e){setMsg('Challenge published. Open the new challenge from Headquarters.')}}}catch(e){const message=String(e instanceof Error?e.message:e);setMsg(message);if(op.op==='start')setPublishError(message)}finally{setBusy(false)}};
 const board=s?.kind==='challenge'?s.game.boards.find(b=>b.id===s.challengeId):undefined;
 const picked=board?.entries.find(e=>e.user===s?.me);
 const others=board?.entries.filter(e=>e.user!==s?.me)??[];
 const votingReady=(new Set(board?.entries.map(e=>e.user)??[]).size>=2);
 const myVote=board?.votes.find(v=>v.user===s?.me);
 const openBoard=(b:Board)=>{setFocus(b.id);setMode('play');setAnswer(b.entries.find(e=>e.user===s?.me)?.answer??'');setFirst(String(b.votes.find(v=>v.user===s?.me)?.first??''));setTheme('');setAi(b.ai)};
 useEffect(()=>{if(board){setAnswer(board.entries.find(e=>e.user===s?.me)?.answer??'');const saved=board.votes.find(v=>v.user===s?.me);setFirst(String(saved?.first??''));}},[board?.id,s?.me]);
 const style=(phase:Board['phase'])=>phase==='open'?'LIVE':phase==='choice'?'PLAYER’S CHOICE':phase==='dismissed'?'DISMISSED':'COMPLETE';
 return <main className={s?.kind==='challenge'?'challenge-page':'hq-page'}><header className="arena-header"><img src={arenaBanner} alt="ACRO ARENA — vintage microphone, gold laurels, crown and letter dice on a purple and black banner" className="arena-banner"/><p className="arena-edition">{s?.kind==='challenge'?'CHALLENGE #'+(s.challengeId??'')+' · REDDIT EDITION':'HEADQUARTERS · REDDIT EDITION'} · v4.0.0-alpha.3</p></header>
 {msg&&<div className="notice" role="status"><span>✦ {msg}</span><button aria-label="Dismiss notification" onClick={()=>setMsg('')}>×</button></div>}
 {!s?<div className="panel">Connecting to the arena…</div>:<>
 {s.kind==='hq'?<nav>
 <button onClick={()=>setMode('play')}>🏠 HQ</button>
 <button onClick={()=>setMode('results')}>🏆 Leaderboard</button>
 <button onClick={()=>navigateTo('https://www.reddit.com/r/acro_arena_dev/new/')}>🆕 New</button>
 <button onClick={()=>navigateTo('https://www.reddit.com/r/acro_arena_dev/hot/')}>🔥 Hot</button>
 <button onClick={()=>setMode('best')}>⭐ Best</button>
 <button onClick={()=>setMode('on-theme')}>🎯 On Theme</button>
 <button className="primary" onClick={()=>setMode('discussion')}>🎮 Create Challenge</button>
 </nav>:<nav className="challenge-nav" aria-label="Arena navigation"><button className="arena-home-button" title="Return to Acro Arena home" onClick={()=>navigateTo(s.headquartersUrl)}>⌂ <span>Home</span></button><span className="challenge-nav-title">✦ ACRO ARENA <small>CHALLENGE #{s.challengeId}</small></span><span className="challenge-nav-gem" aria-hidden="true">✦</span></nav>}
 {s.kind==='hq'&&mode==='results'?<section className="panel"><h2>🏆 Leaderboard</h2>{s.leaderboard.length?s.leaderboard.map((e,i)=><p key={e.user}>{i+1}. u/{e.user} — {e.points} points</p>):<p>No scores yet.</p>}</section>:null}

 {s.kind==='hq'&&mode==='play'&&<section className="panel hq-dashboard">
  <div className="promo-strip"><span>👥 PLAYER HOSTING</span><span>🏆 WINNER'S CHOICE</span><span>🔞 NSFW OPTION</span></div>
  <h2>🎙️ Welcome to the Arena</h2>
  <p>Every signed-in player can host a challenge. Each challenge is a separate Reddit post.</p>
  <div className="hq-status-grid">
   <div className="slot-card"><h3>🎮 Regular Host</h3><strong>{(s.isHost?5:1)-s.slots.length}/{s.isHost?5:1} ACTIVE · {s.slots.length?'ROOM AVAILABLE':'FULL'}</strong><p>{s.isHost?'Arena moderators can run five regular challenges simultaneously.':'One live regular challenge at a time.'}</p></div>
   <div className="slot-card"><h3>🏆 Winner's Choice</h3><strong>{s.winnerSlots.length?'AVAILABLE':s.game.winnerTokens?.[s.me]?'ACTIVE':'NOT EARNED'}</strong><p>Win a challenge to unlock one bonus host slot. No stacking.</p></div>
  </div>
  <p className="arena-progress">📊 Engagement: <strong>{s.participation} challenges played, voted in, or hosted</strong> · More rewards under consideration</p>
  <button className="primary" onClick={()=>setMode('discussion')}>＋ Create Challenge</button>
  <h3>Live challenges</h3>
  {s.game.boards.filter(b=>b.phase==='open'&&b.postId).map(b=><p key={b.id} className="hq-ranking"><button onClick={()=>navigateTo('https://www.reddit.com/r/acro_arena_dev/comments/'+b.postId+'/')}>#{b.id} · {b.letters.split('').join(' · ')} · {b.theme} · u/{b.host??'host'} {b.nsfw?'🔞':''}</button></p>)}
  {!s.game.boards.some(b=>b.phase==='open'&&b.postId)&&<p>No live challenges. Start one!</p>}
 </section>}
 {s.kind==='hq'&&mode==='discussion'&&<section className="panel create-panel"><h2>🎮 Create a Challenge</h2>
 <p>Your challenge gets its own Reddit post, hosted by you.</p>
 <div className="hosting-modes">
  <button className={hostKind==='regular'?'selected':''} onClick={()=>setHostKind('regular')}>🎮 Regular · {s.slots.length?`${s.slots.length} slot${s.slots.length===1?'':'s'} free`:'All slots full'}</button>
  <button className={hostKind==='winner'?'selected':''} onClick={()=>setHostKind('winner')}>🏆 Winner's Choice · {s.winnerSlots.length?'Available':'Locked'}</button>
 </div>
 <label>Challenge category / theme<input placeholder="Theme (e.g., Things aliens find confusing)" value={theme} maxLength={100} onChange={e=>setTheme(e.target.value)}/></label>
 <div className="options">{s.game.themes.slice(0,5).map(t=><button key={t} onClick={()=>setTheme(t)}>{t}</button>)}</div>
 <div className="timer-settings"><label>⏱ Challenge duration<select value={durationHours} onChange={e=>setDurationHours(Number(e.target.value) as 1|4|8|24)}><option value={1}>1 hour · Quick</option><option value={4}>4 hours · Casual</option><option value={8}>8 hours · Extended</option><option value={24}>24 hours · Daily (default)</option></select></label><label>🏆 Winner’s Choice window<select value={choiceWindowHours} onChange={e=>setChoiceWindowHours(Number(e.target.value) as 1|4|8|24)}><option value={1}>1 hour (default)</option><option value={4}>4 hours</option><option value={8}>8 hours</option><option value={24}>24 hours</option></select></label></div>
 <div className="create-toggles"><label className="create-toggle"><input type="checkbox" checked={nsfw} onChange={e=>setNsfw(e.target.checked)}/> 🔞 NSFW / 18+ <small>Marks the Reddit post NSFW</small></label>
 <label className="create-toggle"><input type="checkbox" checked={ai==='ok'} onChange={e=>setAi(e.target.checked?'ok':'free')}/> 🤖 AI OK <small>{ai==='ok'?'AI answers permitted':'AI FREE · Honor system'}</small></label></div>
 {hostKind==='winner'&&!s.winnerSlots.length&&<p className="hint">You need an unused Winner's Choice reward and no active Winner's Choice challenge.</p>}
 {hostKind==='regular'&&!s.slots.length&&<p className="hint">All your regular hosting slots are occupied. Finish or dismiss a challenge first.</p>}
 <button className="primary create-submit" disabled={busy||!theme.trim()||!(hostKind==='winner'?s.winnerSlots.length:s.slots.length)} onClick={()=>act({op:'start',theme,ai,kind:hostKind,nsfw,durationHours,choiceWindowHours})}>{busy?'Publishing challenge…':'Publish Challenge Post'}</button>
 {publishError&&<p className="notice" role="alert">⚠ {publishError}</p>}
 {s.isHost&&<details className="moderator-tools"><summary>Moderator tools</summary><h3>Grant Arena Moderator</h3><input placeholder="Reddit username" value={hostName} onChange={e=>setHostName(e.target.value)}/><button disabled={busy||!hostName.trim()} onClick={()=>act({op:'host_add',username:hostName})}>Add moderator</button></details>}
 </section>}

 {s.kind==='hq'&&(mode==='best'||mode==='on-theme')?<section className="panel"><h2>{mode==='best'?'⭐ Best answers':'🎯 Most On Theme'}</h2><p className="hint">{mode==='best'?'Challenges ranked by in-game votes, not Reddit upvotes.':'Challenges ranked by On Theme endorsements.'}</p>
 {rankedChallenges(s.game,mode).map(b=><p className="hq-ranking" key={b.id}><button onClick={()=>navigateTo('https://www.reddit.com/r/acro_arena_dev/comments/'+b.postId+'/')}>Challenge #{b.id} · {b.letters.split('').join(' · ')} · {b.theme} ({b.score})</button></p>)}
 {!rankedChallenges(s.game,mode).length&&<p>No rankings yet. Entries need votes or On Theme endorsements.</p>}
 </section>:null}
 {board&&<section className="panel challenge-panel">
 <div className="challenge-hero">
  <div className="ribbon"><span>ACRO ARENA · CHALLENGE #{board.id}</span><span className="live-flag">{board.nsfw?'🔞 ':''}{style(board.phase)}</span></div>
  <h2 className="letters">{board.letters.split('').join(' · ')}</h2>
  <h3 className="challenge-theme">{board.theme}</h3><p className="challenge-host">Hosted by u/{board.host??'arena'} · {board.kind==='winner'?"🏆 Winner's Choice":"🎮 Community Challenge"}</p>
 </div>
 <div className="arena-status">
  <span className="status-label"><i className="status-dot" aria-hidden="true"></i>{board.phase==='open'?'ENTRIES + VOTING OPEN':style(board.phase)}</span>
  <span>♟ {board.entries.length} {board.entries.length===1?'entry':'entries'}</span>
  <span>▣ {board.votes.length} {board.votes.length===1?'ballot':'ballots'}</span>
  <span className="status-time">◷ {closesIn(board.deadline)} · {board.durationHours??24}h game</span>
 </div>
 <p className="challenge-ai">{aiLabel(board.ai)}</p>
 <div className="tabs" role="group" aria-label="Challenge sections">
 <button onClick={()=>setMode('play')} className={mode==='play'?'selected':''}>Play</button>
 <button onClick={()=>setMode('discussion')} className={mode==='discussion'?'selected':''}>Discussion ({board.discussion.length})</button>
 <button onClick={()=>setMode('results')} className={mode==='results'?'selected':''}>Results</button>
 </div>

 {mode==='play'&&<>
 <div className="play-entry-first">
  <section className="player-widget" aria-label="Your entry">
    <h3 className="player-widget-heading"><span aria-hidden="true">✎</span> YOUR ENTRY</h3>
    <div className={picked?'widget-state widget-success':'widget-state'}>
      <strong>{picked?'✓ You’re entered.':'Your entry is waiting.'}</strong>
      <span>{picked?'Your answer is saved. You can edit it until the round closes.':'Enter one word for each letter to join this challenge.'}</span>
    </div>
    {picked&&!editing?<><div className="saved-answer">{picked.answer}</div><button className="primary widget-button" disabled={board.phase!=='open'} onClick={()=>setEditing(true)}>✎ Edit Answer</button></>:<>
      <textarea disabled={board.phase!=='open'} maxLength={200} value={answer} placeholder="Your acronym expansion…" onChange={e=>setAnswer(e.target.value)} aria-label="Your acronym answer"/>
      <button className="primary widget-button" disabled={busy||board.phase!=='open'||!answer.trim()} onClick={async()=>{await act({op:'entry',id:board.id,answer});setEditing(false)}}>{picked?'Save Changes':'Submit Answer'}</button>
      {picked&&<button className="text-button" onClick={()=>{setAnswer(picked.answer);setEditing(false)}}>Cancel</button>}
    </>}
  </section>
 </div>
 <div className="answers-section">
 <h3 className="answer-heading">PLAYER ANSWERS ({board.entries.length})</h3>
 <p className="hint rules-hint">One vote per player (+1 to the answer) · On Theme counts toward the Theme Leader achievement · No self-votes</p>
 {board.entries.length===0&&<p className="empty-answers">No entries yet. Be the first to answer.</p>}
 <div className="answer-list">
 {board.entries.map((e,i)=><article className="answer-card" key={e.id}>
 <div className="answer-number">{i+1}</div>
 <div className="answer-main">
 <div className="answer-identity"><small>u/{e.user}{e.user===s.me?' · you':''}</small><strong>{e.answer}</strong></div>
 {e.user!==s.me&&<div className="answer-actions">
 <button type="button" className={first===String(e.id)?'selected':''} disabled={busy||board.phase!=='open'||!votingReady} aria-pressed={first===String(e.id)} onClick={()=>setFirst(String(e.id))}>{first===String(e.id)?'✓ Selected':'☆ Vote'}</button>
 <button type="button" className={e.onThemeBy.includes(s.me)?'selected':''} disabled={busy||board.phase!=='open'} aria-pressed={e.onThemeBy.includes(s.me)} onClick={()=>act({op:'endorse',id:board.id,entryId:e.id})}>{e.onThemeBy.includes(s.me)?'✓ On Theme':'🎯 On Theme'} ({e.onThemeBy.length})</button>
 </div>}
 {e.user===s.me&&<small className="hint own-entry-note">Your answer · other players can vote on it</small>}
 </div></article>)}
 </div></div>
 <div className="play-ballot-last">
  <section className="player-widget" aria-label="Your ballot">
    <h3 className="player-widget-heading"><span aria-hidden="true">▣</span> YOUR BALLOT</h3>
    <div className={myVote?'widget-state widget-success':'widget-state'}>
      <strong>{myVote?'✓ Vote saved.':votingReady?'Choose one answer.':'Voting opens at 2 entries.'}</strong>
      <span>{myVote?'You can change your vote until the round closes.':votingReady?'Choose your favorites above, then save your ballot.':'We need answers from two different players.'}</span>
    </div>
    <div className="ballot-choices"><div><b>Your vote</b><span>{first?board.entries.find(e=>String(e.id)===first)?.answer??'—':'Not selected'}</span></div><div><b>Theme Leader</b><span>{board.entries.filter(e=>e.user!==s.me&&e.onThemeBy.includes(s.me)).length} endorsed</span></div></div>
    <button className="primary widget-button" disabled={busy||board.phase!=='open'||!votingReady||!first} onClick={()=>act({op:'vote',id:board.id,first:Number(first)})}>{myVote?'↻ Update Vote':'✓ Save Vote'}</button>
  </section>
 </div>
 </>}
 {mode==='discussion'&&<section className="arena-discussion">
 <h3>Challenge discussion</h3>
 {board.discussion.length?board.discussion.map(m=><article className="comment" key={m.id}>
  <b>u/{m.user}</b> <small>{asTime(m.created)}</small>
  {m.body&&<span>{m.body}</span>}
  {m.gifUrl&&<img className="comment-gif" src={m.gifUrl} alt="Animated GIF posted in discussion" loading="lazy" />}
 </article>):<p>Be the first to start the conversation.</p>}
 <textarea disabled={board.archived||busy} value={reply} maxLength={500} placeholder="Talk trash, politely…" onChange={e=>setReply(e.target.value)} aria-label="Write a discussion reply"/>
 <div className="discussion-toolbar">
  <button type="button" disabled={board.archived||busy} aria-expanded={showGifs} onClick={()=>setShowGifs(v=>!v)}>🎞 GIF {showGifs?'▴':'▾'}</button>
  <button className="primary" disabled={busy||board.archived||(!reply.trim()&&!gifUrl.trim())} onClick={async()=>{await act({op:'comment',id:board.id,body:reply,gifUrl});setReply('');setGifUrl('');setShowGifs(false)}}>Reply</button>
 </div>
 {showGifs&&!board.archived&&<div className="gif-picker">
  <label htmlFor="gif-filter">Find a reaction GIF</label>
  <input id="gif-filter" value={gifSearch} placeholder="Search reactions (laugh, no, wow…)" onChange={e=>setGifSearch(e.target.value)}/>
  <div className="gif-choices">{GIF_CHOICES.filter(g=>(g.name+' '+g.tags).toLowerCase().includes(gifSearch.trim().toLowerCase())).map(g=><button type="button" key={g.id} onClick={()=>{setGifUrl(gifSource(g.id));setShowGifs(false)}}>{g.name}</button>)}{!GIF_CHOICES.some(g=>(g.name+' '+g.tags).toLowerCase().includes(gifSearch.trim().toLowerCase()))&&<span>No preset matches. Paste a GIPHY link below.</span>}</div>
  <label htmlFor="gif-link">Or paste a GIPHY GIF link</label>
  <input id="gif-link" type="url" placeholder="https://giphy.com/gifs/..." value={gifUrl} onChange={e=>setGifUrl(e.target.value)} />
  <small>GIFs are uploaded to Reddit when you reply. Search covers built-in reactions; a full GIPHY search requires an API key.</small>
 </div>}
 {gifUrl&&<div className="selected-gif"><span>🎞 GIF attached</span><small>{gifUrl}</small><button type="button" onClick={()=>setGifUrl('')} aria-label="Remove selected GIF">Remove</button></div>}
 {board.archived&&<p className="hint">Archived discussion · read-only</p>}
 </section>}
 {mode==='results'&&<><h3>🏆 Current standings</h3><p className="hint results-help">One vote per player · 🎯 On Theme is a separate achievement, not bonus points</p><div className="results-list">{tally(board).slice(0,20).map((r,i)=><div className="result-row" key={r.entry.id}><div className="result-rank">#{i+1}</div><div className="result-entry"><strong>{r.entry.answer}</strong><small>u/{r.entry.user}</small></div><div className="result-metrics"><span className="result-votes">★ {r.votes} {r.votes===1?'vote':'votes'}</span><span className="result-theme">🎯 {r.entry.onThemeBy.length} On Theme</span>{board.themeLeader===r.entry.user&&<span className="result-leader">🏅 Theme Leader</span>}</div></div>)}</div>{board.entries.length>20&&<p className="hint">Showing top 20 of {board.entries.length} answers.</p>}{board.winner&&<p>🏆 Winner: u/{board.winner}</p>}{board.winner===s.me&&s.game.winnerTokens?.[s.me]&&<div className="panel"><h3>🏆 Winner’s Choice unlocked!</h3><p>Your bonus hosting slot is ready in Headquarters. Claim it before {board.choiceDeadline?asTime(board.choiceDeadline):'the reward expires'}.</p><button className="primary" onClick={()=>navigateTo(s.headquartersUrl)}>Open Headquarters</button></div>}</>}
 {(s.isHost||board.host===s.me)&&board.phase==='open'&&<div className="hostactions"><button disabled={busy} onClick={()=>{if(confirm('Finish and award scores now?'))void act({op:'finish',id:board.id})}}>Host: Finish early</button><button disabled={busy} onClick={()=>{if(confirm('Dismiss without a winner?'))void act({op:'dismiss',id:board.id})}}>Host: Dismiss</button></div>}</section>}
 </>}
 <footer>Acro Arena · Headquarters controls · Separate challenge posts</footer></main>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);