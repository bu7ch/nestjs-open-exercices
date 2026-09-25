# NestJS Open · exercices

Le dépôt d'exercices du cours [NestJS Open](https://github.com/TON-COMPTE/nestjs-open). Tu y écris le code de ta **marketplace** ; des tests disent si chaque exercice est réussi.

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
   npm test                # toutes les parties
   ```

Un test qui échoue te dit **quel exercice** il vérifie (`3.6 · …`) et souvent ce qui manque. Au départ, tout est rouge : c'est normal.

À chaque `push`, GitHub Actions lance les mêmes tests sur ton fork (onglet *Actions*). Le travail `exercices` est facultatif : il peut être rouge tant que tu n'as pas fini.

## Ce que les tests vérifient (et ne vérifient pas)

- Ils vérifient le **comportement** (les URL, les statuts, les données renvoyées) et quelques choix de structure demandés par le cours (`ProduitsModule`, `ProduitsService`…, aux emplacements que génère `npx nest g`).
- Ils ne vérifient pas les exercices « manuels » : installer, changer de port, casser volontairement une injection pour lire l'erreur. Ceux-là sont à cocher toi-même sur le site.
- Ils n'évaluent pas le style de ton code.

## Les solutions

Le dossier `solutions/partie-N/src` contient une solution de la partie N. Elle sert à deux choses : prouver que les exercices sont faisables (GitHub Actions vérifie que chaque solution passe ses tests), et te dépanner **après** avoir essayé. Chaque solution est une copie complète de `src/` : la solution de la partie 4 reprend celle de la partie 3.

```bash
npm run verifier:solutions      # toutes les solutions
npm run verifier:solutions 3    # seulement la partie 3
```

## Parties couvertes

| Partie | Exercices vérifiés par des tests |
|---|---|
| 3 · Ton premier serveur NestJS | 3.4 à 3.11 (produits, catégories, modules, services) |

Les autres parties arriveront au fil de la rédaction du cours.
