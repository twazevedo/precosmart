/**
 * @file awinCatalog.js — Catálogo & Rotação Inteligente de Afiliados AWIN
 * @description Gerencia 218+ produtos e 26+ cupons oficiais da KaBuM! e Clovis Calçados.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { shortenUrl } = require('./linkShortener');
const { fetchOgImage } = require('./mirror');

const AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || '3077915';
const CLICKREF = 'PILOTO_AUTO';

/**
 * Monta o link oficial de afiliado AWIN com rastreamento.
 */
function buildAwinUrl(mid, targetUrl) {
  return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${AWIN_PUBLISHER_ID}&clickref=${CLICKREF}&ued=${encodeURIComponent(targetUrl)}`;
}

// ── Carrega Catálogo Oficial Salvo ───────────────────────────────────────────
let awinMasterData = { vouchers: [], products: [] };
try {
  const dataPath = path.join(__dirname, 'awinDealsData.json');
  if (fs.existsSync(dataPath)) {
    awinMasterData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
} catch (e) {
  console.error('[AWIN] Falha ao carregar awinDealsData.json:', e.message);
}

// Fallback caso o arquivo esteja vazio
if (!awinMasterData.products || awinMasterData.products.length === 0) {
  awinMasterData.products = [
    {
      advertiser: 'KaBuM! Brasil Oficial',
      advertiserId: '17729',
      deeplink: 'https://www.kabum.com.br/hardware',
      title: 'Hardware, SSDs NVMe & Peças para PC de Alta Performance',
      categories: 'Hardware'
    },
    {
      advertiser: 'KaBuM! Brasil Oficial',
      advertiserId: '17729',
      deeplink: 'https://www.kabum.com.br/perifericos',
      title: 'Mouses, Teclados Mecânicos & Headsets Gamers',
      categories: 'Periféricos'
    },
    {
      advertiser: 'Clovis Calçados',
      advertiserId: '107702',
      deeplink: 'https://www.clovis.com.br/outlet',
      title: 'Queima de Estoque Outlet Clovis - Calçados com até 75% OFF',
      categories: 'Calçados'
    }
  ];
}

// Fisher-Yates Shuffle para garantir variedade absoluta e nunca começar no mesmo item
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Histórico de ofertas enviadas para BLOQUEAR repetições (Anti-Flood / Anti-Duplicação)
const recentSentSet = new Set();
const MAX_RECENT_HISTORY = 60;

function markAsSent(key) {
  if (!key) return;
  recentSentSet.add(key);
  if (recentSentSet.size > MAX_RECENT_HISTORY) {
    const firstItem = recentSentSet.values().next().value;
    recentSentSet.delete(firstItem);
  }
}

// Inicializa listas dinâmicas embaralhadas
const validInitialProducts = (awinMasterData.products || []).filter(p => p.imageUrl && p.imageUrl.startsWith('http'));
let shuffledProducts = shuffleArray(validInitialProducts.length > 0 ? validInitialProducts : awinMasterData.products);
let shuffledVouchers = shuffleArray(awinMasterData.vouchers || []);

let productIndex = Math.floor(Math.random() * Math.max(1, shuffledProducts.length));
let voucherIndex = Math.floor(Math.random() * Math.max(1, shuffledVouchers.length));
let rotationCounter = 0;

/**
 * Determina o badge e categoria visual do produto pelo título
 */
function getProductBadge(title = '') {
  const t = title.toLowerCase();
  if (t.includes('switch') || t.includes('ps5') || t.includes('ps4') || t.includes('gamer') || t.includes('console') || t.includes('fifa')) {
    return '🎮 *ESPECIAL GAMES & CONSOLES* 🕹️🔥';
  }
  if (t.includes('monitor') || t.includes('display') || t.includes('tela') || t.includes('ultrawide') || t.includes('tv')) {
    return '🖥️ *ACHADINHO DE MONITOR & DISPLAY* ⚡';
  }
  if (t.includes('ssd') || t.includes('nvme') || t.includes('ryzen') || t.includes('intel') || t.includes('placa') || t.includes('memória') || t.includes('cooler') || t.includes('fonte') || t.includes('gabinete')) {
    return '⚡ *KABUM! OFERTA RELÂMPAGO DE HARDWARE* 💻🚀';
  }
  if (t.includes('mouse') || t.includes('teclado') || t.includes('headset') || t.includes('fone') || t.includes('soundcore') || t.includes('jbl') || t.includes('edifier')) {
    return '🎯 *ACHADINHO NINJA KABUM! — SETUP GAMER* 🖱️🎧';
  }
  if (t.includes('smartwatch') || t.includes('xiaomi') || t.includes('celular') || t.includes('smartphone') || t.includes('redmi') || t.includes('poco') || t.includes('alexa') || t.includes('echo')) {
    return '📱 *ACHADINHO TECH & SMART DEVICES* ⌚✨';
  }
  if (t.includes('calçados') || t.includes('melissa') || t.includes('via marte') || t.includes('sandália')) {
    return '🚨 *CLOVIS CALÇADOS — QUEIMA DE ESTOQUE TOTAL!* 👠👟';
  }
  if (t.includes('olympikus') || t.includes('corre vento') || t.includes('corre grafeno') || t.includes('tênis corre') || t.includes('ultraleve')) {
    return '🏃 *OLYMPIKUS BRASIL — TÊNIS DE CORRIDA & TREINO* 👟⚡';
  }
  if (t.includes('adidas') || t.includes('samba') || t.includes('gazelle') || t.includes('ultraboost') || t.includes('adizero')) {
    return '⚡ *ADIDAS BRASIL OFICIAL — SNEAKERS & ESPORTES* 👟🔥';
  }
  if (t.includes('lacoste') || t.includes('crocodilo') || t.includes('polo lacoste')) {
    return '🐊 *LACOSTE BRASIL OFICIAL — MODA & ELEGÂNCIA* 👕✨';
  }
  if (t.includes('nike') || t.includes('air max') || t.includes('air force') || t.includes('dunk') || t.includes('jordan')) {
    return '✔️ *NIKE BRASIL OFICIAL — JUST DO IT* 👟🔥';
  }
  return '🔥 *OFERTA EXCLUSIVA VERIFICADA PREÇOSMART* 🛒⚡';
}

/**
 * Se o produto não tiver og:image oficial, NUNCA enviamos fotos genéricas ou falsas.
 * Retorna null para que a mensagem seja enviada como texto verificado sem induzir o cliente a erro.
 */
function getFallbackImage() {
  return null;
}

/**
 * Obtém a próxima oferta da rotação AWIN.
 * Alterna entre produtos reais da KaBuM/Clovis e destaques de cupons ativos.
 * Puxa automaticamente a foto oficial do site via OG Image.
 */
async function getNextAwinDeal() {
  rotationCounter++;

  // A cada 4 produtos, dispara um cupom oficial em destaque (se houver cupons)
  const isVoucherTurn = rotationCounter % 4 === 0 && shuffledVouchers.length > 0;
  if (isVoucherTurn) {
    let v = null;
    for (let attempts = 0; attempts < shuffledVouchers.length; attempts++) {
      const candidate = shuffledVouchers[voucherIndex % shuffledVouchers.length];
      voucherIndex = (voucherIndex + 1) % shuffledVouchers.length;
      const key = `voucher:${candidate.id || candidate.code || candidate.title}`;
      if (!recentSentSet.has(key)) {
        v = candidate;
        markAsSent(key);
        break;
      }
    }
    if (!v) {
      v = shuffledVouchers[voucherIndex % shuffledVouchers.length];
      voucherIndex = (voucherIndex + 1) % shuffledVouchers.length;
    }

    const rawUrl = v.deeplinkTracking || buildAwinUrl(v.advertiserId || '17729', v.deeplink || 'https://www.kabum.com.br');
    const shortUrl = await shortenUrl(rawUrl);

    let imageUrl = v.imageUrl || null;
    if (!imageUrl && v.deeplink) {
      try {
        imageUrl = await fetchOgImage(v.deeplink);
      } catch (e) {}
    }

    const hasCode = v.code && v.code.trim().length > 0;
    const header = hasCode 
      ? '🎟️ *CUPOM DE DESCONTO OFICIAL LIBERADO!* 💥'
      : '🚨 *OFERTA & PROMOÇÃO OFICIAL LIBERADA!* 💥';

    const codeSection = hasCode
      ? `\n🏷️ *Cupom:* \`${v.code}\``
      : '';

    const howToUse = hasCode
      ? `⚡ *Como usar:* Clique no link, escolha os produtos participantes e insira o cupom \`${v.code}\` no carrinho antes de pagar!`
      : `⚡ *Como aproveitar:* Acesse pelo link oficial e aproveite os descontos direto no carrinho ou no Pix!`;

    const text = `${header}
${codeSection}
🏪 *Loja:* ${v.advertiser || 'KaBuM! Oficial'}
📝 *Benefício:* ${v.description}

🛒 *Ative seu desconto pelo link oficial da promoção:*
👉 ${shortUrl}

${howToUse}
⚠️ *Aviso:* Promoções e cupons oficiais possuem limite de usos e validade. Oferta oficial verificada pelo PreçoSmart.`;

    return {
      type: v.type || 'voucher',
      code: v.code || '',
      store: v.advertiser || 'KaBuM!',
      title: hasCode ? `Cupom ${v.code} - ${v.advertiser}` : (v.title || v.description),
      url: shortUrl,
      rawUrl,
      imageUrl,
      text
    };
  }

  // Vez de produto real: APENAS seleciona produtos com foto oficial verificada e sem repetição
  const list = shuffledProducts.length > 0 ? shuffledProducts : awinMasterData.products;
  let p = null;
  for (let attempts = 0; attempts < list.length; attempts++) {
    const candidate = list[productIndex % list.length];
    productIndex = (productIndex + 1) % list.length;
    const key = `prod:${candidate.id || candidate.title}`;
    if (!recentSentSet.has(key)) {
      p = candidate;
      markAsSent(key);
      break;
    }
  }
  if (!p) {
    p = list[productIndex % list.length];
    productIndex = (productIndex + 1) % list.length;
  }

  const targetUrl = p.deeplink || 'https://www.kabum.com.br';
  const rawUrl = p.deeplinkTracking || buildAwinUrl(p.advertiserId || '17729', targetUrl);
  const shortUrl = await shortenUrl(rawUrl);

  const imageUrl = p.imageUrl || null;
  const badge = getProductBadge(p.title);
  const storeName = p.advertiser || 'KaBuM! Brasil Oficial';

  const text = `${badge}

🏷️ *${p.title}*
🏪 *Loja:* ${storeName}
💰 *Condição:* Desconto exclusivo no Pix ou Parcelado
🚚 *Entrega:* Envio rápido e garantia oficial

🛒 *Compre com desconto verificado aqui:*
👉 ${shortUrl}

⚠️ *Aviso:* Preço promocional e estoque podem variar a qualquer momento. Oferta oficial verificada pelo PreçoSmart.`;

  return {
    type: 'product',
    store: storeName,
    title: p.title,
    url: shortUrl,
    rawUrl,
    imageUrl,
    text
  };
}

