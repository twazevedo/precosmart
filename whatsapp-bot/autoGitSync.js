/**
 * @file autoGitSync.js — Sincronizador Automático com GitHub a cada 1 Hora
 * @description Monitora o repositório local e envia automaticamente commits e pushes
 * a cada 60 minutos caso haja arquivos modificados (catálogos, ofertas, cupons).
 */
'use strict';

const { exec } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

/**
 * Executa um comando do Git com promise e timeout de segurança.
 */
function execGit(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: repoRoot, timeout: 30000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code || 0,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim()
      });
    });
  });
}

/**
 * Verifica se há alterações pendentes e envia para o GitHub.
 */
async function runGitSync() {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  try {
    // 1. Verifica se há arquivos modificados ou novos
    const statusRes = await execGit('git status --porcelain');
    if (!statusRes.ok) {
      console.warn(`[GitSync ${timestamp}] Falha ao verificar git status: ${statusRes.stderr}`);
      return { ok: false, error: statusRes.stderr };
    }

    if (!statusRes.stdout) {
      console.log(`[GitSync ${timestamp}] Repositório limpo. Nenhuma alteração para subir.`);
      return { ok: true, committed: false, message: 'Nenhuma alteração pendente' };
    }

    console.log(`[GitSync ${timestamp}] Alterações detectadas:\n${statusRes.stdout.substring(0, 300)}...`);

    // 2. Adiciona alterações respeitando o .gitignore
    const addRes = await execGit('git add -A');
    if (!addRes.ok) {
      console.error(`[GitSync ${timestamp}] Erro no git add: ${addRes.stderr}`);
      return { ok: false, error: addRes.stderr };
    }

    // 3. Cria o commit com data e hora
    const commitMsg = `chore(auto-sync): atualização automática de dados e catálogo [${timestamp}]`;
    const commitRes = await execGit(`git commit -m "${commitMsg}"`);
    if (!commitRes.ok && !commitRes.stdout.includes('nothing to commit')) {
      console.warn(`[GitSync ${timestamp}] Aviso no git commit: ${commitRes.stderr || commitRes.stdout}`);
    }

    // 4. Envia para o GitHub (origin main)
    console.log(`[GitSync ${timestamp}] Enviando atualizações para o GitHub (origin main)...`);
    const pushRes = await execGit('git push origin main');
    if (!pushRes.ok) {
      console.error(`[GitSync ${timestamp}] Erro no git push: ${pushRes.stderr}`);
      return { ok: false, error: pushRes.stderr };
    }

    console.log(`[GitSync ${timestamp}] ✅ Sucesso! Atualizações sincronizadas no GitHub.`);
    return { ok: true, committed: true, message: 'Atualizações enviadas com sucesso ao GitHub' };
  } catch (err) {
    console.error(`[GitSync ${timestamp}] Exceção no sync automático:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Inicia o agendador para rodar a cada 1 hora (60 minutos).
 */
function startHourlyGitSync() {
  const ONE_HOUR_MS = 60 * 60 * 1000;

  console.log('🕒 [GitSync] Agendador automático ativado: verificando e subindo atualizações a cada 1 hora.');

  // Intervalo recorrente de 1 hora
  setInterval(() => {
    runGitSync().catch(err => console.error('[GitSync] Erro no timer de 1 hora:', err.message));
  }, ONE_HOUR_MS);
}

module.exports = {
  runGitSync,
  startHourlyGitSync
};
