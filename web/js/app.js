
import {Store} from './store.js';

(async function(){
const BR=[{id:'tarija',n:'Tarija',c:'var(--s1)'},{id:'cochabamba',n:'Cochabamba',c:'var(--s2)'},{id:'santacruz',n:'Santa Cruz',c:'var(--s3)'}];
const BRM=Object.fromEntries(BR.map(b=>[b.id,b]));
const CATS=['Polera','Hoddie','Buzo','Pantalón','Shorts','Chaqueta','Otro'];
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n||0).toLocaleString('es-BO');
const fmt1=n=>(n||0).toLocaleString('es-BO',{minimumFractionDigits:1,maximumFractionDigits:1});
const normT=s=>String(s||'').trim().toUpperCase().replace(/~/g,'');
const normC=s=>{s=String(s||'').trim().toLowerCase().replace(/~/g,'');return s.charAt(0).toUpperCase()+s.slice(1)};
const sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);
const cap=s=>{s=String(s||'');return s.charAt(0)+s.slice(1).toLowerCase()};
const pad=n=>String(n).padStart(2,'0');
const dayKey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const timeStr=ts=>{const d=new Date(ts);return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes())};
const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
let toastT;function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2600)}

const slug=x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// ---- sesión ----
const app=$('app');
const sess=await Store.requireLogin(app);
if(!sess){return}
const db=Store.db;
const me={id:sess.perfil.id,name:sess.perfil.nombre||sess.perfil.email||'',canEdit:sess.perfil.rol==='admin',sucursal:sess.perfil.sucursal};
const admin=!!me.canEdit;
const myId=me.id;
const assets=admin?{
  upload:async(blob)=>({id:await Store.uploadPhoto(blob)}),
  delete:async(id)=>Store.deletePhoto(id)
}:null;
const downloads={save:Store.saveFile};
const sample=null,sampleImg=false;

// ---- data ----
const S={orders:[],settings:{},promos:[],costs:new Map(),products:new Map(),drops:[],entries:[],sales:[],histSales:[],perfiles:[],stockRows:[],loaded:{}};
let stock=new Map(),ptot=new Map(),AS=[];
const ui={tab:null,branch:null,q:'',cat:'',marca:'',showEmpty:false,range:'30',dbr:'all',expanded:{},cart:[],pay:'ef',mixed:false,disc:0,mix:{ef:0,qr:0,tj:0,gc:0},confirm:null,vrange:'7',vbr:'all',salesLimit:60,pq:'',sel:{},ph:{items:[]},phm:{items:[]},nf:null,busy:false};
const newNF=(keep)=>({modelo:'',marca:keep&&keep.marca||'',categoria:keep&&keep.categoria||'',corte:'',precio:'',costo:'',suc:keep&&keep.suc||'tarija',drop:keep&&keep.drop||'',lines:[{t:'',c:'',q:1}]});
ui.nf=newNF();
function mine(){return admin?null:(me.sucursal||null)}
const BKEY=(b,p,t,c)=>b+'~'+p+'~'+t+'~'+c;
function recompute(){
  AS=S.sales.concat(S.histSales).sort((a,b)=>b.ts-a.ts);
  stock=new Map();ptot=new Map();
  S.stockRows.forEach(r=>{stock.set(BKEY(r.b,r.p,r.t,r.c),{b:r.b,p:r.p,t:r.t,c:r.c,q:r.q})});
  stock.forEach(r=>{const k=r.b+'~'+r.p;ptot.set(k,(ptot.get(k)||0)+r.q)});
}
const avail=(b,p,t,c)=>{const r=stock.get(BKEY(b,p,t,c));return r?r.q:0};
const ptotal=(b,p)=>ptot.get(b+'~'+p)||0;
const prod=id=>S.products.get(id);
const pname=id=>{const p=prod(id);return p?cap(p.modelo):'(producto borrado)'};
const plabel=p=>p.modelo+' · '+p.marca+' · '+p.categoria;

let rt=null;let pendingRender=false;
function schedule(){clearTimeout(rt);rt=setTimeout(()=>{recompute();render()},40)}
function sub(path,fn,key){return db.collection(path).onSnapshot(s=>{fn(s);S.loaded[key]=true;schedule()},e=>{console.error(path,e)})}
sub('products',s=>{S.products=new Map(s.docs.map(d=>[d.id,{id:d.id,...d.data()}]))},'p');
sub('drops',s=>{S.drops=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''))},'d');
if(admin){
  sub('orders',s=>{const antes=new Set(S.orders.map(o=>o.id));S.orders=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.ts-a.ts);if(S.loaded.o)S.orders.filter(o=>!antes.has(o.id)).forEach(o=>toast('Nuevo pedido '+o.codigo+' · Bs '+fmt(o.total)))},'o');
  sub('settings',s=>{const d=s.docs.find(x=>x.id==='tienda');S.settings=d?d.data():{}},'ss');
  sub('promos',s=>{S.promos=s.docs.map(d=>({id:d.id,...d.data()}))},'pr');
  sub('costs',s=>{S.costs=new Map(s.docs.map(d=>[d.id,d.data().costo]))},'c');
  sub('entries',s=>{S.entries=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.ts-a.ts);refreshStock()},'e');
  sub('hist',s=>{S.histSales=s.docs.flatMap(d=>((d.data().tickets)||[]).map((t,i)=>({id:'h:'+d.id+':'+i,hist:true,ts:t.ts,sucursal:t.s,items:t.i.map(a=>({p:a[0],t:'—',c:'—',q:a[1],pr:a[2]})),bruto:t.b,desc:t.d,total:t.n,pago:t.pg,by:null})))},'h');
}else{S.loaded.e=true;S.loaded.o=true}
sub('sales',s=>{S.sales=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.ts-a.ts);refreshStock()},'s');
let stT=null;
function refreshStock(){clearTimeout(stT);stT=setTimeout(async()=>{try{S.stockRows=await Store.stockActual();S.loaded.st=true;schedule()}catch(e){console.error('stock',e);S.loaded.st=true;schedule()}},250)}
refreshStock();
setInterval(refreshStock,25000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshStock()});
async function loadPerfiles(){try{S.perfiles=await Store.listPerfiles();schedule()}catch(e){console.error(e)}}
if(admin)loadPerfiles();
const nameOf=id=>{if(!id)return '—';if(id===myId)return me.name||'Yo';const p=S.perfiles.find(x=>x.id===id);return p?(p.nombre||p.email):'Usuario '+String(id).slice(-4)};
// ---- shell ----
const pendientes=()=>S.orders.filter(o=>o.estado==='pendiente'&&Date.now()<o.ts+(S.settings.hold_horas||12)*3600000&&(o.pago&&o.pago.comprobante)||o.estado==='pagado').length;
function tabsFor(){return admin?[['dash','Dashboard'],['vender','Vender'],['pedidos','Pedidos'+(pendientes()?' ('+pendientes()+')':'')],['catalogo','Catálogo'],['nueva','Agregar prenda'],['inv','Inventario'],['drops','Drops'],['ventas','Ventas'],['prod','Productos'],['tienda','Tienda online'],['equipo','Equipo']]:[['vender','Vender'],['catalogo','Catálogo'],['ventas','Mis ventas']]}
if(!ui.tab)ui.tab=admin?'dash':'vender';
function curBranch(){const m=mine();if(m)return m;if(!ui.branch)ui.branch='tarija';return ui.branch}
function render(){
  if(!(S.loaded.p&&S.loaded.s&&S.loaded.e&&S.loaded.st)){return}
  const ae=document.activeElement;if(ae&&ae.closest&&ae.closest('#app')&&/INPUT|SELECT|TEXTAREA/.test(ae.tagName)&&ae.dataset.keep!=null){pendingRender=true;return}
  if(!admin&&!mine()){app.innerHTML=`<div class="splash card"><h1>Sistema de Ventas Dunno</h1><p>Hola ${esc(me.name||'')}. Tu cuenta todavía no tiene una sucursal asignada.</p><p class="muted">Avísale al dueño para que te asigne tu sucursal en la pestaña Equipo. Esta página se actualiza sola cuando lo haga.</p></div>`;return}
  const tabs=tabsFor();if(!tabs.some(t=>t[0]===ui.tab))ui.tab=tabs[0][0];
  const m=mine();
  app.innerHTML=`<div class="topbar"><div class="brand"><h1>Sistema de Ventas Dunno</h1></div><div class="who">${m?`<span class="pill"><i class="dot" style="background:${BRM[m].c}"></i>${BRM[m].n}</span>`:'<span class="pill">Dueño</span>'}<span>${esc(me.name||'')}</span><button class="btn sec sm" data-act="logout">Salir</button></div></div>
  <nav class="tabs" role="tablist">${tabs.map(t=>`<button class="tab" role="tab" aria-selected="${ui.tab===t[0]}" data-act="tab" data-v="${t[0]}">${t[1]}</button>`).join('')}</nav>
  <main id="main">${VIEWS[ui.tab]()}</main>`;
  const dm=$('dl-marca');if(dm)dm.innerHTML=[...new Set([...S.products.values()].map(x=>x.marca))].sort().map(x=>`<option value="${esc(x)}"></option>`).join('');
  const dl=$('dl-prod');if(dl)dl.innerHTML=[...S.products.values()].filter(p=>p.activo!==false).sort((a,b)=>a.modelo.localeCompare(b.modelo)).map(p=>`<option value="${esc(plabel(p))}"></option>`).join('');
  if(AFTER[ui.tab])AFTER[ui.tab]();
}
function branchChips(key,withAll,allLabel){
  const v=ui[key];
  return '<div class="chips">'+(withAll?`<button class="chip" aria-pressed="${v==='all'}" data-act="set" data-k="${key}" data-v="all">${allLabel||'Todas'}</button>`:'')+BR.map(b=>`<button class="chip" aria-pressed="${v===b.id}" data-act="set" data-k="${key}" data-v="${b.id}"><i class="dot" style="background:${b.c}"></i>${b.n}</button>`).join('')+'</div>'
}
function rangeChips(key){
  const o=[['1','Hoy'],['7','7 días'],['30','30 días'],['mes','Este mes'],['all','Todo']];
  return '<div class="chips">'+o.map(x=>`<button class="chip" aria-pressed="${ui[key]===x[0]}" data-act="set" data-k="${key}" data-v="${x[0]}">${x[1]}</button>`).join('')+'</div>'
}
function inRange(ts,r){
  if(r==='all')return true;const now=new Date();const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(r==='mes')return ts>=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const n=+r;start.setDate(start.getDate()-(n-1));return ts>=start.getTime()
}
const seedCard=()=>'';
const linkBanner=()=>'';
const empty=(t,b)=>`<div class="empty"><b>${t}</b>${b||''}</div>`;

