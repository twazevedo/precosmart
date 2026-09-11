const axios = require('axios');
const { AFFILIATE } = require('./catalog');
const { evaluateDeal } = require('./dealScore');
const { extractPriceFromText } = require('./alerts');

const urlRegex = /(https?:\/\/[^\s]+)/g;

function extractProductKeyword(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  
  for (const line of lines) {
    const l = line.toLowerCase();
    if (l.includes('http') || l.includes('.com') || l.includes('cupom') || l.includes('por:') || l.includes('de:') || l.includes('alerta')) continue;
    
    // Limpa formatações de markdown, emojis e caracteres especiais
    const clean = line
      .replace(/[*_~`#\[\]]/g, '')
      .replace(/[🔥⚡📦🏷️🛒💙📱👀🚨😱👉🔗🛍️❄️😍💳]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
      
    if (clean.length > 5 && !clean.toLowerCase().includes('compre aqui') && !clean.toLowerCase().includes('acesse aqui') && !clean.toLowerCase().includes('link da compra')) {
      return clean.substring(0, 60);
    }
  }
  return 'Oferta';
}

function isSafePublicUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const h = parsed.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return false;
    if (h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('169.254.')) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

async function expandUrl(url) {
  if (!isSafePublicUrl(url)) return url;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    maxRedirects: 5,
    timeout: 5000,
    validateStatus: () => true
  };
  try {
    const resHead = await axios.head(url, options);
    const finalUrl = resHead.request?.res?.responseUrl || resHead.headers?.location || url;
    if (finalUrl !== url && isSafePublicUrl(finalUrl)) return finalUrl;
  } catch (e) {}

  try {
    const res = await axios.get(url, { ...options, responseType: 'stream' });
    const finalUrl = res.request?.res?.responseUrl || res.headers?.location || url;
    if (res.data && typeof res.data.destroy === 'function') {
      res.data.destroy();
    }
    if (isSafePublicUrl(finalUrl)) return finalUrl;
    return url;
  } catch (e) {
    return url;
  }
}

// Resolução de perfis de criadores do Mercado Livre (/social/...) para o produto direto
async function resolveMLSocialToDirect(socialUrl, keyword) {
  try {
    const res = await axios.get(socialUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 6000
    });
    const html = res.data;
    const matches = html.match(/https:\/\/(?:www|produto)\.mercadolivre\.com\.br\/[^\s\"']+/g) || [];
    const productLinks = matches.filter((u) => u.includes('/p/MLB') || u.includes('MLB-'));
    
    if (productLinks.length > 0) {
      const cleanKw = (keyword || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      let best = productLinks[0];
      for (const link of productLinks) {
        const cleanLink = link.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanKw && cleanLink.includes(cleanKw.substring(0, 8))) {
          best = link;
          break;
        }
      }
      return best.split('&amp;')[0].split('?')[0].split('#')[0];
    }
  } catch (e) {}
  return null;
}

async function replaceAffiliateTags(longUrl, productKeyword) {
  try {
    const urlObj = new URL(longUrl);
    
    // 0. AWIN e links já encurtados/afiliados da rede AWIN
    if (urlObj.hostname.includes('awin1.com') || urlObj.hostname.includes('tidd.ly')) {
      return longUrl;
    }
    
    // 1. Amazon
    if (urlObj.hostname.includes('amazon.')) {
      urlObj.searchParams.set('tag', AFFILIATE.amazon);
      urlObj.searchParams.delete('ascsubtag');
      urlObj.searchParams.delete('linkCode');
      urlObj.searchParams.delete('creative');
      return urlObj.toString();
    }
    
    // 2. Shopee (shopee.com.br, shope.ee, s.shopee.com.br, shp.ee)
    if (
      urlObj.hostname.includes('shopee.') || 
      urlObj.hostname.includes('shope.ee') || 
      urlObj.hostname.includes('shp.ee')
    ) {
      urlObj.searchParams.delete('uls_trackid');
      urlObj.searchParams.delete('utm_campaign');
      urlObj.searchParams.delete('utm_content');
      urlObj.searchParams.delete('utm_term');
      urlObj.searchParams.delete('aff_id');
      urlObj.searchParams.set('mmp_pid', 'an_' + AFFILIATE.shopee);
      urlObj.searchParams.set('utm_source', 'an_' + AFFILIATE.shopee);
      urlObj.searchParams.set('utm_medium', 'affiliates');
      return urlObj.toString();
    }
    
    // 3. Mercado Livre
    if (urlObj.hostname.includes('mercadolivre.')) {
      // Se for perfil de criador (/social/)
      if (urlObj.pathname.includes('/social/')) {
        const directML = await resolveMLSocialToDirect(longUrl, productKeyword);
        if (directML) {
          return `${directML}?matt_tool=${AFFILIATE.ml}&matt_word=precosmart`;
        }
        // Fallback seguro: busca oficial na Amazon com comissão
        const query = encodeURIComponent(productKeyword);
        return 'https://www.amazon.com.br/s?k=' + query + '&tag=' + AFFILIATE.amazon;
      }
      
      // Produto direto do Mercado Livre
      urlObj.searchParams.delete('ref');
      urlObj.searchParams.delete('tracking_id');
      urlObj.searchParams.set('matt_tool', AFFILIATE.ml);
      urlObj.searchParams.set('matt_word', 'precosmart');
      return urlObj.toString();
    }
    
    // 4. Magazine Luiza (magazinevoce.com.br, magazineluiza.com.br, maga.lu)
    if (
      urlObj.hostname.includes('magazinevoce.') || 
      urlObj.hostname.includes('magazineluiza.') || 
      urlObj.hostname.includes('maga.lu')
    ) {
      if (AFFILIATE.magalu) {
        const storeSlug = 'magazine' + AFFILIATE.magalu.toLowerCase().replace('magazine', '');
        if (urlObj.hostname.includes('magazinevoce.')) {
          const pathParts = urlObj.pathname.split('/').filter(Boolean);
          if (pathParts.length > 0) {
            pathParts[0] = storeSlug;
            urlObj.pathname = '/' + pathParts.join('/');
            return urlObj.toString();
          }
        }
        return `https://www.magazinevoce.com.br/${storeSlug}${urlObj.pathname}`;
      }
      return urlObj.toString();
    }
    
    // 5. Grupo Boticário (O Boticário, Eudora, Quem Disse Berenice, O.U.i Paris)
    const host = urlObj.hostname.toLowerCase();
    if (
      host.includes('boticario.com') ||
      host.includes('eudora.com') ||
      host.includes('quemdisseberenice.com') ||
      host.includes('ouiparis.com')
    ) {
      const botId = AFFILIATE.boticario || '27065696';
      let brandHost = 'minhaloja.boticario.com.br';
      if (host.includes('eudora.com')) brandHost = 'minhaloja.eudora.com.br';
      else if (host.includes('quemdisseberenice.com')) brandHost = 'minhaloja.quemdisseberenice.com.br';
      else if (host.includes('ouiparis.com')) brandHost = 'minhaloja.ouiparis.com.br';

      if (host.startsWith('minhaloja.')) {
        urlObj.pathname = urlObj.pathname.replace(/\/redirect\/[^\/]+/, `/redirect/${botId}`);
        if (!urlObj.pathname.includes('/redirect/')) {
          urlObj.pathname = `/redirect/${botId}/`;
        }
        urlObj.searchParams.set('origin', 'boticario');
        urlObj.searchParams.set('utm_source', 'portal_bot');
        urlObj.searchParams.set('utm_medium', 'precosmart');
        return urlObj.toString();
      }

      return `https://${brandHost}/redirect/${botId}/?origin=boticario&utm_source=portal_bot&utm_medium=precosmart`;
    }

    // 6. KaBuM! (AWIN - MID 17729)
    if (urlObj.hostname.includes('kabum.com.br')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanKabum = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=17729&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanKabum)}`;
    }

    // 7. Clovis Calçados (AWIN - MID 107702)
    if (urlObj.hostname.includes('clovis.com.br')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanClovis = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=107702&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanClovis)}`;
    }

    // 8. Domínios externos e intermediários:
    // Normaliza para busca direta oficial com comissão
    const query = encodeURIComponent(productKeyword);
    return 'https://www.amazon.com.br/s?k=' + query + '&tag=' + AFFILIATE.amazon;
  } catch (e) {
    const query = encodeURIComponent(productKeyword);
    return 'https://www.amazon.com.br/s?k=' + query + '&tag=' + AFFILIATE.amazon;
  }
}

