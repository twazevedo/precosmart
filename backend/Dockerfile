# ── Backend API Service ──
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY . .

# Garante pasta de dados persistente para SQLite e ajusta permissões
RUN mkdir -p data && chown -R node:node /app

EXPOSE 3001

USER node
CMD ["npm", "start"]