// ---- chart helpers ----
function ticks(max){const rough=(max||1)/4;const mag=Math.pow(10,Math.floor(Math.log10(rough)));const f=rough/mag;const step=(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*mag;const top=Math.ceil(max/step)*step||step;const t=[];for(let v=0;v<=top+1e-6;v+=step)t.push(v);return{top,t}}
const shortN=v=>v>=1000?(v/1000).toLocaleString('es-BO',{maximumFractionDigits:1})+'k':String(v);
const H=200;
function colChart(labels,stacks,tipFn){ // stacks: [[{v,color,tag}]]
  const tot=stacks.map(s=>sum(s,x=>x.v));const sc=ticks(Math.max(...tot,1)*1.08);
  const grid=sc.t.map(v=>`<div class="gl${v===0?' zero':''}" style="bottom:${v/sc.top*100}%"><span>${shortN(v)}</span></div>`).join('');
  const cols=stacks.map((s,i)=>`<div class="bar-col" title="${esc(tipFn(i,tot[i]))}"><div class="stack">${s.map(x=>`<div class="seg" style="height:${x.v/sc.top*H}px;background:${x.color}"></div>`).join('')}</div></div>`).join('');
  const every=Math.ceil(labels.length/8);
  return `<div class="plot">${grid}<div class="cols">${cols}</div></div><div class="xlab">${labels.map((l,i)=>`<span>${i%every===0?esc(l):''}</span>`).join('')}</div>`
}
function hbars(items,unit){
  if(!items.length)return empty('Sin datos');const mx=Math.max(...items.map(i=>i.v),1);
  return '<div class="hl">'+items.map(i=>`<div class="hrow" title="${esc(i.tip||'')}"><div class="nm">${esc(i.n)}</div><div class="tr"><b style="width:${i.v/mx*100}%"></b></div><div class="vl">${fmt(i.v)}${unit?`<span class="muted" style="font-weight:400;font-size:11px"> ${unit}</span>`:''}${i.s?`<span class="muted" style="font-weight:400;font-size:11px"> · ${esc(i.s)}</span>`:''}</div></div>`).join('')+'</div>'
}


// ---- photos ----
const imgUrl=id=>Store.photoUrl(id);
const photoOf=p=>p&&p.fotos&&p.fotos[0]?imgUrl(p.fotos[0]):null;
const phHtml=p=>`<div class="ph">${photoOf(p)?`<img src="${esc(photoOf(p))}" loading="lazy" alt="${esc(cap(p.modelo))}">`:esc(String(p.modelo||'?').charAt(0))}</div>`;
async function compress(file){
  const bm=await createImageBitmap(file);const sc=Math.min(1,1280/Math.max(bm.width,bm.height));
  const c=document.createElement('canvas');c.width=Math.round(bm.width*sc);c.height=Math.round(bm.height*sc);
  c.getContext('2d').drawImage(bm,0,0,c.width,c.height);
  return new Promise(r=>c.toBlob(r,'image/jpeg',.82))
}
function photoStrip(key){
  const it=ui[key].items;
  return `<div class="phs">${it.map((x,i)=>`<div class="pht"><img src="${esc(x.url)}" alt=""><span class="tag">${i===0?'Portada':''}</span><div class="pha">${i>0?`<button type="button" data-act="ph-cover" data-k="${key}" data-i="${i}" title="Hacer portada" aria-label="Hacer portada">★</button>`:''}<button type="button" data-act="ph-del" data-k="${key}" data-i="${i}" aria-label="Quitar foto">×</button></div></div>`).join('')}${it.length<6?`<label class="pht add"><input type="file" data-phkey="${key}" accept="image/*" multiple hidden><span><b>+</b>Agregar foto</span></label>`:''}</div>`
}
function refreshStrip(key){const el=$('phs-'+key);if(el)el.innerHTML=photoStrip(key);const b=$('ai-btn');if(b)b.disabled=!ui.ph.items.some(x=>x.blob)}
async function uploadItems(key){
  const ids=[];
  for(const x of ui[key].items){if(x.id){ids.push(x.id);continue}const r=await assets.upload(x.blob,{type:'image/jpeg'});ids.push(r.id)}
  return ids
}

// ---- views ----
const VIEWS={},AFTER={};

VIEWS.dash=()=>{
  const sales=AS.filter(s=>!s.anulada&&inRange(s.ts,ui.range)&&(ui.dbr==='all'||s.sucursal===ui.dbr));
  const units=sum(sales,s=>sum(s.items||[],i=>i.q));const neto=sum(sales,s=>s.total||0);const bruto=sum(sales,s=>s.bruto||0);const desc=sum(sales,s=>s.desc||0);
  const brs=ui.dbr==='all'?BR:BR.filter(b=>b.id===ui.dbr);
  // stock totals
  const stk=b=>{let u=0,v=0;stock.forEach(r=>{if(r.b===b&&r.q>0){u+=r.q;const p=prod(r.p);v+=r.q*(p?p.precio||0:0)}});return{u,v}};
  const stAll=brs.map(b=>stk(b.id));
  const stU=sum(stAll,x=>x.u),stV=sum(stAll,x=>x.v);
  // time series
  const mkDays=()=>{const keys=[];const now=new Date();let n=ui.range==='1'?1:ui.range==='7'?7:ui.range==='30'?30:ui.range==='mes'?now.getDate():0;
    if(ui.range==='all'){const mn=sales.length?Math.min(...sales.map(s=>s.ts)):Date.now();const d0=new Date(mn);const months=[];let y=d0.getFullYear(),m=d0.getMonth();while(y<now.getFullYear()||(y===now.getFullYear()&&m<=now.getMonth())){months.push(y+'-'+pad(m+1));m++;if(m>11){m=0;y++}}return{keys:months,month:true}}
    for(let i=n-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);keys.push(dayKey(d.getTime()))}return{keys,month:false}};
  const {keys,month}=mkDays();
  const bucket=ts=>month?dayKey(ts).slice(0,7):dayKey(ts);
  const labels=keys.map(k=>month?MESES[+k.slice(5,7)-1]+' '+k.slice(2,4):(+k.slice(8,10))+'/'+(+k.slice(5,7)));
  const stacks=keys.map(k=>brs.map(b=>({v:sum(sales.filter(s=>s.sucursal===b.id&&bucket(s.ts)===k),s=>s.total||0),color:b.c})));
  // aggregates
  const agg=(f)=>{const m=new Map();sales.forEach(s=>(s.items||[]).forEach(i=>{const k=f(i);if(k==null)return;const r=m.get(k)||{u:0,v:0};r.u+=i.q;r.v+=i.q*i.pr;m.set(k,r)}));return [...m.entries()].map(([k,r])=>({k,...r}))};
  const byModel=agg(i=>i.p).sort((a,b)=>b.v-a.v).slice(0,8).map(x=>({n:pname(x.k),v:x.v,s:x.u+' uds',tip:''}));
  const byCat=agg(i=>{const p=prod(i.p);return p?p.categoria:'Otro'}).sort((a,b)=>b.v-a.v).map(x=>({n:x.k,v:x.v,s:x.u+' uds'}));
  const byMarca=agg(i=>{const p=prod(i.p);return p?cap(p.marca):'Otra'}).sort((a,b)=>b.v-a.v).map(x=>({n:x.k,v:x.v,s:x.u+' uds'}));
  const byTalla=agg(i=>i.t==='—'?null:i.t).sort((a,b)=>b.u-a.u).slice(0,10).map(x=>({n:x.k,v:x.u}));
  const byColor=agg(i=>i.c==='—'?null:i.c).sort((a,b)=>b.u-a.u).slice(0,8).map(x=>({n:x.k,v:x.u}));
  const pays={ef:sum(sales,s=>(s.pago&&s.pago.ef)||0),qr:sum(sales,s=>(s.pago&&s.pago.qr)||0),ot:sum(sales,s=>((s.pago&&s.pago.tj)||0)+((s.pago&&s.pago.gc)||0))};
  const pt=pays.ef+pays.qr+pays.ot||1;
  const pseg=(c,v,l)=>v<=0?'':`<span class="${c}" style="flex:${v}" title="${l}: Bs ${fmt(v)}">${v/pt>=.07?Math.round(v/pt*100)+'%':''}</span>`;
  // low stock
  const low=[];stock.forEach(r=>{if(r.q<=2&&(ui.dbr==='all'||r.b===ui.dbr)){const p=prod(r.p);if(p&&p.activo!==false)low.push(r)}});
  low.sort((a,b)=>a.q-b.q||pname(a.p).localeCompare(pname(b.p)));
  const out=low.filter(r=>r.q<=0).length;
  const branchRows=BR.map(b=>{const ss=AS.filter(s=>!s.anulada&&inRange(s.ts,ui.range)&&s.sucursal===b.id);const st=stk(b.id);const u=sum(ss,s=>sum(s.items||[],i=>i.q));const n=sum(ss,s=>s.total||0);
    return `<tr><td class="l"><i class="dot" style="background:${b.c}"></i>${b.n}</td><td>${fmt(n)}</td><td>${fmt(u)}</td><td>${ss.length?fmt(n/ss.length):'–'}</td><td>${fmt(st.u)}</td><td>${fmt(st.v)}</td></tr>`}).join('');
  const none=!AS.length;
  return `${seedCard()}${linkBanner()}${pendientes()?`<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><b>${pendientes()} pedido${pendientes()===1?'':'s'} de la tienda online por atender</b><button class="btn" data-act="tab" data-v="pedidos">Ver pedidos</button></div>`:''}<div class="toolbar"><div class="row" style="gap:16px"><div class="fgroup"><span class="flabel">Período</span>${rangeChips('range')}</div><div class="fgroup"><span class="flabel">Sucursal</span>${branchChips('dbr',true)}</div></div></div>
  <section class="kpis">
    <div class="kpi"><div class="k">Venta neta</div><div class="v num">${fmt(neto)}<small>Bs</small></div><div class="d">${sales.length} ventas</div></div>
    <div class="kpi"><div class="k">Prendas vendidas</div><div class="v num">${fmt(units)}<small>uds</small></div><div class="d">${sales.length?fmt1(units/sales.length)+' por venta':'—'}</div></div>
    <div class="kpi"><div class="k">Ticket promedio</div><div class="v num">${sales.length?fmt(neto/sales.length):'–'}<small>Bs</small></div><div class="d">Descuentos: Bs ${fmt(desc)} (${bruto?fmt1(desc/bruto*100):'0,0'}%)</div></div>
    <div class="kpi"><div class="k">Stock disponible</div><div class="v num">${fmt(stU)}<small>uds</small></div><div class="d">Valor a precio de venta: Bs ${fmt(stV)}</div></div>
  </section>
  ${none?`<div class="card">${empty('Todavía no hay ventas registradas','Cuando tus empleados registren ventas en la pestaña Vender, aquí verás todo el movimiento.')}</div>`:''}
  <section class="grid">
    <div class="card c8"><div class="card-head"><h2>Venta neta ${month?'por mes':'por día'}</h2><div class="legend">${brs.map(b=>`<span><i style="background:${b.c}"></i>${b.n}</span>`).join('')}</div></div>${colChart(labels,stacks,(i,t)=>labels[i]+': Bs '+fmt(t))}</div>
    <div class="card c4"><div class="card-head"><h2>Cómo se paga</h2><p>Venta neta</p></div><div class="pay-bar">${pseg('qr',pays.qr,'QR')}${pseg('ef',pays.ef,'Efectivo')}${pseg('ot',pays.ot,'Tarjeta y giftcard')}</div><div class="legend" style="margin-top:10px"><span><i style="background:var(--h5)"></i>QR Bs ${fmt(pays.qr)}</span><span><i style="background:var(--h2)"></i>Efectivo Bs ${fmt(pays.ef)}</span><span><i style="background:var(--h0);border:1px solid var(--line)"></i>Otros Bs ${fmt(pays.ot)}</span></div></div>
  </section>
  <section class="grid">
    <div class="card c7"><div class="card-head"><h2>Comparativo de sucursales</h2><p>Ventas del período · stock actual</p></div><div class="tbl-wrap"><table class="t"><tr><th class="l">Sucursal</th><th>Neta Bs</th><th>Prendas</th><th>Ticket Bs</th><th>Stock uds</th><th>Stock Bs</th></tr>${branchRows}</table></div></div>
    <div class="card c5"><div class="card-head"><h2>Modelos más vendidos</h2><p>Venta Bs</p></div>${hbars(byModel)}</div>
  </section>
  <section class="grid">
    <div class="card c4"><div class="card-head"><h2>Categorías</h2><p>Venta Bs</p></div>${hbars(byCat)}</div>
    <div class="card c4"><div class="card-head"><h2>Marcas</h2><p>Venta Bs</p></div>${hbars(byMarca)}</div>
    <div class="card c4"><div class="card-head"><h2>Tallas</h2><p>Unidades</p></div>${hbars(byTalla)}<h3 style="margin-top:14px">Colores</h3><div style="margin-top:8px">${hbars(byColor)}</div></div>
  </section>
  <section class="card"><div class="card-head"><h2>Alertas de stock</h2><p>${out} agotados · ${low.length-out} con 2 o menos</p></div>
    ${low.length?`<div class="tbl-wrap"><table class="t"><tr><th class="l">Modelo</th><th class="l">Talla · Color</th><th class="l">Sucursal</th><th>Quedan</th></tr>${low.slice(0,14).map(r=>`<tr><td class="l">${esc(pname(r.p))}</td><td class="l">${esc(r.t)} · ${esc(r.c)}</td><td class="l"><i class="dot" style="background:${BRM[r.b]?BRM[r.b].c:'var(--ink-3)'}"></i>${esc(BRM[r.b]?BRM[r.b].n:r.b)}</td><td>${r.q<=0?'<span class="pill bad">Agotado</span>':'<span class="pill warn">'+r.q+'</span>'}</td></tr>`).join('')}</table></div>${low.length>14?`<p class="note">Y ${low.length-14} más. Míralas completas en Inventario.</p>`:''}`:empty('Sin alertas','Todas las variantes tienen más de 2 unidades.')}</section>`;
};

