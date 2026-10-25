# 16. Espacio para archivos: cómo lo resuelven otros y qué hacemos

> Parte de la [documentación](00-INDICE.md). Investigado el 2026-10-25. Los límites de otras
> plataformas salen de sus páginas y de comparadores; cambian seguido, así que hay que
> confirmarlos en cada página de precios antes de citarlos en una venta.

## 1. El problema

Hoy los archivos van al disco del servidor (`lib/almacen.ts`, D-46). En el servidor de Vultr de
$10 ([15](15-SERVIDOR-VULTR.md)) quedan unos **40 GB libres** para todas las agencias juntas.
El catálogo de planes (`packages/shared/src/planes.ts`) promete más de lo que cabe:

| Plan | Tope de archivos | ¿Cabe en el disco? |
|---|---|---|
| Prueba | 2 GB | Sí |
| Estudio | 50 GB | Una sola agencia ya lo llena |
| Agencia | 500 GB | No |

Además, las agencias suben **video** (shoots, reels, piezas finales), y un minuto de video
pesa más que todos los documentos de un proyecto juntos.

## 2. Cómo lo resuelven otros

| Plataforma | Cómo limita | Gratis | Pagado |
|---|---|---|---|
| **Basecamp** | Tope total por cuenta | 1 GB, 1 proyecto | Plus ($15 por usuario): 500 GB · Pro Unlimited (~$299–349 al mes, usuarios ilimitados): 5 TB |
| **Slack** | Por **antigüedad**, no por tamaño | Solo se ven los últimos 90 días; lo de más de 1 año se borra | Historial completo; ~10 GB por usuario en Pro, según comparadores |
| **Notion** | Tope **por archivo** | 5 MB por archivo | 5 GB por archivo, sin tope total |
| **Trello** | Tope por archivo | 10 MB por archivo (según comparadores) | 250 MB por archivo, sin tope total |
| **ClickUp** | Tope total | 100 MB | "Ilimitado" |
| **monday.com** | Tope total por plan | 500 MB | Basic 5 GB, y sube por plan |

**Dónde los guardan:** casi todos en almacenamiento de objetos, no en el disco del servidor de
la app. El caso más conocido es Basecamp: tuvo años sus archivos en Amazon S3, y en 2025 los
pasó a equipos propios (Pure Storage, ~18 PB en dos centros de datos). Pagaba unos $1,5 millones
al año en S3 y espera bajar a menos de $200 mil. Lo hizo con **casi 10 petabytes**: a esa escala
conviene tener equipos propios; a la nuestra, no.

### Los cinco patrones

