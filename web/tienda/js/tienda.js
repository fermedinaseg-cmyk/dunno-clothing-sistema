// Tienda online Dunno Clothing: catálogo, producto, carrito, compra y seguimiento.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, WHATSAPP } from '../../config.js';

// Acepta la dirección con o sin '/rest/v1/' al final: usamos solo el dominio
const BASE = (() => { try { return new URL(SUPABASE_URL).origin; } catch (e) { return SUPABASE_URL; } })();

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n || 0).toLocaleString('es-BO');
const money = (n) => 'Bs ' + fmt(n);
const cap = (s) => { s = String(s || ''); return s.charAt(0) + s.slice(1).toLowerCase(); };
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
};
const SS = {
  get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignorar */ } },
};
const SUCS = [
  { id: 'tarija', n: 'Tarija' },
  { id: 'cochabamba', n: 'Cochabamba' },
  { id: 'santacruz', n: 'Santa Cruz' },
];
const sucN = (id) => (SUCS.find((s) => s.id === id) || {}).n || id;

const configurado = !String(SUPABASE_URL).includes('TU-PROYECTO') && !String(SUPABASE_ANON_KEY).includes('PEGA');
const sb = configurado ? createClient(BASE, SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;
const foto = (p) => (!p ? '' : /^https?:/.test(p) ? p : `${BASE}/storage/v1/object/public/fotos/${p}`);

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A11 11 0 0 0 3.2 17.3L2 22l4.8-1.2A11 11 0 1 0 20.5 3.5Zm-8.5 17a9 9 0 0 1-4.6-1.3l-.3-.2-2.8.7.8-2.7-.2-.3A9 9 0 1 1 12 20.5Zm5-6.7c-.3-.1-1.6-.8-1.9-.9s-.5-.1-.7.1-.8.9-.9 1.1-.3.2-.6.1a7.4 7.4 0 0 1-3.7-3.2c-.3-.5.3-.5.8-1.5a.6.6 0 0 0 0-.5l-.9-2.1c-.2-.5-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.700 3.700 0 0 0-1.1 2.700 6.400 6.400 0 0 0 1.300 3.400 14.700 14.700 0 0 0 5.600 4.900c2.100.9 2.900.9 3.400.8a2.800 2.800 0 0 0 1.800-1.300 2.300 2.300 0 0 0 .2-1.300c-.1-.1-.3-.2-.6-.3Z"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2zM13 10h4l3 3v3h-7"/><circle cx="7" cy="17.500" r="1.800"/><circle cx="17" cy="17.500" r="1.800"/></svg>',
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9a3 3 0 0 0 5.300 2 3 3 0 0 0 5.400 0A3 3 0 0 0 20 9M10 20v-5h4v5"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
};

// ---------- estado ----------
const st = {
  suc: LS.get('dn_suc', null), aj: {}, items: [], byId: new Map(), listo: false,
  cart: [], fav: LS.get('dn_fav', []), promo: null, pagina: 1, pdp: null,
};
const DEF = {
  nombre: 'Dunno Clothing',
  anuncio: 'Retiro gratis en tienda · Delivery en tu ciudad · Envíos a todo Bolivia',
  hero: { titulo: 'Streetwear que se vive', texto: 'Poleras, hoddies, buzos y pantalones de las marcas que mueven la calle. Retira en Tarija, Cochabamba o Santa Cruz, o recíbelo en tu casa.', boton: 'Ver novedades' },
  pagos: { qr: true, transferencia: true, contraentrega: true, tienda: true },
  envio: { delivery: { tarija: 15, cochabamba: 15, santacruz: 20 }, gratis_desde: 0, nacional_texto: 'Enviamos por flota o encomienda a todo Bolivia. El costo del transporte lo pagas al recibir.' },
  hold_horas: 12,
  horarios: 'Lunes a sábado de 10:00 a 20:00',
  cambios_texto: 'Tienes 7 días para cambiar tu prenda por otra talla o color, con la etiqueta puesta y sin uso. Escríbenos por WhatsApp para coordinar.',
};
const aj = (k) => (st.aj && st.aj[k] != null && st.aj[k] !== '' ? st.aj[k] : DEF[k]);
const wapp = () => ((st.aj.whatsapp || {})[st.suc] || (WHATSAPP || {})[st.suc] || '').replace(/\D/g, '');
const waLink = (txt) => { const n = wapp(); return n ? `https://wa.me/${n}?text=${encodeURIComponent(txt)}` : ''; };

// ---------- datos ----------
async function cargarAjustes() {
  const { data } = await sb.rpc('tienda_ajustes');
  st.aj = data || {};
}
async function cargarCatalogo() {
  const { data, error } = await sb.rpc('tienda_catalogo', { p_sucursal: st.suc });
  if (error) throw error;
  st.items = data || [];
  st.byId = new Map(st.items.map((p) => [p.id, p]));
  st.listo = true;
}
const colores = (p) => [...new Set(p.variantes.map((v) => v.c))];
const tallasDe = (p, c) => [...new Set(p.variantes.filter((v) => !c || v.c === c).map((v) => v.t))]
  .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
const stockDe = (p, t, c) => { const v = p.variantes.find((x) => x.t === t && x.c === c); return v ? v.q : 0; };
const fcFoto = (p, c) => { const f = (p.fc || []).find((x) => x.c === c); return f ? f.f : null; };
function galeria(p, c) {
  const l = [];
  const add = (x) => { if (x && !l.includes(x)) l.push(x); };
  add(fcFoto(p, c));
  (p.fotos || []).forEach(add);
  (p.fc || []).forEach((x) => add(x.f));
  return l;
}
const portada = (p) => (p.fotos || [])[0] || ((p.fc || [])[0] || {}).f || '';
const enOferta = (p) => p.precio_antes && p.precio_antes > p.precio;
const pctOff = (p) => Math.round((1 - p.precio / p.precio_antes) * 100);
const ultimas = (p) => p.variantes.length && p.variantes.every((v) => v.q <= 2);

// ---------- carrito ----------
const cartKey = () => 'dn_cart_' + st.suc;
function cargarCarrito() { st.cart = LS.get(cartKey(), []); }
function guardarCarrito() { LS.set(cartKey(), st.cart); pintarBadge(); }
function lineas() {
  return st.cart.map((l) => {
    const p = st.byId.get(l.p);
    const disp = p ? stockDe(p, l.t, l.c) : 0;
    return { ...l, p: l.p, prod: p, disp, ok: !!p && disp > 0, precio: p ? p.precio : 0 };
  });
}
const subtotal = () => lineas().filter((l) => l.ok).reduce((a, l) => a + l.precio * Math.min(l.q, l.disp), 0);
const nItems = () => st.cart.reduce((a, l) => a + l.q, 0);
function agregar(pid, t, c, q) {
  const p = st.byId.get(pid);
  const disp = stockDe(p, t, c);
  const ex = st.cart.find((l) => l.p === pid && l.t === t && l.c === c);
  const nuevo = Math.min((ex ? ex.q : 0) + q, disp, 5);
  if (ex) ex.q = nuevo; else st.cart.push({ p: pid, t, c, q: nuevo });
  guardarCarrito();
}
function pintarBadge() { const b = $('#cbadge'); if (b) { b.textContent = nItems() || ''; b.dataset.n = nItems(); } }

// ---------- vistas ----------
const app = () => $('#app');
const toastEl = () => $('#toast');
let toastT;
function toast(m) { const t = toastEl(); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }

