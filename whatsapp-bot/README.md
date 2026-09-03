# 🤖 PreçoSmart WhatsApp Engine v2.0

Microsserviço de automação de alto desempenho para espelhamento inteligente de ofertas, sanitização de links de concorrentes e injeção de comissões de afiliados no WhatsApp e Instagram.

---

## ⚡ Principais Capacidades

- **Conexão Nativa Baileys:** Comunicação direta por WebSocket sem navegador headless, garantindo baixo consumo de memória (< 100MB).
- **Descoberta Dinâmica de Canais:** Detecta automaticamente todos os grupos que o número participa sem necessidade de listar JIDs no código.
- **Sanitização de Concorrência & Links Diretos:**
  - Extrai produtos específicos de perfis sociais do Mercado Livre (`/social/`).
  - Suporta encurtadores oficiais da Shopee (`shope.ee`, `s.shopee.com.br`, `shp.ee`).
  - Converte links de domínios concorrentes para busca oficial comissionada.
- **Fila Anti-Flood Inteligente:** Intervalo de 180 segundos entre postagens com memória circular de deduplicação (ignora ofertas repetidas).
- **Modo Noturno (Quiet Hours):** Pausa silenciosa entre 23:00 e 07:00 para conformidade e retenção de membros.
- **Persistência MongoDB Atlas:** Credenciais do WhatsApp salvas no banco de dados na nuvem; o servidor reconecta sozinho sem pedir QR Code após reinicializações.
- **Comandos do Administrador no Privado:**
  - `!postar <link> [legenda]` — Postagem prioritária imediata no grupo VIP e Instagram.
  - `!status` — Relatório de saúde, fila e uptime.
  - `!limpar` — Limpeza da fila de ofertas pendentes.
  - `!ajuda` — Lista de comandos.

---

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env` baseado no `.env.example`:

```env
PORT=3002

# Grupo VIP Oficial
WA_GROUP_NAME="Seu Grupo VIP"
WA_GROUP_INVITE_CODE="codigo_convite"
WA_GROUP_JID="id_do_grupo@g.us"

# Integrações & Redes
INSTAGRAM_WEBHOOK_URL="https://hook.make.com/seu_webhook"

# Tags de Afiliados
AFFILIATE_AMAZON="suatag-20"
AFFILIATE_ML="suatag_ml"
AFFILIATE_SHOPEE="suatag_shopee"

# Administradores (separados por vírgula)
OWNER_NUMBER="5511999999999,5511888888888"

# Persistência de Sessão
MONGO_URI="mongodb+srv://user:pass@cluster.mongodb.net/..."
```

---

## 🚀 Como Executar

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar o bot
node bot.js
```

O dashboard de monitoramento ao vivo estará disponível em: `http://localhost:3002`

---

## 🛡️ Segurança

Este microsserviço adota política estrita de segredo zero. Nenhum número pessoal, código de convite ou tag de comissão é exposto nos arquivos versionados. Todas as credenciais devem ser injetadas por variáveis de ambiente.
