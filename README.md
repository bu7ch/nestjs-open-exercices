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
   npm run test:partie-7   # les exercices de la partie 7 (authentification, base démarrée)
   npm run test:partie-8   # les exercices de la partie 8 (cycle de vie d'une requête, base démarrée)
   npm run test:partie-9   # les exercices de la partie 9 (concevoir une API propre, base démarrée)
   npm test                # toutes les parties
   ```

Un test qui échoue te dit **quel exercice** il vérifie (`3.6 · …`) et souvent ce qui manque. Au départ, tout est rouge : c'est normal.

À chaque `push`, GitHub Actions lance les mêmes tests sur ton fork (onglet *Actions*). Le travail `exercices` est facultatif : il peut être rouge tant que tu n'as pas fini.

## Ce que les tests vérifient (et ne vérifient pas)

- Ils vérifient le **comportement** (les URL, les statuts, les données renvoyées, les messages de validation) et quelques choix de structure demandés par le cours (`ProduitsModule`, `ProduitsService`…, aux emplacements que génère `npx nest g`).
- À partir de la partie 4, ils démarrent ton application **comme en vrai**, en exécutant ton `main.ts` (avec son `ValidationPipe` et son `ConfigService`) — ou ton `configurerApp` une fois écrit en partie 6.
- Ils **ne lisent jamais ton `.env`** : chaque test fournit lui-même ses variables (`PORT`, `NOMBRE_MAX_PRODUITS`, `DB_*`, `JWT_SECRET`…). Garde ton `.env` pour `npm run start:dev`.
- En partie 9, s'il existe, ton `src/configurer-swagger.ts` est appelé après `configurerApp`, **avant** `app.init()` (comme dans le cours).
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
| 7 · Authentification | 7.2 (entité `Compte`, migration), 7.4 à 7.6 (inscription, argon2, `409`, connexion, JWT, `Identifiants invalides`, faux hachage), 7.8 à 7.10 (guard global, `@Public()`, jetons refusés, `GET /api/auth/moi`), 7.12 à 7.14 (rôles, ordre des guards, propriété des produits), 7.15 à 7.17 (refresh token, rotation, réutilisation, déconnexion, `jwtid`), 7.18 à 7.20 (throttler, `THROTTLE_ACTIF`, helmet, CORS) | 7.21, 7.22 (Passport), 7.25 (Clerk, avec des clés fabriquées par le test) | 7.1, 7.3, 7.7 (scripts hors de l'application) ; `\d comptes` (7.2), le décodage à la main (7.5), les mesures de temps (7.6) ; **tes propres tests** (unitaire du 7.4, e2e des 7.10, 7.12, 7.16, 7.18, 7.20) et l'adaptation de ceux de la partie 6 (7.8) ; casser exprès et noter : 7.11, 7.13, 7.17, le décompte du 7.19 ; les deux sessions du 7.17 ; `curl -i` (7.20) ; 7.23, 7.24, 7.26 |
| 8 · Le cycle de vie d'une requête | 8.4 (`RequeteIdMiddleware`, `X-Request-Id`), 8.6 (`/sante` exclue, `X-Serveur`), 8.7 (statut de commande, migration, `@StatutRequis`, `POST /api/commandes/:id/expedier`), 8.8 (`GET /api/vendeurs/:vendeurId/commandes` réservé au propriétaire et à l'admin), 8.9 (l'identifiant absurde répond `400`), 8.11 (champ interne masqué), 8.12 (`DelaiMaximalInterceptor`), 8.13 (`{ data }`), 8.14 à 8.16 (`ToutesExceptionsFilter`, `409` des codes SQL, `500` muet) ; **tes tests** des 8.4, 8.10, 8.11, 8.14 et 8.16, jugés par mutation | — | 8.1 à 8.3 (tes tests de l'ordre du cycle de vie) ; 8.5 (le journal, et la vingtaine de lancements) ; « casser exprès » du 8.9 ; la route de démonstration du 8.12 et ce qu'elle implique ; les tests qui tombent au 8.13 ; le message changé du 8.15 ; l'oubli de `vi.restoreAllMocks()` du 8.16 ; le middleware *fonctionnel* du 8.6 (seul l'en-tête est vérifié) |
| 9 · Concevoir une API propre | 9.1 (`configurerSwagger` : titre, description, `addBearerAuth`, routes, `/docs` et `/docs-json` sans jeton, appel dans `main.ts`), 9.2 (`ProduitReponseDto` décrit, `@ApiOkResponse`, `@ApiTags`, `@ApiBearerAuth` sauf sur les routes `@Public()`), 9.4 à 9.6 (`VERSION_NEUTRAL`, `/v2`, `/v1` en `404`, `Deprecation`/`Sunset`, `deprecated`, le détail dans les deux mondes), 9.7 à 9.9 (pagination, bornes, `meta`, `@Type`, `ApiExtraModels`, curseur, doublon des pages après un ajout), 9.10 et 9.11 (filtres, total filtré, `prixMin`/`prixMax`, produits actifs, tri par liste blanche, départage), 9.12 (classement des vendeurs par agrégation), 9.13 (`champs`), 9.14 (`ErreurDto`, `ApiErreurs`, aucune référence pendante) ; **ton test** du contrat figé (9.15), jugé par mutation | la recherche avec `%` et `_` échappés (section d, non demandée par les exercices) | Authorize et l'essai dans `/docs` (9.1) ; le schéma vide sans `@ApiProperty` (9.2) ; 9.3 (tes tests du document, l'appel après `app.init()`, la politique `NODE_ENV`) ; **tes tests** des 9.4 à 9.14 ; « note le message » et `/docs-json` sans `ApiExtraModels` (9.8, 9.14) ; la branche jetable `id DESC, (SELECT 1/0)` et le test sans le `if` du départage (9.11) ; `-u`, le diff et ta phrase sur le changement cassant (9.15) |

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

## Partie 7 : l'authentification

Les paquets de la partie 7 sont déjà dans le `package.json` : `argon2`, `@nestjs/jwt`, `@nestjs/throttler`, `helmet`, et ceux des bonus (`@nestjs/passport`, `passport`, `passport-jwt`, `@types/passport-jwt`, `@clerk/backend`). `npm install` suffit (npm peut afficher un avertissement `allow-scripts` pour `argon2` : le paquet fonctionne quand même).

**Ce que les tests fournissent.** Ils démarrent ton application avec leurs propres `JWT_SECRET` et `JWT_REFRESH_SECRET` (de plus de 32 caractères), et avec `THROTTLE_ACTIF=false`. Connaître ces secrets leur permet de vérifier la signature de tes jetons, et d'en fabriquer (expirés, falsifiés, signés avec un autre secret) sans rien attendre. Ils s'inscrivent et se connectent **par tes routes** (`POST /api/auth/inscription`, `POST /api/auth/connexion`) pour obtenir un jeton, et passent un compte `vendeur` ou `admin` avec un `UPDATE` SQL, comme le cours. Ils vérifient en base que ni le mot de passe ni le refresh token ne sont stockés en clair (empreinte argon2).

**La limitation de débit** est coupée (`THROTTLE_ACTIF=false`), sauf dans les tests qui la vérifient : chacun démarre sa propre application, donc des compteurs neufs, et vérifie la 6e tentative (ou la 101e requête) sans attendre la fin de la minute. Tant que ton `skipIf` ne lit pas `process.env.THROTTLE_ACTIF` (7.19), tes routes d'authentification répondent `429` dans les autres tests : le message te le signale.

**Pour TES tests** (`npm run test:e2e`), ajoute à ton `.env.test` un `JWT_SECRET` et un `JWT_REFRESH_SECRET` de test (jamais ceux de ton `.env`), et `THROTTLE_ACTIF=false`. Tes tests ne sont pas jugés en partie 7 (c'était le rôle de la partie 6) : écris-les quand même, le cours les demande.

**Ce qui ne passe plus.** Dès la partie 7, les tests des parties 5 et 6 qui démarrent ton application ne peuvent plus passer sur ton code : ils la démarrent sans `JWT_SECRET` (qu'elle refuse désormais), et appellent tes routes sans jeton (`401` une fois le guard global en place, 7.8). C'est normal : lance `npm run test:partie-7`. Ceux de la partie 6 qui jugent tes tests unitaires (6.1 à 6.6, 6.15, 6.16) restent verts. La solution de la partie 7 n'est, elle aussi, vérifiée que par les tests de la partie 7. De même, le bonus GraphQL de la partie 5 ne marche plus tel quel : le guard du cours lit la requête avec `switchToHttp()`, qui n'existe pas pour une requête GraphQL.

**Les bonus.** Les tests de Passport (`bonus-passport.spec.ts`) sont ignorés tant qu'aucun fichier de `src/` n'appelle `PassportStrategy(...)` ; ceux de Clerk (`bonus-clerk.spec.ts`), tant qu'aucun n'importe `@clerk/backend`. Comme dans le cours, ils montent ta stratégie (ou ton `ClerkGuard`, ton entité `ProfilClerk` et ton `ProfilsService`) dans un petit module de test isolé. Pour Clerk, aucun compte n'est nécessaire : le test fabrique une paire de clés RSA, signe des jetons qui imitent ceux de Clerk, et donne la clé publique à ton guard par `CLERK_JWT_KEY`. Le vrai compte (7.26) ne se teste pas : il faudrait une clé secrète et de vrais jetons de session.

## Partie 8 : le cycle de vie d'une requête

Aucun paquet à installer : tout vient de NestJS (et de RxJS, déjà là).

**Ce que les tests fournissent.** Comme en partie 7 : leurs propres secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`), `THROTTLE_ACTIF=false`, des comptes inscrits et connectés par tes routes, passés `vendeur` ou `admin` par un `UPDATE` SQL. Les boutiques, produits et variantes sont posés directement avec tes entités ; les commandes passent par `POST /api/commandes` ; le statut d'une commande (8.7) est changé en SQL, comme dans le cours. Le champ interne du 8.11 peut s'appeler comme tu veux : c'est la colonne de `Produit` en plus de celles des parties 3 à 7.

