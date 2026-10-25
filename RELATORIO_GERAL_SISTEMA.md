# PreçoSmart — Relatório Completo de Configuração & Guia do Administrador

**Data da Atualização:** 25 de Outubro de 2026  
**Status do Sistema:** 🟢 **100% Online, Autônomo e Ativo na Nuvem (Render 24/7)**  
**Repositório GitHub:** `https://github.com/twazevedo/precosmart`  
**Servidor Oficial do Robô:** `https://precosmart-b8pg.onrender.com`

---

## 1. Resumo Executivo das Implementações

Nesta sessão, o sistema PreçoSmart foi completamente profissionalizado e estruturado para rodar de forma **100% autônoma na nuvem**, permitindo que o computador pessoal seja desligado sem interromper os envios ou o controle:

1. **Remoção Completa de Comandos Interativos no WhatsApp:**
   * Todos os comandos de texto (`!ajuda`, `!status`, `!pausar`, `!lojas`, etc.) foram **completamente removidos** do WhatsApp.
   * O robô opera em modo **100% silencioso**: não responde no grupo nem no privado, funcionando exclusivamente como canal de transmissão de ofertas.

2. **Aplicativo Mobile Nativo Android (`PrecoSmart-Admin.apk`):**
   * Desenvolvido e compilado com **Capacitor 7**, **Android SDK 34** e **Java 17**.
   * Interface mobile responsiva em Tailwind CSS com tema escuro (Dark Mode).
   * Controle total do robô sem digitar comandos:
     * ⏯️ **Pausar / Retomar Piloto Automático** com 1 toque.
     * ⚡ **12 Botões de Disparo Imediato por Loja** (Giuliana Flores, Nike, KaBuM!, Mizuno, Stanley, C&A, Clovis, LEGO, LG TV, AliExpress, Olympikus, Qualquer Loja Awin).
     * 📝 **Envio Manual de Oferta VIP** (link + legenda personalizada).
     * 📊 **Monitoramento ao Vivo:** exibe status do WhatsApp (`Thiago`), nome do grupo oficial (`PreçoSmart | Ofertas & Achadinhos 🔥`) e estado dos envios.

3. **Catálogo Awin Ampliado & Integração com Giuliana Flores:**
   * Sincronização executada com sucesso com a API e os feeds da Awin.
   * **12.586 produtos auditados** com fotos Full HD e links de afiliados verificados.
   * Inclusão oficial da **Giuliana Flores** (600 produtos ativos de presentes, cestas e flores).

4. **Motor de Rotação Inteligente Anti-Duplicação no MongoDB:**
   * Eliminado o loop de repetição de ofertas.
   * Cada produto disparado (seja automático ou manual pelo app) tem seu identificador registrado no banco de dados MongoDB (`awinRotationState`).
   * O sistema consulta o histórico antes de cada postagem e **nunca repete o mesmo anúncio** até que todo o catálogo de milhares de produtos daquela marca seja esgotado.

5. **Operação 24/7 Independente na Nuvem (Render):**
   * O estado do piloto automático (`isAutoPilotActive`) é salvo no MongoDB e persistido entre restarts.
   * Sistema de auto-ping (*Keep-Alive*) ativo a cada 9 minutos em `https://precosmart-b8pg.onrender.com/api/status`.
   * **Você pode desligar o seu computador a qualquer momento:** o servidor na nuvem continuará enviando os links e obedecendo aos comandos do seu celular.

---

## 2. Dados de Acesso do Aplicativo Android

* **URL do Bot (Render):**
  ```text
  https://precosmart-b8pg.onrender.com
  ```
* **Chave de Segurança (API Key):**
  ```text
  precosmart_persistent_auth_key_2026_sec
  ```

### Onde baixar o aplicativo:
* **Na sua Área de Trabalho (Windows):** `C:\Users\Thiag\Desktop\PrecoSmart-Admin.apk`
* **Na pasta do projeto:** `C:\Users\Thiag\Documents\GitHub\precosmart\PrecoSmart-Admin.apk`
* **Download direto pelo celular:** [Baixar PrecoSmart-Admin.apk](https://github.com/twazevedo/precosmart/raw/main/PrecoSmart-Admin.apk)

---

## 3. Catálogo de Afiliados Disponível

| Loja / Marca | Qtd. Produtos | Tipo de Rotação |
| :--- | :--- | :--- |
| **KaBuM!** | ~2.500 | Hardware, Games, Periféricos |
| **Giuliana Flores** | 600 | Flores, Cestas, Presentes |
| **Nike Brasil** | ~1.200 | Calçados, Roupas esportivas |
| **Puma** | ~800 | Tênis, Acessórios esportivos |
| **Mizuno** | ~600 | Corrida, Tênis de performance |
| **Stanley** | ~350 | Copos térmicos, Garrafas |
| **C&A** | ~1.400 | Moda feminina, masculina e calçados |
| **Clovis Calçados** | ~1.100 | Calçados casuais e femininos |
| **Olympikus** | ~750 | Tênis nacionais e vestuário |
| **LEGO** | ~400 | Brinquedos e colecionáveis |
| **AliExpress** | ~1.200 | Achadinhos e importados |
| **LG Brasil** | ~300 | Smart TVs, Monitores |
| **Outras Marcas Awin** | ~1.286 | Havaianas, Hope, Decathlon, Drogaria Venâncio |
| **TOTAL GERAL** | **12.586** | **Zero Duplicações (Deduplicação via MongoDB)** |

---

## 4. Endpoints da API Administrativa

* `GET /api/status`: Status público do robô, conexão WhatsApp e grupo.
* `GET /api/autopilot-status`: Verifica se o piloto automático está ativo ou pausado.
* `POST /api/resume`: Liga o piloto automático e retoma as postagens no grupo.
* `POST /api/pause`: Pausa o piloto automático e esvazia a fila.
* `GET /api/trigger-:loja`: Dispara 1 oferta inédita e sem repetição daquela loja (ex: `trigger-giuliana`, `trigger-nike`, `trigger-kabum`, `trigger-mizuno`).
* `POST /api/send-custom`: Posta mensagem ou oferta avulsa no grupo VIP.