function detectUrgencyBadge(text) {
  const l = text.toLowerCase();
  // Se a mensagem já possui cabeçalho de alerta, não duplica
  if (l.includes('alerta de cupom') || l.includes('menor preço histórico') || l.includes('oferta relâmpago')) {
    return '';
  }
  if (l.includes('cupom') || l.includes('voucher') || l.includes('código')) {
    return '🏷️ *ALERTA DE CUPOM ATIVO* 🏷️\n\n';
  }
  if (l.includes('menor preço') || l.includes('menor preco') || l.includes('menor valor') || l.includes('histórico') || l.includes('historico')) {
    return '📉 *MENOR PREÇO HISTÓRICO* 📉\n\n';
  }
  if (l.includes('bug') || l.includes('relâmpago') || l.includes('relampago') || l.includes('imperdível') || l.includes('imperdivel') || l.includes('corra')) {
    return '⚡ *OFERTA RELÂMPAGO / ESTOQUE LIMITADO* ⚡\n\n';
  }
  if (l.includes('frete grátis') || l.includes('frete gratis')) {
    return '🚚 *FRETE GRÁTIS DISPONÍVEL* 🚚\n\n';
  }
  return '';
}

async function processMessageText(text) {
  if (!text) return null;

  // 1. Uma oferta OBRIGATORIAMENTE precisa conter ao menos um link
  const initialUrls = text.match(urlRegex) || [];
  if (initialUrls.length === 0) {
    return null; // Não é oferta (mensagem de conversa comum), descarta imediatamente!
  }

  // 2. Higieniza o texto removendo links de terceiros e convites externos
  const lines = text.split('\n');
  const cleanLines = lines.filter((line) => {
    const l = line.toLowerCase();
    if (l.includes('convide amigos') || l.includes('familiares para o grupo')) return false;
    if (l.includes('entre no grupo') || l.includes('nosso grupo') || l.includes('link do grupo')) return false;
    if (l.includes('entre no canal') || l.includes('nosso canal') || l.includes('link do canal')) return false;
    if (l.includes('chat.whatsapp.com') || l.includes('wa.me') || l.includes('t.me') || l.includes('telegram.me')) return false;
    if (l.includes('grupos.') || l.includes('achadosgrupo')) return false;
    if (l.includes('linktr.ee') || l.includes('beacons.ai') || l.includes('heylink.me')) return false;
    return true;
  });
  
  let newText = cleanLines.join('\n');
  const productKeyword = extractProductKeyword(newText);
  const urls = newText.match(urlRegex) || [];

  if (urls.length === 0) {
    return null;
  }

  let hasValidStoreUrl = false;
  for (const url of urls) {
    let longUrl = url;
    
    // Expande qualquer URL que não seja destino final direto
    const isDirectFinal = url.includes('amazon.com.br/dp/') || 
                          url.includes('produto.mercadolivre.com.br/MLB') || 
                          url.includes('mercadolivre.com.br/p/MLB') ||
                          url.includes('shopee.com.br/product/');
                          
    if (!isDirectFinal) {
      longUrl = await expandUrl(url);
    }
    
    // Verifica se é de fato um domínio de e-commerce/loja
    const lowLong = longUrl.toLowerCase();
    const isStore = lowLong.includes('amazon.') || 
                    lowLong.includes('amzn.to') ||
                    lowLong.includes('mercadolivre.') || 
                    lowLong.includes('shopee.') || 
                    lowLong.includes('shope.ee') || 
                    lowLong.includes('magazinevoce.') || 
                    lowLong.includes('magazineluiza.') || 
                    lowLong.includes('maga.lu') ||
                    lowLong.includes('boticario.com') ||
                    lowLong.includes('eudora.com') ||
                    lowLong.includes('quemdisseberenice.com') ||
                    lowLong.includes('ouiparis.com') ||
                    lowLong.includes('kabum.') ||
                    lowLong.includes('casasbahia.');

    if (isStore) {
      hasValidStoreUrl = true;
    }

    const afUrl = await replaceAffiliateTags(longUrl, productKeyword);
    newText = newText.replace(url, afUrl);
  }

  // Se não tem nenhum link de loja real, não é uma oferta válida
  if (!hasValidStoreUrl) {
    return null;
  }

  const badge = detectUrgencyBadge(newText);
  const isMagalu = newText.includes('magazinevoce.com.br') || newText.includes('magazineluiza.com.br');
  const isBoticario = newText.includes('boticario.com') || newText.includes('eudora.com') || newText.includes('quemdisseberenice.com') || newText.includes('ouiparis.com');
  const detectedPrice = extractPriceFromText(newText);
  let dealBadge = '';
  if (detectedPrice) {
    const evaluation = evaluateDeal(productKeyword, detectedPrice);
    if (evaluation && evaluation.badge) {
      dealBadge = '\n\n' + evaluation.badge;
    }
  }

  let footer = '\n\n🔥 *Oferta Exclusiva PreçoSmart* 🔥';
  if (isMagalu) {
    footer = '\n\n💙 *Divulgador Autorizado Magazine Luiza* 💙\n🔒 *Compra 100% Segura e Garantida pelo Magalu*\n🚚 *Entrega Rápida ou Retire Grátis na Loja*\n🎟️ *Vitrine de Cupons:* https://especiais.magazineluiza.com.br/magazinevoce/cupons/?showcase=magazineprecosmartvip';
  } else if (isBoticario) {
    footer = '\n\n🌸 *Consultor Autorizado Grupo Boticário* 🌸\n🔒 *Produtos 100% Originais Direto da Marca*\n✨ *Compre Online e Receba em Casa*';
  }

  newText = badge + newText.trim() + dealBadge + footer;
  return newText;
}

