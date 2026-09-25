import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';

// 10.3 : en production (le conteneur), il n'y a pas de .env : les variables viennent de l'environnement.
// `process.loadEnvFile()` exige que le fichier existe : on ne le charge que s'il est là.
if (existsSync('.env')) process.loadEnvFile();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
});
