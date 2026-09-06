/**
 * @file crawler.js — Comando !crawler / !varrer
 */
'use strict';

const { fetchCuratedDeals } = require('../crawler');
const { generateSalesCopy } = require('../geminiVision');

module.exports = {
  name: '!crawler',
  aliases: ['!varrer'],
  description: 'Varre os feeds RSS do TecMundo, Adrenaline e Garimpeiros',
  adminOnly: true,
  async execute({ replyToUser, dealQueue, runDealQueueWorker, logEntry }) {
    await replyToUser({ text: '🕷️ *Iniciando varredura autônoma de ofertas nos feeds...*' });
    const deals = await fetchCuratedDeals();
    let count = 0;
    for (const d of deals) {
      let copyText = d.rawText;
      try {
        const aiCopy = await generateSalesCopy(d.title, d.rawText);
        if (aiCopy) copyText = aiCopy;
      } catch (e) {}
      dealQueue.push({ type: 'text', buffer: null, text: copyText });
      count++;
    }
    await replyToUser({ text: '✅ *Varredura Concluída!* ' + count + ' novas oportunidades adicionadas à fila Anti-Flood.' });
    logEntry('ADMIN', 'Comando !crawler executado com ' + count + ' ofertas.');
    runDealQueueWorker();
  }
};
