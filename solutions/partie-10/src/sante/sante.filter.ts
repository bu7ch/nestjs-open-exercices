import { ArgumentsHost, Catch, ExceptionFilter, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';

// 10.10 : le filtre le plus précis gagne : posé sur SanteController, il rend le rapport de Terminus tel
// quel (ToutesExceptionsFilter n'en garderait que `Service Unavailable Exception`).
@Catch(ServiceUnavailableException)
export class SanteFilter implements ExceptionFilter {
  catch(exception: ServiceUnavailableException, hote: ArgumentsHost) {
    hote.switchToHttp().getResponse<Response>().status(503).json(exception.getResponse());
  }
}
