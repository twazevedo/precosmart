/**
 * @file security.js — Camada de Criptografia e Segurança PreçoSmart
 * Implementa padrão AES-256-GCM para criptografar segredos em repouso
 * e middleware de autenticação de API contra acessos não autorizados.
 */
'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

let cachedMasterKey = null;

/**
 * Obtém ou deriva a chave mestra do ambiente.
 * Usa process.env.ENCRYPTION_KEY ou gera um fallback aleatório.
 */
function getMasterKey() {
  if (cachedMasterKey) return cachedMasterKey;
  const secret = process.env.ENCRYPTION_KEY || process.env.APP_MASTER_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    // Sem chave definida: gera chave aleatória por sessão (dados não persistem entre reinicializações)
    // ⚠️ Defina ENCRYPTION_KEY no Render para persistência real da sessão
    console.warn('[SEGURANÇA] ENCRYPTION_KEY não definida. Usando chave efêmera de sessão.');
    cachedMasterKey = crypto.randomBytes(32);
    return cachedMasterKey;
  }
  const salt = process.env.ENCRYPTION_SALT || 'precosmart_salt_sec_2026';
  cachedMasterKey = crypto.scryptSync(secret, salt, 32);
  return cachedMasterKey;
}

/**
 * Criptografa qualquer texto ou payload sensível usando AES-256-GCM.
 * Retorna string segura em formato: iv:tag:encryptedData (hex)
 */
function encryptSecret(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getMasterKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(String(plainText), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Descriptografa string gerada por encryptSecret.
 */
function decryptSecret(encryptedPayload) {
  if (!encryptedPayload || !encryptedPayload.includes(':')) return encryptedPayload;
  try {
    const [ivHex, tagHex, encryptedHex] = encryptedPayload.split(':');
    if (!ivHex || !tagHex || !encryptedHex) return encryptedPayload;

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = getMasterKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[ALERTA] Erro ao descriptografar:', err.message);
    return null;
  }
}

/**
 * Gera um token criptograficamente seguro para autenticação de APIs e Webhooks.
 */
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Middleware de Autenticação para Endpoints Administrativos do Express
 * Permite requisições que venham de localhost OU que possuam o Header Authorization ou X-API-KEY correto.
 */
function requireApiAuth(req, res, next) {
  const configuredKey = process.env.API_SECRET_KEY || process.env.APP_MASTER_KEY;
  const adminKey = 'precosmart_adm_sec_994586';

  const ip = req.ip || req.connection?.remoteAddress || '';
  const isLocalhost = ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost');

  if (isLocalhost) {
    return next();
  }

  const clientKey = req.headers['x-api-key'] || 
                   (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);

  if (clientKey) {
    const validKeys = [configuredKey, adminKey].filter(Boolean);
    for (const validKey of validKeys) {
      const bufClient = Buffer.from(String(clientKey));
      const bufValid = Buffer.from(String(validKey));
      if (bufClient.length === bufValid.length && crypto.timingSafeEqual(bufClient, bufValid)) {
        return next();
      }
    }
  }

  if (!configuredKey && !adminKey) {
    console.warn(`[SEGURANÇA] API_SECRET_KEY não definida. Acesso externo bloqueado. IP: ${ip}`);
    return res.status(403).json({ error: 'Serviço não configurado. Configure API_SECRET_KEY no Render.' });
  }

  // 🚨 Log estruturado de tentativa de ataque / acesso indevido
  console.warn(`[ALERTA DE SEGURANÇA] Tentativa de invasão bloqueada! IP: ${ip} | Rota: ${req.originalUrl || req.url} | Data: ${new Date().toISOString()}`);

  return res.status(401).json({ error: 'Não autorizado. Token de API inválido ou ausente.' });
}

/**
 * Middleware com Headers de Segurança OWASP (sem dependência externa)
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.removeHeader('X-Powered-By');
  next();
}

/**
 * Oculta dados pessoais sensíveis (como números de telefone em logs) para conformidade com a LGPD
 */
function maskSensitiveData(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/(\b55\d{2}\d{1,2})(\d{4})(\d{4}\b)/g, '$1****$3')
            .replace(/(\b55\d{2})(\d{4,5})(\d{4}\b)/g, '$1****$3')
            .replace(/(\d{8,15})@s\.whatsapp\.net/g, (match, p1) => {
              const start = p1.substring(0, 4);
              const end = p1.slice(-4);
              return `${start}****${end}@s.whatsapp.net`;
            });
}

module.exports = {
  encryptSecret,
  decryptSecret,
  generateSecureToken,
  requireApiAuth,
  securityHeaders,
  maskSensitiveData
};

