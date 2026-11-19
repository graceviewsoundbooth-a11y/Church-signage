const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map();
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),
    formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-11-16':f==='HH:mm'?'10:00':'2026-11-16 10:00'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({text:t,setMimeType(){return this;}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
let seen=null;
ctx.heartbeat_=(dev,now)=>{seen=dev.Name+' '+now.mode;};
ctx.settings_=()=>({'Church Name':'Graceview'});
ctx.data_=()=>({
  devices:[{'Device ID':'LOBBY',Name:'Lobby',Profile:'Signage','Default Theme':'Church','Default Mode':'Off','Mute Live':'TRUE',Wayfinding:'TRUE',_row:2},
           {'Device ID':'COFFEE',Name:'Coffee Spot',Profile:'Signage','Default Theme':'Church','Default Mode':'Off','Mute Live':'FALSE',Wayfinding:'FALSE',_row:3}],
  themes:[{Theme:'Church','Display Name':'Graceview Baptist Church',Main:'#CF2020',Accent:'#B50606','Logo URL':'','Wayfinding Left':'Fellowship Hall; Office','Wayfinding Right':'Nursery',
    'QR Label':'Info','QR Link':'https://graceview.org',Calendar:'webcal://x/y','Wi-Fi Name':'Guest','Wi-Fi Password':'pw','Calendar Hide':'Private Event','Slides Folder':'https://drive.google.com/drive/folders/ABC'}],
  weekly:[{Enabled:'TRUE',Day:'Sun',Start:'09:30',End:'10:30',Devices:'Lobby, Coffee Spot',Mode:'Countdown',Theme:'Church',Note:'Countdown'},
          {Enabled:'FALSE',Day:'Mon',Start:'08:00',End:'09:00',Devices:'Lobby',Mode:'Signage',Theme:'Church'}],
  special:[{Enabled:'TRUE',Name:'Christmas Eve',From:'2026-12-24',To:'2026-12-24',Start:'14:00',End:'19:30',Devices:'ALL SIGNAGE',Mode:'Signage',Theme:'Church'}],
  override:{Active:'TRUE',Devices:'ALL',Mode:'Message',Theme:'Church',Message:'Hello','Ends At':'2026-11-16 09:00'},
  slides:[],presets:[],users:[]});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
// Pair through the JSON door
const post=b=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(b)}}).text);
const s=post({action:'pairStart',ua:'Google TV emulator'});
ok('pairStart answers with a code', /^[A-Z2-9]{6}$/.test(s.code));
ok('pairCheck waits', post({action:'pairCheck',code:s.code,secret:s.secret}).waiting===true);
// approve directly (admin check covered elsewhere)
const key='k'.repeat(64);props.set('tv:'+ctx.sha_(key),JSON.stringify({deviceId:'LOBBY'}));
ok('unknown key is unpaired', post({action:'state',key:'nope'}).unpaired===true);
ok('unknown action is an error', !!post({action:'x'}).error);
ok('bad JSON is an error, not a crash', !!JSON.parse(ctx.doPost({postData:{contents:'{bad'}}).text).error);
const st=post({action:'state',key});
ok('state names the device and church', st.device==='Lobby' && st.church==='Graceview');
ok('state counts as the TV checking in', /^Lobby /.test(seen||''));
const R=st.batch.valueRanges.map(v=>v.values);
ok('8 ranges in production order', R.length===8);
ok('expired override is sent as inactive', R[0][4][1]==='FALSE' && R[0][6][1]==='Message' && R[0][8][1]==='Hello');
ok('special row in production columns', JSON.stringify(R[1][0])===JSON.stringify(['2026-12-24','2026-12-24','14:00','19:30','ALL SIGNAGE','Signage','Church','Church','Christmas Eve']));
ok('only enabled weekly rows, folder = theme', R[2].length===1 && R[2][0][0]==='Sun' && R[2][0][6]==='Church');
ok('device columns: mute K, wayfinding N/O, default mode P', R[3][0][10]==='TRUE' && R[3][0][13]==='' && R[3][1][13]==='None' && R[3][1][14]==='None' && R[3][0][15]==='Off' && R[3][0][6]==='TRUE');
ok('theme columns A-M', R[4][0].length===13 && R[4][0][9]==='https://x/y' && R[4][0][12]==='Private Event');
ok('folders map theme to its slides folder', R[5][0][0]==='Church' && /folders\/ABC/.test(R[5][0][1]));
ok('every cell is text', R.every(rows=>rows.every(r=>r.every(c=>typeof c==='string'))));
