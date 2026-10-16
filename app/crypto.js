/* AES-256-GCM + PBKDF2-SHA256（パスワードは既存サイトと同一、salt は .staticrypt.json の値を流用） */
(function(root){
'use strict';
const C=(typeof crypto!=='undefined'&&crypto.subtle)?crypto:require('crypto').webcrypto;
const te=new TextEncoder(), td=new TextDecoder();
const b64=u=>{ let s=''; const a=new Uint8Array(u); for(let i=0;i<a.length;i+=0x8000) s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000)); return btoa(s); };
const ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=h=>new Uint8Array(h.match(/../g).map(x=>parseInt(x,16)));
async function deriveKey(password,saltHex,iter){
  const base=await C.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveKey']);
  return C.subtle.deriveKey({name:'PBKDF2',salt:hex(saltHex),iterations:iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},true,['encrypt','decrypt']);
}
async function exportKey(k){ return b64(await C.subtle.exportKey('raw',k)); }
async function importKey(s){ return C.subtle.importKey('raw',ub64(s),{name:'AES-GCM'},true,['encrypt','decrypt']); }
async function gz(bytes,dir){ if(typeof CompressionStream==='undefined') return null; const cs=dir?new CompressionStream('gzip'):new DecompressionStream('gzip');
  const r=new Response(new Blob([bytes]).stream().pipeThrough(cs)); return new Uint8Array(await r.arrayBuffer()); }
async function encryptJSON(key,obj){
  const iv=C.getRandomValues(new Uint8Array(12)); let pt=te.encode(JSON.stringify(obj)); let z=0;
  const g=await gz(pt,true); if(g){pt=g;z=1;}
  const ct=await C.subtle.encrypt({name:'AES-GCM',iv},key,pt);
  return {v:1,alg:'AES-256-GCM',z,iv:b64(iv),ct:b64(ct)};
}
async function decryptJSON(key,env){
  let pt=new Uint8Array(await C.subtle.decrypt({name:'AES-GCM',iv:ub64(env.iv)},key,ub64(env.ct)));
  if(env.z) pt=await gz(pt,false);
  return JSON.parse(td.decode(pt));
}
const api={deriveKey,exportKey,importKey,encryptJSON,decryptJSON};
if(typeof module!=='undefined') module.exports=api; else root.SalesCrypto=api;
})(this);
