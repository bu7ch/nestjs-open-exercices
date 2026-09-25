import 'reflect-metadata';
import { validerEnvironnement } from './variables-environnement.js';

// 10.1 : une simple fonction, testée sans NestJS ni base. La ligne 1 est nécessaire : sans elle,
// `Reflect.getMetadata is not a function` (personne n'a chargé reflect-metadata).
const complet = {
  NODE_ENV: 'production',
  DB_HOST: 'db',
  DB_USER: 'marketplace',
  DB_PASSWORD: 'un-mot-de-passe',
  DB_NAME: 'marketplace',
  NOMBRE_MAX_PRODUITS: '50',
  JWT_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
  REDIS_HOST: 'redis',
};

describe('validerEnvironnement', () => {
  it('accepte un environnement complet, convertit les nombres et complète les valeurs par défaut', () => {
    const config = validerEnvironnement(complet);
    expect(config.NOMBRE_MAX_PRODUITS).toBe(50);
    expect(config.PORT).toBe(3000);
    expect(config.DB_PORT).toBe(5432);
    expect(config.REDIS_PORT).toBe(6379);
  });

  it('refuse de démarrer sans DB_HOST, et le dit', () => {
    const { DB_HOST: _hote, ...sansHote } = complet;
    expect(() => validerEnvironnement(sansHote)).toThrow(/DB_HOST/);
  });

  it('refuse une faute de frappe dans NODE_ENV', () => {
    expect(() => validerEnvironnement({ ...complet, NODE_ENV: 'prod' })).toThrow(/NODE_ENV \(isIn\)/);
  });

  it('refuse un secret JWT trop court', () => {
    expect(() => validerEnvironnement({ ...complet, JWT_SECRET: 'court' })).toThrow(/JWT_SECRET \(minLength\)/);
  });

  it('10.8 : exige REDIS_HOST', () => {
    const { REDIS_HOST: _redis, ...sansRedis } = complet;
    expect(() => validerEnvironnement(sansRedis)).toThrow(/REDIS_HOST/);
  });
});
