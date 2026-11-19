const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map();const log=[];const settings={'Church Name':'Graceview','Owner Email':'owner@x.org','Owner Name':'Pat','Slides Root Folder':'https://drive.google.com/drive/folders/ROOTxxxxxxxxxxxxxxxxxxxx'};
const folders={};let n=0;
function mkFolder(name,files){const id='F'+(++n)+'xxxxxxxxxxxxxxxxxxxx';folders[id]={id,name,files:files||[],access:'PRIVATE'};return id;}
const churchFolder=mkFolder('Church Slides',[{name:'01 Welcome.jpg',mime:'image/jpeg'},{name:'02 Give.mp4',mime:'video/mp4'},{name:'notes.txt',mime:'text/plain'}]);
const root=mkFolder('Graceview Signage Slides');
const fo=id=>{const f=folders[id];if(!f)throw new Error('no folder');return {
  getName:()=>f.name,getUrl:()=>'https://drive.google.com/drive/folders/'+f.id,setSharing:(a)=>{f.access=a;},getSharingAccess:()=>f.access,
  createFolder:name=>fo(mkFolder(name)),
  getFiles:()=>{let i=0;return {hasNext:()=>i<f.files.length,next:()=>{const x=f.files[i++];return {getName:()=>x.name,getMimeType:()=>x.mime,makeCopy:(nm,to)=>{folders[to._id].files.push({name:nm,mime:x.mime});}};}};},
  _id:f.id};};
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),
    formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-11-16':f==='HH:mm'?'10:00':'2026-11-16 10:00'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  Session:{getActiveUser:()=>({getEmail:()=>'owner@x.org'}),getEffectiveUser:()=>({getEmail:()=>'owner@x.org'})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  DriveApp:{Access:{ANYONE_WITH_LINK:'ANYONE_WITH_LINK',ANYONE:'ANYONE'},Permission:{VIEW:'VIEW'},getFolderById:fo,createFolder:name=>fo(mkFolder(name))}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const themes=[{Theme:'Church','Display Name':'Graceview Baptist Church',Main:'#CF2020',Accent:'#B50606','Logo URL':'https://logo','Wayfinding Left':'Hall','Wayfinding Right':'Nursery',
  'QR Label':'Info','QR Link':'https://g.org','Wi-Fi Name':'Guest','Wi-Fi Password':'0123pass',Calendar:'webcal://cal','Calendar Hide':'Private Event',
  'Slides Folder':'https://drive.google.com/drive/folders/'+churchFolder,'Main Text':'#FFFFFF','Accent Text':'#FFFFFF'}];
ctx.settings_=()=>({...settings});ctx.setSetting_=(k,v)=>{settings[k]=v;};ctx.log_=(m,a,d)=>log.push(a+': '+d);
ctx.data_=()=>({themes:themes.map((t,i)=>({...t,_row:i+2})),devices:[],weekly:[],special:[],presets:[],users:[],override:{},launchers:[],greenRoom:[]});
const COLS=['Theme','Display Name','Main','Accent','Logo URL','Wayfinding Left','Wayfinding Right','QR Label','QR Link','Wi-Fi Name','Wi-Fi Password','Calendar','Calendar Hide','Slides Folder','Main Text','Accent Text'];
ctx.appendRow_=(sh,v)=>{const o={};COLS.forEach((c,i)=>o[c]=String(v[i]).replace(/^'/,''));themes.push(o);return themes.length+1;};
ctx.sheet_=name=>({getRange:(r,c)=>({setValue:v=>{if(name==='Themes'&&c===14)themes[r-2]['Slides Folder']=v;},getDisplayValue:()=>themes[r-2]['Slides Folder']})});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const throws=fn=>{try{fn();return '';}catch(e){return e.message;}};
const T=nm=>themes.find(t=>t.Theme===nm);

ctx.duplicateTheme('Church',{name:'Easter',display:'Easter at Graceview',main:'#6a3d9a',accent:'#f0c419',mainText:'#ffffff',accentText:'#1a1a1a',slides:'new'},'');
const e=T('Easter');
ok('new name, name on screens and colors are used', e && e['Display Name']==='Easter at Graceview' && e.Main==='#6A3D9A' && e.Accent==='#F0C419' && e['Accent Text']==='#1A1A1A');
ok('everything else is copied', e['Logo URL']==='https://logo' && e['Wayfinding Left']==='Hall' && e['QR Link']==='https://g.org' && e['Wi-Fi Password']==='0123pass' && e.Calendar==='webcal://cal' && e['Calendar Hide']==='Private Event');
const eFolder=folders[ctx.folderId_(e['Slides Folder'])];
ok('"new" makes an empty, shared folder named for the theme', eFolder && eFolder.name==='Easter Slides' && eFolder.files.length===0 && eFolder.access==='ANYONE_WITH_LINK' && eFolder.id!==churchFolder);
const r=ctx.duplicateTheme('Church',{name:'VBS',slides:'copy'},'');
const vFolder=folders[ctx.folderId_(T('VBS')['Slides Folder'])];
ok('"copy" makes a new folder with copies of the slides (images and videos only)', r.copied===2 && vFolder.files.map(f=>f.name).join()==='01 Welcome.jpg,02 Give.mp4' && folders[churchFolder].files.length===3);
ok('blank colors keep the original colors', T('VBS').Main==='#CF2020' && T('VBS')['Display Name']==='Graceview Baptist Church');
ctx.duplicateTheme('Church',{name:'Church Alt',slides:'share'},'');
ok('"share" points at the same folder', T('Church Alt')['Slides Folder']===T('Church')['Slides Folder']);
ok('a taken name is refused', /already a theme/.test(throws(()=>ctx.duplicateTheme('Church',{name:'easter'},''))));
ok('a blank name is refused', /Give the new theme a name/.test(throws(()=>ctx.duplicateTheme('Church',{name:' '},''))));
ok('it is logged with the slides choice', log.some(l=>/Duplicated theme: Church as VBS \(2 slides copied\)/.test(l)) && log.some(l=>/as Church Alt \(same slides folder\)/.test(l)));
