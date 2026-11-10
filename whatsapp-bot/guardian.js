#!/usr/bin/env node
/**
 * @file guardian.js — Agente Guardião do PreçoSmart
 * @description Supervisor independente (sem dependências) que mantém o bot SEMPRE no ar:
 *
 *  1. Sobe o `bot.js` e o religa sozinho (com backoff) se o processo morrer.
 *  2. Consulta /api/health a cada 30s e reinicia o bot "zumbi" (processo vivo, mas parado):
 *       - servidor HTTP sem resposta;
 *       - WhatsApp desconectado por tempo demais;
 *       - conectado, porém sem enviar nenhuma oferta por tempo demais;
 *       - consumo de memória acima do limite.
 *  3. Protege o `session/creds.json` (backup periódico + restauração se corromper).
 *  4. No Windows, impede o PC de suspender enquanto o guardião estiver rodando.
 *  5. Garante instância única (porta de controle local) e grava logs com rotação em ./logs.
 *
 * Uso:
 *   node guardian.js          → inicia o guardião (que inicia o bot)
 *   node guardian.js status   → mostra o estado atual do guardião
 *   node guardian.js stop     → encerra o guardião e o bot
 *
 * Variáveis opcionais (.env): GUARDIAN_PORT (10100), GUARDIAN_STALE_MIN, GUARDIAN_DISCONNECTED_MIN,
 * GUARDIAN_BOOT_GRACE_SEC, GUARDIAN_MAX_RSS_MB.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
const LOG_DIR = path.join(ROOT, 'logs');
const STATUS_FILE = path.join(LOG_DIR, 'guardian-status.json');
const CREDS = path.join(ROOT, 'session', 'creds.json');
const CREDS_BACKUP = path.join(LOG_DIR, 'creds.backup.json');

// ── Funções puras (testáveis) ────────────────────────────────────────────────

function loadConfig(env = process.env) {
  const num = (key, def) => {
    const v = Number(env[key]);
    return Number.isFinite(v) && v > 0 ? v : def;
  };
  const awinMin = num('AWIN_INTERVAL_MINUTES', 3);
  return {
    port: num('PORT', 10000),
    controlPort: num('GUARDIAN_PORT', 10100),
    superviseMs: 5000,
    healthMs: 30000,
    bootGraceMs: num('GUARDIAN_BOOT_GRACE_SEC', 180) * 1000,
    httpFailLimit: 4,
    httpFailMinBootMs: 90000,
    disconnectedLimitMs: num('GUARDIAN_DISCONNECTED_MIN', 6) * 60000,
    staleDispatchMs: num('GUARDIAN_STALE_MIN', Math.max(15, awinMin * 5)) * 60000,
    maxRssMb: num('GUARDIAN_MAX_RSS_MB', 900),
  };
}

/**
 * Decide o que fazer com base na última leitura de saúde do bot.
 * @returns {{action: 'ok'|'restart'|'needs-qr', reason?: string}}
 */
function evaluateHealth({ sinceBootMs, httpFails, health, disconnectedForMs }, cfg) {
  const restart = (reason) => ({ action: 'restart', reason });
  const min = (ms) => Math.round(ms / 60000);

  if (!health) {
    if (httpFails >= cfg.httpFailLimit && sinceBootMs >= cfg.httpFailMinBootMs) {
      return restart(`servidor HTTP do bot sem resposta (${httpFails} falhas seguidas)`);
    }
    return { action: 'ok' };
  }

  if (health.rssMb > cfg.maxRssMb) {
    return restart(`memória alta (${health.rssMb} MB > ${cfg.maxRssMb} MB)`);
  }

  if (sinceBootMs < cfg.bootGraceMs) return { action: 'ok' };

  if (!health.connected) {
    if (health.qrReady) {
      return { action: 'needs-qr', reason: 'WhatsApp deslogado: é preciso escanear o QR Code em /qr' };
    }
    if (disconnectedForMs >= cfg.disconnectedLimitMs) {
      return restart(`WhatsApp desconectado há ${min(disconnectedForMs)} min`);
    }
    return { action: 'ok' };
  }

  // Conectado: o piloto automático tem que estar enviando ofertas.
  const connectedMs = (health.connectedForSec || 0) * 1000;
  if (health.autopilot && !health.nightMode && connectedMs >= cfg.staleDispatchMs) {
    const ageMs = (health.lastDispatchAgoSec == null ? health.connectedForSec : health.lastDispatchAgoSec) * 1000;
    if (ageMs >= cfg.staleDispatchMs) {
      return restart(`conectado, mas sem enviar ofertas há ${min(ageMs)} min`);
    }
  }
  return { action: 'ok' };
}

