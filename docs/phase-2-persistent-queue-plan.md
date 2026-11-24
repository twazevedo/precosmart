# Fase 2 — fila persistente e execução única

## Estado e limites desta etapa

Esta branch parte da branch `phase-1/stability-and-data-safety` (PR #4). Ela não altera `main`, não publica no Render e não cria serviços novos.

O repositório já contém `whatsapp-bot/db.js`, que conecta ao MongoDB quando `MONGO_URI` existe e, caso contrário, grava arquivos locais. Esse fallback local não é armazenamento durável no filesystem efêmero do Render. A existência do código de integração não comprova que `MONGO_URI` esteja configurada no serviço de produção; isso precisa ser confirmado no painel do Render sem compartilhar o valor do segredo.

## Objetivos técnicos

1. Sobreviver a reinicializações do processo sem perder ofertas pendentes.
2. Garantir um único publicador ativo para a sessão WhatsApp.
3. Impedir que uma oferta em estado ambíguo seja reenviada automaticamente e gere duplicidade.
4. Aplicar tentativas limitadas, backoff e fila de falhas para análise.
5. Expor métricas operacionais sem expor tokens, convites, JIDs privados ou credenciais.

## Modelo proposto para cada item da fila

- `_id`: identificador estável da oferta.
- `dedupeKey`: chave única calculada a partir do identificador canônico do produto/link e da origem.
- `payload`: texto, tipo de mídia e referência de mídia durável (não um Buffer mantido apenas em RAM).
- `status`: `pending`, `processing`, `sent`, `failed` ou `uncertain`.
- `attempts`, `nextAttemptAt`, `createdAt`, `updatedAt`.
- `leaseOwner`, `leaseUntil`: concessão temporária de processamento.

Índices necessários: unicidade de `dedupeKey`, índice de busca por `status + nextAttemptAt` e índice TTL apenas para leases/locks expirados (nunca TTL para apagar histórico de ofertas enviadas).

## Fluxo de publicação

1. Inserir a oferta como `pending` usando operação idempotente.
2. O worker adquire atomicamente o próximo item elegível, mudando-o para `processing` e definindo lease.
3. Antes do envio, confirmar que o processo ainda detém o lease e que o piloto automático está ativo.
4. Enviar ao grupo configurado e registrar o resultado retornado pelo Baileys.
5. Em sucesso, marcar `sent` e gravar identificador da mensagem quando disponível.
6. Em falha comprovadamente anterior ao envio, retornar a `pending` com backoff exponencial e jitter; após o limite, marcar `failed`.
7. Se o processo cair depois de iniciar o envio e antes de persistir a confirmação, marcar `uncertain` para reconciliação. Não reenviar automaticamente um item ambíguo, pois isso pode duplicar a publicação.

## Líder único

Usar lease distribuído no MongoDB, adquirido por operação atômica e renovado periodicamente. O worker só publica enquanto o lease estiver válido. Se perder o lease, interrompe imediatamente novos envios. O TTL do lease deve ser maior que o intervalo de heartbeat e prever pausas temporárias do event loop.

Não iniciar `guardian.js` como segundo serviço Render. O guardião atual pode iniciar/adotar um processo de bot; qualquer adoção ou supervisão futura deve continuar garantindo uma única sessão Baileys e uma única porta de controle.

## Requisito de armazenamento

- Produção: MongoDB configurado e acessível, ou outro armazenamento durável confirmado.
- Desenvolvimento: armazenamento local permitido apenas para testes.
- Se produção não tiver armazenamento durável, o serviço deve falhar de forma explícita ao tentar ativar a fila persistente; não deve declarar sucesso usando fallback em disco efêmero.

## Testes obrigatórios antes de integrar

- Reinício com itens `pending` preserva a fila.
- Duas instâncias concorrentes não adquirem o mesmo item nem publicam simultaneamente.
- Expiração de lease recupera item que ainda não iniciou envio.
- Item em estado ambíguo vira `uncertain` e não é reenviado automaticamente.
- Pausar impede novas aquisições e preserva pendências; retomar reativa o worker.
- Dedupe impede inserção repetida.
- Falha do MongoDB interrompe o modo persistente de produção sem fallback silencioso.
- Testes de integração com MongoDB isolado, além de testes unitários.

## Dependências para concluir a implementação

1. Confirmar no Render se `MONGO_URI` está configurada no serviço atual do bot (não enviar o valor).
2. Confirmar se o serviço atual usa disco persistente para a sessão Baileys; a fila não deve ser confundida com os arquivos de autenticação.
3. Escolher a política para ofertas `uncertain`: revisão manual no painel ou reconciliação com eventos de confirmação do WhatsApp.

## Fora do escopo desta branch

Autenticação administrativa/PWA, alterações no serviço de produção, Blueprint do Render e migração automática de dados. Esses itens permanecem em fases separadas e exigem testes e autorização antes de qualquer deploy.
