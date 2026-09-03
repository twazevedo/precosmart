const axios = require('axios');
const { AFFILIATE } = require('./catalog');

const urlRegex = /(https?:\/\/[^\s]+)/g;

function extractProductKeyword(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  
  // Preferência 1: Linha que contenha palavras comuns de produto ou marca
  const productWords = [
    'tênis', 'tenis', 'nike', 'adidas', 'puma', 'iphone', 'samsung', 'xiaomi', 'smartphone', 'celular',
    'console', 'playstation', 'ps5', 'xbox', 'nintendo', 'monitor', 'notebook', 'pc',
    'computador', 'fone', 'headset', 'caixa', 'soundbar', 'tv', 'smart tv',
    'aspirador', 'airfryer', 'fritadeira', 'alexa', 'echo', 'relogio',
    'smartwatch', 'whey', 'creatina', 'placa', 'ssd', 'mouse', 'teclado',
    'cadeira', 'camisa', 'mochila', 'sandalia', 'chinelo', 'perfume', 'philco',
    'mondial', 'lg', 'apple', 'motorola', 'positivo', 'jbl', 'lenovo', 'dell'
  ];
  
  for (const line of lines) {
    const l = line.toLowerCase();
    if (l.startsWith('http') || l.includes('http://') || l.includes('https://') || l.includes('.com')) continue;
    if (productWords.some((pw) => l.includes(pw))) {
      const clean = line.replace(/^[^\w\s]+/, '').replace(/[🔥⚡📦🏷️🛒💙📱👀🚨😱👉🔗]/g, '').trim();
      if (clean.length > 4 && !l.includes('de:') && !l.includes('por:') && !l.includes('cupom')) {
        return clean.substring(0, 50);
      }
    }
  }

  // Preferência 2: Primeira linha com substância que não seja anúncio genérico
  for (const line of lines) {
    const clean = line.replace(/^[^\w\s]+/, '').replace(/[🔥⚡📦🏷️🛒💙📱👀🚨😱👉🔗]/g, '').trim();
    const l = clean.toLowerCase();
    if (l.startsWith('http') || l.includes('http://') || l.includes('https://') || l.includes('.com')) continue;
    if (clean.length > 5 && 
        !l.includes('compre') && 
        !l.includes('acesse') && 
        !l.includes('cupom') && 
        !l.includes('de:') && 
        !l.includes('por:') &&
        !l.includes('preção') &&
        !l.includes('lançamento') &&
        !l.includes('mídia') &&
        !l.includes('midia')) {
      return clean.substring(0, 50);
    }
  }
  return 'oferta';
}

async function expandUrl(url) {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 8,
      timeout: 5000,
      validateStatus: () => true
    });
    if (res.request && res.request.res && res.request.res.responseUrl) {
      return res.request.res.responseUrl;
    }
  } catch (e) {}
  return url;
}

function replaceAffiliateTags(longUrl, productKeyword) {
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
    
    // 2. Shopee
    if (urlObj.hostname.includes('shopee.')) {
      // Remove rastreamento do concorrente
      urlObj.searchParams.delete('uls_trackid');
      urlObj.searchParams.delete('utm_campaign');
      urlObj.searchParams.delete('utm_content');
      urlObj.searchParams.delete('utm_term');
      
      // Injeta afiliação do usuário
      urlObj.searchParams.set('mmp_pid', 'an_' + AFFILIATE.shopee);
      urlObj.searchParams.set('utm_source', 'an_' + AFFILIATE.shopee);
      urlObj.searchParams.set('utm_medium', 'affiliates');
      urlObj.searchParams.set('aff_id', AFFILIATE.shopee);
      return urlObj.toString();
    }
    
    // 3. Mercado Livre
    if (urlObj.hostname.includes('mercadolivre.')) {
      // Se for perfil social de influenciador (/social/nome_do_concorrente)
      if (urlObj.pathname.includes('/social/')) {
        const query = encodeURIComponent(productKeyword);
        return 'https://lista.mercadolivre.com.br/' + query + '?matt_tool=' + AFFILIATE.ml + '&matt_word=precosmart';
      }
      // Produto direto do Mercado Livre
      urlObj.searchParams.delete('ref');
      urlObj.searchParams.delete('tracking_id');
      urlObj.searchParams.set('matt_tool', AFFILIATE.ml);
      urlObj.searchParams.set('matt_word', 'precosmart');
      return urlObj.toString();
    }
    
    // 4. Domínios de redirecionamento ou concorrentes que não foram expandidos
    if (urlObj.hostname.includes('garimpeiros.') || 
        urlObj.hostname.includes('achadosgrupo.') || 
        urlObj.hostname.includes('promocoes.')) {
      const query = encodeURIComponent(productKeyword);
      return 'https://www.amazon.com.br/s?k=' + query + '&tag=' + AFFILIATE.amazon;
    }
    
    return longUrl;
  } catch (e) {
    return longUrl;
  }
}

async function processMessageText(text) {
  if (!text) return text;

  // 1. Remove qualquer linha de propaganda ou convite de grupo concorrente
  const lines = text.split('\n');
  const cleanLines = lines.filter((line) => {
    const l = line.toLowerCase();
    if (l.includes('convide amigos') || l.includes('familiares para o grupo')) return false;
    if (l.includes('entre no grupo') || l.includes('nosso grupo') || l.includes('link do grupo')) return false;
    if (l.includes('entre no canal') || l.includes('nosso canal') || l.includes('link do canal')) return false;
    if (l.includes('chat.whatsapp.com') || l.includes('wa.me') || l.includes('t.me') || l.includes('telegram.me')) return false;
    if (l.includes('grupos.garimpeiros') || l.includes('achadosgrupo')) return false;
    if (l.includes('linktr.ee') || l.includes('beacons.ai') || l.includes('heylink.me')) return false;
    return true;
  });
  
  let newText = cleanLines.join('\n');
  const productKeyword = extractProductKeyword(newText);
  const urls = newText.match(urlRegex) || [];

  for (const url of urls) {
    let longUrl = url;
    
    // Se for link encurtado ou domínio de redirecionamento, segue o redirecionamento
    if (url.includes('amzn.to') || url.includes('shopee.') || url.includes('shope.ee') || 
        url.includes('meli.la') || url.includes('bit.ly') || url.includes('cutt.ly') || 
        url.includes('garimpeiros.') || url.includes('tinyurl.') || url.includes('tidd.ly') || 
        url.includes('compre.vc') || url.includes('maga.lu')) {
      longUrl = await expandUrl(url);
    }
    
    const afUrl = replaceAffiliateTags(longUrl, productKeyword);
    newText = newText.replace(url, afUrl);
  }

  newText = newText.trim() + '\n\n🔥 *Oferta Exclusiva PreçoSmart* 🔥';
  return newText;
}

module.exports = { processMessageText };
