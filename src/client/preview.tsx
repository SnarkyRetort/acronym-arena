import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {requestExpandedMode,navigateTo} from '@devvit/web/client';
import type {Board,Game} from '../shared/arena';
import {aiLabel,tally,leaderboardStats} from '../shared/arena';
import './preview.css';

const banner=new URL('./acro_arena_banner.jpg',import.meta.url).href;
type PreviewState={
 kind:'hq'|'challenge';challengeId:number|null;game:Game;
 me:string;slots:number[];winnerSlots:number[];participation:number
};
const label=(phase:Board['phase'])=>phase==='voting'?'VOTING NOW':phase==='open'?'LIVE NOW':phase==='choice'?"WINNER'S CHOICE":phase==='dismissed'?'DISMISSED':'COMPLETE';
function Preview(){
 const[state,setState]=useState<PreviewState|null>(null);
 const[error,setError]=useState('');
 const liveScroll=useRef<HTMLDivElement|null>(null);
 const[panel,setPanel]=useState<'live'|'leaders'>('live');
 const[inlineTab,setInlineTab]=useState<'enter'|'vote'>('enter');
 const[inlineAnswer,setInlineAnswer]=useState('');
 const[votePage,setVotePage]=useState(0);
 const[inlineBusy,setInlineBusy]=useState(false);
 const[inlineMessage,setInlineMessage]=useState('');
 const[inlineDraftChanged,setInlineDraftChanged]=useState(false);
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
 const inlineAction=async(op:Record<string,unknown>):Promise<void>=>{
  if(inlineBusy)return;
  setInlineBusy(true);setInlineMessage('');
  try{
   const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op)});
   const payload=await response.json();
   if(!response.ok)throw Error(payload.error??'Could not save your action.');
   setState(payload as PreviewState);
   setInlineMessage(payload.message??'Saved.');
   if(op.op==='entry'){setInlineDraftChanged(false);setInlineTab('vote');}
  }catch(err){setInlineMessage(err instanceof Error?err.message:String(err));}
  finally{setInlineBusy(false);}
 };
 const open=(event:React.MouseEvent<HTMLButtonElement>)=>{
  // Devvit requires this call during the original trusted user click.
  requestExpandedMode(event.nativeEvent,'game',{title:board?'Acro Arena · Challenge #'+board.id:'Acro Arena · Headquarters'});
 };
 if(board){
  const own=board.entries.find(e=>e.user===state?.me);
  const candidates=board.entries.filter(e=>e.user!==state?.me);
  const hasTwoPlayers=new Set(board.entries.map(e=>e.user)).size>=2;
  const ballot=board.votes.find(v=>v.user===state?.me);
  const listPage=Math.min(votePage,Math.max(0,Math.ceil(candidates.length/3)-1));
  const visible=candidates.slice(listPage*3,listPage*3+3);
  const acceptingAnswers=board.phase==='open'&&Date.now()<board.deadline;
  const acceptingVotes=board.kind==='blitz'?board.phase==='voting'&&Date.now()<(board.votingDeadline??0):acceptingAnswers;
  const isOpen=acceptingAnswers||acceptingVotes;
  const phaseEnd=acceptingVotes&&board.kind==='blitz'?board.votingDeadline??board.deadline:board.deadline;
  const secondsLeft=Math.max(0,Math.ceil((phaseEnd-Date.now())/1000));
  const remaining=Math.floor(secondsLeft/60)+':'+String(secondsLeft%60).padStart(2,'0');
  const draft=inlineDraftChanged?inlineAnswer:(own?.answer??inlineAnswer);
  return <main className="feed-challenge" aria-label={'Acro Arena Challenge '+board.id}>
   <div className="feed-challenge-brand"><img src={banner} alt="Acro Arena"/></div>
   <div className="feed-challenge-intro">
    <div className="feed-challenge-ribbon"><span>✦ CHALLENGE #{board.id}{board.nsfw?' · 🔞 18+':''}</span><span>{label(board.phase)}</span></div>
    <div className="feed-challenge-letters">{board.letters.split('').join(' · ')}</div>
    <div className="feed-challenge-theme">{board.theme}</div>
    <div className="feed-challenge-count">{board.kind==='blitz'?('⚡ '+(board.phase==='voting'?'VOTE':'ANSWER')+' · '+remaining+' · '):''}{board.kind==='blitz'&&board.phase==='open'?'Answers hidden':board.entries.length+' entries'} · {board.votes.length} votes · {aiLabel(board.ai)}</div>
   </div>
   {isOpen?<div className="feed-play-area">
    <div className="feed-play-tabs" role="group" aria-label="Play this challenge">
     <button type="button" className={inlineTab==='enter'?'active':''} disabled={!acceptingAnswers} onClick={()=>setInlineTab('enter')}>✍ {own?'My Answer':'Enter'}</button>
     <button type="button" className={inlineTab==='vote'?'active':''} disabled={!acceptingVotes} onClick={()=>setInlineTab('vote')}>★ Vote ({board.kind==='blitz'&&board.phase==='open'?'soon':candidates.length})</button>
    </div>
    {(inlineTab==='enter'||board.kind==='blitz'&&acceptingAnswers)?<div className="feed-enter">
     <label htmlFor="feed-answer">{own?'Your saved answer (editable)':'One word per letter'}</label>
     <input id="feed-answer" autoComplete="off" maxLength={200} placeholder={board.letters.split('').join(' · ')} value={draft} onChange={e=>{setInlineAnswer(e.target.value);setInlineDraftChanged(true)}}/>
     <button type="button" className="feed-gold-button" disabled={inlineBusy||!acceptingAnswers||!draft.trim()} onClick={()=>void inlineAction({op:'entry',id:board.id,answer:draft})}>{inlineBusy?'Saving…':own?'Update Answer':'Submit Answer'}</button>
    </div>:<div className="feed-vote">
     {!hasTwoPlayers?<div className="feed-empty">Voting opens once two players have entered.</div>:<>
      <div className="feed-vote-list">{visible.map((entry,i)=><div className="feed-vote-item" key={entry.id}>
       <span className="feed-vote-answer"><b>{listPage*3+i+1}.</b> {entry.answer}</span>
       <button type="button" disabled={inlineBusy||!acceptingVotes} className={ballot?.first===entry.id?'active':''} onClick={()=>void inlineAction({op:'vote',id:board.id,first:entry.id})}>{ballot?.first===entry.id?'✓ Voted':'★ Vote'}</button>
      </div>)}</div>
      {candidates.length>3&&<div className="feed-vote-pagination"><button type="button" disabled={listPage===0} onClick={()=>setVotePage(p=>Math.max(0,p-1))}>‹ Previous</button><span>{listPage+1} / {Math.ceil(candidates.length/3)}</span><button type="button" disabled={(listPage+1)*3>=candidates.length} onClick={()=>setVotePage(p=>p+1)}>Next ›</button></div>}
      {!candidates.length&&<div className="feed-empty">No other entries to vote for yet.</div>}
     </>}
    </div>}
   </div>:<div className="feed-closed">{board.kind==='blitz'?'⚡ Blitz complete. Open results to see the winner.':'This round has ended. Open results to see the final rankings.'}</div>}
   {inlineMessage&&<p className="feed-feedback" role="status">{inlineMessage}</p>}
   <button type="button" className="feed-expand" onClick={open}>Discussion · Results · More <span>↗</span></button>
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
    </div>
    <div className="hq-preview-live" aria-label={panel==='live'?'Live Acro Arena challenges':'Acro Arena leaderboard'}>
      {panel==='live'?<>
      <div className="hq-preview-heading"><strong>✦ LIVE IN THE ARENA</strong><span className="hq-preview-scroll-tools"><small>{active.length?active.length+' open':'Awaiting challengers'}</small><button type="button" className="hq-scroll-button" title="Previous challenge" aria-label="Scroll up to previous challenge" onClick={()=>liveScroll.current?.scrollBy({top:-190,behavior:'smooth'})}>↑</button><button type="button" className="hq-scroll-button" title="Next challenge" aria-label="Scroll down to next challenge" onClick={()=>liveScroll.current?.scrollBy({top:190,behavior:'smooth'})}>↓</button></span></div>
      <div className="hq-preview-scroll" ref={liveScroll} role="region" aria-label="Scroll or swipe to see all live challenges" tabIndex={0}>
      {active.length?[...active].sort((a,b)=>b.id-a.id).map(b=><button className="hq-preview-board" type="button" key={b.id} disabled={!b.postId} title={b.postId?'Open Challenge #'+b.id:'Challenge post is not available'} onClick={()=>{if(b.postId)navigateTo('https://www.reddit.com/r/acro_arena_dev/comments/'+b.postId+'/')}}><strong>#{b.id} · {b.letters.split('').join(' · ')}</strong><span>{b.theme}</span><small>{b.entries.length} {b.entries.length===1?'entry':'entries'} · {b.votes.length} {b.votes.length===1?'vote':'votes'} ↗</small><span className="hq-preview-top" aria-label="Top three answers">{tally(b).slice(0,3).map((r,i)=><span className="hq-preview-answer" key={r.entry.id}><span className="hq-preview-rank">{i+1}.</span><span className="hq-preview-answer-text">{r.entry.answer}</span><span className="hq-preview-answer-votes">★ {r.votes}</span></span>)}{b.entries.length===0&&<span className="hq-preview-answer-empty">No answers yet · Be first!</span>}</span></button>):<p>Be the first to start a challenge.</p>}
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
