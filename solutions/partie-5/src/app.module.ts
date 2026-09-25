import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CategoriesModule } from './categories/categories.module.js';
import { CommandesModule } from './commandes/commandes.module.js';
import { validerEnvironnement } from './config/variables-environnement.js';
import { GraphqlApiModule } from './graphql/graphql-api.module.js';
import { ProduitsModule } from './produits/produits.module.js';
import { VendeursModule } from './vendeurs/vendeurs.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validerEnvironnement }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const base = String(config.get('DB_NAME'));
        // Garde-fou (en avance sur la partie 6, section d) : pendant les tests, jamais une autre base que *_test.
        if (process.env.NODE_ENV === 'test' && !base.endsWith('_test')) {
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
          // 5.14 : ce sont les migrations qui créent le schéma.
          synchronize: false,
        };
      },
    }),
    ProduitsModule,
    CategoriesModule,
    VendeursModule,
    CommandesModule,
    // Bonus 5.22 à 5.24 : l'API GraphQL, à côté de l'API REST.
    GraphQLModule.forRoot<ApolloDriverConfig>({ driver: ApolloDriver, autoSchemaFile: true }),
    GraphqlApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
