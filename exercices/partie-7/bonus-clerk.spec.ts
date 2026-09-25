import { Controller, Get, Module, Req, UseGuards, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { parametresBase, sql, verifierBaseDeTest, verifierBaseJoignable } from '../partie-5/outils.js';
import { chargerExports } from './outils.js';

// Bonus de la section h (7.24 à 7.26). Ces tests ne tournent que si ton code utilise Clerk
// (`@clerk/backend` quelque part dans src/) : sinon ils sont ignorés (« skipped »). Le paquet est déjà
// dans package.json. Aucun compte Clerk n'est nécessaire : comme dans le cours, les jetons sont signés
// ici avec une paire de clés RSA fabriquée par le test, et la clé publique est donnée à ton guard par
// CLERK_JWT_KEY (vérification sans appel réseau). Ton ClerkGuard, ton entité ProfilClerk et ton
// ProfilsService sont montés dans un petit module de test, sur la base de test.
// À faire toi-même : le script du 7.24 (les six `reason`), et le vrai compte Clerk du 7.26 (un vrai
// compte, une vraie clé secrète et de vrais jetons de session ne se testent pas ici).
const sources = import.meta.glob(['../../src/**/*.ts', '!../../src/**/*.spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const clerkActif = Object.values(sources).some((code) => code.includes('@clerk/backend'));

type Classe = new (...args: never[]) => unknown;

const ORIGINE = 'http://localhost:5173';
const paire = generateKeyPairSync('rsa', { modulusLength: 2048 });
const etrangere = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CLE_PUBLIQUE = paire.publicKey.export({ type: 'spki', format: 'pem' }).toString();

/** Un jeton qui imite un jeton de session Clerk (RS256, sub, sid, azp). */
const jetonDe = (sub: string, extra: Record<string, unknown> = {}, cle: KeyObject = paire.privateKey, expiresIn = 60) =>
  new JwtService().sign(
    { sub, sid: 'sess_2xyz', azp: ORIGINE, iss: 'https://exemple.clerk.accounts.dev', ...extra },
    { privateKey: cle.export({ type: 'pkcs8', format: 'pem' }).toString(), algorithm: 'RS256', expiresIn, notBefore: 0 },
  );

describe.skipIf(!clerkActif)('Partie 7 · Bonus : Clerk (exercices 7.24 à 7.26)', () => {
  let app: INestApplication | undefined;
  let table: string;
  let colonneClerkId: string;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  beforeAll(async () => {
    try {
      const p = parametresBase();
      verifierBaseDeTest(p.database);
      await verifierBaseJoignable();
      const { ClerkGuard, ProfilClerk, ProfilsService } = await chargerExports<{ ClerkGuard: Classe; ProfilClerk: Classe; ProfilsService: Classe }>({
        ClerkGuard: 'Écris `export class ClerkGuard implements CanActivate` (exercice 7.25).',
        ProfilClerk: 'Écris l\'entité `export class ProfilClerk` (exercice 7.25).',
        ProfilsService: 'Écris `export class ProfilsService`, avec `trouverOuCreer(clerkId)` (exercice 7.25).',
      });
      // @nestjs/typeorm est rechargé avec ton code : on prend le même exemplaire que ton ProfilsService.
      const { TypeOrmModule } = await import('@nestjs/typeorm');

      @Controller('api/clerk')
      class DemoController {
        @Get('moi')
        moi(@Req() requete: Record<string, unknown>) {
          return requete.profil ?? requete.user ?? requete.compte ?? requete.utilisateur;
        }
      }
      UseGuards(ClerkGuard)(DemoController);

      @Module({
        imports: [
          ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ CLERK_JWT_KEY: CLE_PUBLIQUE, CLERK_AUTHORIZED_PARTIES: ORIGINE })] }),
          TypeOrmModule.forRoot({
            type: 'postgres',
            host: p.host,
            port: p.port,
            username: p.user,
            password: p.password,
            database: p.database,
            entities: [ProfilClerk],
            dropSchema: true,
            synchronize: true,
          }),
          TypeOrmModule.forFeature([ProfilClerk]),
        ],
        controllers: [DemoController],
        providers: [ProfilsService, ClerkGuard],
      })
      class DemoModule {}

      const module = await Test.createTestingModule({ imports: [DemoModule] }).compile();
      app = module.createNestApplication({ logger: false });
      await app.init();
      const meta = app.get<DataSource>((await import('typeorm')).DataSource).getMetadata(ProfilClerk);
      table = meta.tableName;
      colonneClerkId = meta.findColumnWithPropertyName('clerkId')?.databaseName ?? 'clerkId';
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => app?.close());

  const http = () => request(app!.getHttpServer());
  const profils = async (clerkId: string) => Number((await sql<{ n: string }>(`SELECT count(*) AS n FROM "${table}" WHERE "${colonneClerkId}" = $1`, [clerkId]))[0]!.n);

  it('7.25 · un jeton valide passe, et crée le profil local à la première requête, puis le réutilise', async () => {
    const r = await http().get('/api/clerk/moi').set('Authorization', `Bearer ${jetonDe('user_premier')}`);
    expect(r.status, '`verifyToken(jeton, { jwtKey: CLERK_JWT_KEY, authorizedParties: CLERK_AUTHORIZED_PARTIES.split(\',\') })`').toBe(200);
    expect(r.body, 'le guard range le profil sur la requête (`requete.profil = await this.profils.trouverOuCreer(payload.sub)`)').toMatchObject({ clerkId: 'user_premier' });
    expect(await profils('user_premier')).toBe(1);
    const encore = await http().get('/api/clerk/moi').set('Authorization', `Bearer ${jetonDe('user_premier')}`).expect(200);
    expect(encore.body.id, 'le même profil, réutilisé').toBe(r.body.id);
    expect(await profils('user_premier')).toBe(1);
  });

  it('7.25 · cinq premières requêtes simultanées : cinq 200, un seul profil (upsert)', async () => {
    const jeton = jetonDe('user_simultane');
    const reponses = await Promise.all(Array.from({ length: 5 }, () => http().get('/api/clerk/moi').set('Authorization', `Bearer ${jeton}`)));
    expect(reponses.map((r) => r.status), '« chercher puis créer » laisse passer plusieurs créations : `upsert({ clerkId }, [\'clerkId\'])`').toEqual([200, 200, 200, 200, 200]);
    expect(await profils('user_simultane')).toBe(1);
  });

  it('7.25 · sans jeton, jeton expiré, autre clé, autre origine : 401, et aucun profil créé', async () => {
    await http().get('/api/clerk/moi').expect(401);
    const cas: [string, string][] = [
      ['expiré', jetonDe('user_refuse', {}, paire.privateKey, -60)],
      ['signé avec une autre clé', jetonDe('user_refuse', {}, etrangere.privateKey)],
      ['émis pour une autre origine', jetonDe('user_refuse', { azp: 'http://mechant.example' })],
      ['mal formé', 'pas-un-jwt'],
    ];
    for (const [quoi, jeton] of cas) {
      const r = await http().get('/api/clerk/moi').set('Authorization', `Bearer ${jeton}`);
      expect(r.status, `jeton ${quoi} : attrape l'erreur de verifyToken et lève une UnauthorizedException`).toBe(401);
    }
    expect(await profils('user_refuse'), 'un jeton refusé ne doit laisser aucune trace dans ta base').toBe(0);
  });
});
