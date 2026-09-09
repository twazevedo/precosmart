/**
 * @file index.js — Gerenciador Central de Comandos
 */
'use strict';

const commands = new Map();

function registerCommand(cmdModule) {
  commands.set(cmdModule.name, cmdModule);
  if (cmdModule.aliases && Array.isArray(cmdModule.aliases)) {
    cmdModule.aliases.forEach(alias => commands.set(alias, cmdModule));
  }
}

// Carrega comandos padrão
registerCommand(require('./shopee'));
registerCommand(require('./magalu'));
registerCommand(require('./boticario'));
registerCommand(require('./catalogo'));
registerCommand(require('./crawler'));
registerCommand(require('./top'));
registerCommand(require('./garimpar'));

function getCommand(name) {
  return commands.get(name.toLowerCase());
}

module.exports = {
  getCommand,
  commands
};
