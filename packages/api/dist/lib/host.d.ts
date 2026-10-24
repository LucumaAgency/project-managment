export type Destino = {
    tipo: 'cuenta';
    slug: string;
} | {
    tipo: 'raiz';
} | {
    tipo: 'ajeno';
};
/**
 * De qué cuenta es una petición según el host, con `baseDomain` = "app.com".
 * Función pura: no consulta la base (si el slug existe lo decide quien la llama).
 */
export declare function destinoDesdeHost(hostCrudo: string | undefined, baseDomain: string): Destino;
