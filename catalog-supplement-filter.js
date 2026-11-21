/* Ingredient/product-type filters, not medical efficacy claims. */
(()=>{
 const rules=[
 ['鱼油 / Omega-3 / DHA',/鱼油|рыбий\s*жир|риб[’']?ячий\s*жир|омега|omega\s*[-－]?\s*3|欧米伽|\bDHA\b|\bEPA\b/i],
 ['维生素D / D3',/(?:维生素|vitamin|вітамін|витамин)\s*[dд](?:[ -]?3)?(?![a-zа-яіїєґ0-9])|\bd[ -]?3\b|d-vitum|dekristolvit|olidetrim/i],
 ['钙 / 钙片',/钙|calcium|кальц[іи]й/i],
 ['维生素（全部）',/维生素|vitamin|вітамін|витамин/i],
 ['复合维生素',/复合维生素|多种维生素|维生素复合|22种维生素|multi\s*vitamin|multivitamin/i],
 ['维生素C',/维生素\s*c|vitamin\s*c/i],
 ['B族维生素 / 叶酸',/维生素\s*b|\bb[ -]?(?:1|2|3|5|6|7|9|12)\b|叶酸|folate|folic/i],
 ['铁',/铁|\biron\b|bisglycinate iron/i],
 ['镁 / 锌 / 硒',/镁|锌|硒|magnesium|\bzinc\b|selenium/i],
 ['益生菌 / 膳食纤维',/益生菌|乳酸菌|纤维|probiotic|colicillus|reuteri/i],
 ['胶原蛋白 / 生物素',/胶原|生物素|collagen|biotin/i],
 ['褪黑素 / GABA',/褪黑|melatonin|\bgaba\b/i]
 ];
 const other='其他补充剂',labels=[...rules.map(x=>x[0]),other];
 function tags(r){const text=String(r.name||'');const result=rules.filter(([,test])=>test.test(text)).map(([label])=>label);if(result.some(t=>['维生素D / D3','维生素C','B族维生素 / 叶酸','复合维生素'].includes(t))&&!result.includes('维生素（全部）'))result.push('维生素（全部）');return result.length?result:[other]}
 const isAdult=location.pathname.includes('adult-supplements');
 function eligible(r){return isAdult||r.category==='膳食补充剂'}
 const holder=document.createElement('label');holder.className='supplement-type-control';holder.innerHTML='功能 / 类型<select id="supplementType" aria-label="功能 / 类型"><option value="">全部功能 / 类型</option></select>';
 $('brand').parentElement.after(holder);const hint=document.createElement('small');hint.className='supplement-type-hint';hint.textContent='按品名中明确的成分或产品类型归类，复合配方可归入多个类型；不代表功效或适用建议。';$('selectionFeedback').parentElement.before(hint);
 const select=$('supplementType');const css=document.createElement('style');css.textContent='.supplement-type-control{display:flex;flex-direction:column;gap:6px;min-width:210px;flex:1}.supplement-type-control[hidden]{display:none}.supplement-type-control small{max-width:330px;font-size:11px;font-weight:400;line-height:1.5;color:#68736d}.supplement-type-hint{flex:0 0 100%;width:100%;font-size:11px;font-weight:400;line-height:1.5;color:#68736d}.supplement-type-hint[hidden]{display:none}.controls select{min-height:44px}.supplement-type-control select{width:100%;min-height:44px;font-size:16px}@media(max-width:650px){.supplement-type-control{min-width:0;flex-basis:100%}.supplement-type-control small{max-width:none}}';document.head.appendChild(css);
 function refresh(){const enabled=isAdult||!$('cat').value||$('cat').value==='膳食补充剂';holder.hidden=!enabled;hint.hidden=!enabled;if(!enabled){select.value='';return}const old=select.value,rows=D.rows.filter(r=>eligible(r)&&(!$('cat').value||r.category===$('cat').value)&&(!$('brand').value||r.brand===$('brand').value));const count=new Map(labels.map(l=>[l,0]));for(const r of rows)for(const t of tags(r))count.set(t,count.get(t)+1);select.innerHTML='<option value="">全部功能 / 类型</option>'+labels.filter(l=>count.get(l)>0||l===old).map(l=>'<option value="'+esc(l)+'">'+esc(l)+' · '+count.get(l)+'</option>').join('');if(labels.includes(old))select.value=old}
 window.ZZSupplementTypeFilter={tags,matches:r=>!select.value||(!isAdult&&$('cat').value&&$('cat').value!=='膳食补充剂')||eligible(r)&&tags(r).includes(select.value)};
 const previousBrands=brands;brands=function(){previousBrands();refresh()};
 select.onchange=()=>{filter();updateFeedback();showProducts()};
 for(const id of ['cat','brand'])$(id).addEventListener('change',refresh);
 $('reset').addEventListener('click',()=>{select.value='';refresh();filter();updateFeedback()});
 refresh();filter();updateFeedback();
})();
