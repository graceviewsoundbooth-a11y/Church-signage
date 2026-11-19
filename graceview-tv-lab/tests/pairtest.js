const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map(),cache=new Map(),settings={'Church Name':'Graceview','Owner Email':'owner@example.com','Owner Name':'Pat'},log=[];
let active='owner@example.com';
const devices=[{'Device ID':'LOBBY',Name:'Lobby',Profile:'Signage','Default Theme':'Church','Default Mode':'Off','Mute Live':'TRUE',Wayfinding:'TRUE'}];
const users=[];
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),
    formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-11-16':f==='HH:mm'?'10:00':'2026-11-16 10:00'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:k=>cache.has(k)?cache.get(k):null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>'owner@example.com'})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ScriptApp:{getService:()=>({getUrl:()=>'https://x/exec'})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
ctx.settings_=()=>({...settings});ctx.log_=(m,a,d)=>log.push(a+': '+d);ctx.weather_=()=>null;
ctx.data_=()=>({devices:devices.map((v,i)=>({...v,_row:i+2})),themes:[{Theme:'Church',Main:'#CF2020',Accent:'#B50606'},{Theme:'School',Main:'#263D5A',Accent:'#0C2340'}],
  users:users.map((u,i)=>({...u,_row:i+2})),weekly:[],special:[],override:{},slides:[]});
ctx.folderFiles_=()=>({files:[]});ctx.calendar_=()=>({events:[],count:0,errors:[]});
ctx.heartbeat_=(dev)=>{devices.find(d=>d['Device ID']===dev['Device ID']).seen=true;};
ctx.appendRow_=(sh,v)=>{
  if(sh.name==='Devices'){devices.push({'Device ID':v[0],Name:v[1],Profile:v[3],'Default Theme':v[5],'Default Mode':v[6]});return devices.length+1;}
  users.push({Email:v[0],Name:v[1],Role:v[2],Themes:v[3],Devices:v[4],Status:v[5]});return users.length+1;};
