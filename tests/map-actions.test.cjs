const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=require('../editor-engine.js'),source=fs.readFileSync(path.join(__dirname,'../colorful-worms-editor.js'),'utf8');new vm.Script(source);
function harness(start,end){const nodes={},messages=[];let undo=0;const get=key=>nodes[key]??={value:''};const ctx={R:engine.fromGame({XSize:6,YSize:6,Arrows:[{Indices:[14,13]}]}),e:get,g:engine.fromGame,E:engine.validate,$:engine.index,Ce(){undo++},nt(){},de(){},Te(){},Pe:(text,error)=>messages.push({text,error})};vm.createContext(ctx);const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);vm.runInContext(source.slice(a,b),ctx);return{ctx,get,messages,undo:()=>undo};}
test('bad resize values report an error without silently shrinking the board',()=>{
 for(const value of ['', 'NaN','1','81','4.5']){const h=harness('e("#bApply").onclick',',e("#bNew").onclick'),before=JSON.stringify(h.ctx.R);h.get('#bW').value=value;h.get('#bH').value='6';h.get('#bApply').onclick();assert.equal(JSON.stringify(h.ctx.R),before);assert.equal(h.undo(),0);assert.equal(h.messages.at(-1).error,true);assert.match(h.messages.at(-1).text,/LỖI/);}
});
test('valid resize takes one undo checkpoint and states the result',()=>{
 const h=harness('e("#bApply").onclick',',e("#bNew").onclick');h.get('#bW').value='7';h.get('#bH').value='8';h.get('#bApply').onclick();assert.equal(h.ctx.R.XSize,7);assert.equal(h.ctx.R.YSize,8);assert.equal(h.undo(),1);assert.match(h.messages.at(-1).text,/Đã đổi kích thước/);
});
test('malformed and overlapping JSON never overwrite the draft',()=>{
 for(const value of ['{broken',JSON.stringify({XSize:6,YSize:6,Arrows:[{Indices:[14,13]},{Indices:[14,13]}]})]){const h=harness('e("#importText").onclick',',e("#edTarget").oninput'),before=JSON.stringify(h.ctx.R);h.get('#json').value=value;h.get('#importText').onclick();assert.equal(JSON.stringify(h.ctx.R),before);assert.equal(h.undo(),0);assert.equal(h.messages.at(-1).error,true);assert.match(h.messages.at(-1).text,/LỖI/);}
});
test('valid JSON still imports and creates an undo checkpoint',()=>{
 const h=harness('e("#importText").onclick',',e("#edTarget").oninput');h.get('#json').value=JSON.stringify({XSize:8,YSize:8,Arrows:[{Indices:[0,1]}]});h.get('#importText').onclick();assert.equal(h.ctx.R.XSize,8);assert.equal(h.undo(),1);assert.match(h.messages.at(-1).text,/Đã nạp/);
});
