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
    const h = parsed.hostname.toLowerCase().trim();
    
    // Bloqueia hosts locais explícitos
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h === '169.254.169.254') return false;
    
    // Bloqueia faixas privadas e de loopback (RFC 1918, RFC 3927, 127.0.0.0/8)
    if (/^127\./.test(h)) return false;
    if (/^10\./.test(h)) return false;
    if (/^192\.168\./.test(h)) return false;
    if (/^169\.254\./.test(h)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return false;

    // Bloqueia representações inteiras/hexadecimais/octais de IP
    if (/^0x[0-9a-f]+$/i.test(h) || /^\d+$/.test(h)) return false;

    // Bloqueia IPv6 loopback ou local
    if (h.startsWith('[') || h.includes(':')) {
      if (h.includes('::1') || h.includes('fe80') || h.includes('fc00') || h.includes('fd00')) return false;
    }

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


const COMPETITOR_URL_PATTERN = /(?:https?:\/\/)?(?:chat\.whatsapp\.com|whatsapp\.com\/(?:channel|invite)|wa\.me|wa\.link|api\.whatsapp\.com|(?:t|telegram)\.me|telegram\.dog|linktr\.ee|beacons\.ai|heylink\.me|instabio\.cc|linkbio\.co|campsite\.bio|bio\.site|allmylinks\.com|canaldewhatsapp\.com|gruposwhats\.app|zapgrupos\.com(?:\.br)?|meugrupo\.vip|grupos\.me|achadosgrupo[^\s]*)[^\s]*/gi;

function isCompetitorUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const low = url.toLowerCase();
  return (
    low.includes('chat.whatsapp.com') ||
    low.includes('whatsapp.com/channel') ||
    low.includes('whatsapp.com/invite') ||
    low.includes('wa.me') ||
    low.includes('wa.link') ||
    low.includes('api.whatsapp.com') ||
    low.includes('t.me') ||
    low.includes('telegram.me') ||
    low.includes('telegram.dog') ||
    low.includes('linktr.ee') ||
    low.includes('beacons.ai') ||
    low.includes('heylink.me') ||
    low.includes('instabio.cc') ||
    low.includes('linkbio.co') ||
    low.includes('campsite.bio') ||
    low.includes('bio.site') ||
    low.includes('allmylinks.com') ||
    low.includes('canaldewhatsapp.com') ||
    low.includes('gruposwhats.app') ||
    low.includes('zapgrupos.com') ||
    low.includes('meugrupo.vip') ||
    low.includes('grupos.me') ||
    low.includes('achadosgrupo')
  );
}

function isExternalNonStore(url) {
  if (!url || typeof url !== 'string') return false;
  const low = url.toLowerCase();
  return (
    isCompetitorUrl(low) ||
    low.includes('instagram.com') ||
    low.includes('threads.net') ||
    low.includes('facebook.com') ||
    low.includes('fb.me') ||
    low.includes('twitter.com') ||
    low.includes('x.com') ||
    low.includes('tiktok.com') ||
    low.includes('youtube.com') ||
    low.includes('youtu.be') ||
    low.includes('kwai.com') ||
    low.includes('linkedin.com') ||
    low.includes('globo.com') ||
    low.includes('uol.com.br') ||
    low.includes('r7.com')
  );
}

function isSupportedStore(lowLong) {
  return (
    lowLong.includes('amazon.') || 
    lowLong.includes('amzn.to') ||
    lowLong.includes('mercadolivre.') || 
    lowLong.includes('meli.la') ||
    lowLong.includes('shopee.') || 
    lowLong.includes('shope.ee') || 
    lowLong.includes('shp.ee') ||
    lowLong.includes('magazinevoce.') || 
    lowLong.includes('magazineluiza.') || 
    lowLong.includes('influenciadormagalu.') || 
    lowLong.includes('maga.lu') ||
    lowLong.includes('boticario.com') ||
    lowLong.includes('eudora.com') ||
    lowLong.includes('quemdisseberenice.com') ||
    lowLong.includes('ouiparis.com') ||
    lowLong.includes('kabum.') ||
    lowLong.includes('clovis.') ||
    lowLong.includes('olympikus.') ||
    lowLong.includes('adidas.') ||
    lowLong.includes('lacoste.') ||
    lowLong.includes('nike.') ||
    lowLong.includes('lego.') ||
    lowLong.includes('lg.com') ||
    lowLong.includes('sharkninja') ||
    lowLong.includes('ninjabrasil') ||
    lowLong.includes('hopeoficial') ||
    lowLong.includes('hopelingerie') ||
    lowLong.includes('underarmour') ||
    lowLong.includes('aliexpress.') ||
    lowLong.includes('cea.com') ||
    lowLong.includes('stanley1913') ||
    lowLong.includes('stanley-pmi') ||
    lowLong.includes('decathlon.') ||
    lowLong.includes('drogariavenancio.') ||
    lowLong.includes('casasbahia.') ||
    lowLong.includes('puma.com') ||
    lowLong.includes('awin1.com') ||
    lowLong.includes('tidd.ly')
  );
}