ctx.sheet_=name=>({name,getRange:(r,c)=>({
  setValues:vv=>{if(name==='Devices'&&c===13){devices[r-2]['Paired At']=String(vv[0][0]).replace(/^'/,'');devices[r-2]['Paired By']=vv[0][1];}},
  setValue:v=>{if(name==='Users')users[r-2][{2:'Name',6:'Status',9:'Last Sign-in'}[c]]=v;}}),deleteRow(){}});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const throws=fn=>{try{fn();return '';}catch(e){return e.message;}};

// A new screen asks for a code
const s1=ctx.startPairing({ua:'Chrome on Onn'});
ok('code is 6 easy-to-read characters', /^[A-HJ-NP-Z2-9]{6}$/.test(s1.code));
ok('screen gets church name and a 15-minute expiry', s1.church==='Graceview' && s1.exp-Date.now()>14*60000);
ok('waiting before approval', ctx.checkPairing(s1.code,s1.secret).waiting===true);
ok('wrong secret cannot steal the pairing', ctx.checkPairing(s1.code,'guess').expired===true);
ok('an unpaired TV gets nothing', ctx.getTv('').unpaired===true && ctx.getTv('made-up-key').unpaired===true);
// Only admins can approve
const st=ctx.saveUser({email:'s@x.org',name:'S',role:'Staff'},'');const sTok=ctx.acceptInvite(st.link.split('invite=')[1],'S','staff-pass-1');
active='';
ok('staff cannot pair a TV', /Only the Owner or an Admin/.test(throws(()=>ctx.approvePairing(s1.code,{deviceId:'LOBBY'},sTok))));
ok('a stranger cannot pair a TV', /Only the Owner or an Admin/.test(throws(()=>ctx.approvePairing(s1.code,{deviceId:'LOBBY'},''))));
active='owner@example.com';
ok('a wrong code is refused', /No screen is showing that code/.test(throws(()=>ctx.approvePairing('ZZZZZZ',{deviceId:'LOBBY'},''))));
// Approve onto Lobby, typed with a dash and lowercase
const r1=ctx.approvePairing(s1.code.slice(0,3).toLowerCase()+'-'+s1.code.slice(3),{deviceId:'LOBBY'},'');
ok('owner pairs the screen to Lobby (dash and lowercase OK)', r1.deviceId==='LOBBY' && /^2026-11-16/.test(devices[0]['Paired At']) && devices[0]['Paired By']==='Pat');
const c1=ctx.checkPairing(s1.code,s1.secret);
ok('screen receives its device key', c1.paired===true && c1.deviceKey.length>=64);
ok('the key is handed out only once', ctx.checkPairing(s1.code,s1.secret).expired===true);
const tv1=ctx.getTv(c1.deviceKey);
ok('paired screen shows Lobby and checks in', tv1.screen && tv1.screen.device.name==='Lobby' && devices[0].seen===true);
ok('the device key is not stored in plain text', ![...props.keys()].some(k=>k.includes(c1.deviceKey)) && ![...props.values()].some(v=>v.includes(c1.deviceKey)));
// A second screen paired to Lobby replaces the first
const s2=ctx.startPairing({});ctx.approvePairing(s2.code,{deviceId:'LOBBY'},'');const c2=ctx.checkPairing(s2.code,s2.secret);
ok('re-pairing Lobby replaces the old screen', !!ctx.getTv(c2.deviceKey).screen && ctx.getTv(c1.deviceKey).unpaired===true);
// A brand-new TV
const s3=ctx.startPairing({});
ok('new TV needs a name', /Give the new TV a name/.test(throws(()=>ctx.approvePairing(s3.code,{name:' '},''))));
ok('new TV cannot reuse a name', /already a TV called/.test(throws(()=>ctx.approvePairing(s3.code,{name:'lobby'},''))));
const r3=ctx.approvePairing(s3.code,{name:'Room 104',profile:'Classroom',theme:'School'},'');const c3=ctx.checkPairing(s3.code,s3.secret);
const nd=devices.find(d=>d.Name==='Room 104');
ok('new TV added with an ID, profile, theme and default', r3.deviceId==='ROOM104' && nd.Profile==='Classroom' && nd['Default Theme']==='School' && nd['Default Mode']==='Launcher');
ok('new TV shows right away', ctx.getTv(c3.deviceKey).screen.device.name==='Room 104');
ok('a used code cannot be approved again', /No screen is showing that code|already paired/.test(throws(()=>ctx.approvePairing(s3.code,{deviceId:'LOBBY'},''))));
// Unpair
ctx.unpairDevice('ROOM104','');
ok('unpaired TV goes back to asking for a code', ctx.getTv(c3.deviceKey).unpaired===true && nd['Paired At']==='');
// Expired code
const s4=ctx.startPairing({});const rec=JSON.parse(props.get('pair:'+s4.code));rec.exp=Date.now()-1000;props.set('pair:'+s4.code,JSON.stringify(rec));
ok('expired code cannot be approved', /expired/.test(throws(()=>ctx.approvePairing(s4.code,{deviceId:'LOBBY'},''))));
ok('expired code tells the screen to get a new one', ctx.checkPairing(s4.code,s4.secret).expired===true);
// Previews
active='';
ok('preview needs a signed-in person', ctx.previewTv('LOBBY','','').signIn===true);
devices[0].seen=false;
active='owner@example.com';
const pv=ctx.previewTv('LOBBY','2026-11-22T10:45','');
ok('owner can preview any TV at any time', !!pv.screen && pv.t.preview===true);
ok('a preview never counts as the TV checking in', devices[0].seen===false);
const lim=ctx.saveUser({email:'l@x.org',name:'L',role:'Limited',themes:['School'],devices:['Room 104']},'');
const lTok=ctx.acceptInvite(lim.link.split('invite=')[1],'L','limit-pass-1');
active='';
ok('limited user cannot preview a TV outside their list', /access/.test(ctx.previewTv('LOBBY','',lTok).error||''));
ok('activity log records pairing and unpairing', log.some(l=>/^Paired a TV: Lobby/.test(l)) && log.some(l=>/^Unpaired a TV: Room 104/.test(l)));
