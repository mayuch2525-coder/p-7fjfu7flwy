/* 月次レコード群 → 年度ダッシュボード用 D（core.js が読む形）を組み立てる */
(function(root){
'use strict';
const LABS=['身体介護','家事援助','通院等介助','居宅介護(内訳不明)','重度訪問介護','行動援護','同行援護','移動支援'];
const fyOf=ym=>{ const y=+ym.slice(0,4), m=+ym.slice(5,7); return m>=4?y:y-1; };
const ymOf=(fy,i)=>{ const m=[4,5,6,7,8,9,10,11,12,1,2,3][i]; return (m<4?fy+1:fy)+'-'+String(m).padStart(2,'0'); };
function resolve(table,ids){
  const full={}; for(const id of ids){ const t=table[id]; full[id]=t?t.d+'|'+t.g:id; }
  const c1={}; for(const id of ids) c1[full[id]]=(c1[full[id]]||0)+1;
  const s1={}; for(const id of ids){ const t=table[id]; s1[id]=(t?t.d:id)+(c1[full[id]]>1&&t&&t.g?'［'+id+'］':''); }
  const c2={}; for(const id of ids) c2[s1[id]]=(c2[s1[id]]||0)+1;
  const out={}; for(const id of ids) out[id]=c2[s1[id]]>1?s1[id]+' ('+id+')':s1[id]; return out;
}
const sum=a=>a.reduce((x,y)=>x+(y||0),0);
function buildFY(recs,fy,table,withPrior=true,pinned){
  const P0=withPrior?buildFY(recs,fy-1,table,false):null;
  const R={}; for(const r of recs) if(fyOf(r.ym)===fy) R[r.ym]=r;
  const ks=Object.keys(R).sort(); if(!ks.length) return null;
  const months=[]; for(let i=0;i<12;i++){ const m=ymOf(fy,i); if(m>ks.at(-1)) break; months.push(m); }
  const NM=months.length, rec=months.map(m=>R[m]||null);
  const svcs=LABS.filter(l=>rec.some(r=>r&&r.labs.includes(l)));
  const svcB=svcs.concat(svcs.includes('移動支援')?[]:['移動支援']);
  const arr=f=>rec.map(r=>r?f(r):0);
  const D={months,fy,svcs,svcB,tag:'R'+(fy-2018),missing:months.filter((m,i)=>!rec[i])};
  D.est_months=months.filter((m,i)=>rec[i]&&rec[i].est);
  D.sales_m=arr(r=>r.sales); D.sales_ms={}; for(const s of svcs) D.sales_ms[s]=arr(r=>r.sales_s[s]||0);
  D.kouhi=arr(r=>r.kouhi); D.futan=arr(r=>r.futan); D.users=arr(r=>r.users);
  D.users_svc={}; for(const s of svcs) D.users_svc[s]=arr(r=>r.users_s[s]||0);
  D.kyo_sub={}; for(const s of ['身体','家事','通院']) D.kyo_sub[s]=arr(r=>r.kyo_sub[s]||0);
  D.visit_s={}; D.hour_s={}; for(const s of svcB){ D.visit_s[s]=arr(r=>r.visit_s[s]||0); D.hour_s[s]=arr(r=>r.hour_s[s]||0); }
  const ids=new Set(); rec.forEach(r=>{ if(r){ Object.keys(r.clients).forEach(k=>ids.add(k)); r.sc.forEach(x=>ids.add(x[1])); } });
  const nameIds=new Set(ids); if(P0) Object.keys(P0.clients).forEach(k=>nameIds.add(k));
  const names=resolve(table,[...nameIds].sort()); const pin=(pinned||{})[fy]||{}; for(const id in names) if(id in pin) names[id]=pin[id];
  D.clients={}; rec.forEach((r,i)=>{ if(!r) return; for(const id in r.clients){ const o=D.clients[id]||(D.clients[id]={n:names[id]||id,y:Object.fromEntries(svcs.map(s=>[s,months.map(()=>0)]))});
    for(const s of svcs) o.y[s][i]=r.clients[id].y[s]||0; } });
  D.cnames={}; for(const id of [...ids].sort()) D.cnames[id]=names[id]||id;
  const sn=new Set(); rec.forEach(r=>{ if(r) Object.keys(r.staff).forEach(n=>sn.add(n)); });
  D.staff={}; for(const n of [...sn].sort()){ const o={h:{},v:{},y:{}};
    for(const s of svcB){ o.h[s]=rec.map(r=>r&&r.staff[n]?(r.staff[n].h[s]||0):0); o.v[s]=rec.map(r=>r&&r.staff[n]?(r.staff[n].v[s]||0):0); }
    for(const s of svcs) o.y[s]=rec.map(r=>r&&r.staff[n]?(r.staff[n].y[s]||0):0); D.staff[n]=o; }
  D.sc=[]; rec.forEach((r,i)=>{ if(r) for(const x of r.sc) D.sc.push([i,x[0],x[1],x[2],x[3],x[4]].concat(svcs.map(s=>x[5][s]||0))); });
  // 単価（推計月の注記用）
  const T={}; let ido=[]; rec.forEach(r=>{ if(r&&!r.est){ for(const s in r.ystat){(T[s]=T[s]||{y:0,u:0});T[s].y+=r.ystat[s].y;T[s].u+=r.ystat[s].u;} ido=ido.concat(r.ido||[]);} });
  let ny=0,nu=0; for(const s in T) if(s!=='移動支援'){ny+=T[s].y;nu+=T[s].u;} D.ypu=nu?ny/nu:0; D.ypu_svc={}; for(const s in T) if(T[s].u>0) D.ypu_svc[s]=T[s].y/T[s].u;
  if(ido.length){ const b=ido.slice().sort((a,c)=>a-c),n=b.length; D.ypu_svc['移動支援']=n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2; }
  const al={total:0,exact:0,fallback:0,unalloc:0,visits:0,visits_matched:0}; rec.forEach(r=>{ if(r) for(const k in al) al[k]+=r.alloc[k]||0; }); D.alloc=al;
  const dup={groups:0,rows:0,dropped:0}; rec.forEach(r=>{ if(r&&r.dup) for(const k in dup) dup[k]+=r.dup[k]||0; }); D.ainfo={dup};
  D.outside={rows:0,yen:0}; D.muni={};
  D.recon={total:sum(D.sales_m)};
  D.prev=months.map(()=>null); D.prev_ms={}; for(const s of svcs) D.prev_ms[s]=months.map(()=>null);
  D.prev_vis=months.map(()=>null); D.prev_hrs=months.map(()=>null); D.prev_staff={}; D.prev_clients={}; D.prev_sc={}; D.prior_fy=null;
  const P=P0;
  if(P){ const cut=a=>months.map((_,i)=>i<P.months.length&&!P.missing.includes(P.months[i])?a[i]:null);
    D.prior_fy=P.fy; D.prior_est=P.est_months; D.prev=cut(P.sales_m);
    D.prev_ms={}; for(const k in P.sales_ms) D.prev_ms[k]=cut(P.sales_ms[k]);
    D.prev_vis=cut(months.map((_,i)=>i<P.months.length?sum(P.svcB.map(k=>P.visit_s[k][i])):null));
    D.prev_hrs=cut(months.map((_,i)=>i<P.months.length?sum(P.svcB.map(k=>P.hour_s[k][i])):null));
    D.prev_clients={}; for(const k in P.clients) D.prev_clients[k]=cut(months.map((_,i)=>i<P.months.length?sum(P.svcs.map(s=>P.clients[k].y[s][i])):null));
    D.prev_vis_s={}; for(const k in P.visit_s) D.prev_vis_s[k]=cut(P.visit_s[k]); D.prev_hrs_s={}; for(const k in P.hour_s) D.prev_hrs_s[k]=cut(P.hour_s[k]);
    D.prev_users=cut(P.users);
    D.prev_staff={}; for(const n in P.staff){ const o=P.staff[n]; const f=(ks,x)=>cut(months.map((_,i)=>i<P.months.length?sum(ks.map(k=>o[x][k][i])):null));
      D.prev_staff[n]={y:f(P.svcs,'y'),h:f(P.svcB,'h'),v:f(P.svcB,'v')}; }
    D.prev_sc={}; for(const r of P.sc){ if(r[0]>=NM) continue; D.prev_sc[r[0]+'|'+r[1]+'|'+r[2]]=[sum(r.slice(6)),r[4]]; } }
  return D;
}
function fiscalYears(recs){ return [...new Set(recs.map(r=>fyOf(r.ym)))].sort((a,b)=>b-a); }
const api={buildFY,fiscalYears,fyOf,LABS};
if(typeof module!=='undefined') module.exports=api; else root.SalesMerge=api;
})(this);
