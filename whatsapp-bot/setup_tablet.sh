#!/bin/bash
# PreçoSmart — Instalador Automático para Tablet / Termux
echo "==================================================="
echo "   PREÇOSMART — CONFIGURAÇÃO AUTOMÁTICA NO TABLET  "
echo "==================================================="

# 1. Cria o arquivo .env oficial caso não exista
if [ ! -f .env ]; then
  echo "[1/4] Gerando arquivo .env oficial..."
  cat << 'EOF' > .env
PORT=10000
NODE_ENV=production
WA_GROUP_NAME=PreçoSmart | Ofertas & Achadinhos 🔥
WA_GROUP_JID=120363428098199018@g.us
AFFILIATE_AMAZON=precosmartapp-20
AFFILIATE_ML=azs5603820
AFFILIATE_SHOPEE=18361251220
AFFILIATE_MAGALU=precosmartvip
AFFILIATE_AWIN=3077915
AFFILIATE_BOTICARIO=27065696
API_SECRET_KEY=precosmart_persistent_auth_key_2026_sec
APP_MASTER_KEY=precosmart_persistent_auth_key_2026_sec
AUTO_PILOT_ENABLED=true
ANTI_FLOOD_DELAY_SECONDS=75
PECHINCHOU_INTERVAL_MINUTES=8
AWIN_INTERVAL_MINUTES=8
EOF
  echo "✅ Arquivo .env criado com sucesso!"
else
  echo "[1/4] Arquivo .env já existe, mantendo atual."
fi

# 2. Instala dependências do npm
echo "[2/4] Instalando pacotes do Node.js..."
npm install

# 3. Instala PM2 globalmente se necessário
if ! command -v pm2 &> /dev/null; then
  echo "[3/4] Instalando gerenciador de processos PM2..."
  npm install -g pm2
else
  echo "[3/4] PM2 já instalado."
fi

# 4. Inicia o robô com PM2
echo "[4/4] Iniciando o PreçoSmart Bot no PM2..."
pm2 delete precosmart 2>/dev/null || true
pm2 start bot.js --name precosmart
pm2 save

echo ""
echo "==================================================="
echo "🎉 TUDO PRONTO! O PREÇOSMART ESTÁ RODANDO NO TABLET!"
echo "==================================================="
echo "Abra o navegador do tablet em:"
echo "👉 http://localhost:10000"
echo "ou para ver o QR Code:"
echo "👉 http://localhost:10000/qr"
echo "==================================================="
