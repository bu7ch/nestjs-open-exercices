import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

// 11.9 : les salles de socket.io sont locales à chaque instance ; l'adaptateur Redis relaie chaque
// émission vers les autres instances (celle dont le worker a traité le job n'est pas forcément celle où
// l'acheteur est connecté).
export class RedisIoAdapter extends IoAdapter {
  private readonly clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly redis: { host: string; port: number },
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const serveur: Server = super.createIOServer(port, options);
    const publication = new Redis(this.redis);
    const abonnement = publication.duplicate();
    this.clients.push(publication, abonnement);
    serveur.adapter(createAdapter(publication, abonnement));
    return serveur;
  }

  // Appelé par NestJS à l'arrêt de l'application : on ferme les deux connexions.
  // Écart avec le cours : une connexion encore en cours d'ouverture (application arrêtée aussitôt
  // démarrée, comme dans un test) est d'abord menée à son terme. Sinon, `quit()` rejette les abonnements
  // que l'adaptateur y a mis en attente, et personne ne les attrape : `Unhandled Rejection: Connection is closed.`
  override async dispose() {
    await super.dispose();
    await Promise.all(
      this.clients.map(async (client) => {
        if (client.status === 'connecting' || client.status === 'connect') {
          await new Promise((fin) => ['ready', 'end', 'error'].forEach((evenement) => client.once(evenement, fin)));
        }
        await client.quit().catch(() => undefined);
      }),
    );
  }
}
