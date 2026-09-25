# NestJS Open · exercices

Le dépôt d'exercices du cours [NestJS Open](https://github.com/bu7ch/nestjs-open). Tu y écris le code de ta **marketplace** ; des tests disent si chaque exercice est réussi.

## Démarrer

1. **Fork** ce dépôt (bouton *Fork* sur GitHub), puis clone ton fork.
2. Installe et lance :

   ```bash
   npm install
   npm run start:dev
   ```

3. Fais les exercices d'une partie du cours, dans `src/`.
4. Vérifie-les :

   ```bash
   npm run test:partie-3   # les exercices de la partie 3
   npm run test:partie-4   # les exercices de la partie 4
   npm run test:partie-5   # les exercices de la partie 5 (base de données démarrée)
   npm test                # toutes les parties
   ```

Un test qui échoue te dit **quel exercice** il vérifie (`3.6 · …`) et souvent ce qui manque. Au départ, tout est rouge : c'est normal.

À chaque `push`, GitHub Actions lance les mêmes tests sur ton fork (onglet *Actions*). Le travail `exercices` est facultatif : il peut être rouge tant que tu n'as pas fini.

## Ce que les tests vérifient (et ne vérifient pas)

- Ils vérifient le **comportement** (les URL, les statuts, les données renvoyées, les messages de validation) et quelques choix de structure demandés par le cours (`ProduitsModule`, `ProduitsService`…, aux emplacements que génère `npx nest g`).
- À partir de la partie 4, ils démarrent ton application **comme en vrai**, en exécutant ton `main.ts` (avec son `ValidationPipe` et son `ConfigService`) — ou ton `configurerApp` une fois écrit en partie 6.
- Ils **ne lisent jamais ton `.env`** : chaque test fournit lui-même ses variables (`PORT`, `NOMBRE_MAX_PRODUITS`, `DB_*`…). Garde ton `.env` pour `npm run start:dev`.
- Ils ne vérifient pas les exercices « manuels » : installer, changer de port, casser volontairement une injection pour lire l'erreur. Ceux-là sont à cocher toi-même sur le site.
- Ils n'évaluent pas le style de ton code.

## Base de données (à partir de la partie 5)

Le dépôt fournit un `compose.yaml` : un PostgreSQL 16 avec l'utilisateur, le mot de passe et la base `marketplace` (celle de ton `.env`, pour `npm run start:dev`, les migrations et `npm run seed`), plus une seconde base, **`marketplace_test`**, réservée aux tests et créée au premier démarrage par `docker/initdb/`.

```bash
docker compose up -d      # ou : podman compose up -d
```

C'est le fichier que le cours te fait écrire au 5.1 (sous le nom `docker-compose.yml`) : lis-le, mais n'en crée pas un second, Docker prendrait `compose.yaml` en priorité. Si ton volume existait avant l'ajout de `docker/initdb/` (la base de test n'est alors pas créée), crée-la à la main :

```bash
docker compose exec db psql -U marketplace -d marketplace -c 'CREATE DATABASE marketplace_test;'
```

Les tests se connectent avec `DB_HOST=localhost`, `DB_PORT=5432`, `DB_USER=marketplace`, `DB_PASSWORD=marketplace` et `DB_NAME=marketplace_test` (fixés dans `vitest.config.ts`, surchargeables : `DB_PORT=55432 npm test`). Ils **refusent toute base dont le nom ne finit pas par `_test`** : ils en suppriment les tables. Chaque fichier de test repart de tables neuves et vides, recréées d'après tes entités ; les migrations (5.14 à 5.16) sont testées à part, en les exécutant sur une base vidée. Si PostgreSQL ne répond pas, le message te dit de lancer `docker compose up -d`.

Une fois ton application branchée sur la base (partie 5), les tests des parties 3 et 4 ne peuvent plus passer sur ton code : ils attendent des produits en mémoire dès le démarrage, et une méthode `categories()` synchrone. C'est normal : lance `npm run test:partie-5`, pas `npm test`. Il en va de même pour les solutions : chacune n'est vérifiée que par les tests de sa partie.

