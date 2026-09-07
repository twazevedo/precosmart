/**
 * @file security.test.js — Bateria de Testes de Segurança e Resistência (Defensive Audit)
 * Executável nativamente via `node --test`
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  encryptSecret,
  decryptSecret,
  generateSecureToken,
  requireApiAuth,
  securityHeaders
} = require('../security');

test('1. Teste Criptográfico AES-256-GCM: Criptografia e Decriptografia Hermética', () => {
  const secretOriginal = 'SuperChaveDeAcessoUltraSecreta_2026!@#';
  const cifrado = encryptSecret(secretOriginal);

  assert.notEqual(cifrado, secretOriginal, 'O texto criptografado não pode ser igual ao original');
  assert.ok(cifrado.includes(':'), 'Payload cifrado deve conter IV e AuthTag delimitados');

  const decifrado = decryptSecret(cifrado);
  assert.equal(decifrado, secretOriginal, 'A decriptografia deve recuperar perfeitamente o segredo');
});

test('2. Anti-Tampering (Integridade de Dados): Tentativa de adulteração de ciphertext deve falhar sem vazar dados', () => {
  const secretOriginal = 'CredenciaisDeBancoOuTokens';
  const cifrado = encryptSecret(secretOriginal);
  const parts = cifrado.split(':');

  // Simula um invasor alterando um único byte no meio dos dados cifrados
  const corruptedCipher = parts[2].slice(0, -2) + (parts[2].slice(-2) === 'aa' ? 'bb' : 'aa');
  const tamperedPayload = `${parts[0]}:${parts[1]}:${corruptedCipher}`;

  const resultado = decryptSecret(tamperedPayload);
  // O modo GCM verifica a AuthTag; em caso de adulteração, não deve descriptografar
  assert.notEqual(resultado, secretOriginal, 'Payload adulterado jamais pode retornar o segredo original');
});

test('3. Geração de Token Criptográfico de Alta Entropia', () => {
  const token1 = generateSecureToken(32);
  const token2 = generateSecureToken(32);

  assert.equal(token1.length, 64, 'Token de 32 bytes em hex deve ter 64 caracteres');
  assert.notEqual(token1, token2, 'Tokens gerados devem ser únicos e criptograficamente imprevisíveis');
});

test('4. Portão de Autenticação de API: Rejeição de invasão sem Token Válido (401)', () => {
  process.env.API_SECRET_KEY = 'chave_secreta_de_teste_123';

  // Simula requisição vinda de IP externo sem header de autorização
  const reqInvasor = {
    ip: '203.0.113.195', // IP externo de internet
    headers: {}
  };

  let statusEnviado = null;
  let jsonEnviado = null;
  const res = {
    status(code) {
      statusEnviado = code;
      return this;
    },
    json(data) {
      jsonEnviado = data;
    }
  };

  let chamouNext = false;
  requireApiAuth(reqInvasor, res, () => { chamouNext = true; });

  assert.equal(chamouNext, false, 'Requisição não autorizada NÃO pode passar para o próximo middleware');
  assert.equal(statusEnviado, 401, 'Deve retornar HTTP 401 Unauthorized para acessos externos sem token');
  assert.ok(jsonEnviado?.error, 'Deve retornar mensagem de erro explícita');
});

test('5. Portão de Autenticação de API: Aprovação de requisição com Token Válido (Bearer / X-API-KEY)', () => {
  process.env.API_SECRET_KEY = 'chave_secreta_de_teste_123';

  const reqAutorizada = {
    ip: '203.0.113.195',
    headers: {
      'x-api-key': 'chave_secreta_de_teste_123'
    }
  };

  let chamouNext = false;
  requireApiAuth(reqAutorizada, {}, () => { chamouNext = true; });

  assert.equal(chamouNext, true, 'Requisição com x-api-key válida deve ser liberada');
});

test('6. Auditoria de Headers de Proteção HTTP (OWASP)', () => {
  const req = {};
  const headersDefinidos = {};
  let headerRemovido = null;

  const res = {
    setHeader(name, value) {
      headersDefinidos[name.toLowerCase()] = value;
    },
    removeHeader(name) {
      headerRemovido = name;
    }
  };

  let chamouNext = false;
  securityHeaders(req, res, () => { chamouNext = true; });

  assert.equal(headersDefinidos['x-content-type-options'], 'nosniff', 'Anti MIME-sniffing obrigatório');
  assert.equal(headersDefinidos['x-frame-options'], 'DENY', 'Anti Clickjacking obrigatório');
  assert.equal(headersDefinidos['x-xss-protection'], '1; mode=block', 'Filtro Anti-XSS obrigatório');
  assert.equal(headerRemovido, 'X-Powered-By', 'Express fingerprinting deve ser removido');
  assert.equal(chamouNext, true, 'Middleware de headers deve prosseguir');
});
