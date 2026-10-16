/* ログイン・データ取得の共通処理 */
(function(root){
'use strict';
const SC=root.SalesCrypto;
async function loadConfig(){ return (await fetch('config.json?t='+Date.now(),{cache:'no-store'})).json(); }
function savedKey(){ for(const st of [sessionStorage,localStorage]){ try{ const o=JSON.parse(st.getItem('sd_key')||'null'); if(o&&(!o.exp||o.exp>Date.now())) return o.k; }catch(e){} } return null; }
function saveKey(k,remember){ const o=JSON.stringify({k,exp:remember?Date.now()+30*864e5:0}); sessionStorage.setItem('sd_key',o); if(remember) localStorage.setItem('sd_key',o); else localStorage.removeItem('sd_key'); }
function logout(){ sessionStorage.removeItem('sd_key'); localStorage.removeItem('sd_key'); }
async function fetchJSON(path){ const r=await fetch(path+(path.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'}); if(!r.ok) throw new Error(path+' '+r.status); return r.json(); }
/* パスワード → 鍵。names.enc.json の復号で正否判定 */
async function login(cfg,password,remember){
  const key=await SC.deriveKey(password,cfg.salt,cfg.iter);
  const names=await SC.decryptJSON(key,await fetchJSON('data/names.enc.json'));
  saveKey(await SC.exportKey(key),remember); return {key,names};
}
async function resume(){ const k=savedKey(); if(!k) return null; try{ const key=await SC.importKey(k); const names=await SC.decryptJSON(key,await fetchJSON('data/names.enc.json')); return {key,names}; }catch(e){ logout(); return null; } }
function loginForm(el,cfg,onok,title){
  el.innerHTML=`<div class="lg"><div><span class="hex"></span><b>CARE<span style="color:#00e0ff">METRICS</span></b></div><h1>${title}</h1><p class="s">閲覧にはパスワードが必要です</p>
  <form id="lf"><input id="pw" type="password" autocomplete="current-password" placeholder="パスワードを入力" required><label class="rm"><input type="checkbox" id="rm" checked> この端末で30日間記憶する</label>
  <button id="lb">開く</button><div id="le" class="err"></div></form></div>`;
  el.querySelector('#lf').onsubmit=async e=>{ e.preventDefault(); const b=el.querySelector('#lb'); b.disabled=true; b.textContent='確認中…';
    try{ const r=await login(cfg,el.querySelector('#pw').value,el.querySelector('#rm').checked); onok(r); }
    catch(err){ el.querySelector('#le').textContent='パスワードが違います'; b.disabled=false; b.textContent='開く'; } };
}
root.SalesCommon={loadConfig,login,resume,logout,fetchJSON,loginForm};
})(this);
