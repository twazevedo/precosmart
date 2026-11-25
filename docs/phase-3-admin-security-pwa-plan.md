# Fase 3 — Segurança administrativa e PWA PreçoSmart

## Objetivo

Transformar o painel móvel existente em um PWA Android instalável e seguro, integrado ao PreçoSmart atual. Não reconstruir o catálogo, comparador, bot ou backend e não criar um segundo publicador WhatsApp.

## Auditoria do estado atual

- O app Android existente carrega uma página estática em `android-app/dist/index.html` e usa Capacitor.
- O painel armazena a chave de API em `localStorage` (`ps_api_key`). Isso não é adequado para uma credencial administrativa de longo prazo.
- A URL do bot está embutida como padrão no frontend; isso dificulta ambientes de teste e produção.
- Não foram encontrados `manifest.webmanifest` nem service worker no pacote Android analisado; o script de build atual é apenas um placeholder.
- O backend `backend/src/server.js` libera todas as rotas GET e protege somente métodos de alteração com API key. Isso deixa informações administrativas acessíveis sem sessão.
- O bot possui middleware próprio de segurança e painel HTML existente. A autenticação e autorização de cada rota precisam ser inventariadas antes de reaproveitar endpoints no PWA.
- A API do bot aceita CORS amplo atualmente; o PWA exigirá política de origem restrita e proteção contra CSRF se usar cookies.

## Arquitetura alvo

1. **Identidade administrativa única**
   - Login com usuário administrador configurado por variáveis de ambiente.
   - Senha armazenada somente como hash forte (Argon2id ou scrypt com salt).
   - Nenhuma senha, API key ou token persistido em localStorage/sessionStorage.
   - Segredo ausente deve bloquear o login em produção, nunca criar credencial padrão.

2. **Sessão web**
   - Cookie de sessão HttpOnly, Secure em produção, SameSite=Lax ou Strict e expiração curta.
   - Rotação de identificador no login, logout com invalidação no servidor e limite de tentativas.
   - CSRF token nas operações mutáveis e validação de Origin/Host.
   - Rate limit de login e auditoria sem registrar senhas, cookies ou tokens.

3. **Autorização por padrão fechado**
   - Todas as rotas operacionais e dados administrativos exigem sessão.
   - Rotas públicas limitadas explicitamente a health-check mínimo e conteúdo público já existente.
   - Endpoints de controle do robô, fila, publicações, Awin, relatórios e alertas protegidos por autorização.
   - Não expor QR, JID, telefone, variáveis de ambiente, credenciais ou stack traces em status público.

4. **PWA Android**
   - Manifest com nome PreçoSmart Admin, ícones, display standalone e tema.
   - Service worker para cache somente do shell estático; nunca armazenar respostas administrativas, sessão, relatórios ou dados sensíveis em cache.
   - Tela offline informa indisponibilidade sem simular sucesso de comandos.
   - HTTPS obrigatório; instalação Android via navegador compatível.
   - Manter compatibilidade com o projeto Capacitor atual, sem exigir publicação em loja.

5. **Integração com serviços existentes**
   - O PWA atua como cliente da API existente do bot e do backend.
   - Um único serviço continua responsável pela sessão Baileys e publicação WhatsApp.
   - Não criar um novo serviço Render, novo bot ou nova sessão WhatsApp.
   - Controles de iniciar/pausar devem ser idempotentes e retornar estado confirmado pelo servidor.
   - Ações de disparo manual devem exigir confirmação e registrar ator, horário e resultado.

## Telas e funções

- Visão geral: conexão, estado do robô, fila pendente, último envio confirmado e falhas recentes.
- Robô: iniciar/pausar, sem limpar fila pendente.
- Publicações: fila, histórico, itens incertos e ações de reprocessamento com confirmação.
- Ofertas/produtos: consulta, curadoria e ativação/desativação.
- Relatórios: cliques separados de transações e comissões Awin; status pending/approved/rejected quando disponível.
- Alertas: falhas do bot, desconexões, fila parada e integração Awin.
- Configurações Awin: status da integração e credenciais mascaradas; segredo nunca retorna à interface.

## Critérios de aceitação e testes

- Visitante sem sessão recebe 401/redirect em todas as rotas administrativas, inclusive GET.
- Sessão expirada ou logout impede chamadas subsequentes.
- Cookie não é acessível por JavaScript e possui flags seguras em produção.
- Requisições mutáveis sem CSRF válido ou Origin permitido são rejeitadas.
- Não existe chave administrativa em localStorage, bundle, HTML ou logs.
- Service worker não armazena respostas `/api`, QR, relatórios ou conteúdo autenticado.
- PWA pode ser instalado no Android e continua exibindo corretamente estado offline.
- Testes automatizados cobrem login, logout, brute-force, CSRF, CORS, autorização por rota e cache.
- Nenhum teste ou build deve conectar ao WhatsApp real nem alterar produção.

## Sequência segura

1. Inventariar endpoints e contratos consumidos pelo painel atual.
2. Implementar autenticação e middleware em branch isolada, mantendo compatibilidade temporária somente onde necessário.
3. Adicionar testes negativos de autorização antes de alterar o painel.
4. Migrar o painel para sessão segura e remover API key do armazenamento do navegador.
5. Implementar manifest, service worker e testes de installability/cache.
6. Validar integração com mocks e ambiente local.
7. Só na fase final, depois de todas as fases e com infraestrutura confirmada, configurar Render/MongoDB e realizar deploy controlado.
8. Gerar o novo QR Code como última operação, após o serviço definitivo estar validado.

## Fora do escopo desta fase

- Alterar Render, MongoDB, discos, variáveis de produção ou serviços ativos.
- Reconectar WhatsApp ou gerar QR Code.
- Mesclar PRs pendentes ou implantar alterações.
- Criar serviços pagos ou contratar planos.
