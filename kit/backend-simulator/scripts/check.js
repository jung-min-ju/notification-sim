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
const CARD_VIEWS=[[600,'?embed'],[694,''],[695,''],[720,''],[900,''],[1280,'']]; // 그림 안쪽 폭 660 경계(화면 694/695) 전후
const TIMES=[0,200,380,480];
const results=[];const add=(name,ok,detail)=>results.push({name,ok,detail:detail||''});

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
  const scenes=await base.page.evaluate(()=>__sim.scenes),kind=await base.page.evaluate(()=>__sim.kind);
  await base.ctx.close();

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
        const r=await page.evaluate(()=>[...document.querySelectorAll('.card')].map(c=>{const pre=c.querySelector('.code'),vis=pre&&getComputedStyle(pre).display!=='none';
          const lis=[...c.querySelectorAll('.st')];
          return {n:lis.length,over:c.scrollHeight-c.clientHeight,preW:vis?pre.scrollWidth-pre.clientWidth:0,preH:vis?pre.scrollHeight-pre.clientHeight:0,vis,
            bottom:Math.max(...lis.map(li=>li.getBoundingClientRect().bottom),vis?pre.getBoundingClientRect().bottom:0)-c.getBoundingClientRect().bottom}}));
        r.forEach((c,i)=>{const side=i?'오른쪽':'왼쪽',tag=`${s} ${k+1}단계 ${side} · 화면 폭 ${w}${q}(그림 안쪽 폭 ${fw})`;
          if(w===900&&!q&&k===0)add(`단계 3개 · ${s} ${side}`,c.n===3,`${c.n}개`);
          add(`카드 넘침 없음 · ${tag}`,c.over<=1&&c.bottom<=1,`넘친 높이 ${Math.max(c.over,c.bottom).toFixed(0)}px`);
          if(c.vis)add(`코드 상자 잘림 없음 · ${tag}`,c.preW<=1&&c.preH<=1,`가로 ${c.preW} 세로 ${c.preH}`);
        });
        const vis=r.some(c=>c.vis);
        if(k===0&&s===scenes[0])add(`코드 상자 표시 규칙 · 화면 폭 ${w}${q}(그림 안쪽 폭 ${fw})`,vis===(fw>660),vis?'보임':'숨김');
      }
    }
    await ctx.close();
  }
  /* 3. 코드 줄 길이 ≤ 57, 단계 클릭 → 그 시각으로 이동하고 재생 유지 */
  {
    const {ctx,page}=await open(900);
    for(const s of scenes){
      await page.evaluate(id=>__sim.scene(id),s);
      const long=await page.evaluate(()=>{const o=[];['L','R'].forEach(sd=>__sim.cards[sd].steps.forEach((st,k)=>{if(!st.code)o.push(`${sd}${k+1} 코드 없음`);else st.code.lines.concat([st.code.at]).forEach(l=>{if(l.length>57)o.push(`${sd}${k+1}: ${l.length}자 ${l}`)})}));return o});
      add(`코드 줄 57자 이하 · ${s}`,long.length===0,long.join(' / '));
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
      add(`그린 글자 겹침·넘침 없음 · ${s}`,found.size===0,[...found].slice(0,12).join(' / ')+(found.size>12?` 외 ${found.size-12}건`:''));
    }
    await ctx.close();
  }
  /* 5. 상황별·시각별 높이 (삽입 모드, 블로그 본문 720) → iframe 높이 */
  const heights={};
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
  add('pageerror 0개',errors.length===0,errors.join(' / '));
  await browser.close();

  const fail=results.filter(r=>!r.ok);
  const md=[`# 검사 결과 (${new Date().toISOString().slice(0,16)})`,'',`파일: ${file}`,`종류: ${kind} · 상황: ${scenes.join(', ')}`,'',
    `통과 ${results.length-fail.length} / 전체 ${results.length}`,'','## 실패','',fail.length?fail.map(r=>`- ${r.name}: ${r.detail}`).join('\n'):'없음','',
    '## iframe 높이 (삽입 모드, 시각 0·200·380·480초 중 최대)','','| 상황 | 블로그 폭 720 |','|---|---:|',
    ...scenes.map(s=>`| ${s} | ${heights[s+'@720']} |`),'',
    '## 확인 못 한 것 (사람이 볼 것)','','- 사파리, 실제 블로그에 넣은 화면','- 움직이는 동안의 글자 겹침: shots/ 스크린샷으로 직접 본다','- 글 내용이 코드·실측과 맞는지','',
    '## 전체','',...results.map(r=>`- ${r.ok?'통과':'실패'} · ${r.name}${r.detail?' — '+r.detail:''}`)].join('\n');
  fs.writeFileSync(path.join(out,'report.md'),md);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,heights},null,1));
  console.log(md.split('## 전체')[0]);
  process.exit(fail.length?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
