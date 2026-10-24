# 06. WhatsApp (fase 2)

Fuera del MVP (D-04). Diseño acordado el 2026-10-24 para cuando se haga. El CRM inmobiliario ya
integra la Cloud API de WhatsApp y sus aprendizajes aplican aquí.

## Experiencia buscada

1. A la clienta le llega por WhatsApp: *"Lucuma subió 'Home v2' al proyecto Proba. ¿Lo
   apruebas?"* con botones **Aprobar · Pedir cambios · Ver**.
2. Toca Aprobar: en la app el archivo queda aprobado por ella, con fecha.
3. O responde citando el mensaje ("el logo más grande"): aparece como comentario en el archivo.
4. Si manda foto o audio, se guarda como adjunto del comentario.

El cliente no necesita entrar a la app. Es el diferenciador principal frente a Basecamp.

## Funcionamiento

**Salida:** evento en la app (asignación, mención, archivo para aprobar) → job revisa si la
persona aceptó WhatsApp → envía una **plantilla** aprobada por Meta con botones → guarda el ID
del mensaje de WhatsApp junto al elemento.

**Entrada:** Meta llama al webhook → se verifica la firma → se identifica a la persona por su
número y el elemento por el mensaje citado o el botón → se crea el comentario o la aprobación →
los adjuntos se descargan a R2.

Si responde sin citar, se asocia a la última conversación; si hay duda, se le pregunta con un
menú ("¿Sobre cuál proyecto?").

## Reglas de Meta

- Si la empresa inicia la conversación, solo plantillas aprobadas (los avisos de tareas son
  categoría "utilidad").
- Cuando la persona responde, hay 24 horas para escribirle texto libre.
- Consentimiento obligatorio (casilla + verificación del número con código) y baja posible.
- Las plantillas se cobran por mensaje según país (centavos de dólar); las respuestas dentro
  de las 24 horas no.
- Si muchos bloquean el número, Meta baja los límites: pocos avisos y útiles.

## Qué número envía

| Opción | Cómo | Pros | Contras |
|---|---|---|---|
| 1. Número de la plataforma | Todos los avisos salen de un número de Lucuma | Simple, una verificación | El cliente ve la marca de la plataforma, no la de su agencia |
| 2. Cada agencia conecta el suyo | Embedded Signup de Meta | Profesional; cada agencia paga sus mensajes | Hay que registrarse como Tech Provider en Meta (trámite largo) |

**Recomendado:** empezar con la 1 (número de Lucuma) y pasar a la 2 al vender. Un intermediario
(360dialog, Twilio, Gupshup) puede acelerar el trámite a cambio de una cuota mensual.

## No usar

Librerías no oficiales (Baileys, whatsapp-web.js, Evolution API): conectan un WhatsApp normal
por QR, violan los términos y el número puede ser bloqueado. Solo para probar la experiencia.

## Esfuerzo

| Parte | Tiempo |
|---|---|
| Número, verificación del negocio, 3 o 4 plantillas | Trámite de días a semanas (depende de Meta) |
| Envío de avisos y registro del ID del mensaje | 1 o 2 días |
| Webhook: comentarios, botones, adjuntos | 2 o 3 días |
| Consentimiento, verificación del número, preferencias | 1 día |

Unos 5 días de código. **Conviene iniciar el trámite con Meta antes de empezar la fase 2.**

## Aprendizajes del CRM que aplican

- Hay que suscribir la app a la WABA por API (`POST /{WABA_ID}/subscribed_apps`); guardar el
  webhook no basta.
- Sin el secreto de la app el webhook debe responder error y Meta reintenta.
- Clientes que no comparten número llegan con un identificador de usuario de negocio (BSUID)
  en vez del número, y se responde con `recipient`, no con `to`.
- Token permanente de usuario del sistema; los del explorador caducan en horas.
