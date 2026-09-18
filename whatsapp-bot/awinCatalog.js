/**
 * @file awinCatalog.js — Catálogo & Rotação Inteligente de Afiliados AWIN
 * @description Gerencia 218+ produtos e 26+ cupons oficiais da KaBuM! e Clovis Calçados.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { shortenUrl } = require('./linkShortener');
const { fetchOgImage, upgradeToHdImage } = require('./mirror');

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

// Inicializa listas dinâmicas embaralhadas APENAS com ofertas que possuem foto oficial Full HD
const allAvailableProducts = [
  ...(awinMasterData.products || []),
  ...(awinMasterData.nikeDeals || []),
  ...(awinMasterData.olympikusDeals || []),
  ...(awinMasterData.kabumDeals || []),
  ...(awinMasterData.clovisDeals || []),
  ...(awinMasterData.legoDeals || []),
  ...(awinMasterData.ninjaDeals || []),
  ...(awinMasterData.underArmourDeals || []),
  ...(awinMasterData.hopeDeals || []),
  ...(awinMasterData.lacosteDeals || []),
  ...(awinMasterData.lgDeals || []),
  ...(awinMasterData.mlDeals || []),
  ...(awinMasterData.amazonDeals || [])
];
const validInitialProducts = allAvailableProducts.filter(p => p.imageUrl && p.imageUrl.startsWith('http'));
let shuffledProducts = shuffleArray(validInitialProducts);

const validInitialVouchers = (awinMasterData.vouchers || []).filter(v => v.imageUrl && v.imageUrl.startsWith('http'));
let shuffledVouchers = shuffleArray(validInitialVouchers);

let productIndex = Math.floor(Math.random() * Math.max(1, shuffledProducts.length));
let voucherIndex = Math.floor(Math.random() * Math.max(1, shuffledVouchers.length));
let rotationCounter = 0;

/**
 * Determina o badge e categoria visual do produto pelo título
 */
