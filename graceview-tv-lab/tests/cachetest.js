// Fast reads: Sheet tabs cached by version, writes and Sheet edits invalidate, act = change + state in one trip.
const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const tabs={
  Settings:[['Setting','Value'],['Church Name','Graceview'],['Owner Email','o@x.org']],
  Users:[['Email','Name','Role','Themes','Devices','Status']],
  Devices:[['Device ID','Name'],['LOBBY','Lobby']],
  Themes:[['Theme'],['Main']], Weekly:[['Day']], 'Special Dates':[['Name']], Override:[['Active'],['FALSE']],
  Launchers:[['Name']], 'Green Room':[['Setting','Value']], Presets:[['Name']],
  Activity:[['When','Who','Action','Details']].concat(Array.from({length:500},(_,i)=>['2026-11-01 10:00','A','Did '+i,''])),
};
const reads={};let ranged=null;
const sheetObj=n=>({
  getDataRange:()=>({getDisplayValues:()=>{reads[n]=(reads[n]||0)+1;return tabs[n].map(r=>r.slice());}}),
  getLastRow:()=>tabs[n].length, getLastColumn:()=>tabs[n][0].length,
  getRange:(r,c,nr,nc)=>({getDisplayValues:()=>{if(r>1)ranged=[r,nr];return tabs[n].slice(r-1,r-1+(nr||1)).map(x=>x.slice(c-1,c-1+(nc||1)));},
    setValue:v=>{tabs[n][r-1][c-1]=String(v);}}),
  appendRow:r=>tabs[n].push(r.map(String)),
});
const store=new Map();
const cache={get:k=>store.has(k)?store.get(k):null,getAll:ks=>{const o={};ks.forEach(k=>{if(store.has(k))o[k]=store.get(k);});return o;},put:(k,v)=>store.set(k,String(v)),putAll:o=>Object.keys(o).forEach(k=>store.set(k,o[k])),remove:k=>store.delete(k)};
let flushed=0;
const ctx={console,
  SpreadsheetApp:{getActive:()=>({getSheetByName:n=>tabs[n]?sheetObj(n):null}),flush:()=>{flushed++;}},
  CacheService:{getScriptCache:()=>cache},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperties:()=>({'apps:LOBBY':'[{"pkg":"a","label":"A"}]'}),getProperty:()=>null,setProperty(){},deleteProperty(){}})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s)).digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),formatDate:()=>'2026-11-19 10:00'},
  ScriptApp:{getService:()=>({getUrl:()=>'https://x/exec'})},
  Session:{getActiveUser:()=>({getEmail:()=>''}),getEffectiveUser:()=>({getEmail:()=>'o@x.org'})},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const newRequest=()=>vm.runInContext('book__=null;tabMemo_={};dirtyTabs_={};settingsCache_=null;propsMemo_=null;folderMemo_={};calMemo_={};',ctx);
const total=()=>Object.values(reads).reduce((a,b)=>a+b,0);

newRequest();ctx.data_();ctx.settings_();
ok('first load reads each tab once', reads.Devices===1&&reads.Settings===1&&reads.Users===1);
const before=total();
newRequest();const d=ctx.data_();ctx.settings_();
ok('the next load reads nothing from the Sheet', total()===before&&d.devices[0].Name==='Lobby');
ok('same answer from the cache', ctx.settings_()['Church Name']==='Graceview');

newRequest();
ctx.locked_(()=>{ctx.sheet_('Devices').getRange(2,2).setValue('Front Lobby');});
ok('a write is saved before the tab is marked changed', flushed>=1);
newRequest();const b2=Object.assign({},reads);const d2=ctx.data_();
ok('after a write, only that tab is read again', reads.Devices===b2.Devices+1&&reads.Themes===b2.Themes);
ok('and the change shows', d2.devices[0].Name==='Front Lobby');

newRequest();
ctx.setSetting_('Church Name','Graceview Baptist');
ok('a setting saved shows in the same request', ctx.settings_()['Church Name']==='Graceview Baptist');
ctx.saveTabs_();newRequest();
ok('and in the next one', ctx.settings_()['Church Name']==='Graceview Baptist');

// Someone types into the Sheet.
tabs.Themes[1][0]='Youth';
newRequest();ok('a Sheet edit is not seen before onEdit (cached)', ctx.data_().themes[0].Theme==='Main');
ctx.onEdit({range:{getSheet:()=>({getName:()=>'Themes'})}});
newRequest();ok('after onEdit the tab is read fresh', ctx.data_().themes[0].Theme==='Youth');

// A stale reader can't keep old values: values read before a write are stored under the old version.
newRequest();
const ver1=store.get('tabv:Presets');
vm.runInContext('dirtyTabs_={}',ctx);ctx.sheet_('Presets');ctx.saveTabs_();
ok('a write gives the tab a new version', store.get('tabv:Presets')!==ver1);

// Activity: only the last rows.
newRequest();ranged=null;
const act=ctx.activityTail_(50);
ok('recent activity reads only the last 50 rows', ranged&&ranged[1]===50&&act.length===50&&act[0].Action==='Did 499'&&act[49].Action==='Did 450');
const r0=ranged;ranged=null;newRequest();ctx.activityTail_(50);
ok('and is cached until something is logged', ranged===null);
ctx.log_({name:'A'},'New thing','');ctx.saveTabs_();newRequest();
ok('a new log line shows at the top', ctx.activityTail_(50)[0].Action==='New thing');

// Properties: one read for all TVs.
let propReads=0;const P=ctx.PropertiesService;ctx.PropertiesService={getScriptProperties:()=>({getProperties:()=>{propReads++;return {'apps:A':'[1]','apps:B':'[1,2]'};},getProperty:()=>null,setProperty(){},deleteProperty(){}})};
newRequest();ctx.prop_('apps:A');ctx.prop_('apps:B');ctx.reportedApps_();
ok('script properties are read once per request', propReads===1&&ctx.prop_('apps:B')==='[1,2]');
ctx.PropertiesService=P;

// act: the change and the new state together.
newRequest();
ctx.getState=(iso,tok)=>({state:'S',iso,tok});
ctx.saveDevice=(v,tok)=>({renamed:0,tok});
const a=ctx.act('saveDevice',[{id:'LOBBY'},'TOK'],'','TOK');
ok('act returns the change’s result and the fresh state', a.result.tok==='TOK'&&a.state.state==='S'&&a.state.tok==='TOK');
let err='';try{ctx.act('act',[],'','T');}catch(e){err=e.message;}
ok('act can’t call itself', err==='Unknown call.');
err='';try{ctx.act('doGet',[],'','T');}catch(e){err=e.message;}
ok('act only runs the dashboard’s calls', err==='Unknown call.');
ctx.saveDevice=()=>{throw new Error('Give the TV a name.');};
err='';try{ctx.act('saveDevice',[{}],'','T');}catch(e){err=e.message;}
ok('a failed change comes back as its message', err==='Give the TV a name.');

// No cache at all: still works.
newRequest();const C=ctx.CacheService;ctx.CacheService={getScriptCache:()=>{throw new Error('down');}};
let fine=false;try{fine=ctx.data_().devices.length===1;}catch(e){}
ok('if the cache is down, it reads the Sheet', fine);
ctx.CacheService=C;
