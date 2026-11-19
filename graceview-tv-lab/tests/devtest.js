// Server: device details, edit (with rename everywhere), remove. Page: Devices table and editor.
const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map();const log=[];const writes=[];const cache=new Map();
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),
    formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-11-16':f==='HH:mm'?'10:00':'2026-11-16 10:00'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:k=>cache.has(k)?cache.get(k):null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  Session:{getActiveUser:()=>({getEmail:()=>'owner@x.org'}),getEffectiveUser:()=>({getEmail:()=>'owner@x.org'})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({text:t,setMimeType(){return this;}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const devices=[{'Device ID':'LOBBY',Name:'Lobby',Profile:'Signage','Default Theme':'Church','Default Mode':'Off',Hardware:'Virtual (browser)','Last Seen':'2026-11-16 09:58'},
               {'Device ID':'COFFEE',Name:'Coffee Spot',Profile:'Signage','Default Theme':'Church','Default Mode':'Off','Last Seen':'2026-11-16 09:30'}];
const weekly=[{Devices:'Lobby, Coffee Spot',_row:2},{Devices:'ALL SIGNAGE',_row:3},{Devices:'lobby',_row:4}];
const special=[{Devices:'Lobby',_row:2}];const presets=[{Devices:'ALL',_row:2}];const users=[{Devices:'Lobby',_row:2}];
ctx.settings_=()=>({'Church Name':'G','Owner Email':'owner@x.org','Owner Name':'Pat'});
ctx.log_=(m,a,d)=>log.push(a+': '+d);
ctx.data_=()=>({launchers:[{Name:'Classroom',_row:2}],devices:devices.map((v,i)=>({...v,_row:i+2})),themes:[{Theme:'Church'},{Theme:'School'}],
  weekly,special,presets,users,override:{Devices:'Lobby',_row:2},slides:[],greenRoom:[]});
ctx.sheet_=name=>({getRange:(r,c,nr,nc)=>({setValue:v=>writes.push([name,r,c,v]),setValues:v=>writes.push([name,r,c,v])}),deleteRow:r=>writes.push([name,'delete',r])});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const throws=fn=>{try{fn();return '';}catch(e){return e.message;}};

ok('minutesAgo_: 2 minutes ago counts as online, 30 does not', ctx.minutesAgo_('2026-11-16 09:58')===2 && ctx.minutesAgo_('2026-11-16 09:30')===30 && ctx.minutesAgo_('')===Infinity);
// heartbeat with native-app info
ctx.heartbeat_({...devices[0],_row:2},{mode:'Signage',theme:'Church'},JSON.stringify({ip:'192.168.0.142',model:'onn 4K Pro',android:'14',version:'2026.11.16.1500'}));
ok('check-in records version, model with Android version, and IP', writes.some(w=>w[0]==='Devices'&&w[2]===10&&w[3][0][1]==="'2026.11.16.1500") && writes.some(w=>w[2]===5&&w[3]==='onn 4K Pro, Android 14') && writes.some(w=>w[2]===16&&w[3]==="'192.168.0.142"));
const n=writes.length;ctx.heartbeat_({...devices[0],_row:2},{mode:'Signage',theme:'Church'},JSON.stringify({ip:'192.168.0.142',model:'onn 4K Pro',android:'14',version:'2026.11.16.1500'}));
ok('a repeat check-in within a minute writes nothing', writes.length===n);
// edit + rename
writes.length=0;
const r=ctx.saveDevice({id:'LOBBY',name:'Main Lobby',location:'Front doors',profile:'Signage',theme:'School',defaultMode:'Off',launcher:'Classroom',muteLive:true,wayfinding:false},'');
ok('settings written to the TV row', writes.some(w=>w[0]==='Devices'&&w[2]===2&&w[3][0][0]==='Main Lobby'&&w[3][0][1]==='Front doors') && writes.some(w=>w[2]===6&&w[3][0][0]==='School'&&w[3][0][2]===true) && writes.some(w=>w[2]===15&&w[3]==='Classroom'));
ok('rename updates weekly (any case), special, override and users, but not ALL SIGNAGE or ALL', r.renamed===5 &&
  writes.some(w=>w[0]==='Weekly'&&w[1]===2&&w[3]==='Main Lobby, Coffee Spot') && writes.some(w=>w[0]==='Weekly'&&w[1]===4&&w[3]==='Main Lobby') &&
  writes.some(w=>w[0]==='Special Dates'&&w[3]==='Main Lobby') && writes.some(w=>w[0]==='Override'&&w[3]==='Main Lobby') && writes.some(w=>w[0]==='Users'&&w[3]==='Main Lobby') &&
  !writes.some(w=>w[0]==='Presets') && !writes.some(w=>w[0]==='Weekly'&&w[1]===3));
ok('rename is logged with what changed', log.some(l=>/Edited TV: Main Lobby \(was Lobby; updated 5 rows/.test(l)));
ok('duplicate name refused', /already a TV called/.test(throws(()=>ctx.saveDevice({id:'LOBBY',name:'coffee spot',profile:'Signage',theme:'Church',defaultMode:'Off'},''))));
ok('reserved name refused', /reserved word/.test(throws(()=>ctx.saveDevice({id:'LOBBY',name:'All Signage',profile:'Signage',theme:'Church',defaultMode:'Off'},''))));
ok('unknown launcher refused', /launcher layout/.test(throws(()=>ctx.saveDevice({id:'LOBBY',name:'Lobby',profile:'Signage',theme:'Church',defaultMode:'Off',launcher:'Nope'},''))));
// remove
props.set('tv:abc',JSON.stringify({deviceId:'COFFEE'}));props.set('apps:COFFEE','[]');
writes.length=0;ctx.removeDevice('COFFEE','');
ok('removing unpairs the screen, clears its reports and deletes the row', !props.has('tv:abc') && !props.has('apps:COFFEE') && writes.some(w=>w[0]==='Devices'&&w[1]==='delete'&&w[2]===3));
