/** Error con código HTTP: el manejador de app.ts lo devuelve tal cual (solo códigos < 500). */
export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
