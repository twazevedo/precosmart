/**
 * @file security.js — Camada de Criptografia e Segurança PreçoSmart
 * Implementa padrão AES-256-GCM para criptografar segredos em repouso
 * e middleware de autenticação de API contra acessos não autorizados.
 */
'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Padrão NIST SP 800-38D (96 bits) para máxima performance e segurança AES-GCM
const TAG_LENGTH = 16;

let cachedMasterKey = null;

/**
 * Obtém ou deriva a chave mestra do ambiente.
 * Usa process.env.ENCRYPTION_KEY ou gera um fallback seguro.
 */
function getMasterKey() {
  if (cachedMasterKey) return cachedMasterKey;
  const secret = process.env.ENCRYPTION_KEY || process.env.APP_MASTER_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[SEGURANÇA CRÍTICA] ENCRYPTION_KEY não definida em produção! Configure no painel do Render.');
    } else {
      console.warn('[SEGURANÇA] ENCRYPTION_KEY não definida. Usando chave efêmera de sessão local.');
    }
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
 * Exige cabeçalho X-API-KEY ou Authorization: Bearer <token>.
 * Não aceita credenciais via query string (OWASP ASVS compliant).
 */
function requireApiAuth(req, res, next) {
  const configuredKey = process.env.API_SECRET_KEY || process.env.APP_MASTER_KEY;

  const ip = req.ip || req.connection?.remoteAddress || '';
  const isLocalDev = (process.env.NODE_ENV !== 'production') && (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost'));

  if (isLocalDev) {
    return next();
  }

  if (!configuredKey) {
    console.warn(`[SEGURANÇA] API_SECRET_KEY não configurada. Acesso administrativo bloqueado. IP: ${ip}`);
    return res.status(503).json({ error: 'Serviço administrativo não configurado. Defina API_SECRET_KEY no ambiente.' });
  }

  // Apenas cabeçalhos HTTP autorizados (previne vazamento de tokens em URLs/logs)
  const clientKey = req.headers['x-api-key'] || 
                   (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '').trim() : null);

  if (clientKey) {
    const bufClient = Buffer.from(String(clientKey));
    const bufValid = Buffer.from(String(configuredKey));
    if (bufClient.length === bufValid.length && crypto.timingSafeEqual(bufClient, bufValid)) {
      return next();
    }
  }

  console.warn(`[ALERTA DE SEGURANÇA] Tentativa de acesso não autorizado bloqueada! IP: ${ip} | Rota: ${req.originalUrl || req.url}`);
  return res.status(401).json({ error: 'Não autorizado. Forneça um cabeçalho X-API-Key válido.' });
}

/**
 * Middleware com Headers de Segurança OWASP Modernos
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
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

