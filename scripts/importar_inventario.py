"""Convierte el Excel de inventario del sistema de caja (una hoja por sucursal) en los datos
iniciales del repositorio: seed/products.json, seed/entries.json y seed/fotos/.

Uso:  python3 scripts/importar_inventario.py inventario_AAAA-MM-DD.xlsx [--sin-fotos]

- Cada fila es un diseño-color de una sucursal; la columna A trae el enlace a la foto.
- Los productos que ya existen conservan sus datos; solo se actualiza el precio y se suman
  colores nuevos (con su foto). Los modelos nuevos se crean.
- El conteo reemplaza a los anteriores (ids inv-AAAAMMDD-sucursal). La fecha y hora salen de la
  línea "Generado: ..." del Excel (hora de Bolivia); la carga (seed.mjs) ajusta lo ya registrado.
- Imprime un resumen de cambios frente al conteo anterior.
"""
import collections, datetime, hashlib, json, os, re, subprocess, sys, unicodedata, urllib.request
import openpyxl

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'seed')
SUC = {'tarija': 'tarija', 'cochabamba': 'cochabamba', 'santa cruz': 'santacruz', 'santacruz': 'santacruz'}
CATS = {'buzo': 'Buzo', 'hoddie': 'Hoodie', 'hoodie': 'Hoodie', 'polera': 'Polera', 'shorts': 'Shorts', 'short': 'Shorts',
        'pantalón': 'Pantalón', 'pantalon': 'Pantalón', 'chaqueta': 'Chaqueta', 'chaleco': 'Chaleco', 'polo': 'Polo',
        'manga cero': 'Manga cero'}
MESES = {m: i + 1 for i, m in enumerate(['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'])}


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def color(s):
    s = re.sub(r'\s+', ' ', str(s).strip().lower().replace('~', ''))
    return s[:1].upper() + s[1:]


def categoria(c):
    c = re.sub(r'\s+', ' ', str(c).strip())
    return CATS.get(c.lower(), c[:1].upper() + c[1:].lower())


def leer(path):
    wb = openpyxl.load_workbook(path)
    filas, generado = [], None
    for ws in wb:
        suc = SUC.get(ws.title.strip().lower())
        if not suc:
            continue
        for r in range(1, 5):
            v = str(ws.cell(r, 1).value or '')
            m = re.search(r'Generado:\s*(\d{1,2}) (\w{3})\w*\.? de (\d{4}) (\d{1,2}):(\d{2})', v)
            if m:
                generado = datetime.datetime(int(m[3]), MESES[m[2].lower()], int(m[1]), int(m[4]), int(m[5]),
                                             tzinfo=datetime.timezone(datetime.timedelta(hours=-4)))
        hdr = [ws.cell(5, c).value for c in range(1, ws.max_column + 1)]
        assert hdr[1] == 'Diseño' and hdr[-1] == 'Total unidades', (ws.title, hdr)
        tallas = [(i, str(int(h)) if isinstance(h, (int, float)) else str(h).strip()) for i, h in enumerate(hdr) if 7 <= i < len(hdr) - 1]
        for r in range(6, ws.max_row + 1):
            v = [ws.cell(r, c + 1).value for c in range(len(hdr))]
            if not v[1]:
                continue
            a = ws.cell(r, 1)
            modelo = re.sub(r'\s+', ' ', str(v[1]).strip()).upper()
            cat = categoria(v[2])
            marca = str(v[3]).strip().upper()
            q = {t: int(v[i]) for i, t in tallas if v[i] and int(v[i]) > 0}
            assert sum(q.values()) == int(v[-1] or 0), (ws.title, r, v)
            # el id usa la grafía antigua "hoddie" para no separar el stock de los hoodies ya cargados
            pid = slug(f"{modelo}-{marca}-{'Hoddie' if cat == 'Hoodie' else cat}")
            filas.append(dict(suc=suc, url=a.hyperlink.target if a.hyperlink else None, pid=pid,
                              modelo=modelo.replace('HODDIE', 'HOODIE'), cat=cat, marca=marca,
                              corte=str(v[4]).strip().title() if v[4] else '', color=color(v[5]),
                              precio=v[6], tallas=q))
    return filas, generado


def foto(url, fotos_dir, descargar):
    if not url:
        return None
    h = hashlib.md5(url.encode()).hexdigest()[:12]
    destino = os.path.join(fotos_dir, h + '.jpg')
    if not os.path.exists(destino):
        if not descargar:
            return None
        from PIL import Image
        tmp = destino + '.tmp'
        try:
            subprocess.run(['curl', '-sSf', '-m', '60', '-o', tmp, url], check=True)
            im = Image.open(tmp).convert('RGB')
            im.thumbnail((900, 900))
            im.save(destino, quality=82, optimize=True)
        except Exception as e:  # sin foto: la prenda se carga igual
            print('  no pude bajar', url, e)
            return None
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
    return 'seed/' + h + '.jpg'


