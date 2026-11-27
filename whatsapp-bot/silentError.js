'use strict';
/**
 * Registra erros que o codigo decide ignorar de proposito (limpeza, kill de processo ja encerrado etc.).
 * Por padrao nao imprime nada; defina DEBUG_SWALLOWED=1 para ver o que esta sendo engolido.
 */
function ignorar(contexto, erro) {
  if (process.env.DEBUG_SWALLOWED === '1') {
    console.debug(`[ignorado] ${contexto}: ${erro && erro.message ? erro.message : erro}`);
  }
}

module.exports = { ignorar };
