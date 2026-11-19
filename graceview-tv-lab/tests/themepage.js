const vm=require('vm'),fs=require('fs');const noop=()=>{};
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:noop,clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},
  document:{addEventListener:noop,getElementById:id=>id==='params'?{textContent:'{}'}:(['busy','toast','who','nav','main'].includes(id)?el():null),querySelectorAll:()=>[]},
  google:{script:{run:new Proxy({},{get:(t,k)=>k.startsWith('with')?()=>ctx.google.script.run:noop})}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
vm.runInContext(`
var th=function(n){return {Theme:n,'Display Name':n,Main:'#CF2020',Accent:'#B50606','Main Text':'#FFFFFF','Accent Text':'#FFFFFF'};};
S={me:{name:'Pat',role:'Owner',themes:['ALL']},perms:['theme','slides'],t:{ymd:'2026-11-16',mins:600,today:'2026-11-16'},weather:null,
 themes:[th('Church'),th('School'),th('Youth')],themeObjs:[],slidesByTheme:{},eventsByTheme:{},calStatus:{},slides:[],
 folders:{Church:{linked:true,shared:true,name:'Church Slides',url:'https://d/x',files:[]},School:{linked:true,shared:false,name:'Pasted',files:[]},Youth:{linked:false,files:[]}}};
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
themeForm=null;var h=vThemes();
ok('admin sees "+ Add a theme"', h.indexOf('+ Add a theme')>=0);
ok('shared folder shows the green status', h.indexOf('Slides folder shared by link')>=0);
addingTheme=true;h=vThemes();ok('add-theme form renders', h.indexOf('id="ntName"')>=0);
themeForm={Theme:'School'};h=vThemes();
ok('a just-added theme loads its full settings', themeForm.Main==='#CF2020');
ok('private folder offers "Make viewable by link"', h.indexOf('data-act="shareFolder"')>=0);
themeForm={Theme:'Youth'};h=vThemes();ok('missing folder offers "Create one"', h.indexOf('data-act="mkFolder"')>=0);
S.me.role='Limited';addingTheme=false;themeForm=null;h=vThemes();
ok('limited does not see "Add a theme"', h.indexOf('Add a theme')<0);
slideTheme='School';h=vSlides();ok('Slides page warns about a private folder (no button for Limited)', h.indexOf('This folder is private')>=0 && h.indexOf('data-act="shareFolder"')<0);
`,ctx);
