export type AiMode = 'ok' | 'free';
export type ChallengeKind='regular'|'winner'|'blitz';
export type BlitzVoteSeconds=30|60|90|120|180;
export const isBlitzVoteSeconds=(v:unknown):v is BlitzVoteSeconds=>[30,60,90,120,180].includes(v as number);
export const blitzAnswerSeconds=(letters:number)=>Math.max(2,letters-1)*60;
export type DurationHours=1|4|8|24;
export type ChoiceHours=1|4|8|24;
export type LetterCount=3|4|5|6|7|8;
export const isLetterCount=(v:unknown):v is LetterCount=>[3,4,5,6,7,8].includes(v as number);
export const isDuration=(v:unknown):v is DurationHours=>v===1||v===4||v===8||v===24;
export type Phase = 'open' | 'voting' | 'choice' | 'done' | 'dismissed';
export type ThemeMode = 'themed' | 'anything';
export type Entry = { id:number; user:string; answer:string; created:number; edited:number; onThemeBy:string[] };
export type Vote = { user:string; first:number; second?:number; updated:number }; // 'second' retained to read earlier votes; no new second-place votes
export type Message = { id:number; user:string; body:string; created:number };
export type Board = { postId?:string; host?:string; kind?:ChallengeKind; nsfw?:boolean; id:number; slot:number; letters:string; theme:string; ai:AiMode; phase:Phase; started:number; deadline:number; winner?:string; themeLeader?:string; scoringVersion?:2; durationHours?:DurationHours; choiceWindowHours?:ChoiceHours; choiceDeadline?:number; blitzVoteSeconds?:BlitzVoteSeconds; votingDeadline?:number; entries:Entry[]; votes:Vote[]; discussion:Message[]; archived:boolean; discardedReason?:string };
export type Game = { version:1; nextId:number; hosts:string[]; boards:Board[]; scores:Record<string,number>; winnerTokens?:Record<string,boolean>; winnerExpires?:Record<string,number>; ledger:string[]; themes:string[] };
export const SLOTS=1; // Regular players: one active challenge.
export const MOD_SLOTS=5; // Arena moderators: up to five independent active regular challenges.
export const DEFAULT_THEMES=["Terrible restaurant specials","Things aliens find confusing","Worst documentary subjects","An awful company slogan","Ridiculous supervillain plans","Unwelcome wedding advice","Things never to say in space","Very bad historical reenactments","Unusual medical diagnoses","Most regrettable inventions","Bad retirement plans","Intergalactic customer complaints","Terrible pet names","The worst superpower","Unfortunate band names","Suspicious fortune cookies","Worst possible theme park rides","Things a haunted toaster would say","Terrible excuses for being late","Rejected names for a spaceship","Worst superhero sidekicks","Things you should never microwave","Alien dating profile disasters","Unfortunate tattoos","Names for a very shady business","Disastrous first date activities","Rejected cereal mascots","Terrible motivational posters","Things found in a villain’s junk drawer","Bad slogans for luxury hotels","The worst things to hear from a pilot","Very suspicious grocery store items","Unhinged wedding vows","Bad names for a secret society","Things a confused robot might confess","The least useful magical spells","Terrible reality TV concepts","Awkward last words","Things not to say at a job interview","Ridiculous conspiracy theories","Worst names for a rock band","Terrible advice from a time traveler","Unwelcome messages from your fridge","The worst museum exhibits","Things a dragon hoards instead of gold","Rejected government department names","Highly questionable science experiments","Bad slogans for retirement homes","Villains with oddly specific grudges","Unnecessary luxury inventions"];
export const drawThemeChoices=(themes:readonly string[],previous:readonly string[]=[],count=4,random=Math.random):string[]=>{
 const unique=[...new Set(themes.map(t=>t.trim()).filter(Boolean))];
 const fresh=unique.filter(t=>!previous.includes(t));
 const pool=fresh.length>=count?fresh:unique;
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j]!,pool[i]!];}
 return pool.slice(0,Math.min(count,pool.length));
};
export const createGame=(host:string):Game=>({version:1,nextId:1,hosts:[host.toLowerCase()],boards:[],scores:{},winnerTokens:{},winnerExpires:{},ledger:[],themes:[...DEFAULT_THEMES]});
export const aiLabel=(a:AiMode)=>a==='ok'?'🤖 AI OK':'🧠 AI FREE · HONOR SYSTEM';
export const hostName=(g:Game,b:Board)=>b.host??g.hosts[0]??'';
export const availableSlots=(g:Game,user=g.hosts[0]??'',kind:ChallengeKind='regular',now=Date.now())=>{
 const owner=user.toLowerCase();
 const taken=new Set(g.boards.filter(b=>b.phase==='open'&&hostName(g,b)===owner&&(kind==='blitz'?(b.kind==='blitz'):(kind==='regular'?(b.kind??'regular')==='regular':b.kind==='winner'))).map(b=>b.slot));
 if(kind==='winner')return taken.size===0&&!!g.winnerTokens?.[owner]&&(!g.winnerExpires?.[owner]||now<g.winnerExpires[owner])?[1]:[];
 const limit=g.hosts.includes(owner)?MOD_SLOTS:SLOTS;
 return Array.from({length:limit},(_,i)=>i+1).filter(slot=>!taken.has(slot));
};
export const participation=(g:Game,user:string)=>g.boards.filter(b=>b.entries.some(e=>e.user===user)||b.votes.some(v=>v.user===user)||hostName(g,b)===user).length;
export const active=(g:Game)=>g.boards.filter(b=>b.phase==='open'||b.phase==='voting'||b.phase==='choice');
/** Migrate old five-board previews without deleting answer/history records. */
export const enforceSingle=(g:Game)=>{
 const running=active(g).sort((a,b)=>a.id-b.id);
 for(const b of running.slice(1)){b.phase='dismissed';b.archived=true;b.discardedReason='Converted to single-challenge mode';}
 return Math.max(0,running.length-1);
};
export const norm=(s:string)=>s.trim().replace(/\s+/g,' ');
export const parseAnswer=(letters:string,answer:string)=>{
 const words=norm(answer).split(/\s+/).filter(Boolean);const expected=[...letters];
 if(words.length!==expected.length)throw Error(`Use exactly ${expected.length} words for ${expected.join(' · ')}. You entered ${words.length}.`);
 for(let i=0;i<words.length;i++)if((words[i]?.[0]??'').toUpperCase()!==expected[i])throw Error(`Word ${i+1} must begin with ${expected[i]}.`);
 if(answer.length>200)throw Error('Answer must be 200 characters or fewer.');
 return words.join(' ');
};
export const randomLetters=(count?:LetterCount)=>{
 const pool='AAAAABCDEEEEEEEEEFGHIIIIJKLMNNOOOOOPRRRSSSSTTTTTUUUVWY';
 const len=count??(3+Math.floor(Math.random()*6));
 return Array.from({length:len},()=>pool[Math.floor(Math.random()*pool.length)]).join('');
};
export const start=(g:Game,theme:string,ai:AiMode,now=Date.now(),letters=randomLetters(),slot=undefined as number|undefined,host=g.hosts[0]??'',kind:ChallengeKind='regular',nsfw=false,durationHours:DurationHours=24,choiceWindowHours:ChoiceHours=1,letterCount?:LetterCount,blitzVoteSeconds:BlitzVoteSeconds=60):Board=>{
 if(letterCount!==undefined&&!isLetterCount(letterCount))throw Error('Choose 3 through 8 letters.');
 if(letterCount!==undefined&&letters.length!==letterCount)throw Error('Generated acronym length does not match the selected letter count.');
 if(!host.trim())throw Error('Sign in to host a challenge.');
 if(!isDuration(durationHours)||!isDuration(choiceWindowHours))throw Error('Choose 1, 4, 8, or 24 hours.');
 if(kind==='blitz'&&!isBlitzVoteSeconds(blitzVoteSeconds))throw Error('Blitz voting timer must be 30, 60, 90, 120, or 180 seconds.');
 const freeSlots=availableSlots(g,host,kind,now);
 if(!freeSlots.length)throw Error(kind==='winner'?'No Winner’s Choice slot available. Win a challenge to earn one.':'All your regular hosting slots are occupied. Finish one before hosting another.');
 slot??=freeSlots[0];
 if(!slot||!freeSlots.includes(slot))throw Error('Choose an available hosting slot.');
 if(!theme.trim()||theme.length>100)throw Error('Theme must have 1–100 characters.');
 if(!/^[A-Z]{3,8}$/.test(letters))throw Error('Letters must be 3–8 capital letters.');
 const b:Board={id:g.nextId++,slot,host:host.toLowerCase(),kind,nsfw,letters,theme:theme.trim(),ai,scoringVersion:2,durationHours,choiceWindowHours,phase:'open',started:now,deadline:now+(kind==='blitz'?blitzAnswerSeconds(letters.length)*1000:durationHours*3600000),blitzVoteSeconds:kind==='blitz'?blitzVoteSeconds:undefined,entries:[],votes:[],discussion:[],archived:false};
 if(kind==='winner'){g.winnerTokens??={};g.winnerTokens[host.toLowerCase()]=false;delete g.winnerExpires?.[host.toLowerCase()];}
 g.boards.push(b);return b;
};
export const boardById=(g:Game,id:number)=>{const b=g.boards.find(b=>b.id===id);if(!b)throw Error('Challenge not found.');return b};
export const enter=(b:Board,user:string,answer:string,now=Date.now())=>{
 if(b.phase!=='open'||now>b.deadline)throw Error('This challenge is closed.');
 const text=parseAnswer(b.letters,answer), prior=b.entries.find(e=>e.user===user);
 if(prior){prior.answer=text;prior.edited=now;return {entry:prior,isNew:false};}
 const entry={id:Math.max(0,...b.entries.map(e=>e.id))+1,user,answer:text,created:now,edited:now,onThemeBy:[]};b.entries.push(entry);return {entry,isNew:true};
};
export const vote=(b:Board,user:string,choice:number,_second?:number,now=Date.now())=>{
 if(b.kind==='blitz'?(b.phase!=='voting'||now>(b.votingDeadline??0)):(b.phase!=='open'||now>b.deadline))throw Error('Voting is closed.');
 if(new Set(b.entries.map(e=>e.user)).size<2)throw Error('Voting opens when two players have entered.');
 if(!b.entries.some(e=>e.id===choice&&e.user!==user))throw Error('Choose another player’s answer.');
 const previous=b.votes.find(v=>v.user===user);
 if(previous){previous.first=choice;delete previous.second;previous.updated=now;}
 else b.votes.push({user,first:choice,updated:now});
};