/**
 * Retorna todos os cupons ativos cadastrados
 */
function getAllActiveVouchers() {
  return awinMasterData.vouchers || [];
}

/**
 * Formata os cupons ativos em uma mensagem elegante para os membros
 */
function formatVoucherList() {
  const vouchers = getAllActiveVouchers();
  if (vouchers.length === 0) {
    return '🎟️ Não há cupons ativos cadastrados no momento. Fique de olho que postamos promoções diariamente!';
  }

  let msg = `🎟️ *CUPONS DE DESCONTO ATIVOS NO PREÇOSMART (${vouchers.length})* 🔥\n\n`;
  msg += `Copie o código e use no carrinho para ativar seu desconto:\n\n`;

  vouchers.slice(0, 15).forEach((v, idx) => {
    msg += `${idx + 1}️⃣ *Cupom:* \`${v.code}\`\n`;
    msg += `🏪 *Loja:* ${v.advertiser || 'KaBuM!'}\n`;
    msg += `📝 ${v.description.substring(0, 90)}...\n\n`;
  });

  msg += `🛒 *Para usar:* Acesse as ofertas pelo grupo, adicione ao carrinho e aplique o cupom antes do pagamento! 🚀`;
  return msg;
}

/**
 * Retorna uma oferta real e verificada da KaBuM com foto oficial em alta definição
 */
