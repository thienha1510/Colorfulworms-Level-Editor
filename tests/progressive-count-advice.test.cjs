const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../editor-auto-generate');

test('count advice scales with board area and difficulty and stays within supported count',()=>{
 const v=A.progressiveCountAdvice(28,40),h=A.progressiveCountAdvice(28,40,'hard');
 assert.equal(v.available,true);assert.equal(v.low,40);assert.equal(v.high,60);assert.equal(v.recommended,50);assert.equal(v.meanLength,22.4);
 assert.equal(h.recommended,60);assert.deepEqual(A.progressiveCountAdvice(40,28).recommended,v.recommended);
 const large=A.progressiveCountAdvice(80,80);assert.equal(large.recommended,150);assert.equal(large.capped,true);
 for(const profile of ['hard','very-hard'])for(let w=2;w<=80;w++)for(let h=2;h<=80;h++){
  const r=A.progressiveCountAdvice(w,h,profile);if(!r.available)continue;
  assert.ok(r.minimum<=r.low&&r.low<=r.recommended&&r.recommended<=r.high&&r.high<=150);
  assert.ok(r.recommended*2<=w*h);
 }
});

test('invalid, narrow and very small boards do not advertise a suitable count',()=>{
 for(const [w,h] of [[NaN,40],[0,40],[81,40],[28.5,40],[2,80],[4,4]])assert.equal(A.progressiveCountAdvice(w,h).available,false);
 assert.equal(A.progressiveCountAdvice(28,40,'invalid').available,false);
});

test('live advice follows pending size inputs and hides outside progressive mode without changing map controls',()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false});return nodes.get(id)};
 for(const [id,value] of Object.entries({exitMode:'progressive',auW:'28',auH:'40',auWOut:'28',auHOut:'40',auCount:'0',auCountOut:'',progressiveDifficulty:'very-hard'}))get('#'+id).value=value;
 const document={activeElement:null},ctx={e:get,document,CWAutoGenerate:A};vm.createContext(ctx);
 const src=fs.readFileSync(path.join(__dirname,'../colorful-worms-editor.js'),'utf8'),start=src.indexOf('function updateProgressiveCountAdvice(){'),end=src.indexOf('function dn()',start);
 assert.ok(start>=0&&end>start);vm.runInContext(src.slice(start,end),ctx);
 const values=()=>[...nodes].filter(([id])=>/^#au/.test(id)).map(([id,n])=>[id,n.value]);const before=values();
 ctx.updateProgressiveCountAdvice();assert.match(get('#progressiveCountSuggestion').textContent,/40–60.*50/);assert.equal(get('#progressiveCountAdvice').hidden,false);assert.deepEqual(values(),before);
 get('#auWOut').value='30';document.activeElement=get('#auWOut');ctx.updateProgressiveCountAdvice();assert.match(get('#progressiveCountBoard').textContent,/30 × 40/);assert.match(get('#progressiveCountSuggestion').textContent,/55/);assert.equal(get('#auW').value,'28');assert.equal(get('#auCount').value,'0');
 get('#auWOut').value='';ctx.updateProgressiveCountAdvice();assert.match(get('#progressiveCountSuggestion').textContent,/Chưa có/);
 get('#exitMode').value='any';ctx.updateProgressiveCountAdvice();assert.equal(get('#progressiveCountAdvice').hidden,true);
});
