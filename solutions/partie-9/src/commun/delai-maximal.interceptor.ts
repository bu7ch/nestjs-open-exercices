import { CallHandler, ExecutionContext, Injectable, NestInterceptor, RequestTimeoutException } from '@nestjs/common';
import { catchError, Observable, throwError, timeout, TimeoutError } from 'rxjs';

// 8.12 : au-delà du délai, le client reçoit un 408. Le handler, lui, continue : on arrête d'attendre,
// on n'annule rien.
@Injectable()
export class DelaiMaximalInterceptor implements NestInterceptor {
  constructor(private readonly delaiEnMs: number) {}

  intercept(_contexte: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.delaiEnMs),
      catchError((erreur) =>
        throwError(() => (erreur instanceof TimeoutError ? new RequestTimeoutException('La requête a pris trop de temps') : erreur)),
      ),
    );
  }
}