function cardHtml(p) {
  const c2 = (p.fotos || [])[1] || ((p.fc || [])[1] || {}).f;
  const tags = [
    enOferta(p) ? `<span class="tag hot">-${pctOff(p)}%</span>` : '',
    p.nuevo ? '<span class="tag">Nuevo</span>' : '',
    ultimas(p) ? '<span class="tag low">Últimas</span>' : '',
  ].join('');
  const cs = colores(p);
  return `<article class="card">
    <a class="pic" href="#/p/${esc(p.id)}" aria-label="${esc(cap(p.modelo))}">
      ${portada(p) ? `<img src="${esc(foto(portada(p)))}" alt="${esc(cap(p.modelo))}" loading="lazy" decoding="async">` : `<div class="ph">${esc(String(p.modelo).charAt(0))}</div>`}
      ${c2 && portada(p) ? `<img src="${esc(foto(c2))}" alt="" loading="lazy" decoding="async">` : ''}
    </a>
    <div class="tags">${tags}</div>
    <button class="fav" data-act="fav" data-p="${esc(p.id)}" aria-pressed="${st.fav.includes(p.id)}" aria-label="Guardar en favoritos">${ICON.heart}</button>
    <a class="nm" href="#/p/${esc(p.id)}">${esc(cap(p.modelo))}</a>
    <div class="mt">${esc(cap(p.marca))} · ${esc(p.categoria)}</div>
    <div class="pr"><span>${money(p.precio)}</span>${enOferta(p) ? `<s>${money(p.precio_antes)}</s>` : ''}</div>
    <div class="dots"><i>${cs.length} color${cs.length === 1 ? '' : 'es'}</i></div>
  </article>`;
}

function vistaHome() {
  const nov = [...st.items].sort((a, b) => String(b.creado).localeCompare(String(a.creado))).filter((p) => portada(p)).slice(0, 12);
  const dest = st.items.filter((p) => p.destacado && portada(p)).slice(0, 12);
  const hero = aj('hero') || DEF.hero;
  const heroFoto = (st.aj.hero && st.aj.hero.foto) || (dest[0] || nov[0] ? portada(dest[0] || nov[0]) : '');
  const cats = [...new Set(st.items.map((p) => p.categoria))].map((c) => {
    const ps = st.items.filter((p) => p.categoria === c && portada(p));
    return { c, n: st.items.filter((p) => p.categoria === c).length, img: ps[0] ? portada(ps[0]) : '' };
  }).sort((a, b) => b.n - a.n);
  const marcas = [...new Set(st.items.map((p) => p.marca))];
  return `
  <section class="hero">
    <div class="hero-t">
      <span class="muted">${esc(sucN(st.suc))} · ${st.items.length} prendas disponibles hoy</span>
      <h1>${esc(hero.titulo || DEF.hero.titulo)}</h1>
      <p>${esc(hero.texto || DEF.hero.texto)}</p>
      <div><a class="btn acc" href="#/tienda?o=nuevo">${esc(hero.boton || DEF.hero.boton)}</a> <a class="btn ghost" href="#/tienda">Ver todo</a></div>
    </div>
    <div class="hero-i">${heroFoto ? `<img src="${esc(foto(heroFoto))}" alt="" fetchpriority="high">` : ''}</div>
  </section>
  <div class="wrap">
    <div class="sec" style="padding-bottom:0"><div class="trust">
      <div>${ICON.store}<p style="margin:0"><b>Retiro gratis</b><span>En nuestras 3 sucursales</span></p></div>
      <div>${ICON.truck}<p style="margin:0"><b>Delivery y envíos</b><span>En tu ciudad y a todo Bolivia</span></p></div>
      <div>${ICON.qr}<p style="margin:0"><b>Paga con QR</b><span>Transferencia o contra entrega</span></p></div>
      <div>${ICON.swap}<p style="margin:0"><b>Cambios fáciles</b><span>7 días para cambiar tu talla</span></p></div>
    </div></div>
    <section class="sec"><div class="sec-h"><h2>Compra por categoría</h2></div>
      <div class="cats">${cats.map((x) => `<a class="cat" href="#/tienda?cat=${encodeURIComponent(x.c)}">${x.img ? `<img src="${esc(foto(x.img))}" alt="" loading="lazy">` : ''}<span>${esc(x.c)}<small>${x.n} modelos</small></span></a>`).join('')}</div></section>
    ${nov.length ? `<section class="sec" style="padding-top:0"><div class="sec-h"><h2>Novedades</h2><a href="#/tienda?o=nuevo">Ver todas →</a></div><div class="row-scroll">${nov.map(cardHtml).join('')}</div></section>` : ''}
    ${dest.length ? `<section class="sec" style="padding-top:0"><div class="sec-h"><h2>Lo más pedido</h2><a href="#/tienda">Ver todo →</a></div><div class="row-scroll">${dest.map(cardHtml).join('')}</div></section>` : ''}
    <section class="sec" style="padding-top:0"><div class="sec-h"><h2>Nuestras marcas</h2></div><div class="brands">${marcas.map((m) => `<a href="#/tienda?marca=${encodeURIComponent(m)}">${esc(m)}</a>`).join('')}</div></section>
  </div>`;
}

