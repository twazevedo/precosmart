#!/usr/bin/env node
/**
 * @file backup-server.js — Servidor Local de Backup & Alta Disponibilidade (Failover Automático)
 * @description Servidor de redundância local que roda em porta secundária (10001 por padrão).
 *
 * Funcionamento:
 *  1. Modo STANDBY (Sentinela):
 *     - Fica monitorando o Servidor Primário (porta 10000) via /api/health a cada 5 segundos.
 *     - Sincroniza periodicamente as credenciais de sessão do WhatsApp.
 *     - Disponibiliza Dashboard Web em http://localhost:10001 mostrando o estado dos dois servidores.
 *
 *  2. Modo FAILOVER (Assunção Automática):
 *     - Se o Servidor Primário parar de responder por 3 checagens consecutivas (15s) ou travar:
 *     - O Servidor de Backup assume a liderança IMEDIATAMENTE (Role: ACTIVE).
 *     - Inicia a instância de contingência do bot e retoma os envios no grupo VIP.
 *     - Registra o evento de failover no log e no histórico do cluster.
 *
 *  3. Modo FAILBACK / CONTROLE MANUAL:
 *     - Permite simular quedas para testes e alternar entre Standby e Ativo via API ou painel web.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const LOG_DIR = path.join(ROOT, 'logs');
const SESSION_DIR = path.join(ROOT, 'session');
const CREDS_FILE = path.join(SESSION_DIR, 'creds.json');
const CREDS_BACKUP = path.join(LOG_DIR, 'creds.failover-backup.json');

// ── 1. Configurações e Funções Puras (Testáveis) ─────────────────────────────

function loadBackupConfig(env = process.env) {
  const num = (k, def) => {
    const v = Number(env[k]);
    return Number.isFinite(v) && v > 0 ? v : def;
  };
  return {
    primaryPort: num('PORT', 10000),
    backupPort: num('BACKUP_PORT', 10001),
    heartbeatIntervalMs: num('BACKUP_HEARTBEAT_MS', 5000),
    heartbeatTimeoutMs: num('BACKUP_TIMEOUT_MS', 4000),
    failoverThreshold: num('BACKUP_FAILOVER_THRESHOLD', 3), // 3 falhas = ~15s
    recoveryThreshold: num('BACKUP_RECOVERY_THRESHOLD', 4),
    maxDisconnectedSec: num('BACKUP_MAX_DISCONNECTED_SEC', 180), // 3 min sem reconexão no principal
    autoFailback: env.BACKUP_AUTO_FAILBACK === 'true',
  };
}

/**
 * Avalia o estado do cluster e decide a ação a ser tomada.
 * @param {Object} params
 * @param {('STANDBY'|'ACTIVE'|'PROMOTING')} params.role
 * @param {number} params.primaryFails
 * @param {Object|null} params.primaryHealth
 * @param {number} params.consecutiveSuccesses
 * @param {string|null} params.manualOverride
 * @param {Object} cfg
 * @returns {{ nextRole: 'STANDBY'|'ACTIVE'|'PROMOTING', action: 'stay'|'promote'|'demote', reason?: string }}
 */
