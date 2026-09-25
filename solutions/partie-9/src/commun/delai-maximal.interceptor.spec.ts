import { CallHandler, ExecutionContext, RequestTimeoutException } from '@nestjs/common';
import { firstValueFrom, map, of, throwError, timer } from 'rxjs';
import { DelaiMaximalInterceptor } from './delai-maximal.interceptor.js';

// 8.12 : un handler lent se fabrique avec `timer(200)`, un flux qui n'émet qu'au bout de 200 ms.
describe('DelaiMaximalInterceptor', () => {
  const interceptor = new DelaiMaximalInterceptor(50);
  const contexte = {} as ExecutionContext;

  it('laisse passer une réponse rapide', async () => {
    const suivant: CallHandler = { handle: () => of('rapide') };
    await expect(firstValueFrom(interceptor.intercept(contexte, suivant))).resolves.toBe('rapide');
  });

  it('lève une RequestTimeoutException quand le handler dépasse le délai', async () => {
    const suivant: CallHandler = { handle: () => timer(200).pipe(map(() => 'lent')) };
    await expect(firstValueFrom(interceptor.intercept(contexte, suivant))).rejects.toThrow(new RequestTimeoutException('La requête a pris trop de temps'));
  });

  it('laisse passer les autres erreurs telles quelles', async () => {
    const panne = new Error('panne');
    const suivant: CallHandler = { handle: () => throwError(() => panne) };
    await expect(firstValueFrom(interceptor.intercept(contexte, suivant))).rejects.toBe(panne);
  });
});
