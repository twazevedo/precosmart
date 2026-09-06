# ── Backend API Service ──
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY . .

# Garante pasta de dados persistente para SQLite
RUN mkdir -p data

EXPOSE 3001

CMD ["npm", "start"]
