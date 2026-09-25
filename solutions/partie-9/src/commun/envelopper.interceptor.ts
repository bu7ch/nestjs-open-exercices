import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

// 8.13 : chaque réponse réussie devient `{ "data": … }` (les erreurs passent par le filtre, pas par ici).
// Une route en 204 renvoie `{ data: undefined }`, que HTTP n'envoie pas : elle reste sans contenu.
@Injectable()
export class EnvelopperInterceptor implements NestInterceptor {
  intercept(contexte: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Le bonus GraphQL (partie 5) a son propre format de réponse : on n'y touche pas.
    if (contexte.getType() !== 'http') return next.handle();
    return next.handle().pipe(map((data: unknown) => ({ data })));
  }
}
