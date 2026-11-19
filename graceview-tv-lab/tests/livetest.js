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
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const sheet={getDataRange:()=>({getDisplayValues:()=>settings.map(r=>r.slice())}),
  getRange:(r,c)=>({setValue:v=>{settings[r-1][c-1]=String(v);}}),appendRow:r=>settings.push(r.map(String))};
ctx.sheet_=()=>sheet;ctx.tabSheet_=()=>sheet;
let role='Owner';ctx.data_=()=>({});ctx.me_=()=>({role,name:'Pat',email:'p@x.org'});const logs=[];ctx.log_=(m,a,b)=>logs.push(a+':'+b);
const ok=(l,cc)=>console.log((cc?'PASS ':'FAIL ')+l);
const reset=()=>vm.runInContext('tzCache_=null',ctx);

const base={name:'Graceview',timeZone:'America/Chicago',lat:'',lon:''};
const save=o=>{ctx.saveChurchSettings(Object.assign({},base,o),'t');reset();};
const batchLive=()=>ctx.toProductionBatch_({override:{},special:[],weekly:[],devices:[],themes:[],greenRoom:[]},{stamp:'2026-11-18 10:00'}).valueRanges[6].values;

save({});
let c=ctx.church_();
ok('nothing set: no feeds, plays YouTube', c.liveYouTube===''&&c.liveLocal===''&&c.livePlays==='YouTube'&&batchLive().length===0);

save({liveYouTube:'https://www.youtube.com/@GBCtomball/live'});
let b=batchLive();
ok('YouTube only: one Active YouTube row in Live Feeds', b.length===1&&b[0].join('|')==='YouTube|YouTube|https://www.youtube.com/@GBCtomball/live|TRUE|');

save({liveYouTube:'https://www.youtube.com/@GBCtomball/live',liveLocal:'rtsp://192.168.0.50:554/live',livePlays:'Local stream'});
b=batchLive();c=ctx.church_();
ok('local stream picked: it is Active, YouTube row stays for the Watch Live check', b.length===2&&b[0][3]==='FALSE'&&b[1].join('|')==='Local stream|Local stream|rtsp://192.168.0.50:554/live|TRUE|'&&c.livePlays==='Local stream');

save({liveYouTube:'https://www.youtube.com/@GBCtomball/live',liveLocal:'srt://10.0.0.5:9000',livePlays:'YouTube'});
b=batchLive();
ok('YouTube picked with a local stream too: only YouTube Active', b[0][3]==='TRUE'&&b[1][3]==='FALSE');

const bad=(o,re,l)=>{try{ctx.saveChurchSettings(Object.assign({},base,o),'t');ok(l,false);}catch(e){ok(l,re.test(e.message));}};
bad({liveYouTube:'youtube.com/@x/live'},/YouTube address/,'a YouTube link without https is refused');
bad({liveYouTube:'https://vimeo.com/x'},/YouTube address/,'a non-YouTube link is refused');
bad({liveLocal:'192.168.0.50'},/local stream/,'a bare IP for the local stream is refused');
bad({liveLocal:'rtsp://x y'},/local stream/,'spaces in the stream address are refused');
bad({livePlays:'Local stream'},/local stream address/,'playing the local stream with none set is refused');
c=ctx.church_();
ok('a refused save changes nothing', c.liveLocal==='srt://10.0.0.5:9000'&&c.livePlays==='YouTube');

const i=settings.findIndex(r=>r[0]==='Live Local Stream');settings[i][1]='';
const j=settings.findIndex(r=>r[0]==='Live Plays');settings[j][1]='Local stream';
vm.runInContext('settingsCache_=null;tabMemo_={}',ctx);
ok('Local stream picked in the Sheet but blank: falls back to YouTube', ctx.church_().livePlays==='YouTube'&&batchLive().length===1&&batchLive()[0][3]==='TRUE');
