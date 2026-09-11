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

let productIndex = 0;
let voucherIndex = 0;
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
  if (t.includes('calçados') || t.includes('melissa') || t.includes('via marte') || t.includes('tênis') || t.includes('sandália')) {
    return '🚨 *CLOVIS CALÇADOS — QUEIMA DE ESTOQUE TOTAL!* 👠👟';
  }
  return '🔥 *OFERTA EXCLUSIVA VERIFICADA PREÇOSMART* 🛒⚡';
}

/**
 * Retorna uma imagem padrão de categoria caso o produto não tenha og:image
 */
function getFallbackImage(title = '') {
  const t = title.toLowerCase();
  if (t.includes('monitor') || t.includes('tv')) {
    return 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=800';
  }
  if (t.includes('mouse') || t.includes('teclado') || t.includes('headset') || t.includes('gamer')) {
    return 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=800';
  }
  if (t.includes('ssd') || t.includes('hardware') || t.includes('placa') || t.includes('ryzen') || t.includes('intel')) {
    return 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?q=80&w=800';
  }
  if (t.includes('calçado') || t.includes('tênis') || t.includes('melissa')) {
    return 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?q=80&w=800';
  }
  return 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800';
}

/**
 * Obtém a próxima oferta da rotação AWIN.
 * Alterna entre produtos reais da KaBuM/Clovis e destaques de cupons ativos.
 * Puxa automaticamente a foto oficial do site via OG Image.
 */
async function getNextAwinDeal() {
  rotationCounter++;

  // A cada 4 produtos, dispara um cupom oficial em destaque (se houver cupons)
  const isVoucherTurn = rotationCounter % 4 === 0 && awinMasterData.vouchers.length > 0;

  if (isVoucherTurn) {
    const v = awinMasterData.vouchers[voucherIndex];
    voucherIndex = (voucherIndex + 1) % awinMasterData.vouchers.length;

    const rawUrl = v.deeplinkTracking || buildAwinUrl(v.advertiserId || '17729', v.deeplink || 'https://www.kabum.com.br');
    const shortUrl = await shortenUrl(rawUrl);

    let imageUrl = null;
    if (v.deeplink) {
      try {
        imageUrl = await fetchOgImage(v.deeplink);
      } catch (e) {}
    }
    if (!imageUrl) {
      imageUrl = 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=800';
    }

    const text = `🎟️ *CUPOM DE DESCONTO OFICIAL LIBERADO!* 💥

🏷️ *Cupom:* \`${v.code}\`
🏪 *Loja:* ${v.advertiser || 'KaBuM! Oficial'}
📝 *Benefício:* ${v.description}

🛒 *Ative seu desconto pelo link oficial da promoção:*
👉 ${shortUrl}

⚡ *Como usar:* Clique no link, escolha os produtos participantes e insira o cupom \`${v.code}\` no carrinho antes de pagar!
⚠️ *Aviso:* Cupons oficiais possuem limite de usos e data de validade. Aproveite antes de esgotar.`;

    return {
      type: 'voucher',
      code: v.code,
      store: v.advertiser || 'KaBuM!',
      title: `Cupom ${v.code} - ${v.advertiser}`,
      url: shortUrl,
      rawUrl,
      imageUrl,
      text
    };
  }

  // Vez de produto real
  const p = awinMasterData.products[productIndex];
  productIndex = (productIndex + 1) % awinMasterData.products.length;

  const targetUrl = p.deeplink || 'https://www.kabum.com.br';
  const rawUrl = p.deeplinkTracking || buildAwinUrl(p.advertiserId || '17729', targetUrl);
  const shortUrl = await shortenUrl(rawUrl);

  // Tenta extrair a foto real da página do produto (OG Image)
  let imageUrl = null;
  if (targetUrl) {
    try {
      imageUrl = await fetchOgImage(targetUrl);
    } catch (e) {}
  }
  if (!imageUrl) {
    imageUrl = getFallbackImage(p.title);
  }

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

module.exports = {
  buildAwinUrl,
  getNextAwinDeal,
  getAllActiveVouchers,
  formatVoucherList,
  awinMasterData
};
