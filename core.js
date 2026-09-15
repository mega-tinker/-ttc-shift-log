/* TTC rules shared by the form, summaries and import validation. No storage writes. */
(function(root){
  'use strict';
  const minutes=v=>{const m=String(v||'').match(/^(\d+):([0-5]\d)$/);return m?+m[1]*60 + +m[2]:0;};
  const clock=v=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(v));
  const duration=(a,b)=>clock(a)&&clock(b)?(minutes(b)-minutes(a)+1440)%1440:0;
  function late(r){
    if(!r.actualFinish||!clock(r.scheduledFinish)||!clock(r.actualFinish))return 0;
    // Legacy records have no day marker. Retain their explicitly saved overnight intent.
    const extra=r.actualFinishDay===undefined
      ? (minutes(r.actualFinish)<minutes(r.scheduledFinish)&&minutes(r.actualOt)>0?1:0)
      : Number(r.actualFinishDay);
    return Math.max(0,minutes(r.actualFinish)+extra*1440-minutes(r.scheduledFinish));
  }
  const hm=n=>Math.floor(Math.max(0,Math.round(n))/60)+':'+String(Math.max(0,Math.round(n))%60).padStart(2,'0');
  function classify(records){
    const totals=new Map();records.forEach(r=>totals.set(r.date,(totals.get(r.date)||0)+late(r)));
    return records.map(r=>{const a=late(r),paid=totals.get(r.date)>=10;return {...r,paid:hm(duration(r.scheduledStart,r.scheduledFinish)),actualOt:hm(a),paidOt:hm(paid?a:0),unpaidOt:hm(paid?0:a)};});
  }
  function day(records){
    const normal=records.filter(r=>r.overtimeWork!=='Yes').reduce((s,r)=>s+duration(r.scheduledStart,r.scheduledFinish),0);
    const overtime=records.filter(r=>r.overtimeWork==='Yes').reduce((s,r)=>s+duration(r.scheduledStart,r.scheduledFinish),0);
    const actual=records.reduce((s,r)=>s+late(r),0);
    return {platform:normal+overtime,regular:Math.min(480,normal),above8:Math.max(0,normal-480),overtime,actual,paidOt:actual>=10?actual:0,unpaidOt:actual<10?actual:0,stepback:records.reduce((s,r)=>s+(r.stepbackMissed==='Yes'?minutes(r.stepbackTime):0),0)};
  }
  function validate(data){
    const rows=Array.isArray(data)?data:data&&data.format==='TTC Shift Log'&&data.schemaVersion===1?data.records:null;
    if(!Array.isArray(rows))throw Error('Choose a TTC JSON backup (legacy array or v18 backup).');
    const ids=new Set();
    rows.forEach((r,i)=>{
      const fail=msg=>{throw Error('Shift '+(i+1)+': '+msg);};
      if(!r||typeof r!=='object'||Array.isArray(r))fail('invalid record');
      if(typeof r.id!=='string'||!r.id||ids.has(r.id))fail('missing or duplicate record ID');ids.add(r.id);
      if(typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date)fail('invalid date');
      for(const k of ['routes','crew','run','bus'])if(typeof r[k]!=='string'||!r[k].trim())fail('missing '+k);
      for(const k of ['scheduledStart','scheduledFinish'])if(!clock(r[k]))fail('invalid '+k);
      if(r.actualFinish&&!clock(r.actualFinish))fail('invalid actual finish');
      if(r.actualFinishDay!==undefined&&![0,1].includes(r.actualFinishDay))fail('invalid finish day');
      for(const k of ['paid','actualOt','paidOt','unpaidOt','stepbackTime'])if(r[k]&&!/^\d+:[0-5]\d$/.test(r[k]))fail('invalid '+k);
      for(const [k,options] of Object.entries({overtimeWork:['Yes','No'],stepbackMissed:['Yes','No'],camera:['Yes','No','Unknown']}))if(r[k]!==undefined&&!options.includes(r[k]))fail('invalid '+k);
      for(const k of ['notes','incident'])if(r[k]!==undefined&&typeof r[k]!=='string')fail('invalid '+k);
      if(r.photos!==undefined&&!Array.isArray(r.photos))fail('invalid photos');
      const photos=new Set();(r.photos||[]).forEach(p=>{if(!p||typeof p.id!=='string'||photos.has(p.id)||typeof p.data!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(p.data))fail('invalid photo');photos.add(p.id);});
    });
    return rows;
  }
  function fingerprint(r){return ['date','routes','crew','run','bus','scheduledStart','scheduledFinish'].map(k=>String(r[k]||'').trim().toLowerCase()).join('|');}
  function canonical(r){const x={...r,overtimeWork:r.overtimeWork||'No',photos:r.photos||[],actualFinishDay:r.actualFinishDay??(minutes(r.actualFinish)<minutes(r.scheduledFinish)&&minutes(r.actualOt)>0?1:0)};['paid','actualOt','paidOt','unpaidOt','updatedAt','createdAt'].forEach(k=>delete x[k]);const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return JSON.stringify(sort(x));}
  function importPlan(current,incoming){
    const seen=new Set();return incoming.map(r=>{
      const byId=current.find(x=>x.id===r.id),matches=byId?[byId]:current.filter(x=>fingerprint(x)===fingerprint(r));
      if(matches.length>1)throw Error('Multiple current shifts match '+r.date+'. Resolve duplicates before merging.');
      const old=matches[0];if(old&&seen.has(old.id))throw Error('More than one imported shift matches the same current shift.');if(old)seen.add(old.id);
      return {incoming:r,current:old,kind:!old?'new':canonical({...r,id:old.id})===canonical(old)?'identical':'changed'};
    });
  }
  const api={minutes,clock,duration,late,hm,classify,day,validate,fingerprint,importPlan};root.TTC=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
