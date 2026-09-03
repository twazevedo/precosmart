# 🤖 Bot de Ofertas PreçoSmart — WhatsApp

Bot automatizado que envia as melhores ofertas de eletrônicos com links de afiliado e cupons para um grupo/canal do WhatsApp 3 vezes ao dia.

## ⚙️ Instalação

```bash
# Entre na pasta do projeto
cd comparador-precos

# Instale as dependências do bot
npm install whatsapp-web.js qrcode-terminal node-cron

# Rode o bot
node whatsapp-bot/bot.js
```

## 🚀 Primeiro Uso (1 vez apenas)

1. Rode `node whatsapp-bot/bot.js`
2. Um **QR Code** aparece no terminal
3. Abra o **WhatsApp** no celular → **Configurações** → **Dispositivos Vinculados** → **Vincular Dispositivo**
4. Escaneie o QR Code
5. Pronto! A sessão fica salva em `whatsapp-bot/session/` — não precisa escanear de novo

## 📋 Configuração do Grupo

Edite a linha 33 do `bot.js`:

```js
const TARGET_GROUP_NAME = 'PreçoSmart Ofertas 🔥';
```

> O nome precisa ser **exatamente igual** ao nome do grupo no WhatsApp (incluindo emojis).

## ⏰ Horários de Envio (automático)

| Horário | O que envia |
|---------|------------|
| 09:55 | ☀️ Resumo matinal Top 3 ofertas do dia |
| 10:00 | 🔔 Oferta completa #1 (produto do dia) |
| 18:00 | 🔔 Oferta completa #2 (horário de pico) |
| 21:00 | 🔔 Oferta completa #3 (horário nobre) |

## 💰 Afiliados Suportados
Configurados com segurança via variáveis de ambiente (`.env`):
- **Amazon:** `AFFILIATE_AMAZON`
- **Shopee:** `AFFILIATE_SHOPEE`
- **Mercado Livre:** `AFFILIATE_ML`

## 🛑 Parar o Bot

Pressione `CTRL + C` no terminal.

## 📁 Estrutura

```
whatsapp-bot/
├── bot.js        ← Motor principal (agendador + WhatsApp)
├── catalog.js    ← Produtos + afiliados + cupons
├── formatter.js  ← Templates das mensagens
├── session/      ← Sessão salva (criada automaticamente)
└── README.md     ← Este arquivo
```
