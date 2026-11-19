#!/usr/bin/env node
/* 시뮬레이터 검사. 사용: node check.js <index.html 경로> [출력 폴더]
   결과: 출력 폴더에 report.md, report.json, 스크린샷(shots/). 실패가 하나라도 있으면 종료 코드 1.
   Playwright 위치: PW_PATH(기본 'playwright'), 브라우저: PLAYWRIGHT_BROWSERS_PATH(기본 /opt/pw-browsers) */
const path=require('path'),fs=require('fs');
process.env.PLAYWRIGHT_BROWSERS_PATH=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';
let pw;try{pw=require(process.env.PW_PATH||'playwright')}catch(e){pw=require('/opt/npm-tools/node_modules/playwright')}
const file=path.resolve(process.argv[2]||'index.html'),out=path.resolve(process.argv[3]||'check-out');
fs.mkdirSync(path.join(out,'shots'),{recursive:true});
const URL='file://'+file;
/* 노트북 화면 전용. 삽입 모드는 블로그 본문 폭(최대 600), 일반 모드는 화면 폭 720 이상 */
const VIEWS=[[600,'?embed'],[720,'?embed'],[720,''],[900,''],[1280,'']];     // 가로 스크롤·비율
const CARD_VIEWS=[[600,'?embed'],[720,'?embed'],[720,''],[900,''],[1280,'']];
const TIMES=[0,200,380,480];
const results=[];const add=(name,ok,detail)=>results.push({name,ok,detail:detail||''});

