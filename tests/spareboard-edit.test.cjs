const h=require('./harness.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const S=require('../spareboard.js'),T=require('../core.js');
const source=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const legacy=T.validate((process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):[h.sample]));
async function boot(storage){
 const dom=new JSDOM(source('index.html'),{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;
 await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
 const alerts=[];w.confirm=()=>true;w.alert=t=>alerts.push(t);w.scrollTo=()=>{};
 for(const [k,v]of Object.entries(storage))w.localStorage.setItem(k,v);
 h.install(w);for(const n of ['core.js','spareboard.js','storage.js','app.js'])w.eval(source(n));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await h.bind(w);
 const $=id=>w.document.getElementById(id);
 return {dom,w,$,alerts,rows:()=>JSON.parse(w.localStorage.getItem(S.SHIFT)),meta:()=>JSON.parse(w.localStorage.getItem(S.KEY)),open:async date=>await h.click(w.document.querySelector('[aria-label="Edit Spareboard '+date+'"]'),w)};
}
(async()=>{
 const date='2026-10-21',day=S.blankDay(date),emptyDate='2026-10-22';day.notes='Original shared note';
 const regular={...legacy[0],id:'regular',date,scheduledStart:'06:00',scheduledFinish:'08:00',actualFinish:''};
 const piece={...regular,id:'spare',scheduledStart:'09:00',scheduledFinish:'11:00'};
 const holiday={...regular,id:'holiday',scheduledStart:'12:00',scheduledFinish:'14:00',overtimeWork:'Yes'};
 const records=legacy.concat(T.classify([regular,piece,holiday]));
 const metadata={version:1,days:[day,S.blankDay(emptyDate)],links:[{id:'spare',date}],holidays:[{date,minutes:480,notes:'Keep'}],holidayLinks:[{id:'holiday',date}]};
 let b=await boot({[S.SHIFT]:JSON.stringify(records),[S.KEY]:JSON.stringify(metadata)}),{$,w}=b;
 const raw=w.localStorage.getItem(S.SHIFT);
 assert.equal(w.localStorage.getItem(S.KEY),JSON.stringify(metadata),'opening must not migrate metadata');
 await b.open(date);assert.equal($('sbNotes').value,day.notes);assert.ok($('shiftForm').classList.contains('sb-day-editing'));
 assert.equal($('sbSaveDay').textContent,'Update Spareboard Day');
 $('sbNotes').value='Updated';await h.click($('sbSaveDay'),w);assert.equal(b.meta().days.find(d=>d.date===date).notes,'Updated');assert.equal(w.localStorage.getItem(S.SHIFT),raw);
 await b.open(date);$('sbNotes').value='Unsaved';w.confirm=()=>false;await h.click($('sbCancelDay'),w);assert.ok($('shiftForm').classList.contains('sb-day-editing'));w.confirm=()=>true;await h.click($('sbCancelDay'),w);assert.equal(b.meta().days.find(d=>d.date===date).notes,'Updated');
 // Edit remains reachable while the history details are collapsed.
 const edit=w.document.querySelector('[aria-label="Edit Spareboard '+date+'"]');assert.equal(edit.closest('details'),null);
 await b.open(emptyDate);await h.click($('sbDeleteDay'),w);assert.ok(!b.meta().days.some(d=>d.date===emptyDate));assert.equal(w.localStorage.getItem(S.SHIFT),raw);
 // Recovery is durable after a complete page reload.
 const storage=Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));b.dom.window.close();
 b=await boot(storage);({$,w}=b);await h.click($('sbDeletedList').querySelector('button'),w);assert.ok(b.meta().days.some(d=>d.date===emptyDate));
 // Details-only removes assignment links while preserving every shift byte.
 await b.open(date);await h.click($('sbDeleteDay'),w);assert.equal(w.localStorage.getItem(S.SHIFT),raw);assert.equal(b.meta().links.length,0);assert.deepEqual(b.meta().holidays,metadata.holidays);
 await h.click($('sbDeletedList').querySelector('button'),w);assert.deepEqual(b.meta().links,metadata.links);assert.equal(w.localStorage.getItem(S.SHIFT),raw);
 // Full deletion removes only linked pieces, never all records on that date.
 await b.open(date);$('sbDeleteChoice').value='pieces';await h.click($('sbDeleteDay'),w);assert.equal(b.rows().length,records.length-1);assert.ok(!b.rows().some(r=>r.id==='spare'));assert.deepEqual(b.rows().find(r=>r.id==='regular'),records.find(r=>r.id==='regular'));assert.deepEqual(b.rows().find(r=>r.id==='holiday'),records.find(r=>r.id==='holiday'));assert.deepEqual(b.rows().slice(0,legacy.length),legacy);
 await h.click($('sbDeletedList').querySelector('button'),w);assert.deepEqual(b.rows().find(r=>r.id==='spare'),records.find(r=>r.id==='spare'));
 // Another tab's changes must not be deleted using an old editor.
 await b.open(date);const changed=b.meta();changed.days.find(d=>d.date===date).notes='Other tab';w.localStorage.setItem(S.KEY,JSON.stringify(changed));await h.click($('sbDeleteDay'),w);assert.ok(b.meta().days.some(d=>d.date===date));assert.match(b.alerts.at(-1),/changed elsewhere/);
 // If durable recovery cannot be written, deletion must stop before touching records.
 await b.open(date);const beforeMeta=w.localStorage.getItem(S.KEY),beforeRows=w.localStorage.getItem(S.SHIFT),set=w.TTCStore.setItem;
 w.TTCStore.setItem=function(k,v){if(k===S.KEY+'DeletedDaysV1')throw Error('Storage full');return set.call(this,k,v);};
 await h.click($('sbDeleteDay'),w);assert.equal(w.localStorage.getItem(S.KEY),beforeMeta);assert.equal(w.localStorage.getItem(S.SHIFT),beforeRows);w.TTCStore.setItem=set;
 assert.ok($('dataError').classList.contains('hidden'),$('dataError').textContent);
 b.dom.window.close();console.log('PASS Spareboard edit, cancel, delete scopes, reload recovery, stale-edit protection, storage failure and legacy preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