export const endorse=(b:Board,user:string,entryId:number)=>{
 if(b.kind==='blitz'?b.phase!=='voting':b.phase!=='open')throw Error('Endorsements are closed.');
 const e=b.entries.find(e=>e.id===entryId);if(!e||e.user===user)throw Error('Choose another player’s answer.');
 if(e.onThemeBy.includes(user))e.onThemeBy=e.onThemeBy.filter(x=>x!==user);else e.onThemeBy.push(user);
};
export const comment=(b:Board,user:string,body:string,now=Date.now())=>{
 if(b.archived)throw Error('This discussion is archived.');
 const text=norm(body);if(!text||text.length>500)throw Error('Comment must be 1–500 characters.');
 b.discussion.push({id:Math.max(0,...b.discussion.map(m=>m.id))+1,user,body:text,created:now});
};
// Closed legacy rounds retain their historical 3+1 vote presentation.
export const tally=(b:Board)=>b.entries.map(e=>({entry:e,votes:b.votes.reduce((sum,v)=>sum+
 (v.first===e.id?(b.scoringVersion===2||b.phase==='open'?1:3):0)+
 (b.scoringVersion===2||b.phase==='open'?0:v.second===e.id?1:0),0)})).sort((a,z)=>z.votes-a.votes);
export const themeRanking=(b:Board)=>b.entries.map(e=>({entry:e,endorsements:e.onThemeBy.length})).sort((a,z)=>z.endorsements-a.endorsements);