function extractCanonicalId(url) {
  if (!url) return null;
  // Amazon ASIN
  const amzMatch = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i) || url.match(/\/([B0][A-Z0-9]{9})/i);
  if (amzMatch) return 'amz_' + amzMatch[1].toUpperCase();

  // Mercado Livre MLB
  const mlMatch = url.match(/(MLB-?\d{6,14})/i);
  if (mlMatch) return 'ml_' + mlMatch[1].replace('-', '').toUpperCase();

  // Shopee Item ID
  const shpMatch = url.match(/\/product\/\d+\/(\d+)/i) || url.match(/i\.\d+\.(\d+)/i);
  if (shpMatch) return 'shp_' + shpMatch[1];

  // Magalu SKU
  const magMatch = url.match(/\/p\/([0-9a-z]+)\//i) || url.match(/\/p\/([0-9a-z]+)$/i);
  if (magMatch) return 'mag_' + magMatch[1];

  return null;
}

const ogImageCache = new Map();

function fetchOgImage(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return Promise.resolve(null);
  if (ogImageCache.has(urlStr)) return Promise.resolve(ogImageCache.get(urlStr));

  const https = require('https');
  const http = require('http');

  return new Promise((resolve) => {
    let currentUrl = urlStr;
    let redirects = 0;
    let isSettled = false;

    function finish(result) {
      if (isSettled) return;
      isSettled = true;
      if (result) ogImageCache.set(urlStr, result);
      resolve(result || null);
    }

    function doReq(target) {
      if (redirects > 6) return finish(null);
      let u;
      try {
        u = new URL(target, currentUrl);
        currentUrl = u.href;
      } catch (e) {
        return finish(null);
      }

      const client = u.protocol === 'http:' ? http : https;
      const options = {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9'
        },
        timeout: 6000
      };

      const req = client.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirects++;
          const nextUrl = new URL(res.headers.location, u.href).href;
          req.destroy();
          return doReq(nextUrl);
        }
        if (res.statusCode !== 200) {
          req.destroy();
          return finish(null);
        }

        let html = '';
        res.on('data', chunk => {
          if (isSettled) return;
          html += chunk;
          const m = html.match(/<meta[^>]*?property=["']og:image["'][^>]*?content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*?content=["']([^"']+)["'][^>]*?property=["']og:image["']/i) ||
                    html.match(/<meta[^>]*?name=["']twitter:image["'][^>]*?content=["']([^"']+)["']/i) ||
                    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
          if (m && m[1]) {
            req.destroy();
            return finish(m[1]);
          }
          if (html.length > 60000) {
            req.destroy();
            return finish(null);
          }
        });

        res.on('end', () => {
          if (!isSettled) finish(null);
        });
      });

      req.on('error', () => finish(null));
      req.on('timeout', () => {
        req.destroy();
        finish(null);
      });
    }

    doReq(urlStr);
  });
}

module.exports = { processMessageText, extractProductKeyword, extractCanonicalId, fetchOgImage };
