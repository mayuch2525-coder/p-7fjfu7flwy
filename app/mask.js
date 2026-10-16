/* 氏名マスク・コードID化（状態は暗号化して保存） */
(function(root){
'use strict';
const Z='\u3007';
const SP=/[\s\u3000]+/g, CODE=/[（(]\s*\d+\s*[)）]\s*$/;
const keyOf=n=>String(n).replace(SP,'').replace(/[（(]\s*\d+\s*[)）]\s*$/,'');
function mfull(parts){ const sn=parts[0], gn=parts.slice(1).join(' ');
  if([...sn].length>=2){ const a=[...sn]; return [a[0]+Z+a.slice(2).join('')].concat(gn?[gn]:[]).join(' '); }
  return sn+' '+(gn?Z+[...gn].slice(1).join(''):''); }
function mnos(n){ const a=[...n]; return a.length>=2?a[0]+Z+a.slice(2).join(''):Z; }
function makeMasker(state,rawNames){
  state.names=state.names||{}; state.codes=state.codes||{}; state.people=state.people||{};
  const spaced={}; for(const r of rawNames||[]){ const k=keyOf(r); if(!k) continue; const v=String(r).trim().replace(SP,' ').replace(CODE,'').trim(); if(v.includes(' ')) (spaced[k]=spaced[k]||new Set()).add(v); }
  const used=new Set(Object.values(state.names)); const added=[];
  function mn(n){ const k=keyOf(n||''); if(k in state.names) return state.names[k];
    if(!k) return Z;
    let m; const sv=spaced[k]?[...spaced[k]].sort():[]; if(sv.length) m=mfull(sv[0].split(' ').filter(x=>x)); else m=mnos(k);
    if(used.has(m)){ let i=2; while(used.has(m+'('+i+')')) i++; m=m+'('+i+')'; }
    state.names[k]=m; used.add(m); added.push(m); return m; }
  function mc(code){ code=String(code); if(code in state.codes) return state.codes[code];
    let mx=0; for(const v of Object.values(state.codes)){ const x=+String(v).replace(/^C/,''); if(x>mx) mx=x; }
    const id='C'+String(mx+1).padStart(3,'0'); state.codes[code]=id; added.push(id); return id; }
  return {mn,mc,added};
}
/* 生集計 → 公開用(マスク済)月次レコード。state を更新する */
function maskRecord(raw,state){
  const M=makeMasker(state,raw.rawNames);
  const clients={}; for(const code in raw.clients) clients[M.mc(code)]={y:raw.clients[code].y};
  const staff={}; for(const n in raw.staff){ const o=raw.staff[n]; staff[M.mn(n)]={h:o.h,v:o.v,y:o.y}; }
  const sc=raw.sc.map(r=>[M.mn(r[0]),r[1]==='nan'?'nan':M.mc(r[1]),r[2],r[3],r[4],r[5]]);
  // 表示名: 保護者名は保存しない。児童がいれば児童名、いなければ氏名
  for(const code in raw.people){ const p=raw.people[code]; const id=M.mc(code);
    const disp=p.child?M.mn(p.child.n):(p.name?M.mn(p.name.n):id);
    const gk=p.child&&p.name?M.mn(p.name.n):'';   // 保護者のマスク名は状態(暗号化)にだけ保持
    state.people[id]={d:disp,g:gk}; }
  // 未コード訪問の 利用者名→コード 推定用カウント（実名を含むため状態側=暗号化のみに保存）
  state.n2c=state.n2c||{}; state.n2c[raw.ym]=raw.n2cOwn||{};
  const rec={v:1,ym:raw.ym,fy:raw.fy,est:raw.est,labs:raw.labs,sales:raw.sales,sales_s:raw.sales_s,kouhi:raw.kouhi,futan:raw.futan,users:raw.users,users_s:raw.users_s,
    kyo_sub:raw.kyo_sub,visit_s:raw.visit_s,hour_s:raw.hour_s,clients,staff,sc,ystat:raw.ystat,ido:raw.ido,ypuUsed:raw.ypuUsed,
    alloc:Object.assign({},raw.alloc),dup:raw.ainfo.dup?{groups:raw.ainfo.dup.groups,rows:raw.ainfo.dup.rows,dropped:raw.ainfo.dup.dropped}:null,
    binfo:raw.binfo,files:raw.files.map(f=>({type:f.type,label:f.label})),updated:new Date().toISOString()};
  return {rec,added:M.added};
}
/* 公開用表示名表 {C-ID:{d:表示名, g:保護者グループ番号}}。保護者名そのものは公開しない */
function displayNames(state){
  const gid={}; let n=0; const out={};
  for(const id of Object.keys(state.people).sort()){ const p=state.people[id]; let g='';
    if(p.g){ if(!(p.g in gid)) gid[p.g]='G'+(++n); g=gid[p.g]; } out[id]={d:p.d,g}; }
  return out;
}
/* 年度ごとの表示名（build.py+sanitize と同じ: 同一表記は C-ID を付記） */
function resolveNames(table,ids){
  const full={}; for(const id of ids){ const t=table[id]; full[id]=t?t.d+'|'+t.g:id; }
  const c1={}; for(const id of ids) c1[full[id]]=(c1[full[id]]||0)+1;
  const s1={}; for(const id of ids){ const t=table[id]; s1[id]=(t?t.d:id)+(c1[full[id]]>1&&t&&t.g?'［'+id+'］':''); }
  const c2={}; for(const id of ids) c2[s1[id]]=(c2[s1[id]]||0)+1;
  const out={}; for(const id of ids) out[id]=c2[s1[id]]>1?s1[id]+' ('+id+')':s1[id];
  return out;
}
const api={makeMasker,maskRecord,displayNames,resolveNames,keyOf};
if(typeof module!=='undefined') module.exports=api; else root.SalesMask=api;
})(this);
