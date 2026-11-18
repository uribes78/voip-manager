export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
export const notFound = (what: string) => new HttpError(404, `${what} no encontrado`);
export const conflict = (msg: string) => new HttpError(409, msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const forbidden = (msg = 'No tienes permiso para esta operación') => new HttpError(403, msg);
export const unauthorized = (msg = 'No autenticado') => new HttpError(401, msg);
export const asteriskUnavailable = (msg = 'Asterisk (AMI) no disponible') => new HttpError(502, msg);
