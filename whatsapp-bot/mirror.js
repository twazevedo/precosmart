const axios = require('axios');
const { AFFILIATE } = require('./catalog');

// Regex to find URLs
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
    
    // Amazon
    if (urlObj.hostname.includes('amazon.')) {
      urlObj.searchParams.set('tag', AFFILIATE.amazon);
      return urlObj.toString();
    }
    
    // Mercado Livre
    if (urlObj.hostname.includes('mercadolivre.com')) {
      urlObj.searchParams.set('matt_tool', AFFILIATE.ml);
      urlObj.searchParams.set('matt_word', 'bot_espelho');
      return urlObj.toString();
    }
    
    // Shopee
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
  
  const urls = text.match(urlRegex) || [];
  let newText = text;
  
  for (const url of urls) {
    let longUrl = url;
    
    // Expand if shortener
    if (url.includes('amzn.to') || url.includes('shope.ee') || url.includes('meli.la') || url.includes('bit.ly')) {
      longUrl = await expandUrl(url);
    }
    
    // If it expanded to another shortener (sometimes they chain), expand again
    if (longUrl.includes('amzn.to') || longUrl.includes('shope.ee') || longUrl.includes('meli.la') || longUrl.includes('bit.ly')) {
      longUrl = await expandUrl(longUrl);
    }

    const afUrl = replaceAffiliateTags(longUrl);
    
    // Replace the original url in text with the new affiliate long URL
    newText = newText.replace(url, afUrl);
  }
  
  return newText;
}

module.exports = { processMessageText };
