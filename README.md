# PreçoSmart — Sistema Full-Stack de Comparação de Preços

Sistema completo para cadastro de produtos, monitoramento de cotações em lojas físicas e e-commerces, comparação inteligente de preços e otimização de cestas de compras.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**:
  - **Node.js** com **Express**
  - **SQLite nativo** (`node:sqlite` do Node.js): banco de dados veloz sem necessidade de compilação ou dependências externas
  - Arquitetura RESTful com endpoints para produtos, lojas, cotações, comparação e otimização de compras
- **Frontend**:
  - **React** com **Vite**
  - **Tailwind CSS** para design responsivo e moderno
  - **Lucide Icons**
  - Integração com API via proxy transparente

---

## 🚀 Como Executar

### Opção 1: Inicialização em 1 Clique (Windows)
Basta dar dois cliques no arquivo:
```
iniciar.bat
```

### Opção 2: Pelo Terminal

1. **Backend**:
   ```bash
   cd backend
   npm start
   ```
   *Servidor rodando em: `http://localhost:3001`*

2. **Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```
   *Interface web em: `http://localhost:5173`*

---

## ✨ Principais Funcionalidades

1. **Comparador de Preços em Tempo Real**:
   - Visualização lado a lado de todas as lojas para cada produto.
   - Destaque automático para a loja com o menor preço e etiqueta de "Menor Preço".
   - Cálculo automático da diferença e porcentagem de economia entre a loja mais cara e a mais barata.
   - Filtros por nome, marca e categorias (Eletrônicos, Informática, Alimentos, Eletroportáteis, etc.).

2. **Cesta & Carrinho Inteligente (Algoritmo de Otimização)**:
   - Monte uma lista de compras com múltiplos itens e quantidades.
   - **Cenário 1 (Loja Única)**: descobre qual loja fecha o pedido completo pelo menor valor total.
   - **Cenário 2 (Divisão Inteligente)**: calcula quanto você economiza comprando cada item na sua respectiva loja mais barata.
   - Ranking de lojas ordenado pelo custo total da cesta.

3. **Histórico e Evolução de Preços**:
   - Linha do tempo de todas as cotações passadas registradas para cada produto.
   - Identificação do menor e maior valor histórico.

4. **Gerenciamento Completo**:
   - Cadastro de novos produtos com foto, categoria, marca e código de barras.
   - Cadastro de lojas físicas ou virtuais com cores personalizadas e links diretos.
   - Registro de novas cotações com status de estoque e link da oferta.
