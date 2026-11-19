const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map();const log=[];
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),
    formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-11-16':f==='HH:mm'?'10:00':'2026-11-16 10:00'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  Session:{getActiveUser:()=>({getEmail:()=>'owner@x.org'}),getEffectiveUser:()=>({getEmail:()=>'owner@x.org'})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({text:t,setMimeType(){return this;}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const launchers=[{Name:'Classroom',Tiles:'watchlive, announcements, app:us.zoom.videomeetings|Zoom, web:https://graceview.org|Church Site, bogus, allapps','Idle Minutes':'',Notes:''}];
const devices=[{'Device ID':'LOBBY',Name:'Lobby',Profile:'Signage','Default Theme':'Church',Launcher:''},{'Device ID':'CLASS101',Name:'Classroom 101',Profile:'Classroom','Default Theme':'Church',Launcher:'Classroom'}];
ctx.settings_=()=>({'Church Name':'G','Owner Email':'owner@x.org','Owner Name':'Pat'});
ctx.log_=(m,a,d)=>log.push(a+': '+d);ctx.heartbeat_=()=>{};
ctx.data_=()=>({launchers:launchers.map((l,i)=>({...l,_row:i+2})),devices:devices.map((v,i)=>({...v,_row:i+2})),themes:[],weekly:[],special:[],override:{},slides:[],users:[],presets:[]});
ctx.folderListings_=()=>({});
ctx.appendRow_=(sh,v)=>{launchers.push({Name:v[0],Tiles:v[1],'Idle Minutes':String(v[2]),Notes:v[3]});return launchers.length+1;};
ctx.sheet_=name=>({getRange:(r,c,nr,nc)=>({
  setValue:v=>{if(name==='Devices'&&c===15)devices[r-2].Launcher=v;},
  setValues:vv=>{if(name==='Launchers'){const l=launchers[r-2];l.Name=vv[0][0];l.Tiles=vv[0][1];l['Idle Minutes']=String(vv[0][2]);l.Notes=vv[0][3];}}}),
  deleteRow:r=>{if(name==='Launchers')launchers.splice(r-2,1);}});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const throws=fn=>{try{fn();return '';}catch(e){return e.message;}};

const t=ctx.parseTiles_(launchers[0].Tiles);
ok('built-ins, app and website tiles parse; unknown ones are dropped', t.length===5 && t[2].type==='app' && t[2].value==='us.zoom.videomeetings' && t[2].label==='Zoom' && t[3].type==='web' && t[3].label==='Church Site');
ok('tiles round-trip to text', ctx.tilesText_(t)==='watchlive, announcements, app:us.zoom.videomeetings|Zoom, web:https://graceview.org|Church Site, allapps');
// TV state includes its layout and stores reported apps
const key='k'.repeat(64);props.set('tv:'+ctx.sha_(key),JSON.stringify({deviceId:'CLASS101'}));
const st=JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({action:'state',key,apps:JSON.stringify([{pkg:'us.zoom.videomeetings',label:'Zoom'},{pkg:'com.google.android.youtube.tv',label:'YouTube'}])})}}).text);
ok('state sends the TV its layout', st.launcher && st.launcher.name==='Classroom' && st.launcher.tiles.length===5);
ok('reported apps are saved for the picker', ctx.reportedApps_().map(a=>a.label).join()==='YouTube,Zoom');
const lob=JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({action:'state',key:(()=>{const k='j'.repeat(64);props.set('tv:'+ctx.sha_(k),JSON.stringify({deviceId:'LOBBY'}));return k;})()})}}).text);
ok('a TV without a layout gets none (built-in row)', lob.launcher===null);
// Saving
ctx.saveLauncher({original:'',name:'Nursery',tiles:[{type:'watchlive'},{type:'app',value:'com.pbs.kids',label:'PBS Kids'}],idleMinutes:15,devices:['LOBBY']},'');
ok('new layout saved and assigned to the chosen TV', launchers.some(l=>l.Name==='Nursery' && l.Tiles==='watchlive, app:com.pbs.kids|PBS Kids' && l['Idle Minutes']==='15') && devices[0].Launcher==='Nursery');
ctx.saveLauncher({original:'Nursery',name:'Nursery Room',tiles:[{type:'allapps'}],idleMinutes:0,devices:[]},'');
ok('renaming and unticking a TV clears it', launchers.some(l=>l.Name==='Nursery Room') && devices[0].Launcher==='');
ok('duplicate name refused', /already a layout/.test(throws(()=>ctx.saveLauncher({original:'',name:'classroom',tiles:[{type:'allapps'}]},''))));
ok('http website refused', /https/.test(throws(()=>ctx.saveLauncher({original:'',name:'X',tiles:[{type:'web',value:'http://a.b'}]},''))));
ok('bad package refused', /package name/.test(throws(()=>ctx.saveLauncher({original:'',name:'Y',tiles:[{type:'app',value:'zoom'}]},''))));
ok('empty layout refused', /at least one tile/.test(throws(()=>ctx.saveLauncher({original:'',name:'Z',tiles:[]},''))));
ctx.deleteLauncher('Classroom','');
ok('deleting a layout clears TVs that used it', !launchers.some(l=>l.Name==='Classroom') && devices[1].Launcher==='');
ok('changes are logged', log.some(l=>/^Added launcher: Nursery/.test(l)) && log.some(l=>/^Deleted launcher: Classroom/.test(l)));
// idle minutes flow into the production batch column F
devices[0].Launcher='Nursery Room';launchers.find(l=>l.Name==='Nursery Room')['Idle Minutes']='20';
const b=ctx.toProductionBatch_(ctx.data_(),{stamp:'2026-11-16 10:00',ymd:'2026-11-16',mins:600});
ok("layout's idle minutes become the TV's Idle Return", b.valueRanges[3].values[0][5]==='20');
