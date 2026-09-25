import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { CommandesModule } from './commandes/commandes.module.js';
import { ComptesModule } from './comptes/comptes.module.js';
import { validerEnvironnement } from './config/variables-environnement.js';
import { GraphqlApiModule } from './graphql/graphql-api.module.js';
import { PrixModule } from './prix/prix.module.js';
import { ProduitsModule } from './produits/produits.module.js';
import { VendeursModule } from './vendeurs/vendeurs.module.js';

@Module({
  imports: [
    // 6.12 : pendant les tests (Vitest définit NODE_ENV=test), c'est .env.test qui est lu.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validerEnvironnement,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enTest = process.env.NODE_ENV === 'test';
        const base = String(config.get('DB_NAME'));
        // 6.12 : le garde-fou. dropSchema sur la mauvaise base, c'est toutes les données perdues.
        if (enTest && !base.endsWith('_test')) {
          throw new Error(`Base « ${base} » refusée en test : son nom doit finir par _test`);
        }
        return {
          type: 'postgres' as const,
          host: config.get('DB_HOST'),
          port: config.get('DB_PORT'),
          username: config.get('DB_USER'),
          password: config.get('DB_PASSWORD'),
          database: base,
          autoLoadEntities: true,
          // 5.14 : hors tests, ce sont les migrations qui créent le schéma.
          // 6.12 : en test, la base est jetable : tables supprimées puis recréées à chaque démarrage.
          synchronize: enTest,
          dropSchema: enTest,
        };
      },
    }),
    // 7.18 : 100 requêtes par minute et par client (IP), sauf limite plus stricte sur une route.
    // 7.19 : `skipIf` lit process.env à CHAQUE requête : .env.test coupe la limitation, et le test
    // des abus la réactive (ConfigService figerait la valeur lue au démarrage).
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        skipIf: () => process.env.THROTTLE_ACTIF === 'false',
      }),
    }),
    AuthModule,
    ComptesModule,
    ProduitsModule,
    CategoriesModule,
    VendeursModule,
    CommandesModule,
    PrixModule,
    // Bonus 5.22 à 5.24 : l'API GraphQL, à côté de l'API REST.
    // ⚠ Depuis la partie 7, le guard global du cours (AuthGuard, qui lit la requête avec switchToHttp())
    // ne sait pas traiter une requête GraphQL : les queries répondent INTERNAL_SERVER_ERROR. Le cours
    // n'en parle pas ; il faudrait lire la requête avec GqlExecutionContext dans les guards.
    GraphQLModule.forRoot<ApolloDriverConfig>({ driver: ApolloDriver, autoSchemaFile: true }),
    GraphqlApiModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