/** Espera antes de religar: 3s, 6s, 12s... até 2 min conforme o número de starts nos últimos 10 min. */
function backoffMs(recentStarts) {
  if (recentStarts <= 1) return 3000;
  return Math.min(3000 * 2 ** (recentStarts - 1), 120000);
}

// ── Log com rotação ──────────────────────────────────────────────────────────

class RotatingLog {
  constructor(file, maxBytes = 5 * 1024 * 1024, keep = 2) {
    this.file = file;
    this.maxBytes = maxBytes;
    this.keep = keep;
    this.buf = [];
    this.timer = setInterval(() => this.flush(), 1000);
    this.timer.unref();
  }
  write(chunk) {
    this.buf.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  flush() {
    if (!this.buf.length) return;
    const data = Buffer.concat(this.buf);
    this.buf = [];
    try {
      fs.appendFileSync(this.file, data);
      if (fs.statSync(this.file).size > this.maxBytes) this.rotate();
    } catch (e) { /* log nunca pode derrubar o guardião */ }
  }
  rotate() {
    for (let i = this.keep; i >= 1; i--) {
      const from = i === 1 ? this.file : `${this.file}.${i - 1}`;
      try { if (fs.existsSync(from)) fs.renameSync(from, `${this.file}.${i}`); } catch (e) {}
    }
  }
}

// ── Estado e utilidades ──────────────────────────────────────────────────────

const state = {
  cfg: null,
  child: null,
  bootAt: 0,
  nextSpawnAt: 0,
  starts: [],
  restarts: 0,
  httpFails: 0,
  disconnectedSince: 0,
  lastReason: null,
  lastHealth: null,
  lastQrAlertAt: 0,
  lastPassiveLogAt: 0,
  guardianStartedAt: Date.now(),
  stopping: false,
};
let guardianLog = null;
let botLog = null;
let keepAwakeProc = null;
let controlServer = null;

function log(msg) {
  const line = `[${new Date().toISOString()}] [GUARDIAN] ${msg}\n`;
  process.stdout.write(line);
  if (guardianLog) guardianLog.write(line);
}

function snapshot() {
  return {
    guardianPid: process.pid,
    botPid: state.child ? state.child.pid : null,
    botRunning: !!state.child,
    botUptimeSec: state.child ? Math.floor((Date.now() - state.bootAt) / 1000) : 0,
    guardianUptimeSec: Math.floor((Date.now() - state.guardianStartedAt) / 1000),
    restarts: state.restarts,
    lastReason: state.lastReason,
    lastHealth: state.lastHealth,
    updatedAt: new Date().toISOString(),
  };
}

function writeStatus() {
  try { fs.writeFileSync(STATUS_FILE, JSON.stringify(snapshot(), null, 2)); } catch (e) {}
}

function httpGetJson(port, urlPath, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}


// ── Proteção das credenciais do WhatsApp ─────────────────────────────────────

function isValidCreds(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return !!(j && j.noiseKey && j.signedIdentityKey);
  } catch (e) {
    return false;
  }
}

function backupCreds() {
  try {
    if (fs.existsSync(CREDS) && isValidCreds(CREDS)) fs.copyFileSync(CREDS, CREDS_BACKUP);
  } catch (e) {}
}

/** Só restaura se o creds.json EXISTE e está corrompido (não restaura após logout, que apaga a pasta). */
function restoreCredsIfCorrupt() {
  try {
    if (fs.existsSync(CREDS) && !isValidCreds(CREDS) && fs.existsSync(CREDS_BACKUP) && isValidCreds(CREDS_BACKUP)) {
      fs.renameSync(CREDS, path.join(LOG_DIR, `creds.corrompido.${Date.now()}.json`));
      fs.copyFileSync(CREDS_BACKUP, CREDS);
      log('⚠️ session/creds.json estava corrompido: restaurado a partir do backup (evita ter que escanear o QR de novo).');
    }
  } catch (e) {
    log(`Falha ao verificar creds.json: ${e.message}`);
  }
}

// ── Windows: impede suspensão do PC enquanto o guardião roda ─────────────────