function cleanCompetitorArtifacts(text) {
  if (!text) return '';
  let cleaned = text.replace(COMPETITOR_URL_PATTERN, '');

  const lines = cleaned.split('\n');
  const filteredLines = [];

  for (const line of lines) {
    let l = line.trim();
    if (!l) continue;
    const lower = l.toLowerCase();

    const isCompetitorCall = (
      lower.includes('entre no grupo') || lower.includes('entre em nosso grupo') ||
      lower.includes('entre no canal') || lower.includes('entre em nosso canal') ||
      lower.includes('participe do grupo') || lower.includes('participe do canal') ||
      lower.includes('participe da comunidade') || lower.includes('entre na comunidade') ||
      lower.includes('nosso grupo') || lower.includes('nosso canal') || lower.includes('nossa comunidade') ||
      lower.includes('link do grupo') || lower.includes('link do canal') || lower.includes('link da comunidade') ||
      lower.includes('grupo vip') || lower.includes('canal vip') || lower.includes('comunidade vip') ||
      lower.includes('grupo no whatsapp') || lower.includes('canal no whatsapp') || lower.includes('canal whatsapp') ||
      lower.includes('grupo whatsapp') || lower.includes('canal do telegram') || lower.includes('grupo do telegram') ||
      lower.includes('receba ofertas') || lower.includes('receba no whatsapp') || lower.includes('mais ofertas no canal') ||
      lower.includes('mais ofertas no grupo') || lower.includes('convide amigos') || lower.includes('familiares para o grupo') ||
      lower.includes('siga no instagram') || lower.includes('siga nosso instagram') || lower.includes('siga nossa página') ||
      lower.includes('pechinchou') || lower.includes('pelando') || lower.includes('promobit') || lower.includes('achadosgrupo')
    );

    if (isCompetitorCall) {
      if (!l.includes('http://') && !l.includes('https://')) {
        continue;
      }
      l = l
        .replace(/(?:entre|acesse|participe|siga)(?:\s+em|\s+no|\s+na|\s+do|\s+da)?\s+(?:nosso|nossa|o|a)?\s*(?:grupo|canal|comunidade|chat|vip)[^|\n]*/gi, '')
        .replace(/(?:grupo|canal|comunidade)\s+(?:vip|exclusivo|secreto|whatsapp|telegram)[^|\n]*/gi, '')
        .trim();
    }

    if (!l.includes('http://') && !l.includes('https://')) {
      if (
        lower.includes('canal') || lower.includes('grupo') || lower.includes('comunidade') ||
        lower.includes('telegram') || lower.includes('whatsapp') || lower.includes('participe') ||
        lower.includes('convite') || lower.includes('entre no') || lower.includes('acesse o') ||
        lower.includes('achados') || lower.includes('receba')
      ) {
        continue;
      }
    }

    l = l.replace(/[|\s\-–:]*(?:grupo|canal|comunidade|vip|whatsapp|telegram)[|\s\-–:]*$/i, '').trim();
    l = l.replace(/[|\-–:]+\s*$/, '').trim();

    if (/^[👉🔗📲💬👥💡⚡💥*_\s]*(?:link|canal|grupo|comunidade|participe|acesse|whatsapp|telegram)?[:\-–\s]*$/i.test(l)) {
      continue;
    }

    if (l) {
      filteredLines.push(l);
    }
  }

  return filteredLines.join('\n');
}

