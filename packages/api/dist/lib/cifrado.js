/**
 * Cifrado de los accesos protegidos (D-66): AES-256-GCM con la clave ACCESOS_CLAVE del .env
 * (32 bytes, en hex o base64). La base y los respaldos solo guardan el texto cifrado; sin la
 * clave no se leen. Formato: `v1.<iv>.<tag>.<cifrado>` (base64url).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env.js';
import { HttpError } from './errores.js';
/** La clave del .env como 32 bytes, o null si falta o no sirve. */
export function claveDesde(texto) {
    const t = texto.trim();
    if (/^[0-9a-f]{64}$/i.test(t))
        return Buffer.from(t, 'hex');
    const b = Buffer.from(t, 'base64');
    return t && b.length === 32 ? b : null;
}
/** Una clave nueva para poner en ACCESOS_CLAVE. */
export const claveNueva = () => randomBytes(32).toString('hex');
function clave() {
    const k = claveDesde(env.accesosClave);
    if (!k)
        throw new HttpError(503, 'Los accesos protegidos todavía no están activados en el servidor (falta ACCESOS_CLAVE).');
    return k;
}
export const hayClaveAccesos = () => !!claveDesde(env.accesosClave);
export function cifrar(datos) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', clave(), iv);
    const cuerpo = Buffer.concat([c.update(JSON.stringify(datos), 'utf8'), c.final()]);
    return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), cuerpo.toString('base64url')].join('.');
}
export function descifrar(texto) {
    const [v, iv, tag, cuerpo] = texto.split('.');
    if (v !== 'v1' || !iv || !tag || !cuerpo)
        throw new HttpError(500, 'El acceso guardado está dañado.');
    try {
        const d = createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64url'));
        d.setAuthTag(Buffer.from(tag, 'base64url'));
        return JSON.parse(Buffer.concat([d.update(Buffer.from(cuerpo, 'base64url')), d.final()]).toString('utf8'));
    }
    catch (e) {
        if (e instanceof HttpError)
            throw e;
        throw new HttpError(500, 'No se puede leer este acceso con la clave actual del servidor (¿cambió ACCESOS_CLAVE?).');
    }
}
