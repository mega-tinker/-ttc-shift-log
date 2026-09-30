const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const TTC=require('../core.js');
const records=[
 {bus:'6602',camera:'No',date:'2026-09-01',scheduledStart:'08:00'},
 {bus:'6602',camera:'Yes',date:'2026-09-02',scheduledStart:'08:00'},
 {bus:'6602',camera:'Unknown',date:'2026-09-03',scheduledStart:'08:00'},
 {bus:'8899',camera:'No',date:'2026-09-03',scheduledStart:'09:00'}
];
const before=JSON.stringify(records);
assert.equal(TTC.cameraForBus(records,'6602'),'Yes');
assert.equal(TTC.cameraForBus([...records].reverse(),'6602'),'Yes');
assert.equal(TTC.cameraForBus(records,' 6602 '),'Yes');
for(const bus of ['', '660', '9999'])assert.equal(TTC.cameraForBus(records,bus),'Unknown');
assert.equal(TTC.cameraForBus(records,'8899'),'No');
assert.equal(TTC.cameraForBus([...records,{bus:'6602',camera:'No',date:'2026-09-02',scheduledStart:'10:00'}],'6602'),'No');
const nodes={bus:{value:''},camera:{value:'Unknown'}};
const context=vm.createContext({TTC,load:()=>records,$:id=>nodes[id]});
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
vm.runInContext(source.slice(source.indexOf('let cameraBus='),source.indexOf('$("bus").addEventListener')),context);
const fill=()=>vm.runInContext('autofillCamera()',context);
nodes.bus.value='6602';fill();assert.equal(nodes.camera.value,'Yes');
nodes.camera.value='No';fill();assert.equal(nodes.camera.value,'No');
nodes.bus.value='9999';fill();assert.equal(nodes.camera.value,'Unknown');
nodes.bus.value='6602';fill();assert.equal(nodes.camera.value,'Yes');
nodes.bus.value='';fill();assert.equal(nodes.camera.value,'Unknown');
// Loading an edit or restored draft synchronizes the bus without applying a lookup.
nodes.bus.value='6602';nodes.camera.value='Unknown';
vm.runInContext('cameraBus=$("bus").value.trim()',context);
fill();assert.equal(nodes.camera.value,'Unknown');
assert.equal(JSON.stringify(records),before);
assert.ok(source.includes('$("bus").addEventListener("input",autofillCamera)'));
assert.ok(source.includes('$("bus").addEventListener("change",autofillCamera)'));
console.log('PASS: lookup, latest observation, exact matches, overrides, bus switching, draft/edit preservation, no record mutation');
