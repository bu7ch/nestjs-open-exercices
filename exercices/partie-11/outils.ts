/// <reference types="vite/client" />
import type { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Queue, QueueEvents, Worker, type Job } from 'bullmq';
import { io, type Socket as SocketClient } from 'socket.io-client';
import { portEcoute } from '../aide.js';
import { entite, relationVers, sql, type AppAvecBase, type OptionsBase } from '../partie-5/outils.js';
import { compteConnecte, creerBoutique, creerProduit, donnees, type CompteConnecte } from '../partie-8/outils.js';
import { ENV_P10, ENV_REDIS, verifierRedisJoignable } from '../partie-10/outils.js';
import { lancerAvecAuth } from '../partie-7/outils.js';

// Les outils de la partie 11. Comme dans les parties 7 à 10, les tests démarrent TON application (avec
// leurs secrets, la base de test et le Redis des tests), mais cette fois sur un vrai port : ils s'y
// connectent avec de vrais clients `socket.io-client`, comme le ferait le front, et attendent de vrais
// jobs BullMQ dans Redis. Aucune attente « au hasard » : on attend un événement (avec un délai maximal,
// pour qu'un événement qui n'arrive jamais donne un message clair plutôt qu'un test bloqué).

/** Le secret des webhooks des tests (bonus 11.13) : connu ici, il permet de signer les livraisons. */
export const SECRET_WEBHOOK = 'whsec_secret-des-tests-de-la-partie-11';

/**
 * Les variables des tests de la partie 11 : celles de la partie 10, un délai de paiement très long (aucune
 * commande n'expire pendant un test, sauf quand le test le décide) et le secret des webhooks.
 */
export const ENV_P11: Record<string, string> = { ...ENV_P10, DELAI_PAIEMENT_MS: '3600000', WEBHOOK_SECRET: SECRET_WEBHOOK };

/** L'origine du front, celle que ton gateway (11.3) et ton `enableCors` (7.20) autorisent. */
export const ORIGINE_FRONT = 'http://localhost:5173';

export interface AppP11 extends AppAvecBase {
  /** L'adresse où écoute ton application (`http://127.0.0.1:<port>`). */
  url: string;
}

/**
 * Démarre ton application (comme en partie 10), avec `rawBody: true` comme le cours le fait répéter aux
 * tests (11.13), et la fait écouter sur un port libre : un client socket.io a besoin d'un vrai port.
 */
export async function lancerP11(options: OptionsBase = {}): Promise<AppP11> {
  await verifierRedisJoignable();
  const lancee = await lancerAvecAuth({ ...options, optionsApp: { rawBody: true, ...options.optionsApp }, env: { ...ENV_P11, ...options.env } });
  const app = lancee.app;
  await adaptateurPret(app);
  return {
    ...lancee,
    url: `http://127.0.0.1:${portEcoute(app)}`,
    fermer: async () => {
      fermerClients(app);
      await lancee.fermer();
    },
  };
}

/**
 * Si ton gateway passe par l'adaptateur Redis (11.9), attend que ses deux connexions soient ouvertes : une
 * application arrêtée pendant qu'elles s'ouvrent laisse des abonnements rejetés que personne n'attrape
 * (`Connection is closed`), et Vitest compterait ces erreurs contre toi.
 */
async function adaptateurPret(app: INestApplication): Promise<void> {
  let adaptateur: { pubClient?: unknown; subClient?: unknown } | undefined;
  try {
    adaptateur = (passerelle(app).serveur as unknown as { adapter?: typeof adaptateur }).adapter;
  } catch {
    return; // pas (encore) de gateway : les tests le diront
  }
  const clients = [adaptateur?.pubClient, adaptateur?.subClient].filter((c): c is { status?: string; once(e: string, f: () => void): void } => !!c && typeof c === 'object' && 'status' in c);
  await Promise.all(
    clients.map((c) =>
      c.status === 'connecting' || c.status === 'connect' || c.status === 'wait'
        ? new Promise<void>((fin) => {
            const minuteur = setTimeout(fin, 3000);
            for (const e of ['ready', 'end', 'error']) c.once(e, () => (clearTimeout(minuteur), fin()));
          })
        : undefined,
    ),
  );
}

