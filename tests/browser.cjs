const {chromium}=require('@playwright/test'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/ttc-shift-log-test\//,'');const file=path.join(root,name||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(b);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
 browser=await chromium.launch({executablePath:process.env.TTC_BROWSER||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':chromium.executablePath()),headless:true});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const base=process.env.TTC_TEST_URL||`http://127.0.0.1:${server.address().port}/ttc-shift-log-test/`;
 await page.goto(base);await page.waitForFunction(()=>window.TTCStore&&!window.TTCStore.busy&&document.getElementById('assignmentType'));
 const settle=()=>page.waitForFunction(()=>!window.TTCStore.busy);
 for(const [k,v]of Object.entries({date:'2026-11-12',routes:'999',crew:'9999',run:'99',bus:'9999',scheduledStart:'08:00',scheduledFinish:'16:00',actualFinish:'16:13'})){await page.locator('#'+k).fill(v);await settle();}
 await page.locator('#shiftForm .primary').click();await page.waitForFunction(()=>document.getElementById('saveMessage').textContent==='Shift saved.');
 assert.equal(await page.evaluate(()=>JSON.parse(TTCStore.getItem('ttcShiftRecordsV4'))[0].paidOt),'0:13');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.waitForFunction(()=>window.TTCStore&&!window.TTCStore.busy);
 assert.equal(await page.evaluate(()=>JSON.parse(TTCStore.getItem('ttcShiftRecordsV4')).length),1);
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.TTCStore&&!window.TTCStore.busy);
 await page.locator('[data-tab="history"]').click();await page.locator('.rich-shift-card .edit-btn').click();await page.locator('#notes').evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await page.locator('#notes').fill('Edited offline');await settle();await page.locator('#shiftForm .primary').click();await page.waitForFunction(()=>document.getElementById('saveMessage').textContent==='Shift updated.',null,{timeout:5000}).catch(async e=>{throw Error(e.message+' '+JSON.stringify(await page.evaluate(()=>({message:document.getElementById('saveMessage').textContent,error:document.getElementById('dataError').textContent,rows:TTCStore.getItem('ttcShiftRecordsV4'),draft:document.getElementById('draftStatus').textContent}))));});
 await page.reload();await page.waitForFunction(()=>window.TTCStore&&!window.TTCStore.busy);assert.equal(await page.evaluate(()=>JSON.parse(TTCStore.getItem('ttcShiftRecordsV4'))[0].notes),'Edited offline');assert.deepEqual(errors,[]);
 console.log('PASS real Edge: IndexedDB save, 13-minute OT, reload persistence, service-worker offline reload, offline edit and second reload.');await context.close();
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
