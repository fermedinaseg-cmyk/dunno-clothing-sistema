// Carga los datos iniciales en Supabase: productos, inventario del 12 oct 2026,
// historial de ventas (jun-sep 2026) y las fotos.
// Es seguro ejecutarlo más de una vez (reemplaza, no duplica).
//
// Variables necesarias: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// Opciones: --sin-fotos  --sin-historial  --sin-inventario
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { movimientosOtros, ajustarConteos } from './reconciliar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..', 'seed');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const args = new Set(process.argv.slice(2));
const sb = createClient(url, key, { auth: { persistSession: false } });
const leer = (f) => JSON.parse(fs.readFileSync(path.join(raiz, f), 'utf8'));

async function leerColeccion(coleccion) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from('docs').select('id,data').eq('coleccion', coleccion).order('id').range(desde, desde + 999);
    if (error) throw new Error(`${coleccion}: ${error.message}`);
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

// Los productos que ya existen conservan lo que editaste en el sistema (colores, guía de tallas,
// descripción, destacado, fotos nuevas...). Del archivo solo se actualizan el precio y se suman
// los colores y fotos que falten.
function fusionarProducto(actual, nuevo) {
  const d = { ...actual, precio: nuevo.precio, activo: true };
  if (!d.corte && nuevo.corte) d.corte = nuevo.corte;
  d.fotos = [...(actual.fotos || [])];
  (nuevo.fotos || []).forEach((f) => { if (!d.fotos.includes(f)) d.fotos.push(f); });
  d.fc = [...(actual.fc || [])];
  (nuevo.fc || []).forEach((x) => { if (!d.fc.some((y) => y.c === x.c)) d.fc.push(x); });
  if (!d.fotos.length) delete d.fotos;
  if (!d.fc.length) delete d.fc;
  return d;
}

async function subirDocs(coleccion, lista) {
  for (let i = 0; i < lista.length; i += 50) {
    const filas = lista.slice(i, i + 50).map((d) => ({ coleccion, id: d.id, data: d.data }));
    const { error } = await sb.from('docs').upsert(filas);
    if (error) throw new Error(`${coleccion}: ${error.message}`);
  }
  console.log(`✔ ${coleccion}: ${lista.length} documentos`);
}

async function subirFotos() {
  const dir = path.join(raiz, 'fotos');
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg'));
  let hechas = 0;
  const cola = [...archivos];
  const trabajador = async () => {
    while (cola.length) {
      const f = cola.pop();
      const { error } = await sb.storage.from('fotos').upload('seed/' + f, fs.readFileSync(path.join(dir, f)), {
        contentType: 'image/jpeg', upsert: true, cacheControl: '31536000',
      });
      if (error) throw new Error(`foto ${f}: ${error.message}`);
      if (++hechas % 50 === 0) console.log(`  fotos ${hechas}/${archivos.length}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabajador));
  console.log(`✔ fotos: ${archivos.length} subidas`);
}

try {
  // Verifica que el esquema ya esté creado
  const { error: e0 } = await sb.from('docs').select('id').limit(1);
  if (e0) throw new Error('No encuentro la tabla "docs". Primero ejecuta supabase/schema.sql en el SQL Editor. (' + e0.message + ')');
  if (!args.has('--sin-fotos')) await subirFotos();
  const actuales = new Map((await leerColeccion('products')).map((r) => [r.id, r.data]));
  const productos = leer('products.json').map((p) => (actuales.has(p.id) ? { id: p.id, data: fusionarProducto(actuales.get(p.id), p.data) } : p));
  await subirDocs('products', productos);
  if (!args.has('--sin-inventario')) {
    const conteos = leer('entries.json');
    // Ajusta el conteo para no descontar dos veces lo que ya se registró en el sistema hasta la fecha del conteo
    const corte = Math.min(...conteos.map((e) => e.data.ts));
    const otros = movimientosOtros({ entradas: await leerColeccion('entries'), ventas: await leerColeccion('sales'), pedidos: await leerColeccion('orders') }, corte);
    const nuevas = ajustarConteos(conteos, otros);
    console.log(`  conteo al ${new Date(corte).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}; ajuste por ${otros.size} combinaciones con movimientos previos`);
    await subirDocs('entries', nuevas);
    // El inventario nuevo reemplaza a los conteos anteriores (ids que empiezan con "inv-"), para no duplicar stock
    const { data: previos } = await sb.from('docs').select('id').eq('coleccion', 'entries').like('id', 'inv-%');
    const sobran = (previos || []).map((d) => d.id).filter((id) => !nuevas.some((n) => n.id === id));
    if (sobran.length) {
      const { error } = await sb.from('docs').delete().eq('coleccion', 'entries').in('id', sobran);
      if (error) throw new Error('entries: ' + error.message);
      console.log(`✔ entries: ${sobran.length} conteos anteriores reemplazados`);
    }
  }
  if (!args.has('--sin-historial')) await subirDocs('hist', leer('hist.json'));
  // Ajustes de la tienda online: solo se crean si todavía no existen (no pisa lo que ya configuraste)
  const { data: yaHay } = await sb.from('docs').select('id').eq('coleccion', 'settings').eq('id', 'tienda').maybeSingle();
  if (!yaHay) await subirDocs('settings', [{ id: 'tienda', data: leer('settings.json') }]);
  else console.log('✔ settings: ya existían, se conservan');
  console.log('Listo. Ya puedes entrar al sistema.');
} catch (e) {
  console.error('✖ ' + e.message);
  process.exit(1);
}