function cleanResidualArtifacts(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => {
      let l = line.trim();
      l = l.replace(/[|\-–:]+\s*$/, '').trim();
      if (/^[👉🔗📲💬👥💡⚡💥*_\s]*(?:link|canal|grupo|comunidade|participe|acesse|whatsapp|telegram)?[:\-–\s]*$/i.test(l)) {
        return '';
      }
      return l;
    })
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

async function replaceAffiliateTags(longUrl, productKeyword) {
  if (!longUrl || isCompetitorUrl(longUrl)) {
    return '';
  }
  try {
    const urlObj = new URL(longUrl);
    
    // 0. Desempacota links de redes intermediárias (Rakuten LinkShare / Linksynergy, Lomadee, Admitad, etc.)
    if (
      urlObj.hostname.includes('linksynergy.com') ||
      urlObj.hostname.includes('lomadee.com') ||
      urlObj.hostname.includes('actionpay.net') ||
      urlObj.hostname.includes('admitad.com') ||
      urlObj.hostname.includes('afilio.com.br') ||
      urlObj.hostname.includes('socialsoul.com.br')
    ) {
      const unpacked = urlObj.searchParams.get('murl') || 
                       urlObj.searchParams.get('url') || 
                       urlObj.searchParams.get('ulp');
      if (unpacked) {
        return replaceAffiliateTags(decodeURIComponent(unpacked), productKeyword);
      }
    }

    // 0.1 AWIN e links da rede AWIN (Garante SEMPRE o publisher ID oficial do usuário: 3077915)
    if (urlObj.hostname.includes('awin1.com')) {
      const awinAffid = AFFILIATE.awin || process.env.AFFILIATE_AWIN || '3077915';
      if (urlObj.searchParams.has('id')) urlObj.searchParams.set('id', awinAffid);
      if (urlObj.searchParams.has('awinaffid')) urlObj.searchParams.set('awinaffid', awinAffid);
      urlObj.searchParams.set('clickref', 'precosmart');
      return urlObj.toString();
    }
    if (urlObj.hostname.includes('tidd.ly')) {
      return longUrl;
    }
    
    // 1. Amazon (Limpeza canônica absoluta: ASIN direto + tag oficial)
    if (urlObj.hostname.includes('amazon.')) {
      const asinMatch = longUrl.match(/(?:dp|gp\/product|\/d)\/([A-Z0-9]{10})/i) || longUrl.match(/\/([A-Z0-9]{10})(?:[/?#]|$)/i);
      if (asinMatch && asinMatch[1]) {
        return 'https://www.amazon.com.br/dp/' + asinMatch[1] + '?tag=' + AFFILIATE.amazon;
      }
      urlObj.searchParams.set('tag', AFFILIATE.amazon);
      urlObj.searchParams.delete('ascsubtag');
      urlObj.searchParams.delete('linkCode');
      urlObj.searchParams.delete('creative');
      urlObj.searchParams.delete('camp');
      urlObj.searchParams.delete('ref');
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
      urlObj.hostname.includes('influenciadormagalu.') || 
      urlObj.hostname.includes('maga.lu')
    ) {
      if (AFFILIATE.magalu) {
        const storeSlug = 'magazine' + AFFILIATE.magalu.toLowerCase().replace('magazine', '');
        if (urlObj.hostname.includes('magazinevoce.') || urlObj.hostname.includes('influenciadormagalu.')) {
          const pathParts = urlObj.pathname.split('/').filter(Boolean);
          if (pathParts.length > 0) {
            pathParts[0] = storeSlug;
            return `https://www.magazinevoce.com.br/${pathParts.join('/')}`;
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

    // 8. Olympikus BR (AWIN - MID 17698 - 8% CPA)
    if (urlObj.hostname.includes('olympikus.com.br')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanOlympikus = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=17698&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanOlympikus)}`;
    }

    // 9. adidas BR (AWIN - MID 79926) - Redireciona com segurança até ser aprovado
    if (urlObj.hostname.includes('adidas.com.br')) {
      if (process.env.ADIDAS_APPROVED === 'true') {
        const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
        const cleanAdidas = `${urlObj.origin}${urlObj.pathname}`;
        return `https://www.awin1.com/cread.php?awinmid=79926&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanAdidas)}`;
      }
      // Ainda não aprovado na Awin: garante comissão pela loja oficial na Amazon
      const query = encodeURIComponent(productKeyword || 'adidas');
      return 'https://www.amazon.com.br/s?k=' + query + '&tag=' + AFFILIATE.amazon;
    }

    // 10. Lacoste BR (AWIN - MID 112756 - Oficial Aprovado)
    if (urlObj.hostname.includes('lacoste.com')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanLacoste = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=112756&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanLacoste)}`;
    }

    // 11. Lego BR (AWIN - MID 30511 - Oficial Aprovado)
    if (urlObj.hostname.includes('lego.com')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanLego = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=30511&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanLego)}`;
    }

    // 12. LG BR (AWIN - MID 33061 - Oficial Aprovado)
    if (urlObj.hostname.includes('lg.com')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanLg = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=33061&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanLg)}`;
    }

    // 13. Shark-Ninja BR (AWIN - MID 106763 - Oficial Aprovado)
    if (urlObj.hostname.includes('sharkninja') || urlObj.hostname.includes('sharkclean') || urlObj.hostname.includes('ninjabrasil')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanNinja = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=106763&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanNinja)}`;
    }

    // 14. Hope Lingerie BR (AWIN - MID 107039 - Oficial Aprovado)
    if (urlObj.hostname.includes('hopeoficial') || urlObj.hostname.includes('hopelingerie') || (urlObj.hostname.includes('hope.com') && !urlObj.hostname.includes('hopelost'))) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanHope = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=107039&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanHope)}`;
    }

    // 15. Nike BR (AWIN - MID 17652 - 7.5% a 14% CPA)
    if (urlObj.hostname.includes('nike.com.br')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanSearch = new URLSearchParams(urlObj.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'clickref'].forEach(k => cleanSearch.delete(k));
      const qs = cleanSearch.toString() ? `?${cleanSearch.toString()}` : '';
      const cleanNike = `${urlObj.origin}${urlObj.pathname}${qs}`;
      return `https://www.awin1.com/cread.php?awinmid=17652&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanNike)}`;
    }

    // 16. Under Armour BR (AWIN - MID 18864 - 6% CPA - Oficial Aprovado)
    if (urlObj.hostname.includes('underarmour.com.br') || urlObj.hostname.includes('underarmour.com')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanUA = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=18864&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanUA)}`;
    }

    // 17. Stanley BR (AWIN - MID 30599 - Oficial Aprovado)
    if (urlObj.hostname.includes('stanley1913.com.br') || urlObj.hostname.includes('stanley-pmi.com.br')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanStanley = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=30599&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanStanley)}`;
    }

    // 18. Decathlon BR (AWIN - MID 19296 - Oficial Aprovado)
    if (urlObj.hostname.includes('decathlon.com.br')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanDecathlon = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=19296&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanDecathlon)}`;
    }

    // 19. Drogaria Venancio BR (AWIN - MID 47165 - Oficial Aprovado)
    if (urlObj.hostname.includes('drogariavenancio.com.br')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanVenancio = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=47165&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanVenancio)}`;
    }

    // 20. AliExpress BR & Global (AWIN - MID 18879 - Oficial Aprovado)
    if (urlObj.hostname.includes('aliexpress.com')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanAli = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=18879&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanAli)}`;
    }

    // 21. C&A BR (AWIN - MID 17648 - Oficial Aprovado)
    if (urlObj.hostname.includes('cea.com.br')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanCea = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=17648&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanCea)}`;
    }

    // 22. PUMA BR (AWIN - MID 32675 - Oficial Aprovado)
    if (urlObj.hostname.includes('puma.com')) {
      const awinAffid = process.env.AFFILIATE_AWIN || '3077915';
      const cleanPuma = `${urlObj.origin}${urlObj.pathname}`;
      return `https://www.awin1.com/cread.php?awinmid=32675&awinaffid=${awinAffid}&clickref=BOT&ued=${encodeURIComponent(cleanPuma)}`;
    }

    // 12. Domínios externos e intermediários:
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

  // 1. Limpa URLs e menções explícitas a canais e grupos de terceiros
  let sanitized = cleanCompetitorArtifacts(text);
  if (!sanitized) return null;

  // 2. Extrai URLs restantes
  const urls = sanitized.match(urlRegex) || [];
  if (urls.length === 0) {
    return null; // Não é oferta (sem links de compra válidos)
  }

  const productKeyword = extractProductKeyword(sanitized);
  let hasValidStoreUrl = false;
  let finalCleanText = sanitized;

  for (const url of urls) {
    // Se a URL original já for de concorrente/grupo
    if (isCompetitorUrl(url)) {
      finalCleanText = finalCleanText.replace(url, '');
      continue;
    }

    let longUrl = url;
    const isDirectFinal = url.includes('amazon.com.br/dp/') || 
                          url.includes('produto.mercadolivre.com.br/MLB') || 
                          url.includes('mercadolivre.com.br/p/MLB') ||
                          url.includes('shopee.com.br/product/');

    if (!isDirectFinal) {
      longUrl = await expandUrl(url);
    }

    // Se a URL expandida revelou ser link de grupo/canal concorrente
    if (isCompetitorUrl(longUrl)) {
      finalCleanText = finalCleanText.replace(url, '');
      continue;
    }

    const lowLong = longUrl.toLowerCase();
    const isStore = isSupportedStore(lowLong);

    if (isStore) {
      hasValidStoreUrl = true;
      const afUrl = await replaceAffiliateTags(longUrl, productKeyword);
      finalCleanText = finalCleanText.replace(url, afUrl);
    } else {
      // URL não pertence a nenhuma loja parceira
      if (isExternalNonStore(lowLong)) {
        finalCleanText = finalCleanText.replace(url, '');
      } else {
        // Se for outra loja não cadastrada e ainda não tivermos loja válida
        const afUrl = await replaceAffiliateTags(longUrl, productKeyword);
        if (afUrl) {
          finalCleanText = finalCleanText.replace(url, afUrl);
          hasValidStoreUrl = true;
        } else {
          finalCleanText = finalCleanText.replace(url, '');
        }
      }
    }
  }

  // Se não contém nenhuma loja real válida após processar todos os links, descarta
  if (!hasValidStoreUrl) {
    return null;
  }

  // Limpeza final de pontuação residual e linhas em branco
  finalCleanText = cleanResidualArtifacts(finalCleanText);
  if (!finalCleanText || !finalCleanText.includes('http')) {
    return null;
  }

  const badge = detectUrgencyBadge(finalCleanText);
  const isMagalu = finalCleanText.includes('magazinevoce.com.br') || finalCleanText.includes('magazineluiza.com.br');
  const isBoticario = finalCleanText.includes('boticario.com') || finalCleanText.includes('eudora.com') || finalCleanText.includes('quemdisseberenice.com') || finalCleanText.includes('ouiparis.com');
  const detectedPrice = extractPriceFromText(finalCleanText);
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

  return badge + finalCleanText.trim() + dealBadge + footer;
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

