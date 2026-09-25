import { ForbiddenException, NotFoundException, UseFilters } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { PayloadJwt } from '../auth/types.js';
import { CommandesService } from '../commandes/commandes.service.js';
import type { StatutCommande } from '../commandes/transitions.js';
import { VendeursService } from '../vendeurs/vendeurs.service.js';
import { ErreursWsFilter } from './erreurs-ws.filter.js';
import type { ClientVersServeur, CommandeCreee, DonneesSocket, ServeurVersClient } from './evenements.js';
import { SuivreVendeurDto } from './suivre-vendeur.dto.js';

type ServeurDeCommandes = Server<ClientVersServeur, ServeurVersClient, never, DonneesSocket>;
type SocketDeCommandes = Socket<ClientVersServeur, ServeurVersClient, never, DonneesSocket>;

// Les noms des salles, fabriqués à un seul endroit.
export const salleDuVendeur = (vendeurId: number) => `vendeur:${vendeurId}`;
export const salleDuCompte = (compteId: number) => `compte:${compteId}`;

// 11.1 : sur le même serveur que l'API HTTP (chemin /socket.io) ; 11.3 : l'origine du front, ici (le
// `app.enableCors(...)` de configurerApp ne concerne que les routes HTTP).
@WebSocketGateway({ cors: { origin: ['http://localhost:5173'] } })
@UseFilters(ErreursWsFilter)
export class CommandesGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  serveur: ServeurDeCommandes;

  constructor(
    private readonly jwt: JwtService,
    private readonly vendeurs: VendeursService,
    private readonly commandes: CommandesService,
  ) {}

  // 11.4 : le jeton de la partie 7, vérifié UNE fois, à la poignée de main (avant tout événement).
  afterInit(serveur: ServeurDeCommandes) {
    serveur.use(async (socket, suivant) => {
      const jeton: unknown = socket.handshake.auth.jeton;
      if (typeof jeton !== 'string') return suivant(new Error('Jeton manquant'));
      try {
        const payload = await this.jwt.verifyAsync<PayloadJwt>(jeton);
        socket.data.compte = { id: payload.sub, email: payload.email, role: payload.role };
        suivant();
      } catch {
        suivant(new Error('Jeton invalide ou expiré'));
      }
    });
  }

  // 11.5 : chaque socket entre dans la salle de son compte, pour les nouvelles de SES commandes.
  async handleConnection(client: SocketDeCommandes) {
    await client.join(salleDuCompte(client.data.compte.id));
  }

  // 11.1, 11.2 (DTO), 11.4 (propriétaire ou admin), 11.6 (le rattrapage dans l'accusé).
  @SubscribeMessage('vendeur:suivre')
  async suivre(@ConnectedSocket() client: SocketDeCommandes, @MessageBody() { vendeurId }: SuivreVendeurDto): Promise<{ ok: true; donnees: CommandeCreee[] }> {
    const vendeur = await this.vendeurs.trouverAvecCompte(vendeurId);
    if (!vendeur) throw new NotFoundException(`Vendeur ${vendeurId} introuvable`);
    // La salle se décide d'après la base, jamais d'après ce que le client affirme.
    const moi = client.data.compte;
    if (moi.role !== 'admin' && vendeur.compte?.id !== moi.id) throw new ForbiddenException('Ce vendeur ne t\'appartient pas');

    // D'abord la salle, puis la lecture : une commande passée entre les deux arrive en double (dans
    // l'accusé et en direct), jamais zéro fois.
    await client.join(salleDuVendeur(vendeurId));
    return { ok: true, donnees: await this.commandes.enAttentePourLeVendeur(vendeurId) };
  }

  /** 11.1, 11.5 : chaque vendeur concerné reçoit la commande, avec SES lignes seulement. */
  notifierCreation(parVendeur: Map<number, CommandeCreee>) {
    for (const [vendeurId, commande] of parVendeur) this.serveur.to(salleDuVendeur(vendeurId)).emit('commande:creee', commande);
  }

  /** 11.5, 11.7 : l'acheteur (tous ses onglets) apprend le nouveau statut de sa commande. */
  notifierStatut(compteId: number, commandeId: number, statut: StatutCommande) {
    this.serveur.to(salleDuCompte(compteId)).emit('commande:statut', { commandeId, statut });
  }
}