// --- Ton code, retrouvé dans l'application démarrée -------------------------------------------------

/** Toutes les instances des providers de ton application (dans tous ses modules). */
export function instances(app: INestApplication): unknown[] {
  const trouvees = new Set<unknown>();
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.providers.values()) {
      const instance = (wrapper as { instance?: unknown }).instance;
      if (instance && typeof instance === 'object') trouvees.add(instance);
    }
  }
  return [...trouvees];
}

/** Tes files BullMQ (`@InjectQueue`, `BullModule.registerQueue`), quels que soient leurs noms. */
export function files(app: INestApplication): Queue[] {
  return instances(app).filter((i): i is Queue => i instanceof Queue);
}

/** Tes workers BullMQ : ceux des classes `@Processor(...)` (`.worker`), ou un `Worker` rangé dans un provider. */
export function workers(app: INestApplication): Worker[] {
  const trouves = new Set<Worker>();
  for (const instance of instances(app)) {
    if (instance instanceof Worker) trouves.add(instance);
    let depuisHote: unknown;
    try {
      depuisHote = (instance as { worker?: unknown }).worker;
    } catch {
      // WorkerHost lève une erreur si le worker n'existe pas (encore)
    }
    if (depuisHote instanceof Worker) trouves.add(depuisHote);
    for (const valeur of Object.values(instance as object)) if (valeur instanceof Worker) trouves.add(valeur);
  }
  return [...trouves];
}

interface ServeurIo {
  to(salle: string): { emit(evenement: string, ...args: unknown[]): unknown };
  adapter: { rooms: Map<string, Set<string>> };
}

export interface Passerelle {
  classe: Function;
  instance: object;
  /** Le chemin à ajouter à l'URL pour se connecter (`''`, ou `/<namespace>`). */
  espace: string;
  /** Le serveur (ou l'espace de noms) socket.io de ton gateway. */
  serveur: ServeurIo;
}

const INDICE_GATEWAY = 'Crée ton `CommandesGateway` (`@WebSocketGateway(...)`, déclaré dans les `providers` d\'un module importé par AppModule) et installe `@nestjs/websockets` et `@nestjs/platform-socket.io` (exercice 11.1).';

/** Ton gateway (la classe `@WebSocketGateway`), son espace de noms et son serveur socket.io. */
export function passerelle(app: INestApplication): Passerelle {
  for (const instance of instances(app)) {
    const classe = (instance as object).constructor;
    if (Reflect.getMetadata('websockets:is_gateway', classe) !== true) continue;
    const port = Number(Reflect.getMetadata('port', classe) ?? 0);
    if (port) throw new Error(`Ton gateway écoute sur un port à part (${port}) : écris \`@WebSocketGateway({ ... })\` sans numéro de port, pour qu'il s'installe sur le serveur de ton API (exercice 11.1).`);
    const options = (Reflect.getMetadata('websockets:gateway_options', classe) ?? {}) as { namespace?: unknown };
    const espace = typeof options.namespace === 'string' && options.namespace !== '' && options.namespace !== '/' ? `/${options.namespace.replace(/^\/+/, '')}` : '';
    let serveur: ServeurIo | undefined;
    for (const valeur of Object.values(instance as object)) {
      const v = valeur as { of?: unknown; to?: unknown; adapter?: unknown; sockets?: unknown } | null;
      if (!v || typeof v !== 'object' || typeof v.to !== 'function') continue;
      // Un Server (sa méthode `of` donne l'espace de noms) ou directement un Namespace (qui a `adapter`).
      if (typeof v.of === 'function') serveur = (v.of as (n: string) => ServeurIo)(espace || '/');
      else if (v.adapter) serveur = v as unknown as ServeurIo;
      if (serveur) break;
    }
    if (!serveur) throw new Error(`Ton gateway ${classe.name} n'a pas de serveur socket.io : ajoute \`@WebSocketServer() serveur: Server;\` (exercice 11.1).`);
    return { classe, instance: instance as object, espace, serveur };
  }
  throw new Error(`Aucun gateway dans ton application. ${INDICE_GATEWAY}`);
}

