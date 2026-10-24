const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const S=require('../spareboard.js'),T=require('../core.js');
const source=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
(async()=>{
 const legacy=T.validate(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
 const records=legacy.concat([{...legacy[0],id:'oct24',date:'2026-10-24'},{...legacy[0],id:'oct12a',date:'2026-10-12',overtimeWork:'Yes'},{...legacy[0],id:'oct12b',date:'2026-10-12',overtimeWork:'Yes'}]);
 const metadata={version:1,days:[S.blankDay('2026-10-21')],links:[],holidays:[{date:'2026-10-12',minutes:480,notes:'Thanksgiving'},{date:'2026-10-18',minutes:480,notes:'No work'}],holidayLinks:[{id:'oct12a',date:'2026-10-12'},{id:'oct12b',date:'2026-10-12'}]};
 const raw=JSON.stringify(records),metaRaw=JSON.stringify(metadata),dom=new JSDOM(source('index.html'),{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;
 await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));w.confirm=()=>true;w.alert=()=>{};w.scrollTo=()=>{};
 w.localStorage.setItem(S.SHIFT,raw);w.localStorage.setItem(S.KEY,metaRaw);
 for(const n of ['core.js','spareboard.js','app.js'])w.eval(source(n));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const $=id=>w.document.getElementById(id),change=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));},dates=()=>[...$('historyList').querySelectorAll('.day-heading')].map(n=>n.dataset.date);
 assert.deepEqual(dates().slice(0,4),['2026-10-24','2026-10-21','2026-10-18','2026-10-12']);
 for(const row of w.document.querySelectorAll('.holiday-row')){assert.equal(row.previousElementSibling.dataset.date,row.dataset.date);assert.ok(row.previousElementSibling.classList.contains('day-heading'));assert.equal(row.querySelectorAll('button').length,1);assert.ok(!row.textContent.includes('8:00'));}
 assert.equal($('holidayHistoryDays').children.length,0);assert.equal($('sbHistoryDays').children.length,0);
 change('sortOrder','oldest');assert.deepEqual(dates(),[...dates()].sort());
 change('filterAssignment','holiday');assert.deepEqual(dates(),['2026-10-12','2026-10-18']);assert.equal(w.document.querySelectorAll('.rich-shift-card').length,2);
 assert.match($('holidayAllStats').textContent,/All time: 2 holiday\(s\) · 16:00 credit/);
 change('search','No work');assert.deepEqual(dates(),['2026-10-18']);assert.equal(w.document.querySelectorAll('.rich-shift-card').length,0);
 change('search','');change('filterFrom','2026-10-19');assert.equal(dates().length,0);
 assert.equal(w.localStorage.getItem(S.SHIFT),raw);assert.equal(w.localStorage.getItem(S.KEY),metaRaw);
 console.log('PASS unified date order, holiday-only days, both sorts, search/date/assignment filters, unique holiday counts and no storage writes');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
