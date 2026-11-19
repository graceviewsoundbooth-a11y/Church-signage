const vm=require('vm'),fs=require('fs');const noop=()=>{};
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const sent=[];let okH=null;
const run=new Proxy({},{get:(t,k)=>k.startsWith('with')?(f)=>{if(k==='withSuccessHandler')okH=f;return run;}:(...a)=>{if(k==="act"){sent.push([a[0],a[1]]);return;}sent.push([k,a]);}});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:(f)=>f(),clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},Intl,
  document:{addEventListener:noop,getElementById:id=>id==='params'?{textContent:'{}'}:(['busy','toast','who','nav','main'].includes(id)?el():null),querySelector:()=>null,querySelectorAll:()=>[]},
  google:{script:{run}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
ctx.__sent=sent;
vm.runInContext(`
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
var LOGO='https://drive.google.com/thumbnail?id=CHURCHLOGO&sz=w1000';var LOGOH=LOGO.replace('&','&amp;');
var th={name:'Renter',display:'Renter Church',main:'#18453B',accent:'#68B1A1',logo:'',wayL:[],wayR:[]};
var dev={id:'L',name:'Lobby',screen:{device:{id:'L',name:'Lobby'},mode:'Signage',message:'',theme:th,slides:[],events:[],church:{}}};
S={me:{name:'Pat',role:'Owner'},perms:['users','theme'],devices:[dev],themes:[{Theme:'Renter',Main:'#18453B',Accent:'#68B1A1'}],themeObjs:[th],override:{},t:{ymd:'2026-11-18',mins:600,today:'2026-11-18'},
  slidesByTheme:{},eventsByTheme:{},calStatus:{},folders:{},fallbackTheme:'Renter',
  churchSettings:{name:'Graceview Baptist Church',website:'graceview.org',timeZone:'America/Chicago',place:'',lat:null,lon:null,unit:'F',messageLine:'',noEvents:'',messageLineSet:'',noEventsSet:'',logo:'',wifiName:'',wifiPass:''},
  churchDefaults:{logo:'',wifiName:'',wifiPass:''}};
view='church';chForm=null;var h=vChurch();
ok('no logo yet: says so, offers Upload', h.indexOf('No church logo')>=0&&h.indexOf('Upload logo')>=0&&h.indexOf('chLogoRemove')<0);
S.churchSettings.logo=LOGO;S.churchSettings.wifiName='Graceview-Guest';S.churchSettings.wifiPass='welcome';chForm=null;h=vChurch();
ok('with a logo: shows it on dark, offers Replace and Remove', h.indexOf('src="'+LOGOH+'"')>=0&&h.indexOf('Replace logo')>=0&&h.indexOf('chLogoRemove')>=0);
ok('Wi-Fi boxes filled from the settings', h.indexOf('value="Graceview-Guest"')>=0&&h.indexOf('value="welcome"')>=0);
ok('the emergency preview uses the church logo', h.indexOf('scr-msg')>=0&&h.indexOf(LOGOH)>=0);
ACT.chSave();var last=__sent[__sent.length-1];ok('save sends the Wi-Fi', last[1][0].wifiName==='Graceview-Guest'&&last[1][0].wifiPass==='welcome');

S.churchDefaults={logo:LOGO,wifiName:'Graceview-Guest',wifiPass:'welcome'};
var o=themeObjFromForm({Theme:'Renter',Main:'#18453B',Accent:'#68B1A1'});
ok('theme preview: blank logo and Wi-Fi use the church ones', o.logo===LOGO&&o.wifiName==='Graceview-Guest'&&o.wifiPass==='welcome');
o=themeObjFromForm({Theme:'Renter','Logo URL':'https://drive.google.com/file/d/THEMELOGO0123456789012345/view','Wi-Fi Name':'Renter-WiFi','Wi-Fi Password':''});
ok("theme preview: the theme's own Drive logo and Wi-Fi win", o.logo==='https://drive.google.com/thumbnail?id=THEMELOGO0123456789012345&sz=w1000'&&o.wifiName==='Renter-WiFi'&&o.wifiPass==='');
ok('theme boxes hint at the church defaults', themeFieldHint('Logo URL')==='Blank: the church logo'&&themeFieldHint('Wi-Fi Name').indexOf('Graceview-Guest')>=0);

var scr={device:{id:'L',name:'Lobby'},mode:'Message',message:'Closed today.',theme:{name:'Renter',display:'Renter Church',logo:'https://x/theme.png'},church:{name:'Graceview Baptist Church',logo:LOGO,messageLine:'Watch graceview.org'}};
var m=renderScreen(scr,{ymd:'2026-11-18',mins:600},null,{});
ok('emergency footer: church logo, not the theme logo', m.indexOf(LOGOH)>=0&&m.indexOf('theme.png')<0);
scr.church={name:'Graceview Baptist Church',logo:''};scr.theme.logo='';m=renderScreen(scr,{ymd:'2026-11-18',mins:600},null,{});
ok('no logos at all: the church name shows', m.indexOf('Graceview Baptist Church')>=0&&m.indexOf('Renter Church')<0);
`,ctx);
