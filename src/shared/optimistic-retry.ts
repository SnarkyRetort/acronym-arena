/** Shared optimistic concurrency retry loop used by Devvit and local Redis stress tests.
 * A failed EXEC must discard its transaction and re-read all state on the next attempt.
 */
export async function optimisticRetry<TTx,T>(
 open:()=>Promise<TTx>,
 run:(tx:TTx)=>Promise<{ok:true;value:T}|{ok:false}>,
 unwatch:(tx:TTx)=>Promise<unknown>,
 attempts=8,
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
 }
 throw Error('The Arena is busy. Please try the action again.');
}