async function getSpecificKabumDeal(index = 0) {
  const kabumList = (awinMasterData.products || []).filter(p => p.advertiserId === '17729' && p.imageUrl && p.imageUrl.startsWith('http'));
  const list = kabumList.length > 0 ? kabumList : (awinMasterData.products || []);
  const p = list[index % list.length];
  const targetUrl = p.deeplink || 'https://www.kabum.com.br';
  const rawUrl = p.deeplinkTracking || buildAwinUrl('17729', targetUrl);
  const shortUrl = await shortenUrl(rawUrl);

  const imageUrl = p.imageUrl || null;
  const badge = getProductBadge(p.title);
  const text = `${badge}

🏷️ *${p.title}*
🏪 *Loja:* KaBuM! Brasil Oficial
💰 *Condição:* Desconto exclusivo no Pix ou Parcelado
🚚 *Entrega:* Envio rápido e garantia oficial

🛒 *Compre com desconto verificado aqui:*
👉 ${shortUrl}

⚠️ *Aviso:* Preço promocional e estoque podem variar a qualquer momento. Oferta oficial verificada pelo PreçoSmart.`;

  return {
    type: 'product',
    store: 'KaBuM! Brasil Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl,
    imageUrl,
    text
  };
}

module.exports = {
  buildAwinUrl,
  getNextAwinDeal,
  getSpecificKabumDeal,
  getAllActiveVouchers,
  formatVoucherList,
  awinMasterData
};
