import { Controller, Get, Module, Req, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { chargerExports, fabriquerJeton, SECRET } from './outils.js';

// Bonus de la section g (7.21 à 7.23). Ces tests ne tournent que si ton code utilise Passport
// (`PassportStrategy(` quelque part dans src/) : sinon ils sont ignorés (« skipped »), pour que
// `npm test` reste vert sans le bonus. Les paquets (@nestjs/passport, passport, passport-jwt) sont déjà
// dans package.json. Comme dans le cours, ta stratégie et ton guard sont montés dans un petit module
// de test isolé, sans base de données. 7.23 (comparer les corps des 401) est à faire toi-même.
const sources = import.meta.glob(['../../src/**/*.ts', '!../../src/**/*.spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const passportActif = Object.values(sources).some((code) => /PassportStrategy\s*\(/.test(code));

type Classe = new (...args: never[]) => unknown;

@Controller('api/passport')
class DemoController {
  @Get('ouverte')
  ouverte() {
    return 'ouverte à tous';
  }

  @Get('moi')
  moi(@Req() requete: { user: unknown }) {
    return requete.user;
  }
}

describe.skipIf(!passportActif)('Partie 7 · Bonus : Passport (exercices 7.21 à 7.23)', () => {
  let app: INestApplication | undefined;
  let JwtStrategy: Classe;
  let JwtAuthGuard: Classe;

  let echec: unknown;
  beforeEach(() => {
    if (echec) throw echec;
  });

  /** Le module du cours : ta stratégie, ton guard en APP_GUARD, et une route ouverte avec TON @Public(). */
  async function moduleDeDemo(config: Record<string, unknown>) {
    @Module({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => config] }), PassportModule, JwtModule.register({ secret: SECRET })],
      controllers: [DemoController],
      providers: [JwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
    })
    class DemoModule {}
    return Test.createTestingModule({ imports: [DemoModule] }).compile();
  }

  beforeAll(async () => {
    try {
      const trouves = await chargerExports<{ JwtStrategy: Classe; JwtAuthGuard: Classe; Public: () => MethodDecorator }>({
        JwtStrategy: 'Écris `export class JwtStrategy extends PassportStrategy(Strategy)` (exercice 7.21).',
        JwtAuthGuard: 'Écris `export class JwtAuthGuard extends AuthGuard(\'jwt\')` (exercice 7.21).',
        Public: 'Le décorateur `@Public()` de l\'exercice 7.8.',
      });
      ({ JwtStrategy, JwtAuthGuard } = trouves);
      const { Public } = trouves;
      Public()(DemoController.prototype, 'ouverte', Object.getOwnPropertyDescriptor(DemoController.prototype, 'ouverte')!);
      app = (await moduleDeDemo({ JWT_SECRET: SECRET })).createNestApplication({ logger: false });
      await app.init();
    } catch (erreur) {
      echec = erreur;
    }
  });
  afterAll(() => app?.close());

  const http = () => request(app!.getHttpServer());
  const contenu = { sub: 1, email: 'louve@exemple.fr', role: 'acheteur' };

  it('7.21 · un jeton valide passe, et `request.user` vaut { id, email, role }', async () => {
    const r = await http().get('/api/passport/moi').set('Authorization', `Bearer ${fabriquerJeton(contenu)}`);
    expect(r.status, 'ExtractJwt.fromAuthHeaderAsBearerToken(), et le secret JWT_SECRET').toBe(200);
    expect(r.body, '`validate(payload)` renvoie `{ id: payload.sub, email: payload.email, role: payload.role }`').toEqual({ id: 1, email: 'louve@exemple.fr', role: 'acheteur' });
  });

  it('7.21 · sans jeton, jeton expiré, falsifié ou signé avec un autre secret : 401', async () => {
    await http().get('/api/passport/moi').expect(401);
    const expire = fabriquerJeton(contenu, { expiresIn: -10 });
    expect((await http().get('/api/passport/moi').set('Authorization', `Bearer ${expire}`)).status, '`ignoreExpiration: false`').toBe(401);
    const etranger = fabriquerJeton(contenu, {}, 'un-autre-secret-de-plus-de-32-caracteres-xyz');
    await http().get('/api/passport/moi').set('Authorization', `Bearer ${etranger}`).expect(401);
    const [entete, , signature] = fabriquerJeton(contenu).split('.');
    const faux = Buffer.from(JSON.stringify({ ...contenu, role: 'admin' })).toString('base64url');
    await http().get('/api/passport/moi').set('Authorization', `Bearer ${entete}.${faux}.${signature}`).expect(401);
  });

  it('7.21 · le secret est lu avec getOrThrow : sans JWT_SECRET, le module refuse de démarrer', async () => {
    const sauvegarde = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      await expect(moduleDeDemo({}), '`secretOrKey: config.getOrThrow<string>(\'JWT_SECRET\')`').rejects.toThrow(/JWT_SECRET/);
    } finally {
      if (sauvegarde !== undefined) process.env.JWT_SECRET = sauvegarde;
    }
  });

  it('7.22 · sécurisé par défaut : une route @Public() répond sans jeton', async () => {
    const r = await http().get('/api/passport/ouverte');
    expect(r.status, 'surcharge `canActivate` : `estPublic ? true : super.canActivate(contexte)`').toBe(200);
  });
});
