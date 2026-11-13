const {chromium,devices}=require('@playwright/test'),http=require('http'),fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const BASELINE='a34de8c8f00f4eb5be17f482cb25e21d03b44ec5',KEY='ttcShiftRecordsV4',META=KEY+'SpareboardV1';
(async()=>{
 const root=path.resolve(__dirname,'..'),old=new Map();
 for(const file of ['index.html','app.js','core.js','spareboard.js','styles.css','service-worker.js','manifest.webmanifest','icon-192.png','icon-512.png'])old.set(file,cp.execFileSync('git',['show',BASELINE+':'+file],{cwd:root,maxBuffer:10*1024*1024}));
 let upgraded=false;
 const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/-ttc-shift-log\//,'')||'index.html';if(name.includes('..'))return res.writeHead(403).end();const file=path.join(root,name);const bytes=upgraded?(fs.existsSync(file)?fs.readFileSync(file):null):old.get(name);if(!bytes)return res.writeHead(404).end();res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(bytes);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({executablePath:process.env.TTC_BROWSER||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':chromium.executablePath()),headless:true});
 const context=await browser.newContext({...devices['Pixel 7']}),page=await context.newPage(),errors=[],dialogs=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 const rows=Array.from({length:79},(_,i)=>({id:'old-'+i,date:'2026-11-12',routes:String(i+1),crew:'9999',run:'99',bus:'9999',scheduledStart:'08:00',scheduledFinish:'16:00',actualFinish:'',actualFinishDay:0,notes:'Historical entry '+i,photos:i<2?[{id:'photo-'+i,data:photo,keep:true}]:[]}));
 const metadata={version:1,days:[],links:[],holidays:[{date:'2026-11-12',minutes:480,notes:'Historical credit'}]},raw=JSON.stringify(rows),metaRaw=JSON.stringify(metadata);
 const base=`http://127.0.0.1:${server.address().port}/-ttc-shift-log/`;
 await page.goto(base);await page.waitForFunction(()=>document.getElementById('assignmentType'));await page.evaluate(({KEY,META,raw,metaRaw})=>{localStorage.setItem(KEY,raw);localStorage.setItem(META,metaRaw);},{KEY,META,raw,metaRaw});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 upgraded=true;await page.reload();await page.waitForFunction(()=>window.TTCStore&&!TTCStore.busy&&document.getElementById('assignmentType'));
 const migrated=await page.evaluate(({KEY,META})=>({records:TTCStore.getItem(KEY),metadata:TTCStore.getItem(META),legacy:localStorage.getItem(KEY),legacyMeta:localStorage.getItem(META),version:document.querySelector('header p').textContent}),{KEY,META});
 assert.equal(migrated.records,raw);assert.equal(migrated.metadata,metaRaw);assert.equal(migrated.legacy,raw);assert.equal(migrated.legacyMeta,metaRaw);assert.match(migrated.version,/19\.2\.2/);assert.equal(dialogs.length,0,'Production migration must never offer to start empty');
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();if(r.waiting)return;if(r.installing)await new Promise(resolve=>{r.installing.addEventListener('statechange',function(){if(this.state==='installed')resolve();});});});
 await page.close();const next=await context.newPage();next.on('pageerror',e=>errors.push(e.message));next.on('dialog',d=>d.accept());
 await next.goto(base);await next.waitForFunction(()=>window.TTCStore&&!TTCStore.busy);
 await context.setOffline(true);await next.reload();await next.waitForFunction(()=>window.TTCStore&&!TTCStore.busy);
 await next.evaluate(async({KEY})=>{const rows=JSON.parse(TTCStore.getItem(KEY));rows.push({...rows[0],id:'new-after-update',routes:'999',notes:'New offline entry',actualFinish:'16:13',paid:'8:00',actualOt:'0:13',paidOt:'0:13',unpaidOt:'0:00'});TTCStore.setItem(KEY,JSON.stringify(rows));await TTCStore.flush();},{KEY});
 await next.reload();await next.waitForFunction(()=>window.TTCStore&&!TTCStore.busy);
 const saved=await next.evaluate(({KEY,META})=>({rows:JSON.parse(TTCStore.getItem(KEY)),meta:TTCStore.getItem(META),legacy:localStorage.getItem(KEY)}),{KEY,META});assert.equal(saved.rows.length,80);assert.deepEqual(saved.rows.slice(0,79),rows);assert.equal(saved.rows[79].paidOt,'0:13');assert.equal(saved.meta,metaRaw);assert.equal(saved.legacy,raw);assert.deepEqual(errors,[]);
 await context.close();console.log('PASS Android-size browser: actual v19.2.1 service-worker upgrade to v19.2.2, automatic migration of 79 synthetic records, photos and holiday metadata, unchanged legacy bytes, offline restart and a new entry alongside all old history.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
