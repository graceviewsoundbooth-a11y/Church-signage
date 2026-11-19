// Church settings on the server: defaults, wording from the website, time zone, weather, saving, permissions.
const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
let settings=[['Key','Value'],['Church Name','Graceview'],['Owner Email','owner@x.org']];
const fetched=[];
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s)).digest()],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),
    formatDate:(d,tz,f)=>{new Intl.DateTimeFormat('en-US',{timeZone:tz});return '2026-11-18 10:00'.slice(0,f.length);}},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  UrlFetchApp:{fetch:(u)=>{fetched.push(u);
    if(u.includes('geocoding'))return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({results:[{name:'Tomball',admin1:'Texas',country_code:'US',country:'United States',latitude:30.09716,longitude:-95.61605,timezone:'America/Chicago'}]})};
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({current:{temperature_2m:71.6,weather_code:2}})};}},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8').replace('const BUILTIN_VIDEO_KEY','var BUILTIN_VIDEO_KEY'),ctx);
const sheet={getDataRange:()=>({getDisplayValues:()=>settings.map(r=>r.slice())}),
  getRange:(r,c)=>({setValue:v=>{settings[r-1][c-1]=String(v);}}),appendRow:r=>settings.push(r.map(String))};
ctx.sheet_=()=>sheet;ctx.tabSheet_=()=>sheet;
let role='Owner';ctx.data_=()=>({});ctx.me_=()=>({role,name:'Pat',email:'p@x.org'});const logs=[];ctx.log_=(m,a,b)=>logs.push(a+':'+b);
const ok=(l,cc)=>console.log((cc?'PASS ':'FAIL ')+l);
const reset=()=>vm.runInContext('tzCache_=null',ctx);

const base={name:'Graceview',timeZone:'America/Chicago',lat:'',lon:''};
const KEY='AIza'+'B'.repeat(35);
const fresh=()=>vm.runInContext('settingsCache_=null;tabMemo_={}',ctx);
ok('the built-in key is in the source and valid', /^AIza[0-9A-Za-z_-]{35}$/.test(vm.runInContext('BUILTIN_VIDEO_KEY',ctx))&&ctx.videoKey_()===vm.runInContext('BUILTIN_VIDEO_KEY',ctx));
vm.runInContext("BUILTIN_VIDEO_KEY='AIza"+'A'.repeat(35)+"'",ctx);
ok('built-in key used when the church has none', ctx.videoKey_()==='AIza'+'A'.repeat(35)&&ctx.church_().videoKeyBuiltIn===true);
ctx.saveChurchSettings(Object.assign({},base,{videoKey:'  '+KEY+' '}),'t');fresh();
ok('the church\'s own key wins', ctx.videoKey_()===KEY&&ctx.church_().videoKey===KEY);
ctx.saveChurchSettings(Object.assign({},base,{videoKey:''}),'t');fresh();
ok('clearing it goes back to the built-in key', ctx.videoKey_()==='AIza'+'A'.repeat(35));
try{ctx.saveChurchSettings(Object.assign({},base,{videoKey:'abc123'}),'t');ok('a junk key is refused',false);}catch(e){ok('a junk key is refused',/API key/.test(e.message));}
const i=settings.findIndex(r=>r[0]==='Google API Key');settings[i][1]='not a key';fresh();
ok('a junk key typed in the Sheet falls back to the built-in key', ctx.videoKey_()==='AIza'+'A'.repeat(35));
ctx.folderFiles_=()=>({files:[{id:'IMG1',title:'Welcome',thumb:'t1',full:false,video:false},{id:'VID1',title:'Promo',thumb:'t2',full:true,video:true}]});
const sl=ctx.slidesFor_({Theme:'Church'},{ymd:'2026-11-19'});
ok('video slides carry their file ID, pictures don\'t', sl[0].id===''&&sl[1].id==='VID1'&&sl[1].full===true);
