/**
 * Freno a la fuerza bruta: N intentos por clave en una ventana de tiempo.
 *
 * En memoria a propósito (como el CRM): basta para cortar un diccionario y no exige tabla
 * ni Redis. Con varios procesos cada uno cuenta por su lado; el límite real sube un poco
 * pero sigue siendo órdenes de magnitud menos que sin freno.
 */
export class Freno {
    maximo;
    ventanaMs;
    intentos = new Map();
    constructor(maximo, ventanaMs) {
        this.maximo = maximo;
        this.ventanaMs = ventanaMs;
    }
    bloqueado(clave) {
        const f = this.intentos.get(clave);
        if (!f)
            return false;
        if (Date.now() - f.desde > this.ventanaMs) {
            this.intentos.delete(clave);
            return false;
        }
        return f.n >= this.maximo;
    }
    anotar(clave) {
        const f = this.intentos.get(clave);
        if (!f || Date.now() - f.desde > this.ventanaMs)
            this.intentos.set(clave, { n: 1, desde: Date.now() });
        else
            f.n++;
    }
    limpiar(clave) {
        this.intentos.delete(clave);
    }
}