export const finish=(g:Game,b:Board,now=Date.now())=>{
 if(b.phase!=='open'&&b.phase!=='voting')throw Error('Challenge is not open.');
 const ranked=tally(b);const max=ranked[0]?.votes??0;const winners=ranked.filter(e=>e.votes===max);
 b.winner=max>0&&winners.length===1?winners[0]?.entry.user:undefined;
 const themed=themeRanking(b),top=themed[0]?.endorsements??0;
 b.themeLeader=top>0&&themed.filter(row=>row.endorsements===top).length===1?themed[0]?.entry.user:undefined;
 for(const row of ranked){const key=`${b.id}:votes:${row.entry.user}`;if(!g.ledger.includes(key)){g.scores[row.entry.user]=(g.scores[row.entry.user]??0)+row.votes;g.ledger.push(key);}}
 if(b.winner){const key=`${b.id}:winner`;if(!g.ledger.includes(key)){g.scores[b.winner]=(g.scores[b.winner]??0)+25;g.ledger.push(key);}}
 b.phase=b.winner?'choice':'done';b.choiceDeadline=b.winner?now+(b.choiceWindowHours??1)*3600000:undefined;b.archived=true;
 if(b.winner&&!g.boards.some(other=>other.id!==b.id&&other.phase==='open'&&(other.kind??'regular')==='winner'&&hostName(g,other)===b.winner)){
  g.winnerTokens??={};g.winnerTokens[b.winner]=true;g.winnerExpires??={};g.winnerExpires[b.winner]=b.choiceDeadline!;
 }
 return b.winner;
};
export const dismiss=(b:Board)=>{if(b.phase!=='open'&&b.phase!=='voting')throw Error('Challenge is not open.');b.phase='dismissed';b.archived=true};
export const chooseNext=(g:Game,b:Board,user:string,theme:string,ai:AiMode,now=Date.now())=>{
 if(b.phase!=='choice'||b.winner!==user)throw Error('Only this challenge’s winner may select the next theme.');
 if(b.choiceDeadline&&now>b.choiceDeadline)throw Error('Player’s Choice has expired.');
 b.phase='done';return start(g,theme,ai,now,randomLetters(),b.slot);
};
export const advance=(g:Game,now=Date.now())=>{let count=0;for(const b of active(g)){if(b.phase==='open'&&now>=b.deadline){if(b.kind==='blitz'){b.phase='voting';b.votingDeadline=b.deadline+(b.blitzVoteSeconds??60)*1000;count++;}else{finish(g,b,b.deadline);count++;}}if(b.phase==='voting'&&now>=(b.votingDeadline??0)){finish(g,b,b.votingDeadline);count++;}if(b.phase==='choice'&&b.choiceDeadline!==undefined&&now>=b.choiceDeadline){b.phase='done';if(b.winner&&g.winnerExpires?.[b.winner]===b.choiceDeadline){g.winnerTokens??={};g.winnerTokens[b.winner]=false;}count++;}}return count};
export const rankedChallenges=(g:Game,sort:'best'|'on-theme')=>
 g.boards.filter(b=>!!b.postId&&b.phase!=='dismissed')
 .map(b=>({id:b.id,postId:b.postId!,theme:b.theme,letters:b.letters,score:sort==='best'?tally(b).reduce((sum,r)=>sum+r.votes,0):b.entries.reduce((sum,e)=>sum+e.onThemeBy.length,0)}))
 .filter(b=>b.score>0).sort((a,b)=>b.score-a.score||b.id-a.id);

