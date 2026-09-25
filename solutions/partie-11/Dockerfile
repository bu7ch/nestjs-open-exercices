# 10.4 : une image en deux étapes. La première construit, la seconde (toute neuve) n'emporte que le résultat.

# Étape 1 : construire
FROM docker.io/library/node:24-alpine AS construction
WORKDIR /app
# 10.5 : les fichiers de dépendances d'abord : tant qu'ils ne changent pas, `npm ci` vient du cache.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Étape 2 : exécuter
FROM docker.io/library/node:24-alpine
# 10.6 : la seule variable qu'on écrit dans l'image : elle n'a rien de secret.
ENV NODE_ENV=production
WORKDIR /app
COPY --from=construction /app/package.json ./
COPY --from=construction /app/node_modules ./node_modules
COPY --from=construction /app/dist ./dist
# Pas d'administrateur : l'utilisateur `node` que prévoit l'image officielle.
USER node
EXPOSE 3000
# 10.12 : `node` directement (pas `npm`) : c'est lui qui reçoit SIGTERM.
CMD ["node", "dist/main.js"]
