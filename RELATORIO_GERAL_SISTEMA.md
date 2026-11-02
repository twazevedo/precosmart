# PreçoSmart — Relatório Geral do Sistema & Guia do Administrador (v3.2)

**Data da Atualização:** 02 de Novembro de 2026  
**Status do Sistema:** 🟢 **100% Online, Blindado e Ativo 24/7 na Nuvem (Render + UptimeRobot)**  
**Repositório GitHub:** `https://github.com/twazevedo/precosmart` (`PUBLIC`)  
**Servidor Oficial do Robô:** `https://precosmart-b8pg.onrender.com`

---

## 1. Resumo Executivo das Atualizações Recentes

1. **Catálogo Oficial Shopee de 109.585 Produtos (`shopeeCatalog.js` + `shopeeFeedsData.tsv.gz`):**
   * Ingestão de 100% dos dois Datafeeds oficiais da Shopee (`109.585` produtos únicos) compactados em `7,96 MB` e indexados via `Uint32Array` (`1,34 MB` de memória Heap V8).
   * **Curadoria Inteligente B2C:** Prioriza automaticamente os **`21.182` Produtos Ouro** (Nota `>= 4.7` e Desconto `>= 15%`) nas categorias de maior conversão, aplicando selos dinâmicos (*🪙 Menos de R$ 29*, *🚨 Metade do Preço*, *🏆 Campeão de Avaliações 5.0*, cálculo de *💰 Economia em R$* e parcelamento).
   * **Comissão Garantida no App:** Geração automática do deep-link oficial `https://s.shopee.com.br/an_redir?origin_link=...&affiliate_id=18361251220&sub_id=precosmart`.

2. **Encurtamento Automático 301 de Todos os Links (`linkShortener.js`):**
   * Todos os links longos da Shopee, AWIN, Boticário, Magalu e ofertas espelhadas são encurtados automaticamente no momento do disparo via `tidd.ly` (AWIN) e `is.gd` (`HTTP 301 Moved Permanently` direto, sem anúncios).

3. **Sanitização Completa de Textos e Preços (`textSanitizer.js`):**
   * Corrigidos **3.596 textos** com entidades HTML (`&#199;`, `&#237;`, `&amp;`) e **20.694 preços** com prefixo `BRL169.90` (convertidos para `R$ 169,90`) em `awinDealsData.json`, `awinCatalog.js`, `shopeeCatalog.js` e no sincronizador semanal `scripts/awin_feed_sync.js`.

4. **Blindagem de Segurança OWASP ASVS & Zero Vulnerabilidades:**
   * Removidas todas as chaves estáticas do código-fonte e histórico de documentação; autenticação restrita a cabeçalhos HTTP (`X-API-Key` / `Authorization: Bearer`).
   * **19 vulnerabilidades do GitHub Dependabot resolvidas** (`0 vulnerabilities` nos 5 pacotes do repositório).
   * **30/30 testes automatizados aprovados** (`security.test.js`, `professional_audit.test.js`, `mirror.test.js`).

5. **Keep-Alive 24/7 na Nuvem (UptimeRobot):**
   * Monitoramento externo ativo a cada 5 minutos em `https://precosmart-b8pg.onrender.com/api/status`, mantendo o serviço acordado 24/7 gratuitamente no Render sem depender do computador local.

6. **Nova Identidade Visual de Natal & Fim de Ano (`assets/branding/`):**
   * Versões em alta resolução finalizadas no **Adobe Photoshop 2025** (`precosmart_logo_natal_avatar.png`, `precosmart_logo_natal_selo.png` e projeto editável em camadas `precosmart_logo_natal_2025.psd`).

---

## 2. Catálogo Geral de Afiliados (136.114 Produtos)

| Rede / Loja Oficial | Qtd. Produtos | ID / Tag de Afiliado |
| :--- | :--- | :--- |
| **Shopee Brasil (Datafeed Completo)** | **109.585** (`21.182` Curadoria Ouro) | `18361251220` |
| **Catálogo AWIN Multimarcas (KaBuM!, Nike, Giuliana Flores, Stanley, C&A, Clovis, Olympikus, Mizuno, LEGO, LG, AliExpress, Decathlon, Venâncio)** | **26.529** | `2804952` / `3077915` |
| **Mercado Livre Oficial** | **Catálogo + Radar Tempo Real** | `thiago20260327210118` |
| **Amazon Brasil Oficial** | **Catálogo + Radar Tempo Real** | `precosmartapp-20` / `precosmart-20` |
| **Magazine Luiza (Divulgador Autorizado)** | **Catálogo + Cupons Exclusivos** | `magazineprecosmartvip` |
| **Grupo Boticário & Eudora** | **Consultor Autorizado** | `27065696` |
| **TOTAL INTEGRADO** | **136.114 Produtos** | **100% Rastreado com Links Curtos 301** |

---

## 3. Links Curtos Oficiais (Biografia & Mensagem Fixada do Grupo VIP)

* 🛍️ **Shopee (Cupons & Frete Grátis):** `https://is.gd/bCvP0m`
* 💛 **Mercado Livre (Ofertas do Dia):** `https://is.gd/4BEpO7`
* 📦 **Amazon Brasil (Ofertas Relâmpago):** `https://is.gd/gp4hav`
* 💙 **Magalu (Vitrine & Cupons):** `https://is.gd/WaqveD`
* 👟 **Nike Brasil (Outlet Oficial):** `https://is.gd/yiFmNv`
* ⚡ **KaBuM! (Ofertas Ninja):** `https://is.gd/q0LTKA`
* 🌸 **O Boticário (Loja Oficial):** `https://is.gd/Hoec4v`
* 📲 **Convite do Grupo VIP WhatsApp:** `https://chat.whatsapp.com/Lo3ONNfAXVh5cEe2Pg6gM7`