/** Les sockets (côté serveur, sur cette instance) présents dans la salle `nom`. */
export const membres = (p: Passerelle, nom: string): string[] => [...(p.serveur.adapter.rooms.get(nom) ?? [])];

// --- De vrais clients socket.io ---------------------------------------------------------------------

export type Client = SocketClient;

const ouverts = new Map<INestApplication, Set<Client>>();

/** Referme tous les clients ouverts sur cette application (ou sur toutes). */
export function fermerClients(app?: INestApplication): void {
  for (const [a, clients] of ouverts) {
    if (app && a !== app) continue;
    for (const c of clients) {
      c.removeAllListeners();
      c.io.removeAllListeners();
      c.io.reconnection(false);
      c.close();
    }
    clients.clear();
  }
}

/** Le jeton d'un compte connecté (son en-tête `Bearer …`, sans `Bearer `). */
export const jetonDe = (compte: { bearer: string }): string => compte.bearer.replace(/^Bearer /, '');

export interface OptionsClient {
  /** Laisser le client se reconnecter tout seul (11.6), avec un délai très court. */
  reconnexion?: boolean;
}

/**
 * Ouvre un client, comme le front : `io(url, { auth: { jeton } })`, en WebSocket direct. Rejette avec
 * le message du refus (`connect_error`) : le client est alors refermé, rien ne reste ouvert.
 */
export function connecter(lancee: AppP11, jeton?: string, options: OptionsClient = {}): Promise<Client> {
  let espace = '';
  try {
    espace = passerelle(lancee.app).espace;
  } catch {
    // pas de gateway : la connexion échouera, avec son propre message
  }
  const client = io(`${lancee.url}${espace}`, {
    transports: ['websocket'],
    forceNew: true,
    // `jeton`, comme le cours (`socket.handshake.auth.jeton`) ; `token` et l'en-tête, pour les variantes.
    auth: jeton ? { jeton, token: jeton } : {},
    extraHeaders: jeton ? { authorization: `Bearer ${jeton}` } : {},
    reconnection: options.reconnexion === true,
    reconnectionDelay: 50,
    reconnectionDelayMax: 50,
    timeout: 5000,
  });
  if (!ouverts.has(lancee.app)) ouverts.set(lancee.app, new Set());
  ouverts.get(lancee.app)!.add(client);
  return new Promise((resoudre, rejeter) => {
    client.once('connect', () => resoudre(client));
    client.once('connect_error', (erreur) => {
      client.io.reconnection(false);
      client.close();
      rejeter(erreur);
    });
  });
}

/** Ouvre un client et échoue avec un message clair si la connexion est refusée. */
export async function ouvrir(lancee: AppP11, jeton: string, options: OptionsClient = {}): Promise<Client> {
  try {
    return await connecter(lancee, jeton, options);
  } catch (erreur) {
    throw new Error(
      `La connexion socket.io à ${lancee.url} a échoué (${(erreur as Error).message}), avec un jeton valide. Vérifie ton gateway (\`@WebSocketGateway()\`, sur le même serveur que l'API, exercice 11.1) et, s'il vérifie le jeton (11.4), qu'il le lit dans \`socket.handshake.auth.jeton\` et le vérifie avec le JwtService de la partie 7.`,
    );
  }
}

/** Le prochain événement `nom` reçu par ce client, ou une erreur claire au bout de `delai` ms. */
export function attendre<T = any>(client: Client, nom: string, indice: string, delai = 3000): Promise<T> {
  const promesse = new Promise<T>((resoudre, rejeter) => {
    const surEvenement = (valeur: T) => {
      clearTimeout(minuteur);
      resoudre(valeur);
    };
    const minuteur = setTimeout(() => {
      client.off(nom, surEvenement);
      rejeter(new Error(`${nom} jamais reçu (après ${delai} ms). ${indice}`));
    }, delai);
    minuteur.unref();
    client.once(nom, surEvenement);
  });
  // Si le test échoue avant de l'attendre, ce refus-là ne doit pas s'ajouter à l'erreur (« Unhandled Rejection »).
  promesse.catch(() => undefined);
  return promesse;
}

