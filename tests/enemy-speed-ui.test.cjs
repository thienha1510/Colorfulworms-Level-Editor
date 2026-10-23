const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const speed=require('../game/cw-enemy-speed'),engine=require('../editor-engine');
function fixture(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'0',textContent:'',children:[],append(child){this.children.push(child)},setAttribute(k,v){this[k]=v}});return nodes.get(id)};
 let map=engine.fromGame({XSize:8,YSize:10,Arrows:[{Indices:[1,2]}]}),busy=false,prepared=0;const undo=[],statuses=[];
 const ctx={window:{},CWEnemySpeed:speed,document:{querySelector:get,createElement:()=>({setAttribute(k,v){this[k]=v}})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../editor-enemy-speed-ui.js'),'utf8'),ctx);
 const ui=ctx.window.CWEnemySpeedUI({getMap:()=>map,isBusy:()=>busy,pushUndo:()=>undo.push(JSON.parse(JSON.stringify(map))),changed(){},status:(text,error)=>statuses.push({text,error}),prepare:()=>prepared++});ui.refresh();
 return{get,ui,undo,statuses,map:()=>map,prepared:()=>prepared,busy:value=>busy=value,restore:value=>{map=value;ui.refresh()}};
}
test('slider changes update a draft and its export with one undo checkpoint and a clear result',()=>{
 const f=fixture(),slider=f.get('#enemySpeed');
 for(const index of [0,3,19]){const before=f.undo.length;slider.value=String(speed.ticks[index]);slider.onchange();assert.equal(speed.readMap(f.map()),speed.fromSlider(speed.ticks[index]));assert.equal(f.undo.length,before+1);assert.match(f.statuses.at(-1).text,/Bấm Lưu map/);assert.equal(slider['aria-valuetext'],f.get('#enemySpeedValue').textContent);if(index===19)assert.equal(f.get('#enemySpeedValue').textContent,'x5 - quái đi rất nhanh');assert.equal(engine.toGame(f.map()).enemySpeedMultiplier,speed.fromSlider(speed.ticks[index]));}
 assert.equal(f.prepared(),3);f.restore(f.undo.pop());assert.equal(speed.readMap(f.map()),1);assert.match(f.get('#enemySpeedValue').textContent,/x1 - quái đi bình thường/);
});
test('drag preview does not rewrite the draft; release commits exactly one step, and busy edits are refused',()=>{
 const f=fixture(),slider=f.get('#enemySpeed');slider.value='0.25';slider.oninput();assert.equal(speed.readMap(f.map()),1);assert.equal(f.undo.length,0);assert.match(f.get('#enemySpeedValue').textContent,/0\.25/);slider.onchange();assert.equal(speed.readMap(f.map()),.25);assert.equal(f.undo.length,1);
 f.busy(true);slider.value='4';slider.onchange();assert.equal(speed.readMap(f.map()),.25);assert.equal(f.undo.length,1);
});
test('non-step imported multipliers are displayed accurately until the author chooses a supported step',()=>{
 const f=fixture(),map=f.map();speed.setMap(map,1.3);f.ui.refresh();assert.match(f.get('#enemySpeedValue').textContent,/x1\.3 - quái đi nhanh/);assert.equal(speed.readMap(map),1.3);f.get('#enemySpeed').value='1';f.get('#enemySpeed').onchange();assert.equal(speed.readMap(map),1);
});

test('plus and minus move to adjacent quarter steps, honor limits and busy state',()=>{
 const f=fixture(),minus=f.get('#enemySpeedMinus'),plus=f.get('#enemySpeedPlus');
 plus.onclick();assert.equal(speed.readMap(f.map()),1.25);minus.onclick();assert.equal(speed.readMap(f.map()),1);
 speed.setMap(f.map(),1.3);f.ui.refresh();plus.onclick();assert.equal(speed.readMap(f.map()),1.5);
 speed.setMap(f.map(),1.3);f.ui.refresh();minus.onclick();assert.equal(speed.readMap(f.map()),1.25);
 speed.setMap(f.map(),5);f.ui.refresh();assert.equal(plus.disabled,true);const before=f.undo.length;plus.onclick();assert.equal(f.undo.length,before);
 speed.setMap(f.map(),.25);f.ui.refresh();assert.equal(minus.disabled,true);minus.onclick();assert.equal(f.undo.length,before);
 f.busy(true);f.ui.refresh();plus.onclick();assert.equal(speed.readMap(f.map()),.25);
});

test('HTML exposes the same 20 steps as the runtime and keyboard-accessible fine controls',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html, /id="enemySpeed"[^>]+min="0.25" max="5" step="0.25" value="1"/);
 for(const id of ['enemySpeedMinus','enemySpeedPlus'])assert.match(html,new RegExp('id="'+id+'" type="button" aria-label='));
});