/**
 * Converte URLs de imagens de produtos para versões em Alta Resolução (Full HD).
 * Elimina miniaturas (_m.jpg, /medium/, -I.jpg, _tn) e rejeita banners minúsculos (320x50, 300x50).
 */
function upgradeToHdImage(url) {
  if (!url || typeof url !== 'string') return null;

  // 1. Rejeita banners de anúncios horizontais minúsculos e logos genéricos
  if (/(320x50|300x50|320x100|468x60|728x90|120x600)/i.test(url)) {
    return null;
  }
  if (/(favicon|apple-touch-icon|logo[-_]?placeholder|brand-logo|site-logo)/i.test(url)) {
    return null;
  }

  let hd = url.trim();

  // 2. KaBuM: eleva de /medium/ para /large/ e de _m.jpg para _gg.jpg (Full HD)
  if (hd.includes('kabum.com.br')) {
    hd = hd.replace(/\/medium\//g, '/large/');
    hd = hd.replace(/_m\.(jpe?g|png|webp)/i, '_gg.$1');
    hd = hd.replace(/_p\.(jpe?g|png|webp)/i, '_gg.$1');
  }

  // 3. Mercado Livre: eleva de thumbnail (-I.jpg) para original (-O.jpg)
  if (hd.includes('mlstatic.com') || hd.includes('mercadolivre.com')) {
    hd = hd.replace(/-[IV]\.(jpe?g|png|webp)/i, '-O.$1');
  }

  // 4. Shopee: remove sufixo de miniatura _tn
  if (hd.includes('shopee.com') || hd.includes('susercontent.com')) {
    hd = hd.replace(/_tn\b/i, '');
  }

  // 5. Magazine Luiza: eleva miniaturas para 800x800
  if (hd.includes('magazineluiza.com.br') || hd.includes('magalu.com')) {
    hd = hd.replace(/\/\d+x\d+\//g, '/800x800/');
  }

  return hd;
}

const MAX_OG_CACHE_SIZE = 500;
const ogImageCache = new Map();

function setOgCache(key, val) {
  if (ogImageCache.size >= MAX_OG_CACHE_SIZE) {
    const oldestKey = ogImageCache.keys().next().value;
    ogImageCache.delete(oldestKey);
  }
  ogImageCache.set(key, val);
}

function fetchOgImage(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return Promise.resolve(null);

  // Desempacota links de afiliados AWIN diretamente para a URL do lojista
  let cleanUrl = urlStr.trim();
  if (cleanUrl.includes('ued=')) {
    const m = cleanUrl.match(/[?&]ued=([^&]+)/);
    if (m) {
      try { cleanUrl = decodeURIComponent(m[1]); } catch (e) {}
    }
  } else if (cleanUrl.includes('awin1.com') && cleanUrl.includes('url=')) {
    const m = cleanUrl.match(/[?&]url=([^&]+)/);
    if (m) {
      try { cleanUrl = decodeURIComponent(m[1]); } catch (e) {}
    }
  }

  if (ogImageCache.has(cleanUrl)) return Promise.resolve(ogImageCache.get(cleanUrl));

  const https = require('https');
  const http = require('http');

  return new Promise((resolve) => {
    let currentUrl = cleanUrl;
    let redirects = 0;
    let isSettled = false;

    // Timeout absoluto para evitar qualquer pendência
    const globalTimer = setTimeout(() => {
      finish(null);
    }, 10000);

    function finish(result) {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(globalTimer);
      const finalResult = upgradeToHdImage(result);
      if (finalResult) {
        setOgCache(cleanUrl, finalResult);
        setOgCache(urlStr, finalResult);
      }
      resolve(finalResult || null);
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

      if (!isSafePublicUrl(u.href)) {
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
        timeout: 8000
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
          
          // Otimização: só executa regexes se encontrar tags de imagem/meta no chunk
          if (html.includes('og:image') || html.includes('twitter:image') || html.includes('image_src') || html.includes('"image"')) {
            const m = html.match(/<meta[^>]*?property=["']og:image(?::secure_url)?["'][^>]*?content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*?content=["']([^"']+)["'][^>]*?property=["']og:image(?::secure_url)?["']/i) ||
                      html.match(/<meta[^>]*?name=["']twitter:image["'][^>]*?content=["']([^"']+)["']/i) ||
                      html.match(/<link[^>]*?rel=["']image_src["'][^>]*?href=["']([^"']+)["']/i) ||
                      html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                      html.match(/"image"\s*:\s*["'](https?:\/\/[^"']+)["']/i) ||
                      html.match(/"image"\s*:\s*\[\s*["'](https?:\/\/[^"']+)["']/i);
            if (m && m[1]) {
              req.destroy();
              return finish(m[1]);
            }
          }

          // Checa se há meta refresh
          const refreshMatch = html.match(/<meta[^>]*?http-equiv=["']refresh["'][^>]*?content=["']\d+;\s*url=([^"'>]+)["']/i);
          if (refreshMatch && refreshMatch[1]) {
            redirects++;
            req.destroy();
            return doReq(refreshMatch[1]);
          }

          if (html.length > 350000) {
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

module.exports = {
  processMessageText,
  extractProductKeyword,
  extractCanonicalId,
  fetchOgImage,
  upgradeToHdImage,
  isSafePublicUrl,
  replaceAffiliateTags,
  expandUrl,
  isCompetitorUrl,
  cleanCompetitorArtifacts,
  cleanResidualArtifacts,
  isSupportedStore
};