/** Tous les événements reçus par ce client à partir de maintenant (sauf ceux de synchronisation). */
export function ecouter(client: Client): [string, unknown][] {
  const recus: [string, unknown][] = [];
  client.onAny((nom: string, ...args: unknown[]) => {
    if (nom !== SYNCHRO) recus.push([nom, args[0]]);
  });
  return recus;
}

/** Tous les `nom` reçus par ce client à partir de maintenant. */
export function collecter<T = any>(client: Client, nom: string): T[] {
  const recus: T[] = [];
  client.on(nom, (valeur: T) => recus.push(valeur));
  return recus;
}

const SYNCHRO = '__test:synchro';
let numeroSynchro = 0;

/**
 * Un point de synchronisation, sans délai : le test fait envoyer par TON serveur un dernier événement à
 * ce client, et attend qu'il arrive. socket.io livre les messages d'une même connexion dans l'ordre où le
 * serveur les envoie : tout ce que ton code a émis vers ce client avant est donc déjà arrivé. (Le cours
 * fait la même chose avec un aller-retour du client.)
 */
export async function synchroniser(lancee: AppP11, client: Client): Promise<void> {
  const p = passerelle(lancee.app);
  const numero = ++numeroSynchro;
  const recu = new Promise<void>((resoudre, rejeter) => {
    const minuteur = setTimeout(() => rejeter(new Error('Le point de synchronisation du test n\'est pas arrivé (connexion coupée ?).')), 3000);
    const surSynchro = (n: number) => {
      if (n !== numero) return;
      clearTimeout(minuteur);
      client.off(SYNCHRO, surSynchro);
      resoudre();
    };
    client.on(SYNCHRO, surSynchro);
  });
  p.serveur.to(client.id!).emit(SYNCHRO, numero);
  await recu;
}

