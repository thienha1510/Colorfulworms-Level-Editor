const {test}=require('node:test');
const assert=require('node:assert/strict');
const session=require('../editor-session.js');
const original=()=>({map:{XSize:6,YSize:6,worms:[{cells:[[0,0],[1,0]],ice:0}]},target:50,pinned:false,design:null});
test('opening, saving and undoing edits use an explicit checkpoint',()=>{
 const state=session.create(),map=original();state.begin(1,map);assert.equal(state.dirty(map),false);
 map.map.worms[0].ice=2;assert.equal(state.dirty(map),true);state.save(map);assert.equal(state.dirty(map),false);
 map.target=70;assert.equal(state.dirty(map),true);assert.equal(state.discard().target,50);assert.equal(state.discard().map.worms[0].ice,2);
});
test('Reset always restores the opening state, including after a save',()=>{
 const state=session.create(),map=original();state.begin(200,map);map.map.worms=[];map.design={exitMode:'progressive'};state.save(map);
 assert.deepEqual(state.reset(),original());assert.equal(state.dirty(state.reset()),true);
});
test('snapshots are isolated from subsequent map and metadata edits',()=>{
 const state=session.create(),map=original();state.begin(1,map);map.map.worms[0].cells[0][0]=5;map.pinned=true;
 assert.deepEqual(state.reset(),original());const restored=state.discard();restored.map.worms=[];assert.deepEqual(state.discard(),original());
});
test('discard and Reset leave a new empty level empty',()=>{
 const state=session.create(),map=original();map.map.worms=[];state.begin(2,map);const edited=original();assert.equal(state.dirty(edited),true);assert.deepEqual(state.discard(),map);assert.deepEqual(state.reset(),map);
});
test('switching levels starts a fresh session, ending clears dirty state',()=>{
 const state=session.create();state.begin(1,original());const next=original();next.target=90;state.begin(2,next);assert.equal(state.level,2);assert.deepEqual(state.reset(),next);state.end();assert.equal(state.level,null);assert.equal(state.dirty(original()),false);
});
