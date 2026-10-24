/** Error previsto con código HTTP: el manejador de app.ts devuelve su código y su mensaje tal cual (también 503). */
export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
