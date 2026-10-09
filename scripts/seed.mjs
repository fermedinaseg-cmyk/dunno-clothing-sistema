// Carga los datos iniciales en Supabase: productos, inventario del 8 oct 2026,
// historial de ventas (jun-sep 2026) y las 375 fotos.
// Es seguro ejecutarlo más de una vez (reemplaza, no duplica).
//
// Variables necesarias: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// Opciones: --sin-fotos  --sin-historial  --sin-inventario
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  await subirDocs('products', leer('products.json'));
  if (!args.has('--sin-inventario')) await subirDocs('entries', leer('entries.json'));
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
