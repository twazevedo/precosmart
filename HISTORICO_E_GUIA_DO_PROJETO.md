# 🚀 PreçoSmart — Histórico Completo, Arquitetura e Manual de Execução

> **Data de Consolidação:** Setembro de 2026  
> **Repositório GitHub:** `https://github.com/twazevedo/precosmart`  
> **Serviço em Produção:** `https://precosmart.onrender.com` (Render.com)  
> **Banco de Sessão:** MongoDB Atlas (Persistência multi-deploy Baileys)

---

## 📑 Índice
1. [Visão Geral do Ecossistema](#-visão-geral-do-ecossistema)
2. [Histórico de Evolução e Decisões](#-histórico-de-evolução-e-decisões)
3. [Estrutura de Arquivos do Repositório](#-estrutura-de-arquivos-do-repositório)
4. [Configuração de Variáveis de Ambiente](#-configuração-de-variáveis-de-ambiente)
5. [Como Rodar Localmente](#-como-rodar-localmente)
6. [Deploy e Operação no Render.com](#-deploy-e-operação-no-rendercom)
7. [Comandos de Administrador no WhatsApp](#-comandos-de-administrador-no-whatsapp)
8. [Integração Magalu & Google Drive](#-integração-magalu--google-drive)
9. [Sistema Anti-Duplicação e Rotação](#-sistema-anti-duplicação-e-rotação)

---

## 🧭 Visão Geral do Ecossistema

O **PreçoSmart** é uma plataforma multicanal de afiliados e comparação de preços que opera em três frentes:

1. **Robô WhatsApp VIP (`whatsapp-bot/`):**
   - Desenvolvido com **Baileys v6** (WebSockets nativo, sem emulador de navegador).
   - Monitora **48 canais concorrentes de promoções** em tempo real.
   - Higieniza textos: remove links externos de convite, descobre a URL de destino expandindo encurtadores (`amzn.to`, `mercadolivre.com/sec/`, `shope.ee`, `maga.lu`) e substitui pelas tags de afiliado próprias do dono.
   - Fila inteligente anti-flood com intervalo de 3 minutos e modo silencioso noturno (23:30 às 07:30 de Brasília).
   - Sincronização em tempo real com **Instagram** via webhook Make.com servindo as fotos reais das promoções via CDN próprio (`/media/:id.jpg`).

2. **Frontend Web Comparador (`frontend/`):**
   - Interface moderna construída com **React**, **Vite** e **Tailwind CSS**.
   - Comparação instantânea entre Amazon, Mercado Livre, Shopee e Magazine Luiza.
   - Gráfico de histórico de preços de 30 dias e selo "Menor Preço Detectado".

3. **Backend API (`backend/`):**
   - Servidor Node.js/Express para cotações em tempo real e endpoints de busca.

---

## 📜 Histórico de Evolução e Decisões

### Fase 1 — Inicialização e Conexão WhatsApp
- Foi criado o bot de WhatsApp com Baileys conectado ao grupo VIP oficial.
- Implementado dashboard web em tempo real exibindo status, QR Code, contagem de logs e botões de disparo manual.

### Fase 2 — Persistência e Deploy no Render
- Sessões em disco efêmero do Render eram perdidas a cada reboot, obrigando o escaneamento constante de QR Code.
- **Solução:** Desenvolvido o adaptador `mongoAuth.js` conectando a sessão Baileys diretamente ao **MongoDB Atlas**. O bot agora sobrevive a deploys e reinícios sem deslogar.

### Fase 3 — Espelhamento e Higienização de 48 Canais
- O bot ingressou em 48 grupos públicos de promoções.
- Criado o módulo `mirror.js` com motor de regex e resolução de redirecionamentos HTTP para capturar qualquer oferta, limpar links de concorrentes e embutir comissões da Amazon, Shopee, Mercado Livre e Magazine Luiza.

### Fase 4 — Integração Instagram (Make.com)
- Integrado webhook do Make.com para postar automaticamente as ofertas do WhatsApp no Feed/Stories do Instagram.
- Criado cache de imagens em memória (`/media/:id.jpg`) no Express para servir imagens reais com URLs públicas aceitas pela Meta Graph API.

### Fase 5 — Conformidade Total Magalu & Mídias Google Drive
- Mapeamento de 15 produtos do Magazine Luiza com cupons oficiais (`10PRECOSMARTVIP` até `100PRECOSMARTVIP`, `BEMVINDO20`, `PET10`, `BELEZA10`, etc.).
- Extração de IDs públicos de pastas do **Google Drive oficial do Magalu**:
  - Vídeos verticais em HD (celulares, secadores, air fryers, climatizadores).
  - Templates e molduras de Stories.
- Baileys atualizado para postar vídeos `.mp4` nativos com áudio no WhatsApp.

### Fase 6 — Eliminação de Ofertas Duplicadas
- **Problema:** Ao disparar `!magalu`, o mesmo produto às vezes repetia e o WhatsApp Desktop disparava mensagens duplicadas.
- **Solução:**
  1. Criação do sistema de baralho fechado (`shuffle-deck`): os 15 produtos são embaralhados e enviados sequencialmente. Não há repetição consecutiva.
  2. Trava de ID de mensagem (`msg.key.id`) e debounce de 3.5s contra duplo clique.
  3. Deduplicação canônica por IDs de loja (ASIN da Amazon, MLB do Mercado Livre, SKU Magalu e ItemID Shopee) com memória TTL de 6 horas para descartar promoções repetidas de canais concorrentes.

---

## 📁 Estrutura de Arquivos do Repositório

```text
comparador-precos/
├── HISTORICO_E_GUIA_DO_PROJETO.md   # [NOVO] Este guia mestre consolidado
├── README.md                        # Documentação geral do projeto
├── render.yaml                      # Configuração de deploy Infrastructure-as-Code no Render
├── package.json                     # Scripts raiz do projeto
│
├── whatsapp-bot/                    # 🤖 NÚCLEO DO ROBÔ WHATSAPP
│   ├── bot.js                       # Servidor Express, Baileys, Cron jobs, Comandos de Admin
│   ├── catalog.js                   # Catálogo de 15 produtos Magalu, 11 cupons e rotação sem repetição
│   ├── mirror.js                    # Ingestão de 48 canais, expansão de URLs, troca de tags e dedup canônica
│   ├── formatter.js                 # Templates de mensagens com emojis, badges e conformidade
│   ├── mongoAuth.js                 # Persistência de autenticação do Baileys no MongoDB Atlas
│   ├── envLoader.js                 # Carregador seguro de variáveis de ambiente
│   ├── .env.example                 # Modelo documentado de variáveis necessárias
│   ├── Procfile                     # Comando de inicialização do Render ("node bot.js")
│   └── dashboard/
│       └── index.html               # Painel visual com status, logs e disparos manuais
│
├── frontend/                        # 💻 COMPARADOR DE PREÇOS WEB
│   ├── src/                         # Componentes React (busca, filtros, histórico)
│   ├── package.json
│   └── vite.config.js
│
└── backend/                         # ⚙️ SERVIÇOS AUXILIARES E SCRAPING
    ├── server.js
    └── package.json
```

---

## 🔐 Configuração de Variáveis de Ambiente

No diretório `whatsapp-bot/`, crie o arquivo `.env` (ou configure diretamente no painel do **Render.com → Environment**):

```ini
# ── Servidor ──
PORT=3002

# ── WhatsApp Grupo VIP de Destino ──
WA_GROUP_NAME="PreçoSmart Ofertas 🔥"
WA_GROUP_INVITE_CODE="Lo3ONNfAXVh5cEe2Pg6gM7"
WA_GROUP_JID="120363428098199018@g.us"

# ── Números dos Donos / Administradores (separados por vírgula) ──
OWNER_NUMBER="5511945868954,5511913157990"

# ── Persistência de Sessão (MongoDB Atlas Gratuito) ──
MONGO_URI="mongodb+srv://usuario:senha@cluster0.mongodb.net/?retryWrites=true&w=majority"

# ── Automação Instagram (Make.com Webhook) ──
INSTAGRAM_WEBHOOK_URL="https://hook.us2.make.com/m4ofe3ag7teo1y5r6qgmxcl7y2igs2le"

# ── Credenciais Oficiais de Afiliados ──
AFFILIATE_AMAZON="precosmartapp-20"
AFFILIATE_ML="azs5603820"
AFFILIATE_SHOPEE="18361251220"
AFFILIATE_MAGALU="precosmartvip"
```

---

## 💻 Como Rodar Localmente

### 1. Rodar o Robô WhatsApp
```powershell
cd C:\Users\th\.gemini\antigravity\scratch\comparador-precos\whatsapp-bot
npm install
npm start
```
- Acesse o painel: `http://localhost:3002`
- Se for a primeira inicialização sem MongoDB, escaneie o QR Code exibido no painel ou terminal.

### 2. Rodar o Frontend (Comparador Web)
```powershell
cd C:\Users\th\.gemini\antigravity\scratch\comparador-precos\frontend
npm install
npm run dev
```
- Acesse o comparador: `http://localhost:5173`

---

## ☁️ Deploy e Operação no Render.com

O repositório está configurado para **Deploy Contínuo Automático**:
- Qualquer alteração na branch `main` dispara um build automático no Render.
- O arquivo `whatsapp-bot/Procfile` instrui o Render a rodar `node bot.js`.
- Graças ao MongoDB Atlas, o container do Render pode reiniciar quantas vezes forem necessárias sem desconectar o WhatsApp.

### Endpoints Úteis da API em Produção:
- `GET  https://precosmart.onrender.com/` — Dashboard visual
- `GET  https://precosmart.onrender.com/api/status` — Status de conexão, fila e uptime
- `GET  https://precosmart.onrender.com/api/logs` — Últimos 100 registros de atividade
- `POST https://precosmart.onrender.com/api/send-magalu` — Força disparo de produto Magalu no Grupo VIP e Instagram
- `POST https://precosmart.onrender.com/api/send-now` — Força disparo de oferta manual geral
- `GET  https://precosmart.onrender.com/media/:id.jpg` — CDN de fotos para Instagram

---

## 👑 Comandos de Administrador no WhatsApp

Os comandos podem ser enviados **no chat privado com o robô** ou **diretamente dentro do Grupo VIP** pelos números autorizados em `OWNER_NUMBER`:

| Comando | Descrição |
|---|---|
| `!magalu` | Dispara imediatamente uma oferta do catálogo oficial Magalu com vídeo/foto HD e cupom no Grupo VIP e Instagram, sem repetir o produto anterior. |
| `!postar <link> [texto]` | Fura a fila anti-flood e envia a sua oferta na mesma hora para o VIP e Instagram com suas comissões embutidas. Suporta envio com foto/vídeo anexado. |
| `!status` | Retorna tempo de atividade, status do WhatsApp, tamanho da fila anti-flood e canais monitorados. |
| `!limpar` | Esvazia a fila de ofertas acumuladas. |
| `!ajuda` | Mostra o menu de ajuda com os comandos disponíveis. |

---

## 💙 Integração Magalu & Google Drive

O catálogo (`whatsapp-bot/catalog.js`) possui 15 produtos estratégicos com links diretos para a loja oficial `magazineprecosmartvip`:
- **Vídeos Oficiais:** Stream direto de vídeos em alta resolução do Google Drive (`https://drive.google.com/uc?export=download&id=...`).
- **Templates de Stories:** Miniaturas oficiais em alta definição (`https://drive.google.com/thumbnail?id=...&sz=w1000`).
- **Cupons Exclusivos Mapeados:**
  - `10PRECOSMARTVIP` a `100PRECOSMARTVIP`
  - `BEMVINDO20` (R$ 20 OFF acima de R$ 80)
  - `PET10` (10% OFF em Petshop)
  - `FARMACIA10` (10% OFF em Fraldas e Farmácia)
  - `BELEZA10` (10% OFF em Beleza e Perfumaria)
  - `ASICS10` (10% OFF em Calçados Asics)

---

## 🛡️ Sistema Anti-Duplicação e Rotação

O sistema impede 100% das duplicações através de 3 camadas ativas:

1. **Rotação em Baralho (`shuffle-deck`):**
   - Os 15 produtos do Magalu são embaralhados uma única vez.
   - Cada disparo de `!magalu` consome um produto do baralho.
   - Um produto só volta a aparecer depois que todos os 15 forem postados.
2. **Anti-Duplicação de Comandos:**
   - Verifica `msg.key.id` e descarta mensagens repetidas geradas pelo WhatsApp Desktop.
   - Debounce de 3.5 segundos bloqueia duplo clique acidental.
3. **Deduplicação Canônica em 48 Canais:**
   - Extrai ASIN (Amazon), MLB (Mercado Livre), SKU (Magalu) e ItemID (Shopee).
   - Cache com expiração TTL de 6 horas.
   - Se 3 canais parceiros enviarem o mesmo produto com textos diferentes, apenas o primeiro é postado; os demais são descartados com log `SKIP`.
