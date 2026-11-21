import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {requestExpandedMode,navigateTo} from '@devvit/web/client';
import type {Board,Game,HallOfFamePlayer} from '../shared/arena';
import {aiLabel,tally,leaderboardStats} from '../shared/arena';
import './preview.css';

const banner=new URL('./acro_arena_banner.jpg',import.meta.url).href;
type PreviewState={
 kind:'hq'|'challenge';challengeId:number|null;game:Game;
 me:string;slots:number[];winnerSlots:number[];participation:number;headquartersUrl?:string;hallOfFame?:HallOfFamePlayer[]
};
const label=(phase:Board['phase'])=>phase==='voting'?'VOTING NOW':phase==='open'?'LIVE NOW':phase==='choice'?"WINNER'S CHOICE":phase==='dismissed'?'DISMISSED':'COMPLETE';
function Preview(){
 const[state,setState]=useState<PreviewState|null>(null);
 const[error,setError]=useState('');
 const liveScroll=useRef<HTMLDivElement|null>(null);
 const[panel,setPanel]=useState<'live'|'leaders'|'fame'>('live');
 const[inlineTab,setInlineTab]=useState<'enter'|'results'|null>(null);
 const[inlineAnswer,setInlineAnswer]=useState('');
 const[inlineBusy,setInlineBusy]=useState(false);
 const[inlineMessage,setInlineMessage]=useState('');
 const[inlineDraftChanged,setInlineDraftChanged]=useState(false);
 const[now,setNow]=useState(Date.now());
 useEffect(()=>{const tick=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(tick)},[]);
 useEffect(()=>{
  let mounted=true;
  const load=async()=>{
   try{
    const r=await fetch('/api/game');const json=await r.json();
    if(!r.ok)throw Error(json.error??'Could not load the Arena');
    if(mounted){setState(json as PreviewState);setError('')}
   }catch(e){if(mounted)setError(e instanceof Error?e.message:String(e))}
  };
  void load();
  const timer=setInterval(()=>void load(),15000);
  return()=>{mounted=false;clearInterval(timer)};
 },[]);
 const board=state?.kind==='challenge'?state.game.boards.find(b=>b.id===state.challengeId):undefined;
 const active=state?.game.boards.filter(b=>b.phase==='open'||b.phase==='voting')??[];
 const leaders=state?leaderboardStats(state.game).slice(0,10):[];
 const hall=state?.hallOfFame??[];
 const inlineAction=async(op:Record<string,unknown>):Promise<void>=>{
  if(inlineBusy)return;
  setInlineBusy(true);setInlineMessage('');
  try{
   const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op)});
   const payload=await response.json();
   if(!response.ok)throw Error(payload.error??'Could not save your action.');
   setState(payload as PreviewState);
   setInlineMessage(payload.message??'Saved.');
   if(op.op==='entry'){setInlineDraftChanged(false);setInlineTab(null);}
   if(op.op==='play_entry'){setInlineTab('enter');}
  }catch(err){setInlineMessage(err instanceof Error?err.message:String(err));}
  finally{setInlineBusy(false);}
 };
 const open=(event:React.MouseEvent<HTMLButtonElement>)=>{
  // Devvit requires this call during the original trusted user click.
  requestExpandedMode(event.nativeEvent,'game',{title:board?'Acro Arena · Challenge #'+board.id:'Acro Arena · Headquarters'});
 };
 if(board){
  const own=board.entries.find(e=>e.user===state?.me);
  const ballot=board.votes.find(v=>v.user===state?.me);
  const voteOnly=!!board.voteOnly?.[state?.me??''];
  const blitzPlaying=!!board.playBlitz?.[state?.me??''];
  const personalStart=board.timedEntry?board.attempts?.[state?.me??'']:undefined;
  const entryDuration=(board.entrySeconds??120)*1000;
  const attemptLeft=personalStart===undefined?0:Math.max(0,Math.ceil((personalStart+entryDuration-now)/1000));
  const attemptClock=Math.floor(attemptLeft/60)+':'+String(attemptLeft%60).padStart(2,'0');
  const votingReady=new Set(board.entries.map(e=>e.user)).size>=2;
  const acceptingAnswers=board.phase==='open'&&now<board.deadline;
  const acceptingVotes=board.kind==='blitz'?board.phase==='voting'&&now<(board.votingDeadline??0):acceptingAnswers;
  const phaseEnd=board.kind==='blitz'&&board.phase==='voting'?board.votingDeadline??board.deadline:board.deadline;
  const secondsLeft=Math.max(0,Math.ceil((phaseEnd-now)/1000));
  const remaining=Math.floor(secondsLeft/60)+':'+String(secondsLeft%60).padStart(2,'0');
  const draft=inlineDraftChanged?inlineAnswer:(own?.answer??inlineAnswer);
  const mayAnswer=acceptingAnswers&&!voteOnly&&(board.kind==='blitz'?blitzPlaying&&!own:!board.timedEntry||(personalStart!==undefined&&attemptLeft>0&&!own));
  const mayStart=acceptingAnswers&&!voteOnly&&!own&&(board.kind==='blitz'?!blitzPlaying:!!board.timedEntry&&personalStart===undefined&&now+entryDuration<=board.deadline);
  const needsChoice=(board.timedEntry||board.kind==='blitz')&&(board.phase==='open'||board.kind==='blitz'&&board.phase==='voting')&&!voteOnly&&!own&&!blitzPlaying&&personalStart===undefined;
  const awaitingEntry=!!board.timedEntry&&personalStart!==undefined&&!own&&attemptLeft>0;
  const showAnswers=!needsChoice&&!awaitingEntry&&(board.kind!=='blitz'||board.phase!=='open');
  const postUrl='https://www.reddit.com/r/acro_arena_dev/comments/'+board.postId+'/';
  const show=(panel:'enter'|'results')=>setInlineTab(current=>current===panel?null:panel);
  const rankings=showAnswers?tally(board):[];
  // Keep the inline preview bounded: Reddit requires normal feed scrolling.
  // The entire scrollable answer list lives in expanded mode.
  const visibleRankings=rankings.slice(0,2);
  const grandIntro=needsChoice&&board.entrySeconds===60&&board.kind!=='blitz';
  return <main className={grandIntro?'acro-inline acro-inline-grand':'acro-inline'} aria-label={'Acro Arena challenge '+board.id}>
   <img src={banner} alt="Acro Arena" className="acro-inline-brand"/>
   <div className="acro-inline-topline"><span>{board.kind==='blitz'?'⚡ BLITZ':'✦ CHALLENGE'} #{board.id}</span><span>{label(board.phase)}</span></div>
   {grandIntro&&<div className="acro-grand-timer">◷ 60-SECOND CHALLENGE</div>}
   {grandIntro&&<div className="acro-grand-acronym-label">✦ ACRONYM ✦</div>}
   <strong className="acro-inline-letters">{board.letters?board.letters.split('').join(' · '):'🔒 MYSTERY LETTERS'}</strong>
   {grandIntro?<div className="acro-grand-theme-plaque"><span className="acro-grand-theme-label">Featuring Theme:</span> <strong>{board.theme}</strong></div>:<strong className="acro-inline-theme">{board.theme}</strong>}
   {grandIntro&&<div className="acro-grand-theme-bonus">✦ EARN POINTS BY BEING ON THEME ✦</div>}
   <div className={grandIntro?'acro-inline-meta acro-grand-stats':'acro-inline-meta'}>{grandIntro?<><span>✦ {board.letterCount??board.letters.length} Letters</span><span>♟ {board.entryCount??board.entries.length} Entries</span><span>★ {board.voteCount??board.votes.length} Votes</span></>:<>{board.kind==='blitz'&&['open','voting'].includes(board.phase)?'⏱ '+remaining+' · ':''}{board.kind==='blitz'&&board.phase==='open'?'Answers hidden':(board.entryCount??board.entries.length)+' entries'} · {board.voteCount??board.votes.length} votes</>}</div>
   {needsChoice&&<div className={grandIntro?'acro-inline-choice acro-grand-choice':'acro-inline-choice'}>
     {!grandIntro&&<p>{board.letterCount??'Mystery'} letters · Choose how to join.</p>}
     <div className="acro-grand-actions">
       <div className="acro-grand-action"><button className="acro-grand-play" type="button" disabled={inlineBusy||!mayStart} onClick={()=>void inlineAction({op:'play_entry',id:board.id})}>▶ PLAY CHALLENGE</button><small>60 seconds · one locked answer · +1 point</small></div>
       <div className="acro-grand-action"><button className="acro-grand-vote" type="button" disabled={inlineBusy} onClick={()=>void inlineAction({op:'just_vote',id:board.id})}>★ JUST VOTE</button><small>VOTE ONLY — you cannot submit an answer later.</small></div>
     </div>
     {grandIntro&&<div className="acro-grand-lock">🔒 ANSWERS HIDDEN UNTIL YOU FINISH OR CHOOSE JUST VOTE</div>}
   </div>}
   {inlineTab!== 'enter'&&!needsChoice&&!awaitingEntry&&<section className="acro-inline-ballot" aria-label="All challenge answers and voting">
    <div className="acro-inline-ballot-heading"><strong>★ ANSWERS · QUICK VOTE</strong><span>{rankings.length} submitted</span></div>
    {board.kind==='blitz'&&board.phase==='open'?<p className="acro-inline-podium-empty">⚡ Blitz answers are revealed when voting begins.</p>:rankings.length?<>
      <div className="acro-inline-ballot-rows">
      {visibleRankings.map((r,i)=><div className="acro-inline-ballot-entry" key={r.entry.id}>
        <span className="acro-inline-ballot-number">{i+1}.</span>
        <span className="acro-inline-ballot-answer">{r.entry.answer}</span>
        <button type="button" disabled={!acceptingVotes||!votingReady||inlineBusy||r.entry.user===state?.me} className={ballot?.first===r.entry.id?'voted':''} aria-label={r.entry.user===state?.me?'Your own answer':(ballot?.first===r.entry.id?'Vote saved for ':'Vote for ')+r.entry.answer} aria-pressed={ballot?.first===r.entry.id} onClick={()=>void inlineAction({op:'vote',id:board.id,first:r.entry.id})}>{r.entry.user===state?.me?'Yours':ballot?.first===r.entry.id?'✓ Voted':acceptingVotes&&votingReady?'★ Vote':acceptingVotes?'Waiting':'★ '+r.votes}</button>
      </div>)}
      </div>
      {rankings.length>2&&<button type="button" className="acro-inline-view-all" onClick={open}>↗ View and vote on all {rankings.length} answers</button>}
      <p className="acro-inline-ballot-footnote">{acceptingVotes?(votingReady?'One vote per person. No entry required. Change your pick until closing.':'Voting opens when two different players enter.'):'Voting closed · final totals shown.'}</p>
    </>:<p className="acro-inline-podium-empty">No answers yet. Enter the first one.</p>}
   </section>}
   <div className="acro-inline-tabs acro-inline-tabs-compact" role="group" aria-label="Challenge actions">
    <button type="button" disabled={voteOnly||(!acceptingAnswers&&!(!!own&&!!board.timedEntry))} aria-expanded={inlineTab==='enter'} className={inlineTab==='enter'?'selected':''} onClick={()=>show('enter')}>✍ {own?'My locked answer':board.timedEntry?'Play / Enter':'Enter'} {inlineTab==='enter'?'⌃':'⌄'}</button>
    <button type="button" disabled={awaitingEntry||needsChoice} onClick={open}>★ View All Answers ↗</button>
   </div>
   {inlineTab==='enter'&&!voteOnly&&<div className="acro-inline-panel">
    {board.timedEntry&&own?<><strong>✓ Answer locked in</strong><p>{own.answer}</p><p>One submission per challenge. You can still vote on other answers.</p></>:
    board.timedEntry&&personalStart===undefined?<><p>The theme is your clue. Press Play to start your personal 60-second countdown. One answer, no edits.</p><button className="acro-inline-primary" type="button" disabled={inlineBusy||!mayStart} onClick={()=>void inlineAction({op:'play_entry',id:board.id})}>{inlineBusy?'Starting…':mayStart?'▶ Play · Reveal letters':'Play unavailable'}</button></>:
    board.timedEntry&&attemptLeft===0?<p>Your timed attempt has expired. You can still vote.</p>:
    <><label htmlFor="acro-answer">{board.timedEntry?'⏱ '+attemptClock+' remaining · one final submission':own?'Your saved answer':'One word per letter'}</label>
    <input id="acro-answer" maxLength={200} disabled={!mayAnswer} autoComplete="off" placeholder={board.letters.split('').join(' · ')} value={draft} onChange={e=>{setInlineAnswer(e.target.value);setInlineDraftChanged(true)}}/>
    <button className="acro-inline-primary" type="button" disabled={inlineBusy||!mayAnswer||!draft.trim()} onClick={()=>void inlineAction({op:'entry',id:board.id,answer:draft})}>{inlineBusy?'Saving…':board.timedEntry?'Lock in answer':own?'Update answer':'Submit answer'}</button>
    </>}
   </div>}
   {inlineTab==='results'&&showAnswers&&<div className="acro-inline-panel">
    {board.kind==='blitz'&&board.phase==='open'?<p>Answers appear when voting begins.</p>:rankings.length?rankings.slice(0,3).map((r,i)=><div className="acro-inline-row" key={r.entry.id}><span>{i+1}. {r.entry.answer}</span><b>★ {r.votes}</b></div>):<p>No entries yet.</p>}
   </div>}
   {inlineTab===null&&!needsChoice&&board.timedEntry&&!own&&personalStart===undefined&&<p className="acro-inline-hint">Theme first. Tap Play / Enter to start your timer.</p>}
   {inlineTab===null&&board.winner&&<p className="acro-inline-hint">🏆 Winner: u/{board.winner}</p>}
   {inlineMessage&&<p className="acro-inline-message" role="status">{inlineMessage}</p>}
   <div className="acro-inline-links">
    <button type="button" onClick={()=>navigateTo(postUrl)}>💬 Open full post & comments</button>
    <button type="button" onClick={()=>navigateTo(state?.headquartersUrl??'https://www.reddit.com/r/acro_arena_dev/')}>⌂ Arena / host</button>
   </div>
  </main>;
 }
 return <main className="preview-shell">
  <div className="preview-brand"><img src={banner} alt="Acro Arena — crowned microphone and golden laurel artwork" /></div>
  <div className="preview-content">
   <div className="preview-ribbon"><span>🎙️ ACRO ARENA</span><span>HEADQUARTERS</span></div>
    <p className="preview-overline">REDDIT EDITION · V4 ALPHA</p>
    <h1 className="preview-welcome">YOUR NEXT ACRONYM AWAITS</h1>
    <h2 className="preview-theme">Create · Compete · Vote · Win</h2>
    <div className="preview-meta"><span>🎮 {active.length} live {active.length===1?'challenge':'challenges'}</span><span>🏆 Winner's Choice</span></div>
    <div className="hq-preview-tabs" role="group" aria-label="Headquarters dashboard">
      <button type="button" className={panel==='live'?'hq-tab-selected':''} onClick={()=>setPanel('live')}>⚡ Live Challenges ({active.length})</button>
      <button type="button" className={panel==='leaders'?'hq-tab-selected':''} onClick={()=>setPanel('leaders')}>🏆 Leaderboard</button>
       <button type="button" className={panel==='fame'?'hq-tab-selected':''} onClick={()=>setPanel('fame')}>👑 Hall of Fame</button>
    </div>
    <div className="hq-preview-live" aria-label={panel==='live'?'Live Acro Arena challenges':panel==='fame'?'Acro Arena Hall of Fame':'Acro Arena leaderboard'}>
      {panel==='live'?<>
      <div className="hq-preview-heading"><strong>✦ LIVE IN THE ARENA</strong><span className="hq-preview-scroll-tools"><small>{active.length?active.length+' open':'Awaiting challengers'}</small><button type="button" className="hq-scroll-button" title="Previous challenge" aria-label="Scroll up to previous challenge" onClick={()=>liveScroll.current?.scrollBy({top:-190,behavior:'smooth'})}>↑</button><button type="button" className="hq-scroll-button" title="Next challenge" aria-label="Scroll down to next challenge" onClick={()=>liveScroll.current?.scrollBy({top:190,behavior:'smooth'})}>↓</button></span></div>
      <div className="hq-preview-scroll" ref={liveScroll} role="region" aria-label="Scroll or swipe to see all live challenges" tabIndex={0}>
      {active.length?[...active].sort((a,b)=>b.id-a.id).map(b=><button className="hq-preview-board" type="button" key={b.id} disabled={!b.postId} title={b.postId?'Open Challenge #'+b.id:'Challenge post is not available'} onClick={()=>{if(b.postId)navigateTo('https://www.reddit.com/r/acro_arena_dev/comments/'+b.postId+'/')}}><strong>#{b.id} · {b.letters.split('').join(' · ')}</strong><span>{b.theme}</span><small>{b.entryCount??b.entries.length} {(b.entryCount??b.entries.length)===1?'entry':'entries'} · {b.voteCount??b.votes.length} {(b.voteCount??b.votes.length)===1?'vote':'votes'} ↗</small><span className="hq-preview-top" aria-label="Challenge answers stay hidden in Headquarters"><span className="hq-preview-answer-empty">🔒 Answers hidden here · Open challenge to Play or Just Vote</span></span></button>):<p>Be the first to start a challenge.</p>}
      </div>
      </>:panel==='fame'?<>
       <div className="hq-preview-heading"><strong>👑 HALL OF FAME</strong><small>Top 3 scorers · completed rounds only</small></div>
       <div className="hq-preview-scroll hq-preview-fame" role="region" aria-label="Top three scorers and their three highest-voted finished answers" tabIndex={0}>
        {hall.map((player,i)=><section className="hq-fame-player" key={player.user}>
          <div className="hq-fame-player-title"><strong>{i===0?'🥇':i===1?'🥈':'🥉'} u/{player.user}</strong><b>{player.points} pts</b></div>
          {player.answers.length?
            <ol className="hq-fame-answers">{player.answers.map(a=><li key={a.boardId+'-'+a.answer}><span className="hq-fame-answer">{a.answer}</span><small>#{a.boardId} · {a.letters.split('').join(' · ')} · ★ {a.votes} {a.votes===1?'vote':'votes'}</small></li>)}</ol>:
            <p className="hq-fame-empty">No completed challenge answers yet.</p>}
        </section>)}
        {!hall.length&&<p className="hq-fame-empty">The Hall of Fame will fill up as players score points.</p>}
       </div>
      </>:<>
       <div className="hq-preview-heading"><strong>🏆 ARENA LEADERBOARD</strong><small>Top 10 · all-time</small></div>
       <div className="hq-preview-scroll hq-preview-standings" role="region" aria-label="Top ten player standings" tabIndex={0}>
        {leaders.map((p,i)=><div className="hq-preview-player" key={p.user}>
          <span className="hq-preview-player-rank">{i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</span>
          <span className="hq-preview-player-details"><strong>u/{p.user}</strong><small>✍ {p.participation} activity · ★ {p.votePoints} votes · 🎯 {p.themePoints} theme · 🎮 {p.hosted} hosted</small><small>🥇 {p.first} · 🥈 {p.second} · 🥉 {p.third}</small></span>
          <strong className="hq-preview-player-points">{p.total} pts</strong>
        </div>)}
        {!leaders.length&&<p>Standings appear when players join the arena.</p>}
       </div>
      </>}
    </div>
   {error&&<p className="preview-error" role="alert">{error}</p>}
   {!state&&!error&&<p className="preview-loading">Loading challenge…</p>}
   <button className="preview-enter" type="button" onClick={open}>⚔ CONTROL PANEL</button>
   <p className="preview-footnote">Tap to open the interactive game · v4.0.0-alpha.3</p>
  </div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview/></React.StrictMode>);
