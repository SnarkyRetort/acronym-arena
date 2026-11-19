import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {requestExpandedMode} from '@devvit/web/client';
import type {Board,Game} from '../shared/arena';
import {aiLabel} from '../shared/arena';
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
 return <main className="preview-shell">
  <div className="preview-brand"><img src={banner} alt="Acro Arena — crowned microphone and golden laurel artwork" /></div>
  <div className="preview-content">
   <div className="preview-ribbon"><span>🎙️ ACRO ARENA</span><span>{board?label(board.phase):'HEADQUARTERS'}</span></div>
   {board?<>
    <p className="preview-overline">CHALLENGE #{board.id}{board.nsfw?' · 🔞 18+':''}</p>
    <h1 className="preview-letters">{board.letters.split('').join(' · ')}</h1>
    <h2 className="preview-theme">{board.theme}</h2>
    <div className="preview-meta"><span>✍ {board.entries.length} entries</span><span>▣ {board.votes.length} ballots</span><span>{aiLabel(board.ai)}</span></div>
   </>:<>
    <p className="preview-overline">REDDIT EDITION · V4 ALPHA</p>
    <h1 className="preview-welcome">YOUR NEXT ACRONYM AWAITS</h1>
    <h2 className="preview-theme">Create · Compete · Vote · Win</h2>
    <div className="preview-meta"><span>🎮 {active.length} live {active.length===1?'challenge':'challenges'}</span><span>🏆 Winners get a bonus host slot</span></div>
   </>}
   {error&&<p className="preview-error" role="alert">{error}</p>}
   {!state&&!error&&<p className="preview-loading">Loading challenge…</p>}
   <button className="preview-enter" type="button" onClick={open}>{board?'⚔ ENTER THE ARENA':'⚔ OPEN HEADQUARTERS'}</button>
   <p className="preview-footnote">Tap to open the interactive game · v4.0.0-alpha.1</p>
  </div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview/></React.StrictMode>);