1. **Tope total por plan** (Basecamp, monday, ClickUp). Es el más fácil de explicar ("tu plan
   trae 50 GB") y empuja a subir de plan. Es lo que ya tenemos.
2. **Tope por archivo** (Notion, Trello). Corta lo que más pesa, el video crudo, sin que la
   persona sienta un límite. Ya lo tenemos: 50 MB (`ARCHIVOS_MAX_MB`).
3. **Por antigüedad** (Slack gratis). No sirve aquí: una agencia necesita el contrato de hace
   dos años.
4. **"Ilimitado" en los planes caros.** Funciona porque la mayoría usa poco. El promedio paga a
   los pocos que llenan. Se acompaña siempre de una cláusula de "uso razonable".
5. **Enlazar en vez de subir.** Basecamp, Trello y Asana dejan pegar enlaces de Google Drive,
   Dropbox o Frame.io. El archivo pesado vive en la nube de la agencia, que ya la paga.
   Nosotros tenemos el campo de tipo **enlaces** en las tareas (D-65).

## 3. Qué proponemos

**Combinar 1, 2 y 5: tope total por plan, tope por archivo según el plan, y enlazar el video
crudo.** Los archivos van a un almacenamiento de objetos cuando el disco no alcance.

### 3.1 Ya (sin código nuevo)
- **Video crudo y material de shoot: enlace, no archivo.** En las plantillas, los campos de
  "material grabado" o "brutos" van como tipo *enlaces* (Drive, WeTransfer, Frame.io). Se sube a
  la plataforma lo que se revisa o se entrega (una foto, un PDF, un corte final liviano).
- El tope de 50 MB por archivo se queda.

### 3.2 Antes de vender (fase 3)
- **Topes realistas** mientras se esté en disco. Por ejemplo: Prueba 2 GB, Estudio 20 GB,
  Agencia 100 GB. Se suben cuando los archivos pasen a almacenamiento de objetos.
- **Tope por archivo según el plan:** Prueba 50 MB, pagados 500 MB a 1 GB. Así cabe un video
  final, pero no una tarjeta de cámara entera.
- **Aviso al 80 %** del tope en la página de Archivos (el uso ya se calcula; ver `usoDeCuenta` en
  `services/archivos.ts`).
- **Uso razonable** en los términos, para el día que haya un plan "ilimitado".

### 3.3 Cuando el disco pase del 60 %, o antes de abrir planes de 100 GB o más
**Pasar los archivos a almacenamiento de objetos.** El código ya está preparado: `lib/almacen.ts`
es una interfaz de cuatro funciones (guardar, leer, borrar, existe), y basta con escribir otra
implementación compatible con S3.

| Proveedor | Precio por GB al mes | Salida (descargas) | 100 GB | 1 TB | Notas |
|---|---|---|---|---|---|
| **Cloudflare R2** | $0,015 | **Gratis** | ~$1,35 | ~$15 | 10 GB gratis. Ya usamos Cloudflare delante |
| **Backblaze B2** | ~$0,007 ($6,95 el TB) | Gratis hasta 3 veces lo guardado | ~$0,70 | ~$7 | El más barato por GB |
| Vultr Object Storage | $18 al mes con 1 TB incluido | 1 TB incluido | $18 | $18 | Mismo proveedor, pero caro hasta llenar el TB |
| Amazon S3 | ~$0,023 + $0,09 por GB descargado | Se paga | $2,30 + descargas | $23 + descargas | Las descargas lo encarecen |

**Recomendación: Cloudflare R2.** No cobra las descargas, que es lo que más se mueve en una
herramienta donde el cliente baja entregables. Además ya está Cloudflare delante y es una cuenta
menos. B2 conviene recién con varios TB.

**Cuánto cuesta por agencia:** una que usa 20 GB cuesta ~$0,30 al mes en R2. Una que llena
100 GB, ~$1,50. Frente a un precio de $8 a $10 por persona del equipo, el espacio deja de ser un
costo que importe. Por eso las plataformas grandes pueden decir "ilimitado".

**Trabajo estimado: 2 días.**
1. `almacenEnR2()` en `lib/almacen.ts` con el SDK de S3 (subida por partes, en streaming, sin
   pasar por disco).
2. Variables `ALMACEN=r2`, `R2_CUENTA`, `R2_CLAVE`, `R2_SECRETO`, `R2_BUCKET`.
3. Un script que copia lo que hay en disco al bucket y verifica cada archivo con la huella
   sha256 que ya guarda la base.
4. Opcional: descargas con enlace firmado de pocos minutos, para que los archivos grandes bajen
   directo de R2 sin pasar por el servidor. El permiso lo sigue revisando la app antes de firmar.
5. Copia del bucket a Backblaze B2 una vez por semana con `rclone`. Es la copia fuera de Vultr
   que pide [15 §6](15-SERVIDOR-VULTR.md#6-copias), en otro proveedor.

### 3.4 Lo que no vamos a hacer
- **Borrar por antigüedad** (modelo Slack): una agencia necesita el historial completo.
- **Comprimir o convertir los videos** en el servidor: necesita CPU que el plan de $10 no tiene.
  Si algún día hace falta, existen servicios para eso (Cloudflare Stream, Mux).
- **Equipos propios** (modelo Basecamp 2025): solo conviene con petabytes.

## Fuentes (2026-10-25)
- Basecamp: [capterra.com](https://www.capterra.com/p/56808/Basecamp/pricing/),
  [thedigitalprojectmanager.com](https://thedigitalprojectmanager.com/tools/basecamp-pricing)
- Basecamp deja S3: [The Register](https://www.theregister.com/2025/05/09/37signals_cloud_repatriation_storage_savings),
  [DatacenterDynamics](https://www.datacenterdynamics.com/en/news/37signals-begins-exiting-aws-storage-service/)
- Slack: [slack.com/help](https://slack.com/help/articles/115002422943-Slack-Free-plan)
- Notion: [developers.notion.com](https://developers.notion.com/guides/data-apis/working-with-files-and-media)
- monday, ClickUp, Trello: [fitsmallbusiness.com](https://fitsmallbusiness.com/monday-vs-trello/), [techrepublic.com](https://www.techrepublic.com/fr/article/monday-com-vs-clickup/)
- R2 y S3: [semaphore.io](https://semaphore.io/?p=24145)
- Backblaze B2: [egresscost.com](https://egresscost.com/backblaze-b2)
- Vultr Object Storage: [docs.vultr.com](https://docs.vultr.com/support/products/storage/pricing-and-billing)
