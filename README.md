# Dunno Clothing · Sistema de ventas e inventario

Sistema web para las 3 sucursales (Tarija, Cochabamba y Santa Cruz):

- **Ventas** por sucursal, con pago en efectivo, QR, tarjeta, giftcard o mixto, y descuentos.
- **Inventario** por modelo, marca, talla y color en cada sucursal. Ingresos, transferencias y ajustes.
- **Drops** (lanzamientos) y **fotos** de cada prenda.
- **Dashboard** del dueño: ventas, sucursales, modelos, tallas, colores, pagos, descuentos y alertas de stock.
- **Catálogo para clientes** con enlace público y botón de WhatsApp, siempre al día con el stock.
- **Catálogo PDF** e imágenes listas para enviar.
- **Tienda online** para tus clientes (`/tienda/`): catálogo con filtros, página de cada prenda, carrito, compra sin cuenta, pago con QR o transferencia, delivery o retiro, códigos de descuento y seguimiento del pedido. Usa **el mismo inventario** del sistema: lo que se vende en tienda o en línea se descuenta de un solo stock.
- **Cuentas separadas**: el dueño ve todo; cada vendedor solo vende y ve lo de su sucursal.

Ya trae cargados tus datos: 217 modelos, el inventario del 8 de octubre de 2026 (2.045 prendas), el historial de ventas de junio a septiembre y las 375 fotos.

## Cómo se publica

```
Tu navegador ──► GitHub Pages (la página)  ──►  Supabase (base de datos, usuarios y fotos)
```

| Pieza | Para qué sirve | Costo |
|---|---|---|
| **Supabase** | Base de datos, inicio de sesión y fotos | Gratis para empezar |
| **GitHub Pages** | Muestra la página en internet | Gratis (repositorio público) |

Si tu repositorio es **privado** y no pagas GitHub Pro, GitHub Pages no funciona. En ese caso usa **Netlify**, **Vercel** o **Cloudflare Pages** (gratis): conecta el repositorio y como carpeta a publicar elige `web`, sin comando de compilación.

## Puesta en marcha (unos 30 minutos)

