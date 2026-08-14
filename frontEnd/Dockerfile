# Image du frontend, en deux étapes.
#
# Ce qui rend un déploiement rapide ici, ce n'est pas la compilation — elle coûte
# une minute quoi qu'on fasse — mais ce que l'étape finale recopie. L'ancienne
# version embarquait `node_modules` (360 Mo) et tout `.next` (186 Mo), soit
# 546 Mo écrits en couches Docker à chaque build. La sortie « standalone » de Next
# ne trace que les dépendances réellement atteintes à l'exécution : 25 Mo, plus
# 1,8 Mo d'actifs statiques. Vingt fois moins à écrire, à stocker et à charger.

FROM node:20-alpine AS builder

WORKDIR /app

# Le lock est copié avec le package.json, et l'installation passe par `npm ci` :
# `npm install` sans lock réinterroge le registre à chaque build, ce qui est plus
# lent et rend l'image non reproductible — deux builds du même code pouvaient
# embarquer des versions mineures différentes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `public/` n'existe pas forcément dans le dépôt : le COPY de l'étape finale
# échouerait sur un répertoire absent.
RUN mkdir -p public
RUN npm run build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
# Le serveur standalone écoute `localhost` par défaut, ce qui le rendrait
# injoignable depuis l'extérieur du conteneur.
ENV HOSTNAME=0.0.0.0

# `standalone` contient server.js et les seules dépendances tracées ; les actifs
# statiques et `public/` doivent être ajoutés à côté, Next ne les y met pas.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 80
# Et non `npm start` : en standalone, le serveur est ce server.js autonome, qui
# lit PORT et HOSTNAME dans l'environnement.
CMD ["node", "server.js"]
