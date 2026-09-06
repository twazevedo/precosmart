# ── PreçoSmart WhatsApp Bot Engine ──
FROM node:20-alpine AS runner

WORKDIR /app

# Dependências nativas leves para Baileys
RUN apk add --no-cache tzdata libc6-compat
ENV TZ=America/Sao_Paulo

# Camada de dependências
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Código da aplicação
COPY . .

# Expõe porta do Dashboard Web
EXPOSE 3002

# Saúde do container
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/api/status || exit 1

# Comando de inicialização
CMD ["node", "bot.js"]
