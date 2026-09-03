const axios = require('axios');
const { AFFILIATE } = require('./catalog');

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

async function expandUrl(url) {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 8,
      timeout: 6000,
      validateStatus: () => true
    });
    return res.request?.res?.responseUrl || res.headers?.location || url;
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
      urlObj.searchParams.set('mmp_pid', 'an_' + AFFILIATE.shopee);
      urlObj.searchParams.set('utm_source', 'an_' + AFFILIATE.shopee);
      urlObj.searchParams.set('utm_medium', 'affiliates');
      urlObj.searchParams.set('aff_id', AFFILIATE.shopee);
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
    
    // 5. Domínios externos e intermediários:
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
  if (!text) return text;

  // 1. Higieniza o texto removendo links de terceiros e convites externos
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
    
    const afUrl = await replaceAffiliateTags(longUrl, productKeyword);
    newText = newText.replace(url, afUrl);
  }

  const badge = detectUrgencyBadge(newText);
  newText = badge + newText.trim() + '\n\n🔥 *Oferta Exclusiva PreçoSmart* 🔥';
  return newText;
}

module.exports = { processMessageText };
