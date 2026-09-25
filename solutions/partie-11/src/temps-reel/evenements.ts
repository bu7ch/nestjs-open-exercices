import type { StatutCommande } from '../commandes/transitions.js';

// 11.1 : les événements, décrits une fois pour le serveur ET pour les tests (une faute de frappe ne
// compile plus).

/** Une ligne de commande telle que la voit le vendeur : le nom du produit et la quantité. */
export interface LigneNotifiee {
  produit: string;
  quantite: number;
}

/** 11.1 : ce que reçoit le vendeur ; 11.5 : seulement SES lignes. */
export interface CommandeCreee {
  commandeId: number;
  lignes: LigneNotifiee[];
}

export type Reponse<T> = { ok: true; donnees: T } | { ok: false; erreur: string | string[] };

export interface ClientVersServeur {
  // 11.6 : l'accusé contient les commandes en attente du vendeur (le rattrapage).
  'vendeur:suivre': (demande: { vendeurId: number }, ack: (reponse: Reponse<CommandeCreee[]>) => void) => void;
}

export interface ServeurVersClient {
  'commande:creee': (commande: CommandeCreee) => void;
  // 11.5, 11.7 : envoyé à l'acheteur seulement (salle compte:<id>).
  'commande:statut': (evenement: { commandeId: number; statut: StatutCommande }) => void;
}

/** 11.4 : l'identité du compte, rangée sur le socket par le middleware de connexion. */
export interface DonneesSocket {
  compte: { id: number; email: string; role: string };
}
