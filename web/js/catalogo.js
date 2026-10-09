// Catálogo público: lo ven los clientes, sin iniciar sesión.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, WHATSAPP } from '../config.js';

const SUC = [
  { id: 'tarija', n: 'Tarija' },
  { id: 'cochabamba', n: 'Cochabamba' },
  { id: 'santacruz', n: 'Santa Cruz' },
];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => { s = String(s || ''); return s.charAt(0) + s.slice(1).toLowerCase(); };
const fmt = (n) => Math.round(n || 0).toLocaleString('es-BO');

const configurado = !String(SUPABASE_URL).includes('TU-PROYECTO') && !String(SUPABASE_ANON_KEY).includes('PEGA');
const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;
const foto = (p) => (!p ? '' : /^https?:/.test(p) ? p : `${SUPABASE_URL}/storage/v1/object/public/fotos/${p}`);

const params = new URLSearchParams(location.search);
const st = { suc: SUC.some((s) => s.id === params.get('s')) ? params.get('s') : 'tarija', q: '', cat: '', items: [], sel: {} };

function chips() {
  $('sucs').innerHTML = SUC.map((s) => `<button class="chip" aria-pressed="${st.suc === s.id}" data-suc="${s.id}">${s.n}</button>`).join('');
  const cats = [...new Set(st.items.map((p) => p.categoria))];
  $('cats').innerHTML = ['Todo', ...cats].map((c) => `<button class="chip" aria-pressed="${(st.cat || 'Todo') === c}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}

function wa(p, sel) {
  const num = (WHATSAPP && WHATSAPP[st.suc]) || '';
  if (!num) return '';
  const suc = SUC.find((s) => s.id === st.suc).n;
  let t = `Hola, me interesa ${cap(p.modelo)} (${cap(p.marca)})`;
  if (sel.t) t += `, talla ${sel.t}`;
  if (sel.c) t += `, color ${sel.c}`;
  t += `. ¿Está disponible en ${suc}?`;
  return `<a class="wa" target="_blank" rel="noopener" href="https://wa.me/${esc(num)}?text=${encodeURIComponent(t)}">Consultar por WhatsApp</a>`;
}

function card(p) {
  const sel = st.sel[p.id] || (st.sel[p.id] = { t: '', c: '' });
  const vs = p.variantes || [];
  const tallas = [...new Set(vs.map((v) => v.t))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const colores = [...new Set(vs.map((v) => v.c))];
  const fv = vs.filter((v) => (!sel.t || v.t === sel.t) && (!sel.c || v.c === sel.c));
  const bajo = fv.length > 0 && fv.every((v) => v.bajo);
  const fc = (p.fc || []).find((x) => x.c === sel.c);
  const img = fc ? fc.f : (p.fotos || [])[0];
  return `<article class="card" data-p="${esc(p.id)}">
    <div class="ph">${img ? `<img src="${esc(foto(img))}" alt="${esc(cap(p.modelo))}" loading="lazy">` : esc(String(p.modelo).charAt(0))}${bajo ? '<span class="tag">Últimas unidades</span>' : ''}</div>
    <div class="info">
      <div class="nm">${esc(cap(p.modelo))}</div>
      <div class="mt">${esc(cap(p.marca))} · ${esc(p.categoria)}${p.corte ? ' · ' + esc(p.corte) : ''}</div>
      <div class="pr">Bs ${fmt(p.precio)}</div>
      <div class="row" aria-label="Tallas">${tallas.map((t) => `<button class="sz" aria-pressed="${sel.t === t}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <div class="row" aria-label="Colores">${colores.map((c) => `<button class="dotc" aria-pressed="${sel.c === c}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      ${wa(p, sel)}
    </div></article>`;
}

function pintar() {
  chips();
  const q = st.q.trim().toLowerCase();
  const list = st.items.filter((p) => (!st.cat || p.categoria === st.cat) &&
    (!q || (p.modelo + ' ' + p.marca + ' ' + p.categoria + ' ' + (p.corte || '')).toLowerCase().includes(q)));
  $('grid').innerHTML = list.map(card).join('');
  $('empty').hidden = list.length > 0;
  $('count').textContent = list.length ? `${list.length} prenda${list.length === 1 ? '' : 's'} en ${SUC.find((s) => s.id === st.suc).n}` : '';
}

async function cargar(mantener) {
  if (!sb) {
    $('grid').innerHTML = '';
    $('empty').hidden = false;
    $('empty').textContent = 'El catálogo todavía no está conectado. Falta configurar web/config.js.';
    return;
  }
  if (!mantener) $('count').textContent = 'Cargando…';
  const { data, error } = await sb.rpc('catalogo_publico', { p_sucursal: st.suc });
  if (error) {
    $('count').textContent = '';
    $('empty').hidden = false;
    $('empty').textContent = 'No pudimos cargar el catálogo. Intenta de nuevo en un momento.';
    return;
  }
  st.items = data || [];
  if (!mantener) { st.cat = ''; st.sel = {}; }
  pintar();
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.suc) {
    st.suc = b.dataset.suc;
    history.replaceState(null, '', '?s=' + st.suc);
    cargar();
  } else if (b.dataset.cat !== undefined) {
    st.cat = b.dataset.cat === 'Todo' ? '' : b.dataset.cat;
    pintar();
  } else if (b.dataset.t || b.dataset.c) {
    const id = b.closest('.card').dataset.p;
    const sel = st.sel[id] || (st.sel[id] = { t: '', c: '' });
    if (b.dataset.t) sel.t = sel.t === b.dataset.t ? '' : b.dataset.t;
    if (b.dataset.c) sel.c = sel.c === b.dataset.c ? '' : b.dataset.c;
    const p = st.items.find((x) => x.id === id);
    const art = b.closest('.card');
    const tmp = document.createElement('div');
    tmp.innerHTML = card(p);
    art.replaceWith(tmp.firstElementChild);
  }
});
$('q').addEventListener('input', (e) => { st.q = e.target.value; pintar(); });
cargar();
setInterval(() => { if (!document.hidden && sb) cargar(true); }, 300000);
