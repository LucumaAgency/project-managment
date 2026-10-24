/** Error previsto con código HTTP: el manejador de app.ts devuelve su código y su mensaje tal cual (también 503). */
export declare class HttpError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string);
}