## Les solutions

Le dossier `solutions/partie-N/src` contient une solution de la partie N. Elle sert à deux choses : prouver que les exercices sont faisables (GitHub Actions vérifie que chaque solution passe ses tests), et te dépanner **après** avoir essayé. Chaque solution est une copie complète de `src/` : la solution de la partie 4 reprend celle de la partie 3.

```bash
npm run verifier:solutions      # toutes les solutions
npm run verifier:solutions 3    # seulement la partie 3
```

## Parties couvertes

| Partie | Exercices vérifiés par des tests | Bonus vérifiés | À vérifier toi-même |
|---|---|---|---|
| 3 · Ton premier serveur NestJS | 3.4 à 3.11 (produits, catégories, modules, services) | — | 3.1 à 3.3, 3.12 |
| 4 · Valider les données | 4.1, 4.2, 4.4 à 4.13 (DTO, class-validator, pipes, `.env` et `ConfigService`) | 4.14 à 4.16 (Joi, Zod), 4.17 à 4.22 (projet NBA) | 4.3 ; le message exact du 4.13 ; `z.infer` (4.15) et le branchement du pipe Zod sur la route (4.16) |
| 5 · Base de données | 5.1 (connexion TypeORM), 5.3 à 5.18 (entités, repository, relations, cascade, `409`, migrations, données de test) | 5.22 à 5.24 (GraphQL) | 5.1 (Docker/Podman, `.env`), 5.2 ; les observations `\dt`/`\d`/`psql` ; l'erreur SQL du 5.13 (`varianteId` 999) ; les scripts `migration:*` et `seed` de `package.json`, `migration:show` et l'essai `synchronize` du 5.16 ; le second champ de l'`@InputType` (5.24) ; 5.19 à 5.21 (Prisma) |

Pour la partie 4, `class-validator`, `class-transformer`, `@nestjs/config`, `joi` et `zod` sont déjà dans le `package.json` : `npm install` suffit.

Le **projet bonus NBA** (4.17 à 4.22) est un projet à part : écris-le dans le dossier `bonus-nba/src/` (avec son propre `main.ts` et son `app.module.ts`, `equipes/`, `joueurs/`…), pas dans `src/`. Il partage les dépendances du dépôt (et le `.env` à la racine : ajoutes-y `NOMBRE_MAX_JOUEURS`) ; lance-le avec `npm run start:nba`, teste-le avec `npm run test:partie-4`.

Les bonus Joi et Zod vérifient le comportement, pas la bibliothèque : le 4.14 passe aussi avec ta validation du 4.13. Le 4.16 teste ton `ZodValidationPipe` seul : branché sur `POST /api/produits`, il remplacerait les règles des 4.5 à 4.7 (variantes, champs en trop), que le reste du cours garde.

Pour la partie 5, `@nestjs/typeorm`, `typeorm` et `pg` sont déjà dans le `package.json`, ainsi que les paquets du bonus GraphQL (`@nestjs/graphql`, `@nestjs/apollo`, `@apollo/server`, `graphql`, `@as-integrations/express5`) : `npm install` suffit. Écris tes migrations dans `src/migrations/` (le chemin que donne le cours) : les tests les exécutent depuis là. Le script `src/seed.ts` est exécuté par les tests sur la base de test (jamais sur `marketplace`).

Le **bonus GraphQL** (5.22 à 5.24) se fait dans la marketplace, à côté de l'API REST. Ses tests (`bonus-graphql.spec.ts`) sont **ignorés** (*skipped*) tant qu'aucun fichier de `src/` n'appelle `GraphQLModule.forRoot(...)` : sans le bonus, `npm run test:partie-5` reste vert. Le **bonus Prisma** (5.19 à 5.21) n'est pas testé : le cours le fait dans un projet NestJS séparé, avec sa propre base, un client généré (`prisma generate`) et la CLI `prisma migrate dev` — rien de tout cela n'a sa place dans ce dépôt.

Les autres parties arriveront au fil de la rédaction du cours.