// --- Catálogo con filtros ---
function leerFiltros(qs) {
  const p = new URLSearchParams(qs || '');
  return { cat: p.get('cat') || '', marca: p.get('marca') || '', t: p.get('t') || '', c: p.get('c') || '', q: p.get('q') || '', o: p.get('o') || 'nuevo', min: p.get('min') || '', max: p.get('max') || '', oferta: p.get('oferta') === '1' };
}
function urlFiltros(f) {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v && !(k === 'o' && v === 'nuevo')) p.set(k, v === true ? '1' : v); });
  const s = p.toString();
  return '#/tienda' + (s ? '?' + s : '');
}
function filtrar(f) {
  const q = f.q.trim().toLowerCase();
  let l = st.items.filter((p) =>
    (!f.cat || p.categoria === f.cat) && (!f.marca || p.marca === f.marca) &&
    (!f.t || p.variantes.some((v) => v.t === f.t && (!f.c || v.c === f.c))) &&
    (!f.c || p.variantes.some((v) => v.c === f.c)) &&
    (!f.min || p.precio >= +f.min) && (!f.max || p.precio <= +f.max) &&
    (!f.oferta || enOferta(p)) &&
    (!q || (p.modelo + ' ' + p.marca + ' ' + p.categoria + ' ' + (p.corte || '')).toLowerCase().includes(q)));
  const o = f.o;
  if (o === 'precio-asc') l.sort((a, b) => a.precio - b.precio);
  else if (o === 'precio-desc') l.sort((a, b) => b.precio - a.precio);
  else if (o === 'nombre') l.sort((a, b) => a.modelo.localeCompare(b.modelo));
  else l.sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
  return l;
}
function vistaTienda(qs) {
  const f = leerFiltros(qs);
  const todas = st.items;
  const lista = filtrar(f);
  const mostrar = lista.slice(0, st.pagina * 24);
  const cats = [...new Set(todas.map((p) => p.categoria))];
  const marcas = [...new Set(todas.map((p) => p.marca))];
  const tallas = [...new Set(todas.flatMap((p) => p.variantes.map((v) => v.t)))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const cols = [...new Set(todas.flatMap((p) => p.variantes.map((v) => v.c)))].sort();
  const chips = (arr, k, cur) => arr.map((x) => `<button class="chip" aria-pressed="${cur === x}" data-act="filtro" data-k="${k}" data-v="${esc(x)}">${esc(x)}</button>`).join('');
  return `<div class="wrap">
    <div class="page-h"><div class="crumbs"><a href="#/">Inicio</a> / Tienda</div><h1>${esc(f.cat || (f.marca ? cap(f.marca) : f.oferta ? 'Ofertas' : 'Todo'))}</h1></div>
    <div class="shop">
      <aside class="filters" id="filters" aria-label="Filtros">
        <div><h3>Categoría</h3><div class="fl">${chips(cats, 'cat', f.cat)}</div></div>
        <div><h3>Marca</h3><div class="fl">${chips(marcas, 'marca', f.marca)}</div></div>
        <div><h3>Talla</h3><div class="fl">${chips(tallas, 't', f.t)}</div></div>
        <div><h3>Color</h3><div class="fl">${chips(cols, 'c', f.c)}</div></div>
        <div><h3>Precio (Bs)</h3><div class="price-r"><input type="number" min="0" inputmode="numeric" placeholder="Mín" id="pmin" value="${esc(f.min)}" aria-label="Precio mínimo"><span>–</span><input type="number" min="0" inputmode="numeric" placeholder="Máx" id="pmax" value="${esc(f.max)}" aria-label="Precio máximo"></div></div>
        <div><button class="chip" aria-pressed="${f.oferta}" data-act="filtro" data-k="oferta" data-v="${f.oferta ? '' : '1'}">Solo ofertas</button></div>
        <div><a href="#/tienda" class="btn ghost sm">Quitar filtros</a></div>
      </aside>
      <div>
        <div class="tools">
          <button class="btn ghost sm fbtn" data-act="filtros-toggle">Filtros</button>
          <span class="muted" aria-live="polite">${lista.length} prenda${lista.length === 1 ? '' : 's'}</span>
          <label><span class="sr">Ordenar por</span><select id="orden">
            <option value="nuevo" ${f.o === 'nuevo' ? 'selected' : ''}>Novedades</option>
            <option value="precio-asc" ${f.o === 'precio-asc' ? 'selected' : ''}>Precio: menor a mayor</option>
            <option value="precio-desc" ${f.o === 'precio-desc' ? 'selected' : ''}>Precio: mayor a menor</option>
            <option value="nombre" ${f.o === 'nombre' ? 'selected' : ''}>Nombre</option></select></label>
        </div>
        ${lista.length ? `<div class="grid">${mostrar.map(cardHtml).join('')}</div>
          ${mostrar.length < lista.length ? `<p style="text-align:center;margin-top:28px"><button class="btn ghost" data-act="mas">Ver más (${lista.length - mostrar.length})</button></p>` : ''}`
    : `<div class="empty"><h2>No encontramos prendas</h2><p>Prueba quitando algún filtro o escribe a nuestro WhatsApp y te ayudamos.</p><a class="btn" href="#/tienda">Ver todo</a></div>`}
      </div>
    </div></div>`;
}

// --- Producto ---
function vistaProducto(id) {
  const p = st.byId.get(id);
  if (!p) return `<div class="wrap"><div class="empty"><h2>Esta prenda ya no está disponible</h2><p>Se agotó o ya no se vende en ${esc(sucN(st.suc))}.</p><a class="btn" href="#/tienda">Ver la tienda</a></div></div>`;
  const cs = colores(p);
  if (!st.pdp || st.pdp.id !== id) st.pdp = { id, c: cs.length === 1 ? cs[0] : '', t: '', q: 1, img: 0 };
  document.title = `${cap(p.modelo)} · ${cap(p.marca)} | Dunno Clothing`;
  const rel = st.items.filter((x) => x.categoria === p.categoria && x.id !== p.id && portada(x)).slice(0, 8);
  return `<div class="wrap">
    <div class="crumbs" style="padding-top:16px"><a href="#/">Inicio</a> / <a href="#/tienda?cat=${encodeURIComponent(p.categoria)}">${esc(p.categoria)}</a> / ${esc(cap(p.modelo))}</div>
    <div id="pdp" class="pdp"></div>
    ${rel.length ? `<section class="sec" style="padding-top:10px"><div class="sec-h"><h2>También te puede gustar</h2></div><div class="row-scroll">${rel.map(cardHtml).join('')}</div></section>` : ''}
  </div>`;
}
function pintarPdp() {
  const box = $('#pdp'); if (!box || !st.pdp) return;
  const p = st.byId.get(st.pdp.id); const s = st.pdp;
  const cs = colores(p);
  const gal = galeria(p, s.c);
  if (s.img >= gal.length) s.img = 0;
  const tallas = tallasDe(p, s.c);
  const todasTallas = tallasDe(p, '');
  const disp = s.t && s.c ? stockDe(p, s.t, s.c) : 0;
  const max = Math.min(disp, 5);
  if (s.q > max && max > 0) s.q = max;
  const msgStock = s.t && s.c ? (disp <= 2 ? `<p class="hint low">¡Solo ${disp === 1 ? 'queda 1 unidad' : 'quedan ' + disp + ' unidades'}!</p>` : '<p class="hint">Disponible para compra inmediata</p>') : '<p class="hint">Elige color y talla</p>';
  const wa = waLink(`Hola, me interesa ${cap(p.modelo)} (${cap(p.marca)})${s.t ? ', talla ' + s.t : ''}${s.c ? ', color ' + s.c : ''}. ¿Está disponible en ${sucN(st.suc)}?`);
  const hold = aj('hold_horas');
  box.innerHTML = `
    <div class="gal">
      <div class="thumbs">${gal.map((g, i) => `<button data-act="img" data-i="${i}" aria-current="${i === s.img}" aria-label="Foto ${i + 1}"><img src="${esc(foto(g))}" alt="" loading="lazy"></button>`).join('')}</div>
      <div class="main">${gal[s.img] ? `<img src="${esc(foto(gal[s.img]))}" alt="${esc(cap(p.modelo))}">` : `<div class="ph">${esc(String(p.modelo).charAt(0))}</div>`}
        <div class="tags">${enOferta(p) ? `<span class="tag hot">-${pctOff(p)}%</span>` : ''}${p.nuevo ? '<span class="tag">Nuevo</span>' : ''}</div></div>
    </div>
    <div class="info">
      <div><span class="muted">${esc(cap(p.marca))} · ${esc(p.categoria)}${p.corte ? ' · ' + esc(p.corte) : ''}</span><h1>${esc(cap(p.modelo))}</h1></div>
      <div class="pr"><span>${money(p.precio)}</span>${enOferta(p) ? `<s>${money(p.precio_antes)}</s><span class="off">-${pctOff(p)}%</span>` : ''}</div>
      <div><div class="lbl"><span>Color${s.c ? ': ' + esc(s.c) : ''}</span></div>
        <div class="sw">${cs.map((c) => { const f = fcFoto(p, c); return `<button class="cw" aria-pressed="${s.c === c}" data-act="color" data-v="${esc(c)}">${f ? `<img src="${esc(foto(f))}" alt="">` : ''}${esc(c)}</button>`; }).join('')}</div></div>
      <div><div class="lbl"><span>Talla${s.t ? ': ' + esc(s.t) : ''}</span><a href="#guia" data-act="guia" style="font-weight:500">Guía de tallas</a></div>
        <div class="sw">${todasTallas.map((t) => { const ok = s.c ? tallas.includes(t) : true; return `<button aria-pressed="${s.t === t}" data-act="talla" data-v="${esc(t)}" ${ok ? '' : 'disabled'}>${esc(t)}</button>`; }).join('')}</div>
        ${msgStock}</div>
      <div class="buy">
        <div class="qty" role="group" aria-label="Cantidad"><button data-act="qmenos" aria-label="Menos">−</button><span class="num">${s.q}</span><button data-act="qmas" aria-label="Más">+</button></div>
        <button class="btn acc" data-act="comprar" ${disp ? '' : 'data-need="1"'}>Agregar al carrito</button>
      </div>
      <div class="buy">${wa ? `<a class="btn wa block" target="_blank" rel="noopener" href="${esc(wa)}">${ICON.wa.replace('<svg', '<svg width="20" height="20"')} Consultar por WhatsApp</a>` : ''}<button class="btn ghost" data-act="compartir">Compartir</button><button class="btn ghost" data-act="fav" data-p="${esc(p.id)}" aria-pressed="${st.fav.includes(p.id)}">${st.fav.includes(p.id) ? '♥ Guardado' : '♡ Guardar'}</button></div>
      <div class="acc-d">
        ${p.descripcion ? `<details open><summary>Descripción</summary><div class="b">${esc(p.descripcion)}</div></details>` : ''}
        <details><summary>Retiro y envíos</summary><div class="b">Retiro gratis en ${esc(sucN(st.suc))}. Delivery en la ciudad desde ${money(((aj('envio') || {}).delivery || {})[st.suc] || 0)}. ${esc((aj('envio') || {}).nacional_texto || '')} Tu pedido queda reservado ${hold} horas mientras pagas.</div></details>
        <details><summary>Cambios</summary><div class="b">${esc(aj('cambios_texto'))}</div></details>
        <details id="guia"><summary>Guía de tallas</summary><div class="b">Medidas aproximadas en cm. Las prendas oversize quedan holgadas: si prefieres un calce más ajustado, elige una talla menos.
          <table class="sz" style="margin-top:8px"><tr><th>Talla</th><th>Pecho</th><th>Largo</th></tr><tr><td>S</td><td>54</td><td>68</td></tr><tr><td>M</td><td>57</td><td>70</td></tr><tr><td>L</td><td>60</td><td>72</td></tr><tr><td>XL</td><td>63</td><td>74</td></tr></table></div></details>
      </div>
    </div>`;
  const ld = $('#ld');
  if (ld) ld.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product', name: cap(p.modelo), brand: cap(p.marca), category: p.categoria,
    image: gal.map(foto), offers: { '@type': 'Offer', priceCurrency: 'BOB', price: p.precio, availability: 'https://schema.org/InStock', url: location.href },
  });
}

