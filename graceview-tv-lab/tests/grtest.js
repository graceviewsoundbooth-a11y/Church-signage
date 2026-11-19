const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map();const log=[];let written=null;
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
const grRows=[['Setting','Value','',''],['Planning Center Service Type ID','Worship Service','',''],['Mic Assignment Source','Position name','',''],['Plan Note Category','','',''],
  ['Hide Declined People','TRUE','',''],['ProPresenter Address','192.168.1.50:50001','',''],['ProPresenter Timer Name','Sermon Timer','',''],['Avantis Address','192.168.1.60','',''],
  ['Avantis MIDI Base Channel','12','',''],['','','',''],['Mic Label','Avantis Input Channel','Notes','Planning Center Position'],['HH 1','41','Handheld 1',''],['HS 1','37','Pastor headset','Pastor']];
const devices=[{'Device ID':'LOBBY',Name:'Lobby',Profile:'Signage','Default Theme':'Church'},{'Device ID':'GREEN',Name:'Green Room',Profile:'Green Room','Default Theme':'Church','Paired At':'2026-11-16 10:00'}];
ctx.settings_=()=>({'Church Name':'G','Owner Email':'owner@x.org','Owner Name':'Pat'});
ctx.log_=(m,a,d)=>log.push(a+': '+d);ctx.heartbeat_=()=>{};ctx.folderListings_=()=>({});
ctx.greenRoomRows_=()=>grRows;
ctx.data_=()=>({launchers:[],devices:devices.map((v,i)=>({...v,_row:i+2})),themes:[],weekly:[],special:[],override:{},users:[],presets:[],greenRoom:grRows});
ctx.sheet_=name=>({clearContents(){},getRange:(r,c,nr,nc)=>({setValues:v=>{if(name==='Green Room')written=v;},setValue(){}})});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const throws=fn=>{try{fn();return '';}catch(e){return e.message;}};
const post=b=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(b)}}).text);
const keyFor=id=>{const k=crypto.randomBytes(32).toString('hex');props.set('tv:'+ctx.sha_(k),JSON.stringify({deviceId:id}));return k;};
const gk=keyFor('GREEN'),lk=keyFor('LOBBY');

let g=post({action:'state',key:gk});
ok('Green Room tab rows go to TVs as the production range', JSON.stringify(g.batch.valueRanges[7].values[1])==='["Planning Center Service Type ID","Worship Service","",""]' && g.batch.valueRanges[7].values.length===13);
ok('a Green Room TV with no saved login gets a blank one (= cleared)', g.planningCenter && g.planningCenter.appId==='' && g.planningCenter.secret==='');
ok('a signage TV never gets the Planning Center field', post({action:'state',key:lk}).planningCenter===null);
ok('a bad login is refused', /Paste the Application ID/.test(throws(()=>ctx.savePlanningCenter('short','x',''))));
const id='a'.repeat(64),sec='b'.repeat(64);
ctx.savePlanningCenter(id,sec,'');
g=post({action:'state',key:gk});
ok('the Green Room TV receives the saved login', g.planningCenter.appId===id && g.planningCenter.secret===sec);
ok('a signage TV still never sees it', post({action:'state',key:lk}).planningCenter===null);
ok('the login is not logged', !log.some(l=>l.includes(id)||l.includes(sec)) && log.some(l=>/^Saved the Planning Center login/.test(l)));
const panel=ctx.greenRoomForPanel_(ctx.data_());
ok('the panel sees only a hint, never the secret', panel.planningCenter.saved && panel.planningCenter.idHint==='…aaaa' && !JSON.stringify(panel).includes(sec) && !JSON.stringify(panel).includes(id));
ok('the panel reads settings and the mic map', panel.settings['ProPresenter Address']==='192.168.1.50:50001' && panel.mics.length===2 && panel.mics[1].position==='Pastor');
ok('the panel lists Green Room TVs only', panel.tvs.length===1 && panel.tvs[0].name==='Green Room' && panel.tvs[0].status===null);
// status reports
post({action:'state',key:gk,greenRoom:JSON.stringify({planningCenter:{ok:true,text:''},proPresenter:{ok:false,text:'No answer from ProPresenter at 192.168.1.50:50001.'},avantis:{ok:false,text:'x'.repeat(500)}})});
const st=ctx.greenRoomForPanel_(ctx.data_()).tvs[0].status;
ok('the TV report shows up per source', st.planningCenter.ok===true && st.proPresenter.ok===false && /192\.168\.1\.50/.test(st.proPresenter.text) && st.at);
ok('long report text is trimmed', st.avantis.text.length===160);
ctx.clearPlanningCenter('');
ok('removing the login sends a blank one to the TV', post({action:'state',key:gk}).planningCenter.appId==='');
// saving settings
ctx.saveGreenRoom({settings:{'Planning Center Service Type ID':'Worship Service','Mic Assignment Source':'Position name','Hide Declined People':'FALSE','ProPresenter Address':'10.0.0.5:53704','Avantis Address':'10.0.0.6','Avantis MIDI Base Channel':'12'},
  mics:[{label:'HH 1',channel:'41',notes:'',position:''},{label:'',channel:'5'}]},'');
ok('saving writes settings, then a Mic Label table, skipping blank mics', written[0][0]==='Setting' && written[4][1]==='FALSE' && written[5][1]==="'10.0.0.5:53704" && written[10][0]==='Mic Label' && written.length===12 && written[11][1]===41);
ok('bad address refused', /should look like/.test(throws(()=>ctx.saveGreenRoom({settings:{'Mic Assignment Source':'','ProPresenter Address':'http://x y'},mics:[]},''))));
ok('bad channel refused', /1 to 64/.test(throws(()=>ctx.saveGreenRoom({settings:{'Mic Assignment Source':''},mics:[{label:'HH 9',channel:'99'}]},''))));
ok('bad mic source refused', /mic assignment source/.test(throws(()=>ctx.saveGreenRoom({settings:{'Mic Assignment Source':'Guess'},mics:[]},''))));
