# 01. Visión y negocio

## Qué es

Una herramienta de gestión de proyectos al estilo de Basecamp, pensada para agencias y
estudios que trabajan con clientes. En cada proyecto vive todo: tareas, mensajes, archivos,
comentarios y la actividad. El cliente entra al mismo proyecto y ve solo lo que la agencia
marca como visible para él.

Nombre de trabajo: **Lucuma Proyectos**. Se cambia cuando haya marca.

## Estrategia: primero interno, después producto

1. **Construir para Lucuma.** El MVP resuelve la coordinación de la agencia con sus clientes.
2. **Usarlo de verdad 1 o 2 meses.** Corregir lo que molesta en el uso diario y sumar lo que
   falte. Esta fase da un producto que resuelve algo concreto y casos reales para venderlo.
3. **Abrirlo a la venta.** Cobros, registro con prueba gratuita, panel de superadmin, legales.

La regla de diseño que sale de aquí: **desde el día 1 se construye como si ya fuera un SaaS**
(multi-cuenta, aislamiento en la base, límites por plan, idioma y zona horaria por usuario),
aunque al principio haya una sola cuenta. Esas decisiones son baratas al inicio y muy caras de
cambiar con datos y clientes encima. Lo que solo sirve para vender (cobros, onboarding) se hace
al final.

## Para quién

- **Cliente ideal:** agencias de marketing, diseño, desarrollo web y estudios creativos de
  LATAM, de 3 a 30 personas, que coordinan con clientes por WhatsApp, correo y Drive y pierden
  aprobaciones, versiones y pedidos entre los tres.
- **Usuarios dentro de cada cuenta:** el dueño o director, el equipo y los clientes invitados.
- **Primer usuario:** Lucuma Agency.

## Competencia y por qué no ir de frente

Basecamp, ClickUp, Asana, Monday, Trello y Notion ya resuelven la gestión de tareas en general.
Competir de frente es muy difícil: tienen años de producto, apps móviles y marca. Un nicho sí
funciona: **el portal de clientes para agencias de LATAM**, que esas herramientas tratan como
algo secundario.

Referencia de precio a verificar al momento de definir planes: Basecamp cobra por usuario o una
tarifa plana alta por cuenta ilimitada, en dólares y sin precio local.

## Diferenciadores (en orden de valor)

1. **Vista del cliente bien hecha.** El cliente ve solo lo suyo, sin configurar nada raro.
   Ya está en el MVP.
2. **Aprobaciones de piezas.** El cliente aprueba o pide cambios sobre una imagen o PDF, y
   queda registrado quién, cuándo y sobre qué versión. Fase 2.
3. **WhatsApp.** En LATAM nadie abre el correo: avisos por WhatsApp con botones, y las
   respuestas vuelven a la app como comentarios. Fase 2 (ver [06](06-WHATSAPP-FUTURO.md)).
4. **Precio pensado para agencias.** En soles o dólares, plano por agencia, sin cobrar por
   cliente invitado.
5. **Plantillas de agencia.** Proyecto web, campaña de Ads, contenido mensual, con sus tareas
   ya cargadas. Fase 2.
6. **Conexión con el CRM de Lucuma.** Lead ganado → proyecto creado. Fase 2.

## Fases

| Fase | Qué | Tiempo estimado |
|---|---|---|
| 1. MVP interno | Proyectos, tareas, mensajes, archivos, comentarios, avisos, vista del cliente, papelera. Con las decisiones de SaaS de base | 3 semanas (15 días hábiles) |
| 2. Uso real en Lucuma | Corregir lo que molesta; aprobaciones, plantillas, WhatsApp, chat simple si se pide | 1 o 2 meses de uso |
| 3. Listo para vender | Cobros, registro con prueba, superadmin, términos y privacidad, landing | 2 a 3 semanas |

Referencia de ritmo: el CRM inmobiliario se construyó en alrededor de una semana, sin contar la
integración con Meta, que dependió de trámites.

## Cuándo el MVP está listo

Lucuma maneja al menos 2 o 3 proyectos reales de clientes en la herramienta, sin volver a
WhatsApp ni a Drive para coordinar.

## Cobros (fase 3)

Stripe no acepta comercios con sede en Perú. Opciones:

- **Clientes fuera de Perú:** un *merchant of record* como Paddle o Lemon Squeezy. Cobran,
  facturan y pagan los impuestos de cada país.
- **Clientes en Perú:** Culqi o Mercado Pago, en soles.

## Legal (fase 3)

- Términos de servicio y política de privacidad.
- Ley 29733 (protección de datos personales, Perú) y GDPR si hay clientes en España: exportar
  los datos de la cuenta y borrarla a pedido. El modelo ya lo contempla (`Account.closedAt`,
  job `account.export` y `account.purge`).
- Lucuma actúa como encargado del tratamiento de los datos de los clientes de cada agencia.
