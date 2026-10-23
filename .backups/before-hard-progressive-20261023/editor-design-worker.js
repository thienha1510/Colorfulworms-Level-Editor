/* Runs map generation away from the UI thread. Termination cancels the job. */
importScripts('editor-engine.js?v=20261023-progressive50a','editor-exit-design.js?v=20261023-progressive50a','editor-density.js?v=20261023-progressive50a','editor-auto-generate.js?v=20261023-progressive50a','editor-design-jobs.js?v=20261023-progressive50a');
self.onmessage=async function(event){
 const {id,kind,map,options}=event.data;
 try{
  const result=await CWDesignJobs.run(kind,map,options,progress=>self.postMessage({id,type:'progress',progress}));
  self.postMessage({id,type:'result',result});
 }catch(error){self.postMessage({id,type:'error',error:error?.message||String(error)});}
};