export type PlayerStats={
 user:string;total:number;participation:number;votePoints:number;themePoints:number;winBonus:number;
 hosted:number;entered:number;votesCast:number;onThemeGiven:number;comments:number;
 votesReceived:number;onThemeReceived:number;first:number;second:number;third:number;themeLeaderWins:number;
};
export const leaderboardStats=(g:Game):PlayerStats[]=>{
 const users=new Map<string,PlayerStats>();
 const get=(raw:string):PlayerStats=>{
  const user=raw.toLowerCase();
  let stat=users.get(user);
  if(!stat){stat={user,total:0,participation:0,votePoints:0,themePoints:0,winBonus:0,hosted:0,entered:0,votesCast:0,onThemeGiven:0,comments:0,votesReceived:0,onThemeReceived:0,first:0,second:0,third:0,themeLeaderWins:0};users.set(user,stat);}
  return stat;
 };
 for(const b of g.boards){
  if(b.phase==='dismissed')continue;
  const host=hostName(g,b);if(host)get(host).hosted++;
  for(const entry of b.entries){
   const stat=get(entry.user);stat.entered++;
   stat.onThemeReceived+=new Set(entry.onThemeBy).size;
   for(const user of new Set(entry.onThemeBy))get(user).onThemeGiven++;
  }
  for(const ballot of b.votes){
   get(ballot.user).votesCast++;
   const selected=b.entries.find(e=>e.id===ballot.first);
   if(selected)get(selected.user).votesReceived++;
  }
  const perUserComments=new Map<string,number>();
  for(const m of b.discussion){const user=m.user.toLowerCase();get(user);perUserComments.set(user,(perUserComments.get(user)??0)+1);}
  for(const [user,count] of perUserComments)get(user).comments+=Math.min(count,3);
  // Placements are historical finishes, not changing live provisional standings.
  if(b.phase==='done'||b.phase==='choice'){
   const ranked=tally(b).filter(r=>r.votes>0);
   let priorVotes=-1,rank=0;
   ranked.forEach((r,i)=>{
    if(r.votes!==priorVotes){rank=i+1;priorVotes=r.votes;}
    const stat=get(r.entry.user);
    if(rank===2)stat.second++;
    if(rank===3)stat.third++;
   });
   if(b.winner)get(b.winner).first++;
   if(b.themeLeader)get(b.themeLeader).themeLeaderWins++;
  }
 }
 // Participation is awarded once per meaningful action, not for repeat clicks or edits.
 for(const stat of users.values()){
  stat.participation=stat.hosted+stat.entered+stat.votesCast+stat.onThemeGiven+stat.comments;
  stat.votePoints=stat.votesReceived;
  stat.themePoints=stat.onThemeReceived;
  stat.winBonus=stat.first*25;
  stat.total=stat.participation+stat.votePoints+stat.themePoints+stat.winBonus;
 }
 return [...users.values()].sort((a,b)=>b.total-a.total||b.first-a.first||b.votesReceived-a.votesReceived||a.user.localeCompare(b.user));
};

export const leaderboard=(g:Game)=>Object.entries(g.scores).sort((a,b)=>b[1]-a[1]).map(([user,points])=>({user,points}));