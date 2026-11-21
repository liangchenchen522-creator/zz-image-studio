/* Keep drafts for asynchronously loaded personal rows until their account is verified. */
(function(){
 const kind=location.pathname.includes('adult-supplements')?'supplements':location.pathname.includes('roshen')?'roshen':'antoshka';const prefix=kind==='antoshka'?'zz-antoshka-selection-20261115':kind==='roshen'?'zz-roshen-selection-20261116':'zz-adult-supplements-selection-20261121';
 const read=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))||fallback}catch{return fallback}};
 const draft=read(prefix+'-draft-v1',{});const selection=read(prefix,[]);const entries=Array.isArray(draft.edits)?draft.edits:[];const edits=entries.filter(e=>Array.isArray(e)&&typeof e[0]==='string'&&e[1]&&typeof e[1]==='object').map(([url,raw])=>[url,Object.fromEntries(Object.entries(raw).filter(([key,v])=>['brand','name','intro','exportPriceText'].includes(key)?typeof v==='string':['current','old'].includes(key)&&(v===null||Number.isFinite(v))))]);const p={chosen:Array.isArray(selection)?selection.filter(u=>typeof u==='string'):[],edits,copy:{}};
 for(const [field,key] of Object.entries({name:'titles',intro:'intros',exportPriceText:'prices'}))p.copy[field]=read('zz-catalog-export-'+key+'-v1-'+kind,{});
 window.ZZCatalogPendingDraft=p;
 window.ZZCatalogRetainEdits=entries=>[...p.edits.filter(([u])=>!uniqueRows.has(u)),...entries];
 window.ZZCatalogRetainSelection=entries=>[...new Set([...p.chosen.filter(u=>!uniqueRows.has(u)),...entries])];
 window.ZZCatalogRetainCopy=field=>Object.fromEntries(Object.entries(p.copy[field]||{}).filter(([u])=>!uniqueRows.has(u)));
})();
