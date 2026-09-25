import { ConfigModule, ConfigService } from '@nestjs/config';
import { createServer } from 'node:net';
import { importer, lancer, meta, portEcoute, refusDeDemarrer, type AppLancee } from '../aide.js';
import { nombreDeProduits, produitValide } from './outils.js';

type Classe = new (...args: never[]) => unknown;

const INDICE_4_13 = 'Ajoute `validate: validerEnvironnement` à `ConfigModule.forRoot(...)` (exercice 4.13).';

const portLibre = () =>
  new Promise<number>((resoudre) => {
    const serveur = createServer().listen(0, () => {
      const { port } = serveur.address() as { port: number };
      serveur.close(() => resoudre(port));
    });
  });

describe('Partie 4 · La configuration (exercices 4.11 à 4.13)', () => {
  it('4.11 · AppModule importe ConfigModule', async () => {
    const { AppModule } = await importer<Record<string, Classe>>('app.module', '');
    const imports = await Promise.all(meta('imports', AppModule!));
    const aConfig = imports.some((i) => i === ConfigModule || (i as { module?: unknown })?.module === ConfigModule);
    expect(aConfig, 'ajoute `ConfigModule.forRoot({ isGlobal: true })` aux imports d\'AppModule').toBe(true);
  });

  it('4.11 · main.ts écoute sur le PORT lu dans le .env (via ConfigModule et ConfigService)', async () => {
    const port = await portLibre();
    const lancee = await lancer({
      via: 'main',
      env: { PORT: undefined, NOMBRE_MAX_PRODUITS: undefined },
      fichierEnv: `PORT=${port}\nNOMBRE_MAX_PRODUITS=1000\n`,
    }).catch((erreur: Error) => {
      throw new Error(`4.11 · ton application n'a pas démarré avec un .env contenant PORT=${port} et NOMBRE_MAX_PRODUITS : ${erreur.message}`);
    });
    try {
      expect(portEcoute(lancee.app), 'le serveur doit écouter sur le PORT du .env : `app.listen(config.get(\'PORT\') ?? 3000)`').toBe(port);
      await lancee.http().get('/api/produits').expect(200);
    } finally {
      await lancee.fermer();
    }
  });

  describe('4.12 · NOMBRE_MAX_PRODUITS limite la création de produits', () => {
    it('ConfigService est injecté dans ProduitsService', async () => {
      const { ProduitsService } = await importer<Record<string, Classe>>('produits/produits.service', '');
      expect(meta('design:paramtypes', ProduitsService!), 'constructor(private readonly config: ConfigService)').toContain(ConfigService);
    });

    it('la création est refusée (400) quand le nombre de produits a atteint NOMBRE_MAX_PRODUITS', async () => {
      // Combien de produits au départ ? (ton tableau en mémoire)
      let lancee: AppLancee = await lancer();
      const depart = await nombreDeProduits(lancee.http);
      await lancee.fermer();

      // On autorise exactement un produit de plus.
      lancee = await lancer({ env: { NOMBRE_MAX_PRODUITS: String(depart + 1) } });
      try {
        await lancee.http().post('/api/produits').send(await produitValide(lancee.http, { nom: 'Le dernier autorisé' })).expect(201);
        const r = await lancee.http().post('/api/produits').send(await produitValide(lancee.http, { nom: 'Un de trop' }));
        expect(r.status, `avec NOMBRE_MAX_PRODUITS=${depart + 1} et ${depart + 1} produits existants, la création doit lever une BadRequestException`).toBe(400);
        expect(await nombreDeProduits(lancee.http)).toBe(depart + 1);
      } finally {
        await lancee.fermer();
      }
    });
  });

  describe('4.13 · validerEnvironnement', () => {
    it('sans NOMBRE_MAX_PRODUITS, l\'application refuse de démarrer, avec un message qui nomme la variable', async () => {
      const message = await refusDeDemarrer({ env: { NOMBRE_MAX_PRODUITS: undefined } }, INDICE_4_13);
      expect(message).toContain('NOMBRE_MAX_PRODUITS');
    });

    it('avec un NOMBRE_MAX_PRODUITS qui n\'est pas un nombre, elle refuse aussi de démarrer', async () => {
      const message = await refusDeDemarrer({ env: { NOMBRE_MAX_PRODUITS: 'beaucoup' } }, INDICE_4_13);
      expect(message).toContain('NOMBRE_MAX_PRODUITS');
    });

    it('avec un .env complet, elle démarre normalement', async () => {
      const lancee = await lancer({ env: { PORT: undefined, NOMBRE_MAX_PRODUITS: undefined }, fichierEnv: 'PORT=0\nNOMBRE_MAX_PRODUITS=50\n' });
      try {
        await lancee.http().get('/api/produits').expect(200);
      } finally {
        await lancee.fermer();
      }
    });
  });
});
