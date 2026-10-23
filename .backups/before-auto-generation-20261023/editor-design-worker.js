/* Runs map generation away from the UI thread. Termination cancels the job. */
importScripts('editor-engine.js?v=20261023-density1','editor-exit-design.js?v=20261023-density1','editor-density.js?v=20261023-density1','editor-design-jobs.js?v=20261023-density1');
self.onmessage=async function(event){
 const {id,kind,map,options}=event.data;
 try{
  const result=await CWDesignJobs.run(kind,map,options,progress=>self.postMessage({id,type:'progress',progress}));
  self.postMessage({id,type:'result',result});
 }catch(error){self.postMessage({id,type:'error',error:error?.message||String(error)});}
};
