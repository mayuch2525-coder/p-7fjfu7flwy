/* build.py の集計ロジックを1か月単位に移植したもの（ブラウザ/Node共通）。
   入力: SheetJSのworkbook群, 対象提供月 ym, 同年度の他月の単価統計(推計月用)
   出力: 実名・実コードを含む「生」月次集計（呼び出し側でマスクしてから保存） */
(function(root){
'use strict';
const isNA=v=>v===null||v===undefined||(typeof v==='number'&&isNaN(v));
const S=v=>{ if(isNA(v)) return 'nan'; if(typeof v==='number') return Number.isInteger(v)?String(v):String(v); return String(v); };
const nz=v=>isNA(v)?'':S(v).replace(/[\s\u3000]+/g,'');
const toNum=v=>{ if(isNA(v)) return NaN; if(typeof v==='number') return v; const t=String(v).trim(); if(t===''||!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return NaN; return Number(t); };
const wa2ym=s=>{ const m=/([RH])(\d+)年(\d+)月/.exec(S(s)); if(!m) return null; const y=+m[2]+(m[1]==='R'?2018:1988); return y+'-'+String(+m[3]).padStart(2,'0'); };
const fyOf=ym=>{ const y=+ym.slice(0,4), m=+ym.slice(5,7); return m>=4?y:y-1; };
const nsum=a=>{ let s=0; for(const x of a) if(!isNA(x)) s+=x; return s; };
const K=(...a)=>a.join('\u0001');
function pyRound(x,n){ const f=Math.pow(10,n), y=x*f, fl=Math.floor(y), d=y-fl; let r; if(d===0.5) r=(fl%2===0)?fl:fl+1; else r=Math.round(y); return r/f; }
function roundHalfEven(x){ return pyRound(x,0); }
function median(a){ const b=a.slice().sort((x,y)=>x-y), n=b.length; if(!n) return NaN; return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2; }
// --- date parse (②: Excel日付 or 文字列) ---
function parseDate(v,XLSX){
  if(isNA(v)) return null;
  if(v instanceof Date) return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
  if(typeof v==='number'){ const d=XLSX.SSF.parse_date_code(v); if(!d) return null; return d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0'); }
  const m=/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/.exec(String(v)); if(!m) return null;
  return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
}
// --- sheet reading ---
function sheetTables(wb,XLSX,headerKey){
  const out=[];
  for(const sh of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sh],{header:1,raw:true,defval:null,blankrows:true});
    let h=-1; for(let i=0;i<Math.min(6,rows.length);i++){ if((rows[i]||[]).some(v=>!isNA(v)&&S(v)===headerKey)){h=i;break;} }
    if(h<0) continue;
    const hdr=rows[h].map(v=>isNA(v)?null:S(v)); const idx={}; hdr.forEach((c,i)=>{ if(c!==null&&!(c in idx)) idx[c]=i; });
    out.push({sheet:sh,idx,rows:rows.slice(h+1)});
  }
  return out;
}
function classify(wb,XLSX,CFG){
  for(const t of CFG.types){
    const tabs=sheetTables(wb,XLSX,t.headerKey); if(!tabs.length) continue;
    if(!t.detect.every(c=>c in tabs[0].idx)) continue;
    if(t.match){ let any=false,all=true; for(const tb of tabs){ const j=tb.idx[t.match.column]; if(j===undefined){all=false;break;}
        for(const r of tb.rows){ const v=r[j]; if(isNA(v)||S(v).trim()==='') continue; any=true; if(!S(v).startsWith(t.match.allStartWith)){all=false;break;} } if(!all)break; }
      if(!(any&&all)) continue; }
    return {type:t,tabs};
  }
  return null;
}
const g=(tb,r,col)=>{ const j=tb.idx[col]; return j===undefined?null:(r[j]===undefined?null:r[j]); };

// ---------- ① ----------
function loadA(files,CFG){
  const SV=new Set(CFG.services); const a=[]; let raw=0;
  for(const f of files){ const t=f.type,c=t.cols; const rw=(t.svcRewrite||[]).map(([p,r])=>[new RegExp(p),r]);
    for(const tb of f.tabs) for(const r of tb.rows){ raw++;
      let svc=g(tb,r,c.svc); const code=g(tb,r,c.code);
      if(!isNA(svc)){ svc=S(svc); for(const [re,rep] of rw) if(re.test(svc)) svc=rep; }
      if(isNA(svc)||!SV.has(svc)||isNA(code)) continue;
      const n=x=>{const v=toNum(g(tb,r,x)); return isNaN(v)?0:v;};
      a.push({code:S(code),name:g(tb,r,c.name),child:g(tb,r,c.child),ym:wa2ym(g(tb,r,c.ym)),sub:wa2ym(g(tb,r,c.subm)),svc,
        total:n(c.total),futan:n(c.futan),kouhi:n(c.kouhi),josei:n(c.josei),file:f.name}); } }
  // 返戻・再請求: 同一 提供月×利用者×サービス は最新提出月のみ
  const grp=new Map(); for(const r of a){ if(r.ym===null) continue; const k=K(r.code,r.ym,r.svc); if(!grp.has(k)) grp.set(k,[]); grp.get(k).push(r); }
  const keep=[]; let dupG=0,dupR=0,dropped=0;
  for(const [k,rs] of grp){ const subs=rs.map(r=>r.sub).filter(s=>s!==null); const mx=subs.length?subs.sort().at(-1):null;
    if(rs.length>1){dupG++;dupR+=rs.length;}
    for(const r of rs){ if(mx!==null&&r.sub===mx) keep.push(r); else dropped++; } }
  return {a:keep,info:{raw_rows:raw,detail_rows:keep.length,dup:{groups:dupG,rows:dupR,dropped}}};
}
// ---------- ② ----------
function loadB(files,CFG,XLSX){
  const b=[]; const st={raw:0,jisshi:0,test:0,billable:0};
  for(const f of files){ const t=f.type,c=t.cols; const nb=new RegExp(t.nonBillable.join('|'));
    for(const tb of f.tabs) for(const r of tb.rows){ st.raw++;
      const stt=g(tb,r,c.status); if(!(isNA(stt)||S(stt)===t.okStatus)) continue; st.jisshi++;
      const content=g(tb,r,c.content); if(nb.test(S(content))) continue;
      if(S(g(tb,r,c.instr)).includes(t.testWord)||S(g(tb,r,c.note)).includes(t.testWord)){st.test++;continue;}
      const cs=isNA(content)?null:S(content); if(cs===null||!(cs in t.contentMap)) continue;
      const date=parseDate(g(tb,r,c.date),XLSX); const ma=toNum(g(tb,r,c.minAct)), mp=toNum(g(tb,r,c.minPlan));
      const code=g(tb,r,c.code);
      b.push({date,ym:date?date.slice(0,7):null,min:!isNaN(ma)?ma:(!isNaN(mp)?mp:0),svc:t.contentMap[cs][0],sub:t.contentMap[cs][1],
        staff:nz(g(tb,r,c.staff)),staffRaw:g(tb,r,c.staff),client:nz(g(tb,r,c.client)),clientRaw:g(tb,r,c.client),code0:isNA(code)?null:S(code)}); } }
  st.billable=b.length; return {b,info:st};
}
// ---------- ③ ----------
function loadC(files,CFG){
  const c=[];
  files.forEach((f,src)=>{ const t=f.type,cc=t.cols; const kas=new RegExp(t.kasan), kex=new RegExp(t.kasanExclude);
    for(const tb of f.tabs) for(const r of tb.rows){
      const scode=g(tb,r,cc.scode), sname=g(tb,r,cc.sname); if(isNA(scode)||isNA(sname)) continue;
      const sc=S(scode); let svc=t.codePrefix[sc.slice(0,2)]||null; const kind=S(g(tb,r,cc.kind));
      for(const p in t.kindStartsWith) if(kind.startsWith(p)) svc=t.kindStartsWith[p];
      if(!svc) continue;
      const u=toNum(g(tb,r,cc.units));
      const ds=S(g(tb,r,cc.date)).replace(/\s*\(.*/s,''); const m=/R(\d+)年(\d+)月(\d+)日/.exec(ds);
      const date=m?(+m[1]+2018)+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[3]).padStart(2,'0'):null;
      const sn=S(sname);
      const sub=svc!=='居宅介護'?'':(kind.includes('家事')?'家事':kind.includes('身体')?'身体':kind.includes('通院')?'通院':'');
      const code=g(tb,r,cc.code);
      const names=new Set([nz(g(tb,r,cc.name)),nz(g(tb,r,cc.child))].filter(x=>x));
      c.push({src,code:isNA(code)?null:S(code),svc,units:isNaN(u)?0:u,date,ym:date?date.slice(0,7):null,kasan:kas.test(sn)&&!kex.test(sn),sub,names,
        name:g(tb,r,cc.name),child:g(tb,r,cc.child)}); } });
  return c;
}
const labOf=(svc,sub,CFG)=>svc==='居宅介護'?(CFG.kyotakuSub[sub]||'居宅介護(内訳不明)'):svc;

/* files: [{name, wb}] ; ym: 'YYYY-MM' ; opts.ypuStats: 同年度の他月 [{y:{svc:{y,u}}, ido:[..]}] */
function aggregateMonth(files,ym,CFG,XLSX,opts){
  opts=opts||{}; const LABS=CFG.labs;
  const cls=[],unknown=[];
  for(const f of files){ const r=classify(f.wb,XLSX,CFG); if(r) cls.push({name:f.name,type:r.type,tabs:r.tabs}); else unknown.push(f.name); }
  cls.sort((x,y)=>x.type.order-y.type.order);
  const by=role=>cls.filter(f=>f.type.role===role);
  const {a,info:ainfo}=loadA(by('A'),CFG); const {b,info:binfo}=loadB(by('B'),CFG,XLSX); const c=loadC(by('C'),CFG);
  const months=[ym];
  const A=a.filter(r=>r.ym===ym);
  // cu: ③単位 合計（利用者×月×サービス）
  const cu=new Map(); for(const r of c){ if(r.ym===null||r.code===null) continue; const k=K(r.ym,r.code,r.svc); cu.set(k,(cu.get(k)||0)+r.units); }
  const ay=new Map(); for(const r of A){ const k=K(r.ym,r.code,r.svc); ay.set(k,(ay.get(k)||0)+r.total); }
  // 単価統計（この月で①③が揃う分）
  const ystat={}, ido=[];
  for(const [k,y] of ay){ if(!cu.has(k)) continue; const u=cu.get(k), svc=k.split('\u0001')[2];
    (ystat[svc]=ystat[svc]||{y:0,u:0}); ystat[svc].y+=y; ystat[svc].u+=u; if(svc==='移動支援'&&u>0) ido.push(y/u); }
  const est=A.length===0;
  let pool=[...ay].map(([k,yen])=>{const [m,code,svc]=k.split('\u0001'); return {ym:m,code,svc,yen,est:false};});
  let ypuUsed=null;
  if(est){
    const stats=(opts.ypuStats||[]); const T={}; let idoAll=[];
    for(const s of stats){ for(const sv in s.y){ (T[sv]=T[sv]||{y:0,u:0}); T[sv].y+=s.y[sv].y; T[sv].u+=s.y[sv].u; } idoAll=idoAll.concat(s.ido||[]); }
    let ny=0,nu=0; for(const sv in T) if(sv!=='移動支援'){ny+=T[sv].y;nu+=T[sv].u;}
    if(!nu) throw new Error('推計に必要な単価がありません（同年度に①がある月を先に登録してください）');
    const ypu=ny/nu, ypu_svc={}; for(const sv in T) if(T[sv].u>0) ypu_svc[sv]=T[sv].y/T[sv].u;
    if('移動支援' in ypu_svc) ypu_svc['移動支援']=median(idoAll);
    ypuUsed={ypu,ypu_svc};
    for(const [k,u] of cu){ const [m,code,svc]=k.split('\u0001'); if(m!==ym) continue;
      pool.push({ym:m,code,svc,yen:roundHalfEven(u*(svc in ypu_svc?ypu_svc[svc]:ypu)),est:true}); }
  }
  const poolMap=new Map(pool.map(p=>[K(p.ym,p.code,p.svc),p]));
  // ③行へ円按分
  const cc=[]; for(const r of c){ if(r.ym!==ym||r.code===null) continue; const k=K(r.ym,r.code,r.svc); const tot=cu.get(k); const p=poolMap.get(k);
    const yen=p?p.yen:0; cc.push(Object.assign({},r,{key:k,tot,yen_row:tot===0?NaN:yen*r.units/tot})); }
  const poolNoC=pool.filter(p=>!cu.has(K(p.ym,p.code,p.svc)));
  const base=cc.filter(r=>!r.kasan), kasR=cc.filter(r=>r.kasan);
  const kas=new Map(); for(const r of kasR) kas.set(r.key,(kas.get(r.key)||0)+(isNA(r.yen_row)?0:r.yen_row));
  const bs=new Map(); for(const r of base) bs.set(r.key,(bs.get(r.key)||0)+r.units);
  for(const r of base){ const kv=kas.has(r.key)?kas.get(r.key):0, bsum=bs.get(r.key); r.yen_row=r.yen_row+kv*r.units/(bsum===0?NaN:bsum); }
  let orphan=0; for(const [k,v] of kas) if(!bs.has(k)) orphan+=v;
  for(const r of base) r.lab=labOf(r.svc,r.sub,CFG);
  const bl=new Map(); // key -> Map(lab->yen)
  for(const r of base){ if(!bl.has(r.key)) bl.set(r.key,new Map()); const m=bl.get(r.key); m.set(r.lab,(m.get(r.lab)||0)+(isNA(r.yen_row)?0:r.yen_row)); }
  let P2=[];
  for(const p of pool){ const k=K(p.ym,p.code,p.svc); const m=bl.get(k);
    if(m) for(const [lab,y] of m) P2.push({ym:p.ym,code:p.code,svc:p.svc,lab,yen:y});
    else P2.push({ym:p.ym,code:p.code,svc:p.svc,lab:p.svc==='居宅介護'?'居宅介護(内訳不明)':p.svc,yen:p.yen}); }
  { const ps=new Map(), qs=new Map(); for(const p of pool){const k=K(p.ym,p.code,p.svc); ps.set(k,(ps.get(k)||0)+p.yen);} for(const q of P2){const k=K(q.ym,q.code,q.svc); qs.set(k,(qs.get(k)||0)+q.yen);}
    for(const [k,v] of ps){ const d=v-(qs.get(k)||0); if(Math.abs(d)>0.5){ const [m,code,svc]=k.split('\u0001'); P2.push({ym:m,code,svc,lab:svc==='居宅介護'?'居宅介護(内訳不明)':svc,yen:d}); } } }
  { const mm=new Map(); for(const q of P2){ const k=K(q.ym,q.code,q.svc,q.lab); if(mm.has(k)) mm.get(k).yen+=q.yen; else mm.set(k,Object.assign({},q)); } P2=[...mm.values()]; }
  const OUT=LABS.filter(l=>P2.some(q=>q.lab===l));
  // ② 訪問への割当
  const bv=b.filter(r=>r.ym===ym).map(r=>Object.assign({},r,{how:'',lab:labOf(r.svc,r.sub,CFG),y:{}}));
  for(const r of bv) for(const L of LABS) r.y[L]=0;
  const code2names=new Map(); for(const r of c){ if(r.code===null) continue; if(!code2names.has(r.code)) code2names.set(r.code,new Set()); for(const n of r.names) code2names.get(r.code).add(n); }
  for(const r of bv) r.code=(r.code0!==null&&r.code0.trim()!=='')?r.code0:null;
  let n2cOwn={}; const n2c=new Map(); { const cnt=new Map(); for(const r of bv){ if(r.code===null) continue; if(!cnt.has(r.client)) cnt.set(r.client,new Map()); const m=cnt.get(r.client); m.set(r.code,(m.get(r.code)||0)+1); }
    const own={}; for(const [cl,m] of cnt) own[cl]=Object.fromEntries(m); n2cOwn=own;
    for(const ex of (opts.n2cCounts||[])) for(const cl in ex){ if(!cnt.has(cl)) cnt.set(cl,new Map()); const m=cnt.get(cl); for(const cd in ex[cl]) m.set(cd,(m.get(cd)||0)+ex[cl][cd]); }
    for(const [cl,m] of cnt){ let best=null,bc=-1; for(const [cd,n] of [...m].sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0)) if(n>bc){best=cd;bc=n;} n2c.set(cl,best); }
    for(const [code,ns] of code2names) for(const n of ns) if(!n2c.has(n)) n2c.set(n,code); }
  for(const r of bv) if(r.code===null&&n2c.has(r.client)) r.code=n2c.get(r.client);
  const codestat={rows:bv.length,coded:bv.filter(r=>r.code!==null).length};
  const grp=new Map(), gday=new Map();
  for(const r of bv){ if(r.code===null) continue; const k1=K(r.ym,r.svc,r.sub,r.code); if(!grp.has(k1)) grp.set(k1,[]); grp.get(k1).push(r);
    if(r.date===null) continue; const k2=K(r.date,r.svc,r.sub,r.code); if(!gday.has(k2)) gday.set(k2,[]); gday.get(k2).push(r); }
  const bd=new Map(); for(const r of base){ if(r.date===null) continue; const k=K(r.date,r.ym,r.code,r.svc,r.sub); bd.set(k,(bd.get(k)||0)+(isNA(r.yen_row)?0:r.yen_row)); }
  let exact=0,fallback=0,unalloc=0; const left=new Map(), UD=[];
  const spread=(rs,lab,y)=>{ const ws=rs.map(r=>r.min); const tw=nsum(ws); const w=tw>0?ws:ws.map(()=>1); const s=tw>0?tw:w.length; rs.forEach((r,i)=>{r.y[lab]+=y*w[i]/s;}); };
  for(const k of [...bd.keys()].sort()){ const y=bd.get(k); if(!y) continue; const [date,m,code,svc,sub]=k.split('\u0001');
    const rs=gday.get(K(date,svc,sub,code));
    if(rs){ spread(rs,labOf(svc,sub,CFG),y); rs.forEach(r=>r.how='exact'); exact+=y; }
    else { const lk=K(m,code,svc,sub); left.set(lk,(left.get(lk)||0)+y); } }
  for(const [lk,y] of left){ const [m,code,svc,sub]=lk.split('\u0001'); let rs=null;
    for(const s2 of (svc!=='居宅介護'?[sub]:[sub,'身体','家事','通院'])){ const k=K(m,svc,s2,code); if(grp.has(k)){rs=grp.get(k);break;} }
    if(rs){ spread(rs,labOf(svc,sub,CFG),y); rs.forEach(r=>{if(r.how==='')r.how='fallback';}); fallback+=y; }
    else { unalloc+=y; UD.push({code,svc,sub,yen:y}); } }
  const total=nsum(pool.map(p=>p.yen));
  const alloc={codestat,nocunits:nsum(poolNoC.map(p=>p.yen)),orphan,total,exact,fallback,unalloc:total-exact-fallback,visits:bv.length,visits_matched:bv.filter(r=>r.how!=='').length};
  // ---- 集計 ----
  const sales=total;
  const sales_s={}; for(const L of OUT) sales_s[L]=nsum(P2.filter(q=>q.lab===L).map(q=>q.yen));
  const kouhi=nsum(A.map(r=>r.kouhi)), futan=nsum(A.map(r=>r.futan));
  const users=new Set(pool.filter(p=>p.yen>0).map(p=>p.code)).size;
  const users_s={}; for(const L of OUT) users_s[L]=new Set(P2.filter(q=>q.lab===L&&q.yen>0).map(q=>q.code)).size;
  const kyo_sub={}; for(const s of ['身体','家事','通院']) kyo_sub[s]=nsum(base.filter(r=>r.svc==='居宅介護'&&r.sub===s).map(r=>r.yen_row));
  const svcB=OUT.concat(OUT.includes('移動支援')?[]:['移動支援']);
  const visit_s={},hour_s={}; for(const L of LABS){ const rs=bv.filter(r=>r.lab===L); visit_s[L]=rs.length; hour_s[L]=nsum(rs.map(r=>r.min))/60; }
  // 名前（①→③、児童がいれば child）
  const nm=new Map(), ch=new Map();
  for(const r of A.concat(c)){ if(r.code===null) continue; if(!isNA(r.name)&&!nm.has(r.code)) nm.set(r.code,{n:nz(r.name),raw:r.name}); }
  for(const r of A.concat(c)){ if(r.code===null||isNA(r.child)) continue; if(/^\s*\d*\s*$/.test(S(r.child))) continue; if(!ch.has(r.code)) ch.set(r.code,{n:nz(r.child),raw:r.child}); }
  const clients={}; const cg=new Map(); for(const q of P2){ const k=K(q.code,q.lab); cg.set(k,(cg.get(k)||0)+q.yen); }
  for(const code of new Set(pool.filter(p=>p.yen>0).map(p=>p.code))){ const y={}; for(const L of OUT) y[L]=cg.get(K(code,L))||0; clients[code]={y}; }
  const staff={}; for(const r of bv){ const o=staff[r.staff]||(staff[r.staff]={raw:r.staffRaw,h:{},v:{},y:{}}); }
  for(const n in staff){ const rs=bv.filter(r=>r.staff===n); const o=staff[n];
    for(const L of LABS){ const x=rs.filter(r=>r.lab===L); o.h[L]=nsum(x.map(r=>r.min))/60; o.v[L]=x.length; }
    for(const L of LABS) o.y[L]=nsum(rs.map(r=>r.y[L])); }
  const scm=new Map(); for(const r of bv){ const k=K(r.staff,r.code===null?'nan':r.code); let o=scm.get(k); if(!o){o={staff:r.staff,code:r.code===null?'nan':r.code,v:0,h:0,hm:0,y:{}};for(const L of OUT)o.y[L]=0;scm.set(k,o);}
    o.v++; o.h+=r.min; if(r.lab==='移動支援') o.hm+=r.min; for(const L of OUT) o.y[L]+=r.y[L]; }
  const sc=[...scm.values()].map(o=>[o.staff,o.code,o.v,pyRound(o.h/60,2),pyRound(o.hm/60,2),Object.fromEntries(OUT.map(L=>[L,pyRound(o.y[L],1)]))]);
  // 名前の候補（マスク用）: code -> {name, child}, 未コード訪問の利用者名
  const people={};
  for(const code of new Set([...Object.keys(clients),...sc.map(r=>r[1])])){ if(code==='nan') continue;
    let nmo=nm.get(code), cho=ch.get(code);
    if(!nmo){ const r=bv.find(x=>x.code===code); if(r) nmo={n:r.client,raw:r.clientRaw}; }
    people[code]={name:nmo||null,child:(cho&&nmo&&cho.n!==nmo.n)?cho:null}; }
  const rawNames=[]; // 空白入り表記の収集（マスク規則で姓/名を判定）
  for(const r of A.concat(c)){ if(!isNA(r.name)) rawNames.push(S(r.name)); if(!isNA(r.child)) rawNames.push(S(r.child)); }
  for(const r of bv){ if(!isNA(r.staffRaw)) rawNames.push(S(r.staffRaw)); if(!isNA(r.clientRaw)) rawNames.push(S(r.clientRaw)); }
  const otherMonths={}; for(const r of c.filter(x=>x.src===0&&x.ym)) otherMonths[r.ym]=(otherMonths[r.ym]||0)+1;
  return {ym,fy:fyOf(ym),est,labs:OUT,svcB,sales,sales_s,kouhi,futan,users,users_s,kyo_sub,visit_s,hour_s,clients,staff,sc,people,rawNames,
    ystat,ido,ypuUsed,n2cOwn,alloc,ainfo,binfo,UD,files:cls.map(f=>({name:f.name,type:f.type.id,label:f.type.label})),unknown,
    monthsInC:otherMonths,monthsInA:[...new Set(a.map(r=>r.ym))].sort(),monthsInB:[...new Set(b.map(r=>r.ym).filter(x=>x))].sort(),
    recon:{total:sales}};
}
function detectMonths(files,CFG,XLSX){
  const cnt={}; for(const f of files){ const r=classify(f.wb,XLSX,CFG); if(!r) continue; const t=r.type;
    for(const tb of r.tabs) for(const row of tb.rows){ let ym=null;
      if(t.role==='C'){ const m=/R(\d+)年(\d+)月(\d+)日/.exec(S(g(tb,row,t.cols.date))); if(m) ym=(+m[1]+2018)+'-'+String(+m[2]).padStart(2,'0'); }
      else if(t.role==='B'){ const d=parseDate(g(tb,row,t.cols.date),XLSX); if(d) ym=d.slice(0,7); }
      else { ym=wa2ym(g(tb,row,t.cols.ym)); }
      if(ym){ cnt[ym]=cnt[ym]||{A:0,B:0,C:0}; cnt[ym][t.role]++; } } }
  return cnt;
}
const api={aggregateMonth,detectMonths,classify,nz,pyRound,fyOf,wa2ym};
if(typeof module!=='undefined') module.exports=api; else root.SalesEngine=api;
})(this);
