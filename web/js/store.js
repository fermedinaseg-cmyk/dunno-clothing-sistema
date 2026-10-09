// Capa de datos del sistema: conexión con Supabase (base de datos, sesión, fotos).
// La aplicación (app.js) solo habla con este archivo.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const configurado =
  SUPABASE_URL && SUPABASE_ANON_KEY &&
  !String(SUPABASE_URL).includes('TU-PROYECTO') && !String(SUPABASE_ANON_KEY).includes('PEGA');

export const sb = configurado
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

const PAGE = 1000;
const errMsg = (e) => {
  const m = (e && (e.message || e.details)) || 'Error desconocido';
  return { code: (e && e.code) || 'error', message: m };
};
const randomId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);

// Une un parche sobre un documento (los objetos se mezclan, lo demás se reemplaza)
function merge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    const v = b[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object' && !Array.isArray(a[k])
      ? merge(a[k], v) : v;
  }
  return out;
}

const snap = (map) => {
  const docs = [...map.entries()].map(([id, data]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(data)) }));
  return { docs, size: docs.length, empty: docs.length === 0 };
};

async function fetchAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw errMsg(error);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

class Doc {
  constructor(col, id) { this.col = col; this.id = id; this.path = col + '/' + id; }
  async get() {
    const { data, error } = await sb.from('docs').select('data').eq('coleccion', this.col).eq('id', this.id).maybeSingle();
    if (error) throw errMsg(error);
    return { id: this.id, exists: !!data, data: () => data && data.data };
  }
  async set(data) {
    const { error } = await sb.from('docs').upsert({ coleccion: this.col, id: this.id, data });
    if (error) throw errMsg(error);
  }
  async update(patch) {
    const cur = await this.get();
    if (!cur.exists) throw { code: 'invalid_argument', message: 'El documento no existe' };
    const { error } = await sb.from('docs').update({ data: merge(cur.data(), patch) }).eq('coleccion', this.col).eq('id', this.id);
    if (error) throw errMsg(error);
  }
  async delete() {
    const { error } = await sb.from('docs').delete().eq('coleccion', this.col).eq('id', this.id);
    if (error) throw errMsg(error);
  }
}

class Col {
  constructor(name) { this.name = name; }
  doc(id) { return new Doc(this.name, id || randomId()); }
  async add(data) { const d = this.doc(); await d.set(data); return d; }
  onSnapshot(next, onError) {
    const name = this.name;
    const cache = new Map();
    let vivo = true;
    const cargar = async () => {
      const rows = await fetchAll(() => sb.from('docs').select('id,data').eq('coleccion', name).order('id'));
      if (!vivo) return;
      cache.clear();
      rows.forEach((r) => cache.set(r.id, r.data));
      next(snap(cache));
    };
    cargar().catch((e) => onError && onError(e));
    const canal = sb.channel('docs-' + name + '-' + randomId())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'coleccion=eq.' + name }, (p) => {
        if (!vivo) return;
        if (p.eventType === 'DELETE') cache.delete(p.old.id);
        else cache.set(p.new.id, p.new.data);
        next(snap(cache));
      })
      .subscribe();
    // Red de seguridad por si se pierde la conexión en vivo
    const iv = setInterval(() => { cargar().catch(() => {}); }, 60000);
    return () => { vivo = false; clearInterval(iv); sb.removeChannel(canal); };
  }
}

const db = {
  collection: (n) => new Col(n),
  doc: (path) => { const [c, ...r] = path.split('/'); return new Doc(c, r.join('/')); },
};

// ---- Sesión -------------------------------------------------------------
function pantalla(app, html) { app.innerHTML = `<div class="splash card login">${html}</div>`; }

async function cargarPerfil(userId) {
  const { data, error } = await sb.from('perfiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw errMsg(error);
  return data;
}

async function requireLogin(app) {
  if (!sb) {
    pantalla(app, `<h1>Sistema de Ventas Dunno</h1>
      <p>Falta conectar la base de datos. Abre el archivo <b>web/config.js</b> y pega la dirección y la clave de tu proyecto de Supabase.</p>
      <p class="muted sm">La guía paso a paso está en el archivo README del repositorio.</p>`);
    return null;
  }
  for (;;) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      let perfil = null;
      try { perfil = await cargarPerfil(session.user.id); } catch (e) { perfil = null; }
      if (perfil && perfil.activo) return { session, perfil };
      await esperarCierre(app, perfil
        ? 'Tu cuenta está desactivada. Habla con el dueño.'
        : 'Tu usuario todavía no tiene perfil. Cierra sesión e intenta de nuevo; si sigue igual avisa al dueño.');
      continue;
    }
    await formularioLogin(app);
  }
}