// --- Favoritos ---
function vistaFavoritos() {
  const l = st.fav.map((id) => st.byId.get(id)).filter(Boolean);
  return `<div class="wrap"><div class="page-h"><h1>Favoritos</h1></div>${l.length ? `<div class="grid" style="padding-bottom:50px">${l.map(cardHtml).join('')}</div>` : '<div class="empty"><h2>Aún no guardas nada</h2><p>Toca el corazón en cualquier prenda para guardarla aquí.</p><a class="btn" href="#/tienda">Ver la tienda</a></div>'}</div>`;
}

// --- Carrito (cajón) ---
function pintarCajon() {
  const ls = lineas();
  const sub = subtotal();
  const gratis = (aj('envio') || {}).gratis_desde || 0;
  const body = $('#dr-b'); const foot = $('#dr-f');
  if (!ls.length) {
    body.innerHTML = `<div class="empty"><h2>Tu carrito está vacío</h2><p>Agrega algo que te guste.</p><a class="btn" href="#/tienda" data-act="cerrar">Ver la tienda</a></div>`;
    foot.innerHTML = '';
    return;
  }
  body.innerHTML = ls.map((l, i) => {
    const p = l.prod; const f = p ? (fcFoto(p, l.c) || portada(p)) : '';
    return `<div class="line">
      ${f ? `<img src="${esc(foto(f))}" alt="">` : '<div class="ph">?</div>'}
      <div><div class="nm">${p ? esc(cap(p.modelo)) : 'Prenda no disponible'}</div>
        <div class="muted" style="font-size:13px">Talla ${esc(l.t)} · ${esc(l.c)}</div>
        ${l.ok ? `<div class="qty"><button data-act="cq" data-i="${i}" data-d="-1" aria-label="Menos">−</button><span class="num">${Math.min(l.q, l.disp)}</span><button data-act="cq" data-i="${i}" data-d="1" aria-label="Más">+</button></div>` : '<div class="msg err">Se agotó. Quítala para continuar.</div>'}
        <button class="rm" data-act="crm" data-i="${i}">Quitar</button></div>
      <div style="font-weight:700">${l.ok ? money(l.precio * Math.min(l.q, l.disp)) : ''}</div></div>`;
  }).join('');
  const falta = gratis > 0 ? Math.max(0, gratis - sub) : 0;
  const hayInvalidas = ls.some((l) => !l.ok);
  foot.innerHTML = `
    ${gratis > 0 ? `<div><div class="prog"><i style="width:${Math.min(100, sub / gratis * 100)}%"></i></div><p class="hint" style="margin:6px 0 0">${falta > 0 ? `Te faltan ${money(falta)} para delivery gratis` : '¡Tienes delivery gratis!'}</p></div>` : ''}
    <div class="tot big"><span>Subtotal</span><span class="num">${money(sub)}</span></div>
    <p class="hint" style="margin:0">El envío y los descuentos se calculan al finalizar.</p>
    <a class="btn acc block" href="#/checkout" data-act="cerrar" ${hayInvalidas || !sub ? 'aria-disabled="true" style="opacity:.4;pointer-events:none"' : ''}>Finalizar compra</a>`;
}
function abrirCajon() { pintarCajon(); $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); }
function cerrarCajon() { $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); }