### 1. Crear la base de datos en Supabase
1. Entra a [supabase.com](https://supabase.com), crea una cuenta y toca **New project**.
2. Ponle nombre (por ejemplo `dunno`), escribe una contraseña para la base de datos (guárdala) y elige la región **South America (São Paulo)**.
3. Espera 1 o 2 minutos a que termine de crearse.

### 2. Crear las tablas
1. En Supabase abre **SQL Editor → New query**.
2. Abre el archivo [`supabase/schema.sql`](supabase/schema.sql) de este repositorio, copia **todo** su contenido, pégalo y toca **Run**.
3. Debe decir *Success*. Puedes ejecutarlo más de una vez sin problema.
4. Repite lo mismo con el archivo [`supabase/tienda.sql`](supabase/tienda.sql) (pedidos, códigos de descuento y comprobantes de la tienda online). **Siempre en este orden: primero `schema.sql`, después `tienda.sql`.**

### 3. Crear tu cuenta de dueño
1. En Supabase abre **Authentication → Users → Add user → Create new user**.
2. Escribe **tu correo** y una contraseña, y marca **Auto Confirm User**.
3. La **primera cuenta que se crea queda como dueño**. Las siguientes serán vendedores.

### 4. Conectar la página con Supabase
1. En Supabase abre **Project Settings → API**.
2. Copia el **Project URL** y la clave **anon public**.
3. En GitHub abre el archivo [`web/config.js`](web/config.js), toca el lápiz (editar) y reemplaza:
   - `https://TU-PROYECTO.supabase.co` por tu Project URL
   - `PEGA-AQUI-TU-CLAVE-ANON` por la clave anon
   - (opcional) los números de WhatsApp de cada sucursal, con código de país y sin signos. Ejemplo: `59171234567`
4. Guarda los cambios (**Commit changes**).

> La clave **anon** es pública por diseño, la protección está en las reglas de la base de datos. **Nunca** pegues aquí la clave `service_role`.

### 5. Cargar tus datos (modelos, inventario, historial y fotos)
1. En GitHub abre **Settings → Secrets and variables → Actions → New repository secret** y crea dos secretos:
   - `SUPABASE_URL` → el mismo Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` → la clave **service_role** (en Supabase: Project Settings → API). Esta clave da acceso total, por eso va solo aquí, como secreto.
2. Abre la pestaña **Actions → Cargar datos iniciales → Run workflow → Run workflow**.
3. Tarda unos 3 minutos. Al terminar en verde, tus datos y fotos ya están en Supabase.

### 6. Publicar la página
1. En GitHub abre **Settings → Pages** y en **Source** elige **GitHub Actions**.
2. Lleva estos archivos a la rama `main` (por ejemplo, aprobando el Pull Request de esta rama).
3. En **Actions → Publicar sitio** verás el avance. Al terminar, tu página queda en:

```
https://fermedinaseg-cmyk.github.io/dunno-clothing-sistema/            ← el sistema (con inicio de sesión)
https://fermedinaseg-cmyk.github.io/dunno-clothing-sistema/catalogo.html?s=tarija   ← catálogo para clientes
```

Cambia `tarija` por `cochabamba` o `santacruz` para el catálogo de cada sucursal. También lo copias desde el sistema, en **Catálogo → Copiar enlace para clientes**.

### 7. Avisar a Supabase cuál es tu página
En Supabase abre **Authentication → URL Configuration** y en **Site URL** pega la dirección de tu página. Así funcionan los correos de "Olvidé mi contraseña".

## Tienda online

Después de publicar, tu tienda queda en:

```
https://fermedinaseg-cmyk.github.io/dunno-clothing-sistema/tienda/
```

**Primeros ajustes (5 minutos).** Entra al sistema con tu cuenta de dueño, abre la pestaña **Tienda online** y completa:
- Los **WhatsApp** y las **direcciones** de cada sucursal.
- Cuánto cobras por **delivery** en cada ciudad (y desde qué monto es gratis).
- Tus **datos bancarios** y la foto de tu **código QR** del banco: se muestran al cliente cuando paga.
- Las **formas de pago** que quieres aceptar y el texto de **cambios**.

**Cómo compra un cliente**
1. Elige su ciudad (cada sucursal vende su propio stock), mira las prendas, escoge color y talla y las agrega al carrito.
2. Pone su nombre y celular, elige retiro, delivery o envío a otra ciudad, y cómo paga. No necesita crear cuenta.
3. Recibe un **código de pedido** (por ejemplo `DN-7K3Q2A`). Las prendas quedan **reservadas 12 horas** (lo cambias en Ajustes) mientras paga.
4. Paga con QR o transferencia y **sube la foto del comprobante** (o te lo manda por WhatsApp). Puede seguir su pedido en `/tienda/#/seguimiento` con su código y su celular.

**Cómo lo atiendes tú**
1. En **Pedidos** ves los pedidos nuevos (también te sale un aviso y una alerta en el dashboard).
2. Abres el pedido, revisas el comprobante y tocas **Confirmar pago**. Ahí se registra la venta online en tu dashboard.
3. Avanzas el estado: **Preparando → Enviado/Listo → Entregado**, y escribes al cliente por WhatsApp con un toque.
4. Si cancelas un pedido, o si el cliente no paga a tiempo, **las prendas vuelven al stock solas**.

**Cosas útiles**
- En **Productos → Editar** puedes poner un **precio anterior** (aparece tachado como oferta), una **descripción** y marcar la prenda como **destacada** para la portada.
- En **Tienda online → Códigos de descuento** creas códigos (por porcentaje o monto) con compra mínima y fecha de vencimiento.
- Los vendedores no ven los pedidos online: los atiende el dueño.

**Lo que todavía no incluye** (se puede agregar después):
- **Pago con tarjeta o QR automático.** Hoy el cobro es manual: tú confirmas cuando ves el dinero. Para cobrar solo con QR/tarjeta hay que contratar una pasarela boliviana (por ejemplo Libélula o PagosNet), que pide un contrato con tu empresa.
- **Avisos automáticos por correo o WhatsApp.** Hoy el aviso al dueño es dentro del sistema, y al cliente le escribes tú con el botón de WhatsApp.
- **Cálculo automático del envío a otras ciudades.** Se coordina con el cliente.

## Agregar vendedores
1. Supabase → **Authentication → Users → Add user** (correo, contraseña y *Auto Confirm User*).
2. Pásale al vendedor el enlace del sistema, su correo y su contraseña.
3. En el sistema entra a **Equipo** y elige su sucursal. Hasta entonces no puede vender.

Desde **Equipo** también puedes desactivar a alguien que ya no trabaja contigo.

## Qué ve cada persona

| | Dueño | Vendedor |
|---|---|---|
| Dashboard, inventario, drops, productos, equipo | Sí | No |
| Vender y catálogo | Cualquier sucursal | Solo la suya |
| Ventas | Todas, y puede anularlas | Solo las que él registró |
| Descargar catálogo, imagen y texto para clientes | Sí | Sí |
| Subir fotos y cambiar precios | Sí | No |

Estas reglas las aplica la base de datos, no solo la pantalla: aunque un vendedor intente saltarse el sistema, no puede leer ventas ajenas ni escribir en el inventario. Al registrar una venta, la base de datos comprueba el stock, usa el precio oficial y no deja vender más de lo que hay, incluso si dos vendedores venden la última prenda al mismo tiempo.

## Dominio propio (opcional)
Con un dominio como `dunnoclothing.com` (unos 10 a 15 USD al año) puedes tener `sistema.dunnoclothing.com`. En GitHub: **Settings → Pages → Custom domain**, y en tu registrador de dominios creas un registro `CNAME` que apunte a `fermedinaseg-cmyk.github.io`.

## Cuidados importantes
- **Proyecto gratuito de Supabase:** se pausa tras una semana sin uso. Este repositorio incluye un aviso automático (`mantener-activo.yml`) que lo consulta cada 3 días para evitarlo.
- **Copias de seguridad:** el plan gratuito no guarda copias automáticas. Descarga tus datos de vez en cuando: en Supabase, **Table Editor → docs → Export → CSV**. El plan Pro (25 USD al mes) las incluye.
- **Contraseñas:** usa una distinta para cada persona y cámbiala si alguien deja el equipo (o desactívalo en **Equipo**).

## Para quien programe

```
web/                 La página (HTML, CSS y JavaScript sin compilar)
  index.html         Sistema interno
  catalogo.html      Catálogo público para clientes (solo ver)
  tienda/            Tienda online completa (catálogo, carrito, compra, pedido)
  config.js          Dirección y clave de Supabase, WhatsApp
  js/app.js          Pantallas y lógica
  js/store.js        Conexión con Supabase (datos, sesión, fotos)
supabase/schema.sql  Tablas, permisos, stock y funciones (registrar_venta, catalogo_publico)
supabase/tienda.sql  Pedidos de la tienda online (crear_pedido, consultar_pedido, pedido_cambiar_estado…)
seed/                Datos iniciales: productos, inventario, historial y fotos
scripts/seed.mjs     Carga los datos iniciales en Supabase
.github/workflows/   Publicar sitio · Cargar datos iniciales · Mantener activo
```

Datos: una tabla `docs (coleccion, id, data jsonb)` guarda productos, drops, movimientos de stock, ventas e historial; `perfiles` guarda el rol y la sucursal de cada usuario. El stock se calcula siempre en la base de datos: ingresos y transferencias recibidas, menos transferencias enviadas y ventas no anuladas.