// catalog / POS shared product list
function filterProducts(b,opts){
  opts=opts||{};const q=ui.q.trim().toLowerCase();
  return [...S.products.values()].filter(p=>p.activo!==false&&(opts.all||ui.showEmpty||ptotal(b,p.id)>0)&&(!ui.cat||p.categoria===ui.cat)&&(!ui.marca||p.marca===ui.marca)&&(!q||(p.modelo+' '+p.marca+' '+p.categoria+' '+(p.corte||'')).toLowerCase().includes(q))).sort((a,b2)=>a.modelo.localeCompare(b2.modelo));
}
function variantsOf(b,p){const v=[];stock.forEach(r=>{if(r.b===b&&r.p===p&&r.q>0)v.push(r)});return v.sort((a,c)=>a.t.localeCompare(c.t,'es',{numeric:true})||a.c.localeCompare(c.c))}
function pcard(p,b,clickable){
  const vs=variantsOf(b,p.id);const tot=ptotal(b,p.id);
  const info=`<span class="nm">${esc(cap(p.modelo))}</span><span class="mt">${esc(cap(p.marca))} · ${esc(p.categoria)}${p.corte?' · '+esc(p.corte):''}</span><span class="pr">Bs ${fmt(p.precio)}</span><span class="vs">${vs.length?vs.slice(0,10).map(v=>`<span class="${v.q<=2?'low':''}">${esc(v.t)} ${esc(v.c)} <b>×${v.q}</b></span>`).join('')+(vs.length>10?`<span>+${vs.length-10}</span>`:''):'<span>Sin stock</span>'}</span>`;
  if(clickable)return `<button class="pc" data-act="pick" data-p="${esc(p.id)}">${phHtml(p)}${info}</button>`;
  return `<div class="pc static">${phHtml(p)}<label class="sel" title="Incluir en el catálogo"><input type="checkbox" data-act-change="sel" data-p="${esc(p.id)}" ${ui.sel[p.id]?'checked':''}></label>${info}<span class="mt">${tot} disponibles</span><span class="acts">${downloads?`<button class="btn sec sm" data-act="share-img" data-p="${esc(p.id)}">Imagen</button>`:''}<button class="btn sec sm" data-act="share-txt" data-p="${esc(p.id)}">Copiar texto</button></span></div>`
}
function filterBar(b,withBranch){
  const cats=[...new Set([...S.products.values()].map(p=>p.categoria))].sort();const marcas=[...new Set([...S.products.values()].map(p=>p.marca))].sort();
  return `<div class="toolbar"><div class="row" style="gap:12px">${withBranch?`<div class="fgroup"><span class="flabel">Sucursal</span>${branchChips('branch',false)}</div>`:''}<div class="fgroup"><span class="flabel">Buscar</span><input type="text" class="search" id="q" data-keep placeholder="Modelo, marca…" value="${esc(ui.q)}"></div><div class="fgroup"><span class="flabel">Categoría</span><select id="fcat" data-act-change="cat"><option value="">Todas</option>${cats.map(c=>`<option ${ui.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="fgroup"><span class="flabel">Marca</span><select id="fmarca" data-act-change="marca"><option value="">Todas</option>${marcas.map(c=>`<option ${ui.marca===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div></div></div>`
}
function listHtml(b,clickable){
  const list=filterProducts(b);
  if(!list.length)return empty('No hay prendas para mostrar',S.products.size?'Prueba con otro filtro o ingresa stock en esta sucursal.':'Aún no hay productos cargados.');
  return `<div class="pgrid">${list.slice(0,150).map(p=>pcard(p,b,clickable)).join('')}</div>${list.length>150?`<p class="note">Mostrando 150 de ${list.length}. Usa los filtros para acotar.</p>`:''}`
}

VIEWS.catalogo=()=>{
  const b=curBranch();
  const nsel=Object.values(ui.sel).filter(Boolean).length;
  return `${filterBar(b,admin)}<div class="toolbar"><div class="row"><span class="pill"><i class="dot" style="background:${BRM[b].c}"></i>Catálogo de ${BRM[b].n}</span><span class="muted sm" id="selcount">${nsel?nsel+' seleccionadas':'Se incluirán todas las que ves'}</span></div><div class="row"><button class="btn sec" data-act="copy-public">Copiar enlace para clientes</button>${downloads?'<button class="btn" data-act="pdf">Descargar catálogo PDF</button>':''}<button class="btn sec" data-act="sel-all">Seleccionar todas</button><button class="btn sec" data-act="sel-none">Quitar selección</button></div></div><div class="row"><label class="row sm muted" style="gap:6px"><input type="checkbox" data-act-change="empty" ${ui.showEmpty?'checked':''}> Mostrar agotados</label></div><div id="results">${listHtml(b,false)}</div>`;
};
AFTER.catalogo=()=>{bindSearch(()=>{const b=curBranch();$('results').innerHTML=listHtml(b,false)})};
function bindSearch(fn){const q=$('q');if(q)q.addEventListener('input',()=>{ui.q=q.value;fn()})}

// POS
function cartTotals(){const bruto=sum(ui.cart,i=>i.q*i.pr);const desc=Math.max(0,Math.min(bruto,+ui.disc||0));return{bruto,desc,total:bruto-desc}}
function cartHtml(b){
  const t=cartTotals();
  const lines=ui.cart.map((i,ix)=>`<div class="cl"><div><div class="t1">${esc(pname(i.p))}</div><div class="t2">${esc(i.t)} · ${esc(i.c)} · Bs ${fmt(i.pr)}</div></div><div class="qty"><button data-act="qty" data-i="${ix}" data-d="-1" aria-label="Quitar uno">−</button><b class="num">${i.q}</b><button data-act="qty" data-i="${ix}" data-d="1" aria-label="Agregar uno">+</button></div></div>`).join('');
  const meths=[['ef','Efectivo'],['qr','QR'],['tj','Tarjeta'],['gc','Giftcard']];
  const mixTotal=sum(meths,m=>+ui.mix[m[0]]||0);
  return `<div class="card cart"><div class="card-head" style="margin:0"><h2>Venta actual</h2><span class="pill"><i class="dot" style="background:${BRM[b].c}"></i>${BRM[b].n}</span></div>
  <div>${lines||empty('Carrito vacío','Toca una prenda para agregarla.')}</div>
  <div class="fgroup"><span class="flabel">Descuento (Bs)</span><input type="number" min="0" step="1" id="disc" data-keep value="${ui.disc||''}" placeholder="0"></div>
  <div><div class="totrow"><span class="muted">Subtotal</span><span class="num">Bs ${fmt(t.bruto)}</span></div>${t.desc?`<div class="totrow"><span class="muted">Descuento</span><span class="num">− Bs ${fmt(t.desc)}</span></div>`:''}<div class="totrow big"><span>Total</span><span class="num">Bs ${fmt(t.total)}</span></div></div>
  <div class="fgroup"><span class="flabel">Forma de pago</span><div class="chips">${meths.map(m=>`<button class="chip" aria-pressed="${!ui.mixed&&ui.pay===m[0]}" data-act="pay" data-v="${m[0]}">${m[1]}</button>`).join('')}<button class="chip" aria-pressed="${ui.mixed}" data-act="pay" data-v="mix">Mixto</button></div></div>
  ${ui.mixed?`<div class="pay-grid">${meths.map(m=>`<div class="fgroup"><span class="flabel">${m[1]}</span><input type="number" min="0" step="1" data-keep data-mix="${m[0]}" value="${ui.mix[m[0]]||''}" placeholder="0"></div>`).join('')}</div><p class="note" style="${Math.round(mixTotal)===Math.round(t.total)?'':'color:var(--bad)'}">Suma: Bs ${fmt(mixTotal)} de Bs ${fmt(t.total)}</p>`:''}
  <p class="err" id="poserr"></p>
  <button class="btn" data-act="sell" ${ui.cart.length?'':'disabled'}>Cobrar Bs ${fmt(t.total)}</button>
  ${ui.cart.length?'<button class="btn sec sm" data-act="clear-cart">Vaciar carrito</button>':''}</div>`
}
VIEWS.vender=()=>{
  const b=curBranch();
  return `<div class="pos"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">${filterBar(b,admin)}<div id="results">${listHtml(b,true)}</div></div><div id="cartbox">${cartHtml(b)}</div></div>`
};
function bindCart(){
  const d=$('disc');if(d)d.addEventListener('input',()=>{ui.disc=+d.value||0;refreshCartTotals()});
  document.querySelectorAll('[data-mix]').forEach(i=>i.addEventListener('input',()=>{ui.mix[i.dataset.mix]=+i.value||0;refreshCartTotals(true)}))}
AFTER.vender=()=>{bindSearch(()=>{$('results').innerHTML=listHtml(curBranch(),true)});bindCart()};
function refreshCartTotals(mixOnly){ // update without losing focus
  const t=cartTotals();const box=$('cartbox');if(!box)return;
  const tot=box.querySelector('.totrow.big span:last-child');if(tot)tot.textContent='Bs '+fmt(t.total);
  const btn=box.querySelector('[data-act="sell"]');if(btn)btn.textContent='Cobrar Bs '+fmt(t.total);
  const notes=box.querySelectorAll('.note');notes.forEach(n=>{if(/^Suma/.test(n.textContent)){const m=sum(['ef','qr','tj','gc'],k=>+ui.mix[k]||0);n.textContent='Suma: Bs '+fmt(m)+' de Bs '+fmt(t.total);n.style.color=Math.round(m)===Math.round(t.total)?'':'var(--bad)'}});
}
function rerenderCart(){const box=$('cartbox');if(box){box.innerHTML=cartHtml(curBranch());bindCart()}}

function openPicker(pid){
  const b=curBranch();const p=prod(pid);if(!p)return;
  const vs=variantsOf(b,pid);
  const inCart=(t,c)=>sum(ui.cart.filter(i=>i.p===pid&&i.t===t&&i.c===c),i=>i.q);
  const fc=Object.fromEntries((p.fc||[]).map(x=>[x.c,x.f]));
  openModal(`<div class="mhead"><div><h2>${esc(cap(p.modelo))}</h2><div class="muted sm">${esc(cap(p.marca))} · ${esc(p.categoria)} · Bs ${fmt(p.precio)} · ${BRM[b].n}</div></div><button class="btn sec sm" data-act="close">Listo</button></div>
  <p class="muted sm" style="margin:0">Elige talla y color. Cada toque agrega una unidad al carrito.</p>
  <div class="vpick" id="vpick">${vs.length?vs.map(v=>{const left=v.q-inCart(v.t,v.c);return `<button class="vb ${inCart(v.t,v.c)?'in':''}" data-act="addv" data-p="${esc(pid)}" data-t="${esc(v.t)}" data-c="${esc(v.c)}" ${left<=0?'disabled':''}>${fc[v.c]?`<img class="vimg" src="${imgUrl(fc[v.c])}" alt="">`:''}<div><b>${esc(v.t)} · ${esc(v.c)}</b><span>${left} disponibles${inCart(v.t,v.c)?' · '+inCart(v.t,v.c)+' en carrito':''}</span></div></button>`}).join(''):empty('Sin stock en esta sucursal')}</div>`);
}

async function sell(){
  const err=$('poserr');const b=curBranch();
  if(!ui.cart.length)return;
  for(const i of ui.cart){if(avail(b,i.p,i.t,i.c)<i.q){err.textContent='Ya no hay stock suficiente de '+pname(i.p)+' '+i.t+' '+i.c+'. Revisa el carrito.';return}}
  const t=cartTotals();let pago={ef:0,qr:0,tj:0,gc:0};
  if(ui.mixed){pago={ef:+ui.mix.ef||0,qr:+ui.mix.qr||0,tj:+ui.mix.tj||0,gc:+ui.mix.gc||0};if(Math.round(sum(Object.values(pago),x=>x))!==Math.round(t.total)){err.textContent='Los montos del pago mixto deben sumar Bs '+fmt(t.total)+'.';return}}
  else pago[ui.pay]=t.total;
  const btn=document.querySelector('[data-act="sell"]');if(btn)btn.disabled=true;
  try{
    await Store.registrarVenta(b,ui.cart.map(i=>({p:i.p,t:i.t,c:i.c,q:i.q})),t.desc,pago);
    toast('Venta registrada · Bs '+fmt(t.total));ui.cart=[];ui.disc=0;ui.mix={ef:0,qr:0,tj:0,gc:0};refreshStock();render()
  }catch(e){err.textContent=(e&&e.message?e.message:'No se pudo guardar la venta')+' Revisa el carrito e intenta de nuevo.';if(btn)btn.disabled=false;refreshStock()}
}

// Inventory
function invTable(){
  const q=ui.q.trim().toLowerCase();
  const list=[...S.products.values()].filter(p=>(!q||(p.modelo+' '+p.marca+' '+p.categoria).toLowerCase().includes(q))&&(ui.showEmpty||BR.some(b=>ptotal(b.id,p.id)!==0||[...stock.values()].some(r=>r.p===p.id&&r.b===b.id)))).sort((a,b)=>a.modelo.localeCompare(b.modelo));
  const rows=list.slice(0,200).map(p=>{
    const ex=ui.expanded[p.id];
    let html=`<tr class="clk" data-act="expand" data-p="${esc(p.id)}"><td class="l"><b>${esc(cap(p.modelo))}</b> <span class="muted sm">${esc(cap(p.marca))} · ${esc(p.categoria)}</span></td>${BR.map(b=>{const v=ptotal(b.id,p.id);return `<td>${v<0?`<span class="pill bad">${v}</span>`:v}</td>`}).join('')}<td><b>${sum(BR,b=>Math.max(0,ptotal(b.id,p.id)))}</b></td></tr>`;
    if(ex){const vars=new Map();stock.forEach(r=>{if(r.p===p.id){const k=r.t+'~'+r.c;const o=vars.get(k)||{t:r.t,c:r.c,q:{}};o.q[r.b]=r.q;vars.set(k,o)}});
      html+=[...vars.values()].sort((a,c)=>a.t.localeCompare(c.t,'es',{numeric:true})).map(v=>`<tr class="sub"><td class="l">&nbsp;&nbsp;${esc(v.t)} · ${esc(v.c)}</td>${BR.map(b=>{const q=v.q[b.id]||0;return `<td>${q<0?`<span class="pill bad">${q}</span>`:q<=0?'<span class="muted">0</span>':q<=2?`<span class="pill warn">${q}</span>`:q}</td>`}).join('')}<td>${sum(BR,b=>Math.max(0,v.q[b.id]||0))}</td></tr>`).join('')||`<tr class="sub"><td class="l muted" colspan="5">Sin movimientos de stock.</td></tr>`}
    return html}).join('');
  return rows?`<table class="t"><tr><th class="l">Modelo</th>${BR.map(b=>`<th><i class="dot" style="background:${b.c}"></i>${b.n}</th>`).join('')}<th>Total</th></tr>${rows}</table>`:empty('No hay stock para mostrar','Usa Ingresar stock para registrar prendas por modelo, talla y color en cada sucursal.');
}
VIEWS.inv=()=>{
  const tot=BR.map(b=>{let u=0;stock.forEach(r=>{if(r.b===b.id&&r.q>0)u+=r.q});return u});
  const hist=S.entries.slice(0,25).map(e=>{const u=sum(e.lines||[],l=>l.q);const d=S.drops.find(x=>x.id===e.dropId);
    const ty={ingreso:'Ingreso',transferencia:'Transferencia',ajuste:'Ajuste'}[e.tipo]||e.tipo;
    const dst=BRM[e.sucursal]?BRM[e.sucursal].n:e.sucursal;
    const where=e.tipo==='transferencia'?`${esc(BRM[e.origen]?BRM[e.origen].n:e.origen)} → ${esc(dst)}`:esc(dst);
    const conf=ui.confirm==='e'+e.id;
    return `<tr><td class="l">${timeStr(e.ts)}</td><td class="l">${ty}${d?` <span class="pill">${esc(d.nombre)}</span>`:''}</td><td class="l">${where}</td><td>${u>0?'+':''}${u}</td><td class="l">${esc(e.nota||'')}</td><td class="l">${esc(nameOf(e.by))}</td><td><button class="btn sm ${conf?'danger':'sec'}" data-act="del-entry" data-id="${esc(e.id)}">${conf?'¿Seguro?':'Borrar'}</button></td></tr>`}).join('');
  return `<div class="toolbar"><div class="row"><div class="fgroup"><span class="flabel">Buscar</span><input type="text" class="search" id="q" data-keep placeholder="Modelo o marca…" value="${esc(ui.q)}"></div><label class="row sm muted" style="gap:6px;margin-top:18px"><input type="checkbox" data-act-change="empty" ${ui.showEmpty?'checked':''}> Mostrar productos sin movimientos</label></div><div class="row"><button class="btn" data-act="mov" data-v="ingreso">Ingresar stock</button><button class="btn sec" data-act="mov" data-v="transferencia">Transferir</button><button class="btn sec" data-act="mov" data-v="ajuste">Ajustar</button></div></div>
  <section class="kpis">${BR.map((b,i)=>`<div class="kpi"><div class="k"><i class="dot" style="background:${b.c}"></i>${b.n}</div><div class="v num">${fmt(tot[i])}<small>uds</small></div></div>`).join('')}<div class="kpi"><div class="k">Total</div><div class="v num">${fmt(sum(tot,x=>x))}<small>uds</small></div></div></section>
  <div class="card"><div class="card-head"><h2>Stock por modelo</h2><p>Toca una fila para ver talla y color</p></div><div class="tbl-wrap" id="results">${invTable()}</div></div>
  <div class="card"><div class="card-head"><h2>Últimos movimientos</h2><p>Ingresos, transferencias y ajustes</p></div>${hist?`<div class="tbl-wrap"><table class="t"><tr><th class="l">Fecha</th><th class="l">Tipo</th><th class="l">Sucursal</th><th>Uds</th><th class="l">Nota</th><th class="l">Por</th><th></th></tr>${hist}</table></div>`:empty('Sin movimientos')}</div>`;
};
AFTER.inv=()=>{bindSearch(()=>{$('results').innerHTML=invTable()})};

// Drops
VIEWS.drops=()=>{
  const cards=S.drops.map(d=>{
    const es=S.entries.filter(e=>e.dropId===d.id&&e.tipo==='ingreso');
    const perB=BR.map(b=>sum(es.filter(e=>e.sucursal===b.id),e=>sum(e.lines||[],l=>l.q)));
    const pids=new Set();es.forEach(e=>(e.lines||[]).forEach(l=>pids.add(l.p)));
    const since=d.fecha?new Date(d.fecha+'T00:00:00').getTime():0;
    let sold=0,left=0;AS.forEach(s=>{if(s.anulada||s.ts<since)return;(s.items||[]).forEach(i=>{if(pids.has(i.p))sold+=i.q})});
    stock.forEach(r=>{if(pids.has(r.p)&&r.q>0)left+=r.q});
    const rec=sum(perB,x=>x);
    return `<div class="card"><div class="card-head"><h2>${esc(d.nombre)}</h2><p>${esc(d.fecha||'')}</p></div>${d.notas?`<p class="note" style="margin:0 0 10px">${esc(d.notas)}</p>`:''}
    <div class="legend" style="margin-bottom:10px">${BR.map((b,i)=>`<span><i style="background:${b.c}"></i>${b.n}: <b>${perB[i]}</b></span>`).join('')}</div>
    <div class="row sm"><span class="pill">${rec} recibidas</span><span class="pill">${pids.size} modelos</span><span class="pill">${sold} vendidas desde el lanzamiento</span><span class="pill">${left} en stock hoy</span>${sold+left?`<span class="pill">${Math.round(sold/(sold+left)*100)}% vendido</span>`:''}</div>
    <div class="row" style="margin-top:12px"><button class="btn sm" data-act="mov" data-v="ingreso" data-drop="${esc(d.id)}">Ingresar stock de este drop</button></div></div>`}).join('');
  return `<div class="toolbar"><div><h2>Drops</h2><p class="muted sm" style="margin:2px 0 0">Agrupa los ingresos de stock por lanzamiento y por sucursal.</p></div><button class="btn" data-act="new-drop">Nuevo drop</button></div>${S.drops.length?'<div class="pgrid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">'+cards+'</div>':`<div class="card">${empty('Aún no creaste drops','Crea un drop (por ejemplo, “Invierno 2026”) y asígnale los ingresos de stock de cada sucursal.')}</div>`}`;
};

// Sales history
VIEWS.ventas=()=>{
  const m=mine();
  let list=AS.filter(s=>inRange(s.ts,admin?ui.vrange:'1')&&(m?s.sucursal===m&&s.by===myId:(ui.vbr==='all'||s.sucursal===ui.vbr)));
  const live=list.filter(s=>!s.anulada);
  const tot=sum(live,s=>s.total||0);
  const rows=list.slice(0,ui.salesLimit).map(s=>{
    const items=(s.items||[]).map(i=>`${i.q}× ${esc(cap(pname(i.p)))}${i.t==='—'?'':' '+esc(i.t)+' '+esc(i.c)}`).join(', ');
    const p=s.pago||{};const pm=[['ef','Efectivo'],['qr','QR'],['tj','Tarjeta'],['gc','Giftcard']].filter(x=>p[x[0]]>0).map(x=>x[1]+(Object.values(p).filter(v=>v>0).length>1?' '+fmt(p[x[0]]):'')).join(' + ');
    const conf=ui.confirm==='s'+s.id;
    return `<tr style="${s.anulada?'opacity:.5;text-decoration:line-through':''}"><td class="l">${timeStr(s.ts)}</td><td class="l"><i class="dot" style="background:${BRM[s.sucursal]?BRM[s.sucursal].c:''}"></i>${esc(BRM[s.sucursal]?BRM[s.sucursal].n:s.sucursal)}</td><td class="l" style="white-space:normal;min-width:220px">${items}</td><td>${fmt(s.total)}${s.desc?`<div class="muted sm">desc. ${fmt(s.desc)}</div>`:''}</td><td class="l">${pm}</td><td class="l">${s.hist?'<span class="pill">Historial</span>':s.online?'<span class="pill">Tienda online</span>':esc(nameOf(s.by))}</td>${admin?`<td>${s.hist||s.online?'':s.anulada?'<span class="pill">Anulada</span>':`<button class="btn sm ${conf?'danger':'sec'}" data-act="void" data-id="${esc(s.id)}">${conf?'¿Anular?':'Anular'}</button>`}</td>`:''}</tr>`}).join('');
  return `<div class="toolbar">${admin?`<div class="row" style="gap:16px"><div class="fgroup"><span class="flabel">Período</span>${rangeChips('vrange')}</div><div class="fgroup"><span class="flabel">Sucursal</span>${branchChips('vbr',true)}</div></div>`:`<div><h2>Mis ventas de hoy</h2><p class="muted sm" style="margin:2px 0 0">Solo ves las ventas que registraste tú en ${BRM[m].n}.</p></div>`}<div class="kpi" style="padding:8px 14px"><div class="k">Total ${admin?'del período':'de hoy'}</div><div class="v num" style="font-size:20px">Bs ${fmt(tot)} <small>${live.length} ventas</small></div></div></div>
  <div class="card">${rows?`<div class="tbl-wrap"><table class="t"><tr><th class="l">Fecha</th><th class="l">Sucursal</th><th class="l">Prendas</th><th>Total Bs</th><th class="l">Pago</th><th class="l">Vendedor</th>${admin?'<th></th>':''}</tr>${rows}</table></div>${list.length>ui.salesLimit?`<div class="row" style="margin-top:10px"><button class="btn sec sm" data-act="more-sales">Ver más (${list.length-ui.salesLimit} restantes)</button></div>`:''}`:empty('No hay ventas en este período')}</div>${admin?'<p class="note">Anular una venta la saca de las métricas y devuelve las prendas al stock de su sucursal.</p>':''}`;
};

// Products
VIEWS.prod=()=>{
  const q=ui.pq.trim().toLowerCase();
  if(seedCard())return seedCard();
  const list=[...S.products.values()].filter(p=>!q||(p.modelo+' '+p.marca+' '+p.categoria).toLowerCase().includes(q)).sort((a,b)=>a.modelo.localeCompare(b.modelo));
  return `${linkBanner()}<div class="toolbar"><div class="row"><div class="fgroup"><span class="flabel">Buscar</span><input type="text" class="search" id="pq" data-keep placeholder="Modelo o marca…" value="${esc(ui.pq)}"></div></div><div class="row"><button class="btn" data-act="edit-prod" data-p="">Nuevo producto</button><button class="btn sec" data-act="import-prod">Importar desde Excel</button></div></div>
  <div class="card"><div class="card-head"><h2>Productos</h2><p>${S.products.size} modelos. La talla y el color se definen al ingresar stock.</p></div><div class="tbl-wrap" id="results">${prodTable(list)}</div></div>`;
};
function prodTable(list){
  if(!list.length)return empty('No hay productos','Crea un producto o impórtalos desde Excel.');
  return `<table class="t"><tr><th class="l">Modelo</th><th class="l">Marca</th><th class="l">Categoría</th><th class="l">Corte</th><th>Precio Bs</th><th>Costo Bs</th><th class="l">Estado</th><th></th></tr>${list.slice(0,200).map(p=>`<tr><td class="l"><span class="thumb">${photoOf(p)?`<img src="${esc(photoOf(p))}" loading="lazy" alt="">`:esc(p.modelo.charAt(0))}</span><b>${esc(cap(p.modelo))}</b></td><td class="l">${esc(cap(p.marca))}</td><td class="l">${esc(p.categoria)}</td><td class="l">${esc(p.corte||'')}</td><td>${fmt(p.precio)}</td><td>${S.costs.get(p.id)?fmt(S.costs.get(p.id)):'–'}</td><td class="l">${p.activo===false?'<span class="pill">Inactivo</span>':'<span class="pill" style="color:var(--good)">Activo</span>'}</td><td><button class="btn sec sm" data-act="edit-prod" data-p="${esc(p.id)}">Editar</button></td></tr>`).join('')}</table>${list.length>200?`<p class="note">Mostrando 200 de ${list.length}. Usa el buscador.</p>`:''}`
}
AFTER.prod=()=>{const q=$('pq');if(q)q.addEventListener('input',()=>{ui.pq=q.value;const ql=ui.pq.trim().toLowerCase();$('results').innerHTML=prodTable([...S.products.values()].filter(p=>!ql||(p.modelo+' '+p.marca+' '+p.categoria).toLowerCase().includes(ql)).sort((a,b)=>a.modelo.localeCompare(b.modelo)))})};


// ---- Pedidos de la tienda online ----
const EST={pendiente:['Por pagar','warn'],pagado:['Pagado','good'],preparando:['Preparando','good'],enviado:['Enviado','good'],entregado:['Entregado',''],cancelado:['Cancelado','bad']};
const SIG={pendiente:['pagado','Confirmar pago'],pagado:['preparando','Empezar a preparar'],preparando:['enviado','Marcar enviado / listo'],enviado:['entregado','Marcar entregado']};
const vencido=o=>o.estado==='pendiente'&&Date.now()>o.ts+(S.settings.hold_horas||12)*3600000;
const entregaTxt=o=>o.entrega.tipo==='retiro'?'Retiro en tienda':(o.entrega.tipo==='delivery'?'Delivery: ':'Envío nacional: ')+(o.entrega.direccion||'')+(o.entrega.ciudad?', '+o.entrega.ciudad:'');
const metodoTxt={qr:'QR',transferencia:'Transferencia',contraentrega:'Contra entrega',tienda:'Pago en tienda'};
VIEWS.pedidos=()=>{
  const f=ui.pf||'atender';
  const grupos={atender:o=>(o.estado==='pendiente'&&!vencido(o))||o.estado==='pagado'||o.estado==='preparando',pendiente:o=>o.estado==='pendiente'&&!vencido(o),camino:o=>o.estado==='enviado',hechos:o=>o.estado==='entregado',cancel:o=>o.estado==='cancelado'||vencido(o),todos:()=>true};
  const lista=S.orders.filter(grupos[f]||grupos.todos);
  const cnt=k=>S.orders.filter(grupos[k]).length;
  const chip=(k,t)=>`<button class="chip" aria-pressed="${f===k}" data-act="ped-filtro" data-v="${k}">${t} (${cnt(k)})</button>`;
  const rows=lista.slice(0,150).map(o=>{const v=vencido(o);const e=v?['Vencido','bad']:EST[o.estado]||[o.estado,''];
    return `<tr class="clk" data-act="ped-open" data-id="${esc(o.id)}"><td class="l"><b>${esc(o.codigo)}</b><div class="muted sm">${timeStr(o.ts)}</div></td><td class="l">${esc(o.cliente.nombre)}<div class="muted sm">${esc(o.cliente.telefono)}</div></td><td class="l"><i class="dot" style="background:${BRM[o.sucursal]?BRM[o.sucursal].c:''}"></i>${esc(sucName(o.sucursal))}<div class="muted sm">${esc(o.entrega.tipo==='retiro'?'Retiro':o.entrega.tipo==='delivery'?'Delivery':'Nacional')}</div></td><td class="l">${esc(metodoTxt[o.pago.metodo]||o.pago.metodo)}${o.pago.comprobante?' <span class="pill good">Comprobante</span>':''}</td><td>${fmt(o.total)}</td><td class="l"><span class="pill ${e[1]}">${e[0]}</span></td></tr>`}).join('');
  return `<div class="toolbar"><div><h2>Pedidos de la tienda online</h2><p class="muted sm" style="margin:2px 0 0">Los pedidos reservan las prendas ${S.settings.hold_horas||12} horas. Confirma el pago cuando veas el dinero.</p></div><div class="chips">${chip('atender','Por atender')}${chip('pendiente','Por pagar')}${chip('camino','En camino')}${chip('hechos','Entregados')}${chip('cancel','Cancelados')}${chip('todos','Todos')}</div></div>
  <div class="card">${rows?`<div class="tbl-wrap"><table class="t"><tr><th class="l">Pedido</th><th class="l">Cliente</th><th class="l">Sucursal</th><th class="l">Pago</th><th>Total Bs</th><th class="l">Estado</th></tr>${rows}</table></div>`:empty('No hay pedidos aquí',S.orders.length?'Prueba con otro filtro.':'Cuando un cliente compre en la tienda, el pedido aparecerá aquí y recibirás un aviso.')}</div>`;
};
const sucName=id=>BRM[id]?BRM[id].n:id;
function waCliente(o,texto){const t=String(o.cliente.telefono||'').replace(/\D/g,'');return 'https://wa.me/591'+t+'?text='+encodeURIComponent(texto)}
async function abrirPedido(id){
  const o=S.orders.find(x=>x.id===id);if(!o)return;
  const v=vencido(o);const e=v?['Vencido','bad']:EST[o.estado]||[o.estado,''];
  const sig=SIG[o.estado];
  let comp='';
  if(o.pago.comprobante){try{const u=await Store.signedUrl(o.pago.comprobante);comp=`<div><div class="flabel" style="margin:12px 0 6px">Comprobante de pago</div><a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Comprobante" style="max-width:100%;max-height:340px;border-radius:8px;border:1px solid var(--line)"></a></div>`}catch(er){comp='<p class="muted sm">No pude abrir el comprobante.</p>'}}
  const msgs={pagado:`Hola ${o.cliente.nombre}, confirmamos el pago de tu pedido ${o.codigo}. ¡Gracias! Ya lo estamos preparando.`,enviado:o.entrega.tipo==='retiro'?`Hola ${o.cliente.nombre}, tu pedido ${o.codigo} ya está listo para retirar en ${sucName(o.sucursal)}.`:`Hola ${o.cliente.nombre}, tu pedido ${o.codigo} ya salió. Cualquier duda escríbenos por aquí.`,pendiente:`Hola ${o.cliente.nombre}, vimos tu pedido ${o.codigo} por Bs ${fmt(o.total)}. ¿Nos confirmas tu pago para reservarlo?`};
  openModal(`<div class="mhead"><div><h2>${esc(o.codigo)} <span class="pill ${e[1]}" style="vertical-align:middle">${e[0]}</span></h2><div class="muted sm">${timeStr(o.ts)} · ${esc(sucName(o.sucursal))}</div></div><button class="btn sec sm" data-act="close">Cerrar</button></div>
  <div><b>${esc(o.cliente.nombre)}</b> · ${esc(o.cliente.telefono)}${o.cliente.email?' · '+esc(o.cliente.email):''}<br><span class="muted">${esc(entregaTxt(o))}${o.entrega.referencia?' ('+esc(o.entrega.referencia)+')':''}</span>${o.nota?`<br><span class="muted">Nota: ${esc(o.nota)}</span>`:''}</div>
  <div class="tbl-wrap"><table class="t">${o.items.map(i=>`<tr><td class="l">${esc(cap(i.nombre||pname(i.p)))}<div class="muted sm">${esc(i.t)} · ${esc(i.c)}</div></td><td>x${i.q}</td><td>${fmt(i.pr*i.q)}</td></tr>`).join('')}
    <tr><td class="l">Subtotal</td><td></td><td>${fmt(o.subtotal)}</td></tr>${o.descuento?`<tr><td class="l">Descuento${o.promo?' ('+esc(o.promo)+')':''}</td><td></td><td>-${fmt(o.descuento)}</td></tr>`:''}<tr><td class="l">Envío</td><td></td><td>${o.entrega.tipo==='nacional'?'A coordinar':fmt(o.envio||0)}</td></tr><tr style="font-weight:700"><td class="l">Total · ${esc(metodoTxt[o.pago.metodo]||o.pago.metodo)}</td><td></td><td>Bs ${fmt(o.total)}</td></tr></table></div>
  ${comp}
  <div class="row" style="margin-top:6px">${sig&&!v?`<button class="btn" data-act="ped-estado" data-id="${esc(o.id)}" data-v="${sig[0]}">${sig[1]}</button>`:''}${o.estado==='cancelado'||v?`<button class="btn sec" data-act="ped-estado" data-id="${esc(o.id)}" data-v="pendiente">Reactivar</button>`:''}${o.estado!=='cancelado'&&o.estado!=='entregado'?`<button class="btn danger" data-act="ped-estado" data-id="${esc(o.id)}" data-v="cancelado" data-conf="1">Cancelar pedido</button>`:''}
  <a class="btn sec" target="_blank" rel="noopener" href="${esc(waCliente(o,msgs[o.estado]||msgs.pendiente))}">Escribir por WhatsApp</a></div>
  <p class="note">Al confirmar el pago se registra la venta online en tu dashboard. Si cancelas un pedido, las prendas vuelven al stock.</p>`);
}

// ---- Ajustes de la tienda online ----
VIEWS.tienda=()=>{
  const c=S.settings||{};const g=(o,k,d)=>o&&o[k]!=null?o[k]:d;
  const pg=Object.assign({qr:true,transferencia:true,contraentrega:true,tienda:true},c.pagos||{});
  const inp=(id,label,val,extra)=>`<div class="fgroup"><span class="flabel">${label}</span><input type="${extra&&extra.type||'text'}" id="${id}" value="${esc(val)}" ${extra&&extra.ph?`placeholder="${esc(extra.ph)}"`:''}></div>`;
  const per=(pref,label,obj,ph)=>BR.map(b=>inp(pref+b.id,label+' · '+b.n,g(obj,b.id,''),{ph})).join('');
  const urlT=(location.origin+location.pathname.replace(/[^/]*$/,'')+'tienda/').replace(/\/web\/web\//,'/web/');
  return `<div class="card"><div class="card-head"><h2>Tu tienda online</h2><p>Los clientes compran en: <a href="${esc(urlT)}" target="_blank" rel="noopener">${esc(urlT)}</a></p></div>
  <div class="form-grid">${inp('t-anuncio','Mensaje de la barra superior',g(c,'anuncio',''),{ph:'Retiro gratis · Delivery · Envíos a todo Bolivia'})}${inp('t-horarios','Horario de atención',g(c,'horarios',''),{ph:'Lunes a sábado de 10:00 a 20:00'})}${inp('t-hold','Horas que se reserva un pedido sin pagar',g(c,'hold_horas',12),{type:'number'})}</div>
  <h3 style="margin:18px 0 8px">Portada</h3><div class="form-grid">${inp('t-htit','Título grande',g(c.hero,'titulo',''),{ph:'Streetwear que se vive'})}${inp('t-hbtn','Texto del botón',g(c.hero,'boton',''),{ph:'Ver novedades'})}</div><div class="fgroup" style="margin-top:10px"><span class="flabel">Texto debajo del título</span><textarea id="t-htxt" rows="2">${esc(g(c.hero,'texto',''))}</textarea></div>
  <h3 style="margin:18px 0 8px">WhatsApp de cada sucursal</h3><div class="form-grid">${per('t-wa-','WhatsApp',c.whatsapp,'59171234567')}</div><p class="note">Con código de país y sin signos. Se usa en el botón "Consultar" y en el aviso de pago.</p>
  <h3 style="margin:18px 0 8px">Direcciones</h3><div class="form-grid">${per('t-dir-','Dirección',c.direcciones,'Calle y número')}</div>
  <h3 style="margin:18px 0 8px">Envíos</h3><div class="form-grid">${per('t-env-','Delivery (Bs)',(c.envio||{}).delivery,'15')}${inp('t-gratis','Delivery gratis desde (Bs, 0 = nunca)',g(c.envio,'gratis_desde',0),{type:'number'})}</div><div class="fgroup" style="margin-top:10px"><span class="flabel">Texto para envíos a otras ciudades</span><textarea id="t-nac" rows="2">${esc(g(c.envio,'nacional_texto',''))}</textarea></div>
  <h3 style="margin:18px 0 8px">Formas de pago</h3><div class="row" style="gap:16px">${[['qr','QR'],['transferencia','Transferencia'],['contraentrega','Contra entrega (delivery)'],['tienda','Pago en tienda (retiro)']].map(x=>`<label class="row sm" style="gap:6px"><input type="checkbox" id="t-pg-${x[0]}" ${pg[x[0]]?'checked':''}> ${x[1]}</label>`).join('')}</div>
  <div class="fgroup" style="margin-top:10px"><span class="flabel">Datos de tu cuenta bancaria (se muestran al pagar)</span><textarea id="t-banco" rows="3" placeholder="Banco, número de cuenta, titular, CI/NIT">${esc(g(c,'banco',''))}</textarea></div>
  <div class="fgroup" style="margin-top:10px"><span class="flabel">Código QR de tu banco</span><div class="row">${c.qr_foto?`<img src="${esc(imgUrl(c.qr_foto))}" alt="QR" style="width:120px;border-radius:8px;border:1px solid var(--line)">`:'<span class="muted sm">Aún no subiste el QR.</span>'}<label class="btn sec sm" style="cursor:pointer">Subir QR<input type="file" id="t-qr" accept="image/*" hidden></label></div></div>
  <div class="fgroup" style="margin-top:10px"><span class="flabel">Política de cambios</span><textarea id="t-cambios" rows="2">${esc(g(c,'cambios_texto',''))}</textarea></div>
  <p class="err" id="t-err"></p><div class="row" style="justify-content:flex-end"><button class="btn" data-act="tienda-guardar">Guardar ajustes</button></div></div>
  <div class="card"><div class="card-head"><h2>Códigos de descuento</h2><p>Los clientes los escriben al pagar</p></div>
  ${S.promos.length?`<div class="tbl-wrap"><table class="t"><tr><th class="l">Código</th><th class="l">Descuento</th><th>Compra mínima</th><th class="l">Vence</th><th class="l">Estado</th><th></th></tr>${S.promos.map(x=>`<tr><td class="l"><b>${esc(x.codigo)}</b></td><td class="l">${x.tipo==='pct'?x.valor+'%':'Bs '+fmt(x.valor)}</td><td>${fmt(x.minimo||0)}</td><td class="l">${esc(x.vence||'—')}</td><td class="l"><button class="btn sm ${x.activo===false?'':'sec'}" data-act="promo-toggle" data-id="${esc(x.id)}">${x.activo===false?'Activar':'Activo'}</button></td><td><button class="btn sec sm" data-act="promo-del" data-id="${esc(x.id)}">Borrar</button></td></tr>`).join('')}</table></div>`:'<p class="muted sm">Todavía no creaste códigos.</p>'}
  <div class="form-grid" style="margin-top:12px">${inp('p-cod','Código',' ',{ph:'DUNNO10'})}<div class="fgroup"><span class="flabel">Tipo</span><select id="p-tipo"><option value="pct">Porcentaje (%)</option><option value="monto">Monto fijo (Bs)</option></select></div>${inp('p-val','Valor','',{type:'number'})}${inp('p-min','Compra mínima (Bs)','',{type:'number'})}${inp('p-vence','Vence (opcional)','',{type:'date'})}</div>
  <div class="row" style="margin-top:10px"><button class="btn" data-act="promo-add">Crear código</button></div></div>`;
};
async function guardarTienda(){
  const v=id=>($(id).value||'').trim();const err=$('t-err');err.textContent='';
  const mapa=(pref)=>Object.fromEntries(BR.map(b=>[b.id,v(pref+b.id)]));
  const del=Object.fromEntries(BR.map(b=>[b.id,+v('t-env-'+b.id)||0]));
  const d={...(S.settings||{}),anuncio:v('t-anuncio'),horarios:v('t-horarios'),hold_horas:Math.max(1,+v('t-hold')||12),
    hero:{titulo:v('t-htit'),boton:v('t-hbtn'),texto:v('t-htxt'),foto:(S.settings.hero||{}).foto||''},
    whatsapp:Object.fromEntries(Object.entries(mapa('t-wa-')).map(([k,x])=>[k,x.replace(/\D/g,'')])),direcciones:mapa('t-dir-'),
    envio:{delivery:del,gratis_desde:+v('t-gratis')||0,nacional_texto:v('t-nac')},
    pagos:{qr:$('t-pg-qr').checked,transferencia:$('t-pg-transferencia').checked,contraentrega:$('t-pg-contraentrega').checked,tienda:$('t-pg-tienda').checked},
    banco:v('t-banco'),cambios_texto:v('t-cambios')};
  if(!d.pagos.qr&&!d.pagos.transferencia&&!d.pagos.contraentrega&&!d.pagos.tienda){err.textContent='Activa al menos una forma de pago.';return}
  try{await db.doc('settings/tienda').set(d);toast('Ajustes guardados')}catch(e){err.textContent='No se pudo guardar ('+(e.code||'error')+').'}
}

// Team
VIEWS.equipo=()=>{
  const rows=S.perfiles.filter(p=>p.id!==myId).map(p=>`<tr><td class="l"><b>${esc(p.nombre||p.email)}</b><div class="muted sm">${esc(p.email||'')}</div></td><td class="l"><select data-act-change="perfil-suc" data-id="${esc(p.id)}"><option value="">Sin asignar</option>${BR.map(b=>`<option value="${b.id}" ${p.sucursal===b.id?'selected':''}>${b.n}</option>`).join('')}</select></td><td class="l"><select data-act-change="perfil-rol" data-id="${esc(p.id)}"><option value="vendedor" ${p.rol==='vendedor'?'selected':''}>Vendedor</option><option value="admin" ${p.rol==='admin'?'selected':''}>Dueño</option></select></td><td class="l">${!p.activo?'<span class="pill bad">Desactivado</span>':p.rol==='admin'?'<span class="pill">Dueño</span>':p.sucursal?'<span class="pill" style="color:var(--good)">Puede vender</span>':'<span class="pill warn">Sin sucursal</span>'}</td><td><button class="btn sm ${p.activo?'sec':''}" data-act="perfil-activo" data-id="${esc(p.id)}">${p.activo?'Desactivar':'Activar'}</button></td></tr>`).join('');
  return `<div class="card"><div class="card-head"><h2>Equipo</h2><p>Cada vendedor vende solo en su sucursal y no ve el dashboard.</p></div>
  ${rows?`<div class="tbl-wrap"><table class="t"><tr><th class="l">Persona</th><th class="l">Sucursal</th><th class="l">Rol</th><th class="l">Estado</th><th></th></tr>${rows}</table></div>`:empty('Aún no hay vendedores','Sigue los pasos de abajo para crear sus cuentas.')}</div>
  <div class="card"><h3>Cómo agregar un vendedor</h3><ol class="sm" style="color:var(--ink-2);line-height:1.8;margin:8px 0 0;padding-left:20px"><li>En Supabase entra a <b>Authentication → Users → Add user → Create new user</b>.</li><li>Escribe su correo y una contraseña, y marca <b>Auto Confirm User</b>.</li><li>Pásale el enlace del sistema, su correo y su contraseña.</li><li>Aquí aparecerá en la lista: elige su sucursal. Hasta entonces no podrá vender.</li></ol>
  <p class="note">Los vendedores solo ven el catálogo de su sucursal, registran ventas y consultan sus propias ventas. No ven el dashboard, el inventario de otras sucursales ni las ventas de los demás.</p></div>`
};

// Add garment from photos
VIEWS.nueva=()=>{
  if(!assets)return `<div class="card">${empty('Esta función solo está disponible para el dueño','Entra con tu cuenta de dueño para subir fotos.')}</div>`;
  const f=ui.nf;
  const inp=(k,label,extra)=>`<div class="fgroup"><span class="flabel">${label}</span><input type="${extra&&extra.type||'text'}" data-nf="${k}" data-keep ${extra&&extra.list?`list="${extra.list}"`:''} ${extra&&extra.min!=null?`min="${extra.min}"`:''} value="${esc(f[k])}" ${extra&&extra.ph?`placeholder="${esc(extra.ph)}"`:''}></div>`;
  return `<div class="grid">
  <div class="card c5"><div class="card-head"><h2>1. Fotos</h2><p>La primera es la portada</p></div>
    <div id="phs-ph">${photoStrip('ph')}</div>
    ${sampleImg?`<button class="btn sec" id="ai-btn" data-act="ai" style="margin-top:12px" ${ui.ph.items.some(x=>x.blob)?'':'disabled'}>Sugerir datos con IA</button><p class="note" id="ai-note">Claude mira las fotos y propone categoría, corte, color y nombre. Tú revisas antes de guardar.</p>`:`<p class="note">Sube fotos de frente, de espalda y detalles. Se comprimen solas para que carguen rápido.</p>`}
  </div>
  <div class="card c7"><div class="card-head"><h2>2. Datos de la prenda</h2></div>
    <div class="form-grid">${inp('modelo','Modelo (nombre)')}${inp('marca','Marca',{list:'dl-marca'})}${inp('categoria','Categoría',{list:'dl-cat'})}${inp('corte','Corte',{ph:'Oversize, Boxi, Baggy…'})}${inp('precio','Precio de venta (Bs)',{type:'number',min:0})}${inp('costo','Costo (Bs, opcional)',{type:'number',min:0})}</div>
    <h3 style="margin-top:18px">3. Stock inicial <span class="muted sm" style="font-weight:400">(opcional)</span></h3>
    <div class="form-grid" style="margin:8px 0">
      <div class="fgroup"><span class="flabel">Sucursal</span><select data-nf="suc" data-keep>${BR.map(b=>`<option value="${b.id}" ${f.suc===b.id?'selected':''}>${b.n}</option>`).join('')}</select></div>
      <div class="fgroup"><span class="flabel">Drop</span><select data-nf="drop" data-keep><option value="">Sin drop</option>${S.drops.map(d=>`<option value="${esc(d.id)}" ${f.drop===d.id?'selected':''}>${esc(d.nombre)}</option>`).join('')}</select></div></div>
    ${f.lines.map((l,i)=>`<div class="lrow3"><input type="text" data-nfl="t" data-i="${i}" data-keep list="dl-talla" placeholder="Talla" value="${esc(l.t)}"><input type="text" data-nfl="c" data-i="${i}" data-keep list="dl-color" placeholder="Color" value="${esc(l.c)}"><input type="number" data-nfl="q" data-i="${i}" data-keep min="1" value="${esc(l.q)}"><button class="btn sec sm" type="button" data-act="nf-rm" data-i="${i}" aria-label="Quitar">×</button></div>`).join('')}
    <div class="row"><button class="btn sec sm" data-act="nf-add">+ Agregar talla o color</button></div>
    <p class="err" id="nf-err"></p>
    <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn" data-act="save-new" ${ui.busy?'disabled':''}>${ui.busy?'Guardando…':'Guardar prenda'}</button></div>
  </div></div>`
};
async function saveNew(){
  const err=$('nf-err');const f=ui.nf;err.textContent='';
  const d={modelo:f.modelo.trim().toUpperCase(),marca:f.marca.trim().toUpperCase(),categoria:f.categoria.trim(),corte:f.corte.trim(),precio:+f.precio,activo:true};
  if(!d.modelo||!d.marca||!d.categoria){err.textContent='Modelo, marca y categoría son obligatorios.';return}
  if(!(d.precio>0)){err.textContent='Escribe el precio de venta.';return}
  const lines=[];for(const l of f.lines){const t=normT(l.t),c=normC(l.c),q=parseInt(l.q,10);if(!t&&!c)continue;if(!t||!c||!(q>0)){err.textContent='Cada fila de stock necesita talla, color y cantidad.';return}lines.push({t,c,q})}
  ui.busy=true;render();
  try{
    if(ui.ph.items.length)d.fotos=await uploadItems('ph');
    const ref=await db.collection('products').add(d);
    if(+f.costo>0)await setCost(ref.id,+f.costo);
    if(lines.length){const e={tipo:'ingreso',ts:Date.now(),sucursal:f.suc,lines:lines.map(l=>({p:ref.id,...l})),nota:'Alta con fotos',by:myId||null};if(f.drop)e.dropId=f.drop;await db.collection('entries').add(e)}
    toast(cap(d.modelo)+' guardada'+(lines.length?' con '+sum(lines,l=>l.q)+' unidades':''));
    ui.nf=newNF(f);ui.ph={items:[]};ui.busy=false;render();
  }catch(e){ui.busy=false;render();const er=$('nf-err');if(er)er.textContent='No se pudo guardar ('+(e.code||'error')+'). Revisa tu conexión e intenta de nuevo.'}
}
async function aiSuggest(){
  const note=$('ai-note'),btn=$('ai-btn');if(btn)btn.disabled=true;if(note)note.textContent='Analizando las fotos…';
  try{
    const blobs=ui.ph.items.filter(x=>x.blob).slice(0,3).map(x=>x.blob);
    const r=await sample.json('Eres el asistente de una tienda de ropa urbana (streetwear) en Bolivia. Mira las fotos de UNA sola prenda y responde SOLO un objeto JSON con estas claves: "categoria" (una de: Polera, Hoddie, Buzo, Pantalón, Shorts, Chaqueta, Otro), "corte" (silueta, por ejemplo Oversize, Boxi, Baggy, Slim; cadena vacía si no se nota), "colores" (lista de 1 a 3 colores principales en español, con la primera letra en mayúscula) y "nombre" (nombre corto de 1 a 3 palabras basado en el estampado o texto visible; cadena vacía si no hay).',{images:blobs,modelTier:'quick'});
    const f=ui.nf;const cats=['Polera','Hoddie','Buzo','Pantalón','Shorts','Chaqueta','Otro'];
    if(!f.categoria&&cats.includes(r.categoria))f.categoria=r.categoria;
    if(!f.corte&&r.corte)f.corte=String(r.corte).slice(0,30);
    if(!f.modelo&&r.nombre)f.modelo=String(r.nombre).slice(0,40);
    if(Array.isArray(r.colores)&&r.colores[0]&&f.lines.length&&!f.lines[0].c)f.lines[0].c=String(r.colores[0]).slice(0,20);
    ui.aiMsg='Sugerencias de IA aplicadas. Revisa los datos antes de guardar.';render();toast('Datos sugeridos');
    const n2=$('ai-note');if(n2)n2.textContent=ui.aiMsg;
  }catch(e){const n2=$('ai-note');if(n2)n2.textContent=e&&e.code==='declined'?'No se usó la IA.':'No pude analizar las fotos ('+((e&&e.code)||'error')+'). Puedes llenar los datos a mano.';const b2=$('ai-btn');if(b2)b2.disabled=false}
}

// ---- sharing: image card, text, PDF ----
const FONT_D='"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif',FONT_B='"Instrument Sans","Helvetica Neue",Arial,sans-serif';
const loadImg=src=>new Promise(res=>{if(!src)return res(null);const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src});
async function ensureFonts(){try{await Promise.all([document.fonts.load('700 40px "Bricolage Grotesque"'),document.fonts.load('500 30px "Instrument Sans"')])}catch(e){}}
function wrapLines(ctx,text,maxW,maxLines){const words=String(text).split(/\s+/);const lines=[];let cur='';for(const w of words){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=w}else cur=t}if(cur)lines.push(cur);if(lines.length>maxLines){lines.length=maxLines;lines[maxLines-1]=lines[maxLines-1].replace(/.{0,2}$/,'…')}return lines}
function variantSummary(b,p){const vs=variantsOf(b,p.id);const tallas=[...new Set(vs.map(v=>v.t))].sort((a,c)=>a.localeCompare(c,'es',{numeric:true}));const colores=[...new Set(vs.map(v=>v.c))];return{tallas,colores}}
function drawProduct(ctx,p,b,img,x,y,w,h){
  const photoH=Math.round(h*.7);
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,photoH);ctx.clip();
  if(img){const r=Math.max(w/img.width,photoH/img.height);const dw=img.width*r,dh=img.height*r;ctx.drawImage(img,x+(w-dw)/2,y+(photoH-dh)/2,dw,dh)}
  else{ctx.fillStyle='#e6e8ec';ctx.fillRect(x,y,w,photoH);ctx.fillStyle='#9aa1ae';ctx.font='700 '+Math.round(w*.25)+'px '+FONT_D;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(p.modelo).charAt(0),x+w/2,y+photoH/2)}
  ctx.restore();
  const pad=Math.round(w*.045);let ty=y+photoH+pad;const tx=x+pad,mw=w-pad*2;
  ctx.textAlign='left';ctx.textBaseline='top';
  const fs=Math.round(w*.062);ctx.fillStyle='#0f1218';ctx.font='700 '+fs+'px '+FONT_D;
  const nl=wrapLines(ctx,cap(p.modelo),mw*.62,2);nl.forEach((ln,i)=>ctx.fillText(ln,tx,ty+i*fs*1.12));
  ctx.textAlign='right';ctx.fillStyle='#1c5cab';ctx.font='700 '+fs+'px '+FONT_D;ctx.fillText('Bs '+fmt(p.precio),x+w-pad,ty);ctx.textAlign='left';
  ty+=nl.length*fs*1.12+Math.round(w*.012);
  const ms=Math.round(w*.036);ctx.fillStyle='#4a5160';ctx.font='500 '+ms+'px '+FONT_B;
  ctx.fillText(cap(p.marca)+' · '+p.categoria+(p.corte?' · '+p.corte:''),tx,ty);ty+=ms*1.5;
  const vsum=variantSummary(b,p);
  ctx.fillStyle='#0f1218';
  if(vsum.tallas.length){const t1=wrapLines(ctx,'Tallas: '+vsum.tallas.join(' · '),mw,1);ctx.fillText(t1[0],tx,ty);ty+=ms*1.4;const t2=wrapLines(ctx,'Colores: '+vsum.colores.join(' · '),mw,1);ctx.fillText(t2[0],tx,ty)}
  else{ctx.fillStyle='#7a8191';ctx.fillText('Consultar disponibilidad',tx,ty)}
}
const canvasBlob=(c,q)=>new Promise(r=>c.toBlob(r,'image/jpeg',q||.9));
const fileSlug=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'prenda';
function saveErr(e){if(e&&e.code==='declined')return;toast('No se pudo guardar el archivo ('+((e&&e.code)||'error')+')')}
async function shareImage(pid){
  const p=prod(pid);if(!p||!downloads)return;const b=curBranch();toast('Preparando imagen…');
  await ensureFonts();const img=await loadImg(photoOf(p));
  const c=document.createElement('canvas');c.width=1080;c.height=1350;const ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1080,1350);drawProduct(ctx,p,b,img,0,0,1080,1260);
  ctx.fillStyle='#7a8191';ctx.font='500 28px '+FONT_B;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('DUNNO CLOTHING · '+BRM[b].n,48,1305);
  try{await downloads.save({filename:fileSlug(p.modelo+'-'+p.marca)+'.jpg',data:await canvasBlob(c)});toast('Imagen lista para enviar')}catch(e){saveErr(e)}
}
function shareText(pid){
  const p=prod(pid);if(!p)return;const b=curBranch();const v=variantSummary(b,p);
  const t='*'+cap(p.modelo)+'* · '+cap(p.marca)+'\n'+p.categoria+(p.corte?' · '+p.corte:'')+'\nBs '+fmt(p.precio)+(v.tallas.length?'\nTallas: '+v.tallas.join(', ')+'\nColores: '+v.colores.join(', '):'\nConsulta disponibilidad')+'\nDunno Clothing · '+BRM[b].n;
  const fallback=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('Texto copiado')}catch(e){toast('No se pudo copiar')}ta.remove()};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(()=>toast('Texto copiado, pégalo en WhatsApp')).catch(fallback);else fallback();
}
function loadScript(src){return new Promise((res,rej)=>{if(window.jspdf)return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('script'));document.head.appendChild(s)})}
async function makePdf(){
  if(ui.busy)return;const b=curBranch();
  let list=filterProducts(b);const chosen=list.filter(p=>ui.sel[p.id]);
  const picked=Object.values(ui.sel).filter(Boolean).length;
  if(picked){list=[...S.products.values()].filter(p=>ui.sel[p.id]&&p.activo!==false).sort((a,c)=>a.modelo.localeCompare(c.modelo))}
  if(!list.length){toast('No hay prendas para el catálogo');return}
  const order=c=>{const i=CATS.indexOf(c);return i<0?99:i};
  list=list.slice().sort((a,c)=>order(a.categoria)-order(c.categoria)||a.marca.localeCompare(c.marca)||a.modelo.localeCompare(c.modelo));
  ui.busy=true;toast('Armando el catálogo de '+list.length+' prendas ('+Math.ceil(list.length/4)+' páginas). Puede tardar un minuto, no cierres la página.');
  try{
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');await ensureFonts();
    const W=1240,Hh=1754;const pdf=new window.jspdf.jsPDF({unit:'px',format:[W,Hh],orientation:'portrait',compress:true});
    const per=4,pages=Math.ceil(list.length/per);const fecha=new Date().toLocaleDateString('es-BO',{day:'numeric',month:'long',year:'numeric'});
    for(let pg=0;pg<pages;pg++){
      const c=document.createElement('canvas');c.width=W;c.height=Hh;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,Hh);
      ctx.fillStyle='#0f1218';ctx.font='700 54px '+FONT_D;ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillText('DUNNO CLOTHING',60,100);
      ctx.fillStyle='#4a5160';ctx.font='500 26px '+FONT_B;ctx.fillText('Catálogo '+BRM[b].n+' · '+fecha,60,142);
      ctx.textAlign='right';ctx.fillText('Página '+(pg+1)+' de '+pages,W-60,142);
      const slice=list.slice(pg*per,pg*per+per);const imgs=await Promise.all(slice.map(p=>loadImg(photoOf(p))));
      const cw=(W-60*2-50)/2,ch=(Hh-190-60-50)/2;
      slice.forEach((p,i)=>{const col=i%2,row=Math.floor(i/2);drawProduct(ctx,p,b,imgs[i],60+col*(cw+50),190+row*(ch+50),cw,ch)});
      if(pg>0)pdf.addPage([W,Hh],'portrait');
      pdf.addImage(c.toDataURL('image/jpeg',.78),'JPEG',0,0,W,Hh);
      if(pg%3===2||pg===pages-1)toast('Página '+(pg+1)+' de '+pages+'…');
    }
    const blob=pdf.output('blob');
    await downloads.save({filename:'catalogo-dunno-'+b+'.pdf',data:blob});toast('Catálogo listo para enviar');
  }catch(e){if(e&&e.message==='script')toast('No se pudo cargar el generador de PDF. Intenta de nuevo.');else saveErr(e)}
  ui.busy=false;
}

