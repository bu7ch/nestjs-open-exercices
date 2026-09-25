import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { MasquerPrixAchatInterceptor } from './masquer-prix-achat.interceptor.js';

// 8.11 : l'interceptor appelé directement : `of` fabrique la réponse du handler, `firstValueFrom` la lit.
const contexteDe = (compte?: { id: number; role: string }): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ compte }) }) }) as unknown as ExecutionContext;

const produit = () => ({ id: 1, nom: 'Lampe', prix: 30, prixAchat: 12, vendeur: { id: 5, nom: 'Chez Alice', compte: { id: 10, email: 'alice@exemple.fr', role: 'vendeur' } } });

describe('MasquerPrixAchatInterceptor', () => {
  const interceptor = new MasquerPrixAchatInterceptor();
  const lire = async (reponse: unknown, compte?: { id: number; role: string }) =>
    (await firstValueFrom(interceptor.intercept(contexteDe(compte), { handle: () => of(reponse) } as CallHandler))) as Record<string, unknown>;

  it('montre le prix d\'achat au propriétaire du produit', async () => {
    expect((await lire(produit(), { id: 10, role: 'vendeur' })).prixAchat).toBe(12);
  });

  it('le montre à un admin', async () => {
    expect((await lire(produit(), { id: 99, role: 'admin' })).prixAchat).toBe(12);
  });

  it('le masque pour un autre vendeur et pour un acheteur', async () => {
    expect((await lire(produit(), { id: 11, role: 'vendeur' })).prixAchat).toBeUndefined();
    expect((await lire(produit(), { id: 12, role: 'acheteur' })).prixAchat).toBeUndefined();
  });

  it('masque aussi dans une liste, produit par produit', async () => {
    const autre = { ...produit(), id: 2, vendeur: { id: 6, nom: 'Chez Bob', compte: { id: 11, email: 'bob@exemple.fr', role: 'vendeur' } } };
    const liste = (await lire([produit(), autre], { id: 10, role: 'vendeur' })) as unknown as Record<string, unknown>[];
    expect(liste.map((p) => p.prixAchat)).toEqual([12, undefined]);
  });

  it('ne modifie pas la réponse d\'origine', async () => {
    const origine = produit();
    await lire(origine, { id: 11, role: 'vendeur' });
    expect(origine.prixAchat).toBe(12);
    expect(origine.vendeur.compte.email).toBe('alice@exemple.fr');
  });
});
