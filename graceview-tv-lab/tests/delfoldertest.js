const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map();const log=[];const settings={'Church Name':'G','Owner Email':'owner@x.org','Owner Name':'Pat','Fallback Theme':'Church'};
const folders={FA:{name:'Easter Slides',trashed:false,files:[{name:'01 a.jpg',mime:'image/jpeg'},{name:'02 b.mp4',mime:'video/mp4'}]},FB:{name:'Church Slides',trashed:false,files:[]}};
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),
    formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-11-16':f==='HH:mm'?'10:00':'2026-11-16 10:00'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  Session:{getActiveUser:()=>({getEmail:()=>'owner@x.org'}),getEffectiveUser:()=>({getEmail:()=>'owner@x.org'})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  DriveApp:{getFolderById:id=>{const f=folders[id];if(!f)throw new Error('none');return {setTrashed:t=>{f.trashed=t;}};}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
let themes;
const reset=()=>{themes=[{Theme:'Church','Slides Folder':'FB'},{Theme:'Easter','Slides Folder':'FA'},{Theme:'Easter Alt','Slides Folder':''}];folders.FA.trashed=false;};
reset();
ctx.folderId_=link=>/^F[A-Z]$/.test(link||'')?link:'';
ctx.folderFiles_=th=>{const f=folders[th['Slides Folder']];return f?{linked:true,name:f.name,files:f.files.map(x=>({name:x.name})),error:''}:{linked:false,files:[]};};
ctx.settings_=()=>({...settings});ctx.log_=(m,a,d)=>log.push(a+': '+d);
ctx.data_=()=>({themes:themes.map((t,i)=>({...t,_row:i+2})),devices:[],weekly:[],special:[],presets:[],users:[],override:{},launchers:[],greenRoom:[]});
ctx.sheet_=name=>({getRange:()=>({setValue(){}}),deleteRow:r=>{if(name==='Themes')themes.splice(r-2,1);}});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const throws=fn=>{try{fn();return '';}catch(e){return e.message;}};

let u=ctx.themeUsage('Easter','');
ok('usage describes the folder and that nothing else shares it', u.folder && u.folder.name==='Easter Slides' && u.folder.files===2 && u.folder.sharedWith.length===0);
ok('a theme with no folder says so', ctx.themeUsage('Easter Alt','').folder===null);
let r=ctx.deleteTheme('Easter','',false);
ok('unticked: the theme is deleted and the folder stays', !themes.some(t=>t.Theme==='Easter') && folders.FA.trashed===false && r.folderTrashed===false);
reset();
r=ctx.deleteTheme('Easter','',true);
ok('ticked: the folder goes to Drive trash', folders.FA.trashed===true && r.folderTrashed===true && log.some(l=>/Deleted theme: Easter \(slides folder moved to Drive trash\)/.test(l)));
reset();themes[2]['Slides Folder']='FA';
u=ctx.themeUsage('Easter','');
ok('a shared folder lists the other theme', u.folder.sharedWith.join()==='Easter Alt');
ok('a shared folder is never trashed, and the theme is kept', /also used by Easter Alt/.test(throws(()=>ctx.deleteTheme('Easter','',true))) && folders.FA.trashed===false && themes.some(t=>t.Theme==='Easter'));