function startKeepAwake() {
  if (process.platform !== 'win32') return;
  const script = [
    '$sig = \'[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);\'',
    'Add-Type -Namespace W -Name P -MemberDefinition $sig',
    '[void][W.P]::SetThreadExecutionState([uint32]2147483649)', // ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    `while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 10 }`,
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    keepAwakeProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
      stdio: 'ignore',
      windowsHide: true,
    });
    keepAwakeProc.on('error', () => {});
    keepAwakeProc.unref();
    log('Modo "não suspender" ativo no Windows enquanto o guardião estiver rodando.');
  } catch (e) {
    log(`Não foi possível ativar o modo "não suspender": ${e.message}`);
  }
}

// ── Controle do bot ──────────────────────────────────────────────────────────

function spawnBot() {
  restoreCredsIfCorrupt();

  const now = Date.now();
  state.starts = state.starts.filter((t) => now - t < 10 * 60 * 1000);
  state.starts.push(now);

  const child = spawn(process.execPath, ['bot.js'], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  state.child = child;
  state.bootAt = now;
  state.httpFails = 0;
  state.disconnectedSince = 0;
  log(`Bot iniciado (pid ${child.pid}).`);

  child.stdout.on('data', (d) => botLog.write(d));
  child.stderr.on('data', (d) => botLog.write(d));
  child.on('error', (err) => log(`Erro ao iniciar o bot: ${err.message}`));
  child.on('exit', (code, signal) => {
    if (state.child === child) state.child = null;
    const wait = backoffMs(state.starts.length);
    state.nextSpawnAt = Date.now() + wait;
    if (!state.stopping) {
      log(`Bot encerrou (código ${code}, sinal ${signal || '-'}). Religando em ${Math.round(wait / 1000)}s...`);
      state.restarts++;
    }
    writeStatus();
  });
}

function killChild(child) {
  return new Promise((resolve) => {
    if (!child) return resolve();
    if (child.adopted) return killAdopted(child.pid).then(resolve);
    if (child.exitCode !== null) return resolve();
    const hard = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 5000);
    child.once('exit', () => { clearTimeout(hard); resolve(); });
    try { child.kill('SIGTERM'); } catch (e) { clearTimeout(hard); resolve(); }
  });
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

async function killAdopted(pid) {
  try { process.kill(pid, 'SIGTERM'); } catch (e) { return; }
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (!isAlive(pid)) return;
  }
  try { process.kill(pid, 'SIGKILL'); } catch (e) {}
}

async function restartBot(reason) {
  state.lastReason = reason;
  log(`♻️ Reiniciando o bot: ${reason}`);
  const child = state.child;
  await killChild(child);
  if (child && child.adopted && state.child === child) {
    state.child = null;
    state.restarts++;
    state.nextSpawnAt = Date.now() + backoffMs(state.starts.length);
  }
}

let superviseBusy = false;
async function supervise() {
  if (superviseBusy || state.stopping) return;
  if (state.child) {
    // Bot adotado (não é filho deste guardião): detecta a morte por PID.
    if (state.child.adopted && !isAlive(state.child.pid)) {
      log(`Bot adotado (pid ${state.child.pid}) encerrou. Religando...`);
      state.child = null;
      state.restarts++;
      state.nextSpawnAt = Date.now() + backoffMs(state.starts.length);
    }
    return;
  }
  if (Date.now() < state.nextSpawnAt) return;
  superviseBusy = true;
  try {
    const running = await httpGetJson(state.cfg.port, '/api/health', 3000);
    if (running) {
      // Já existe um bot na porta (ex.: o guardião anterior morreu e deixou o bot órfão).
      // Adota o processo se o PID informado é confiável; nunca sobe um segundo bot (sessão duplicada).
      if (running.pid && isAlive(running.pid)) {
        state.child = { pid: running.pid, adopted: true };
        state.bootAt = Date.now() - (running.uptimeSec || 0) * 1000;
        state.httpFails = 0;
        state.disconnectedSince = 0;
        log(`Assumi o controle do bot que já estava rodando (pid ${running.pid}).`);
      } else if (Date.now() - state.lastPassiveLogAt > 60000) {
        state.lastPassiveLogAt = Date.now();
        log(`A porta ${state.cfg.port} está em uso por um bot sem PID identificável. Aguardando ele cair para assumir.`);
      }
      return;
    }
    spawnBot();
  } finally {
    superviseBusy = false;
  }
}

