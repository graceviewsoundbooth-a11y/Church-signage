const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map(),cache=new Map(),settings={},log=[];
let active='owner@example.com',effective='owner@example.com';
const folders=[];let nextId=1;
function mkFolder(name){const f={id:'F'+(nextId++)+'xxxxxxxxxxxxxxxxxxxx',name,access:'PRIVATE',children:[],
  getUrl(){return 'https://drive.google.com/drive/folders/'+this.id;},getName(){return this.name;},
  setSharing(a,p){this.access=a;this.perm=p;},getSharingAccess(){return this.access;},
  createFolder(n){const c=mkFolder(n);this.children.push(c);return c;}};folders.push(f);return f;}
const themes=[
  {Theme:'Church','Slides Folder':'https://drive.google.com/drive/folders/EXISTINGxxxxxxxxxxxxxxx'},
  {Theme:'School','Slides Folder':''}];
const users=[];
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),formatDate:()=>'2026-11-16 12:00'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)??null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ScriptApp:{getService:()=>({getUrl:()=>'https://x/exec'})},
  DriveApp:{Access:{ANYONE_WITH_LINK:'ANYONE_WITH_LINK',ANYONE:'ANYONE',PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'},
    createFolder:n=>mkFolder(n),getFolderById:id=>{const f=folders.find(x=>x.id===id);if(!f)throw new Error('not found');return f;}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);ctx.setupSheet_=()=>[];ctx.setupSheet=()=>[];
ctx.settings_=()=>({...settings});
ctx.setSetting_=(k,v)=>{settings[k]=String(v).replace(/^'/,'');};
ctx.log_=(m,a)=>log.push(a);
ctx.data_=()=>({themes:themes.map((t,i)=>({...t,_row:i+2})),users:users.map((u,i)=>({...u,_row:i+2})),devices:[]});
ctx.appendRow_=(sh,v)=>{if(sh.name==='Themes'){themes.push({Theme:v[0],'Display Name':v[1],Main:v[2],Accent:v[3],'Slides Folder':v[13]});return themes.length+1;}
  users.push({Email:v[0],Name:v[1],Role:v[2],Themes:v[3],Devices:v[4],Status:v[5]});return users.length+1;};
ctx.sheet_=name=>({name,getRange:(r,c)=>({setValue:v=>{if(name==='Themes'&&c===14)themes[r-2]['Slides Folder']=v;else if(name==='Users'){users[r-2][{2:'Name',6:'Status',9:'Last Sign-in'}[c]]=v;}}}),deleteRow(){}});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const throws=fn=>{try{fn();return '';}catch(e){return e.message;}};

ctx.setupChurch({church:'Graceview',name:'Pat',password:'owner-pass-1'});
const root=folders.find(f=>f.name==='Graceview Signage Slides');
ok('setup made a "<Church> Signage Slides" folder', !!root);
ok('root folder is viewable by link', root && root.access==='ANYONE_WITH_LINK' && root.perm==='VIEW');
ok('theme without a folder got one inside it', /folders\/F/.test(themes[1]['Slides Folder']) && root.children.some(c=>c.name==='School Slides'));
ok('new theme folder is viewable by link', root.children.every(c=>c.access==='ANYONE_WITH_LINK'));
ok('theme that already had a folder kept it', themes[0]['Slides Folder'].includes('EXISTING'));
ok('root folder link saved in Settings', /folders\/F/.test(settings['Slides Root Folder']||''));
const owner=ctx.me_(ctx.data_(),'');
const r=ctx.addTheme({name:'Youth',display:'Graceview Youth',main:'#123456',accent:'#abcdef'},'');
ok('Add theme creates the theme', themes.some(t=>t.Theme==='Youth'));
ok('Add theme makes a shared folder in the same root', root.children.some(c=>c.name==='Youth Slides'&&c.access==='ANYONE_WITH_LINK') && themes.find(t=>t.Theme==='Youth')['Slides Folder']===r.folder);
ok('only one root folder ever made', folders.filter(f=>f.name==='Graceview Signage Slides').length===1);
ok('duplicate theme name refused', /already a theme/.test(throws(()=>ctx.addTheme({name:'youth'},''))));
ok('blank name refused', /Give the theme a name/.test(throws(()=>ctx.addTheme({name:'  '},''))));
ok('commas refused', /commas/.test(throws(()=>ctx.addTheme({name:'A, B'},''))));
// Staff and Limited cannot add themes or change sharing
const s=ctx.saveUser({email:'s@x.org',name:'S',role:'Staff'},'');const sTok=ctx.acceptInvite(s.link.split('invite=')[1],'S','staff-pass-1');
const l=ctx.saveUser({email:'l@x.org',name:'L',role:'Limited',themes:['School']},'');const lTok=ctx.acceptInvite(l.link.split('invite=')[1],'L','limit-pass-1');
active='';
ok('staff cannot add a theme', /Only the Owner or an Admin/.test(throws(()=>ctx.addTheme({name:'X'},sTok))));
ok('limited cannot add a theme', /Only the Owner or an Admin/.test(throws(()=>ctx.addTheme({name:'X'},lTok))));
ok('limited cannot change folder sharing', /Only the Owner or an Admin/.test(throws(()=>ctx.shareThemeFolder('School',lTok))));
// Sharing a hand-linked private folder
active='owner@example.com';
const priv=mkFolder('Pasted folder');themes[0]['Slides Folder']=priv.getUrl();
ok('pasted folder starts private', !ctx.isSharedByLink_(priv));
ctx.shareThemeFolder('Church','');
ok('Make viewable by link fixes it', ctx.isSharedByLink_(priv));