**`{ data }` (8.13).** Une fois ton interceptor global en place, les tests de la partie 8 lisent `body.data` ; avant, `body` : ils marchent dans les deux cas. Les erreurs, elles, gardent le format du filtre (8.14).

**Tes tests sont jugés**, comme en partie 6, quand le cours dit précisément quoi tester : ceux de l'identifiant de requête (8.4) et du format d'erreur (8.14), dans tes fichiers `test/**/*.e2e-spec.ts` qui parlent de `X-Request-Id` ; ceux de ton guard de statut (8.10), de ton interceptor du champ interne (8.11) et de ton filtre (8.16), dans `src/**/*.spec.ts`. Ils doivent passer, puis tomber quand un bug est introduit exprès dans ta classe (un identifiant douteux repris, un refus sans le statut dans le message, une route non décorée refusée, un identifiant absurde envoyé en base, le champ interne visible par tous ou supprimé de la réponse d'origine, un secret dans le `500`, un `4xx` journalisé…). Le guard et l'interceptor sont retrouvés sur tes routes (`POST /api/commandes/:id/expedier`, `GET /api/produits` et `GET /api/produits/:id`) : leur nom et leur fichier sont libres. Les variables que ton `.env.test` ne donne pas (`JWT_SECRET`…) sont fournies. Les tests de l'ordre du cycle de vie (8.1 à 8.3) et du journal (8.5) ne sont pas jugés : fais-les tourner toi-même.

**Ce qui ne passe plus.** Après le 8.13, presque tous les tests de la partie 7 (et ceux des parties 5 et 6 qui démarrent ton application) tombent : ils lisent `body.id` ou `body.accessToken`, désormais dans `body.data`. C'est l'objet même de l'exercice ; lance `npm run test:partie-8`. Après le 8.15, le message d'un `409` n'est plus celui de ton service (`Cette ressource existe déjà`). Les tests de la partie 6 qui jugent tes tests unitaires (6.1 à 6.6, 6.15, 6.16) restent verts. La solution de la partie 8 n'est vérifiée que par les tests de la partie 8 ; ses propres tests e2e (dans `solutions/partie-8/test/`) ont été adaptés à `{ data }`.

## Partie 9 : concevoir une API propre

`@nestjs/swagger` est déjà dans le `package.json` : `npm install` suffit.

**Ce que les tests fournissent.** Comme en parties 7 et 8 : leurs secrets, des comptes connectés par tes routes, des produits, vendeurs et variantes posés avec tes entités, des commandes passées par `POST /api/commandes`. Chaque fichier repart d'une base vide et y pose son propre jeu de données (25 produits pour la pagination, un classement fait à la main pour le 9.12…) : ils ne supposent aucune donnée de départ. La documentation est lue dans le document que **renvoie** ta `configurerSwagger(app)` (sinon sur `/docs-json`) ; `main.ts` est lancé une fois, pour vérifier qu'il publie `/docs`. Le versionnement doit être activé dans `configurerApp` (les tests l'appellent, comme `main.ts`).

**`{ data }` (8.13) et les pages.** La solution de la partie 9 garde l'interceptor global du 8.13 : `GET /v2/api/produits` répond donc `{ "data": { "donnees": [...], "meta": {...} } }`, et le curseur `{ "data": { "donnees", "curseurSuivant" } }`. Les tests lisent `body.data` quand la réponse est enveloppée, `body` sinon : les deux marchent. Le cours, lui, écrit ses tests sans enveloppe (`r.body.donnees`) : c'est l'application Loup-Garou, qui n'a pas de 8.13. La solution documente aussi cette enveloppe : `ApiPage` décrit `{ data: { donnees, meta } }` (la consigne 9.7 le demande) ; les tests acceptent la documentation avec ou sans `data`. Les erreurs ne sont pas enveloppées (format du 8.14, plus `champs` au 9.13). Autre effet de bord : l'interceptor du champ interne (8.11) reçoit maintenant une page, pas un tableau ; la solution lui apprend à masquer `prixAchat` dans `donnees` (le cours ne le dit pas, et les tests de la partie 9 ne le vérifient pas).

**Le prix « en centimes ».** Les consignes 9.2 et 9.10 parlent de prix en centimes, mais la marketplace range ses prix en euros depuis la partie 5 (colonne `numeric`, renvoyée en texte : `"30.00"`). La solution garde les euros en base et lit `prixMin`/`prixMax` en centimes (`p.prix * 100 >= :prixMin`) ; les tests acceptent aussi des bornes lues en euros. Le type du prix dans `ProduitReponseDto` n'est pas vérifié.

**Ce qui est libre.** Les noms des champs du classement (9.12) : seul `rang` est imposé ; le chiffre d'affaires peut être un nombre ou un texte, le vendeur désigné par son nom ou son identifiant ; le critère de départage est le tien, il doit seulement donner toujours le même ordre. Les trois routes qui portent `@ApiErreurs` (9.14). L'ordre par défaut de la v2 : le test du doublon (9.9) utilise `?tri=id&ordre=desc` si ta liste ne va pas déjà du plus récent au plus ancien. Le filtre des produits actifs n'est vérifié que sur `GET /v2/api/produits`.

**La recherche** (`?recherche=`, section d du cours) n'est demandée par aucun exercice : ses tests (`%` et `_` échappés) sont ignorés (*skipped*) tant que `GET /v2/api/produits` refuse ce paramètre.

**Ton test du contrat (9.15) est jugé**, comme en parties 6 et 8 : tes fichiers `test/**/*.e2e-spec.ts` qui appellent `toMatchFileSnapshot` sont lancés dans une copie de ton projet, avec `CI=true` (un fichier de référence absent fait échouer le test au lieu d'être créé) : ils doivent passer avec le fichier que tu as **commité**, puis tomber quand le premier champ de ton `ProduitReponseDto` est renommé dans la documentation (la mutation change les métadonnées de `@ApiProperty` de la classe chargée, jamais ton fichier). Un test qui ne fige qu'une partie du document (`document.info`) ne résiste pas. Si ton document a changé exprès, relance tes tests e2e avec `-u` et commite le fichier.

**Ce qui ne passe plus.** Rien de nouveau par rapport à la partie 8 : les tests des parties 6 et 7 qui tombaient après le 8.13 tombent toujours, les autres restent verts. Le test du 8.14 qui compare les clés d'une validation ratée accepte le `champs` du 9.13 (et seulement sur un `400`) : `npm run test:partie-8` reste vert sur la solution de la partie 9. La solution de la partie 9 n'est vérifiée que par les tests de la partie 9 ; ses propres tests (`solutions/partie-9/test/`, dont `openapi.snapshot.json`) passent aussi.

Les autres parties arriveront au fil de la rédaction du cours.