/** `vendeur:suivre` avec accusé, ou une erreur claire si l'accusé ne revient jamais. */
export async function suivre(client: Client, vendeurId: unknown, indice = ''): Promise<any> {
  try {
    return await client.timeout(3000).emitWithAck('vendeur:suivre', { vendeurId });
  } catch {
    throw new Error(
      `\`vendeur:suivre\` n'a reçu aucun accusé de réception en 3 s. ${indice || 'Ta méthode `@SubscribeMessage(\'vendeur:suivre\')` doit RENVOYER `{ ok: true, donnees: ... }` (11.1) ; en cas d\'erreur, c\'est ton `ErreursWsFilter` qui appelle l\'accusé (11.2). Si ton AuthGuard global n\'ignore pas les contextes non HTTP (`if (contexte.getType() !== \'http\') return true;`, 11.3), il plante sur chaque événement.'}`,
    );
  }
}

// --- Des données ------------------------------------------------------------------------------------

export interface Monde {
  admin: CompteConnecte;
  /** Deux vendeurs (des comptes), chacun avec sa boutique et un produit (et une variante de ce produit). */
  alice: CompteConnecte & { boutique: number; produit: number; nomProduit: string; variante: number };
  bob: CompteConnecte & { boutique: number; produit: number; nomProduit: string; variante: number };
  /** Deux acheteurs. */
  carla: CompteConnecte;
  dan: CompteConnecte;
}

/** Une variante neuve du produit (posée avec tes entités). */
export async function creerVariante(lancee: AppAvecBase, produitId: number, nom = 'Rouge'): Promise<number> {
  const variante = entite(lancee.ds, 'Variante', '');
  const versProduit = relationVers(variante, 'Produit', 'many-to-one');
  if (!versProduit) throw new Error('L\'entité Variante n\'a plus de relation vers Produit (exercice 5.11).');
  const { id } = (await lancee.ds.getRepository('Variante').save({ nom, [versProduit.propertyName]: { id: produitId } })) as unknown as { id: number };
  return id;
}

/** Deux vendeurs avec leur boutique et un produit chacun, un admin, deux acheteurs. */
export async function creerMonde(lancee: AppAvecBase): Promise<Monde> {
  const vendeur = async (nomProduit: string) => {
    const compte = await compteConnecte(lancee, 'vendeur');
    const boutique = await creerBoutique(lancee, compte.id, `Boutique de ${nomProduit}`);
    const produit = await creerProduit(lancee, boutique, { nom: nomProduit });
    return { ...compte, boutique, produit, nomProduit, variante: await creerVariante(lancee, produit) };
  };
  return {
    admin: await compteConnecte(lancee, 'admin'),
    alice: await vendeur('Table en chêne'),
    bob: await vendeur('Lampe en laiton'),
    carla: await compteConnecte(lancee),
    dan: await compteConnecte(lancee),
  };
}

/** Une commande passée par ta route `POST /api/commandes`, avec le jeton de l'acheteur ; son identifiant. */
export async function commander(lancee: AppAvecBase, acheteur: { bearer: string }, lignes: { varianteId: number; quantite: number }[]): Promise<number> {
  const r = await lancee.http().post('/api/commandes').set('Authorization', acheteur.bearer).send({ lignes });
  if (r.status !== 201) throw new Error(`POST /api/commandes a répondu ${r.status} au lieu de 201 (exercice 5.12). Réponse : ${JSON.stringify(r.body)}`);
  return Number(donnees<{ id: unknown }>(r.body)?.id);
}

/** La table de ton entité Commande. */
export const tableCommandes = (lancee: AppAvecBase): string => entite(lancee.ds, 'Commande', '').tableName;

/** Le statut d'une commande, lu en SQL. */
export async function statutDe(lancee: AppAvecBase, commandeId: number): Promise<string | undefined> {
  const [ligne] = await sql<{ statut: string }>(`SELECT statut FROM "${tableCommandes(lancee)}" WHERE id = $1`, [commandeId]);
  return ligne?.statut;
}

/**
 * Une ligne de `commande:creee` désigne-t-elle ce produit ? La consigne écrit `{ produit, quantite }` sans
 * imposer la forme de `produit` : son nom, son identifiant, ou un objet qui porte l'un ou l'autre.
 */
export function designe(produit: unknown, cible: { id: number; nom: string }): boolean {
  if (produit === cible.id || produit === cible.nom || produit === String(cible.id)) return true;
  if (produit && typeof produit === 'object') {
    const p = produit as { id?: unknown; nom?: unknown };
    return p.id === cible.id || p.nom === cible.nom;
  }
  return false;
}

// --- BullMQ, vu du test ----------------------------------------------------------------------------

export interface Fin {
  etat: 'completed' | 'failed';
  /** Le résultat du job (ce que renvoie ton `process`), ou la raison de l'échec. */
  valeur: unknown;
}

/**
 * Les événements de tes files, lus dans Redis par le test lui-même (`QueueEvents`), quel que soit le
 * worker (ou l'instance de l'application) qui traite le job. Ils sont notés dès que le test écoute : un
 * job fini avant qu'on l'attende n'est pas manqué.
 */
export class Surveillance {
  private readonly ecouteurs: QueueEvents[] = [];
  private readonly fins = new Map<string, Fin>();
  private readonly attentes = new Map<string, (fin: Fin) => void>();
  /** Les jobs ajoutés : identifiant → nom du job. */
  readonly ajouts = new Map<string, string>();
  /** Les jobs différés : identifiant → leur heure d'exécution prévue. */
  readonly differes = new Map<string, number>();

  static async de(noms: { name: string; opts?: { prefix?: string } }[]): Promise<Surveillance> {
    const s = new Surveillance();
    for (const file of noms) {
      const ecouteur = new QueueEvents(file.name, { connection: { host: ENV_REDIS.REDIS_HOST, port: Number(ENV_REDIS.REDIS_PORT) }, prefix: file.opts?.prefix });
      ecouteur.on('error', () => undefined);
      s.ecouteurs.push(ecouteur);
      ecouteur.on('added', ({ jobId, name }) => s.ajouts.set(jobId, name));
      ecouteur.on('delayed', ({ jobId, delay }) => s.differes.set(jobId, Number(delay)));
      ecouteur.on('completed', ({ jobId, returnvalue }) => s.noter(jobId, { etat: 'completed', valeur: returnvalue }));
      ecouteur.on('failed', ({ jobId, failedReason }) => s.noter(jobId, { etat: 'failed', valeur: failedReason }));
      await ecouteur.waitUntilReady();
    }
    return s;
  }

  private noter(jobId: string, fin: Fin) {
    // Un « failed » suivi d'un réessai n'est pas une fin : on garde le dernier événement, et un
    // « completed » l'emporte toujours.
    if (this.fins.get(jobId)?.etat === 'completed') return;
    this.fins.set(jobId, fin);
    this.attentes.get(jobId)?.(fin);
  }

  /** Oublie ce qui a été noté pour ce job (avant de le relancer). */
  oublier(jobId: string) {
    this.fins.delete(jobId);
  }

  /**
   * La fin du job `jobId` (réussi, ou en échec). Avec `definitive`, un échec ne compte que si le job est
   * vraiment à l'état `failed` (plus de tentative) : il faut alors la file, pour le vérifier.
   */
  fin(jobId: string, indice: string, delai = 5000, file?: Queue): Promise<Fin> {
    const promesse = new Promise<Fin>((resoudre, rejeter) => {
      let fini = false;
      const verifier = async (f: Fin) => {
        if (fini) return;
        if (f.etat === 'failed' && file) {
          const job = await file.getJob(jobId);
          if (job && (await job.getState()) !== 'failed') return; // une tentative ratée, une autre suivra
        }
        fini = true;
        clearTimeout(minuteur);
        this.attentes.delete(jobId);
        resoudre(f);
      };
      const minuteur = setTimeout(() => {
        fini = true;
        this.attentes.delete(jobId);
        rejeter(new Error(`Le job ${jobId} ne s'est pas terminé en ${delai / 1000} s. ${indice}`));
      }, delai);
      minuteur.unref();
      this.attentes.set(jobId, (f) => void verifier(f));
      const deja = this.fins.get(jobId);
      if (deja) void verifier(deja);
    });
    promesse.catch(() => undefined);
    return promesse;
  }

  async fermer() {
    await Promise.all(this.ecouteurs.map((e) => e.close().catch(() => undefined)));
  }
}

