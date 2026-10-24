export interface Dsn {
    url: string;
    clave: string;
}
/** https://<clave>@o1.ingest.sentry.io/<proyecto> → URL del envelope y la clave pública. */
export declare function leerDsn(dsn: string): Dsn | null;
interface Marco {
    function?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    in_app?: boolean;
}
/** La pila de V8 en marcos de Sentry, del más viejo al más nuevo (como los espera Sentry). */
export declare function marcos(pila: string | undefined): Marco[];
export interface Contexto {
    ruta?: string;
    metodo?: string;
    status?: number;
    cuenta?: string;
    usuario?: string;
    donde?: string;
}
export declare function evento(err: unknown, ctx?: Contexto): {
    user?: {
        id: string;
    } | undefined;
    event_id: string;
    timestamp: number;
    platform: string;
    level: string;
    environment: string;
    release: string;
    exception: {
        values: {
            type: string;
            value: string;
            stacktrace: {
                frames: Marco[];
            };
        }[];
    };
    tags: Record<string, string>;
};
/** Manda el error si hay DSN. Nunca lanza ni hace esperar: es lo último que debe fallar. */
export declare function reportar(err: unknown, ctx?: Contexto, dsn?: string): Promise<boolean>;
/** Para los tests. */
export declare const olvidarReportes: () => void;
export {};
