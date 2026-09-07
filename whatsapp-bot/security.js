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

/**
 * Obtém ou deriva a chave mestra do ambiente.
 * Usa process.env.APP_MASTER_KEY ou uma chave derivada localmente.
 */
function getMasterKey() {
  const secret = process.env.APP_MASTER_KEY || process.env.OWNER_NUMBER || 'precosmart-secure-vault-key-2026';
  return crypto.scryptSync(secret, 'precosmart_salt_fixed', 32);
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
    return encryptedPayload;
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
  const configuredKey = process.env.API_SECRET_KEY;

  const ip = req.ip || req.connection?.remoteAddress || '';
  const isLocalhost = ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost');

  if (!configuredKey) {
    if (isLocalhost) return next();
    return res.status(403).json({ error: 'Acesso externo bloqueado. Configure API_SECRET_KEY no .env.' });
  }

  const clientKey = req.headers['x-api-key'] || 
                   (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);

  if (clientKey && clientKey === configuredKey) {
    return next();
  }

  if (isLocalhost) {
    return next();
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

module.exports = {
  encryptSecret,
  decryptSecret,
  generateSecureToken,
  requireApiAuth,
  securityHeaders
};
