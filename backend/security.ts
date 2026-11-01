const enc = new TextEncoder();
export const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b instanceof Uint8Array ? b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) : b), n=>n.toString(16).padStart(2,'0')).join('');
export function randomHex(bytes=32) { return hex(crypto.getRandomValues(new Uint8Array(bytes))); }
export function randomPin() {
 const n = new Uint32Array(1); do { crypto.getRandomValues(n); } while(n[0]>=4294960000);
 return String(n[0]%10000).padStart(4,'0');
}
export async function digest(s:string) { return hex(await crypto.subtle.digest('SHA-256',enc.encode(s))); }
export async function pinHash(code:string,pin:string,salt:string,pepper:string) {
 const key=await crypto.subtle.importKey('raw',enc.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const prehash=await crypto.subtle.sign('HMAC',key,enc.encode(`zhixu-student-pin-v1:${code}:${pin}`));
 const material=await crypto.subtle.importKey('raw',prehash,'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:210000,hash:'SHA-256'},material,256));
}
export function equalHash(a:string,b:string) {
 if(a.length!==64 || b.length!==64) return false;
 let diff=0; for(let i=0;i<64;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
