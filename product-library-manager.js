(async function(){
 const $=s=>document.querySelector(s),api=window.ZZStudioCloudApi;
 if(matchMedia('(max-width:800px)').matches)$('#libraryForm').open=false;
 if(new URLSearchParams(location.search).has('embed')){document.querySelector('header').hidden=true;document.querySelector('main').style.padding='12px';}
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uid=()=>`WH-${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
 let state,busy=false,editingId=null;const selected=new Set();
 const fail=e=>$('#status').textContent=`没有保存：${e.message||e}。请保留表单；如有同步冲突，请先完成另一页面的保存后重新打开产品库。`;
 function render(){
  const q=$('#search').value.trim().toLowerCase(),old=$('#existing').value;
  $('#existing').innerHTML='<option value="">选择图片作品中的已有作品</option>'+state.products.map(p=>`<option value="${esc(p.id)}">${esc(p.brand)} · ${esc(p.name)}</option>`).join('');$('#existing').value=old;
  $('#list').innerHTML=state.warehouseProducts.filter(p=>[p.brand,p.name,p.id].join(' ').toLowerCase().includes(q)).map(p=>`<article class="type" style="margin:0"><label><input type="checkbox" data-id="${esc(p.id)}" ${selected.has(p.id)?'checked':''}>选择</label>${p.image?`<img style="width:100%;height:180px;object-fit:contain" src="${esc(api.resolvePath(p.image))}" alt="${esc(p.name)}">`:'<p>暂无照片</p>'}<strong>${esc(p.name)}</strong><small>${esc(p.brand)} · ${esc(p.specification)}<br>${p.cardComposition?'完整卡片编辑稿':p.settings?'完整单品编辑稿':'图片与商品资料'}</small><div class="pair"><button data-edit="${esc(p.id)}">编辑资料</button><button data-delete="${esc(p.id)}">移入垃圾箱</button></div></article>`).join('')||'<p>产品库里还没有符合条件的商品。</p>';
  $('#import').textContent=`加入图片作品${selected.size?`（已选 ${selected.size} 件）`:''}`;
 }
 function resetForm(){editingId=null;$('#form').reset();$('#formTitle').textContent='添加到产品库';$('#submitProduct').textContent='添加到产品库';$('#cancelEdit').hidden=true;}
 async function commit(change,message){
  if(!state||busy)return false;busy=true;const next=structuredClone(state);document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await change(next);await api.save(next);state=next;render();$('#status').textContent=message;return true;}
  catch(e){fail(e);return false;}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 $('#search').oninput=()=>state&&render();
 $('#list').onchange=e=>{if(!e.target.matches('[data-id]'))return;if(e.target.checked)selected.add(e.target.dataset.id);else selected.delete(e.target.dataset.id);$('#import').textContent=`加入图片作品（已选 ${selected.size} 件）`;};
 $('#cancelEdit').onclick=resetForm;
 $('#copyExisting').onclick=async()=>{if(!state||busy)return;const p=state.products.find(p=>p.id===$('#existing').value);if(!p){$('#status').textContent='请先选择一个已有作品。';return;}await commit(next=>{const copy=structuredClone(p);copy.sourceProductId=p.id;copy.id=uid();next.warehouseProducts.push(copy);},'已复制到产品库，原作品继续保留。');};
 $('#form').onsubmit=async e=>{
  e.preventDefault();if(!state||busy)return;const form=new FormData(e.target),name=String(form.get('name')).trim();if(!name){$('#status').textContent='请填写商品名称。';return;}
  const existing=state.warehouseProducts.find(p=>p.id===editingId),p={...existing,id:editingId||uid(),name,brand:String(form.get('brand')).trim(),specification:String(form.get('specification')).trim(),ageRange:String(form.get('ageRange')).trim(),price:Number(form.get('price'))||0,description:String(form.get('description')),category:existing?.category||'产品库商品',updatedAt:new Date().toISOString().slice(0,10),createdAt:existing?.createdAt||new Date().toISOString(),image:existing?.image||'',images:existing?.images||[]},file=form.get('image');
  const ok=await commit(async next=>{if(file?.size){if(file.size>25*1024*1024)throw Error('图片超过25MB，请缩小后重试');const result=await api.upload(file,file.name,'product');if(!result.ok)throw Error(result.error||'图片上传失败');p.image=result.path;p.images=[result.path];next.assets.push({id:uid(),name:file.name,type:'product',path:result.path,createdAt:p.createdAt});}const index=next.warehouseProducts.findIndex(x=>x.id===p.id);if(index<0)next.warehouseProducts.push(p);else next.warehouseProducts[index]=p;},editingId?'商品资料已更新，其他作品不受影响。':'商品图片和资料已加入产品库。');if(ok)resetForm();
 };
 $('#list').onclick=async e=>{
  const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(!state||busy||(!edit&&!del))return;const p=state.warehouseProducts.find(p=>p.id===(edit?.dataset.edit||del?.dataset.delete));if(!p)return;
  if(edit){$('#libraryForm').open=true;editingId=p.id;for(const key of ['name','brand','specification','ageRange','price','description'])$('#form').elements[key].value=p[key]??'';$('#form').elements.image.value='';$('#formTitle').textContent='编辑商品资料';$('#submitProduct').textContent='保存修改';$('#cancelEdit').hidden=false;$('#formTitle').scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(!confirm('移入垃圾箱后，7天内可以恢复；已制作的图片作品不受影响。'))return;
  const ok=await commit(next=>{const now=Date.now();next.trash.push({trashId:uid(),entityType:'warehouseProduct',entityId:p.id,label:p.name,data:structuredClone(p),deletedAt:new Date(now).toISOString(),deletedAtMs:now,expiresAtMs:now+7*86400000,expiresAt:new Date(now+7*86400000).toISOString()});next.warehouseProducts=next.warehouseProducts.filter(x=>x.id!==p.id);},'已移入垃圾箱，可在工作台7天内恢复。');if(ok){selected.delete(p.id);if(editingId===p.id)resetForm();render();}
 };
 $('#import').onclick=async()=>{if(!state||busy)return;if(!selected.size){$('#status').textContent='请先勾选要加入图片作品的商品。';return;}let count=0;const ok=await commit(next=>{for(const item of next.warehouseProducts.filter(p=>selected.has(p.id))){if(next.products.some(p=>p.warehouseSourceId===item.id))continue;const copy=structuredClone(item);copy.id=uid().replace('WH-','ITEM-');copy.warehouseSourceId=item.id;copy.updatedAtIso=new Date().toISOString();next.products.push(copy);count++;}},'选中商品已经加入过图片作品，无需重复添加。');if(ok&&count)$('#status').textContent=`已将 ${count} 件商品加入图片作品，产品库原件继续保留。`;};
 try{state=await api.state();for(const key of ['warehouseProducts','products','assets','trash'])if(!Array.isArray(state[key]))state[key]=[];render();$('#status').textContent=`产品库共 ${state.warehouseProducts.length} 件商品。`;}catch(e){fail(e);}
})();
