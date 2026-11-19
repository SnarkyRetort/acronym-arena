export type AiMode = 'ok' | 'free';
export type Phase = 'open' | 'choice' | 'done' | 'dismissed';
export type ThemeMode = 'themed' | 'anything';
export type Entry = { id:number; user:string; answer:string; created:number; edited:number; onThemeBy:string[] };
export type Vote = { user:string; first:number; second?:number; updated:number };
export type Message = { id:number; user:string; body:string; created:number };
export type Board = { id:number; slot:number; letters:string; theme:string; ai:AiMode; phase:Phase; started:number; deadline:number; winner?:string; choiceDeadline?:number; entries:Entry[]; votes:Vote[]; discussion:Message[]; archived:boolean; discardedReason?:string };
export type Game = { version:1; nextId:number; hosts:string[]; boards:Board[]; scores:Record<string,number>; ledger:string[]; themes:string[] };
export const SLOTS=1;
export const DEFAULT_THEMES=['Terrible restaurant specials','Things aliens find confusing','Worst documentary subjects','An awful company slogan','Ridiculous supervillain plans','Unwelcome wedding advice','Things never to say in space','Very bad historical reenactments','Unusual medical diagnoses','Most regrettable inventions','Bad retirement plans','Intergalactic customer complaints','Terrible pet names','The worst superpower','Unfortunate band names','Suspicious fortune cookies'];
export const createGame=(host:string):Game=>({version:1,nextId:1,hosts:[host.toLowerCase()],boards:[],scores:{},ledger:[],themes:[...DEFAULT_THEMES]});
export const aiLabel=(a:AiMode)=>a==='ok'?'🤖 AI OK':'🧠 AI FREE · HONOR SYSTEM';
export const availableSlots=(g:Game)=>Array.from({length:SLOTS},(_,i)=>i+1).filter(slot=>!g.boards.some(b=>b.slot===slot&&(b.phase==='open'||b.phase==='choice')));
export const active=(g:Game)=>g.boards.filter(b=>b.phase==='open'||b.phase==='choice');
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
export const randomLetters=()=>{
 const pool='AAAAABCDEEEEEEEEEFGHIIIIJKLMNNOOOOOPRRRSSSSTTTTTUUUVWY';
 const len=3+Math.floor(Math.random()*4);
 return Array.from({length:len},()=>pool[Math.floor(Math.random()*pool.length)]).join('');
};
export const start=(g:Game,theme:string,ai:AiMode,now=Date.now(),letters=randomLetters(),slot=availableSlots(g)[0]):Board=>{
 if(!slot)throw Error('A challenge is already active. Finish or dismiss it before starting another.');
 if(!theme.trim()||theme.length>100)throw Error('Theme must have 1–100 characters.');
 if(!/^[A-Z]{3,6}$/.test(letters))throw Error('Letters must be 3–6 capital letters.');
 const b:Board={id:g.nextId++,slot,letters,theme:theme.trim(),ai,phase:'open',started:now,deadline:now+86400000,entries:[],votes:[],discussion:[],archived:false};g.boards.push(b);return b;
};
export const boardById=(g:Game,id:number)=>{const b=g.boards.find(b=>b.id===id);if(!b)throw Error('Challenge not found.');return b};
export const enter=(b:Board,user:string,answer:string,now=Date.now())=>{
 if(b.phase!=='open'||now>b.deadline)throw Error('This challenge is closed.');
 const text=parseAnswer(b.letters,answer), prior=b.entries.find(e=>e.user===user);
 if(prior){prior.answer=text;prior.edited=now;return {entry:prior,isNew:false};}
 const entry={id:Math.max(0,...b.entries.map(e=>e.id))+1,user,answer:text,created:now,edited:now,onThemeBy:[]};b.entries.push(entry);return {entry,isNew:true};
};
export const vote=(b:Board,user:string,first:number,second?:number,now=Date.now())=>{
 if(b.phase!=='open'||now>b.deadline)throw Error('Voting is closed.');
 if(new Set(b.entries.map(e=>e.user)).size<2)throw Error('Voting opens when two players have entered.');
 const valid=(id:number)=>b.entries.find(e=>e.id===id&&e.user!==user);
 if(!valid(first))throw Error('Choose another player’s answer for first place.');
 if(second!==undefined&&(!valid(second)||first===second))throw Error('Second place must be a different player’s answer.');
 const previous=b.votes.find(v=>v.user===user);
 if(previous){previous.first=first;previous.second=second;previous.updated=now;}
 else b.votes.push({user,first,second,updated:now});
};
export const endorse=(b:Board,user:string,entryId:number)=>{
 if(b.phase!=='open')throw Error('Endorsements are closed.');
 const e=b.entries.find(e=>e.id===entryId);if(!e||e.user===user)throw Error('Choose another player’s answer.');
 if(e.onThemeBy.includes(user))e.onThemeBy=e.onThemeBy.filter(x=>x!==user);else e.onThemeBy.push(user);
};
export const comment=(b:Board,user:string,body:string,now=Date.now())=>{
 if(b.archived)throw Error('This discussion is archived.');
 const text=norm(body);if(!text||text.length>500)throw Error('Comment must be 1–500 characters.');
 b.discussion.push({id:Math.max(0,...b.discussion.map(m=>m.id))+1,user,body:text,created:now});
};
export const tally=(b:Board)=>b.entries.map(e=>({entry:e, votes:b.votes.reduce((sum,v)=>sum+(v.first===e.id?3:0)+(v.second===e.id?1:0),0)})).sort((a,z)=>z.votes-a.votes);
export const finish=(g:Game,b:Board,now=Date.now())=>{
 if(b.phase!=='open')throw Error('Challenge is not open.');
 const ranked=tally(b);const max=ranked[0]?.votes??0;const winners=ranked.filter(e=>e.votes===max);
 b.winner=max>0&&winners.length===1?winners[0]?.entry.user:undefined;
 for(const row of ranked){const key=`${b.id}:votes:${row.entry.user}`;if(!g.ledger.includes(key)){g.scores[row.entry.user]=(g.scores[row.entry.user]??0)+row.votes;g.ledger.push(key);}}
 if(b.winner){const key=`${b.id}:winner`;if(!g.ledger.includes(key)){g.scores[b.winner]=(g.scores[b.winner]??0)+25;g.ledger.push(key);}}
 b.phase=b.winner?'choice':'done';b.choiceDeadline=b.winner?now+3600000:undefined;b.archived=true;
 return b.winner;
};
export const dismiss=(b:Board)=>{if(b.phase!=='open')throw Error('Challenge is not open.');b.phase='dismissed';b.archived=true};
export const chooseNext=(g:Game,b:Board,user:string,theme:string,ai:AiMode,now=Date.now())=>{
 if(b.phase!=='choice'||b.winner!==user)throw Error('Only this challenge’s winner may select the next theme.');
 if(b.choiceDeadline&&now>b.choiceDeadline)throw Error('Player’s Choice has expired.');
 b.phase='done';return start(g,theme,ai,now,randomLetters(),b.slot);
};
export const advance=(g:Game,now=Date.now())=>{let count=0;for(const b of active(g)){if(b.phase==='open'&&now>=b.deadline){finish(g,b,now);count++;}else if(b.phase==='choice'&&now>=(b.choiceDeadline??0)){b.phase='done';count++;}}return count};
export const leaderboard=(g:Game)=>Object.entries(g.scores).sort((a,b)=>b[1]-a[1]).map(([user,points])=>({user,points}));