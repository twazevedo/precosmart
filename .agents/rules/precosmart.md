---
name: PrecoSmart Architecture
description: Regras e contexto sobre como o PrecoSmart v3.0 funciona.
---

# PrecoSmart v3.0
O bot funciona usando PM2 para watch-mode e Baileys Multi-File Auth para sessão (em /session). Nunca use taskkill para matar o node. Use PM2 (pm2 restart PrecoSmartBot).
O arquivo principal é bot.js. Ele tem o comando !shopee que envia 1 único produto aleatório, e !crawler que varre TecMundo, Adrenaline e Garimpeiros.
A geração de URL de afiliados fica em catalog.js (getAffiliateUrl). Não use aff_id para busca na Shopee, use utm_source e utm_medium.
O bot.js tem scraping automático de 'og:image' para enviar fotos gigantes nativas no WhatsApp.