/* ===== 단계형 뼈대 검사 ===== */
async function stepChecks(open,scenes){
  const VIEWS=[[720,'?embed'],[740,''],[900,''],[1280,'']];
  const ov=(a,b,m=.5)=>a.x+m<b.x+b.w&&b.x+m<a.x+a.w&&a.y+m<b.y+b.h&&b.y+m<a.y+a.h;
  const inside=(a,b,m=.5)=>a.x>=b.x-m&&a.y>=b.y-m&&a.x+a.w<=b.x+b.w+m&&a.y+a.h<=b.y+b.h+m;
  /* 1. CONFIG 내용 */
  {
    const {ctx,page}=await open(900);
    const C=await page.evaluate(()=>JSON.parse(JSON.stringify(__sim.config,(k,v)=>typeof v==='function'?undefined:v)));
    const ids=new Set(C.nodes.map(n=>n.id)),eids=new Set(C.edges.map(e=>e.id)),keys=new Set(C.nodes.flatMap(n=>(n.rows||[]).map(r=>r.key)));
    for(const sc of C.scenes){
      const o=[];
      if(sc.steps.length<3||sc.steps.length>8)o.push(`단계 ${sc.steps.length}개 (3~8)`);
      sc.steps.forEach((st,i)=>{const t=`${i+1}단계`;
        if(!['flow','prob','sum'].includes(st.group))o.push(`${t} group 값`);
        if(!(st.doing&&st.doing.length>=2&&st.doing.length<=4))o.push(`${t} 지금 하는 일 ${st.doing?st.doing.length:0}개 (2~4)`);
        (st.doing||[]).forEach(d=>{if(d.length>36)o.push(`${t} 글머리 ${d.length}자 (36 이하): ${d}`)});
        if(st.title.length>28)o.push(`${t} 제목 ${st.title.length}자 (28 이하)`);
        (st.active||[]).forEach(a=>{if(!ids.has(a))o.push(`${t} 없는 구성요소 ${a}`)});
        (st.msgs||[]).forEach(m=>{if(!eids.has(m.edge))o.push(`${t} 없는 선 ${m.edge}`);Object.keys(m.set||{}).forEach(k=>{if(!keys.has(k))o.push(`${t} 없는 값 줄 ${k}`)})});
        Object.keys(st.notes||{}).concat(Object.keys(st.covers||{})).forEach(a=>{if(!ids.has(a))o.push(`${t} 없는 구성요소 ${a}`)});
        if(!st.src)o.push(`${t} 근거(src) 없음`);
      });
      add(`단계 내용 규칙 · ${sc.id}`,o.length===0,o.join(' / '));
    }
    /* 2. 그림 배치: 구성요소 겹침, 선이 다른 구성요소를 지남, 선끼리 교차, 그림 밖 */
    const o=[];const [VW,VH]=C.view;
    const R=C.nodes.map(n=>({id:n.id,x:n.x,y:n.y,w:n.w,h:n.h}));
    for(let i=0;i<R.length;i++){const a=R[i];if(!inside(a,{x:0,y:0,w:VW,h:VH}))o.push(`${a.id} 그림 밖`);for(let j=i+1;j<R.length;j++)if(ov({x:a.x-4,y:a.y-4,w:a.w+8,h:a.h+8},R[j]))o.push(`${a.id} ↔ ${R[j].id} 너무 가까움`)}
    const segX=(a,b,c,d)=>{const cr=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);const d1=cr(c,d,a),d2=cr(c,d,b),d3=cr(a,b,c),d4=cr(a,b,d);return d1*d2<0&&d3*d4<0};
    const segRect=(a,b,r)=>{const inR=p=>p[0]>r.x&&p[0]<r.x+r.w&&p[1]>r.y&&p[1]<r.y+r.h;if(inR(a)||inR(b))return true;const c=[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]];return [0,1,2,3].some(i=>segX(a,b,c[i],c[(i+1)%4]))};
    const segs=[];C.edges.forEach(e=>{for(let i=1;i<e.pts.length;i++)segs.push({e,a:e.pts[i-1],b:e.pts[i]})});
    segs.forEach(s=>R.forEach(r=>{const sh={x:r.x+1.5,y:r.y+1.5,w:r.w-3,h:r.h-3};if(segRect(s.a,s.b,sh)&&(r.id!==s.e.from&&r.id!==s.e.to||segRect(s.a,s.b,{x:r.x+3,y:r.y+3,w:r.w-6,h:r.h-6})))o.push(`선 ${s.e.id} ↔ ${r.id}`)}));
    for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++)if(segs[i].e!==segs[j].e&&segX(segs[i].a,segs[i].b,segs[j].a,segs[j].b))o.push(`선 ${segs[i].e.id} ↔ 선 ${segs[j].e.id}`);
    /* 구성요소 안 글자가 칸 안에 들어가는지, 값 줄의 이름과 값이 겹치는지 (모든 상황·단계 끝 상태) */
    for(const sc of scenes){await page.evaluate(id=>__sim.scene(id),sc);const n=await page.evaluate(()=>__sim.steps.length);
      for(let k=0;k<n;k++){await page.evaluate(k=>__sim.at(k),k);
        const bad=await page.evaluate(()=>{const out=[];document.querySelectorAll('#svg .n').forEach(g=>{const id=g.dataset.id,n=__sim.config.nodes.find(x=>x.id===id);
          g.querySelectorAll('text').forEach(t=>{if(!t.textContent||t.getAttribute('visibility')==='hidden')return;const b=t.getBBox();if(b.x<n.x+2||b.x+b.width>n.x+n.w-2||b.y<n.y||b.y+b.height>n.y+n.h)out.push(`${id} 글자 넘침 "${t.textContent}"`)});
          const rk=[...g.querySelectorAll('.rk')],rv=[...g.querySelectorAll('.rv')];rk.forEach((k,i)=>{const a=k.getBBox(),b=rv[i].getBBox();if(a.x+a.width+6>b.x)out.push(`${id} 값 줄 겹침 "${k.textContent}" ↔ "${rv[i].textContent}"`)})});return out});
        bad.forEach(b=>o.push(`${sc} ${k+1}단계: ${b}`));}}
    add('그림 배치·구성요소 글자',o.length===0,[...new Set(o)].slice(0,14).join(' / '));
    /* 2-2. CONFIG에 적은 메모·덮개·바뀌는 값이 단계 끝에 실제로 그려졌는지 (2026-11-19: 메모가 주석에 묻혀 안 보이던 버그 뒤 추가) */
    const miss=[];
    for(const sc of scenes){await page.evaluate(id=>__sim.scene(id),sc);const n=await page.evaluate(()=>__sim.steps.length);
      for(let k=0;k<n;k++){await page.evaluate(k=>__sim.at(k),k);
        const r=await page.evaluate(()=>{const s=__sim.steps[__sim.step],out=[];const g=id=>document.querySelector(`#svg .n[data-id="${id}"]`);
          Object.entries(s.notes||{}).forEach(([id,[tx]])=>{const n=g(id),e=n&&n.querySelector('.note');if(!e||e.textContent!==tx||e.getAttribute('fill')==='none')out.push(`메모 "${tx}"(${id}) 안 보임`)});
          Object.entries(s.covers||{}).forEach(([id,tx])=>{const n=g(id),e=n&&n.querySelector('.cvt');if(!e||e.textContent!==tx||e.getAttribute('visibility')!=='visible')out.push(`덮개 "${tx}"(${id}) 안 보임`)});
          (s.msgs||[]).forEach(m=>Object.entries(m.set||{}).forEach(([key,[v]])=>{const t=[...document.querySelectorAll('#svg .rv')].some(e=>e.textContent===v);if(!t)out.push(`값 "${v}"(${key}) 안 보임`)}));
          return out});
        r.forEach(x=>miss.push(`${sc} ${k+1}단계: ${x}`));}}
    add('메모·덮개·바뀌는 값이 실제로 그려짐',miss.length===0,miss.slice(0,12).join(' / '));
    /* 3. 움직이는 메시지 이름표: 지나가는 선의 양끝이 아닌 구성요소와 겹치지 않는지, 그림 밖으로 나가지 않는지 */
    const po=[];
    for(const sc of scenes){await page.evaluate(id=>__sim.scene(id),sc);const n=await page.evaluate(()=>__sim.steps.length);
      for(let k=0;k<n;k++){const us=(await page.evaluate(k=>__sim.msgTimes(k),k)).flatMap((u,j,arr)=>{const d=1/arr.length/4;return [u-d,u,u+d]});
        for(const u of us){await page.evaluate(([k,u])=>__sim.at(k,u),[k,u]);
          const r=await page.evaluate(()=>{const s=__sim.steps[__sim.step],C=__sim.config,out=[];
            document.querySelectorAll('#svg .pill').forEach(p=>{const b=p.getBBox(),lab=p.textContent;const m=(s.msgs||[]).find(m=>m.label===lab)||{};const e=C.edges.find(e=>e.id===m.edge)||{};
              C.nodes.forEach(n=>{if(n.id===e.from||n.id===e.to)return;if(b.x+1<n.x+n.w&&n.x+1<b.x+b.width&&b.y+1<n.y+n.h&&n.y+1<b.y+b.height)out.push(`"${lab}" ↔ ${n.id}`)});
              if(b.x<0||b.y<0||b.x+b.width>C.view[0]||b.y+b.height>C.view[1])out.push(`"${lab}" 그림 밖`)});return out});
          r.forEach(x=>po.push(`${sc} ${k+1}단계: ${x}`));}}}
    add('메시지 이름표 겹침 없음',po.length===0,[...new Set(po)].slice(0,12).join(' / '));
    /* 4. 이동: 다음·이전·단계 클릭·Enter */
    await page.evaluate(id=>__sim.scene(id),scenes[0]);await page.evaluate(()=>__sim.at(0,0));
    await page.click('#next');const a1=await page.evaluate(()=>__sim.step);
    await page.click('#prev');const a2=await page.evaluate(()=>__sim.step);
    await page.locator('#list .st').nth(2).click();await page.waitForTimeout(150);const a3=await page.evaluate(()=>({k:__sim.step,p:__sim.playing}));
    await page.locator('#list .st').nth(1).focus();await page.keyboard.press('Enter');const a4=await page.evaluate(()=>__sim.step);
    add('다음·이전·단계 클릭·Enter',a1===1&&a2===0&&a3.k===2&&a3.p&&a4===1,`다음→${a1} 이전→${a2} 클릭→${a3.k}(재생 ${a3.p}) Enter→${a4}`);
    await ctx.close();
  }
  /* 5. 폭마다: 가로 스크롤, 16:10, 왼쪽 칸·코드 상자 넘침 (모든 상황·단계) */
  const heights={};
  for(const [w,q] of VIEWS){
    const {ctx,page}=await open(w,q);
    const r=await page.evaluate(()=>{const f=document.getElementById('frame').getBoundingClientRect();return {sw:document.documentElement.scrollWidth,fw:f.width,fh:f.height}});
    add(`가로 스크롤 없음 · 폭 ${w}${q}`,r.sw<=w,`scrollWidth ${r.sw}`);
    add(`16:10 이내 · 폭 ${w}${q}`,r.fh<=r.fw/1.6+1,`${r.fw.toFixed(0)}×${r.fh.toFixed(0)}`);
    const o=[];let mx=0;
    for(const sc of scenes){await page.evaluate(id=>__sim.scene(id),sc);const n=await page.evaluate(()=>__sim.steps.length);
      for(let k=0;k<n;k++){await page.evaluate(k=>__sim.at(k),k);
        const c=await page.evaluate(()=>{const s=document.querySelector('.side');return {side:s.scrollHeight-s.clientHeight,h:Math.ceil(document.querySelector('.wrap').getBoundingClientRect().height)}});
        if(c.side>1)o.push(`${sc} ${k+1}단계 왼쪽 칸 ${c.side}px 넘침`);
        if(w===720&&q)heights[`${sc}@720`]=Math.max(heights[`${sc}@720`]||0,c.h);}}
    add(`왼쪽 칸 넘침 없음 · 폭 ${w}${q}`,o.length===0,o.slice(0,10).join(' / '));
    await ctx.close();
  }
  /* 6. 스크린샷: 상황 × 단계 끝(900), 메시지 이동 중 1장씩, 삽입 720 첫 단계, 다크 1장 */
  {const {ctx,page}=await open(900);
    for(const sc of scenes){await page.evaluate(id=>__sim.scene(id),sc);const n=await page.evaluate(()=>__sim.steps.length);
      for(let k=0;k<n;k++){await page.evaluate(k=>__sim.at(k),k);await page.locator('.wrap').screenshot({path:path.join(out,'shots',`${sc}-${k+1}-900.png`)});
        const us=await page.evaluate(k=>__sim.msgTimes(k),k);if(us.length){await page.evaluate(([k,u])=>__sim.at(k,u),[k,us[Math.floor(us.length/2)]]);await page.locator('.main').screenshot({path:path.join(out,'shots',`${sc}-${k+1}-move-900.png`)})}}}
    await ctx.close()}
  {const {ctx,page}=await open(720,'?embed');for(const sc of scenes){await page.evaluate(id=>__sim.scene(id),sc);await page.evaluate(()=>__sim.at(1));await page.locator('.wrap').screenshot({path:path.join(out,'shots',`${sc}-720-embed.png`)})}await ctx.close()}
  {const {ctx,page}=await open(900,'','dark');await page.evaluate(()=>__sim.at(1,.5));await page.locator('.wrap').screenshot({path:path.join(out,'shots','dark-900.png')});await ctx.close()}
  return heights;
}


