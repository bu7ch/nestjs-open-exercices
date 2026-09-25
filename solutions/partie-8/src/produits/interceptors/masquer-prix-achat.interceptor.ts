import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import type { CompteCourantDonnees, RequeteAuthentifiee } from '../../auth/types.js';
import type { Produit } from '../produit.entity.js';

// 8.11 : `prixAchat` n'est visible que du propriétaire du produit (via son vendeur, 7.14) et d'un admin.
// Le service renvoie toujours le produit complet : la règle de confidentialité vit ici, à un seul endroit.
@Injectable()
export class MasquerPrixAchatInterceptor implements NestInterceptor {
  intercept(contexte: ExecutionContext, next: CallHandler): Observable<unknown> {
    const compte = contexte.switchToHttp().getRequest<RequeteAuthentifiee>().compte;

    // `GET /api/produits` renvoie une liste, `GET /api/produits/:id` un seul produit.
    return next.handle().pipe(map((reponse: Produit | Produit[]) => (Array.isArray(reponse) ? reponse.map((p) => masquer(p, compte)) : masquer(reponse, compte))));
  }
}

function masquer(produit: Produit, compte: CompteCourantDonnees | undefined) {
  // Une copie : la réponse d'origine n'est jamais modifiée. Le compte du vendeur (son email) ne sort
  // pas non plus : il ne servait qu'à reconnaître le propriétaire.
  const { vendeur, ...reste } = produit;
  const { compte: proprietaire, ...vendeurPublic } = vendeur ?? {};
  const autorise = compte?.role === 'admin' || (proprietaire?.id !== undefined && proprietaire.id === compte?.id);
  return {
    ...reste,
    ...(vendeur ? { vendeur: vendeurPublic } : {}),
    prixAchat: autorise ? produit.prixAchat : undefined,
  };
}
