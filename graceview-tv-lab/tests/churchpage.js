const vm=require('vm'),fs=require('fs');const noop=()=>{};
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const sent=[];let okH=null;
const run=new Proxy({},{get:(t,k)=>k.startsWith('with')?(f)=>{if(k==='withSuccessHandler')okH=f;return run;}:(...a)=>{if(k==="act"){sent.push([a[0],a[1]]);return;}sent.push([k,a]);if(k==='findPlace')okH([{name:'Tomball',region:'Texas',lat:30.0972,lon:-95.6161,timeZone:'America/Chicago'}]);}});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:(f)=>f(),clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},
  Intl,
  document:{addEventListener:noop,getElementById:id=>id==='params'?{textContent:'{}'}:id==='chFind'?{value:'Tomball'}:(['busy','toast','who','nav','main'].includes(id)?el():null),querySelector:()=>null,querySelectorAll:()=>[]},
  google:{script:{run}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
ctx.__sent=sent;
vm.runInContext(`
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
var dev={id:'L',name:'Lobby',screen:{device:{id:'L',name:'Lobby'},mode:'Signage',message:'',theme:{name:'Church',display:'Graceview',main:'#CF2020',accent:'#B50606',wayL:[],wayR:[]},slides:[],events:[],church:{}}};
S={me:{name:'Pat',role:'Owner'},perms:['users'],devices:[dev],themes:[],override:{},t:{ymd:'2026-11-18',mins:600,today:'2026-11-18'},
  churchSettings:{name:'Graceview',website:'graceview.org',timeZone:'America/Chicago',place:'',lat:null,lon:null,unit:'F',messageLine:'Watch graceview.org and your email for updates.',noEvents:'See all events at graceview.org',messageLineSet:'',noEventsSet:''}};
ok('Church is in Settings for Owner/Admin', groupOf('church').id==='settings'&&groupOf('church').tabs[0][2]==='users');
view='church';chForm=null;var h=vChurch();
ok('it shows name and website', h.indexOf('value="Graceview"')>=0&&h.indexOf('value="graceview.org"')>=0);
ok('no weather yet is said plainly', h.indexOf('Not set')>=0);
ok('wording boxes show the website wording in gray', h.indexOf('placeholder="Watch graceview.org and your email for updates."')>=0&&h.indexOf('placeholder="See all events at graceview.org"')>=0);
ok('a preview of the emergency message, with the line', h.indexOf('IMPORTANT UPDATE')>=0&&h.indexOf('Watch graceview.org and your email')>=0);
ok('time zone list includes common US zones', h.indexOf('<option>America/Denver</option>')>=0&&h.indexOf('<option selected>America/Chicago</option>')>=0);
chForm.timeZone='America/Denver';ACT.chFind();h=vChurch();
ok('search lists places to pick', h.indexOf('data-act="chPick"')>=0&&h.indexOf('Tomball, Texas')>=0);
ACT.chPick({dataset:{i:'0'}});
ok('picking sets the spot and the place time zone', chForm.lat===30.0972&&chForm.place==='Tomball'&&chForm.timeZone==='America/Chicago');
h=vChurch();ok('then the label box shows', h.indexOf('data-cf="place"')>=0);
ACT.chNoWeather();ok('No weather clears it', chForm.lat===''&&chForm.place==='');
chForm.messageLine='Call the office.';h=vChurch();ok('own line shows in the preview', h.indexOf('Call the office.')>=0);
ACT.chSave();var last=__sent[__sent.length-1];ok('save sends the form', last[0]==='saveChurchSettings'&&last[1][0].messageLine==='Call the office.');
S.churchSettings.liveYouTube='https://www.youtube.com/@GBCtomball/live';S.churchSettings.livePlays='YouTube';chForm=null;h=vChurch();
ok('Live feed section shows the YouTube link and the choice', h.indexOf('<h3>Live feed</h3>')>=0&&h.indexOf('value="https://www.youtube.com/@GBCtomball/live"')>=0&&h.indexOf('<option selected>YouTube</option>')>=0&&h.indexOf('data-cf="liveLocal" value=""')>=0);
chForm.liveLocal='rtsp://192.168.0.50/live';chForm.livePlays='Local stream';h=vChurch();
ok('picking the local stream shows it selected and unsaved', h.indexOf('<option selected>Local stream</option>')>=0&&h.indexOf('Not saved yet')>=0);
ACT.chSave();last=__sent[__sent.length-1];ok('save sends the live feed', last[1][0].liveLocal==='rtsp://192.168.0.50/live'&&last[1][0].livePlays==='Local stream'&&last[1][0].liveYouTube.indexOf('GBCtomball')>0);
S.churchSettings=null;S.perms=[];ok('others see no Church settings', vChurch().indexOf('Only the Owner')>=0);
`,ctx);