(async()=>{
  const browser=await pw.chromium.launch();
  const errors=[];
  async function open(w,q='',scheme='light'){
    const ctx=await browser.newContext({viewport:{width:w,height:900},deviceScaleFactor:2,colorScheme:scheme});
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(`${w}${q}: ${e.message}`));
    await page.goto(URL+q);await page.waitForFunction(()=>window.__sim&&document.fonts.ready);
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
    return {ctx,page};
  }
  const base=await open(900);
  const scenes=await base.page.evaluate(()=>__sim.scenes),kind=await base.page.evaluate(()=>__sim.kind),type=await base.page.evaluate(()=>__sim.type||'time');
  await base.ctx.close();
  let heights={};
  if(type==='step'){heights=await stepChecks(open,scenes)}else{

  /* 1. 가로 스크롤 + 16:10 */
  for(const [w,q] of VIEWS){
    const {ctx,page}=await open(w,q);
    const r=await page.evaluate(()=>{const f=document.getElementById('frame').getBoundingClientRect();return {sw:document.documentElement.scrollWidth,fw:f.width,fh:f.height}});
    add(`가로 스크롤 없음 · 폭 ${w}${q}`,r.sw<=w,`scrollWidth ${r.sw}`);
    add(`16:10 이내 · 폭 ${w}${q}`,r.fh<=r.fw/1.6+1,`${r.fw.toFixed(0)}×${r.fh.toFixed(0)}`);
    await ctx.close();
  }
  /* 2. 설명 카드: 단계 3개, 칸 넘침, 코드 상자 잘림 — 상황 × 단계 × 폭 */
  for(const [w,q] of CARD_VIEWS){
    const {ctx,page}=await open(w,q);
    for(const s of scenes){
      await page.evaluate(id=>__sim.scene(id),s);
      const steps=await page.evaluate(()=>__sim.steps);
      for(let k=0;k<steps.length;k++){
        await page.evaluate(t=>__sim.set(t),steps[k]+0.01);await page.waitForTimeout(30);
        const fw=await page.evaluate(()=>document.getElementById('frame').clientWidth);
        const r=await page.evaluate(()=>[...document.querySelectorAll('.card')].map(c=>{const lis=[...c.querySelectorAll('.st')];
          return {n:lis.length,over:c.scrollHeight-c.clientHeight,bottom:Math.max(...lis.map(li=>li.getBoundingClientRect().bottom))-c.getBoundingClientRect().bottom}}));
        r.forEach((c,i)=>{const side=i?'오른쪽':'왼쪽',tag=`${s} ${k+1}단계 ${side} · 화면 폭 ${w}${q}(그림 안쪽 폭 ${fw})`;
          if(w===900&&!q&&k===0)add(`단계 3개 · ${s} ${side}`,c.n===3,`${c.n}개`);
          add(`카드 넘침 없음 · ${tag}`,c.over<=1&&c.bottom<=1,`넘친 높이 ${Math.max(c.over,c.bottom).toFixed(0)}px`);
        });
      }
    }
    await ctx.close();
  }
  /* 3. 단계마다 근거(src), 단계 클릭 → 그 시각으로 이동하고 재생 유지 */
  {
    const {ctx,page}=await open(900);
    for(const s of scenes){
      await page.evaluate(id=>__sim.scene(id),s);
      const nos=await page.evaluate(()=>{const o=[];['L','R'].forEach(sd=>__sim.cards[sd].steps.forEach((st,k)=>{if(!st.src)o.push(`${sd}${k+1}`)}));return o});
      add(`단계마다 근거(src) · ${s}`,nos.length===0,nos.length?'없는 단계: '+nos.join(', '):'');
      const steps=await page.evaluate(()=>__sim.steps);
      const li=page.locator('#sl .st').nth(1);
      await li.click();await page.waitForTimeout(400);
      const t1=await page.evaluate(()=>({t:__sim.t,p:__sim.playing,now:document.querySelectorAll('.st.now').length}));
      add(`단계 누르면 이동·재생 · ${s}`,t1.t>=steps[1]&&t1.t<steps[1]+60&&t1.p&&t1.now===2,`t=${t1.t.toFixed(1)} 목표 ${steps[1].toFixed(1)} 강조 ${t1.now}칸`);
      await page.evaluate(()=>__sim.set(0));
      await page.locator('#sr .st').nth(2).focus();await page.keyboard.press('Enter');await page.waitForTimeout(200);
      const t2=await page.evaluate(()=>__sim.t);
      add(`키보드 Enter로 단계 이동 · ${s}`,t2>=steps[2],`t=${t2.toFixed(1)}`);
    }
    await ctx.close();
  }
  /* 4. 선·상자·글자 겹침 (CONFIG 좌표 기준) */
  {
    const {ctx,page}=await open(900);
    for(const s of scenes){
      await page.evaluate(id=>__sim.scene(id),s);
      const issues=await page.evaluate(()=>{
        const g=document.createElement('canvas').getContext('2d'),o=[];
        const FS=getComputedStyle(document.documentElement).getPropertyValue('--f-ui');
        const tw=(s,size,w)=>{g.font=`${w||600} ${size}px ${FS}`;return g.measureText(s).width};
        const segX=(a,b,c,d)=>{const cr=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);const d1=cr(c,d,a),d2=cr(c,d,b),d3=cr(a,b,c),d4=cr(a,b,d);return d1*d2<0&&d3*d4<0};
        const inRect=(p,r)=>p[0]>r.x&&p[0]<r.x+r.w&&p[1]>r.y&&p[1]<r.y+r.h;
        const segRect=(a,b,r)=>{if(inRect(a,r)||inRect(b,r))return true;const c=[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]];return [0,1,2,3].some(i=>segX(a,b,c[i],c[(i+1)%4]))};
        const ov=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
        __sim.panels.forEach((p,pi)=>{
          const rects=[];
          p.boxes.forEach(b=>{rects.push({k:'상자 '+b.id,x:b.x,y:b.y,w:b.w,h:b.h});
            const lb=typeof b.label==='function'?b.label(0):b.label;
            if(lb){const w=tw(lb,10.5),x=b.labelAlign==='center'?b.x+b.w/2-w/2:b.x;rects.push({k:'이름 '+b.id,x,y:b.y-16,w,h:12})}});
          rects.push({k:'구조 이름·상태',x:0,y:0,w:9999,h:34});
          for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)if(ov(rects[i],rects[j]))o.push(`패널${pi+1}: ${rects[i].k} ↔ ${rects[j].k}`);
          const segs=[];(p.edges||[]).forEach((e,ei)=>{for(let i=1;i<e.pts.length;i++)segs.push({ei,a:e.pts[i-1],b:e.pts[i]})});
          segs.forEach(sg=>rects.forEach(r=>{const sh={x:r.x+1.5,y:r.y+1.5,w:r.w-3,h:r.h-3};if(segRect(sg.a,sg.b,sh))o.push(`패널${pi+1}: 선${sg.ei+1} ↔ ${r.k}`)}));
          for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++)if(segs[i].ei!==segs[j].ei&&segX(segs[i].a,segs[i].b,segs[j].a,segs[j].b))o.push(`패널${pi+1}: 선${segs[i].ei+1} ↔ 선${segs[j].ei+1}`);
          const pw=__sim.panels.length===1?800:392;
          rects.forEach(r=>{if(r.x<0||r.x+r.w>pw&&r.w<9999||r.y+r.h>198)o.push(`패널${pi+1}: ${r.k} 패널 밖`)});
        });
        return [...new Set(o)];
      });
      add(`선·상자·이름 겹침 없음 · ${s}`,issues.length===0,issues.join(' / '));
    }
    await ctx.close();
  }
  /* 4-2. 그려진 글자 겹침: 글자끼리, 글자가 상자 테두리에 걸침, 영역 밖 — 시각 0·200·380·480초와 단계 시각마다 */
  {
    const {ctx,page}=await open(900);
    for(const s of scenes){
      await page.evaluate(id=>__sim.scene(id),s);
      const steps=await page.evaluate(()=>__sim.steps),end=await page.evaluate(()=>__sim.end);
      const ts=[...new Set([...TIMES.filter(t=>t<=end),...steps.map(t=>t+1),...steps.slice(1).map((t,i)=>(t+steps[i])/2),end])].sort((a,b)=>a-b);
      const found=new Set();
      for(const t of ts){
        const L=await page.evaluate(t=>__sim.layout(t),t);
        const tx=L.items.filter(i=>i.kind==='text'),bx=L.items.filter(i=>i.kind==='box');
        const ov=(a,b,m=.5)=>a.x+m<b.x+b.w&&b.x+m<a.x+a.w&&a.y+m<b.y+b.h&&b.y+m<a.y+a.h;
        const inside=(a,b)=>a.x>=b.x-.5&&a.y>=b.y-.5&&a.x+a.w<=b.x+b.w+.5&&a.y+a.h<=b.y+b.h+.5;
        for(let i=0;i<tx.length;i++)for(let j=i+1;j<tx.length;j++)if(tx[i].area===tx[j].area&&ov(tx[i],tx[j]))found.add(`글자 겹침 "${tx[i].s}" ↔ "${tx[j].s}" (t=${Math.round(t)})`);
        tx.forEach(a=>bx.forEach(b=>{if(a.area===b.area&&ov(a,b)&&!inside(a,b))found.add(`글자가 상자 ${b.s} 테두리에 걸침 "${a.s}" (t=${Math.round(t)})`)}));
        tx.forEach(a=>{const bd=L.bounds.find(b=>b.area===a.area);if(bd&&!inside(a,bd))found.add(`글자가 영역 밖 "${a.s}" (t=${Math.round(t)})`)});
      }
      const lost=await page.evaluate(()=>{const out=[];__sim.panels.forEach((p,pi)=>{
          const chk=(arr,f)=>(arr||[]).forEach(x=>{const t=(x.from+Math.min(x.to,__sim.end))/2;if(!isFinite(t))return;const tx=typeof x.text==='function'?x.text(t):x.text;
            const L=__sim.layout(t);if(!L.items.some(i=>i.kind==='text'&&i.s===tx))out.push(`패널${pi+1} ${f} "${tx}" 안 보임 (t=${Math.round(t)})`)});
          chk(p.notes,'메모');chk(p.blocks,'막힘 표시')});return out});
      add(`메모·막힘 표시가 실제로 그려짐 · ${s}`,lost.length===0,lost.slice(0,8).join(' / '));
      add(`그린 글자 겹침·넘침 없음 · ${s}`,found.size===0,[...found].slice(0,12).join(' / ')+(found.size>12?` 외 ${found.size-12}건`:''));
    }
    await ctx.close();
  }
  /* 5. 상황별·시각별 높이 (삽입 모드, 블로그 본문 720) → iframe 높이 */
  for(const w of [720]){
    const {ctx,page}=await open(w,'?embed');
    for(const s of scenes){
      await page.evaluate(id=>__sim.scene(id),s);
      let mx=0;for(const t of TIMES){await page.evaluate(t=>__sim.set(t),t);mx=Math.max(mx,await page.evaluate(()=>Math.ceil(document.querySelector('.wrap').getBoundingClientRect().height)))}
      heights[`${s}@${w}`]=mx;
    }
    await ctx.close();
  }
  /* 6. 스크린샷: 상황 × 단계 (900 일반, 720 삽입), 다크 1장 */
  for(const [w,q] of [[900,''],[720,'?embed']]){
    const {ctx,page}=await open(w,q);
    for(const s of scenes){
      await page.evaluate(id=>__sim.scene(id),s);
      const steps=await page.evaluate(()=>__sim.steps);
      for(let k=0;k<steps.length;k++){
        const t=k===steps.length-1?Math.max(steps[k]+30,await page.evaluate(()=>__sim.end)):(steps[k]+steps[k+1])/2;
        await page.evaluate(t=>__sim.set(t),t);await page.waitForTimeout(40);
        await page.locator(q?'.wrap':'.wrap').screenshot({path:path.join(out,'shots',`${s}-${k+1}-${w}${q?'-embed':''}.png`)});
      }
    }
    await ctx.close();
  }
  {const {ctx,page}=await open(900,'','dark');await page.evaluate(()=>__sim.set(__sim.steps[1]+5));await page.locator('.wrap').screenshot({path:path.join(out,'shots','dark-900.png')});await ctx.close()}
  }
  add('pageerror 0개',errors.length===0,errors.join(' / '));
  await browser.close();

  const fail=results.filter(r=>!r.ok);
  const md=[`# 검사 결과 (${new Date().toISOString().slice(0,16)})`,'',`파일: ${file}`,`뼈대: ${type==='step'?'단계형':'시간형'} · 종류: ${kind} · 상황: ${scenes.join(', ')}`,'',
    `통과 ${results.length-fail.length} / 전체 ${results.length}`,'','## 실패','',fail.length?fail.map(r=>`- ${r.name}: ${r.detail}`).join('\n'):'없음','',
    `## iframe 높이 (삽입 모드, ${type==='step'?'모든 단계':'시각 0·200·380·480초'} 중 최대)`,'','| 상황 | 블로그 폭 720 |','|---|---:|',
    ...scenes.map(s=>`| ${s} | ${heights[s+'@720']} |`),'',
    '## 확인 못 한 것 (사람이 볼 것)','','- 사파리, 실제 블로그에 넣은 화면','- 움직이는 동안의 글자 겹침: shots/ 스크린샷으로 직접 본다','- 글 내용이 코드·실측과 맞는지','',
    '## 전체','',...results.map(r=>`- ${r.ok?'통과':'실패'} · ${r.name}${r.detail?' — '+r.detail:''}`)].join('\n');
  fs.writeFileSync(path.join(out,'report.md'),md);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,heights},null,1));
  console.log(md.split('## 전체')[0]);
  process.exit(fail.length?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
