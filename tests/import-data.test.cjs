const {test} = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../editor-import-data.js');
const file = (name, value, relative = name) => ({ name, webkitRelativePath: relative, text: async () => typeof value === 'string' ? value : JSON.stringify(value) });
const sample = { XSize: 3, YSize: 3, Arrows: [{ Indices: [0, 1] }] };
async function realFiles() {
  const entries = Array.from({length:200},(_,index)=>({levelid:index+1,name:'gen_'+(index+1),wenname:'game-level'}));
  const maps = entries.map(entry=>file(entry.name+'.txt',sample,'game-level/'+entry.name+'.txt'));
  return [...maps,file('level2.json',{level:entries},'game-level/level2.json'),file('level_entries.json',entries,'game-level/level_entries.json')];
}
test('flat game-level folder loads all 200 maps and chooses level2.json', async () => {
  const plan = await importer.prepare(await realFiles(), {directory:true});
  assert.equal(plan.kind, 'maps'); assert.equal(plan.levels.length,200); assert.equal(plan.missing.length,0);
  assert.equal(plan.label,'level2.json'); assert.equal(plan.levels[199].levelid,200); assert.equal(plan.levels[0].wenname,'game-level');
});
test('manifest alone produces a follow-up action, not an empty project', async () => {
  const plan = await importer.prepare([file('level_entries.json', [{levelid:12,name:'gen_12',wenname:'game-level'}])]);
  assert.equal(plan.kind,'manifest'); assert.equal(plan.manifest.entries[0].levelid,12);
});
test('map files without any manifest infer numeric IDs and bundle', async () => {
  const plan = await importer.prepare((await realFiles()).filter(f=>f.name.endsWith('.txt')), {directory:true});
  assert.equal(plan.levels.length,200); assert.equal(plan.levels[9].levelid,10); assert.equal(plan.levels[199].wenname,'game-level');
});
test('manifest preserves explicit sparse IDs, warns about missing maps', async () => {
  const plan = await importer.prepare([file('level2.json',{level:[{levelid:7,name:'gen_7',wenname:'x'},{levelid:19,name:'gen_19',wenname:'x'}]}),file('gen_7.txt',sample,'x/gen_7.txt')]);
  assert.equal(plan.levels[0].levelid,7); assert.equal(plan.missing.length,1);
});
test('duplicate map IDs are rejected', async () => {
  await assert.rejects(importer.prepare([file('gen_1.txt',sample),file('map_1.txt',sample)]),/cùng số/);
});
test('ambiguous duplicate names do not silently select the wrong bundle', async () => {
  await assert.rejects(importer.prepare([file('level_entries.json',[{levelid:1,name:'gen_1',wenname:'missing'}]), file('gen_1.txt',sample,'a/gen_1.txt'),file('gen_1.txt',sample,'b/gen_1.txt')]),/trùng tên/);
});
test('malformed project, empty list and corrupt map are rejected', async () => {
  assert.throws(()=>importer.validateProject([])); assert.throws(()=>importer.validateProject({levels:[]}));
  const project = {levels:[{levelid:1,target:50,name:'gen_1',wenname:'x',map:'{'}]};
  assert.throws(()=>importer.validateProject(project),/lỗi JSON/);
  await assert.rejects(importer.prepare([file('bad.json','{')]),/JSON không hợp lệ/);
});
test('exported project format validates and all maps remain present', async () => {
  const value = {v:2,cfg:{start:1,count:200},levels:Array.from({length:200},(_,i)=>({levelid:i+1,target:50,name:'gen_'+(i+1),wenname:'game-level',map:JSON.stringify(sample)}))};
  assert.equal(importer.validateProject(value).levels.length,200);
  const plan = await importer.prepare([file('project.json',value)]); assert.equal(plan.kind,'project');
});
test('unknown JSON and malformed arrows never reach the renderer', async () => {
  await assert.rejects(importer.prepare([file('bad.txt',{...sample,Arrows:[{Indices:'bad'}]})]),/không phải map/);
  assert.equal(importer.isMap({...sample,yaoShi:'bad'}),false);
});
test('table escapes user-supplied file names', () => {
  assert.equal(importer.escapeHTML('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('direct map file maps to its own numeric ID', async () => {
  const plan = await importer.prepare([file('gen_200.txt',sample)],{startLevel:1});
  assert.equal(plan.levels[0].levelid,200);
});

test('project without config infers its full range', () => {
  const value = importer.validateProject({levels:[{levelid:200,target:50,name:'gen_200',wenname:'game-level',map:JSON.stringify(sample)}]});
  assert.deepEqual(value.cfg,{start:200,count:1});
});
test('duplicate manifest IDs and excessive ranges are rejected', async () => {
  await assert.rejects(importer.prepare([file('level_entries.json',[{levelid:1,name:'a',wenname:'x'},{levelid:1,name:'b',wenname:'x'}])]),/trùng level/);
  await assert.rejects(importer.prepare([file('gen_1.txt',sample),file('gen_600.txt',sample)]),/500/);
});
