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

/** Copy only the challenge URL, without invoking the device's share sheet. */
export const copyChallengeLink=async(url:string):Promise<'copied'|'manual'>=>{
 try{
  if(navigator.clipboard?.writeText){
   await navigator.clipboard.writeText(url);
   return 'copied';
  }
 }catch{ /* Reddit webviews may deny clipboard access. */ }
 return 'manual';
};