function getProductBadge(title = '') {
  const t = title.toLowerCase();
  if (t.includes('lego') || t.includes('star wars') || t.includes('harry potter') || t.includes('minifigura') || t.includes('brinquedo')) {
    return '🧱 *LEGO BRASIL OFICIAL — UNIVERSO & COLECIONÁVEIS* 🚀✨';
  }
  if (t.includes('ninja') || t.includes('creami') || t.includes('shark') || t.includes('flexstyle') || t.includes('liquidificador')) {
    return '🌪️ *SHARK-NINJA BRASIL OFICIAL — CASA & TECNOLOGIA* 🍧⚡';
  }
  if (t.includes('under armour') || t.includes('armour') || t.includes('treino') || t.includes('crossfit')) {
    return '⚡ *UNDER ARMOUR BRASIL — ALTA PERFORMANCE & TREINO* 🏋️‍♂️👟';
  }
  if (t.includes('hope') || t.includes('lingerie') || t.includes('sutiã') || t.includes('calcinha') || t.includes('renda')) {
    return '✨ *HOPE LINGERIE OFICIAL — CONFORTO & ELEGÂNCIA* 👙💖';
  }
  if (t.includes('lg') || t.includes('oled') || t.includes('ultragear') || t.includes('lava e seca') || t.includes('dual inverter')) {
    return '📺 *LG BRASIL OFICIAL — OLED, ULTRA ELETRO & TECH* 🖥️✨';
  }
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

  // 1. Rotação de Cupom: APENAS se houver cupom com foto oficial verificada
  const isVoucherTurn = rotationCounter % 4 === 0 && shuffledVouchers.length > 0;
  if (isVoucherTurn) {
    let v = null;
    let voucherImg = null;
    for (let attempts = 0; attempts < shuffledVouchers.length; attempts++) {
      const candidate = shuffledVouchers[voucherIndex % shuffledVouchers.length];
      voucherIndex = (voucherIndex + 1) % shuffledVouchers.length;
      let img = upgradeToHdImage(candidate.imageUrl);
      if (!img && candidate.deeplink) {
        try { img = await fetchOgImage(candidate.deeplink); } catch (e) {}
      }
      if (img) {
        const key = `voucher:${candidate.id || candidate.code || candidate.title}`;
        if (!recentSentSet.has(key)) {
          v = candidate;
          voucherImg = img;
          markAsSent(key);
          break;
        }
      }
    }

    if (v && voucherImg) {
      const rawUrl = v.deeplinkTracking || buildAwinUrl(v.advertiserId || '17729', v.deeplink || 'https://www.kabum.com.br');
      const shortUrl = await shortenUrl(rawUrl);
      const hasCode = v.code && v.code.trim().length > 0;
      const header = hasCode 
        ? '🎟️ *CUPOM DE DESCONTO OFICIAL LIBERADO!* 💥'
        : '🚨 *OFERTA & PROMOÇÃO OFICIAL LIBERADA!* 💥';

      const codeSection = hasCode ? `\n🏷️ *Cupom:* \`${v.code}\`` : '';
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
        imageUrl: voucherImg,
        text
      };
    }
  }

  // 2. Vez de produto real: APENAS seleciona produtos com foto oficial Full HD
  const list = shuffledProducts.length > 0 ? shuffledProducts : (awinMasterData.products || []).filter(p => p.imageUrl && p.imageUrl.startsWith('http'));
  let p = null;
  let productImg = null;

  for (let attempts = 0; attempts < list.length; attempts++) {
    const candidate = list[productIndex % list.length];
    productIndex = (productIndex + 1) % list.length;
    let img = upgradeToHdImage(candidate.imageUrl);
    if (!img && candidate.deeplink) {
      try { img = await fetchOgImage(candidate.deeplink); } catch (e) {}
    }
    if (img) {
      const key = `prod:${candidate.id || candidate.title}`;
      if (!recentSentSet.has(key)) {
        p = candidate;
        productImg = img;
        markAsSent(key);
        break;
      }
    }
  }

  // Se todos foram enviados recentemente, seleciona qualquer produto COM FOTO OFICIAL
  if (!p || !productImg) {
    for (let attempts = 0; attempts < list.length; attempts++) {
      const candidate = list[productIndex % list.length];
      productIndex = (productIndex + 1) % list.length;
      let img = upgradeToHdImage(candidate.imageUrl);
      if (img) {
        p = candidate;
        productImg = img;
        break;
      }
    }
  }

  // Garantia absoluta: NUNCA envia sem foto oficial
  if (!p || !productImg) {
    console.warn('[AWIN] Nenhuma oferta com foto oficial disponível no momento.');
    return null;
  }

  const targetUrl = p.deeplink || 'https://www.kabum.com.br';
  const rawUrl = p.deeplinkTracking || (p.advertiserId && p.advertiserId !== 'amazon' && p.advertiserId !== 'mercadolivre' ? buildAwinUrl(p.advertiserId, targetUrl) : targetUrl);
  const shortUrl = p.shortUrl || await shortenUrl(rawUrl);
  const badge = getProductBadge(p.title);
  const storeName = p.advertiser ? `${p.advertiser} Oficial` : 'PreçoSmart Oficial';

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : (p.priceCurrent ? `💵 *Preço:* Apenas *${p.priceCurrent}*\n` : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`);
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const couponSection = p.code ? `🏷️ *Cupom:* \`${p.code}\` (insira no carrinho)\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `${badge}

🏷️ *${p.title}*
🏪 *Loja:* ${storeName}
${priceSection}${discountSection}${couponSection}${descSection}🛒 *Compre com desconto verificado aqui:*
👉 ${shortUrl}

🚚 *Envio rápido com garantia oficial.*
⚠️ *Aviso:* Preço promocional e estoque podem variar a qualquer momento. Oferta oficial verificada pelo PreçoSmart.`;

  return {
    type: 'product',
    store: storeName,
    title: p.title,
    url: shortUrl,
    rawUrl,
    imageUrl: productImg,
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
  const kabumList = awinMasterData.kabumDeals && awinMasterData.kabumDeals.length > 0
    ? awinMasterData.kabumDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === '17729' && p.imageUrl && p.imageUrl.startsWith('http'));

  const list = kabumList.length > 0 ? kabumList : (awinMasterData.products || []);
  const p = list[index % list.length];
  const targetUrl = p.deeplink || 'https://www.kabum.com.br';
  const rawUrl = p.deeplinkTracking || buildAwinUrl('17729', targetUrl);
  const shortUrl = p.shortUrl || await shortenUrl(rawUrl);

  let imageUrl = upgradeToHdImage(p.imageUrl);
  if (!imageUrl && targetUrl) {
    try {
      imageUrl = await fetchOgImage(targetUrl);
    } catch (e) {}
  }
  const badge = getProductBadge(p.title);
  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`;
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `${badge}

🏷️ *${p.title}*
🏪 *Loja:* KaBuM! Brasil Oficial
${priceSection}${discountSection}${descSection}🛒 *Compre com desconto verificado na KaBuM!:*
👉 ${shortUrl}

🚚 *Envio rápido, garantia oficial e nota fiscal.*
⚠️ *Aviso:* Preço promocional e estoque podem variar a qualquer momento. Oferta verificada pelo PreçoSmart.`;

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

/**
 * Retorna uma oferta real e verificada da Nike Brasil com foto Full HD e link tidd.ly
 */
async function getSpecificNikeDeal(index = 0) {
  const nikeList = awinMasterData.nikeDeals && awinMasterData.nikeDeals.length > 0 
    ? awinMasterData.nikeDeals 
    : (awinMasterData.products || []).filter(p => p.advertiserId === '17652' || (p.advertiser && p.advertiser.toLowerCase().includes('nike')));
  
  if (nikeList.length === 0) return null;
  const p = nikeList[index % nikeList.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || await shortenUrl(p.deeplinkTracking || p.deeplink);
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const priceSection = p.priceOriginal && p.priceCurrent 
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo oficial no Pix ou Cartão\n`;
  const couponSection = p.code ? `🏷️ *Cupom:* \`${p.code}\` (insira no carrinho)\n` : '';

  const text = `👟 *OFERTA OFICIAL NIKE BRASIL!* ⚡

🏷️ *${p.title}*
🏪 *Loja:* Nike Brasil Oficial
${priceSection}${discountSection}${couponSection}📝 ${p.description}

🛒 *Garanta o seu no link oficial:*
👉 ${shortUrl}

🚚 *Frete oficial com entrega garantida e produto 100% original.*
⚠️ *Aviso:* Estoque e numerações limitadas na Nike Brasil. Oferta verificada pelo PreçoSmart.`;

  return {
    type: 'product',
    store: 'Nike Brasil Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial da Amazon Brasil com foto Full HD e tag de associado
 */
async function getSpecificAmazonDeal(index = 0) {
  const amzList = awinMasterData.amazonDeals && awinMasterData.amazonDeals.length > 0
    ? awinMasterData.amazonDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === 'amazon' || (p.advertiser && p.advertiser.toLowerCase().includes('amazon')));

  if (amzList.length === 0) return null;
  const p = amzList[index % amzList.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || p.deeplink;
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : (p.priceCurrent ? `💵 *Preço:* Apenas *${p.priceCurrent}*\n` : `💰 *Condição:* Desconto exclusivo no Pix ou Boleto/Cartão\n`);
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `📦 *OFERTA OFICIAL AMAZON BRASIL!* ⚡

🏷️ *${p.title}*
🏪 *Loja:* Amazon Brasil Oficial
${priceSection}${discountSection}${descSection}🛒 *Compre com desconto garantido na Amazon:*
👉 ${shortUrl}

🚚 *Frete Grátis com Amazon Prime e garantia de entrega rápida.*
⚠️ *Aviso:* Preço promocional sujeito a alteração a qualquer momento. Oferta oficial verificada pelo PreçoSmart.`;

  return {
    type: 'product',
    store: 'Amazon Brasil Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial do Mercado Livre com foto Full HD e tag de afiliado
 */
async function getSpecificMLDeal(index = 0) {
  const mlList = awinMasterData.mlDeals && awinMasterData.mlDeals.length > 0
    ? awinMasterData.mlDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === 'mercadolivre' || (p.advertiser && p.advertiser.toLowerCase().includes('mercado livre')));

  if (mlList.length === 0) return null;
  const p = mlList[index % mlList.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || p.deeplink;
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : (p.priceCurrent ? `💵 *Preço:* Apenas *${p.priceCurrent}*\n` : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`);
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `🟡 *OFERTA OFICIAL MERCADO LIVRE!* ⚡

🏷️ *${p.title}*
🏪 *Loja:* Mercado Livre Oficial
${priceSection}${discountSection}${descSection}🛒 *Compre pelo link verificado do Mercado Livre:*
👉 ${shortUrl}

🚚 *Entrega Full mais rápida do Brasil e compra 100% garantida.*
⚠️ *Aviso:* Preço promocional sujeito a alteração a qualquer momento. Oferta oficial verificada pelo PreçoSmart.`;

  return {
    type: 'product',
    store: 'Mercado Livre Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial da Olympikus com foto Full HD e link de afiliado
 */
async function getSpecificOlympikusDeal(index = 0) {
  const olyList = awinMasterData.olympikusDeals && awinMasterData.olympikusDeals.length > 0
    ? awinMasterData.olympikusDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === '17698' || (p.advertiser && p.advertiser.toLowerCase().includes('olympikus')));

  if (olyList.length === 0) return null;
  const p = olyList[index % olyList.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || await shortenUrl(p.deeplinkTracking || p.deeplink);
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo oficial no Pix ou Parcelado\n`;
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `🏃 *OFERTA OFICIAL OLYMPIKUS BRASIL!* ⚡

🏷️ *${p.title}*
🏪 *Loja:* Loja Oficial Olympikus
${priceSection}${discountSection}${descSection}🛒 *Garanta o seu com desconto no site oficial:*
👉 ${shortUrl}

🚚 *Frete oficial garantido e produto 100% original de fábrica.*
⚠️ *Aviso:* Estoque e numerações limitadas. Oferta verificada pelo PreçoSmart.`;

  return {
    type: 'product',
    store: 'Olympikus Brasil Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial da Clovis Calçados com foto Full HD e link de afiliado
 */
async function getSpecificClovisDeal(index = 0) {
  const clovisList = awinMasterData.clovisDeals && awinMasterData.clovisDeals.length > 0
    ? awinMasterData.clovisDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === '107702' || (p.advertiser && p.advertiser.toLowerCase().includes('clovis')));

  if (clovisList.length === 0) return null;
  const p = clovisList[index % clovisList.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || await shortenUrl(p.deeplinkTracking || p.deeplink);
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`;
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `👠 *OFERTA CLOVIS CALÇADOS!* 🛍️

🏷️ *${p.title}*
🏪 *Loja:* Clovis Calçados Oficial
${priceSection}${discountSection}${descSection}🛒 *Compre com desconto garantido na Clovis:*
👉 ${shortUrl}

🚚 *Entrega para todo o Brasil e troca fácil garantida.*
⚠️ *Aviso:* Preço promocional e numerações sujeitas à disponibilidade.`;

  return {
    type: 'product',
    store: 'Clovis Calçados Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial da Lego Brasil com foto Full HD e link de afiliado
 */
async function getSpecificLegoDeal(index = 0) {
  const list = awinMasterData.legoDeals && awinMasterData.legoDeals.length > 0
    ? awinMasterData.legoDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === '30511' || (p.advertiser && p.advertiser.toLowerCase().includes('lego')));

  if (list.length === 0) return null;
  const p = list[index % list.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || await shortenUrl(p.deeplinkTracking || p.deeplink);
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`;
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `🧱 *OFERTA OFICIAL LEGO BRASIL!* ⚡

🏷️ *${p.title}*
🏪 *Loja:* Lego Brasil Oficial
${priceSection}${discountSection}${descSection}🛒 *Garanta o seu com desconto na Lego Brasil:*
👉 ${shortUrl}

🚚 *Frete oficial garantido e produto 100% original de fábrica.*
⚠️ *Aviso:* Estoque promocional limitado. Oferta verificada pelo PreçoSmart.`;

  return {
    type: 'product',
    store: 'Lego Brasil Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial da Shark-Ninja Brasil com foto Full HD e link de afiliado
 */
async function getSpecificNinjaDeal(index = 0) {
  const list = awinMasterData.ninjaDeals && awinMasterData.ninjaDeals.length > 0
    ? awinMasterData.ninjaDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === '106763' || (p.advertiser && p.advertiser.toLowerCase().includes('ninja')));

  if (list.length === 0) return null;
  const p = list[index % list.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || await shortenUrl(p.deeplinkTracking || p.deeplink);
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`;
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `🌪️ *OFERTA OFICIAL SHARK-NINJA BRASIL!* 🍧⚡

🏷️ *${p.title}*
🏪 *Loja:* Shark-Ninja Brasil Oficial
${priceSection}${discountSection}${descSection}🛒 *Compre com tecnologia Shark-Ninja:*
👉 ${shortUrl}

🚚 *Tecnologia internacional com envio oficial para todo o Brasil.*
⚠️ *Aviso:* Sujeito a alteração de preço e estoque.`;

  return {
    type: 'product',
    store: 'Shark-Ninja Brasil Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial da Under Armour Brasil com foto Full HD e link de afiliado
 */
async function getSpecificUnderArmourDeal(index = 0) {
  const list = awinMasterData.underArmourDeals && awinMasterData.underArmourDeals.length > 0
    ? awinMasterData.underArmourDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === '18864' || (p.advertiser && p.advertiser.toLowerCase().includes('armour')));

  if (list.length === 0) return null;
  const p = list[index % list.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || await shortenUrl(p.deeplinkTracking || p.deeplink);
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`;
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `⚡ *OFERTA OFICIAL UNDER ARMOUR BRASIL!* 🏋️‍♂️👟

🏷️ *${p.title}*
🏪 *Loja:* Under Armour Brasil Oficial
${priceSection}${discountSection}${descSection}🛒 *Garanta o seu com desconto na Under Armour:*
👉 ${shortUrl}

🚚 *Alta performance com entrega rápida para todo o Brasil.*
⚠️ *Aviso:* Estoque e numerações sujeitos a alteração.`;

  return {
    type: 'product',
    store: 'Under Armour Brasil Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial da Hope Lingerie com foto Full HD e link de afiliado
 */
async function getSpecificHopeDeal(index = 0) {
  const list = awinMasterData.hopeDeals && awinMasterData.hopeDeals.length > 0
    ? awinMasterData.hopeDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === '107039' || (p.advertiser && p.advertiser.toLowerCase().includes('hope')));

  if (list.length === 0) return null;
  const p = list[index % list.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || await shortenUrl(p.deeplinkTracking || p.deeplink);
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`;
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `💖 *OFERTA OFICIAL HOPE LINGERIE!* 👙✨

🏷️ *${p.title}*
🏪 *Loja:* Hope Lingerie Oficial
${priceSection}${discountSection}${descSection}🛒 *Compre com desconto garantido na Hope:*
👉 ${shortUrl}

🚚 *Conforto e elegância com entrega rápida e discreta.*
⚠️ *Aviso:* Preço promocional e tamanhos sujeitos à disponibilidade.`;

  return {
    type: 'product',
    store: 'Hope Lingerie Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial da Lacoste Brasil com foto Full HD e link de afiliado
 */
async function getSpecificLacosteDeal(index = 0) {
  const list = awinMasterData.lacosteDeals && awinMasterData.lacosteDeals.length > 0
    ? awinMasterData.lacosteDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === '112756' || (p.advertiser && p.advertiser.toLowerCase().includes('lacoste')));

  if (list.length === 0) return null;
  const p = list[index % list.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || await shortenUrl(p.deeplinkTracking || p.deeplink);
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`;
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `🐊 *OFERTA OFICIAL LACOSTE BRASIL!* 👕✨

🏷️ *${p.title}*
🏪 *Loja:* Lacoste Brasil Oficial
${priceSection}${discountSection}${descSection}🛒 *Garanta o seu clássico na Lacoste Oficial:*
👉 ${shortUrl}

🚚 *Elegância francesa atemporal com produto 100% original.*
⚠️ *Aviso:* Peças exclusivas com estoque limitado.`;

  return {
    type: 'product',
    store: 'Lacoste Brasil Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

/**
 * Retorna uma oferta oficial da LG Brasil com foto Full HD e link de afiliado
 */
async function getSpecificLGDeal(index = 0) {
  const list = awinMasterData.lgDeals && awinMasterData.lgDeals.length > 0
    ? awinMasterData.lgDeals
    : (awinMasterData.products || []).filter(p => p.advertiserId === '33061' || (p.advertiser && p.advertiser.toLowerCase().includes('lg')));

  if (list.length === 0) return null;
  const p = list[index % list.length];
  const shortUrl = p.shortUrl || p.deeplinkTracking || await shortenUrl(p.deeplinkTracking || p.deeplink);
  const imageUrl = upgradeToHdImage(p.imageUrl);

  const priceSection = p.priceOriginal && p.priceCurrent
    ? `💵 *Preço:* De ~${p.priceOriginal}~ por apenas *${p.priceCurrent}*\n`
    : `💰 *Condição:* Desconto exclusivo no Pix ou Parcelado\n`;
  const discountSection = p.discount ? `🔥 *Desconto:* ${p.discount}\n` : '';
  const descSection = p.description ? `📝 ${p.description}\n\n` : '';

  const text = `📺 *OFERTA OFICIAL LG BRASIL!* 🖥️✨

🏷️ *${p.title}*
🏪 *Loja:* LG Brasil Oficial
${priceSection}${discountSection}${descSection}🛒 *Compre com desconto garantido na LG:*
👉 ${shortUrl}

🚚 *Tecnologia líder mundial com garantia oficial LG Brasil.*
⚠️ *Aviso:* Preço promocional sujeito a alteração a qualquer momento.`;

  return {
    type: 'product',
    store: 'LG Brasil Oficial',
    title: p.title,
    url: shortUrl,
    rawUrl: p.deeplinkTracking,
    imageUrl,
    text
  };
}

module.exports = {
  buildAwinUrl,
  getNextAwinDeal,
  getSpecificKabumDeal,
  getSpecificNikeDeal,
  getSpecificOlympikusDeal,
  getSpecificClovisDeal,
  getSpecificAmazonDeal,
  getSpecificMLDeal,
  getSpecificLegoDeal,
  getSpecificNinjaDeal,
  getSpecificUnderArmourDeal,
  getSpecificHopeDeal,
  getSpecificLacosteDeal,
  getSpecificLGDeal,
  getAllActiveVouchers,
  formatVoucherList,
  awinMasterData
};
