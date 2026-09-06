/**
 * @file geminiVision.js — Integração com Google Gemini Vision
 * Permite que o bot leia prints de ofertas ou fotos de produtos
 * e extraia automaticamente o nome do produto, preços e detalhes.
 */
'use strict';

const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/**
 * Extrai informações de uma imagem de oferta usando o Gemini
 * @param {Buffer} imageBuffer - Buffer da imagem recebida do WhatsApp
 * @param {string} [mimeType='image/jpeg']
 * @returns {Promise<{ title: string, oldPrice: string, newPrice: string, summary: string }|null>}
 */
async function extractOfferFromImage(imageBuffer, mimeType = 'image/jpeg') {
  if (!GEMINI_API_KEY) {
    return null;
  }

  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    return null;
  }

  try {
    const base64Data = imageBuffer.toString('base64');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `Você é um assistente especialista em e-commerce e ofertas.
Analise esta imagem (que pode ser um print de loja, anúncio ou foto de produto) e extraia:
1. O nome exato do produto (title)
2. O preço anterior/de (oldPrice), se houver
3. O preço promocional/por (newPrice), se houver
4. Um breve resumo persuasivo de 1 linha sobre a oferta (summary)

Responda ESTRITAMENTE em formato JSON com o seguinte formato:
{
  "title": "Nome do Produto",
  "oldPrice": "R$ 99,90",
  "newPrice": "R$ 69,90",
  "summary": "Desconto imperdível com frete rápido"
}
Se não for uma oferta ou não encontrar produtos, retorne {"title": "", "oldPrice": "", "newPrice": "", "summary": ""}.`;

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: 'application/json'
      }
    };

    const res = await axios.post(endpoint, payload, { timeout: 12000 });
    const textOutput = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textOutput) return null;

    const parsed = JSON.parse(textOutput);
    if (!parsed.title) return null;

    return parsed;
  } catch (err) {
    console.error('[GEMINI_VISION] Erro ao analisar imagem:', err.response?.data?.error?.message || err.message);
    return null;
  }
}

/**
 * Usa a IA para reescrever um texto de oferta bruto, tornando-o persuasivo (Copywriting)
 * @param {string} rawText - Texto original da oferta encontrado no crawler
 * @returns {Promise<string|null>}
 */
async function generateSalesCopy(rawText) {
  if (!GEMINI_API_KEY || !rawText) return null;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const prompt = `Você é um copywriter de e-commerce brasileiro especialista em ofertas, gatilhos mentais (urgência e prova social) e aumento de cliques (CTR).
Reescreva a seguinte oferta em um formato altamente engajador para WhatsApp e Telegram.

Regras INEGOCIÁVEIS:
1. Mantenha os preços e nomes exatos. NUNCA altere os valores numéricos.
2. Adicione emojis de forma estratégica, mas não exagere (máximo 4 ou 5).
3. Comece com uma chamada forte (ex: 🔥 MEGA PROMO, ⚡ BUG, 🎯 ACHADO).
4. Substitua ou deixe os links originais intactos. Não mude a URL, se ela existir.
5. Deixe a mensagem curta (no máximo 5 ou 6 linhas). Ninguém lê textos longos.
6. Aja com naturalidade, parecendo um administrador do grupo vip, não um robô chato.
7. Retorne APENAS o novo texto formatado. Nenhuma frase extra como "Aqui está o texto" ou aspas.

Oferta original a ser reescrita:
"${rawText}"`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7
      }
    };

    const res = await axios.post(endpoint, payload, { timeout: 10000 });
    const textOutput = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (textOutput) return textOutput.trim();
    return null;
  } catch (err) {
    console.error('[GEMINI_COPY] Erro ao reescrever oferta:', err.response?.data?.error?.message || err.message);
    return null;
  }
}

module.exports = { extractOfferFromImage, generateSalesCopy };