let healthBusy = false;
async function healthTick() {
  if (healthBusy || state.stopping || !state.child) return;
  healthBusy = true;
  try {
    const now = Date.now();
    const health = await httpGetJson(state.cfg.port, '/api/health');
    state.httpFails = health ? 0 : state.httpFails + 1;
    state.lastHealth = health;
    if (health) {
      if (health.connected) state.disconnectedSince = 0;
      else if (!state.disconnectedSince) state.disconnectedSince = now;
    }
    const verdict = evaluateHealth({
      sinceBootMs: now - state.bootAt,
      httpFails: state.httpFails,
      health,
      disconnectedForMs: state.disconnectedSince ? now - state.disconnectedSince : 0,
    }, state.cfg);

    writeStatus();

    if (verdict.action === 'restart') {
      await restartBot(verdict.reason);
    } else if (verdict.action === 'needs-qr' && now - state.lastQrAlertAt > 30 * 60 * 1000) {
      state.lastQrAlertAt = now;
      state.lastReason = verdict.reason;
      log(`🔐 ATENÇÃO: ${verdict.reason} → abra http://localhost:${state.cfg.port}/qr e escaneie com o WhatsApp.`);
    }
  } catch (e) {
    log(`Erro no health-check: ${e.message}`);
  } finally {
    healthBusy = false;
  }
}

// ── Servidor de controle local (instância única + status/stop) ───────────────

function startControlServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/stop') {
        res.end('parando\n');
        setTimeout(() => shutdown(0), 200);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(snapshot(), null, 2));
    });
    server.once('error', () => resolve(null));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function shutdown(code = 0) {
  if (state.stopping) return;
  state.stopping = true;
  log('Encerrando guardião e bot...');
  await killChild(state.child);
  try { if (keepAwakeProc) keepAwakeProc.kill(); } catch (e) {}
  try { if (controlServer) controlServer.close(); } catch (e) {}
  writeStatus();
  if (guardianLog) guardianLog.flush();
  if (botLog) botLog.flush();
  process.exit(code);
}

// ── Principal ────────────────────────────────────────────────────────────────

async function cli(command) {
  require('./envLoader');
  const cfg = loadConfig();
  if (command === 'status') {
    const s = await httpGetJson(cfg.controlPort, '/');
    console.log(s ? JSON.stringify(s, null, 2) : 'Guardião NÃO está rodando.');
  } else if (command === 'stop') {
    const s = await httpGetJson(cfg.controlPort, '/');
    if (!s) return console.log('Guardião não está rodando.');
    http.get({ host: '127.0.0.1', port: cfg.controlPort, path: '/stop' }, (res) => res.resume()).on('error', () => {});
    console.log('Pedido de parada enviado ao guardião.');
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'status' || command === 'stop') return cli(command);

  require('./envLoader');
  state.cfg = loadConfig();
  fs.mkdirSync(LOG_DIR, { recursive: true });

  controlServer = await startControlServer(state.cfg.controlPort);
  if (!controlServer) {
    console.log(`Guardião já está rodando (porta de controle ${state.cfg.controlPort} ocupada). Nada a fazer.`);
    return process.exit(0);
  }

  guardianLog = new RotatingLog(path.join(LOG_DIR, 'guardian.log'));
  botLog = new RotatingLog(path.join(LOG_DIR, 'bot.log'));

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('uncaughtException', (e) => log(`uncaughtException no guardião: ${e.message}`));
  process.on('unhandledRejection', (r) => log(`unhandledRejection no guardião: ${r && r.message ? r.message : r}`));

  log(`Guardião iniciado (pid ${process.pid}). Bot na porta ${state.cfg.port}, controle em ${state.cfg.controlPort}.`);
  log(`Limites: sem envio ${state.cfg.staleDispatchMs / 60000} min | desconectado ${state.cfg.disconnectedLimitMs / 60000} min | memória ${state.cfg.maxRssMb} MB`);
  startKeepAwake();
  backupCreds();

  setInterval(supervise, state.cfg.superviseMs);
  setInterval(healthTick, state.cfg.healthMs);
  setInterval(backupCreds, 10 * 60 * 1000);
  supervise();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Falha fatal no guardião:', e);
    process.exit(1);
  });
}

module.exports = { loadConfig, evaluateHealth, backoffMs, RotatingLog };
