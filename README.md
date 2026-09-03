<div align="center">

# ⚡ PreçoSmart Ecosystem
### Plataforma Full-Stack de Comparação de Preços & Automação Inteligente de Afiliados

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Baileys](https://img.shields.io/badge/Baileys-WhatsApp_Engine-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas_Persistent-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Render](https://img.shields.io/badge/Render-Cloud_Deploy-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)

<p align="center">
  <b>Um ecossistema completo para monitoramento, comparação de preços e distribuição automatizada de ofertas em escala para WhatsApp e Instagram.</b>
</p>

</div>

---

## 📌 Visão Geral da Arquitetura

O **PreçoSmart** é uma solução de engenharia integrada que une duas frentes complementares:

1. **Web App Comparador & Otimizador de Cestas:** Aplicação full-stack moderna (React + Node.js/Express + SQLite) para cadastro de produtos, registro histórico de cotações e cálculo algorítmico da melhor combinação de compra entre lojas concorrentes.
2. **Automação Inteligente de Afiliados (WhatsApp & Redes Sociais):** Microsserviço de alta disponibilidade que monitora múltiplos canais de promoções, normaliza links de lojas oficiais (Amazon, Mercado Livre e Shopee), aplica tags de afiliado personalizadas, sanitiza concorrência e despacha ofertas com controle anti-flood 24/7.

```
                                  ┌───────────────────────────┐
                                  │   Canais de Ofertas       │
                                  │  (Fontes Concorrentes)    │
                                  └─────────────┬─────────────┘
                                                │ (WebSocket Baileys)
                                                ▼
┌───────────────────────┐         ┌───────────────────────────┐         ┌───────────────────────────┐
│   Painel Web & API    │         │      PreçoSmart Bot       │         │      Grupo VIP Oficial    │
│  React + Node SQLite  │         │   • Anti-Flood Queue      │───────▶ │         WhatsApp          │
└───────────────────────┘         │   • Deduplicação de Hash  │         └───────────────────────────┘
                                  │   • Sanitizador de Links  │
                                  │   • Injetor de Comissões  │         ┌───────────────────────────┐
                                  └─────────────┬─────────────┘───────▶ │     Make.com / Webhook    │
                                                │                       │      (Feed Instagram)     │
                                                ▼                       └─────────────┬─────────────┘
                                  ┌───────────────────────────┐                       ▼
                                  │   MongoDB Atlas Cluster   │         ┌───────────────────────────┐
                                  │  (Sessão Persistente 24/7)│         │     ManyChat Funnel       │
                                  └───────────────────────────┘         │     (Direct Instagram)    │
                                                                        └───────────────────────────┘
```

---

## ✨ Funcionalidades Principais

### 1. 🛍️ Comparador Full-Stack & Cesta Inteligente
- **Comparação Lado a Lado:** Consulta instantânea de cotações em múltiplas lojas físicas e virtuais.
- **Destaque do Menor Preço:** Identificação automática da menor oferta com cálculo percentual de economia.
- **Algoritmo de Otimização de Carrinho:**
  - *Cenário 1 (Loja Única):* Calcula qual loja fecha o pedido completo pelo menor valor consolidado.
  - *Cenário 2 (Divisão Inteligente):* Calcula a economia máxima comprando cada item na sua respectiva loja mais barata.
- **Histórico & Volatilidade:** Rastreabilidade completa da evolução de preços por produto.

### 2. 🤖 Robô de Ofertas & Espelhamento Inteligente (WhatsApp Bot v2.0)
- **Motor Baileys de Baixa Latência:** Conexão nativa via WebSocket, sem uso de navegadores pesados (Chromium/Puppeteer), garantindo consumo mínimo de memória RAM (< 100MB).
- **Mapeamento Dinâmico de Canais:** Identifica automaticamente todos os grupos em que a conta participa, eliminando JIDs e fontes fixas no código-fonte.
- **Sanitização Cirúrgica de Concorrência:**
  - Neutraliza domínios e encurtadores de terceiros.
  - Remove convites para canais/grupos de outros criadores.
  - Extrai produtos específicos de perfis sociais do Mercado Livre (`/social/`).
- **Injeção Universal de Afiliados:**
  - **Amazon Brasil:** Suporte a URLs diretas e links encurtados `amzn.to`.
  - **Shopee Brasil:** Suporte amplo a links padrão e encurtadores oficiais (`shope.ee`, `s.shopee.com.br`, `shp.ee`).
  - **Mercado Livre:** Injeção de tracking `matt_tool` em produtos diretos e catálogo.
- **Fila Inteligente Anti-Flood:** Espaçamento cadenciado de 180 segundos entre postagens para evitar banimento e fadiga de membros.
- **Deduplicação de Conteúdo:** Memória circular de hashes para descartar promoções duplicadas nos últimos ciclos.
- **Modo Noturno (Quiet Hours):** Pausa silenciosa automática entre 23:00 e 07:00 com retomada inteligente pela manhã.
- **Persistência em Nuvem via MongoDB Atlas:** Chaves criptografadas salvas na nuvem; reboots e deploys reconectam em segundos sem exigir novo escaneamento de QR Code.

### 3. 👑 Comandos Remotos do Administrador (Owner Mode)
Controle o robô diretamente pelo WhatsApp enviando mensagens privadas autorizadas:
- `!postar <link> [legenda]` — Fura a fila e posta uma oferta no grupo VIP e Instagram imediatamente com comissão embutida.
- `!status` — Retorna tempo online, tamanho da fila, canais monitorados e status de conexão.
- `!limpar` — Esvazia a fila de ofertas pendentes.
- `!ajuda` — Exibe o catálogo de comandos.
- *Suporte a múltiplos números de administradores simultâneos.*

### 4. 📸 Funil Multiplataforma (Instagram + ManyChat)
- **Webhook Make.com:** Transmissão das melhores ofertas com imagem e legenda estruturada para agendamento e postagem no feed.
- **Conversão ManyChat:** Integração com gatilhos de Direct (*"EU QUERO"*, *"LINK"*) entregando links comissionados no privado dos seguidores.

---

## 🔒 Segurança & Boas Práticas (12-Factor App)

O repositório segue rigorosos padrões de segurança ofensiva e defensiva:

- 🛡️ **Zero Hardcoded Secrets:** Nenhuma chave de API, tag de afiliado, webhook ou número de telefone é exposto no código-fonte.
- 🔐 **Arquitetura de Variáveis de Ambiente:** Todos os parâmetros sensíveis são injetados em runtime via `process.env` (armazenados de forma criptografada no Render e MongoDB Atlas).
- 🚫 **Higienização de Repositório:** Arquivos de credenciais (`.env`), dados de sessão (`session/`) e logs temporários são bloqueados no `.gitignore`.
- 🌐 **Isolamento de Canais:** O robô rejeita comandos de números não autorizados e ignora mensagens de grupos não categorizados como fontes.

---

## 🚀 Instalação e Execução Local

### Pré-requisitos
- **Node.js** v20.x ou superior
- **Git**

### 1. Clonar o Repositório
```bash
git clone https://github.com/twazevedo/precosmart.git
cd precosmart
```

### 2. Configurar Variáveis de Ambiente
Copie os modelos de configuração e preencha com suas credenciais:
```bash
cp whatsapp-bot/.env.example whatsapp-bot/.env
```

Edite o arquivo `whatsapp-bot/.env`:
```env
PORT=3002
WA_GROUP_NAME="Seu Grupo VIP"
WA_GROUP_INVITE_CODE="codigo_convite"
WA_GROUP_JID="id_do_grupo@g.us"
INSTAGRAM_WEBHOOK_URL="https://hook.make.com/seu_webhook"
AFFILIATE_AMAZON="suatag-20"
AFFILIATE_ML="suatag_ml"
AFFILIATE_SHOPEE="suatag_shopee"
OWNER_NUMBER="5511999999999,5511888888888"
MONGO_URI="mongodb+srv://usuario:senha@cluster.mongodb.net/..."
```

### 3. Executar os Serviços

#### Iniciar o Web App Comparador (Frontend + Backend):
```bash
# Windows
iniciar.bat

# Ou manualmente:
cd backend && npm start
cd frontend && npm run dev
```

#### Iniciar o Bot de Automação:
```bash
cd whatsapp-bot
npm install
node bot.js
```

Acesse o Dashboard Web do bot em: `http://localhost:3002`

---

## ☁️ Deploy em Produção (Render.com)

O robô está preparado para execução 24/7 na nuvem:

1. Conecte seu repositório no [Render.com](https://render.com).
2. Crie um novo **Web Service** apontando para o diretório `whatsapp-bot`.
3. Configure o comando de build e start:
   - **Build Command:** `npm install`
   - **Start Command:** `node bot.js`
4. Na aba **Environment**, cadastre as chaves definidas no `.env.example`.
5. No [MongoDB Atlas](https://cloud.mongodb.com), configure **Network Access** para aceitar conexões do cluster (`0.0.0.0/0`).
6. Escaneie o QR Code na primeira inicialização através da rota `/` do serviço. Pronto! As sessões subsequentes serão carregadas automaticamente via MongoDB.

---

## 📁 Estrutura do Repositório

```
precosmart/
├── backend/                  # API RESTful de Comparação de Preços
│   ├── src/
│   │   ├── database.js       # Gerenciamento SQLite nativo
│   │   └── server.js         # Endpoints REST e lógica de otimização de carrinho
│   └── package.json
├── frontend/                 # Interface do Usuário (Single Page Application)
│   ├── src/
│   │   ├── components/       # Componentes modulares React
│   │   ├── App.jsx           # Painel comparador de preços e cesta inteligente
│   │   └── index.css         # Estilização Tailwind CSS
│   └── vite.config.js
├── whatsapp-bot/             # Motor de Automação & Afiliados WhatsApp
│   ├── bot.js                # Orquestrador central, Baileys, Anti-Flood e Admin
│   ├── mirror.js             # Sanitizador de URLs, decodificador e injetor de tags
│   ├── catalog.js            # Catálogo interno, badges e regras de comissão
│   ├── envLoader.js          # Carregador seguro de ambiente nativo
│   ├── mongoAuth.js          # Adaptador de persistência Baileys para MongoDB
│   ├── public/               # Dashboard visual de monitoramento ao vivo
│   ├── .env.example          # Modelo documentado de variáveis de ambiente
│   └── package.json
└── README.md                 # Documentação técnica oficial
```

---

## 📄 Licença & Conformidade

Desenvolvido para fins de automação de marketing digital e otimização de compras. Todos os links gerados cumprem as diretrizes dos Programas de Associados da Amazon, Mercado Livre Afiliados e Shopee Afiliados.
