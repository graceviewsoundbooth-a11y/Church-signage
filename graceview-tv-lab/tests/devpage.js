const vm=require('vm'),fs=require('fs');const noop=()=>{};
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:(f)=>f(),clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},
  document:{addEventListener:noop,getElementById:id=>id==='params'?{textContent:'{}'}:(['busy','toast','who','nav','main'].includes(id)?el():null),querySelector:()=>null,querySelectorAll:()=>[]},
  google:{script:{run:new Proxy({},{get:(t,k)=>k.startsWith('with')?()=>ctx.google.script.run:noop})}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
vm.runInContext(`
view='devices';
var scr={device:{id:'LOBBY',name:'Lobby',profile:'Signage',wayfinding:true},mode:'Signage',theme:{name:'Church'},slides:[],events:[]};
S={override:{},me:{name:'Pat',role:'Owner',themes:['ALL']},perms:['launchers'],url:'https://x/exec',t:{ymd:'2026-11-16',mins:600,today:'2026-11-16'},
 allThemes:['Church','School'],modes:['Signage','Off','Launcher'],launcherNames:['Signage home','Classroom'],allDevices:[{id:'LOBBY',name:'Lobby'}],
 devices:[{id:'LOBBY',name:'Lobby',location:'Main lobby',profile:'Signage',hardware:'onn 4K Pro, Android 14',version:'2026.11.16.1500',ip:'192.168.0.142',online:true,pairedAt:'2026-11-16 09:00',lastSeen:'2026-11-16 09:59',defaultTheme:'Church',defaultMode:'Off',launcher:'Signage home',muteLive:true,wayfinding:true,now:{mode:'Signage',source:'Weekly'},screen:scr},
          {id:'COFFEE',name:'Coffee Spot',location:'',profile:'Signage',hardware:'Virtual (browser)',version:'',ip:'',online:false,pairedAt:'',lastSeen:'',defaultTheme:'Church',defaultMode:'Off',launcher:'',muteLive:false,wayfinding:false,now:{mode:'Off',source:'Default'},screen:scr}]};
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
var h=vDevices();
ok('Manage screens sits right after Now showing', GROUPS[0].tabs[1][0]==='devices');
ok('lists each screen with theme, home screen and showing now', h.indexOf('<b>Lobby</b>')>=0 && h.indexOf('Signage home')>=0 && h.indexOf('<span class="muted">Standard</span>')>=0);
ok('online and not-paired statuses', h.indexOf('chip ok">Online')>=0 && h.indexOf('No screen paired')>=0);
ok('IP, model and app version shown', h.indexOf('192.168.0.142')>=0 && h.indexOf('onn 4K Pro, Android 14')>=0 && h.indexOf('v2026.11.16.1500')>=0);
ok('admin gets Pair, Edit and Remove', h.indexOf('data-act="pairOpen"')>=0 && h.indexOf('data-act="devEditOpen"')>=0 && h.indexOf('data-act="devRemoveAsk"')>=0);
ACT.devEditOpen({dataset:{id:'LOBBY'}});h=vDevices();
ok('editor opens with current values', h.indexOf('id="deName" value="Lobby"')>=0 && h.indexOf('<option selected>Signage home</option>')>=0 && /id="deMute" checked/.test(h));
ACT.devRemoveAsk({dataset:{id:'COFFEE'}});h=vDevices();ok('remove asks to confirm', h.indexOf('data-act="devRemoveGo" data-id="COFFEE"')>=0);
S.me.role='Staff';devEdit=null;h=vDevices();
ok('staff see the list but no Pair, Edit or Remove', h.indexOf('<b>Lobby</b>')>=0 && h.indexOf('pairOpen')<0 && h.indexOf('devEditOpen')<0 && h.indexOf('devRemove')<0);
`,ctx);
