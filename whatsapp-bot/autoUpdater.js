/**
 * @file autoUpdater.js — Atualizador Automático Contínuo para Tablet / Servidor Dedicado
 * @description Verifica periodicamente o repositório GitHub oficial (origin main).
 * Quando você sobe um commit ou melhoria no GitHub, o tablet detecta a novidade,
 * baixa o código atualizado, instala eventuais novos pacotes e reinicia o robô no PM2,
 * sem exigir nenhuma ação manual no tablet!
 */
'use strict';

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
const botDir = __dirname;

const CHECK_INTERVAL_MINUTES = parseInt(process.env.UPDATE_CHECK_INTERVAL_MINUTES || '15', 10);
const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;

let isUpdating = false;

function execPromise(cmd, cwd = repoRoot, timeout = 60000) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code || 0,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim()
      });
    });
  });
}

function log(msg) {
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[AutoUpdater ${ts}] ${msg}`);
}

/**
 * Compara o commit local com o commit remoto no GitHub.
 */
async function checkForUpdates() {
  if (isUpdating) return { updated: false, reason: 'Atualização já em andamento' };

  try {
    // 1. Busca os commits mais recentes no GitHub silenciosamente
    const fetchRes = await execPromise('git fetch origin main --quiet');
    if (!fetchRes.ok) {
      log(`⚠️ Falha na conexão com GitHub: ${fetchRes.stderr || 'timeout ou sem internet'}`);
      return { updated: false, error: fetchRes.stderr };
    }

    // 2. Obtém os hashes de commit
    const [localRes, remoteRes] = await Promise.all([
      execPromise('git rev-parse HEAD'),
      execPromise('git rev-parse origin/main')
    ]);

    if (!localRes.ok || !remoteRes.ok) {
      return { updated: false, error: 'Falha ao ler versão dos commits' };
    }

    const localHash = localRes.stdout;
    const remoteHash = remoteRes.stdout;

    if (localHash === remoteHash) {
      log(`Sistema 100% atualizado (${localHash.substring(0, 7)}). Próxima checagem em ${CHECK_INTERVAL_MINUTES} min.`);
      return { updated: false, current: localHash };
    }

    // 3. Nova versão detectada!
    isUpdating = true;
    log(`🚀 Nova versão detectada no GitHub! (${localHash.substring(0, 7)} -> ${remoteHash.substring(0, 7)})`);
    log(`Baixando alterações e aplicando no tablet...`);

    // 4. Aplica os arquivos do GitHub
    const resetRes = await execPromise('git reset --hard origin/main');
    if (!resetRes.ok) {
      isUpdating = false;
      log(`❌ Erro no git reset: ${resetRes.stderr}`);
      return { updated: false, error: resetRes.stderr };
    }

    // 5. Instala pacotes do Node caso package.json tenha mudado
    log(`Verificando dependências npm...`);
    await execPromise('npm install --omit=dev --no-audit --no-fund', botDir, 180000);

    // 6. Reinicia o robô no PM2
    log(`Reiniciando PreçoSmart no PM2 com a versão atualizada...`);
    const pm2Res = await execPromise('pm2 restart precosmart', botDir, 30000);
    if (!pm2Res.ok) {
      // Se não estiver rodando no PM2 (ex: teste manual), tenta via guardião
      await execPromise('node guardian.js stop && node guardian.js', botDir, 30000);
    }

    log(`🎉 SUCESSO! PreçoSmart atualizado automaticamente para a versão ${remoteHash.substring(0, 7)}!`);
    isUpdating = false;
    return { updated: true, newHash: remoteHash };
  } catch (err) {
    isUpdating = false;
    log(`Erro inesperado no auto-updater: ${err.message}`);
    return { updated: false, error: err.message };
  }
}

/**
 * Inicia o loop de verificação contínua.
 */
function startAutoUpdateLoop() {
  log(`Loop de atualização automática iniciado! Intervalo: a cada ${CHECK_INTERVAL_MINUTES} minutos.`);
  
  // Primeira checagem após 30 segundos da inicialização
  setTimeout(() => {
    checkForUpdates().catch((e) => log(`Erro no primeiro ciclo: ${e.message}`));
  }, 30000);

  // Intervalo contínuo
  setInterval(() => {
    checkForUpdates().catch((e) => log(`Erro no ciclo recorrente: ${e.message}`));
  }, CHECK_INTERVAL_MS);
}

if (require.main === module) {
  startAutoUpdateLoop();
}

module.exports = {
  checkForUpdates,
  startAutoUpdateLoop,
  execPromise
};
