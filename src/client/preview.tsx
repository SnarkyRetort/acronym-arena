import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {requestExpandedMode,navigateTo} from '@devvit/web/client';
import type {Board,Game} from '../shared/arena';
import {aiLabel,tally} from '../shared/arena';
import './preview.css';

const banner=new URL('./acro_arena_banner.jpg',import.meta.url).href;
type PreviewState={
 kind:'hq'|'challenge';challengeId:number|null;game:Game;
 me:string;slots:number[];winnerSlots:number[];participation:number
};
const label=(phase:Board['phase'])=>phase==='open'?'LIVE NOW':phase==='choice'?"WINNER'S CHOICE":phase==='dismissed'?'DISMISSED':'COMPLETE';
function Preview(){
 const[state,setState]=useState<PreviewState|null>(null);
 const[error,setError]=useState('');
 const liveScroll=useRef<HTMLDivElement|null>(null);
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
 const active=state?.game.boards.filter(b=>b.phase==='open')??[];
 const open=(event:React.MouseEvent<HTMLButtonElement>)=>{
  // Devvit requires this call during the original trusted user click.
  requestExpandedMode(event.nativeEvent,'game',{title:board?'Acro Arena · Challenge #'+board.id:'Acro Arena · Headquarters'});
 };
 if(board)return <button className="challenge-tile" type="button" onClick={open} aria-label={'Open Acro Arena challenge '+board.id+': '+board.theme}>
  <img className="challenge-tile-banner" src={banner} alt="Acro Arena" />
  <div className="challenge-tile-body">
   <div className="challenge-tile-overline"><span>✦ CHALLENGE #{board.id}{board.nsfw?' · 🔞 18+':''}</span><span>{label(board.phase)}</span></div>
   <strong className="challenge-tile-letters">{board.letters.split('').join(' · ')}</strong>
   <span className="challenge-tile-theme">{board.theme}</span>
   <span className="challenge-tile-bottom"><span>✍ {board.entries.length} {board.entries.length===1?'entry':'entries'} · ▣ {board.votes.length} {board.votes.length===1?'vote':'votes'} · {aiLabel(board.ai)}</span></span>
   <span className="challenge-top-three" aria-label="Current top three answers">
    <span className="challenge-top-heading">★ TOP ANSWERS</span>
    {tally(board).slice(0,3).map((r,i)=><span className="challenge-top-answer" key={r.entry.id}><span className="challenge-top-rank">{i+1}.</span><span className="challenge-top-text">{r.entry.answer}</span><span className="challenge-top-votes">★ {r.votes}</span></span>)}
    {!board.entries.length&&<span className="challenge-top-empty">Be the first to answer!</span>}
   </span>
  </div>
 </button>;
 return <main className="preview-shell">
  <div className="preview-brand"><img src={banner} alt="Acro Arena — crowned microphone and golden laurel artwork" /></div>
  <div className="preview-content">
   <div className="preview-ribbon"><span>🎙️ ACRO ARENA</span><span>HEADQUARTERS</span></div>
    <p className="preview-overline">REDDIT EDITION · V4 ALPHA</p>
    <h1 className="preview-welcome">YOUR NEXT ACRONYM AWAITS</h1>
    <h2 className="preview-theme">Create · Compete · Vote · Win</h2>
    <div className="preview-meta"><span>🎮 {active.length} live {active.length===1?'challenge':'challenges'}</span><span>🏆 Winner's Choice</span></div>
    <div className="hq-preview-live" aria-label="Live Acro Arena challenges">
      <div className="hq-preview-heading"><strong>✦ LIVE IN THE ARENA</strong><span className="hq-preview-scroll-tools"><small>{active.length?active.length+' open':'Awaiting challengers'}</small><button type="button" className="hq-scroll-button" title="Previous challenge" aria-label="Scroll up to previous challenge" onClick={()=>liveScroll.current?.scrollBy({top:-190,behavior:'smooth'})}>↑</button><button type="button" className="hq-scroll-button" title="Next challenge" aria-label="Scroll down to next challenge" onClick={()=>liveScroll.current?.scrollBy({top:190,behavior:'smooth'})}>↓</button></span></div>
      <div className="hq-preview-scroll" ref={liveScroll} role="region" aria-label="Scroll or swipe to see all live challenges" tabIndex={0}>
      {active.length?active.slice(-3).reverse().map(b=><button className="hq-preview-board" type="button" key={b.id} disabled={!b.postId} title={b.postId?'Open Challenge #'+b.id:'Challenge post is not available'} onClick={()=>{if(b.postId)navigateTo('https://www.reddit.com/r/acro_arena_dev/comments/'+b.postId+'/')}}><strong>#{b.id} · {b.letters.split('').join(' · ')}</strong><span>{b.theme}</span><small>{b.entries.length} {b.entries.length===1?'entry':'entries'} · {b.votes.length} {b.votes.length===1?'vote':'votes'} ↗</small><span className="hq-preview-top" aria-label="Top three answers">{tally(b).slice(0,3).map((r,i)=><span className="hq-preview-answer" key={r.entry.id}><span className="hq-preview-rank">{i+1}.</span><span className="hq-preview-answer-text">{r.entry.answer}</span><span className="hq-preview-answer-votes">★ {r.votes}</span></span>)}{b.entries.length===0&&<span className="hq-preview-answer-empty">No answers yet · Be first!</span>}</span></button>):<p>Be the first to start a challenge.</p>}
      {active.length>3&&<small className="hq-preview-more">+{active.length-3} more live challenges inside</small>}
      </div>
    </div>
   {error&&<p className="preview-error" role="alert">{error}</p>}
   {!state&&!error&&<p className="preview-loading">Loading challenge…</p>}
   <button className="preview-enter" type="button" onClick={open}>⚔ CONTROL PANEL</button>
   <p className="preview-footnote">Tap to open the interactive game · v4.0.0-alpha.3</p>
  </div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview/></React.StrictMode>);
