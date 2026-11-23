/** Shared optimistic concurrency retry loop used by Devvit and local Redis stress tests.
 * WATCH conflicts are expected under load: release the watched transaction, then
 * spread retries out instead of immediately racing the same writers again.
 */
const backoff=async(attempt:number):Promise<void>=>{
 const ceiling=Math.min(64,2**Math.min(attempt+2,6));
 const delay=1+Math.floor(Math.random()*ceiling);
 await new Promise<void>(resolve=>setTimeout(resolve,delay));
};
export async function optimisticRetry<TTx,T>(
 open:()=>Promise<TTx>,
 run:(tx:TTx)=>Promise<{ok:true;value:T}|{ok:false}>,
 unwatch:(tx:TTx)=>Promise<unknown>,
 attempts=24,
 onConflict?:()=>void
):Promise<T>{
 for(let attempt=0;attempt<attempts;attempt++){
  const tx=await open();
  let committed=false;
  try{
   const result=await run(tx);
   if(result.ok){committed=true;return result.value;}
   onConflict?.();
  }finally{
   if(!committed)await unwatch(tx);
  }
  if(attempt+1<attempts)await backoff(attempt);
 }
 throw Error('The Arena is busy. Please try the action again.');
}