// --- Checkout ---
const coDef = () => ({ nombre: '', telefono: '', email: '', tipo: 'retiro', direccion: '', ciudad: '', referencia: '', metodo: '', nota: '', promo: '' });
let co = SS.get('dn_co', null) || coDef();
function costoEnvio(sub, desc) {
  if (co.tipo !== 'delivery') return 0;
  const e = aj('envio') || {};
  const base = (e.delivery || {})[st.suc] || 0;
  return e.gratis_desde > 0 && sub - desc >= e.gratis_desde ? 0 : base;
}
function metodosDisponibles() {
  const pg = Object.assign({}, DEF.pagos, aj('pagos') || {});
  const m = [];
  if (pg.qr) m.push({ id: 'qr', t: 'Pago con QR', d: 'Escanea el QR desde la app de tu banco y envía tu comprobante.' });
  if (pg.transferencia) m.push({ id: 'transferencia', t: 'Transferencia bancaria', d: 'Te mostramos nuestra cuenta al confirmar el pedido.' });
  if (pg.contraentrega && co.tipo === 'delivery') m.push({ id: 'contraentrega', t: 'Pago contra entrega', d: 'Pagas en efectivo cuando recibes tu pedido.' });
  if (pg.tienda && co.tipo === 'retiro') m.push({ id: 'tienda', t: 'Pagar en tienda', d: `Pagas al retirar en ${sucN(st.suc)}. Guardamos tu pedido ${aj('hold_horas')} horas.` });
  return m;
}
function vistaCheckout() {
  const ls = lineas();
  if (!ls.length) return `<div class="wrap"><div class="empty"><h2>Tu carrito está vacío</h2><a class="btn" href="#/tienda">Ver la tienda</a></div></div>`;
  const ms = metodosDisponibles();
  if (!ms.some((m) => m.id === co.metodo)) co.metodo = ms[0] ? ms[0].id : '';
  const e = aj('envio') || {};
  const dir = ((st.aj.direcciones || {})[st.suc]) || '';
  const sub = subtotal(); const desc = st.promo ? st.promo.descuento : 0;
  const env = costoEnvio(sub, desc);
  return `<div class="wrap"><form class="co" id="coform" novalidate>
    <div><h1>Finalizar compra</h1>
      <div id="coerr"></div>
      <div class="fs"><h2>1. Tus datos</h2>
        <div class="fld"><label for="c-nombre">Nombre completo</label><input id="c-nombre" data-co="nombre" autocomplete="name" value="${esc(co.nombre)}" required></div>
        <div class="f2"><div class="fld"><label for="c-tel">Celular (WhatsApp)</label><input id="c-tel" data-co="telefono" type="tel" inputmode="tel" autocomplete="tel" placeholder="71234567" value="${esc(co.telefono)}" required></div>
        <div class="fld"><label for="c-mail">Correo (opcional)</label><input id="c-mail" data-co="email" type="email" autocomplete="email" value="${esc(co.email)}"></div></div></div>
      <div class="fs"><h2>2. Cómo lo recibes</h2>
        <label class="opt"><input type="radio" name="tipo" data-co="tipo" value="retiro" ${co.tipo === 'retiro' ? 'checked' : ''}><span><b>Retiro en ${esc(sucN(st.suc))}</b><small>${esc(dir || 'Te avisamos por WhatsApp cuando esté listo.')}</small></span><span class="pp">Gratis</span></label>
        <label class="opt"><input type="radio" name="tipo" data-co="tipo" value="delivery" ${co.tipo === 'delivery' ? 'checked' : ''}><span><b>Delivery en ${esc(sucN(st.suc))}</b><small>${e.gratis_desde > 0 ? `Gratis desde ${money(e.gratis_desde)}` : 'A tu casa u oficina'}</small></span><span class="pp">${env ? money(env) : (co.tipo === 'delivery' ? 'Gratis' : money(((e.delivery || {})[st.suc]) || 0))}</span></label>
        <label class="opt"><input type="radio" name="tipo" data-co="tipo" value="nacional" ${co.tipo === 'nacional' ? 'checked' : ''}><span><b>Envío a otra ciudad de Bolivia</b><small>${esc(e.nacional_texto || DEF.envio.nacional_texto)}</small></span><span class="pp">A coordinar</span></label>
        ${co.tipo !== 'retiro' ? `<div style="margin-top:12px"><div class="fld"><label for="c-dir">Dirección completa</label><input id="c-dir" data-co="direccion" autocomplete="street-address" value="${esc(co.direccion)}" required></div>
          <div class="f2"><div class="fld"><label for="c-ciu">${co.tipo === 'nacional' ? 'Ciudad de destino' : 'Zona / barrio'}</label><input id="c-ciu" data-co="ciudad" value="${esc(co.ciudad)}"></div>
          <div class="fld"><label for="c-ref">Referencia (opcional)</label><input id="c-ref" data-co="referencia" placeholder="Frente a… / color de la casa" value="${esc(co.referencia)}"></div></div></div>` : ''}</div>
      <div class="fs"><h2>3. Cómo pagas</h2>
        ${ms.map((m) => `<label class="opt"><input type="radio" name="metodo" data-co="metodo" value="${m.id}" ${co.metodo === m.id ? 'checked' : ''}><span><b>${m.t}</b><small>${m.d}</small></span></label>`).join('') || '<p class="muted">No hay métodos de pago activos. Escríbenos por WhatsApp.</p>'}
        <div class="fld" style="margin-top:12px"><label for="c-nota">Nota para tu pedido (opcional)</label><textarea id="c-nota" data-co="nota" rows="2" maxlength="300">${esc(co.nota)}</textarea></div></div>
    </div>
    <aside class="sum"><h2>Tu pedido</h2>
      ${ls.map((l) => { const p = l.prod; const f = p ? (fcFoto(p, l.c) || portada(p)) : ''; return `<div class="sl">${f ? `<img src="${esc(foto(f))}" alt="">` : '<div class="ph">?</div>'}<div>${p ? esc(cap(p.modelo)) : '—'}<div class="muted" style="font-size:12.5px">${esc(l.t)} · ${esc(l.c)} · x${Math.min(l.q, l.disp)}</div></div><b>${l.ok ? money(l.precio * Math.min(l.q, l.disp)) : ''}</b></div>`; }).join('')}
      <div class="promo" style="margin:12px 0"><input id="c-promo" placeholder="Código de descuento" value="${esc(co.promo)}" aria-label="Código de descuento"><button class="btn ghost sm" type="button" data-act="promo">Aplicar</button></div>
      <div id="promomsg" class="msg">${st.promo ? `<span class="ok">Código ${esc(st.promo.codigo)} aplicado: -${money(st.promo.descuento)}</span>` : ''}</div>
      <div class="tot" style="margin-top:10px"><span>Subtotal</span><span class="num">${money(sub)}</span></div>
      ${desc ? `<div class="tot"><span>Descuento</span><span class="num">-${money(desc)}</span></div>` : ''}
      <div class="tot"><span>Envío</span><span class="num">${co.tipo === 'nacional' ? 'A coordinar' : env ? money(env) : 'Gratis'}</span></div>
      <div class="tot big" style="margin-top:8px"><span>Total</span><span class="num">${money(sub - desc + env)}</span></div>
      <button class="btn acc block" type="submit" id="cogo" style="margin-top:16px" ${ms.length ? '' : 'disabled'}>Confirmar pedido</button>
      <p class="hint" style="margin-top:10px">Al confirmar reservamos tus prendas por ${aj('hold_horas')} horas mientras haces el pago.</p>
    </aside></form></div>`;
}
async function confirmarPedido() {
  const err = $('#coerr'); err.innerHTML = '';
  const btn = $('#cogo'); btn.disabled = true; btn.textContent = 'Enviando…';
  const items = lineas().filter((l) => l.ok).map((l) => ({ p: l.p, t: l.t, c: l.c, q: Math.min(l.q, l.disp) }));
  const { data, error } = await sb.rpc('crear_pedido', {
    p_sucursal: st.suc, p_items: items,
    p_cliente: { nombre: co.nombre, telefono: co.telefono, email: co.email },
    p_entrega: { tipo: co.tipo, direccion: co.direccion, ciudad: co.ciudad, referencia: co.referencia },
    p_metodo: co.metodo, p_promo: st.promo ? st.promo.codigo : null, p_nota: co.nota,
  });
  if (error) {
    err.innerHTML = `<div class="err-box" role="alert">${esc(error.message)}</div>`;
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    btn.disabled = false; btn.textContent = 'Confirmar pedido';
    cargarCatalogo().then(() => { if (location.hash.startsWith('#/checkout')) pintarCajon(); }).catch(() => {});
    return;
  }
  const tel = co.telefono;
  const mis = LS.get('dn_pedidos', []); mis.unshift({ codigo: data.codigo, tel, ts: Date.now() }); LS.set('dn_pedidos', mis.slice(0, 20));
  st.cart = []; guardarCarrito(); st.promo = null;
  co = Object.assign(coDef(), { nombre: co.nombre, telefono: co.telefono, email: co.email }); SS.set('dn_co', co);
  location.hash = '#/pedido/' + data.codigo;
}