// ---- modal ----
function openModal(html){const m=$('modal');m.innerHTML=`<div class="mbox">${html}</div>`;m.classList.add('on')}
function closeModal(){const m=$('modal');m.classList.remove('on');m.innerHTML='';render()}
$('modal').addEventListener('mousedown',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('modal').classList.contains('on'))closeModal()});

const lineRow=(v)=>`<div class="lrow"><input type="text" class="l-p" list="dl-prod" placeholder="Modelo · Marca · Categoría" value="${esc(v&&v.p||'')}"><input type="text" class="l-t" list="dl-talla" placeholder="Talla" value="${esc(v&&v.t||'')}"><input type="text" class="l-c" list="dl-color" placeholder="Color" value="${esc(v&&v.c||'')}"><input type="number" class="l-q" min="1" step="1" value="${v&&v.q||1}"><button class="btn sec sm" data-act="rm-line" aria-label="Quitar línea">×</button></div>`;
function openMov(tipo,dropId){
  const titles={ingreso:'Ingresar stock',transferencia:'Transferir entre sucursales',ajuste:'Ajustar stock'};
  const b0=ui.branch||'tarija';
  openModal(`<div class="mhead"><h2>${titles[tipo]}</h2><button class="btn sec sm" data-act="close">Cerrar</button></div>
  <div class="form-grid">
    ${tipo==='transferencia'?`<div class="fgroup"><span class="flabel">Sale de</span><select id="m-origen">${BR.map(b=>`<option value="${b.id}">${b.n}</option>`).join('')}</select></div><div class="fgroup"><span class="flabel">Llega a</span><select id="m-dest">${BR.map((b,i)=>`<option value="${b.id}" ${i===1?'selected':''}>${b.n}</option>`).join('')}</select></div>`:`<div class="fgroup"><span class="flabel">Sucursal</span><select id="m-dest">${BR.map(b=>`<option value="${b.id}" ${b.id===b0?'selected':''}>${b.n}</option>`).join('')}</select></div>`}
    ${tipo==='ingreso'?`<div class="fgroup"><span class="flabel">Drop (opcional)</span><select id="m-drop"><option value="">Sin drop</option>${S.drops.map(d=>`<option value="${esc(d.id)}" ${d.id===dropId?'selected':''}>${esc(d.nombre)}</option>`).join('')}</select></div>`:''}
    <div class="fgroup"><span class="flabel">${tipo==='ajuste'?'Motivo':'Nota (opcional)'}</span><input type="text" id="m-nota" placeholder="${tipo==='ajuste'?'Ej. conteo físico, prenda dañada':'Ej. pedido de proveedor'}"></div>
  </div>
  <div><div class="flabel" style="margin-bottom:6px">Prendas${tipo==='ajuste'?' (usa cantidad negativa para restar)':''}</div><div id="m-lines">${lineRow()}</div><div class="row"><button class="btn sec sm" data-act="add-line">+ Agregar línea</button><button class="btn sec sm" data-act="toggle-paste">Pegar desde Excel</button></div>
  <div id="m-paste" hidden style="margin-top:10px"><textarea id="m-paste-t" rows="5" placeholder="Una prenda por línea, columnas: Modelo, Talla, Color, Cantidad (separadas por tab, coma o punto y coma)"></textarea><div class="row" style="margin-top:6px"><button class="btn sm" data-act="do-paste">Agregar al listado</button></div><p class="err" id="m-paste-err"></p></div></div>
  <p class="err" id="m-err"></p>
  <div class="row" style="justify-content:flex-end"><button class="btn sec" data-act="close">Cancelar</button><button class="btn" data-act="save-mov" data-v="${tipo}">Guardar</button></div>`);
  $('modal').dataset.tipo=tipo;
}
function findProductByLabel(s){s=String(s||'').trim().toLowerCase();if(!s)return null;let f=null;S.products.forEach(p=>{if(plabel(p).toLowerCase()===s)f=p});return f}
function parsePaste(txt){
  const lines=[],errs=[];
  txt.split(/\r?\n/).forEach((ln,ix)=>{ln=ln.trim();if(!ln)return;const parts=ln.split(/\t|;|,/).map(x=>x.trim());if(parts.length<4){errs.push('Línea '+(ix+1)+': faltan columnas');return}
    const [m,t,c,q]=parts;if(/^modelo$/i.test(m)&&/talla/i.test(t))return;
    const qn=parseInt(q,10);if(!qn){errs.push('Línea '+(ix+1)+': cantidad inválida');return}
    const ml=m.toLowerCase();const found=[...S.products.values()].filter(p=>p.modelo.toLowerCase()===ml||plabel(p).toLowerCase()===ml);
    if(!found.length){errs.push('Línea '+(ix+1)+': no existe el modelo "'+m+'"');return}
    if(found.length>1){errs.push('Línea '+(ix+1)+': "'+m+'" existe en varias marcas, escribe Modelo · Marca · Categoría');return}
    lines.push({p:plabel(found[0]),t,c,q:qn})});
  return{lines,errs}
}
function saveMov(tipo){
  const err=$('m-err');err.textContent='';
  const rows=[...document.querySelectorAll('#m-lines .lrow')];const lines=[];
  for(const r of rows){const pl=r.querySelector('.l-p').value,t=normT(r.querySelector('.l-t').value),c=normC(r.querySelector('.l-c').value),q=parseInt(r.querySelector('.l-q').value,10);
    if(!pl&&!t&&!c&&!q)continue;const p=findProductByLabel(pl);
    if(!p){err.textContent='Elige el producto de la lista desplegable: "'+pl+'" no coincide con ninguno.';return}
    if(!t||!c){err.textContent='Falta talla o color en '+cap(p.modelo)+'.';return}
    if(!q||(tipo!=='ajuste'&&q<0)){err.textContent='Cantidad inválida en '+cap(p.modelo)+'.';return}
    lines.push({p:p.id,t,c,q})}
  if(!lines.length){err.textContent='Agrega al menos una prenda.';return}
  const dest=$('m-dest').value;const origen=tipo==='transferencia'?$('m-origen').value:null;
  if(tipo==='transferencia'){if(origen===dest){err.textContent='El origen y el destino deben ser distintos.';return}
    const need=new Map();lines.forEach(l=>{const k=BKEY(origen,l.p,l.t,l.c);need.set(k,(need.get(k)||0)+l.q)});
    for(const [k,q] of need){const r=stock.get(k);if(!r||r.q<q){const l=lines.find(x=>BKEY(origen,x.p,x.t,x.c)===k);err.textContent='No hay suficiente stock en '+BRM[origen].n+' de '+pname(l.p)+' '+l.t+' '+l.c+'.';return}}}
  const doc={tipo,ts:Date.now(),sucursal:dest,lines,nota:$('m-nota').value.trim(),by:myId||null};
  if(origen)doc.origen=origen;const dr=$('m-drop');if(dr&&dr.value)doc.dropId=dr.value;
  const btn=document.querySelector('[data-act="save-mov"]');btn.disabled=true;
  db.collection('entries').add(doc).then(()=>{toast('Movimiento guardado: '+sum(lines,l=>l.q)+' prendas');closeModal()}).catch(e=>{err.textContent='No se pudo guardar ('+(e.code||'error')+').';btn.disabled=false});
}
async function setCost(id,co){try{if(co>0)await db.doc('costs/'+id).set({costo:co});else await db.doc('costs/'+id).delete()}catch(e){console.error('costo',e)}}
function openProd(pid){
  const p=pid?prod(pid):null;
  ui.phm={items:(p&&p.fotos||[]).map(id=>({id,url:imgUrl(id)}))};
  openModal(`<div class="mhead"><h2>${p?'Editar producto':'Nuevo producto'}</h2><button class="btn sec sm" data-act="close">Cerrar</button></div>
  <div class="form-grid"><div class="fgroup"><span class="flabel">Modelo</span><input type="text" id="f-modelo" value="${esc(p?p.modelo:'')}"></div><div class="fgroup"><span class="flabel">Marca</span><input type="text" id="f-marca" list="dl-marca" value="${esc(p?p.marca:'')}"></div>
  <div class="fgroup"><span class="flabel">Categoría</span><input type="text" id="f-cat" list="dl-cat" value="${esc(p?p.categoria:'')}"></div><div class="fgroup"><span class="flabel">Corte</span><input type="text" id="f-corte" value="${esc(p?p.corte||'':'')}"></div>
  <div class="fgroup"><span class="flabel">Precio de venta (Bs)</span><input type="number" min="0" id="f-precio" value="${p?p.precio:''}"></div><div class="fgroup"><span class="flabel">Precio antes (Bs, si está en oferta)</span><input type="number" min="0" id="f-antes" value="${p&&p.precio_antes?p.precio_antes:''}"></div><div class="fgroup"><span class="flabel">Costo (Bs, opcional)</span><input type="number" min="0" id="f-costo" value="${p&&S.costs.get(p.id)?S.costs.get(p.id):''}"></div></div>
  ${assets?`<div><div class="flabel" style="margin-bottom:6px">Fotos</div><div id="phs-phm">${photoStrip('phm')}</div></div>`:''}
  <div class="fgroup"><span class="flabel">Descripción para la tienda (opcional)</span><textarea id="f-desc" rows="2">${esc(p&&p.descripcion||'')}</textarea></div>
  <label class="row sm" style="gap:6px"><input type="checkbox" id="f-dest" ${p&&p.destacado?'checked':''}> Destacar en la portada de la tienda</label>
  ${p?`<label class="row sm" style="gap:6px"><input type="checkbox" id="f-activo" ${p.activo===false?'':'checked'}> Activo (aparece en catálogo y ventas)</label>`:''}
  <p class="err" id="f-err"></p><div class="row" style="justify-content:flex-end"><button class="btn sec" data-act="close">Cancelar</button><button class="btn" data-act="save-prod" data-p="${esc(pid||'')}">Guardar</button></div>`);
}
async function saveProd(pid){
  const g=id=>$(id).value.trim();const err=$('f-err');
  const oldp=pid?prod(pid):null;
  const d=oldp?{...oldp}:{};delete d.id;
  Object.assign(d,{modelo:g('f-modelo').toUpperCase(),marca:g('f-marca').toUpperCase(),categoria:g('f-cat'),corte:g('f-corte'),precio:+g('f-precio'),activo:true});
  if(!d.modelo||!d.marca||!d.categoria){err.textContent='Modelo, marca y categoría son obligatorios.';return}
  if(!(d.precio>0)){err.textContent='Escribe el precio de venta.';return}
  const antes=+g('f-antes');if(antes>d.precio)d.precio_antes=antes;else delete d.precio_antes;
  const desc=g('f-desc');if(desc)d.descripcion=desc;else delete d.descripcion;
  d.destacado=!!$('f-dest').checked;if(!d.destacado)delete d.destacado;
  const co=+g('f-costo');const a=$('f-activo');if(a)d.activo=a.checked;
  const old=(oldp&&oldp.fotos)||[];
  try{
    if(assets){d.fotos=await uploadItems('phm');if(!d.fotos.length)delete d.fotos}
    const quitadas=old.filter(id=>!(d.fotos||[]).includes(id));
    if(d.fc){d.fc=d.fc.filter(x=>!quitadas.includes(x.f));if(!d.fc.length)delete d.fc}
    let newId=pid;if(pid)await db.doc('products/'+pid).set(d);else newId=(await db.collection('products').add(d)).id;
    await setCost(newId,co);
    if(assets)for(const id of quitadas){try{await assets.delete(id)}catch(e){}}
    toast('Producto guardado');closeModal()
  }catch(e){err.textContent='No se pudo guardar ('+(e.code||'error')+').'}
}
function openImportProd(){
  openModal(`<div class="mhead"><h2>Importar productos</h2><button class="btn sec sm" data-act="close">Cerrar</button></div><p class="muted sm" style="margin:0">Pega filas desde Excel con las columnas: Modelo, Marca, Categoría, Corte, Precio. Los modelos que ya existen con la misma marca y categoría se actualizan.</p><textarea id="i-t" rows="9"></textarea><p class="err" id="i-err"></p><div class="row" style="justify-content:flex-end"><button class="btn sec" data-act="close">Cancelar</button><button class="btn" data-act="do-import">Importar</button></div>`);
}
async function doImport(){
  const err=$('i-err');const rows=$('i-t').value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);const out=[];
  for(const [ix,l] of rows.entries()){const c=l.split(/\t|;/).map(x=>x.trim());if(c.length<5){err.textContent='Línea '+(ix+1)+': se necesitan 5 columnas.';return}if(/^modelo$/i.test(c[0]))continue;const pr=+c[4].replace(',','.');if(!(pr>0)){err.textContent='Línea '+(ix+1)+': precio inválido.';return}out.push({modelo:c[0].toUpperCase(),marca:c[1].toUpperCase(),categoria:c[2],corte:c[3],precio:pr,activo:true})}
  if(!out.length){err.textContent='No hay filas para importar.';return}
  let n=0;try{for(const d of out){const ex=[...S.products.values()].find(p=>p.modelo===d.modelo&&p.marca===d.marca&&p.categoria.toLowerCase()===d.categoria.toLowerCase());if(ex){const {id:_i,...rest}=ex;await db.doc('products/'+ex.id).set({...rest,...d})}else await db.collection('products').add(d);n++}toast(n+' productos importados');closeModal()}catch(e){err.textContent='Se importaron '+n+' y falló uno ('+(e.code||'error')+').'}
}
function openDrop(){
  const t=dayKey(Date.now());
  openModal(`<div class="mhead"><h2>Nuevo drop</h2><button class="btn sec sm" data-act="close">Cerrar</button></div><div class="form-grid"><div class="fgroup"><span class="flabel">Nombre</span><input type="text" id="d-n" placeholder="Ej. Invierno 2026"></div><div class="fgroup"><span class="flabel">Fecha de lanzamiento</span><input type="date" id="d-f" value="${t}"></div></div><div class="fgroup"><span class="flabel">Notas (opcional)</span><textarea id="d-notas" rows="3"></textarea></div><p class="err" id="d-err"></p><div class="row" style="justify-content:flex-end"><button class="btn sec" data-act="close">Cancelar</button><button class="btn" data-act="save-drop">Crear drop</button></div>`);
}