function evaluateClusterState({ role, primaryFails, primaryHealth, consecutiveSuccesses, manualOverride }, cfg) {
  if (manualOverride === 'force-failover') {
    return { nextRole: 'ACTIVE', action: 'promote', reason: 'Comando manual de failover disparado' };
  }
  if (manualOverride === 'force-standby') {
    return { nextRole: 'STANDBY', action: 'demote', reason: 'Comando manual de retorno a standby disparado' };
  }

  if (role === 'STANDBY') {
    // 1. Falha por indisponibilidade HTTP (porta caída / processo morto)
    if (primaryFails >= cfg.failoverThreshold) {
      return {
        nextRole: 'ACTIVE',
        action: 'promote',
        reason: `Servidor primário inativo (${primaryFails} falhas consecutivas de heartbeat)`,
      };
    }

    // 2. Primário responde HTTP, mas WhatsApp está desconectado por tempo demais
    if (primaryHealth && !primaryHealth.connected && (primaryHealth.disconnectedForSec || 0) >= cfg.maxDisconnectedSec) {
      return {
        nextRole: 'ACTIVE',
        action: 'promote',
        reason: `WhatsApp no servidor primário desconectado há ${primaryHealth.disconnectedForSec}s (limite: ${cfg.maxDisconnectedSec}s)`,
      };
    }

    return { nextRole: 'STANDBY', action: 'stay' };
  }

  if (role === 'ACTIVE') {
    // Se auto-failback estiver ativado e o primário se recuperou com sucesso consistente
    if (cfg.autoFailback && consecutiveSuccesses >= cfg.recoveryThreshold && primaryHealth && primaryHealth.ok && primaryHealth.connected) {
      return {
        nextRole: 'STANDBY',
        action: 'demote',
        reason: `Servidor primário restabelecido com sucesso (${consecutiveSuccesses} pings saudáveis)`,
      };
    }
    return { nextRole: 'ACTIVE', action: 'stay' };
  }

  return { nextRole: role, action: 'stay' };
}

// ── 2. Estado Global do Servidor de Backup ───────────────────────────────────

const clusterState = {
  role: 'STANDBY', // 'STANDBY' | 'ACTIVE' | 'PROMOTING'
  startedAt: Date.now(),
  promotedAt: null,
  demotedAt: null,
  childBot: null,
  primaryFails: 0,
  consecutiveSuccesses: 0,
  lastHeartbeatAt: null,
  lastPrimaryHealth: null,
  lastPingMs: null,
  manualOverride: null,
  events: [],
};

function addEvent(type, detail) {
  const item = {
    timestamp: new Date().toISOString(),
    type,
    detail,
    role: clusterState.role,
  };
  clusterState.events.unshift(item);
  if (clusterState.events.length > 50) clusterState.events.pop();
  const logLine = `[${item.timestamp}] [BACKUP-CLUSTER] [${type}] ${detail}`;
  console.log(logLine);
}

// ── 3. Motor de Heartbeat (Monitora o Primário) ──────────────────────────────

function checkPrimaryHealth(cfg) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.get(
      {
        host: '127.0.0.1',
        port: cfg.primaryPort,
        path: '/api/health',
        timeout: cfg.heartbeatTimeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          const latency = Date.now() - t0;
          if (res.statusCode !== 200) {
            return resolve({ ok: false, statusCode: res.statusCode, latency });
          }
          try {
            const data = JSON.parse(body);
            return resolve({ ok: true, data, latency });
          } catch (err) {
            return resolve({ ok: false, parseError: err.message, latency });
          }
        });
      }
    );

    req.on('error', (err) => resolve({ ok: false, error: err.code || err.message, latency: Date.now() - t0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT', latency: Date.now() - t0 });
    });
  });
}

function syncCredentialsBackup() {
  try {
    if (fs.existsSync(CREDS_FILE)) {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.copyFileSync(CREDS_FILE, CREDS_BACKUP);
    }
  } catch (err) {
    // Continua sem travar
  }
}

// ── 4. Ações de Failover (Assunção e Retorno) ────────────────────────────────

