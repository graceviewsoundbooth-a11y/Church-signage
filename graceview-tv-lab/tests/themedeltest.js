const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map();const log=[];const writes=[];const settings={'Church Name':'G','Owner Email':'owner@x.org','Owner Name':'Pat'};
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),
    formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-11-16':f==='HH:mm'?'10:00':'2026-11-16 10:00'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  Session:{getActiveUser:()=>({getEmail:()=>'owner@x.org'}),getEffectiveUser:()=>({getEmail:()=>'owner@x.org'})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
let themes=[{Theme:'Church',Main:'#CF2020'},{Theme:'School',Main:'#263D5A'},{Theme:'VBS',Main:'#B6562A'}];
const devices=[{'Device ID':'LOBBY',Name:'Lobby','Default Theme':'Church'},{'Device ID':'COFFEE',Name:'Coffee Spot','Default Theme':'VBS'},{'Device ID':'FRONT',Name:'Front Office','Default Theme':'Gone'}];
const weekly=[{Theme:'VBS',_row:2},{Theme:'Church',_row:3}],special=[{Theme:'VBS',_row:2}],presets=[{Name:'VBS Welcome',Theme:'VBS',_row:2}];
const users=[{Name:'Camp',Email:'c@x.org',Role:'Limited',Themes:'VBS, School',_row:2},{Name:'Sam',Role:'Staff',Themes:'ALL',_row:3}];
ctx.settings_=()=>({...settings});ctx.setSetting_=(k,v)=>{settings[k]=v;};
ctx.log_=(m,a,d)=>log.push(a+': '+d);
ctx.data_=()=>({themes:themes.map((t,i)=>({...t,_row:i+2})),devices:devices.map((v,i)=>({...v,_row:i+2})),weekly,special,presets,users,override:{Theme:'VBS',_row:2},launchers:[],slides:[],greenRoom:[]});
ctx.sheet_=name=>({getRange:(r,c)=>({setValue:v=>writes.push([name,r,c,v]),setValues:v=>writes.push([name,r,c,v])}),deleteRow:r=>{writes.push([name,'delete',r]);if(name==='Themes')themes.splice(r-2,1);}});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const throws=fn=>{try{fn();return '';}catch(e){return e.message;}};

ok('with no setting, the fallback is the first theme', ctx.fallbackTheme_(ctx.data_())==='Church');
settings['Fallback Theme']='Nope';ok('an unknown setting falls back to the first theme', ctx.fallbackTheme_(ctx.data_())==='Church');
ctx.setFallbackTheme('School','');ok('make fallback saves the setting', settings['Fallback Theme']==='School' && log.some(l=>/fallback theme: School/.test(l)));
ok('make fallback refuses an unknown theme', /isn't on the Themes tab/.test(throws(()=>ctx.setFallbackTheme('Nope',''))));
const u=ctx.themeUsage('VBS','');
ok('usage lists TVs, schedule rows, override, presets and Limited users', u.devices.join()==='Coffee Spot' && u.scheduleRows===2 && u.override===true && u.presets.join()==='VBS Welcome' && u.users.join()==='Camp' && u.fallback==='School' && !u.isFallback);
ok('the fallback theme cannot be deleted', /is the fallback theme/.test(throws(()=>ctx.deleteTheme('School',''))));
const r=ctx.deleteTheme('VBS','');
ok('its TV moves to the fallback', writes.some(w=>w[0]==='Devices'&&w[1]===3&&w[2]===6&&w[3]==='School') && r.devices===1 && r.fallback==='School');
ok('schedule rows, override and preset are cleared to follow the TV', writes.some(w=>w[0]==='Weekly'&&w[1]===2&&w[2]===7&&w[3]==='') && !writes.some(w=>w[0]==='Weekly'&&w[1]===3) &&
  writes.some(w=>w[0]==='Special Dates'&&w[2]===9&&w[3]==='') && writes.some(w=>w[0]==='Override'&&w[2]===4&&w[3]==='') && writes.some(w=>w[0]==='Presets'&&w[2]===4&&w[3]===''));
ok('a Limited user loses just that theme', writes.some(w=>w[0]==='Users'&&w[1]===2&&w[2]===4&&w[3]==='School') && !writes.some(w=>w[0]==='Users'&&w[1]===3));
ok('the theme row is deleted and it is logged', writes.some(w=>w[0]==='Themes'&&w[1]==='delete'&&w[2]===4) && log.some(l=>/^Deleted theme: VBS: 1 TVs moved to School/.test(l)));
// A TV whose theme is missing (deleted straight from the Sheet) shows the fallback.
const t={ymd:'2026-11-16',mins:600,dow:1,stamp:'2026-11-16 10:00'};
ctx.folderFiles_=()=>({files:[]});ctx.calendar_=()=>({events:[],count:0,errors:[]});
const scr=ctx.screen_({...devices[2],_row:4,Profile:'Signage'},{mode:'Signage',theme:'Gone'},t,ctx.data_());
ok('a TV whose theme is missing shows the fallback', scr.theme.name==='School');
const b=ctx.toProductionBatch_(ctx.data_(),t);
ok('native TVs get the fallback for a missing theme', b.valueRanges[3].values[2][2]==='School' && b.valueRanges[3].values[0][2]==='Church');
themes=[{Theme:'School'}];ok('the last theme cannot be deleted', /fallback|only theme/.test(throws(()=>ctx.deleteTheme('School',''))));