// --- Pedido / seguimiento ---
const PASOS = [['pendiente', 'Recibido'], ['pagado', 'Pago confirmado'], ['preparando', 'Preparando'], ['enviado', 'Enviado'], ['entregado', 'Entregado']];
function comprimirImagen(file, max = 1600) {
  return createImageBitmap(file).then((bm) => {
    const sc = Math.min(1, max / Math.max(bm.width, bm.height));
    const c = document.createElement('canvas'); c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  });
}
let ordTimer = null;
async function vistaPedido(codigo) {
  clearInterval(ordTimer);
  const mis = LS.get('dn_pedidos', []);
  const tel = SS.get('dn_t_' + codigo, null) || (mis.find((x) => x.codigo === codigo) || {}).tel;
  if (!tel) return vistaBuscar(codigo);
  const { data: o } = await sb.rpc('consultar_pedido', { p_codigo: codigo, p_telefono: tel });
  if (!o) return vistaBuscar(codigo, 'No encontramos ese pedido con ese celular.');
  SS.set('dn_t_' + codigo, tel);
  ordTimer = setInterval(() => { if (location.hash.startsWith('#/pedido/') && !document.hidden) refrescarPedido(codigo, tel); }, 25000);
  return htmlPedido(o);
}
function htmlPedido(o) {
  const m = o.pago.metodo;
  const idx = PASOS.findIndex((p) => p[0] === o.estado);
  const cancelado = o.estado === 'cancelado';
  const vencido = o.estado === 'pendiente' && Date.now() > o.vence;
  const wa = ((st.aj.whatsapp || {})[o.sucursal] || (WHATSAPP || {})[o.sucursal] || '').replace(/\D/g, '');
  const waPed = (txt) => (wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hola, soy el cliente del pedido ${o.codigo} por ${money(o.total)}. ${txt}`)}` : '');
  const dir = ((st.aj.direcciones || {})[o.sucursal]) || '';
  let pago = '';
  if (!cancelado && o.estado === 'pendiente' && !vencido) {
    if (m === 'qr' || m === 'transferencia') {
      pago = `<div class="pay-box"><h2 style="font-size:20px">Realiza tu pago de ${money(o.total)}</h2>
        ${m === 'qr' && st.aj.qr_foto ? `<img class="qr" src="${esc(foto(st.aj.qr_foto))}" alt="Código QR para pagar">` : ''}
        ${m === 'transferencia' || !st.aj.qr_foto ? `<pre>${esc(st.aj.banco || 'Escríbenos por WhatsApp y te enviamos los datos de pago.')}</pre>` : ''}
        <p class="timer">Tu pedido queda reservado hasta ${new Date(o.vence).toLocaleString('es-BO', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        ${o.pago.comprobante ? '<p class="msg ok"><b>Recibimos tu comprobante.</b> Lo verificaremos y te avisaremos por WhatsApp.</p>'
    : `<p>Cuando pagues, sube la foto de tu comprobante:</p><input type="file" id="comp" accept="image/*" class="sr"><label for="comp" class="btn acc">Subir comprobante</label>`}
        ${wa ? ` <a class="btn wa" target="_blank" rel="noopener" href="${esc(waPed('Te envío mi comprobante de pago.'))}">Enviar por WhatsApp</a>` : ''}</div>`;
    } else if (m === 'contraentrega') {
      pago = `<div class="pay-box"><h2 style="font-size:20px">Pagas al recibir</h2><p>Prepara ${money(o.total)} en efectivo. Te escribiremos por WhatsApp para coordinar la hora de entrega.</p><p class="timer">Tu pedido queda reservado por ${aj('hold_horas')} horas hasta que lo confirmemos.</p>${wa ? `<a class="btn wa" target="_blank" rel="noopener" href="${esc(waPed('Confirmo mi pedido.'))}">Confirmar por WhatsApp</a>` : ''}</div>`;
    } else {
      pago = `<div class="pay-box"><h2 style="font-size:20px">Pagas al retirar</h2><p>Retira tu pedido en <b>${esc(sucN(o.sucursal))}</b>${dir ? `: ${esc(dir)}` : ''}. Llevamos tu pedido guardado hasta ${new Date(o.vence).toLocaleString('es-BO', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p>${wa ? `<a class="btn wa" target="_blank" rel="noopener" href="${esc(waPed('Confirmo que paso a retirar.'))}">Avisar por WhatsApp</a>` : ''}</div>`;
    }
  }
  return `<div class="wrap"><div class="ord">
    ${cancelado ? '' : `<div class="ok-badge" aria-hidden="true">${ICON.check}</div>`}
    <h1>${cancelado ? 'Pedido cancelado' : vencido ? 'Pedido vencido' : o.estado === 'pendiente' ? '¡Recibimos tu pedido!' : 'Tu pedido'}</h1>
    <p>Código de seguimiento: <span class="code" id="codetxt">${esc(o.codigo)}</span> <button class="btn ghost sm" data-act="copiar" data-v="${esc(o.codigo)}">Copiar</button></p>
    ${cancelado ? '<p>Este pedido fue cancelado y las prendas volvieron a la tienda.</p>' : vencido ? '<p>No recibimos el pago a tiempo y liberamos las prendas. Si todavía las quieres, haz un nuevo pedido o escríbenos.</p>'
    : `<ol class="steps" aria-label="Estado del pedido">${PASOS.map((p, i) => `<li class="${i < idx ? 'done' : i === idx ? 'done now' : ''}">${p[1]}</li>`).join('')}</ol>`}
    ${pago}
    <h2 style="font-size:20px;margin:24px 0 8px">Resumen</h2>
    <table class="it">${o.items.map((i) => `<tr><td>${esc(cap(i.nombre || ''))}<div class="muted" style="font-size:13px">Talla ${esc(i.t)} · ${esc(i.c)} · x${i.q}</div></td><td>${money(i.pr * i.q)}</td></tr>`).join('')}
      <tr><td>Subtotal</td><td>${money(o.subtotal)}</td></tr>
      ${o.descuento ? `<tr><td>Descuento</td><td>-${money(o.descuento)}</td></tr>` : ''}
      <tr><td>Envío</td><td>${o.entrega.tipo === 'nacional' ? 'A coordinar' : o.envio ? money(o.envio) : 'Gratis'}</td></tr>
      <tr><td><b>Total</b></td><td><b>${money(o.total)}</b></td></tr></table>
    <p class="muted" style="margin-top:14px">${o.entrega.tipo === 'retiro' ? 'Retiro en ' + esc(sucN(o.sucursal)) : (o.entrega.tipo === 'delivery' ? 'Delivery a: ' : 'Envío a: ') + esc(o.entrega.direccion) + (o.entrega.ciudad ? ', ' + esc(o.entrega.ciudad) : '')}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px"><a class="btn" href="#/tienda">Seguir comprando</a>
      ${o.estado === 'pendiente' && !vencido ? '<button class="btn ghost" data-act="cancelar" data-c="' + esc(o.codigo) + '">Cancelar pedido</button>' : ''}</div>
  </div></div>`;
}
async function refrescarPedido(codigo, tel) {
  const { data: o } = await sb.rpc('consultar_pedido', { p_codigo: codigo, p_telefono: tel });
  if (o && location.hash === '#/pedido/' + codigo && !document.activeElement.matches('input,textarea')) { app().innerHTML = htmlPedido(o); }
}
function vistaBuscar(codigo, msg) {
  return `<div class="wrap"><div class="lookup"><h1 style="font-size:36px;text-transform:uppercase;font-weight:800;margin-bottom:12px">Seguir mi pedido</h1>
    ${msg ? `<div class="err-box">${esc(msg)}</div>` : ''}
    <form id="buscar"><div class="fld"><label for="b-cod">Código del pedido</label><input id="b-cod" placeholder="DN-XXXXXX" value="${esc(codigo || '')}" required style="text-transform:uppercase"></div>
    <div class="fld"><label for="b-tel">Celular con el que compraste</label><input id="b-tel" type="tel" inputmode="tel" required></div>
    <button class="btn acc block" type="submit">Ver mi pedido</button></form></div></div>`;
}

// --- Información ---
function vistaInfo(tema) {
  const e = aj('envio') || {};
  const dir = st.aj.direcciones || {};
  const T = {
    envios: ['Envíos y retiro', `<p><b>Retiro en tienda:</b> gratis, en la sucursal que elijas.</p><p><b>Delivery en la ciudad:</b> desde ${money((e.delivery || {})[st.suc] || 0)}${e.gratis_desde > 0 ? `, gratis desde ${money(e.gratis_desde)}` : ''}.</p><p><b>Otras ciudades de Bolivia:</b> ${esc(e.nacional_texto || DEF.envio.nacional_texto)}</p>`],
    pagos: ['Formas de pago', '<p>Pagas con <b>QR</b> o <b>transferencia</b> y nos envías tu comprobante. En delivery dentro de la ciudad puedes pagar <b>contra entrega</b>, y si retiras en tienda puedes pagar al retirar.</p><p>Tu pedido queda reservado mientras pagas.</p>'],
    cambios: ['Cambios', `<p>${esc(aj('cambios_texto'))}</p>`],
    contacto: ['Contacto', `<p>${esc(aj('horarios'))}</p>${SUCS.map((s) => `<p><b>${s.n}</b><br>${esc(dir[s.id] || '')}</p>`).join('')}`],
  };
  const [t, h] = T[tema] || T.envios;
  document.title = t + ' | Dunno Clothing';
  return `<div class="wrap"><div class="page-h"><div class="crumbs"><a href="#/">Inicio</a> / ${esc(t)}</div><h1>${esc(t)}</h1></div><div style="max-width:70ch;padding-bottom:60px;font-size:16px">${h}</div></div>`;
}