def main():
    path = sys.argv[1]
    descargar = '--sin-fotos' not in sys.argv
    filas, generado = leer(path)
    if not generado:
        sys.exit('No encontré la fecha "Generado:" en el Excel')
    fotos_dir = os.path.join(RAIZ, 'fotos')
    prods = json.load(open(os.path.join(RAIZ, 'products.json'), encoding='utf-8'))
    por_id = {p['id']: p for p in prods}
    antes = set(por_id)
    # Diseños renombrados en el sistema de caja: un id nuevo cuyas fotos son todas de un producto que ya
    # existe (misma marca y categoría) es el mismo producto con otro nombre. Se conserva el id viejo.
    fotos_de = {pid: {x.get('f') for x in p['data'].get('fc', []) if x.get('f')} for pid, p in por_id.items()}
    hf = lambda u: 'seed/' + hashlib.md5(u.encode()).hexdigest()[:12] + '.jpg' if u else None
    renombres = json.load(open(os.path.join(RAIZ, 'renombres.json'), encoding='utf-8')) if os.path.exists(os.path.join(RAIZ, 'renombres.json')) else []
    for pid in sorted({r['pid'] for r in filas} - antes):
        mias = [r for r in filas if r['pid'] == pid]
        fs = {hf(r['url']) for r in mias} - {None}
        cand = [q for q, f in fotos_de.items() if fs and fs <= f and por_id[q]['data']['marca'] == mias[0]['marca']
                and slug(por_id[q]['data']['categoria']) in (slug(mias[0]['cat']), 'hoddie' if mias[0]['cat'] == 'Hoodie' else '')]
        if len(cand) == 1:
            viejo = cand[0]
            print(f"  renombrado: {por_id[viejo]['data']['modelo']} -> {mias[0]['modelo']} (id {viejo})")
            renombres = [x for x in renombres if x['p'] != viejo]
            renombres.append({'p': viejo, 'antes': por_id[viejo]['data']['modelo'], 'modelo': mias[0]['modelo']})
            por_id[viejo]['data']['modelo'] = mias[0]['modelo']
            for r in mias:
                r['pid'] = viejo
    if renombres:
        json.dump(renombres, open(os.path.join(RAIZ, 'renombres.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    nuevos, precios, colores = [], [], []
    for r in filas:
        f = foto(r['url'], fotos_dir, descargar)
        p = por_id.get(r['pid'])
        if not p:
            p = por_id[r['pid']] = {'id': r['pid'], 'data': {'modelo': r['modelo'], 'marca': r['marca'], 'categoria': r['cat'],
                                                            'corte': r['corte'], 'precio': r['precio'], 'activo': True, 'fotos': [], 'fc': []}}
            prods.append(p)
            nuevos.append(r['pid'])
        d = p['data']
        if r['pid'] in antes and d.get('precio') != r['precio']:
            precios.append((r['pid'], d.get('precio'), r['precio']))
        d['precio'] = r['precio']
        d['activo'] = True
        if r['corte'] and not d.get('corte'):
            d['corte'] = r['corte']
        d.setdefault('fc', [])
        d.setdefault('fotos', [])
        if not any(x['c'] == r['color'] for x in d['fc']):
            d['fc'].append({'c': r['color'], **({'f': f} if f else {})})
            if r['pid'] in antes:
                colores.append((r['pid'], r['color']))
            if f and f not in d['fotos']:
                d['fotos'].append(f)
    json.dump(prods, open(os.path.join(RAIZ, 'products.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    viejo = json.load(open(os.path.join(RAIZ, 'entries.json'), encoding='utf-8'))
    oq = collections.Counter()
    for e in viejo:
        for l in e['data']['lines']:
            oq[(e['data']['sucursal'], l['p'], l['t'], l['c'])] += l['q']
    lineas = collections.defaultdict(collections.OrderedDict)
    for r in filas:
        for t, q in r['tallas'].items():
            k = (r['pid'], t, r['color'])
            lineas[r['suc']][k] = lineas[r['suc']].get(k, 0) + q
    ts = int(generado.timestamp() * 1000)
    tag = generado.strftime('%Y%m%d')
    ents, nq = [], collections.Counter()
    print(f"Conteo del {generado.strftime('%d/%m/%Y %H:%M')} (hora de Bolivia)")
    for s in ('tarija', 'cochabamba', 'santacruz'):
        g = lineas[s]
        ents.append({'id': f'inv-{tag}-{s}', 'data': {'tipo': 'ingreso', 'ts': ts, 'sucursal': s,
                     'lines': [{'p': k[0], 't': k[1], 'c': k[2], 'q': q} for k, q in g.items()],
                     'nota': f"Inventario del {generado.strftime('%d/%m/%Y')}", 'by': None}})
        for k, q in g.items():
            nq[(s,) + k] = q
        print(f"  {s}: {sum(v for k, v in oq.items() if k[0] == s)} -> {sum(g.values())}")
    json.dump(ents, open(os.path.join(RAIZ, 'entries.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    ks = set(nq) | set(oq)
    print('Suben', sum(max(0, nq[k] - oq.get(k, 0)) for k in ks), '| bajan', sum(max(0, oq.get(k, 0) - nq[k]) for k in ks),
          '| combinaciones agotadas', len([k for k in oq if oq[k] > 0 and not nq.get(k)]), '| nuevas', len([k for k in nq if k not in oq]))
    print('Modelos nuevos:', len(set(nuevos)), sorted(set(nuevos)))
    print('Cambios de precio:', sorted(set(precios)))
    print('Colores nuevos en modelos existentes:', sorted(set(colores)))
    print('Filas sin foto:', sum(1 for r in filas if not r['url']))


if __name__ == '__main__':
    main()