function promoteToActive(reason, cfg) {
  if (clusterState.role === 'ACTIVE') return;
  clusterState.role = 'ACTIVE';
  clusterState.promotedAt = Date.now();
  addEvent('FAILOVER_TRIGGERED', `🚨 BACKUP ASSUMIU A OPERAÇÃO! Motivo: ${reason}`);

  // Inicia o processo de contingência do bot se não estiver rodando
  if (!clusterState.childBot) {
    addEvent('FAILOVER_SPAWN', 'Iniciando instância de contingência do bot...');
    try {
      const env = Object.assign({}, process.env, {
        PORT: String(cfg.primaryPort),
        BACKUP_MODE: 'true',
      });
      clusterState.childBot = spawn(process.execPath, ['bot.js'], {
        cwd: ROOT,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      clusterState.childBot.stdout.on('data', (d) => {
        const str = d.toString().trim();
        if (str) console.log(`[BACKUP-BOT:OUT] ${str.slice(0, 150)}`);
      });

      clusterState.childBot.stderr.on('data', (d) => {
        const str = d.toString().trim();
        if (str) console.error(`[BACKUP-BOT:ERR] ${str.slice(0, 150)}`);
      });

      clusterState.childBot.on('exit', (code, signal) => {
        addEvent('BOT_EXIT', `Instância de contingência finalizada com código ${code} / sinal ${signal}`);
        clusterState.childBot = null;
      });
    } catch (err) {
      addEvent('FAILOVER_ERROR', `Erro ao iniciar contingência: ${err.message}`);
    }
  }
}

function demoteToStandby(reason) {
  if (clusterState.role === 'STANDBY') return;
  clusterState.role = 'STANDBY';
  clusterState.demotedAt = Date.now();
  addEvent('FAILBACK_STANDBY', `Retornando para modo STANDBY. Motivo: ${reason}`);

  // Encerra a instância de contingência para evitar conflito com o primário
  if (clusterState.childBot) {
    addEvent('BOT_STOPPING', 'Encerrando instância de contingência para ceder ao primário...');
    try {
      clusterState.childBot.kill('SIGINT');
      setTimeout(() => {
        if (clusterState.childBot) {
          try { clusterState.childBot.kill('SIGKILL'); } catch (e) {}
          clusterState.childBot = null;
        }
      }, 4000);
    } catch (err) {
      clusterState.childBot = null;
    }
  }
}

async function heartbeatCycle(cfg) {
  clusterState.lastHeartbeatAt = Date.now();
  const res = await checkPrimaryHealth(cfg);
  clusterState.lastPingMs = res.latency;

  if (res.ok && res.data && res.data.ok) {
    clusterState.primaryFails = 0;
    clusterState.consecutiveSuccesses += 1;
    clusterState.lastPrimaryHealth = res.data;
    syncCredentialsBackup();
  } else {
    clusterState.primaryFails += 1;
    clusterState.consecutiveSuccesses = 0;
    clusterState.lastPrimaryHealth = null;
    addEvent('HEARTBEAT_FAIL', `Falha ao pingar primário (${clusterState.primaryFails}/${cfg.failoverThreshold}): ${res.error || res.statusCode || 'Erro desconhecido'}`);
  }

  // Avalia decisão
  const decision = evaluateClusterState(
    {
      role: clusterState.role,
      primaryFails: clusterState.primaryFails,
      primaryHealth: clusterState.lastPrimaryHealth,
      consecutiveSuccesses: clusterState.consecutiveSuccesses,
      manualOverride: clusterState.manualOverride,
    },
    cfg
  );

  clusterState.manualOverride = null; // Consome o override

  if (decision.action === 'promote') {
    promoteToActive(decision.reason, cfg);
  } else if (decision.action === 'demote') {
    demoteToStandby(decision.reason);
  }
}

// ── 5. Servidor HTTP do Dashboard de Alta Disponibilidade (Porta 10001) ──────

function renderDashboardHtml(cfg) {
  const isStandby = clusterState.role === 'STANDBY';
  const roleColor = isStandby ? '#f59e0b' : '#10b981';
  const roleText = isStandby ? 'STANDBY (PRONTO / VIGILANTE)' : 'ATIVO (ASSUMIU A OPERAÇÃO)';

  const primaryOnline = !!(clusterState.lastPrimaryHealth && clusterState.lastPrimaryHealth.ok);
  const primaryBadgeColor = primaryOnline ? '#10b981' : '#ef4444';
  const primaryBadgeText = primaryOnline ? 'ONLINE E SAUDÁVEL' : 'OFFLINE / INDISPONÍVEL';

  const eventsHtml = clusterState.events
    .slice(0, 12)
    .map(
      (e) => `
    <div style="padding: 8px 12px; margin-bottom: 6px; background: rgba(255,255,255,0.03); border-left: 3px solid ${
      e.type.includes('FAIL') ? '#ef4444' : e.type.includes('SPAWN') || e.type.includes('TRIGGERED') ? '#10b981' : '#3b82f6'
    }; font-family: monospace; font-size: 12px; border-radius: 4px;">
      <span style="color: #94a3b8;">[${e.timestamp.slice(11, 19)}]</span>
      <b style="color: #f1f5f9;">[${e.type}]</b>
      <span style="color: #cbd5e1;">${e.detail}</span>
    </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PreçoSmart — Cluster de Alta Disponibilidade (Backup Server)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 22px; display: flex; align-items: center; gap: 10px; }
    .badge-live { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.9); } }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .card { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; position: relative; }
    .card h2 { font-size: 16px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .status-badge { font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; }
    .metric { margin: 12px 0; display: flex; justify-content: space-between; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; }
    .metric span { color: #94a3b8; }
    .metric b { color: #f8fafc; }
    .actions { display: flex; gap: 12px; margin-bottom: 24px; }
    button { background: #3b82f6; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; font-size: 13px; }
    button:hover { background: #2563eb; transform: translateY(-1px); }
    button.danger { background: #ef4444; }
    button.danger:hover { background: #dc2626; }
    button.secondary { background: #475569; }
    button.secondary:hover { background: #334155; }
    .events-panel { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
    .events-panel h3 { font-size: 15px; margin-bottom: 12px; color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><span class="badge-live"></span> PreçoSmart — Cluster de Alta Disponibilidade</h1>
      <span style="font-size: 13px; color: #94a3b8;">Atualização automática em tempo real</span>
    </div>

    <div class="grid">
      <!-- Card Servidor Primário -->
      <div class="card">
        <h2>
          <span>Servidor Primário (Porta ${cfg.primaryPort})</span>
          <span class="status-badge" style="background: ${primaryBadgeColor}22; color: ${primaryBadgeColor}; border: 1px solid ${primaryBadgeColor};">
            ${primaryBadgeText}
          </span>
        </h2>
        <div class="metric"><span>Status do Processo:</span> <b>${primaryOnline ? 'Em Execução' : 'Inativo / Travado'}</b></div>
        <div class="metric"><span>PID do Bot:</span> <b>${clusterState.lastPrimaryHealth?.pid || '—'}</b></div>
        <div class="metric"><span>WhatsApp Conectado:</span> <b>${clusterState.lastPrimaryHealth?.connected ? '✅ Sim' : '❌ Não'}</b></div>
        <div class="metric"><span>Piloto Automático:</span> <b>${clusterState.lastPrimaryHealth?.autopilot ? '✅ Ativo' : 'Desativado'}</b></div>
        <div class="metric"><span>Latência do Ping:</span> <b>${clusterState.lastPingMs != null ? clusterState.lastPingMs + ' ms' : '—'}</b></div>
        <div class="metric"><span>Falhas Consecutivas:</span> <b>${clusterState.primaryFails} / ${cfg.failoverThreshold}</b></div>
      </div>

      <!-- Card Servidor Backup -->
      <div class="card">
        <h2>
          <span>Servidor de Backup (Porta ${cfg.backupPort})</span>
          <span class="status-badge" style="background: ${roleColor}22; color: ${roleColor}; border: 1px solid ${roleColor};">
            ${roleText}
          </span>
        </h2>
        <div class="metric"><span>Papel Atual:</span> <b style="color: ${roleColor};">${clusterState.role}</b></div>
        <div class="metric"><span>PID do Backup:</span> <b>${process.pid}</b></div>
        <div class="metric"><span>Processo Contingência:</span> <b>${clusterState.childBot ? 'PID ' + clusterState.childBot.pid + ' (Ativo)' : 'Em Standby (Pronto)'}</b></div>
        <div class="metric"><span>Tolerância de Queda:</span> <b>${cfg.failoverThreshold * (cfg.heartbeatIntervalMs / 1000)}s sem resposta</b></div>
        <div class="metric"><span>Backup da Sessão:</span> <b>${fs.existsSync(CREDS_BACKUP) ? '✅ Sincronizado' : 'Pendente'}</b></div>
        <div class="metric"><span>Uptime do Backup:</span> <b>${Math.floor((Date.now() - clusterState.startedAt) / 1000)}s</b></div>
      </div>
    </div>

    <!-- Botões de Ação -->
    <div class="actions">
      <button class="danger" onclick="triggerAction('/api/force-failover')">🚨 Simular Queda (Forçar Failover)</button>
      <button class="secondary" onclick="triggerAction('/api/standby')">🔄 Retornar Backup para Standby</button>
      <button onclick="window.location.reload()">⚡ Atualizar Agora</button>
    </div>

    <!-- Log de Eventos -->
    <div class="events-panel">
      <h3>Histórico de Eventos do Cluster:</h3>
      <div>${eventsHtml || '<p style="color: #64748b; font-size: 13px;">Nenhum evento registrado ainda.</p>'}</div>
    </div>
  </div>

  <script>
    async function triggerAction(endpoint) {
      if (!confirm('Deseja executar esta alteração de estado no cluster?')) return;
      try {
        const res = await fetch(endpoint, { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Comando enviado!');
        window.location.reload();
      } catch (err) {
        alert('Erro ao enviar comando: ' + err.message);
      }
    }
    // Auto-refresh a cada 4 segundos
    setTimeout(() => window.location.reload(), 4000);
  </script>
</body>
</html>`;
}

function startBackupServer(cfg = loadBackupConfig()) {
  addEvent('SERVER_START', `Iniciando Servidor de Backup PreçoSmart na porta ${cfg.backupPort}...`);
  addEvent('STANDBY_READY', `Monitorando servidor primário na porta ${cfg.primaryPort} a cada ${cfg.heartbeatIntervalMs / 1000}s`);

  // Inicia o ciclo de heartbeat
  const heartbeatTimer = setInterval(() => heartbeatCycle(cfg), cfg.heartbeatIntervalMs);
  heartbeatCycle(cfg); // Primeira execução imediata

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderDashboardHtml(cfg));
    }

    if (req.method === 'GET' && (url.pathname === '/api/cluster-status' || url.pathname === '/api/status')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify(
          {
            ok: true,
            role: clusterState.role,
            backupPid: process.pid,
            contingencyBotPid: clusterState.childBot ? clusterState.childBot.pid : null,
            primary: {
              port: cfg.primaryPort,
              online: !!(clusterState.lastPrimaryHealth && clusterState.lastPrimaryHealth.ok),
              fails: clusterState.primaryFails,
              threshold: cfg.failoverThreshold,
              health: clusterState.lastPrimaryHealth,
              lastPingMs: clusterState.lastPingMs,
            },
            cluster: {
              uptimeSec: Math.floor((Date.now() - clusterState.startedAt) / 1000),
              events: clusterState.events.slice(0, 10),
            },
          },
          null,
          2
        )
      );
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, role: clusterState.role, pid: process.pid }));
    }

    if (req.method === 'POST' && url.pathname === '/api/force-failover') {
      clusterState.manualOverride = 'force-failover';
      promoteToActive('Comando manual via API / Painel Web', cfg);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, message: 'Failover acionado com sucesso! Backup assumiu a operação.' }));
    }

    if (req.method === 'POST' && url.pathname === '/api/standby') {
      clusterState.manualOverride = 'force-standby';
      demoteToStandby('Comando manual via API / Painel Web');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, message: 'Servidor de backup retornado para modo STANDBY.' }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(cfg.backupPort, '0.0.0.0', () => {
    addEvent('LISTEN_OK', `✅ Dashboard de Alta Disponibilidade acessível em http://localhost:${cfg.backupPort}`);
  });

  const shutdown = () => {
    clearInterval(heartbeatTimer);
    if (clusterState.childBot) {
      try { clusterState.childBot.kill('SIGTERM'); } catch (e) {}
    }
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, heartbeatTimer, state: clusterState };
}

// ── Execução Direta ──────────────────────────────────────────────────────────
if (require.main === module) {
  startBackupServer();
}

module.exports = {
  loadBackupConfig,
  evaluateClusterState,
  startBackupServer,
};
