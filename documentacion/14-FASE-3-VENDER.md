# 14 · Fase 3: venderlo a otras agencias (paso a paso)

Estado: **plan, sin empezar** (2026-10-25). Hoy la app la usa Lucuma: las cuentas se crean por
consola, no hay correo ni cobros. Esto es lo que falta para que una agencia que no conocemos se
registre sola, pague y la use. El orden importa: cada paso se apoya en el anterior.

## Paso 1 · Decisiones de negocio (sin código)

- **Nombre y marca** del producto (hoy «Lucuma Agency · Proyectos», D-33). Que no dependa de
  Lucuma si se quiere vender a la competencia.
- **A quién**: agencias chicas y medianas de LATAM (3 a 20 personas) que hoy coordinan por
  WhatsApp, Trello y Drive.
- **Precio y planes** (hoy de ejemplo en `shared/planes.ts`). Recomendado: cobrar **por persona
  del equipo** y que **los clientes entren gratis** (es el diferenciador frente a Basecamp,
  Monday o ClickUp). Por ejemplo: Inicial (hasta 3 personas), Agencia (hasta 10), Pro (sin
  tope), con límites de proyectos y almacenamiento.
- **Moneda**: dólares para LATAM y, si conviene, soles para Perú.

## Paso 2 · Dominio e infraestructura propia

- **Dominio** del producto y DNS con comodín (`*.dominio.com`), para que cada agencia tenga su
  subdominio (`suagencia.dominio.com`; ya está programado).
- **Servidor propio** (VPS, p. ej. Vultr con CloudPanel, como el resto de los servidores de
  Lucuma): PostgreSQL 16, Node 22, certificado SSL comodín. Plesk compartido no da cron real
  ni comodines cómodos.
- Copias **fuera del servidor** automáticas, Sentry encendido y alertas si la app se cae.
- Pasar los archivos a un almacenamiento aparte (p. ej. Cloudflare R2) cuando el disco quede
  chico; el código ya separa el almacén (`lib/almacen.ts`).
- **Cambiar todas las claves** antes de abrir: contraseñas de la base, `SESSION_SECRET`, clave
  del bot (las de ahora pasaron por el chat).

## Paso 3 · Correo (obligatorio para vender)

Sin correo una agencia desconocida no puede registrarse ni recuperar su contraseña, y sus
clientes no se enteran de nada. Brevo con un remitente del dominio (SPF, DKIM, DMARC):
verificación de la cuenta, «olvidé mi contraseña», invitaciones por correo y avisos (inmediato
o resumen diario, ya previstos en el modelo: `Membership.prefs`, `Notification.emailedAt`).

## Paso 4 · Que una agencia entre sola

- **Registro con prueba gratis** (14 días): nombre de la agencia → subdominio → primera
  persona como dueña. Hoy es `cuenta:crear` por consola.
- **Bienvenida guiada**: crear el primer proyecto, invitar al equipo y a un cliente, y
  **plantillas de ejemplo** ya cargadas (Onboarding de cliente, Desarrollo web, Contenido
  mensual con tablero).
- **Panel de superadmin** (para Lucuma): cuentas, plan, uso, pruebas que vencen, entrar como
  soporte (ya existe en beta, con registro).
- Límites del plan aplicados de verdad (ya están programados: personas, proyectos,
  almacenamiento) y qué pasa al pasarse o al vencer la prueba (solo lectura, no borrar).
- Cerrar la cuenta y borrar todo a los 30 días (previsto en el modelo, `closedAt`).

## Paso 5 · Cobros

- **Fuera de Perú**: Paddle o Lemon Squeezy (cobran por nosotros y se encargan de los impuestos
  de cada país; Stripe no acepta comercios con sede en Perú, D-21).
- **En Perú**, si se cobra en soles: Culqi o Mercado Pago, con **factura electrónica SUNAT**.
- Suscripción mensual o anual, cambio de plan, tarjeta rechazada (avisos y gracia), y el estado
  del pago conectado al plan de la cuenta (webhooks).

## Paso 6 · Legal

- **Términos y condiciones** y **política de privacidad**.
- **Protección de datos (Ley 29733, Perú)**: las agencias guardan datos de SUS clientes, así que
  somos **encargados del tratamiento**: contrato de encargo (DPA), dónde están los servidores,
  cuánto se guarda, cómo se borra. Inscribir el banco de datos ante la autoridad.
- Libro de reclamaciones virtual si se vende a consumidores en Perú (recomendable igual).

## Paso 7 · Seguridad antes de abrir

- Revisión de seguridad completa (el aislamiento entre cuentas ya tiene pruebas y RLS).
- Doble verificación (2FA) opcional para dueños y admins.
- Límites de uso por cuenta y por IP en registro y login (ya hay frenos en login).
- Plan de qué hacer si algo se filtra.

## Paso 8 · Beta cerrada con agencias conocidas

3 a 5 agencias amigas, gratis unos meses a cambio de usarla en serio y contar qué falta. Medir:
cuántas activan (crean proyecto e invitan a un cliente), cuántas siguen a las 4 semanas, qué
piden. Ajustar precios y plantillas con eso.

## Paso 9 · Lanzamiento

- **Página de venta**: qué es, para quién, precios, prueba gratis, comparación con Basecamp y
  Trello, casos (Lucuma mismo).
- **Centro de ayuda**: guías cortas (plantillas, tablero, ficha del cliente, accesos).
- **Soporte**: un canal (correo o WhatsApp) con tiempos claros.
- Marketing: contenido para agencias, comunidades, referidos (una agencia trae a otra).

## Esfuerzo aproximado

| Paso | Quién | Tiempo |
|---|---|---|
| 1 · Decisiones | Usuario | 1 semana |
| 2 · Dominio e infraestructura | Juntos | 2–3 días |
| 3 · Correo | Claude + DNS del usuario | 2 días |
| 4 · Registro, bienvenida, superadmin | Claude | 5–7 días |
| 5 · Cobros | Claude + cuentas del usuario | 4–5 días |
| 6 · Legal | Usuario (con abogado) | 1–2 semanas, en paralelo |
| 7 · Seguridad | Claude | 2–3 días |
| 8 · Beta cerrada | Usuario | 1–2 meses |
| 9 · Lanzamiento | Usuario (con apoyo) | 2 semanas |
