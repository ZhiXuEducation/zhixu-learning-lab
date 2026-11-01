import {pinHash,equalHash,digest,randomPin,randomHex} from '../backend/security.ts';
function assert(v:unknown){if(!v)throw Error('assertion failed');}
Deno.test('PIN hashes: pepper, salt and account isolation; leading zeros; token entropy',async()=>{
 const h=await pinHash('ZX0123456789AB','0007','salt','server-pepper');
 assert(equalHash(h,await pinHash('ZX0123456789AB','0007','salt','server-pepper')));
 assert(!equalHash(h,await pinHash('ZX0123456789AB','0008','salt','server-pepper')));
 assert(!equalHash(h,await pinHash('ZX0123456789AB','0007','salt','other-pepper')));
 assert(!equalHash(h,await pinHash('ZX0123456789AC','0007','salt','server-pepper')));
 assert(!equalHash(h,await pinHash('ZX0123456789AB','0007','other-salt','server-pepper')));
 assert(h.length===64 && h!==await digest('0007'));
 for(let i=0;i<100;i++)assert(/^\d{4}$/.test(randomPin()));
 assert(randomHex().length===64 && randomHex()!==randomHex());
});
