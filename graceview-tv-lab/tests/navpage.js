const vm=require('vm'),fs=require('fs');const noop=()=>{};
const els={};const el=id=>els[id]||(els[id]={className:'',style:{},innerHTML:'',textContent:'',hidden:false,title:'',querySelectorAll:()=>[]});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:(f)=>f(),clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},Intl,scrollTo:noop,
  document:{addEventListener:noop,getElementById:id=>id==='params'?{textContent:'{}'}:(['busy','toast','who','nav','main','ovBtn','brand','modeBtn'].includes(id)?el(id):null),querySelector:()=>null,querySelectorAll:()=>[]},
  google:{script:{run:new Proxy({},{get:(t,k)=>k.startsWith('with')?()=>ctx.google.script.run:noop})}}};
el('modeBtn').setAttribute=noop;el('brand').dataset={};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
ctx.__els=els;
vm.runInContext(`
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
var th={name:'Church',display:'Graceview',main:'#CF2020',accent:'#B50606',wayL:[],wayR:[]};
function dev(id,name,online){return {id:id,name:name,location:'Front hall',profile:'Signage',defaultTheme:'Church',online:online,pairedAt:'2026-11-16',lastSeen:'2026-11-18 09:00',
  now:{mode:'Signage',source:'Weekly',label:'Signage until 1:00 PM'},screen:{device:{id:id,name:name},mode:'Signage',message:'',theme:th,slides:[],events:[],church:{}}};}
function base(role,perms){return {me:{name:'Pat',email:'p@x.org',role:role,themes:['ALL']},perms:perms,devices:[dev('L','Lobby',true),dev('C','Coffee Spot',false)],allDevices:[{id:'L',name:'Lobby'},{id:'C',name:'Coffee Spot'}],
  themes:[{Theme:'Church',Main:'#CF2020',Accent:'#B50606'}],themeObjs:[th],allThemes:['Church'],override:{},conflicts:[],modes:['Signage','Off'],launcherNames:[],
  t:{ymd:'2026-11-18',mins:600,today:'2026-11-18'},users:[],roles:[],launchers:[],activity:[],presets:[],slidesByTheme:{},eventsByTheme:{},calStatus:{},folders:{},weekly:[],special:[],
  builtinTiles:{},reportedApps:[],deviceList:[],greenRoom:perms.indexOf('greenroom')>=0?{settings:{},mics:[],planningCenter:{saved:false},status:[]}:null,
  churchSettings:perms.indexOf('users')>=0?{name:'G',website:'',timeZone:'America/Chicago',lat:null,lon:null,unit:'F',logo:'',wifiName:'',wifiPass:''}:null,churchDefaults:{},owner:{name:'Pat',email:'p@x.org'}};}
function navText(){return __els.nav.innerHTML;}
function mainText(){return __els.main.innerHTML;}
function labels(){return (navText().match(/<span>([^<]+)<\\/span>/g)||[]).map(function(x){return x.replace(/<\\/?span>/g,'');}).join(',');}

S=base('Owner',['override','schedule','theme','slides','activity','users','launchers','greenroom']);view='now';render();
ok('Owner menu: Screens, Schedule, Content, Settings', labels()==='Screens,Schedule,Content,Settings');
ok('Override is a header button, not a menu item', navText().indexOf('Override')<0&&!__els.ovBtn.hidden&&__els.ovBtn.innerHTML.indexOf('Override')>=0);
var m=mainText();
ok('Screens tabs: Now showing and Manage screens', m.indexOf('>Now showing<')>=0&&m.indexOf('>Manage screens<')>=0);
ok('Now showing: previews, Add a screen, the time picker folded away', m.indexOf('class="card"')>=0&&m.indexOf('+ Add a screen')>=0&&m.indexOf('<details class="panel timepick">')>=0);
ok('Cards say online/offline and offer Edit', m.indexOf('Online')>=0&&m.indexOf('Offline · last seen')>=0&&m.indexOf('data-act="devEditOpen"')>=0);
ACT.devEditOpen({dataset:{id:'C'}});m=mainText();
ok('Edit opens the screen editor right on Now showing, with Unpair and Remove', m.indexOf('Edit Coffee Spot')>=0&&m.indexOf('unpairAsk')>=0&&m.indexOf('devRemoveAsk')>=0);
ACT.devCancel();ACT.pairOpen();m=mainText();
ok('Add a screen opens the pairing form', m.indexOf('<h2>Add a screen</h2>')>=0&&m.indexOf('Which screen is it?')>=0);
ACT.pairClose();
view='devices';render();m=mainText();
ok('Manage screens: the list', m.indexOf('<h2>Screens</h2>')>=0&&m.indexOf('<th>Screen</th>')>=0&&m.indexOf('Home screen')>=0);
view='now';preview='2026-11-22T10:45';S.t.preview=true;render();
ok('A previewed time keeps the time picker open', mainText().indexOf('<details class="panel timepick" open>')>=0);
S.t.preview=false;preview='';
view='slides';render();m=mainText();
ok('Content tabs: Slides and Look & details', m.indexOf('>Slides<')>=0&&m.indexOf('>Look &amp; details<')>=0||m.indexOf('>Look & details<')>=0);
view='settings';
view='launchers';render();m=mainText();
ok('Home screens and Green Room are Settings tabs', /Church<\\/button>.*People<\\/button>.*Home screens<\\/button>.*Green Room<\\/button>.*Recent activity<\\/button>.*Your account<\\/button>/.test(m)&&m.indexOf('<h2>Home screens</h2>')>=0);
ok('the Settings menu item is lit on its tabs', /class="on" aria-current="page">[\\s\\S]*Settings/.test(navText()));
view='now';render();
ok('each section remembers its last tab', navText().indexOf('data-v="launchers"')>=0&&navText().indexOf('data-v="slides"')>=0);
view='override';render();
ok('the Override page opens from the header', mainText().indexOf('Start an override')>=0&&__els.ovBtn.className.indexOf('cur')>=0);
S.override={Active:'TRUE',Mode:'Message',Devices:'ALL'};view='now';render();
ok('while an override runs the header button says so', __els.ovBtn.className.indexOf(' on')>=0&&__els.ovBtn.innerHTML.indexOf('Override on')>=0);

S=base('Staff',['override','slides','activity']);groupLast={};view='now';render();
ok('Staff menu: Screens, Content, Settings', labels()==='Screens,Content,Settings');
view='slides';render();ok('Staff Content: only Slides, no tab row', mainText().indexOf('class="subnav"')<0&&mainText().indexOf('<h2>Slides</h2>')>=0);
view='themes';render();ok('Staff sent to Look & details lands on Now showing', view==='now');
ok('Staff cards have Override but not Edit', mainText().indexOf('data-act="ovFor"')>=0&&mainText().indexOf('devEditOpen')<0);
ok('Staff do not get Add a screen', mainText().indexOf('Add a screen')<0);

S=base('Limited',['theme','slides']);groupLast={};view='now';render();
ok('Limited menu: Screens, Content, Settings', labels()==='Screens,Content,Settings');
ok('Limited: no Override button', __els.ovBtn.hidden===true);
view='account';render();ok('Limited Settings: one tab, no tab row', mainText().indexOf('class="subnav"')<0&&mainText().indexOf('Your account')>=0);
`,ctx);
