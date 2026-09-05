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

module.exports = { extractOfferFromImage };
