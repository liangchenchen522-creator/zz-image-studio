/* Validate local photos before upload; keep alpha and reduce oversized camera images. */
window.ZZStudioImageUpload={
 async prepare(file){
  if(!file?.size)throw Error('请选择一张照片');
  if(file.size>25*1024*1024)throw Error('照片超过25MB，请在手机里缩小后重试');
  const url=URL.createObjectURL(file),img=new Image();
  try{
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('这张照片无法读取。iPhone 请先转换为 JPG 或 PNG 后重试。'));img.src=url;});
   if(!img.naturalWidth||!img.naturalHeight)throw Error('照片尺寸无效，请重新选择');
   const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
   if(scale===1&&['image/png','image/jpeg','image/webp'].includes(file.type))return file;
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('手机内存不足，请关闭其他页面后重试');
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const type=file.type==='image/png'?'image/png':'image/jpeg';
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,.9));canvas.width=canvas.height=1;
   if(!blob)throw Error('照片处理失败，请换用较小的 JPG 照片');
   return new File([blob],file.name.replace(/\.[^.]+$/,'')+(type==='image/png'?'.png':'.jpg'),{type});
  }finally{URL.revokeObjectURL(url);}
 }
};
