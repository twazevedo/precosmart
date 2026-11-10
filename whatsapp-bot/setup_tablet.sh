#!/data/data/com.termux/files/usr/bin/bash
# PrecoSmart - Servidor dedicado no Tablet (Termux / Android)
# Uso (dentro do Termux):
#   curl -fsSL https://raw.githubusercontent.com/twazevedo/precosmart/main/whatsapp-bot/setup_tablet.sh | bash
set -e

REPO_URL="https://github.com/twazevedo/precosmart.git"
REPO_DIR="$HOME/precosmart"
BOT_DIR="$REPO_DIR/whatsapp-bot"

echo "==================================================="
echo "   PRECOSMART - SERVIDOR DEDICADO NO TABLET"
echo "==================================================="

# 1. Pacotes do sistema
echo "[1/7] Instalando pacotes do Termux (git, node)..."
yes | pkg update -y >/dev/null 2>&1 || true
pkg install -y git nodejs-lts >/dev/null 2>&1 || pkg install -y git nodejs

# 2. Codigo do bot (clona ou atualiza)
echo "[2/7] Baixando/atualizando o codigo do PrecoSmart..."
if [ -d "$REPO_DIR/.git" ]; then
  cd "$REPO_DIR"
  git fetch origin main
  git reset --hard origin/main
else
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
fi
cd "$BOT_DIR"

# 3. Configuracao (.env) - sempre alinhada com a configuracao oficial atual
echo "[3/7] Gerando .env oficial..."
[ -f .env ] && cp .env ".env.bak.$(date +%s)"
RANDOM_KEY=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))" 2>/dev/null || date +%s%N | sha256sum | head -c 48)
cat > .env << EOF
PORT=10000
NODE_ENV=production
WA_GROUP_NAME=PrecoSmart | Ofertas & Achadinhos
WA_GROUP_INVITE_CODE=Lo3ONNfAXVh5cEe2Pg6gM7
WA_GROUP_JID=120363428098199018@g.us
AFFILIATE_AMAZON=precosmartapp-20
AFFILIATE_ML=azs5603820
AFFILIATE_SHOPEE=18361251220
AFFILIATE_MAGALU=precosmartvip
AFFILIATE_AWIN=3077915
AFFILIATE_BOTICARIO=27065696
API_SECRET_KEY=${RANDOM_KEY}
APP_MASTER_KEY=${RANDOM_KEY}
AUTO_PILOT_ENABLED=true
NIGHT_MODE=false
DISABLE_NIGHT_MODE=true
AWIN_INTERVAL_MINUTES=3
PECHINCHOU_INTERVAL_MINUTES=3
ROTATION_INTERVAL_MINUTES=3
ANTI_FLOOD_DELAY_SECONDS=60
TIKTOK_SHOWCASE_URL=https://vt.tiktok.com/ZS9f1p5GPeP6Q-SyLby/
SOURCE_GROUP_JIDS=120363400174291332@g.us,120363401387826946@g.us
NIKE_GROUP_JIDS=120363400174291332@g.us,120363401387826946@g.us
# Servidor dedicado: sem commits automaticos e sem keep-alive do Render
DISABLE_GIT_SYNC=true
GUARDIAN_MAX_RSS_MB=500
EOF

# 4. Dependencias do Node (sharp e opcional; o bot funciona sem ele)
echo "[4/7] Instalando pacotes do Node.js (pode demorar alguns minutos)..."
npm install --omit=dev --no-audit --no-fund
npm install sharp --no-audit --no-fund >/dev/null 2>&1 || echo "  (sharp indisponivel no Android - imagens serao enviadas sem otimizacao)"

# 5. PM2 (reinicia o bot sozinho e atualiza automaticamente do GitHub)
echo "[5/7] Configurando PM2 e Auto-Atualizador continuo..."
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
pm2 delete precosmart >/dev/null 2>&1 || true
pm2 delete precosmart-updater >/dev/null 2>&1 || true
pm2 start guardian.js --name precosmart --restart-delay 5000 --exp-backoff-restart-delay 2000
pm2 start autoUpdater.js --name precosmart-updater --restart-delay 10000
pm2 save

# 6. Inicio automatico quando o tablet ligar (requer o app Termux:Boot)
echo "[6/7] Configurando inicio automatico (Termux:Boot)..."
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/start-precosmart.sh" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
sleep 15
cd "$HOME/precosmart/whatsapp-bot" && pm2 resurrect || (pm2 start guardian.js --name precosmart && pm2 start autoUpdater.js --name precosmart-updater)
EOF
chmod +x "$HOME/.termux/boot/start-precosmart.sh"

# Atalho para atualizar o bot depois: digite "precosmart-update"
cat > "$PREFIX/bin/precosmart-update" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/precosmart" && git fetch origin main && git reset --hard origin/main
cd whatsapp-bot && npm install --omit=dev --no-audit --no-fund && pm2 restart precosmart && pm2 logs precosmart --lines 20 --nostream
EOF
chmod +x "$PREFIX/bin/precosmart-update"

# 7. Impede o Android de dormir o Termux
echo "[7/7] Ativando wake-lock..."
termux-wake-lock 2>/dev/null || true

echo ""
echo "==================================================="
echo " PRONTO! O PRECOSMART ESTA RODANDO NO TABLET"
echo "==================================================="
echo " Primeira vez? Conecte o WhatsApp pelo QR Code:"
echo "   -> abra no navegador do tablet: http://localhost:10000/qr"
echo "   -> no celular: WhatsApp > Aparelhos conectados > Conectar"
echo ""
echo " Comandos uteis:"
echo "   pm2 logs precosmart     (ver o que o bot esta fazendo)"
echo "   pm2 status              (ver se esta online)"
echo "   precosmart-update       (baixar a versao mais nova)"
echo "==================================================="
