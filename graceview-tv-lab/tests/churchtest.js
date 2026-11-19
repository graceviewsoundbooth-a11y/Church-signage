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
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const reset=()=>vm.runInContext('tzCache_=null',ctx);

let c=ctx.church_();
ok('nothing set: Central time, no weather, plain empty-calendar text, no message line', c.timeZone==='America/Chicago'&&c.lat===null&&c.noEvents==='Nothing on the calendar this week.'&&c.messageLine==='');
fetched.length=0;ok('no location: no weather fetched', ctx.weather_()===null&&fetched.length===0);

const r=ctx.findPlace('Tomball','t');
ok('town search returns the place, region and time zone', r.length===1&&r[0].name==='Tomball'&&r[0].region==='Texas'&&r[0].lat===30.0972&&r[0].timeZone==='America/Chicago');

ctx.saveChurchSettings({name:'Graceview Baptist Church',website:'https://graceview.org/',timeZone:'America/Denver',place:'Tomball',lat:30.0972,lon:-95.6161,unit:'C',messageLine:'',noEvents:''},'t');
reset();c=ctx.church_();
ok('saved: website cleaned to graceview.org', c.website==='graceview.org');
ok('wording built from the website', c.messageLine==='Watch graceview.org and your email for updates.'&&c.noEvents==='See all events at graceview.org');
ok('time zone used everywhere', ctx.tz_()==='America/Denver');
fetched.length=0;const w=ctx.weather_();
ok('weather uses the spot, °C and the zone', w&&w.temp===72&&w.place==='Tomball'&&/latitude=30.0972/.test(fetched[0])&&/celsius/.test(fetched[0])&&/America%2FDenver/.test(fetched[0]));
ok('the change is in the activity log', logs.some(x=>x==='Church settings:Graceview Baptist Church'));

ctx.saveChurchSettings({name:'Graceview',website:'graceview.org',timeZone:'America/Chicago',lat:'',lon:'',unit:'F',messageLine:'Call the office for details.',noEvents:'Check the bulletin.'},'t');
reset();c=ctx.church_();
ok('own wording wins over the website wording', c.messageLine==='Call the office for details.'&&c.noEvents==='Check the bulletin.');
ok('"No weather" clears the spot', c.lat===null&&c.place==='');
const sc=ctx.churchForScreens_();ok('screens and TVs get only what they need', !('messageLineSet' in sc)&&sc.messageLine==='Call the office for details.');

const bad=(o,re,l)=>{try{ctx.saveChurchSettings(Object.assign({name:'G',timeZone:'America/Chicago',lat:'',lon:''},o),'t');ok(l,false);}catch(e){ok(l,re.test(e.message));}};
bad({timeZone:'Mars/Olympus'},/time zone/,'an unknown time zone is refused');
bad({timeZone:'America/Chicago; drop'},/time zone/,'junk in the time zone is refused');
bad({name:'  '},/name/,'a blank church name is refused');
bad({lat:30},/weather location/,'half a location is refused');
bad({lat:200,lon:5},/weather location/,'an impossible location is refused');
role='Staff';
try{ctx.saveChurchSettings({name:'X',timeZone:'America/Chicago'},'t');ok('Staff cannot change church settings',false);}catch(e){ok('Staff cannot change church settings',/Owner or an Admin/.test(e.message));}
try{ctx.findPlace('Tomball','t');ok('Staff cannot search places',false);}catch(e){ok('Staff cannot search places',true);}
settings.push(['Time Zone','Not/AZone']);role='Owner';reset();
const s2=settings.findIndex(r=>r[0]==='Time Zone');settings[s2][1]='garbage';reset();
ok('a bad zone typed in the Sheet falls back to Central', ctx.tz_()==='America/Chicago');
