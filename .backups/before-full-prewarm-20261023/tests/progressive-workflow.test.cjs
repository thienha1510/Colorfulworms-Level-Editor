const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const engine=require('../editor-engine.js'),designer=require('../editor-exit-design.js'),jobs=require('../editor-design-jobs.js');
function node(value=''){const classes=new Set();return{value,disabled:false,hidden:false,textContent:'',style:{},dataset:{},open:true,inert:false,children:[],selectedOptions:[{textContent:'test mode'}],classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k)},add(k){classes.add(k)},contains:k=>classes.has(k)},setAttribute(k,v){this[k]=v},addEventListener(){},querySelector(){return null},replaceChildren(){this.children=[]},append(child){this.children.push(child)}};}
function harness(mode='any',runner=jobs){
 const nodes=new Map(),get=key=>{if(!nodes.has(key))nodes.set(key,node());return nodes.get(key)};
 get('#exitMode').value=mode;get('#edDlg').querySelector=()=>get('right');
 let map=engine.empty(12,16,'test'),design={exitMode:mode},undo=0;const statuses=[];
 const api={engine,getMap:()=>map,getLevel:()=>1,getDesign:()=>design,setDesign:value=>{design=value},isBusy:()=>false,setBusy(){},status:(text,error)=>statuses.push({text,error}),getTarget:()=>30,getGeneration:()=>({map:engine.empty(12,16,'test'),options:{count:10,minLen:3,maxLen:8,seed:'workflow',extend:true}}),replaceMap:value=>{map=value;undo++},refreshControls(){get('#undo').disabled=undo===0},selectWorm(){},saveMap(){},openLevel(){}};
 const ctx={window:{},document:{querySelector:get,createElement:()=>node()},CWExitDesign:designer,CWMapTasks:()=>runner,setTimeout(){}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../editor-workflow.js'),'utf8'),ctx);const flow=ctx.window.CWEditorWorkflow(api);flow.opened();
 return{flow,api,get,statuses,map:()=>map,undo:()=>undo};
}
test('all three generator modes publish start/result and commit only certified maps',async()=>{
 for(const mode of ['any','progressive','waves']){const h=harness(mode,{run:jobs.run,stop(){}});const task=h.get('#exitGenerate').onclick();assert.match(h.statuses.at(-1).text,/^0%/);assert.equal(h.get('#edSave').disabled,true);await task;assert.match(h.statuses.at(-1).text,/^100%/);assert.equal(h.undo(),1);assert.equal(designer.analyze(engine,h.map(),mode).matches,true);assert.equal(h.get('#edSave').disabled,false);assert.equal(h.get('#exitStop').hidden,true);assert.equal(h.get('#exitFreeList').children[0].disabled,false);}
});
test('generator errors are red in the board status and preserve the previous map',async()=>{
 const h=harness('progressive',{run:async()=>{throw Error('Bàn không đủ ô')},stop(){}}),before=JSON.stringify(h.map());await h.get('#exitGenerate').onclick();assert.equal(JSON.stringify(h.map()),before);assert.equal(h.undo(),0);assert.match(h.statuses.at(-1).text,/^LỖI/);assert.equal(h.statuses.at(-1).error,true);assert.equal(h.get('#edSave').disabled,false);assert.equal(h.flow.isBusy(),false);
});
test('stopping cancels promptly and ignores a late result',async()=>{
 let finish,stopped=0;const h=harness('any',{run:()=>new Promise(resolve=>finish=resolve),stop(){stopped++}}),before=JSON.stringify(h.map()),task=h.get('#exitGenerate').onclick();h.get('#mapTaskStop').onclick();assert.equal(h.flow.isBusy(),false);assert.equal(stopped,1);assert.match(h.statuses.at(-1).text,/ĐÃ DỪNG/);finish(await jobs.run('generate',engine.empty(12,16,'test'),{mode:'any',count:10,minLen:3,maxLen:8,seed:'late'}));await task;assert.equal(JSON.stringify(h.map()),before);assert.equal(h.undo(),0);
});
test('free worm chips display only numeric IDs but retain accessible descriptions',async()=>{
 const h=harness('any',{run:jobs.run,stop(){}});await h.get('#exitGenerate').onclick();const chips=h.get('#exitFreeList').children;assert.ok(chips.length);for(const chip of chips){assert.match(chip.textContent,/^\d+$/);assert.match(chip['aria-label'],/^Chọn giun /);}
});
test('all difficulty buttons run through the same task and preserve a constrained map on failure',async()=>{
 const kinds=[],h=harness('waves',{run:async(kind)=>{kinds.push(kind);throw Error('Không đạt nhịp')},stop(){}});
 for(const id of ['#exitOptimize','#edSync','#edHarder','#edEasier','#edRegen']){await h.get(id).onclick();assert.match(h.statuses.at(-1).text,/^LỖI/);assert.equal(h.flow.isBusy(),false);}
 assert.deepEqual(kinds,['optimize','target','harder','easier','generate']);assert.equal(h.undo(),0);
});
test('auto generation routes through the selected mode, not the legacy generator',async()=>{
 const h=harness('waves',{run:jobs.run,stop(){}});await h.flow.generateAuto();assert.equal(designer.analyze(engine,h.map(),'waves').matches,true);assert.match(h.statuses.at(-1).text,/^100%/);
});
test('batch Sync preserves a saved constrained level',async()=>{
 const input=engine.empty(12,16,'test'),map=designer.generateWaves(engine,input,{count:10,minLen:3,maxLen:8,seed:'batch'}),entry={levelid:1,name:'test',m:map,design:{exitMode:'waves'},score:20,target:20},saved=JSON.stringify(map);
 const source=fs.readFileSync(path.join(__dirname,'../colorful-worms-editor.js'),'utf8'),begin=source.indexOf('async function Ut('),end=source.indexOf('function qt(',begin);
 const ctx={oe:false,ae:{stop:false},performance,he:null,St:()=>entry,Bt(){},setTimeout,gt:{cfg:{seed:'batch',minLen:3,maxLen:8}},CWExitDesign:designer,CWEditorEngine:engine,M:engine.simulate,L:engine.run,C:engine.choose,O:engine.evaluate,rt(){},pt:{start:1,size:50},Ot(){},Rt(){},Ft(){},zt(){},Jt(){},Mt(a,d){a.score=d.score},X(){throw Error('unconstrained fit must not run')},Kt(){throw Error('ordinary generator must not run')}};
 vm.createContext(ctx);vm.runInContext(source.slice(begin,end),ctx);await vm.runInContext('Ut([1],{mode:"auto",budget:10})',ctx);assert.equal(JSON.stringify(entry.m),saved);
});

test('an unchanged optimization has an explicit result and does not create a fake undo step',async()=>{
 let existing;const h=harness('any',{run:async()=>({map:existing,quality:{score:20},analysis:{free:[]}}),stop(){}});existing=h.map();await h.get('#exitOptimize').onclick();assert.equal(h.undo(),0);assert.match(h.statuses.at(-1).text,/không có thay đổi/);
});

test('automatic adjustments update controls and clear the old constraint warning after one commit',async()=>{
 let resolve;const h=harness('progressive',{run:(kind,input,opts,progress)=>{assert.equal(opts.autoTune,true);progress({stage:'adjust'});return new Promise(done=>resolve=done)},stop(){}});
 const task=h.get('#exitGenerate').onclick();assert.match(h.statuses.at(-1).text,/Đang tự cân chỉnh/);assert.equal(h.get('#exitConstraint').classList.contains('err'),false);
 const result=await jobs.run('generate',engine.empty(12,16),{mode:'progressive',autoTune:true,count:999,minLen:20,maxLen:20,minCoverage:95,seed:'ui'});
 resolve(result);await task;assert.equal(h.undo(),1);assert.equal(h.get('#auCount').value,String(result.map.worms.length));assert.equal(h.get('#auMaxOut').value,String(result.settings.maxLen));assert.match(h.statuses.at(-1).text,/100%.*Đã tự cân chỉnh/);assert.match(h.get('#exitConstraint').textContent,/Đạt tăng lựa chọn/);assert.equal(h.get('#exitConstraint').classList.contains('err'),false);
});
