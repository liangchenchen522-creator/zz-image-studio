/* Parse inert product HTML, prioritising the actual Product entity over article text. */
(function(){
'use strict';
const number=value=>{let s=String(value??'').replace(/[\s\u00a0₴]/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else s=s.replace(',','.');return /^\d+(?:\.\d+)?$/.test(s)?Number(s):null};
const clean=t=>String(t||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const unitText=t=>clean(t).replace(/(\d)[,.](\d)/g,'$1.$2').replace(/мілілітр\S*|миллилитр\S*|мл/giu,'毫升').replace(/мкг|μg|µg|mcg/gi,'微克').replace(/мг|\bmg\b/gi,'毫克').replace(/\bIU\b|\bUI\b|МО|МЕ/g,'IU').replace(/капсул[аиу]?|капсули/gi,'粒').replace(/таблет[а-яіїєґ]*|\btablets?\b/gi,'片').replace(/крапл[а-яіїєґ]*|капл[а-я]*|\bdrops?\b/gi,'滴').replace(/вітамін[а-яіїєґ]*|витамин[а-я]*|\bvitamin\b/gi,'维生素').replace(/холекальциферол/gi,'胆钙化醇').replace(/кальці[йю]|кальций|calcium/gi,'钙').replace(/магні[йю]|магний|magnesium/gi,'镁').replace(/цинк[а-я]*|\bzinc\b/gi,'锌').replace(/заліз[а-я]*|желез[а-я]*|\biron\b/gi,'铁');
function preciseIntro(name,text){
 const source=String(text||'').replace(/<[^>]*>/g,' ').trim(),all=clean(name+' '+text);const bits=[];
 const pack=String(name).match(/\b\d+(?:[.,]\d+)?\s*(?:мл|ml)(?![a-zа-яіїєґ])|\d+(?:[.,]\d+)?\s*毫升|\d+\s*(?:粒|片|капсул[а-яіїєґ]*|таблет[а-яіїєґ]*)/iu);if(pack)bits.push('规格：'+unitText(pack[0]));
 let found=false;
 // A labelled amount per drop is concentration, never a recommended daily dose.
 const perDrop=all.match(/(\d+(?:[.,]\d+)?)\s*(?:МО|МЕ|IU|UI)\s*(?:[^.;。]{0,25}?)(?:в|у|на|per)\s*1\s*(?:крапл[а-яіїєґ]*|капл[а-я]*|drop)/iu)||all.match(/(?:одна|1)\s*(?:крапл[а-яіїєґ]*|капл[а-я]*|drop)[^.;。]{0,30}?(\d+(?:[.,]\d+)?)\s*(?:МО|МЕ|IU|UI)/iu);
 if(perDrop&&/D\s*3|Д\s*3|维生素D/i.test(all)){bits.push('每1滴：维生素D3 '+perDrop[1].replace(',','.')+'IU');found=true}
 // Preserve the declared serving basis; never divide a serving into an invented drop count.
 const serving=all.match(/(?:1\s*порці[яюї]|на\s*(?:1\s*)?порці[юяї]|每份)\s*\(?\s*(\d+(?:[.,]\d+)?)\s*(мл|ml|毫升)/iu);
 if(serving){const basis=serving[1].replace(',','.')+'毫升';const facts=[];const d=all.match(/(\d+(?:[.,]\d+)?)\s*(?:мкг|微克|mcg|µg)\s*\(\s*(\d+)\s*(?:МО|МЕ|IU|国际单位)\s*\)[^.;。]{0,25}?(?:вітамін[а-яіїєґ]*\s*D3|维生素\s*D3)/iu)||all.match(/(?:вітамін[а-яіїєґ]*\s*D3|维生素\s*D3)[^.;。]{0,70}?(\d+(?:[.,]\d+)?)\s*(?:мкг|微克|mcg|µg)\s*\(\s*(\d+)\s*(?:МО|МЕ|IU|国际单位)/iu);if(d)facts.push('维生素D3 '+d[1].replace(',','.')+'微克（'+d[2]+'IU）');const dha=all.match(/(\d+(?:[.,]\d+)?)\s*(?:мг|mg|毫克)\s*DHA/iu)||all.match(/DHA[^.;。]{0,70}?(\d+(?:[.,]\d+)?)\s*(?:мг|mg|毫克)/iu);if(dha)facts.push('DHA '+dha[1].replace(',','.')+'毫克');if(facts.length){bits.push('每份（'+basis+'）：'+facts.join('；'));found=true}}
 if(!found){
  // Only extract a composition block with an explicit basis, not efficacy or usage prose.
  const marker=source.match(/(?:склад|состав|composition|supplement facts|активні (?:компоненти|речовини)|成分|营养价值)[\s\S]{0,120}?(?:(?:1|2|3|4|5|10)\s*(?:жувальн[а-яіїєґ]*\s*)?(?:капсул[а-яіїєґ]*|таблет[а-яіїєґ]*|пігул[а-яіїєґ]*|крапл[а-яіїєґ]*|порці[а-яіїєґ]*|мл)|每\s*\d+\s*(?:粒|片|滴|毫升))/iu)||source.match(/(?:размер порции|розмір порції|serving size)\s*[:：]?\s*\d+[^\n]{0,60}/iu);
  if(marker){
   const block=source.slice(marker.index,marker.index+2400).split(/(?:допоміжні|другие ингредиенты|other ingredients|спосіб застосування|рекомендації|показання|описание|每日|每天)/iu)[0];
   const basis=marker[0].match(/(\d+)\s*(?:жувальн[а-яіїєґ]*\s*)?(капсул[а-яіїєґ]*|таблет[а-яіїєґ]*|пігул[а-яіїєґ]*|крапл[а-яіїєґ]*|порці[а-яіїєґ]*|мл|粒|片|滴|毫升)/iu);
   const nutrients=[['维生素D3','(?:вітамін|витамин|vitamin|维生素)\\s*[DД]3'],['维生素C','(?:вітамін|витамин|vitamin|维生素)\\s*[CС]'],['维生素B12','(?:вітамін|витамин|vitamin|维生素)\\s*[BВ]12'],['DHA','DHA|ДГК'],['EPA','EPA|ЕПК'],['Omega-3','(?:омега|omega|ω)[ -]?3'],['钙','кальці[йю]|кальций|calcium'],['镁','магні[йю]|магний|magnesium'],['锌','цинк|zinc'],['铁','залізо|железо|iron'],['生物素','біотин|биотин|biotin'],['褪黑素','мелатонін|мелатонин|melatonin']];
   const values=[];
   for(const [label,pattern] of nutrients){const m=block.match(new RegExp('(?:'+pattern+')(?:\\s*\\([^)]{0,100}\\))?[ \\t:：—–-]*(\\d+(?:[.,]\\d+)?)\\s*(мкг|мг|mcg|mg|µg|微克|毫克|IU|МО|МЕ)','iu'));if(m)values.push(label+' '+unitText(m[1]+m[2]))}
   if(basis&&values.length){const raw=basis[2];const u=/капсул|粒/i.test(raw)?'粒':/таблет|пігул|片/i.test(raw)?'片':/крапл|滴/i.test(raw)?'滴':/мл|毫升/i.test(raw)?'毫升':'份';bits.push('每'+basis[1]+u+'：'+values.join('、'));found=true}
  }
 }

 if(/від народження|с рождения|from birth|出生起|0\+/i.test(String(name)+' '+source.slice(0,700)))bits.push('网页标示出生起');
 else{const age=(String(name)+' '+source.slice(0,700)).match(/(?:від|от|from)\s*(\d+)\s*(рок[а-яіїєґ]*|місяц[а-яіїєґ]*|месяц[а-я]*|years?|months?)/iu);if(age)bits.push('网页年龄：'+age[1]+(/міся|меся|month/i.test(age[2])?'个月':'岁')+'起')}
 return {intro:bits.join('；')+(bits.length?'。':''),amountFound:found};
}
function parseHTML(html,url){
 const doc=new DOMParser().parseFromString(html,'text/html');const norm=u=>{try{const x=new URL(u,url);x.hash='';return x.href.replace(/\/$/,'')}catch{return ''}};
 const products=[];function visit(x){if(Array.isArray(x)){x.forEach(visit);return}if(!x||typeof x!=='object')return;const types=Array.isArray(x['@type'])?x['@type']:[x['@type']];if(types.includes('Product'))products.push(x);if(x['@graph'])visit(x['@graph']);if(x.mainEntity)visit(x.mainEntity)}
 for(const script of doc.querySelectorAll('script[type="application/ld+json"]'))try{visit(JSON.parse(script.textContent))}catch{}
 const p=products.find(p=>norm(p.url)===norm(url))||(products.length===1?products[0]:{});const meta=key=>doc.querySelector('meta[property="'+key+'"],meta[name="'+key+'"]')?.getAttribute('content')||'';const text=selector=>clean(doc.querySelector(selector)?.textContent);
 const name=clean(p.name||text('h1')||meta('og:title')||doc.title).slice(0,400);
 let brand=clean(typeof p.brand==='string'?p.brand:p.brand?.name||text('[itemprop="brand"]')||text('.product-manufacturer a[href*="brand"]'));
 if(!brand){const field=Array.from(doc.querySelectorAll('tr')).find(tr=>/^(?:бренд|brand|品牌)$/i.test(clean(tr.querySelector('th')?.textContent)));if(field)brand=clean(field.querySelector('td')?.textContent)}
 if(!brand)brand=['PEDIAKID','Humana','NOW Foods','Solgar','Thorne','Carlson','Nordic Naturals','Nature’s Way','Olidetrim','Dekristolvit','D-Vitum','ROSHEN','HiPP','Bubchen'].find(b=>name.toLowerCase().includes(b.toLowerCase()))||'';
 let offers=Array.isArray(p.offers)?p.offers:[p.offers].filter(Boolean);const offer=offers.find(o=>norm(o.url)===norm(url))||(offers.length===1?offers[0]:{});const currency=offer?.priceCurrency||meta('product:price:currency')||'UAH';let current=/^(UAH|₴|грн)$/i.test(currency)?number(offer?.price||meta('product:price:amount')||text('.info-product__price-new,.current-price [content],.b-product-cost__price')):null;
 const priceNode=doc.querySelector('.product-prices .current-price [content]');if(current==null&&priceNode)current=number(priceNode.getAttribute('content'));
 let old=number(text('.product-prices .regular-price,.regular-price,.ce-product-price-regular,.info-product__price-old,.b-product-cost__old-price').match(/\d[\d\s.,]*(?=\s*(?:₴|грн|$))/u)?.[0]);if(!(old>current&&current>0))old=null;
 const firstImage=v=>typeof v==='string'?v:Array.isArray(v)?firstImage(v[0]):v?.url||v?.contentUrl||'';let image=firstImage(offer?.image)||firstImage(p.image)||meta('og:image')||doc.querySelector('.product-cover img,.info-product__image img')?.getAttribute('src')||'';if(image)try{image=new URL(image,url).href}catch{image=''};
 const sections=Array.from(doc.querySelectorAll('.description-product,.product-description,.product-description-short,.b-user-content,.attribute-specs')).map(e=>e.textContent||'').join('\n');const description=sections||p.description||meta('description');const precise=preciseIntro(name,description);
 return {name,brand,image,current:current>0?current:null,old,priceFrom:new URL(url).hostname==='tabletki.ua',intro:precise.intro,amountFound:precise.amountFound,description:clean(description),currency};
}
window.ZZProductParser={parseHTML,preciseIntro,number};
})();