function esperarCierre(app, mensaje) {
  return new Promise((res) => {
    pantalla(app, `<h1>Sistema de Ventas Dunno</h1><p>${mensaje}</p><button class="btn" id="lg-out">Cerrar sesión</button>`);
    app.querySelector('#lg-out').onclick = async () => { await sb.auth.signOut(); res(); };
  });
}

function formularioLogin(app) {
  return new Promise((res) => {
    pantalla(app, `<h1>Sistema de Ventas Dunno</h1>
      <p class="muted">Entra con tu correo y contraseña.</p>
      <form id="lg-form" class="lg-form">
        <label class="fgroup"><span class="flabel">Correo</span><input type="email" id="lg-mail" autocomplete="username" required></label>
        <label class="fgroup"><span class="flabel">Contraseña</span><input type="password" id="lg-pass" autocomplete="current-password" required></label>
        <p class="err" id="lg-err"></p>
        <button class="btn" type="submit" id="lg-go">Entrar</button>
        <button class="btn sec sm" type="button" id="lg-reset">Olvidé mi contraseña</button>
      </form>`);
    const err = app.querySelector('#lg-err');
    app.querySelector('#lg-form').onsubmit = async (e) => {
      e.preventDefault();
      const go = app.querySelector('#lg-go');
      go.disabled = true; err.textContent = '';
      const { error } = await sb.auth.signInWithPassword({
        email: app.querySelector('#lg-mail').value.trim(),
        password: app.querySelector('#lg-pass').value,
      });
      if (error) {
        err.textContent = /invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : 'No se pudo entrar: ' + error.message;
        go.disabled = false;
      } else res();
    };
    app.querySelector('#lg-reset').onclick = async () => {
      const mail = app.querySelector('#lg-mail').value.trim();
      if (!mail) { err.textContent = 'Escribe tu correo arriba y vuelve a tocar el botón.'; return; }
      const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: location.href.split('#')[0] });
      err.style.color = error ? '' : 'var(--good)';
      err.textContent = error ? 'No se pudo enviar el correo: ' + error.message : 'Te enviamos un correo para cambiar la contraseña.';
    };
  });
}

// ---- Funciones del negocio ------------------------------------------------
async function stockActual() {
  return fetchAll(() => sb.rpc('stock_actual').order('b').order('p').order('t').order('c'));
}

async function registrarVenta(sucursal, items, descuento, pago) {
  const { data, error } = await sb.rpc('registrar_venta', {
    p_sucursal: sucursal, p_items: items, p_desc: descuento || 0, p_pago: pago,
  });
  if (error) {
    // Los errores de nuestras reglas vienen en español en el mensaje
    throw { code: error.code, message: (error.message || 'No se pudo registrar la venta') + '.' };
  }
  return data;
}

async function listPerfiles() {
  const { data, error } = await sb.from('perfiles').select('*').order('creado');
  if (error) throw errMsg(error);
  return data;
}

async function updatePerfil(id, patch) {
  const { error } = await sb.from('perfiles').update(patch).eq('id', id);
  if (error) throw errMsg(error);
}

// ---- Fotos -------------------------------------------------------------------
const BUCKET = 'fotos';
function photoUrl(path) {
  if (!path) return '';
  if (/^https?:/.test(path)) return path;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
async function uploadPhoto(blob) {
  const path = 'p/' + Date.now() + '-' + randomId() + '.jpg';
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw errMsg(error);
  return path;
}
async function deletePhoto(path) {
  if (/^seed\//.test(path) || /^https?:/.test(path)) return; // las fotos iniciales se conservan
  await sb.storage.from(BUCKET).remove([path]);
}

// ---- Descargas -------------------------------------------------------------
async function saveFile({ filename, data }) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return { status: 'saved' };
}

async function pedidoEstado(id, estado) {
  const { data, error } = await sb.rpc('pedido_cambiar_estado', { p_id: id, p_estado: estado });
  if (error) throw { code: error.code, message: error.message };
  return data;
}
async function signedUrl(path) {
  const { data, error } = await sb.storage.from('comprobantes').createSignedUrl(path, 600);
  if (error) throw errMsg(error);
  return data.signedUrl;
}

async function signOut() { if (sb) await sb.auth.signOut(); }

export const Store = {
  db, sb, requireLogin, stockActual, registrarVenta, listPerfiles, updatePerfil,
  photoUrl, uploadPhoto, deletePhoto, saveFile, signOut, pedidoEstado, signedUrl,
};
