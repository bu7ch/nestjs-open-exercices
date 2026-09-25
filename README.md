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
   npm run test:partie-6   # les exercices de la partie 6 (tes propres tests, base démarrée)
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

De même, après la partie 6 (section d), quatre tests de la partie 5 ne passent plus sur ton code, et c'est voulu : en test, ton application vide la base à chaque démarrage (`dropSchema`) et la crée avec `synchronize` (5.14 attend `synchronize: false`, et trois tests redémarrent l'application en comptant retrouver leurs données).

## Les solutions

Le dossier `solutions/partie-N/src` contient une solution de la partie N. Elle sert à deux choses : prouver que les exercices sont faisables (GitHub Actions vérifie que chaque solution passe ses tests), et te dépanner **après** avoir essayé. Chaque solution est une copie complète de `src/` : la solution de la partie 4 reprend celle de la partie 3. À partir de la partie 6, elle contient aussi ce que tu écris hors de `src/` : `test/`, `.env.test`, `vitest.config.unit.ts` et `vitest.config.e2e.ts`.

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
| 6 · Tester son API | 6.1 à 6.6, 6.9, 6.11 à 6.16 (tes tests unitaires, doublures, e2e, base de test, couverture : voir ci-dessous) | — | 6.7, 6.8, 6.10 (casser exprès et noter l'erreur) ; « vois-les échouer » (6.1, 6.3) ; le `curl` et le préfixe `v1` du 6.11 ; `\dt` et `DB_NAME=marketplace npm run test:e2e` (6.12) ; « note quel test tombe » et les cinq lancements (6.14) ; les pourcentages et le rapport HTML (6.15) ; le test paresseux et le seuil passé à 100 (6.16) |

Pour la partie 4, `class-validator`, `class-transformer`, `@nestjs/config`, `joi` et `zod` sont déjà dans le `package.json` : `npm install` suffit.

Le **projet bonus NBA** (4.17 à 4.22) est un projet à part : écris-le dans le dossier `bonus-nba/src/` (avec son propre `main.ts` et son `app.module.ts`, `equipes/`, `joueurs/`…), pas dans `src/`. Il partage les dépendances du dépôt (et le `.env` à la racine : ajoutes-y `NOMBRE_MAX_JOUEURS`) ; lance-le avec `npm run start:nba`, teste-le avec `npm run test:partie-4`.

Les bonus Joi et Zod vérifient le comportement, pas la bibliothèque : le 4.14 passe aussi avec ta validation du 4.13. Le 4.16 teste ton `ZodValidationPipe` seul : branché sur `POST /api/produits`, il remplacerait les règles des 4.5 à 4.7 (variantes, champs en trop), que le reste du cours garde.

Pour la partie 5, `@nestjs/typeorm`, `typeorm` et `pg` sont déjà dans le `package.json`, ainsi que les paquets du bonus GraphQL (`@nestjs/graphql`, `@nestjs/apollo`, `@apollo/server`, `graphql`, `@as-integrations/express5`) : `npm install` suffit. Écris tes migrations dans `src/migrations/` (le chemin que donne le cours) : les tests les exécutent depuis là. Le script `src/seed.ts` est exécuté par les tests sur la base de test (jamais sur `marketplace`).

Le **bonus GraphQL** (5.22 à 5.24) se fait dans la marketplace, à côté de l'API REST. Ses tests (`bonus-graphql.spec.ts`) sont **ignorés** (*skipped*) tant qu'aucun fichier de `src/` n'appelle `GraphQLModule.forRoot(...)` : sans le bonus, `npm run test:partie-5` reste vert. Le **bonus Prisma** (5.19 à 5.21) n'est pas testé : le cours le fait dans un projet NestJS séparé, avec sa propre base, un client généré (`prisma generate`) et la CLI `prisma migrate dev` — rien de tout cela n'a sa place dans ce dépôt.

## Partie 6 : tes tests, jugés par des tests

En partie 6, c'est **toi** qui écris des tests. Ceux du dépôt vérifient donc tes tests. Ils ne regardent ni leur forme ni leurs noms : ils les font tourner.

**Les commandes du cours.** Ici, `npm test` lance les tests du dépôt (toutes les parties). Pour TES tests, utilise :

| Le cours dit | Ici, tape | Ce que ça lance |
|---|---|---|
| `npm test` | `npm run test:unit` | tes tests unitaires, `src/**/*.spec.ts` (config : `vitest.config.unit.ts`) |
| `npm run test:watch` | `npm run test:unit:watch` | les mêmes, relancés à chaque enregistrement |
| `npm run test:e2e` | `npm run test:e2e` | tes tests de bout en bout, `test/**/*.e2e-spec.ts` (config : `vitest.config.e2e.ts`) |
| `npm run test:cov` | `npm run test:cov` | tes tests unitaires, avec la couverture |

Les deux fichiers de configuration sont ceux d'un projet généré par `nest new`, à une différence près : `include` se limite à `src/` et `test/` (le cours écrit `**/*.spec.ts`, qui ramasserait ici les tests du dépôt et ceux des solutions). Là où le cours modifie `vitest.config.ts` (6.15, 6.16), modifie `vitest.config.unit.ts`.

**Comment tes tests sont jugés** (`npm run test:partie-6`) :

1. Ton projet est **copié dans un dossier temporaire** (ton dépôt n'est jamais modifié), et tes tests y sont lancés avec Vitest. Ils doivent tous passer. Pendant tes tests **unitaires**, la base est injoignable : ils ne doivent pas en avoir besoin (6.6 : des doublures). Tes tests **e2e** visent la base de test du dépôt (les variables `DB_*` sont imposées) ; le reste (`NOMBRE_MAX_PRODUITS`…) doit venir de ton `.env.test`, que tu dois donc committer (il ne contient aucun secret).
2. Puis ils sont relancés plusieurs fois, avec à chaque fois **un bug introduit exprès** dans ton code : un palier de prix décalé d'une unité, un total qui n'est plus arrondi, une quantité de 0 acceptée, une transition `livree → annulee` autorisée, un `save` appelé malgré la limite, une route qui répond `204` sans rien supprimer, un `409` masqué… C'est ce qu'on appelle une **mutation**. Un test utile doit **tomber** : si tous tes tests restent verts avec le bug, l'exercice n'est pas validé, et le message te dit quel bug est passé inaperçu. Un `expect(true).toBe(true)`, ou un test qui appelle le code sans rien vérifier, ne résiste à aucune mutation.
3. Les mutations **n'écrivent pas dans ton code** : elles l'enveloppent, et ne changent son comportement que sur le cas visé (par exemple : « pour 10 unités, plein tarif »). Tes messages d'erreur, ton arrondi, tes noms de méthodes, l'emplacement de tes fichiers restent les tiens. Le cours ne dit pas où écrire `PrixService` ni `transitionner` : les tests les cherchent dans tout `src/` (`transitionner` peut être une fonction exportée ou une méthode de classe).
4. Pour 6.12 à 6.16, ton application et ta configuration sont vérifiées directement : `.env.test` lu en test (et pas `.env`), `dropSchema` et `synchronize` en test, le garde-fou `_test`, un `TRUNCATE … RESTART IDENTITY` avant chaque test, `fileParallelism: false`, `coverage.include`/`exclude` et le seuil `lines: 80` (le seuil n'a pas à être atteint : le cours te le fait régler, pas dépasser).

Les exercices où tu casses quelque chose exprès pour lire l'erreur (6.7, 6.8, 6.10…) restent à cocher toi-même. Si tu gardes le préfixe `v1` du 6.11, les tests de la partie 6 le suivent ; ceux des parties 3 à 5, non.

Les autres parties arriveront au fil de la rédaction du cours.
