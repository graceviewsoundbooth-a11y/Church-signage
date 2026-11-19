const vm=require('vm'),fs=require('fs');const noop=()=>{};
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:(f)=>f(),clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},
  document:{addEventListener:noop,getElementById:id=>id==='params'?{textContent:'{}'}:(['busy','toast','who','nav','main'].includes(id)?el():null),querySelector:()=>null,querySelectorAll:()=>[]},
  google:{script:{run:new Proxy({},{get:(t,k)=>k.startsWith('with')?()=>ctx.google.script.run:noop})}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
vm.runInContext(`
view='themes';
var src=[{n:0,url:'https://school/a.ics',state:'loaded',count:1,used:true,error:''},{n:1,url:'https://church/b.ics',state:'loaded',count:4,used:true,error:''},{n:2,url:'https://bad/c.ics',state:'unused',count:0,used:false,error:''}];
S={override:{},me:{name:'Pat',role:'Owner',themes:['ALL']},perms:['theme'],t:{ymd:'2026-11-16',mins:600,today:'2026-11-16'},weather:null,fallbackTheme:'Church',
 themes:[{Theme:'School','Display Name':'School',Main:'#CF2020',Accent:'#B50606','Main Text':'#FFFFFF','Accent Text':'#FFFFFF',Calendar:'https://school/a.ics; https://church/b.ics; https://bad/c.ics'}],themeObjs:[],slidesByTheme:{},eventsByTheme:{},
 calStatus:{School:{linked:true,count:4,errors:[],sources:src}},folders:{}};
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
themeForm=JSON.parse(JSON.stringify(S.themes[0]));var h=vThemes();
ok('one box per calendar: Main calendar, Fallback 1, Fallback 2', h.indexOf('Main calendar')>=0&&h.indexOf('Fallback 1')>=0&&h.indexOf('Fallback 2')>=0&&h.indexOf('id="calSrc2"')>=0);
ok('no old ; text box for Calendar', h.indexOf('Calendar links:')<0);
ok('each calendar shows its status', h.indexOf('1 event · in use')>=0&&h.indexOf('4 events · in use')>=0&&h.indexOf('Not needed this week')>=0);
ok('summary says fallbacks are filling in', h.indexOf('This Week: 4 events')>=0&&h.indexOf('1 fallback filling in')>=0);
ACT.calMove({dataset:{i:'2',d:'-1'}});
ok('moving a fallback up reorders the cell', themeForm.Calendar==='https://school/a.ics; https://bad/c.ics; https://church/b.ics');
h=vThemes();ok('after a change, statuses stay with their link and a save note shows', h.indexOf('Save the theme to use these calendars')>=0&&h.indexOf('Not needed this week')<0);
ACT.calRemove({dataset:{i:'1'}});ok('remove drops just that one', themeForm.Calendar==='https://school/a.ics; https://church/b.ics');
ACT.calAdd();ok('add puts an empty fallback box', /Fallback 2/.test(vThemes())&&calList().length===3);
var sent=null;call=function(fn,args){sent=args[0];};ACT.saveTheme();
ok('saving drops empty boxes', sent&&sent.Calendar==='https://school/a.ics; https://church/b.ics');
themeForm.Calendar='';h=vThemes();ok('no calendar: one empty Main box and a note', h.indexOf('id="calSrc0"')>=0&&h.indexOf('id="calSrc1"')<0&&h.indexOf('This Week stays empty')>=0);
`,ctx);