/** Vide toutes tes files (`obliterate`) : chaque test part de files vides, comme dans le cours. */
export async function viderFiles(app: INestApplication): Promise<void> {
  for (const file of files(app)) await file.obliterate({ force: true });
}

/** La file de ton application qui contient le job `jobId` (null si aucune). */
export async function fileDuJob(app: INestApplication, jobId: string): Promise<{ file: Queue; job: Job } | null> {
  for (const file of files(app)) {
    const job = await file.getJob(jobId);
    if (job) return { file, job };
  }
  return null;
}

/** Une file BullMQ ouverte par le test lui-même (quand ton application est arrêtée). À fermer. */
export const ouvrirFile = (nom: string, prefix?: string): Queue => new Queue(nom, { connection: { host: ENV_REDIS.REDIS_HOST, port: Number(ENV_REDIS.REDIS_PORT) }, prefix });

// --- La base, avec des pannes « sur commande » ------------------------------------------------------

/**
 * Fait échouer UNE fois la prochaine écriture visée, dans PostgreSQL lui-même (un trigger et une
 * séquence, que les transactions n'annulent pas) : ton code n'est pas touché, quelle que soit la façon
 * dont il écrit. `condition` porte sur `NEW` (la ligne écrite). Renvoie de quoi retirer la panne.
 */
export async function pannePonctuelle(table: string, operation: 'INSERT' | 'UPDATE', condition: string): Promise<() => Promise<void>> {
  const nom = `panne_p11_${Math.random().toString(36).slice(2, 8)}`;
  await sql(`CREATE SEQUENCE ${nom}`);
  await sql(`CREATE FUNCTION ${nom}() RETURNS trigger AS $$ BEGIN
    IF (${condition}) AND nextval('${nom}') = 1 THEN RAISE EXCEPTION 'Panne simulée par le test'; END IF;
    RETURN NEW; END $$ LANGUAGE plpgsql`);
  await sql(`CREATE TRIGGER ${nom} BEFORE ${operation} ON "${table}" FOR EACH ROW EXECUTE FUNCTION ${nom}()`);
  return async () => {
    await sql(`DROP TRIGGER IF EXISTS ${nom} ON "${table}"`);
    await sql(`DROP FUNCTION IF EXISTS ${nom}()`);
    await sql(`DROP SEQUENCE IF EXISTS ${nom}`);
  };
}

export type { CompteConnecte };