// ---------- estructura y enrutado ----------
function estructura() {
  const nombre = aj('nombre');
  document.body.innerHTML = `
  <div class="bar">${esc(aj('anuncio'))}</div>
  <header class="head"><div class="wrap head-in">
    <a class="logo" href="#/" aria-label="${esc(nombre)} inicio">DUNNO</a>
    <nav class="nav" aria-label="Principal"><a href="#/tienda?o=nuevo">Novedades</a><a href="#/tienda?cat=Polera">Poleras</a><a href="#/tienda?cat=Hoddie">Hoddies</a><a href="#/tienda?cat=Pantal%C3%B3n">Pantalones</a><a href="#/tienda?oferta=1">Ofertas</a></nav>
    <span class="sp"></span>
    <form class="search" id="sform" role="search">${ICON.search}<input type="search" id="q" placeholder="Buscar prendas" aria-label="Buscar"></form>
    <button class="suc" data-act="suc" aria-label="Cambiar sucursal">📍 ${esc(sucN(st.suc))}</button>
    <a class="ic" href="#/favoritos" aria-label="Favoritos">${ICON.heart}</a>
    <button class="ic" data-act="abrir" aria-label="Abrir carrito">${ICON.bag}<span class="badge" id="cbadge" data-n="0"></span></button>
  </div><form class="msearch" id="msform" role="search"><input type="search" id="mq" placeholder="Buscar prendas" aria-label="Buscar"></form></header>
  <main id="app" tabindex="-1"></main>
  <footer class="foot"><div class="wrap"><div class="foot-g">
    <div><a class="logo" href="#/">DUNNO</a><p>${esc(aj('horarios'))}</p></div>
    <div><h3>Comprar</h3><a href="#/tienda?o=nuevo">Novedades</a><a href="#/tienda">Todo</a><a href="#/tienda?oferta=1">Ofertas</a><a href="#/favoritos">Favoritos</a></div>
    <div><h3>Ayuda</h3><a href="#/info/envios">Envíos y retiro</a><a href="#/info/pagos">Formas de pago</a><a href="#/info/cambios">Cambios</a><a href="#/seguimiento">Seguir mi pedido</a></div>
    <div><h3>Sucursales</h3>${SUCS.map((s) => `<a href="#/info/contacto">${s.n}</a>`).join('')}</div>
  </div><small>© ${new Date().getFullYear()} ${esc(nombre)}. Precios en bolivianos (Bs).</small></div></footer>
  <div class="scrim" id="scrim" data-act="cerrar"></div>
  <aside class="drawer" id="drawer" aria-label="Carrito"><div class="dr-h"><h2>Tu carrito</h2><button class="ic" data-act="cerrar" aria-label="Cerrar">✕</button></div><div class="dr-b" id="dr-b"></div><div class="dr-f" id="dr-f"></div></aside>
  <div class="toast" id="toast" role="status"></div>
  <div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="mt"></div>
  <script type="application/ld+json" id="ld"></script>`;
  const w = wapp();
  if (w) document.body.insertAdjacentHTML('beforeend', `<a class="wa-float" target="_blank" rel="noopener" href="${esc(waLink('Hola, quiero consultar por una prenda de la tienda.'))}" aria-label="Escribir por WhatsApp">${ICON.wa}</a>`);
  pintarBadge();
}
function modalSucursal(obligatorio) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-b"><h2 id="mt">¿Desde dónde compras?</h2><p class="muted">Cada sucursal tiene su propio stock. Elige la más cercana a ti: ahí retiras o desde ahí te enviamos.</p>
    <div class="pick">${SUCS.map((s) => `<button data-act="elegir" data-s="${s.id}">${s.n}<small>${st.suc === s.id ? 'Elegida' : 'Elegir'}</small></button>`).join('')}</div>
    ${obligatorio ? '' : '<p style="text-align:center;margin-top:14px"><button class="btn ghost sm" data-act="cerrarm">Cancelar</button></p>'}</div>`;
  m.classList.add('on');
}

async function ruta() {
  clearInterval(ordTimer);
  window.scrollTo(0, 0);
  document.title = 'Dunno Clothing · Tienda online de streetwear en Bolivia';
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const a = app();
  const set = (html) => { a.innerHTML = html; };
  $('#ld') && ($('#ld').textContent = '');
  try {
    if (!parts.length) { set(vistaHome()); }
    else if (parts[0] === 'tienda') { st.pagina = 1; set(vistaTienda(qs)); document.title = 'Tienda | Dunno Clothing'; }
    else if (parts[0] === 'p') { set(vistaProducto(decodeURIComponent(parts[1] || ''))); pintarPdp(); }
    else if (parts[0] === 'favoritos') { set(vistaFavoritos()); }
    else if (parts[0] === 'checkout') { set(vistaCheckout()); }
    else if (parts[0] === 'pedido') { set('<div class="wrap"><div class="empty"><p>Cargando tu pedido…</p></div></div>'); set(await vistaPedido(parts[1].toUpperCase())); }
    else if (parts[0] === 'seguimiento') { set(vistaBuscar('')); }
    else if (parts[0] === 'info') { set(vistaInfo(parts[1])); }
    else { set(vistaHome()); }
  } catch (e) {
    console.error(e);
    set('<div class="wrap"><div class="empty"><h2>Algo salió mal</h2><p>Recarga la página o escríbenos por WhatsApp.</p></div></div>');
  }
}

// ---------- eventos ----------
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  if (a === 'abrir') abrirCajon();
  else if (a === 'cerrar') cerrarCajon();
  else if (a === 'suc') modalSucursal(false);
  else if (a === 'cerrarm') $('#modal').classList.remove('on');
  else if (a === 'elegir') {
    const nuevo = el.dataset.s;
    if (nuevo !== st.suc) { st.suc = nuevo; LS.set('dn_suc', nuevo); st.listo = false; st.pdp = null; st.promo = null; $('#modal').classList.remove('on'); await iniciarSucursal(); }
    else $('#modal').classList.remove('on');
  }
  else if (a === 'fav') {
    e.preventDefault();
    const id = el.dataset.p; const i = st.fav.indexOf(id);
    if (i >= 0) st.fav.splice(i, 1); else st.fav.push(id);
    LS.set('dn_fav', st.fav);
    document.querySelectorAll(`[data-act="fav"][data-p="${CSS.escape(id)}"]`).forEach((b) => { b.setAttribute('aria-pressed', st.fav.includes(id)); if (b.classList.contains('btn')) b.textContent = st.fav.includes(id) ? '♥ Guardado' : '♡ Guardar'; });
  }
  else if (a === 'filtro') { const f = leerFiltros((location.hash.split('?')[1]) || ''); const k = el.dataset.k; f[k] = k === 'oferta' ? el.dataset.v === '1' : (f[k] === el.dataset.v ? '' : el.dataset.v); location.hash = urlFiltros(f); }
  else if (a === 'filtros-toggle') $('#filters').classList.toggle('open');
  else if (a === 'mas') { st.pagina++; const y = window.scrollY; app().innerHTML = vistaTienda(location.hash.split('?')[1]); window.scrollTo(0, y); }
  else if (a === 'img') { st.pdp.img = +el.dataset.i; pintarPdp(); }
  else if (a === 'color') { const s = st.pdp; s.c = s.c === el.dataset.v ? '' : el.dataset.v; s.img = 0; const p = st.byId.get(s.id); if (s.t && s.c && !stockDe(p, s.t, s.c)) s.t = ''; pintarPdp(); }
  else if (a === 'talla') { const s = st.pdp; s.t = s.t === el.dataset.v ? '' : el.dataset.v; pintarPdp(); }
  else if (a === 'qmas') { const s = st.pdp; const p = st.byId.get(s.id); const m = Math.min(stockDe(p, s.t, s.c), 5); if (s.q < m) s.q++; else toast('No hay más unidades de esa talla y color'); pintarPdp(); }
  else if (a === 'qmenos') { const s = st.pdp; if (s.q > 1) s.q--; pintarPdp(); }
  else if (a === 'comprar') {
    const s = st.pdp; const p = st.byId.get(s.id);
    if (!s.c) return toast('Elige un color');
    if (!s.t) return toast('Elige una talla');
    if (!stockDe(p, s.t, s.c)) return toast('Esa combinación está agotada');
    agregar(s.id, s.t, s.c, s.q); abrirCajon();
  }
  else if (a === 'compartir') { const u = location.href; if (navigator.share) { try { await navigator.share({ title: document.title, url: u }); } catch (er) { /* cancelado */ } } else { try { await navigator.clipboard.writeText(u); toast('Enlace copiado'); } catch (er) { toast(u); } } }
  else if (a === 'guia') { e.preventDefault(); const d = $('#guia'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
  else if (a === 'cq') { const l = st.cart[+el.dataset.i]; const ls = lineas()[+el.dataset.i]; const n = l.q + +el.dataset.d; if (n < 1) return; if (n > Math.min(ls.disp, 5)) return toast('No hay más unidades'); l.q = n; guardarCarrito(); pintarCajon(); }
  else if (a === 'crm') { st.cart.splice(+el.dataset.i, 1); guardarCarrito(); pintarCajon(); }
  else if (a === 'promo') {
    const cod = ($('#c-promo').value || '').trim(); co.promo = cod; SS.set('dn_co', co);
    const m = $('#promomsg');
    if (!cod) { st.promo = null; location.hash = '#/checkout'; return ruta(); }
    const { data } = await sb.rpc('validar_promo', { p_codigo: cod, p_subtotal: subtotal() });
    if (data && data.ok) { st.promo = { codigo: cod.toUpperCase(), descuento: data.descuento }; app().innerHTML = vistaCheckout(); }
    else { st.promo = null; m.innerHTML = `<span class="err">${esc((data && data.mensaje) || 'No se pudo validar el código')}</span>`; }
  }
  else if (a === 'copiar') { try { await navigator.clipboard.writeText(el.dataset.v); toast('Código copiado'); } catch (er) { toast(el.dataset.v); } }
  else if (a === 'cancelar') {
    if (!confirm('¿Cancelar este pedido? Las prendas volverán a la tienda.')) return;
    const c = el.dataset.c; const tel = SS.get('dn_t_' + c, null);
    const { error } = await sb.rpc('cancelar_pedido_cliente', { p_codigo: c, p_telefono: tel });
    toast(error ? error.message : 'Pedido cancelado'); ruta();
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.co) { co[t.dataset.co] = t.value; SS.set('dn_co', co); }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.co && (t.name === 'tipo' || t.name === 'metodo')) {
    co[t.dataset.co] = t.value; SS.set('dn_co', co);
    if (t.name === 'tipo') { app().innerHTML = vistaCheckout(); }
  }
  if (t.id === 'orden') { const f = leerFiltros((location.hash.split('?')[1]) || ''); f.o = t.value; location.hash = urlFiltros(f); }
  if (t.id === 'pmin' || t.id === 'pmax') { const f = leerFiltros((location.hash.split('?')[1]) || ''); f[t.id === 'pmin' ? 'min' : 'max'] = t.value; location.hash = urlFiltros(f); }
  if (t.id === 'comp' && t.files[0]) subirComprobante(t.files[0]);
});
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.id === 'sform' || f.id === 'msform') { e.preventDefault(); const v = (f.querySelector('input').value || '').trim(); const fl = leerFiltros(''); fl.q = v; location.hash = urlFiltros(fl); }
  else if (f.id === 'coform') {
    e.preventDefault();
    const err = $('#coerr');
    const falta = !co.nombre.trim() ? 'Escribe tu nombre' : !co.telefono.trim() ? 'Escribe tu celular' : (co.tipo !== 'retiro' && !co.direccion.trim()) ? 'Escribe tu dirección' : !co.metodo ? 'Elige cómo vas a pagar' : '';
    if (falta) { err.innerHTML = `<div class="err-box" role="alert">${falta}.</div>`; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    confirmarPedido();
  }
  else if (f.id === 'buscar') {
    e.preventDefault();
    const c = $('#b-cod').value.trim().toUpperCase(); const t = $('#b-tel').value.trim();
    SS.set('dn_t_' + c, t); if (location.hash === '#/pedido/' + c) ruta(); else location.hash = '#/pedido/' + c;
  }
});
async function subirComprobante(file) {
  const codigo = location.hash.split('/')[2]; const tel = SS.get('dn_t_' + codigo, null);
  toast('Subiendo comprobante…');
  try {
    const blob = await comprimirImagen(file);
    const path = `orders/${codigo}/${Date.now()}.jpg`;
    const up = await sb.storage.from('comprobantes').upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const { error } = await sb.rpc('adjuntar_comprobante', { p_codigo: codigo, p_telefono: tel, p_path: path });
    if (error) throw error;
    toast('¡Comprobante enviado!'); ruta();
  } catch (er) { toast('No se pudo subir: ' + (er.message || 'intenta de nuevo')); }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarCajon(); const m = $('#modal'); if (m && st.suc) m.classList.remove('on'); } });
window.addEventListener('hashchange', ruta);

// ---------- arranque ----------
async function iniciarSucursal() {
  cargarCarrito();
  estructura();
  app().innerHTML = '<div class="wrap"><div class="grid" style="padding:30px 0">' + '<div class="skel" style="aspect-ratio:4/5"></div>'.repeat(8) + '</div></div>';
  try { await cargarCatalogo(); } catch (e) { app().innerHTML = '<div class="wrap"><div class="empty"><h2>No pudimos cargar la tienda</h2><p>Revisa tu conexión e intenta de nuevo.</p></div></div>'; return; }
  await ruta();
  setInterval(() => { if (!document.hidden && st.listo) cargarCatalogo().then(() => { if ($('#drawer.on')) pintarCajon(); }).catch(() => {}); }, 300000);
}
(async function main() {
  if (!sb) {
    document.body.innerHTML = '<div style="max-width:520px;margin:20vh auto;padding:20px;font:16px system-ui"><h1>Dunno Clothing</h1><p>La tienda todavía no está conectada. Falta configurar <b>web/config.js</b>.</p></div>';
    return;
  }
  try { await cargarAjustes(); } catch (e) { st.aj = {}; }
  if (!SUCS.some((s) => s.id === st.suc)) {
    const q = new URLSearchParams(location.search).get('s');
    st.suc = SUCS.some((s) => s.id === q) ? q : null;
  }
  if (!st.suc) {
    document.body.innerHTML = '<div id="modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"></div><div class="toast" id="toast" role="status"></div>';
    modalSucursal(true);
    return;
  }
  LS.set('dn_suc', st.suc);
  await iniciarSucursal();
})();
