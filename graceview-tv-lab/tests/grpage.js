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
view='greenroom';
S={override:{},me:{name:'Pat',role:'Owner',themes:['ALL']},perms:['greenroom'],t:{ymd:'2026-11-16',mins:600,today:'2026-11-16'},
 greenRoom:{settings:{'Planning Center Service Type ID':'Worship Service','Mic Assignment Source':'Position name','Hide Declined People':'TRUE','ProPresenter Address':'192.168.1.50:50001','Avantis Address':'192.168.1.60','Avantis MIDI Base Channel':'12'},
  mics:[{label:'HH 1',channel:'41',notes:'Handheld 1',position:''},{label:'HS 1',channel:'37',notes:'Pastor headset',position:'Pastor'}],
  micSources:['Position name','Assignment notes','Plan note','Avantis channel names',''],planningCenter:{saved:false},
  tvs:[{id:'GREEN',name:'Green Room',paired:true,status:{planningCenter:{ok:true,text:''},proPresenter:{ok:false,text:'No answer from ProPresenter at 192.168.1.50:50001.'},avantis:{ok:false,text:''},at:'2026-11-16 10:00'}}]}};
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
var h=vGreenRoom();
ok('no login saved: shows the paste form with a hidden secret box', h.indexOf('id="pcoId"')>=0 && h.indexOf('type="password" id="pcoSecret"')>=0);
ok('settings fields filled in', h.indexOf('value="192.168.1.50:50001"')>=0 && h.indexOf('value="Position name" selected')>=0);
ok('hide-declined checkbox reflects TRUE', /id="grHide"[^>]* checked/.test(h));
ok('mic map rows render', h.indexOf('id="mic1position" value="Pastor"')>=0);
ok('connection status per source', h.indexOf('Planning Center: connected')>=0 && h.indexOf('ProPresenter: can’t connect')>=0 && h.indexOf('No answer from ProPresenter')>=0);
S.greenRoom.planningCenter={saved:true,idHint:'…abcd',savedBy:'Pat',savedAt:'2026-11-16 10:00'};h=vGreenRoom();
ok('saved login shows only its hint, with Replace and Remove', h.indexOf('…abcd')>=0 && h.indexOf('id="pcoSecret"')<0 && h.indexOf('data-act="pcoEdit"')>=0);
ACT.pcoRemoveAsk();h=vGreenRoom();ok('remove asks to confirm', h.indexOf('data-act="pcoRemoveGo"')>=0);
ACT.micAdd();ok('add a mic', grForm.mics.length===3);
ACT.micRemove({dataset:{i:'0'}});ok('remove a mic', grForm.mics.length===2 && grForm.mics[0].label==='HS 1');
S.greenRoom.tvs[0].status=null;h=vGreenRoom();ok('a TV that has not reported says why', h.indexOf('reports while its Green Room dashboard is open')>=0);
S.me.role='Staff';S.perms=['override','slides','activity'];S.greenRoom=null;
ok('staff do not get the Green Room tab', !allowedView('greenroom'));
`,ctx);
