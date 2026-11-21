import type { Vote } from './arena';

export type VoteHashStore = {
 hSet(key:string, fields:Record<string,string>):Promise<unknown>;
 hGetAll(key:string):Promise<Record<string,string>>;
};

// A Redis hash field is updated atomically. Different voters never replace
// each other's ballots, even when their requests overlap.
export const storeVote = (store:VoteHashStore,key:string,vote:Vote):Promise<unknown> =>
 store.hSet(key,{[vote.user]:JSON.stringify(vote)});

export const mergeVotes = (legacy:readonly Vote[], fields:Record<string,string>):Vote[] => {
 const votes=new Map(legacy.map(v=>[v.user,v]));
 for(const [user,raw] of Object.entries(fields)){
  const v=JSON.parse(raw) as Vote;
  if(v.user!==user||!Number.isInteger(v.first)||!Number.isFinite(v.updated))throw Error('Corrupt stored vote for '+user);
  votes.set(user,{user,first:v.first,updated:v.updated});
 }
 return [...votes.values()];
};
