/* Four independent compositions; all coordinates use the editor's 1080 × 1440 design space. */
window.ZZCreativeTemplates = (() => {
  const modes = {
    scrapbook: ['奶油手账 · 好物笔记', '官方图与实拍错落拼贴，配撕纸便签和暖黄价格章。'],
    bulletin: ['蓝黄看板 · 选品消息', '清晰标题与独立价格牌，实拍、细节和说明各自分区。'],
    bento: ['Bento · 产品档案', '品牌、价格、图片与资料装进独立圆角盒子。'],
    editorial: ['留白杂志 · 单品橱窗', '大幅主图、双色细线与双栏介绍，安静展示单品。']
  };
  function draw({model:m,ctx:c,text:t,photo:p}) {
    if (!modes[m.mode]) return false;
    const blue='#3b78b8', yellow='#f4c44e', ink='#314c60', muted='#62716d';
    const items=m.items, first=items[0]||{}, second=items[1]||{};
    const rect=(x,y,w,h,fill,r=24,stroke='')=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}};
    const txt=(s,x,y,w,h,size=24,weight=400,col=ink)=>t(s,x,y,w,h,size,col,weight);
    const line=(x,y,w,col)=>{c.fillStyle=col;c.fillRect(x,y,w,2);};
    const logo=(x=65,y=55,w=90)=>p(m.logo,x,y,w,76);
    const price=(x,y,w=215,h=140)=>{rect(x,y,w,h,'#fff1be',24);txt('参考价格',x+22,y+16,w-44,32,19,500);txt(m.cardPrice!==''?`¥${m.cardPrice}`:'价格待填写',x+22,y+50,w-44,65,m.cardPrice!==''?45:24,750);txt(m.cardDate||'',x+22,y+h-33,w-44,26,16,400,muted);};
    const footer=(y=1340)=>{line(65,y,950,'#dcded4');txt(m.note||[m.cardCode, '详细资料与价格请询问'].filter(Boolean).join(' · '),65,y+16,950,48,19,400,muted);};
    const sticker=(path,x,y,w,h,angle)=>{c.save();c.translate(x+w/2,y+h/2);c.rotate(angle);c.shadowColor='#6b604529';c.shadowBlur=20;c.shadowOffsetY=9;rect(-w/2,-h/2,w,h,'#fffefb',8);c.shadowColor='transparent';p(path,-w/2+16,-h/2+16,w-32,h-62);c.restore();};
    c.fillStyle=m.background||'#f7f3e9';c.fillRect(0,0,1080,1440);
    if(m.mode==='scrapbook'){
      c.strokeStyle='#ded8c54d';c.lineWidth=1;for(let x=0;x<1080;x+=36){c.beginPath();c.moveTo(x,0);c.lineTo(x,1440);c.stroke();}for(let y=0;y<1440;y+=36){c.beginPath();c.moveTo(0,y);c.lineTo(1080,y);c.stroke();}
      logo();c.save();c.translate(870,95);c.rotate(.055);rect(-145,-27,290,54,'#dbe9ee',4);txt(m.brand||'我的选品笔记',-125,-22,250,42,24,600);c.restore();
      txt(m.title,65,166,950,125,46,750);txt(m.intro,68,293,900,65,23,400,muted);
      sticker(first.image,90,385,520,490,-.055);sticker(second.image,565,545,410,390,.06);
      c.save();c.translate(276,386);c.rotate(-.055);rect(0,0,170,32,'#f3d782b3',2);c.restore();
      c.beginPath();c.moveTo(65,960);for(let x=65;x<=1015;x+=19)c.lineTo(x,960+(Math.round((x-65)/19)%2?8:0));c.lineTo(1015,1305);c.lineTo(65,1305);c.closePath();c.fillStyle='#fffdf5';c.fill();
      txt(first.name||'好物小记',95,990,650,52,29,700);txt(first.description,95,1053,650,218,Number(m.fontSize),400,muted);
      c.beginPath();c.arc(887,1185,103,0,Math.PI*2);c.fillStyle=yellow;c.fill();txt('参考价',822,1122,140,36,20,600);txt(m.cardPrice!==''?`¥${m.cardPrice}`:'待填写',810,1164,155,65,39,750);footer();
    }else if(m.mode==='bulletin'){
      rect(35,35,1010,1370,'#fffdf7',28);rect(35,35,1010,415,'#e2eff8',28);rect(742,35,303,415,'#f8e5a7',28);
      logo(65,62,225);txt(m.brand||'选品更新',65,169,620,40,22,600,blue);txt(m.title,65,225,640,165,51,750);price(772,170,240,173);
      txt(m.intro,65,465,950,80,24,400,muted);rect(65,570,480,690,'#f3f0e6',18);p(first.image,78,583,454,585);txt(first.name||'实拍记录',88,1190,430,56,25,650);
      rect(568,570,447,338,'#f1f6f8',18);p(second.image,584,584,415,248);txt(second.name||'产品细节',590,847,400,48,25,650);
      rect(568,930,447,330,'#faf1d9',18);txt('产品说明',590,951,400,48,26,700);txt(first.description||second.description,590,1008,400,230,Number(m.fontSize),400,muted);footer(1300);
    }else if(m.mode==='bento'){
      logo();txt(m.brand||'PRODUCT NOTES',185,78,760,50,24,650,blue);
      rect(55,175,685,210,'#fffefa',30);txt(m.title,80,198,635,122,43,750);txt(m.intro,80,327,635,44,21,400,muted);price(760,175,265,210);
      rect(55,405,970,480,'#fffefa',30);const photos=items.filter(i=>i.image);const n=Math.max(1,Math.min(4,photos.length)),cols=n===1?1:2,rows=Math.ceil(n/cols),w=910/cols,h=420/rows;for(let i=0;i<n;i++)p(photos[i]?.image,85+(i%cols)*w,435+Math.floor(i/cols)*h,w-12,h-12);
      [m.cardAge&&`适用年龄 · ${m.cardAge}`,first.specification,m.cardTag].filter(Boolean).slice(0,3).forEach((v,i)=>{rect(55+i*328,909,314,58,i===1?'#fff0bd':'#e6eff4',29);txt(v,73+i*328,919,278,36,20,600);});
      rect(55,995,475,315,'#fffefa',28);rect(550,995,475,315,'#fffefa',28);[first,second].forEach((item,i)=>{const x=80+i*495;txt(item.name||['产品资料','补充说明'][i],x,1016,425,48,27,700);txt(item.description,x,1080,425,207,Number(m.fontSize),400,muted);});footer();
    }else{
      logo(65,52,72);txt(m.brand||'THE LITTLE COLLECTION',165,72,800,42,22,500,blue);
      txt(m.title,65,161,950,144,51,700);line(65,322,705,blue);line(770,322,245,yellow);txt(m.intro,65,343,950,62,23,400,muted);
      rect(65,440,950,590,'#fffefa',4,'#deded4');p(first.image,88,460,904,545);rect(82,996,238,52,'#e2edf3',10);txt(m.cardTag||'单品记录',102,1004,208,37,21,600);price(777,904,220,143);
      txt(first.name||'产品介绍',65,1080,610,50,27,650);const paragraphs=String(first.description||'').split('\n\n');const split=Math.ceil(paragraphs.length/2);txt(paragraphs.slice(0,split).join('\n\n'),65,1145,300,180,Number(m.fontSize),400,muted);txt(paragraphs.slice(split).join('\n\n')||second.description,393,1145,300,180,Number(m.fontSize),400,muted);
      p(m.logo,750,1110,250,100);txt([m.cardCode,m.cardAge&&`适用年龄 ${m.cardAge}`].filter(Boolean).join('\n'),750,1230,250,98,20,500);footer(1350);
    }
    return true;
  }
  return {modes,draw};
})();
