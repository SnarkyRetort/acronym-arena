export type ScoreCard={total:number;rank:number;entered:number;votesCast:number;onThemeGiven:number;wins:number};

export const formatScoreShare=(score:ScoreCard,username:string,challengeId:number,challengeTheme:string,challengeUrl:string)=>{
 const rank=score.rank?'#'+score.rank:'Unranked';
 return [
  '🏆 ACRO ARENA · MY SCORE',
  'u/'+username+' · '+score.total+' points · Rank '+rank,
  '✍ '+score.entered+' entries · ★ '+score.votesCast+' ballots · 🎯 '+score.onThemeGiven+' theme picks · 🥇 '+score.wins+' wins',
  'Challenge #'+challengeId+' · '+challengeTheme,
  '🎮 Play or Vote: '+challengeUrl
 ].join('\n');
};

/** Web Share API is optional in Reddit webviews; clipboard is the fallback. */
export const shareScore=async(text:string):Promise<'shared'|'copied'|'manual'>=>{
 try{
  if(typeof navigator.share==='function'){
   await navigator.share({title:'Acro Arena · My Score',text});
   return 'shared';
  }
 }catch(e){
  // Cancelled share sheets should not prevent copying a score instead.
  if(e instanceof Error&&e.name==='AbortError')return 'manual';
 }
 try{
  if(navigator.clipboard?.writeText){
   await navigator.clipboard.writeText(text);
   return 'copied';
  }
 }catch{ /* Expose selectable text when clipboard permissions are denied. */ }
 return 'manual';
};
