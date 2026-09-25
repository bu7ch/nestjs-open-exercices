export type StatutCommande = 'en_attente' | 'payee' | 'expediee' | 'livree' | 'annulee';

// Les passages autorisés : la commande avance d'un pas à la fois, et ne s'annule qu'avant l'expédition.
const SUIVANTS: Record<StatutCommande, StatutCommande[]> = {
  en_attente: ['payee', 'annulee'],
  payee: ['expediee', 'annulee'],
  expediee: ['livree'],
  livree: [],
  annulee: [],
};

/** 6.5 : renvoie le nouveau statut, ou lève une erreur si le passage est interdit. */
export function transitionner(actuel: StatutCommande, cible: StatutCommande): StatutCommande {
  if (!SUIVANTS[actuel]?.includes(cible)) {
    throw new Error(`Passage impossible : ${actuel} vers ${cible}`);
  }
  return cible;
}
