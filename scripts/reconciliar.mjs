// Cálculo puro (sin red) para cargar un conteo nuevo de inventario sin descontar dos veces
// lo que ya se movió en el sistema (ventas, pedidos, ingresos y transferencias).
//
// El stock del sistema es: conteo base + otros ingresos - transferencias enviadas - ventas - pedidos.
// Para que el stock quede igual al conteo real, el conteo base guardado debe ser:
//   conteo real - (todo lo demás que ya estaba registrado hasta la fecha del conteo).

const clave = (b, p, t, c) => [b, p, t, c].join('|');

// movimientos "otros" hasta `corte` (ms). Los pedidos pendientes no se cuentan: siguen reservando stock.
export function movimientosOtros({ entradas, ventas, pedidos }, corte) {
  const net = new Map();
  const suma = (b, p, t, c, q) => { if (!b) return; const k = clave(b, p, t, c); net.set(k, (net.get(k) || 0) + q); };
  for (const e of entradas) {
    if (/^inv-/.test(e.id) || (e.data.ts || 0) > corte) continue; // los conteos base se reemplazan
    for (const l of e.data.lines || []) {
      suma(e.data.sucursal, l.p, l.t, l.c, +l.q);
      if (e.data.tipo === 'transferencia') suma(e.data.origen, l.p, l.t, l.c, -l.q);
    }
  }
  for (const v of ventas) {
    if (v.data.anulada || v.data.online || (v.data.ts || 0) > corte) continue;
    for (const i of v.data.items || []) suma(v.data.sucursal, i.p, i.t, i.c, -i.q);
  }
  for (const o of pedidos) {
    if (o.data.estado === 'cancelado' || o.data.estado === 'pendiente' || (o.data.ts || 0) > corte) continue;
    for (const i of o.data.items || []) suma(o.data.sucursal, i.p, i.t, i.c, -i.q);
  }
  return net;
}

// conteos: [{id, data:{sucursal, lines:[{p,t,c,q}], ...}}]  -> mismos documentos con las líneas ajustadas
export function ajustarConteos(conteos, otros) {
  const real = new Map();
  for (const e of conteos) for (const l of e.data.lines) real.set(clave(e.data.sucursal, l.p, l.t, l.c), (real.get(clave(e.data.sucursal, l.p, l.t, l.c)) || 0) + l.q);
  const claves = new Set([...real.keys(), ...otros.keys()]);
  const porSuc = new Map(conteos.map((e) => [e.data.sucursal, []]));
  for (const k of claves) {
    const [b, p, t, c] = k.split('|');
    const q = (real.get(k) || 0) - (otros.get(k) || 0);
    if (q !== 0 && porSuc.has(b)) porSuc.get(b).push({ p, t, c, q });
  }
  return conteos.map((e) => ({ id: e.id, data: { ...e.data, lines: porSuc.get(e.data.sucursal) } }));
}
