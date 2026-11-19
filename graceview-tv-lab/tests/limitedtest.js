// A Limited person (renter): manages only their own themes, and only hears about their own themes and TVs.
const vm=require('vm'),fs=require('fs');
const ctx={console,
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},getAll:()=>({}),remove(){}})},
  SpreadsheetApp:{flush(){}},
  PropertiesService:{getScriptProperties:()=>({getProperties:()=>({}),getProperty:()=>null})},
  Utilities:{formatDate:()=>'2026-11-19 10:00'},
  ScriptApp:{getService:()=>({getUrl:()=>'https://x/exec'})},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const th=(n,folder)=>({Theme:n,'Display Name':n,Main:'#111111',Accent:'#222222','Slides Folder':folder,_row:n==='Main'?2:3});
const d={themes:[th('Main','https://drive.google.com/drive/folders/MAINFOLDER1234567890'),th('Renter','https://drive.google.com/drive/folders/RENTERFOLDER123456789')],
  devices:[{'Device ID':'LOBBY',Name:'Lobby',Profile:'Signage'},{'Device ID':'ROOM1',Name:'Room 1',Profile:'Classroom'}],
  weekly:[],special:[],override:{},launchers:[],greenRoom:[],presets:[],users:[]};
let me={email:'r@x.org',name:'Renter',role:'Limited',themes:['Renter'],devices:['Room 1']};
let written=null;
ctx.data_=()=>d;ctx.me_=()=>me;ctx.log_=()=>{};
ctx.sheet_=()=>({getRange:()=>({setValues:v=>{written=v[0];}})});
const form=n=>Object.assign({},d.themes.find(x=>x.Theme===n),{Main:'#AA0000','Main Text':'#FFFFFF','Accent Text':'#FFFFFF'});

let f=form('Renter');f['Slides Folder']='https://drive.google.com/drive/folders/MAINFOLDER1234567890';
ctx.saveTheme(f,'T');
ok('a renter saves their own theme', written&&String(written[2]).replace(/^'/,'')==="#AA0000");
ok('but its slides folder stays the same (can’t point it at another theme’s)', written[13]===d.themes[1]['Slides Folder']);
let err='';try{ctx.saveTheme(form('Main'),'T');}catch(e){err=e.message;}
ok('a renter can’t change another theme', /only change the Renter theme/.test(err));
for(const [fn,args] of [['addTheme',[{name:'X'}]],['deleteTheme',['Main']],['duplicateTheme',['Renter',{name:'Y'}]],['setFallbackTheme',['Renter']],['createThemeFolder',['Renter']],['shareThemeFolder',['Renter']]]){
  err='';try{ctx[fn].apply(null,args.concat(['T']));}catch(e){err=e.message;}
  ok('a renter can’t '+fn, /Owner or an Admin/.test(err));
}
me={email:'a@x.org',name:'Admin',role:'Admin',themes:['ALL'],devices:['ALL']};
f=form('Renter');f['Slides Folder']='https://drive.google.com/drive/folders/NEWFOLDER12345678901';
ctx.saveTheme(f,'T');ok('an Admin can still change the folder', written[13]===f['Slides Folder']);

// What the dashboard is sent.
['resolve_','screen_','folderFiles_','slidesFor_','eventsFor_','fallbackTheme_','weather_','reportedApps_','conflicts_','activityTail_','church_','tz_','themeObj_','greenRoomForPanel_'].forEach(k=>ctx[k]=()=>({}));
ctx.calendar_=()=>({count:0,errors:[],sources:[]});ctx.settings_=()=>({'Church Name':'G'});ctx.at_=()=>({ymd:'2026-11-19'});ctx.minutesAgo_=()=>99;
me={email:'r@x.org',name:'Renter',role:'Limited',themes:['Renter'],devices:['Room 1']};
let s=ctx.getState('','T');
ok('a renter sees only their theme', JSON.stringify(s.allThemes)==='["Renter"]'&&s.themes.length===1);
ok('and only their TVs', JSON.stringify(s.allDevices.map(x=>x.name))==='["Room 1"]'&&s.deviceList.length===1&&s.devices.length===1);
ok('no people list or schedule', s.users.length===0&&s.weekly.length===0&&s.churchSettings===null);
me={email:'a@x.org',name:'Admin',role:'Admin',themes:['ALL'],devices:['ALL']};
s=ctx.getState('','T');
ok('an Admin still sees everything', s.allThemes.length===2&&s.allDevices.length===2);
