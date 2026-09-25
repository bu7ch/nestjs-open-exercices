import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BeforeApplicationShutdown, Logger, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Redis } from 'ioredis';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ClassementModule } from './classement/classement.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { CommandesModule } from './commandes/commandes.module.js';
import { EnvelopperInterceptor } from './commun/envelopper.interceptor.js';
import { RequeteIdMiddleware } from './commun/requete-id.middleware.js';
import { serveurMiddleware } from './commun/serveur.middleware.js';
import { ToutesExceptionsFilter } from './commun/toutes-exceptions.filter.js';
import { ComptesModule } from './comptes/comptes.module.js';
import { validerEnvironnement } from './config/variables-environnement.js';
import { GraphqlApiModule } from './graphql/graphql-api.module.js';
import { PrixModule } from './prix/prix.module.js';
import { ProduitsModule } from './produits/produits.module.js';
import { RedisThrottlerStorage } from './redis/redis-throttler.storage.js';
import { REDIS, RedisModule } from './redis/redis.module.js';
import { SanteModule } from './sante/sante.module.js';
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
    // 10.8 : les compteurs dans Redis (partagés entre instances, gardés au redémarrage).
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        skipIf: () => process.env.THROTTLE_ACTIF === 'false',
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    // 10.10 : /sante (vivant) et /sante/pret (prêt : la base et Redis).
    SanteModule,
    AuthModule,
    ComptesModule,
    ProduitsModule,
    CategoriesModule,
    VendeursModule,
    CommandesModule,
    PrixModule,
    // 9.12 : le classement des vendeurs, calculé par la base.
    ClassementModule,
    // Bonus 5.22 à 5.24 : l'API GraphQL, à côté de l'API REST.
    // ⚠ Depuis la partie 7, le guard global du cours (AuthGuard, qui lit la requête avec switchToHttp())
    // ne sait pas traiter une requête GraphQL : les queries répondent INTERNAL_SERVER_ERROR. Le cours
    // n'en parle pas ; il faudrait lire la requête avec GqlExecutionContext dans les guards (et, depuis
    // la partie 8, dans ToutesExceptionsFilter, qui écrit une réponse HTTP).
    GraphQLModule.forRoot<ApolloDriverConfig>({ driver: ApolloDriver, autoSchemaFile: true }),
    GraphqlApiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 8.13 : chaque réponse enveloppée dans `{ data }` (déclaré ici pour exister aussi dans les tests).
    { provide: APP_INTERCEPTOR, useClass: EnvelopperInterceptor },
    // 8.14 : un seul format d'erreur, pour toute l'API.
    { provide: APP_FILTER, useClass: ToutesExceptionsFilter },
  ],
})
export class AppModule implements NestModule, BeforeApplicationShutdown {
  private readonly logger = new Logger('Arret');

  // 10.12 : appelé à la réception de SIGTERM (grâce à enableShutdownHooks), avant la fermeture des connexions.
  beforeApplicationShutdown(signal?: string) {
    this.logger.log(`Signal ${signal} reçu : fin des requêtes en cours, puis arrêt`);
  }

  configure(consumer: MiddlewareConsumer) {
    // 8.4 : un identifiant pour chaque requête ; 8.6, 10.10 : sauf pour /sante et /sante/pret
    // (les accolades rendent la suite facultative : `sante`, suivi ou non de `/…`).
    consumer.apply(RequeteIdMiddleware).exclude({ path: 'sante{/*reste}', method: RequestMethod.GET }).forRoutes('*');
    // 8.6 : un middleware fonctionnel, sur toutes les réponses.
    consumer.apply(serveurMiddleware).forRoutes('*');
  }
}
