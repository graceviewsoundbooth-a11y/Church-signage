const vm=require('vm'),fs=require('fs');const noop=()=>{};
const inputs={};
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:(f)=>f(),clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},
  document:{addEventListener:noop,
    getElementById:id=>id==='params'?{textContent:'{}'}:(id in inputs?{value:inputs[id]}:(['busy','toast','who','nav','main'].includes(id)?el():null)),
    querySelector:()=>null,querySelectorAll:()=>[]},
  google:{script:{run:new Proxy({},{get:(t,k)=>k.startsWith('with')?()=>ctx.google.script.run:noop})}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
ctx.inputs=inputs;
vm.runInContext(`
view='launchers';S={override:{},me:{name:'Pat',role:'Owner',themes:['ALL']},perms:['launchers'],t:{ymd:'2026-11-16',mins:600,today:'2026-11-16'},weather:null,church:'Graceview',
 themeObjs:[{name:'Church',display:'Graceview',main:'#CF2020',accent:'#B50606',wayL:[],wayR:[]}],slidesByTheme:{},
 builtinTiles:{watchlive:'Watch Live','return':'Return to Signage',announcements:'Announcements',dashboard:'Green Room Dashboard',mirror:'Screen Mirror',hdmi:'HDMI Input',youtube:'YouTube',browser:'Web Browser',store:'Get Apps',allapps:'All Apps',settings:'Settings'},
 reportedApps:[{pkg:'us.zoom.videomeetings',label:'Zoom'}],
 deviceList:[{id:'LOBBY',name:'Lobby',launcher:'Signage home'},{id:'CLASS101',name:'Classroom 101',launcher:'Classroom'}],
 launchers:[{name:'Classroom',tiles:[{type:'watchlive',value:'',label:'Watch Live'},{type:'announcements',value:'',label:'Announcements'},{type:'allapps',value:'',label:'All Apps'}],idleMinutes:0,notes:'Teachers',devices:['CLASS101']},
            {name:'Signage home',tiles:[{type:'return',value:'',label:'Return to Signage'}],idleMinutes:10,notes:'',devices:['LOBBY']}]};
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
var h=vLaunchers();
ok('opens on the first layout with its tiles', launchForm.name==='Classroom' && h.indexOf('<b>Announcements</b>')>=0);
ok('layout tabs show how many TVs use each', h.indexOf('Classroom <span class="muted small">(1 TV)</span>')>=0);
ok('TV checkboxes use names and show their current layout', h.indexOf('Classroom 101')>=0 && h.indexOf('Lobby (now: Signage home)')>=0);
ok('add-tile list only offers built-ins not already there', h.indexOf('value="watchlive"')<0 && h.indexOf('value="youtube"')>=0);
ok('reported apps appear in the picker', h.indexOf('us.zoom.videomeetings|Zoom')>=0);
ok('preview draws the layout tiles', h.indexOf('class="app hi"><div>Watch Live')>=0 && h.indexOf('>All Apps<')>=0);
inputs.lnName='Classroom (Kids)'; inputs.lnIdle='5';
ACT.lnMove({dataset:{i:'2',d:'-1'}});
ok('moving a tile reorders it and keeps typed text', launchForm.tiles[1].type==='allapps' && launchForm.name==='Classroom (Kids)' && launchForm.idleMinutes===5);
inputs.lnBuiltin='youtube'; ACT.lnAddBuiltin();
inputs.lnApp='us.zoom.videomeetings|Zoom'; ACT.lnAddApp();
inputs.lnPkg='org.pbskids.video'; inputs.lnPkgLabel='PBS Kids'; ACT.lnAddPkg();
inputs.lnWebUrl='https://graceview.org/kids'; inputs.lnWebLabel='Kids Page'; ACT.lnAddWeb();
var types=launchForm.tiles.map(function(t){return t.type+(t.value?':'+t.value:'');}).join(',');
ok('built-in, reported app, typed package and website tiles all add', types==='watchlive,allapps,announcements,youtube,app:us.zoom.videomeetings,app:org.pbskids.video,web:https://graceview.org/kids');
inputs.lnPkg='zoom'; var before=launchForm.tiles.length; ACT.lnAddPkg();
ok('a bad package name is refused', launchForm.tiles.length===before);
inputs.lnWebUrl='http://x.org'; ACT.lnAddWeb();
ok('an http website is refused', launchForm.tiles.length===before);
ACT.lnRemove({dataset:{i:'0'}});
ok('removing a tile works', launchForm.tiles[0].type==='allapps');
ACT.lnNew(); h=vLaunchers();
ok('new layout starts with sensible tiles and a Cancel button', launchForm.original==='' && launchForm.tiles.length===3 && h.indexOf('data-act="lnCancel"')>=0);
S.me.role='Staff';S.perms=['override','slides','activity'];
ok('staff do not get the Home screens tab', !allowedView('launchers'));
`,ctx);
;(function(){ var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);}; var ctxRender=function(s){return ctx.renderScreen(s,{ymd:'2026-11-19',mins:552,secs:0},null,{qr:false});};
  var base={device:{id:'C',name:'Classroom 101',profile:'Classroom'},mode:'Launcher',church:{noEvents:'See graceview.org'},slides:[],launcherTiles:['Watch Live'],
    theme:{name:'T',display:'T',main:'#333333',accent:'#555555',wayL:[],wayR:[],wifiName:'Guest',wifiPass:'pw123'},
    events:[{dow:'Sat',start:'09:00',end:'10:00',title:'A'},{dow:'Sun',start:'09:00',end:'10:00',title:'B'},{dow:'Sun',start:'11:00',end:'12:00',title:'C'}]};
  var h=ctxRender(base);
  ok('home screen: guest Wi-Fi beside the slides, with network and password', h.indexOf('Free Wi-Fi')>=0&&h.indexOf('>Guest<')>=0&&h.indexOf('>pw123<')>=0);
  ok('and This Week under it (2 events with Wi-Fi)', h.indexOf('This Week')>=0&&h.indexOf('>B<')>=0&&h.indexOf('>C<')<0);
  base.theme.wifiName='';h=ctxRender(base);
  ok('no Wi-Fi: This Week gets the room', h.indexOf('Free Wi-Fi')<0&&h.indexOf('>C<')>=0);
  ok('the device name is in the top bar', h.indexOf('Classroom 101')>=0);
})();
