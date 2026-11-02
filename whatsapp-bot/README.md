# 🤖 PreçoSmart WhatsApp Engine v2.2

Microsserviço 100% autônomo de alta performance para curadoria inteligente de ofertas, encurtamento automático 301 e distribuição multicanal de afiliados no WhatsApp e Telegram.

---

## ⚡ Principais Capacidades (v2.2)

- **Operação 100% Autônoma & Silenciosa:** Comandos de texto via WhatsApp foram totalmente desativados para blindagem absoluta de privacidade. O bot nunca responde conversas pessoais e envia ofertas exclusivamente em grupos autorizados (`@g.us`) e no canal do Telegram.
- **Catálogo Shopee de 109.585 Produtos (`shopeeCatalog.js`):**
  - Armazenado em `shopeeFeedsData.tsv.gz` (`7,96 MB`) e indexado por `Uint32Array` com apenas `1,34 MB` de consumo de Heap V8.
  - **Curadoria Inteligente:** Prioriza automaticamente `21.182` produtos de desejo B2C com **Nota `>= 4.7`** e **Desconto Real `>= 15% OFF`**, gerando selos dinâmicos (*Menos de R$ 29*, *Metade do Preço*, *Campeão de Avaliações 5.0*, *Economia em R$* e parcelamento).
- **Catálogo AWIN & Multimarcas de 26.529 Produtos (`awinCatalog.js`):**
  - Rotação sem repetição persistida no MongoDB (`rotationState.js`) cobrindo KaBuM!, Nike, Giuliana Flores, Stanley, C&A, Clovis Calçados, Olympikus, Mizuno, LEGO, LG, AliExpress, Decathlon, Drogaria Venâncio, O Boticário, Amazon, Mercado Livre e Magalu.
- **Encurtador Automático 301 (`linkShortener.js`):**
  - Integração direta com a API oficial da AWIN (`tidd.ly`) e redirecionamento `HTTP 301` limpo via `is.gd` para todos os links longos da Shopee (`an_redir`), AWIN e lojas parceiras.
- **Sanitizador Universal (`textSanitizer.js`):**
  - Decodifica entidades HTML (`&#199;`, `&amp;`), corrige acentuação UTF-8 e padroniza preços `BRL` para `R$ XX,XX`.
- **Modo Noturno (Quiet Hours):** Pausa silenciosa automática entre `23:30` e `07:30` (horário de Brasília).
- **Persistência MongoDB Atlas + Keep-Alive 24/7:** Sessão Baileys salva no MongoDB e monitoramento contínuo via UptimeRobot em `/api/status`.

---

## 🔐 Segurança da API Administrativa (`security.js`)

Todas as rotas administrativas exigem autenticação via Header HTTP (`X-API-Key` ou `Authorization: Bearer <token>`). Tokens na query string são bloqueados conforme padrão **OWASP ASVS**.

---

## 🚀 Como Executar e Testar

```bash
# 1. Instalar dependências
npm install

# 2. Executar as 3 suítes de testes automatizados (30 testes)
node --test test/security.test.js test/professional_audit.test.js test/mirror.test.js

# 3. Iniciar o servidor
npm start
```
