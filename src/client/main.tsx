import React,{useEffect,useState} from 'react';
import{createRoot}from'react-dom/client';
import {navigateTo} from '@devvit/web/client';
import type{Board,Game,AiMode,ChallengeKind}from'../shared/arena';
import{aiLabel,tally,rankedChallenges,leaderboardStats,drawThemeChoices}from'../shared/arena';
import './style.css';
const arenaBanner=new URL('./acro_arena_banner.jpg',import.meta.url).href;

type State={game:Game;me:string;isHost:boolean;kind:'hq'|'challenge';challengeId:number|null;headquartersUrl:string;slots:number[];winnerSlots:number[];participation:number;leaderboard:{user:string;points:number}[]};
const api=async(op?:Record<string,unknown>):Promise<State & {message?:string;navigate?:string}>=>{
 const r=await fetch(op?'/api/action':'/api/game',op?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op)}:undefined);
 const data=await r.json();if(!r.ok)throw Error(data.error??'Could not load Acro Arena.');return data;
};
const asTime=(t:number)=>new Date(t).toLocaleString();
const closesIn=(deadline:number)=>{
 const ms=deadline-Date.now();
 if(ms<=0)return 'Closing / complete';
 const minutes=Math.ceil(ms/60000);
 if(minutes<60)return minutes+' min remaining';
 const hrs=Math.ceil(ms/3600000);
 return hrs>=24?Math.ceil(hrs/24)+' days':hrs+' hours';
};
function App(){
 const[s,setS]=useState<State|null>(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[focus,setFocus]=useState<number|null>(null),[mode,setMode]=useState<'play'|'discussion'|'results'|'best'|'on-theme'>('play');
 const[letterCount,setLetterCount]=useState<3|4|5|6|7|8>(4);const[durationHours,setDurationHours]=useState<1|4|8|24>(24),[choiceWindowHours,setChoiceWindowHours]=useState<1|4|8|24>(1);const[publishError,setPublishError]=useState(''),[nsfw,setNsfw]=useState(false),[hostKind,setHostKind]=useState<ChallengeKind>('regular');const[editing,setEditing]=useState(false);const[answer,setAnswer]=useState(''),[theme,setTheme]=useState(''),[ai,setAi]=useState<AiMode>('free'),[reply,setReply]=useState(''),[first,setFirst]=useState(''),[hostName,setHostName]=useState('');
 const[themeChoices,setThemeChoices]=useState<string[]>([]);
 const load=async()=>{try{setS(await api())}catch(e){setMsg(String(e))}};
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{if(s?.game.themes?.length)setThemeChoices(drawThemeChoices(s.game.themes));},[s?.game.themes?.length]);
 const shuffleThemes=()=>{if(s){setThemeChoices(drawThemeChoices(s.game.themes,themeChoices));setTheme('');}};
 const act=async(op:Record<string,unknown>):Promise<boolean>=>{setBusy(true);if(op.op==='start')setPublishError('');try{const result=await api(op);setS(result);setMsg(result.message??'Saved.');if(result.navigate){try{navigateTo(result.navigate)}catch(e){setMsg('Challenge published. Open the new challenge from Headquarters.')}}return true;}catch(e){const message=String(e instanceof Error?e.message:e);setMsg(message);if(op.op==='start')setPublishError(message);return false;}finally{setBusy(false)}};
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
 <button className={mode==='play'?'selected':''} aria-current={mode==='play'?'page':undefined} onClick={()=>setMode('play')}>🏠 HQ</button>
 <button className={mode==='results'?'selected':''} aria-current={mode==='results'?'page':undefined} onClick={()=>setMode('results')}>🏆 Leaderboard</button>
 <button onClick={()=>navigateTo('https://www.reddit.com/r/acro_arena_dev/new/')}>🆕 New</button>
 <button onClick={()=>navigateTo('https://www.reddit.com/r/acro_arena_dev/hot/')}>🔥 Hot</button>
 <button className={mode==='best'?'selected':''} aria-current={mode==='best'?'page':undefined} onClick={()=>setMode('best')}>⭐ Best</button>
 <button className={mode==='on-theme'?'selected':''} aria-current={mode==='on-theme'?'page':undefined} onClick={()=>setMode('on-theme')}>🎯 On Theme</button>
 <button className={mode==='discussion'?'primary selected':'primary'} aria-current={mode==='discussion'?'page':undefined} onClick={()=>setMode('discussion')}>🎮 Create Challenge</button>
 </nav>:<nav className="challenge-nav" aria-label="Arena navigation"><button className="arena-home-button" title="Return to Acro Arena home" onClick={()=>navigateTo(s.headquartersUrl)}>⌂ <span>Home</span></button><span className="challenge-nav-title">✦ ACRO ARENA <small>CHALLENGE #{s.challengeId}</small></span><span className="challenge-nav-gem" aria-hidden="true">✦</span></nav>}
 {s.kind==='hq'&&mode==='results'?<section className="panel leaderboard-panel">
 <h2>🏆 Player Leaderboard</h2>
 <p className="leaderboard-rules">Activity +1 per challenge hosted, answer submitted, ballot cast, or On Theme endorsement. Discussion replies: +1 each (up to 3 per challenge). Votes received +1 each; On Theme received +1 each; outright win +25. Changes and repeated clicks don't earn extra points.</p>
 <div className="leaderboard-list">
 {leaderboardStats(s.game).map((e,i)=><article className="leaderboard-player" key={e.user}>
  <div className="leaderboard-player-head"><strong><span className="leaderboard-place">#{i+1}</span> u/{e.user}</strong><span className="leaderboard-total">{e.total} pts</span></div>
  <div className="leaderboard-score-grid">
   <div><span>Participation</span><strong>+{e.participation}</strong></div>
   <div><span>Votes earned</span><strong>+{e.votePoints}</strong></div>
   <div><span>Theme points</span><strong>+{e.themePoints}</strong></div>
   <div><span>Win bonus</span><strong>+{e.winBonus}</strong></div>
  </div>
  <div className="leaderboard-podium"><span>🥇 {e.first} first</span><span>🥈 {e.second} second</span><span>🥉 {e.third} third</span><span>🎯 {e.themeLeaderWins} Theme Leader</span></div>
  <div className="leaderboard-activity"><span>🎮 {e.hosted} hosted</span><span>✍ {e.entered} entered</span><span>🗳 {e.votesCast} votes cast</span><span>🎯 {e.onThemeGiven} endorsed</span><span>💬 {e.comments} replies scored</span></div>
 </article>)}
 {!leaderboardStats(s.game).length&&<p>No player activity yet.</p>}
 </div>
 <p className="leaderboard-note">Rankings use recorded game activity. Only finished challenges count for podium finishes; tied first places are not outright wins.</p>
 </section>:null}

 {s.kind==='hq'&&mode==='play'&&<section className="panel hq-dashboard">
  <div className="hq-faststart">
   <h2>🎮 Play a Challenge</h2>
   <p>Pick a set of letters. Write your answer. Vote for your favorite.</p>
   <div className="hq-live-list">
    {s.game.boards.filter(b=>b.phase==='open'&&b.postId).sort((a,b)=>b.id-a.id).map(b=><button key={b.id} className="hq-live-link" onClick={()=>navigateTo('https://www.reddit.com/r/acro_arena_dev/comments/'+b.postId+'/')} aria-label={'Play challenge '+b.id+': '+b.theme}>
      <strong>#{b.id} · {b.letters.split('').join(' · ')}</strong>
      <span>{b.theme}{b.nsfw?' 🔞':''}</span>
      <small>Hosted by u/{b.host??'host'} <b aria-hidden="true">↗</b></small>
      <div className="hq-live-top" aria-label="Top three answers by votes">
       {tally(b).slice(0,3).map((r,i)=><div className="hq-live-answer" key={r.entry.id}>
        <span className="hq-live-rank">{i+1}.</span>
        <span className="hq-live-answer-text">{r.entry.answer}</span>
        <span className="hq-live-answer-votes">★ {r.votes}</span>
       </div>)}
       {!b.entries.length&&<span className="hq-live-no-answers">No answers yet — be first!</span>}
      </div>
    </button>)}
    {!s.game.boards.some(b=>b.phase==='open'&&b.postId)&&<p>No live challenges yet. Start one below!</p>}
   </div>
   <button className="primary hq-create-now" onClick={()=>setMode('discussion')}>＋ Create a Challenge</button>
  </div>
  <details className="hq-host-details">
   <summary>🏆 Hosting & your progress</summary>
   <p>Every signed-in player can host a challenge. Each challenge is a separate Reddit post.</p>
   <div className="hq-status-grid">
    <div className="slot-card"><h3>🎮 Regular Host</h3><strong>{(s.isHost?5:1)-s.slots.length}/{s.isHost?5:1} ACTIVE · {s.slots.length?'ROOM AVAILABLE':'FULL'}</strong><p>{s.isHost?'Arena moderators can run five regular challenges simultaneously.':'One live regular challenge at a time.'}</p></div>
    <div className="slot-card"><h3>🏆 Winner's Choice</h3><strong>{s.winnerSlots.length?'AVAILABLE':s.game.winnerTokens?.[s.me]?'ACTIVE':'NOT EARNED'}</strong><p>Win a challenge to unlock one bonus host slot. No stacking.</p></div>
   </div>
   <p className="arena-progress">📊 Engagement: <strong>{s.participation} challenges played, voted in, or hosted</strong></p>
  </details>
 </section>}
 {s.kind==='hq'&&mode==='discussion'&&<section className="panel create-panel"><h2>🎮 Create a Challenge</h2>
 <p>Your challenge gets its own Reddit post, hosted by you.</p>
 <div className="hosting-modes">
  <button className={hostKind==='regular'?'selected':''} onClick={()=>setHostKind('regular')}>🎮 Regular · {s.slots.length?`${s.slots.length} slot${s.slots.length===1?'':'s'} free`:'All slots full'}</button>
  <button className={hostKind==='winner'?'selected':''} onClick={()=>setHostKind('winner')}>🏆 Winner's Choice · {s.winnerSlots.length?'Available':'Locked'}</button>
 </div>
 <div className="theme-picker-head"><h3>{hostKind==='winner'?'🏆 Winner’s Choice — choose your theme':'🎲 Pick a challenge theme'}</h3><span>{s.game.themes.length} themes in the bank</span></div>
 <p className="hint">{hostKind==='winner'?'Pick one of four random themes, shuffle for four new ones, or write your own.':'Pick a random theme or enter a custom one.'}</p>
 <div className="options theme-options">{(themeChoices.length?themeChoices:s.game.themes.slice(0,4)).map(t=><button type="button" className={theme===t?'selected':''} key={t} onClick={()=>setTheme(t)}>{t}</button>)}</div>
 <button type="button" className="theme-shuffle" onClick={shuffleThemes}>🔀 Shuffle 4 new themes</button>
 <label>{hostKind==='winner'?'Or write your own Winner’s Choice theme':'Custom theme'}<input placeholder="Your own theme (up to 100 characters)" value={theme} maxLength={100} onChange={e=>setTheme(e.target.value)}/></label>
 <p className="hint">Selected: <strong>{theme.trim()||'Choose or type a theme'}</strong></p>
 <div className="letter-count-select"><label>🔠 Number of Letters<select value={letterCount} onChange={e=>setLetterCount(Number(e.target.value) as 3|4|5|6|7|8)}>{[3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} letters</option>)}</select></label></div>
 <div className="timer-settings"><label>⏱ Challenge duration<select value={durationHours} onChange={e=>setDurationHours(Number(e.target.value) as 1|4|8|24)}><option value={1}>1 hour · Quick</option><option value={4}>4 hours · Casual</option><option value={8}>8 hours · Extended</option><option value={24}>24 hours · Daily (default)</option></select></label><label>🏆 Winner’s Choice window<select value={choiceWindowHours} onChange={e=>setChoiceWindowHours(Number(e.target.value) as 1|4|8|24)}><option value={1}>1 hour (default)</option><option value={4}>4 hours</option><option value={8}>8 hours</option><option value={24}>24 hours</option></select></label></div>
 <div className="create-toggles"><label className="create-toggle"><input type="checkbox" checked={nsfw} onChange={e=>setNsfw(e.target.checked)}/> 🔞 NSFW / 18+ <small>Marks the Reddit post NSFW</small></label>
 <label className="create-toggle"><input type="checkbox" checked={ai==='ok'} onChange={e=>setAi(e.target.checked?'ok':'free')}/> 🤖 AI OK <small>{ai==='ok'?'AI answers permitted':'AI FREE · Honor system'}</small></label></div>
 {hostKind==='winner'&&!s.winnerSlots.length&&<p className="hint">You need an unused Winner's Choice reward and no active Winner's Choice challenge.</p>}
 {hostKind==='regular'&&!s.slots.length&&<p className="hint">All your regular hosting slots are occupied. Finish or dismiss a challenge first.</p>}
 <button className="primary create-submit" disabled={busy||!theme.trim()||!(hostKind==='winner'?s.winnerSlots.length:s.slots.length)} onClick={()=>act({op:'start',theme,ai,kind:hostKind,nsfw,durationHours,choiceWindowHours,letterCount})}>{busy?'Publishing challenge…':'Publish Challenge Post'}</button>
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
      <button className="primary widget-button" disabled={busy||board.phase!=='open'||!answer.trim()} onClick={async()=>{if(await act({op:'entry',id:board.id,answer}))setEditing(false)}}>{picked?'Save Changes':'Submit Answer'}</button>
      {picked&&<button className="text-button" onClick={()=>{setAnswer(picked.answer);setEditing(false)}}>Cancel</button>}
    </>}
  </section>
 </div>
 <div className="answers-section">
 <h3 className="answer-heading">PLAYER ANSWERS ({board.entries.length})</h3>
 <p className="hint rules-hint">Tap Vote once to save (+1 to the answer) · On Theme earns its own achievement · No self-votes</p>
 {board.entries.length===0&&<p className="empty-answers">No entries yet. Be the first to answer.</p>}
 <div className="answer-list">
 {board.entries.map((e,i)=><article className="answer-card" key={e.id}>
 <div className="answer-number">{i+1}</div>
 <div className="answer-main">
 <div className="answer-identity"><small>u/{e.user}{e.user===s.me?' · you':''}</small><strong>{e.answer}</strong></div>
 {e.user!==s.me&&<div className="answer-actions">
 <button type="button" className={first===String(e.id)?'selected':''} disabled={busy||board.phase!=='open'||!votingReady} aria-pressed={first===String(e.id)} onClick={async()=>{const prior=first;setFirst(String(e.id));if(!await act({op:'vote',id:board.id,first:e.id}))setFirst(prior)}}>{myVote?.first===e.id?'✓ Voted':'☆ Vote'}</button>
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
      <span>{myVote?'You can change your vote until the round closes.':votingReady?'Tap Vote beside an answer to save instantly.':'We need answers from two different players.'}</span>
    </div>
    <div className="ballot-choices"><div><b>Your vote</b><span>{first?board.entries.find(e=>String(e.id)===first)?.answer??'—':'Not selected'}</span></div><div><b>Theme Leader</b><span>{board.entries.filter(e=>e.user!==s.me&&e.onThemeBy.includes(s.me)).length} endorsed</span></div></div>
    <button className="primary widget-button" disabled={busy||board.phase!=='open'||!votingReady||!first||myVote?.first===Number(first)} onClick={()=>act({op:'vote',id:board.id,first:Number(first)})}>{myVote?.first===Number(first)?'✓ Vote Saved':'✓ Save Selected Vote'}</button>
  </section>
 </div>
 </>}
 {mode==='discussion'&&<><h3>Challenge discussion</h3>{board.discussion.length?board.discussion.map(m=><p className="comment" key={m.id}><b>u/{m.user}</b> <small>{asTime(m.created)}</small><span>{m.body}</span></p>):<p>Be the first to start the conversation.</p>}<textarea disabled={board.archived} value={reply} maxLength={500} placeholder="Talk trash, politely…" onChange={e=>setReply(e.target.value)}/><button disabled={busy||board.archived||!reply.trim()} onClick={async()=>{if(await act({op:'comment',id:board.id,body:reply}))setReply('')}}>Reply</button>{board.archived&&<p className="hint">Archived discussion · read-only</p>}</>}
 {mode==='results'&&<><h3>🏆 Current standings</h3><p className="hint results-help">One vote per player · 🎯 On Theme is a separate achievement, not bonus points</p><div className="results-list">{tally(board).slice(0,20).map((r,i)=><div className="result-row" key={r.entry.id}><div className="result-rank">#{i+1}</div><div className="result-entry"><strong>{r.entry.answer}</strong><small>u/{r.entry.user}</small></div><div className="result-metrics"><span className="result-votes">★ {r.votes} {r.votes===1?'vote':'votes'}</span><span className="result-theme">🎯 {r.entry.onThemeBy.length} On Theme</span>{board.themeLeader===r.entry.user&&<span className="result-leader">🏅 Theme Leader</span>}</div></div>)}</div>{board.entries.length>20&&<p className="hint">Showing top 20 of {board.entries.length} answers.</p>}{board.winner&&<p>🏆 Winner: u/{board.winner}</p>}{board.winner===s.me&&s.game.winnerTokens?.[s.me]&&<div className="panel"><h3>🏆 Winner’s Choice unlocked!</h3><p>Your bonus hosting slot is ready in Headquarters. Claim it before {board.choiceDeadline?asTime(board.choiceDeadline):'the reward expires'}.</p><button className="primary" onClick={()=>navigateTo(s.headquartersUrl)}>Open Headquarters</button></div>}</>}
 {(s.isHost||board.host===s.me)&&board.phase==='open'&&<div className="hostactions"><button disabled={busy} onClick={()=>{if(confirm('Finish and award scores now?'))void act({op:'finish',id:board.id})}}>Host: Finish early</button><button disabled={busy} onClick={()=>{if(confirm('Dismiss without a winner?'))void act({op:'dismiss',id:board.id})}}>Host: Dismiss</button></div>}</section>}
 </>}
 <footer>Acro Arena · Headquarters controls · Separate challenge posts</footer></main>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);