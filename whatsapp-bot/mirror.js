const axios = require('axios');
const { AFFILIATE } = require('./catalog');

const urlRegex = /(https?:\/\/[^\s]+)/g;

async function expandUrl(url) {
  try {
    const response = await axios.get(url, { maxRedirects: 0, validateStatus: null });
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      return response.headers.location;
    }
    return url;
  } catch (e) {
    return url;
  }
}

function replaceAffiliateTags(longUrl) {
  try {
    const urlObj = new URL(longUrl);
    if (urlObj.hostname.includes('amazon.')) {
      urlObj.searchParams.set('tag', AFFILIATE.amazon);
      return urlObj.toString();
    }
    if (urlObj.hostname.includes('mercadolivre.com')) {
      urlObj.searchParams.set('matt_tool', AFFILIATE.ml);
      urlObj.searchParams.set('matt_word', 'bot_espelho');
      return urlObj.toString();
    }
    if (urlObj.hostname.includes('shopee.com')) {
      urlObj.searchParams.set('aff_id', AFFILIATE.shopee);
      return urlObj.toString();
    }
    return longUrl;
  } catch (e) {
    return longUrl;
  }
}

async function processMessageText(text) {
  if (!text) return text;
  
  // 1. Remove qualquer link de convite de WhatsApp, Telegram, etc do concorrente
  let newText = text.replace(/https?:\/\/(chat\.whatsapp\.com|t\.me|wa\.me)\/[^\s]+/g, '');
  
  // 2. Procura os links de produtos restantes
  const urls = newText.match(urlRegex) || [];
  
  for (const url of urls) {
    let longUrl = url;
    
    if (url.includes('amzn.to') || url.includes('shope.ee') || url.includes('meli.la') || url.includes('bit.ly') || url.includes('cutt.ly')) {
      longUrl = await expandUrl(url);
    }
    
    if (longUrl.includes('amzn.to') || longUrl.includes('shope.ee') || longUrl.includes('meli.la') || longUrl.includes('bit.ly')) {
      longUrl = await expandUrl(longUrl);
    }

    const afUrl = replaceAffiliateTags(longUrl);
    newText = newText.replace(url, afUrl);
  }
  
  // Adiciona a assinatura do usurio no final do texto para reforar
  newText = newText.trim() + '\n\n🔥 *Oferta Exclusiva PreçoSmart* 🔥';
  
  return newText;
}

module.exports = { processMessageText };