// ---- events ----
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]');if(!el)return;const a=el.dataset.act;
  switch(a){
    case 'tab':ui.tab=el.dataset.v;ui.q='';ui.confirm=null;render();break;
    case 'set':ui[el.dataset.k]=el.dataset.v;if(el.dataset.k==='branch'&&ui.cart.length){ui.cart=[];toast('Cambiaste de sucursal: se vació el carrito')}render();break;
    case 'close':closeModal();break;
    case 'pick':openPicker(el.dataset.p);break;
    case 'addv':{const b=curBranch();const p=prod(el.dataset.p);const t=el.dataset.t,c=el.dataset.c;const ex=ui.cart.find(i=>i.p===p.id&&i.t===t&&i.c===c);const have=ex?ex.q:0;if(avail(b,p.id,t,c)<=have)break;if(ex)ex.q++;else ui.cart.push({p:p.id,t,c,q:1,pr:p.precio});openPicker(p.id);rerenderCart();break}
    case 'qty':{const i=ui.cart[+el.dataset.i];if(!i)break;const d=+el.dataset.d;if(d>0&&avail(curBranch(),i.p,i.t,i.c)<=i.q){toast('No hay más stock de esa variante');break}i.q+=d;if(i.q<=0)ui.cart.splice(+el.dataset.i,1);rerenderCart();break}
    case 'clear-cart':ui.cart=[];ui.disc=0;rerenderCart();break;
    case 'pay':if(el.dataset.v==='mix'){ui.mixed=true}else{ui.mixed=false;ui.pay=el.dataset.v}rerenderCart();break;
    case 'sell':sell();break;
    case 'expand':ui.expanded[el.dataset.p]=!ui.expanded[el.dataset.p];render();break;
    case 'mov':openMov(el.dataset.v,el.dataset.drop);break;
    case 'add-line':{const l=$('m-lines');const last=l.lastElementChild;const prev=last?last.querySelector('.l-p').value:'';l.insertAdjacentHTML('beforeend',lineRow({p:prev,q:1}));break}
    case 'rm-line':{const l=$('m-lines');if(l.children.length>1)el.closest('.lrow').remove();else el.closest('.lrow').querySelectorAll('input').forEach(i=>i.value=i.type==='number'?1:'');break}
    case 'toggle-paste':$('m-paste').hidden=!$('m-paste').hidden;break;
    case 'do-paste':{const {lines,errs}=parsePaste($('m-paste-t').value);const l=$('m-lines');if([...l.children].length===1&&!l.querySelector('.l-p').value)l.innerHTML='';lines.forEach(x=>l.insertAdjacentHTML('beforeend',lineRow(x)));$('m-paste-err').textContent=errs.length?errs.slice(0,5).join(' · ')+(errs.length>5?' · …':''):'';if(lines.length&&!errs.length){$('m-paste-t').value='';$('m-paste').hidden=true}break}
    case 'save-mov':saveMov(el.dataset.v);break;
    case 'new-drop':openDrop();break;
    case 'save-drop':{const n=$('d-n').value.trim();if(!n){$('d-err').textContent='Escribe el nombre del drop.';break}try{await db.collection('drops').add({nombre:n,fecha:$('d-f').value,notas:$('d-notas').value.trim(),ts:Date.now()});toast('Drop creado');closeModal()}catch(er){$('d-err').textContent='No se pudo guardar.'}break}
    case 'edit-prod':openProd(el.dataset.p);break;
    case 'save-prod':saveProd(el.dataset.p);break;
    case 'perfil-activo':{const p=S.perfiles.find(x=>x.id===el.dataset.id);if(p){try{await Store.updatePerfil(p.id,{activo:!p.activo});toast(p.activo?'Usuario desactivado':'Usuario activado');loadPerfiles()}catch(er){toast('No se pudo guardar')}}break}
    case 'copy-public':{const u=new URL('catalogo.html?s='+curBranch(),location.href).href;try{await navigator.clipboard.writeText(u);toast('Enlace copiado: '+u)}catch(er){toast(u)}break}
    case 'logout':await Store.signOut();location.reload();break;
    case 'ped-filtro':ui.pf=el.dataset.v;render();break;
    case 'ped-open':abrirPedido(el.dataset.id);break;
    case 'ped-estado':{
      const k='p'+el.dataset.id+el.dataset.v;if(el.dataset.conf&&ui.confirm!==k){ui.confirm=k;el.textContent='¿Seguro? Toca otra vez';setTimeout(()=>{if(ui.confirm===k)ui.confirm=null},4000);break}
      ui.confirm=null;el.disabled=true;
      try{await Store.pedidoEstado(el.dataset.id,el.dataset.v);toast('Pedido actualizado');closeModal();refreshStock()}catch(er){el.disabled=false;toast(er.message||'No se pudo cambiar el estado')}break}
    case 'tienda-guardar':guardarTienda();break;
    case 'promo-add':{const cod=($('p-cod').value||'').trim().toUpperCase().replace(/\s+/g,'');const val=+$('p-val').value;if(!cod||!(val>0)){toast('Escribe el código y su valor');break}
      if($('p-tipo').value==='pct'&&val>100){toast('El porcentaje no puede pasar de 100');break}
      const d={codigo:cod,tipo:$('p-tipo').value,valor:val,minimo:+$('p-min').value||0,activo:true};if($('p-vence').value)d.vence=$('p-vence').value;
      try{await db.collection('promos').add(d);toast('Código creado')}catch(er){toast('No se pudo crear')}break}
    case 'promo-toggle':{const x=S.promos.find(y=>y.id===el.dataset.id);if(x){const {id:_i,...rest}=x;try{await db.doc('promos/'+x.id).set({...rest,activo:x.activo===false})}catch(er){toast('No se pudo cambiar')}}break}
    case 'promo-del':{try{await db.doc('promos/'+el.dataset.id).delete();toast('Código borrado')}catch(er){toast('No se pudo borrar')}break}
    case 'import-prod':openImportProd();break;
    case 'do-import':doImport();break;
    case 'more-sales':ui.salesLimit+=60;render();break;
    case 'void':{const k='s'+el.dataset.id;if(ui.confirm!==k){ui.confirm=k;render();setTimeout(()=>{if(ui.confirm===k){ui.confirm=null;render()}},4000);break}ui.confirm=null;try{await db.doc('sales/'+el.dataset.id).update({anulada:true,anuladaPor:myId||null,anuladaTs:Date.now()});toast('Venta anulada')}catch(er){toast('No se pudo anular')}break}
    case 'del-entry':{const k='e'+el.dataset.id;if(ui.confirm!==k){ui.confirm=k;render();setTimeout(()=>{if(ui.confirm===k){ui.confirm=null;render()}},4000);break}ui.confirm=null;try{await db.doc('entries/'+el.dataset.id).delete();toast('Movimiento borrado')}catch(er){toast('No se pudo borrar')}break}
  }
});
document.addEventListener('input',e=>{
  const t=e.target;if(t.dataset&&t.dataset.nf){ui.nf[t.dataset.nf]=t.value}
  if(t.dataset&&t.dataset.nfl){const l=ui.nf.lines[+t.dataset.i];if(l)l[t.dataset.nfl]=t.value}
});
document.addEventListener('change',async e=>{
  const fi=e.target.closest&&e.target.closest('[data-phkey]');
  if(fi){const k=fi.dataset.phkey;const files=[...fi.files];fi.value='';let n=0;
    for(const f of files){if(ui[k].items.length>=6)break;try{const blob=await compress(f);ui[k].items.push({blob,url:URL.createObjectURL(blob)});n++}catch(er){toast('No pude leer una de las fotos')}}
    refreshStrip(k);return}
  const el=e.target.closest('[data-act-change]')||(e.target.id==='t-qr'?e.target:null);if(!el)return;const a=el.dataset?el.dataset.actChange:'';
  if(a==='cat'){ui.cat=el.value;const b=curBranch();$('results').innerHTML=listHtml(b,ui.tab==='vender')}
  if(a==='marca'){ui.marca=el.value;$('results').innerHTML=listHtml(curBranch(),ui.tab==='vender')}
  if(a==='empty'){ui.showEmpty=el.checked;render()}
  if(el.id==='t-qr'&&el.files[0]){try{const blob=await compress(el.files[0]);const path=await Store.uploadPhoto(blob);await db.doc('settings/tienda').set({...(S.settings||{}),qr_foto:path});toast('QR guardado')}catch(er){toast('No se pudo subir el QR')}}
  if(a==='sel'){ui.sel[el.dataset.p]=el.checked;const n=Object.values(ui.sel).filter(Boolean).length;const c=$('selcount');if(c)c.textContent=n?n+' seleccionadas':'Se incluirán todas las que ves'}
  if(a==='perfil-suc'||a==='perfil-rol'){const id=el.dataset.id;try{await Store.updatePerfil(id,a==='perfil-suc'?{sucursal:el.value||null}:{rol:el.value});toast('Guardado');loadPerfiles()}catch(er){toast('No se pudo guardar')}}
});
document.addEventListener('focusout',()=>{setTimeout(()=>{if(pendingRender){pendingRender=false;render()}},0)});
render();
})();
