# FactoryFlow – Sistema de Gestão de Produção

Sistema web completo para gestão de lotes, pedidos, setores de produção e entregas em indústria de tintas.

---

## 📄 Páginas e URIs

| Página | Arquivo | Acesso |
|---|---|---|
| Sistema principal | `index.html` | Todos os roles |
| TV / Painel Kanban | `tv.html` | admin, diretoria, pcp, pcp_lib, manager, tv |
| Painel de Estatísticas (auto-slide) | `tv2.html` | admin, diretoria, pcp, pcp_lib, manager, tv |
| App motorista (mobile) | `driver.html` | driver |

---

## 🔐 Segurança – Versão 5.0

### Hash de Senhas (FNV-1a + salt)
- Senhas **nunca** são armazenadas em texto simples
- Algoritmo: **FNV-1a 32-bit com salt aleatório de 16 chars hex + 4 rounds**
- Formato armazenado: `<salt>:<hash>` (ex.: `a3f1b2c4d5e6f700:8a3b2c1d`)
- **Migração automática**: ao logar com senha legada (texto puro), o sistema re-hasha automaticamente
- Ao criar ou editar usuário pelo formulário, a senha é hasheada antes de salvar
- O campo de senha no formulário de edição **nunca exibe o hash** — deixe em branco para não alterar

### Sessão Apenas em Memória
- **Sem sessionStorage / sem cookies** para dados de autenticação
- A sessão vive exclusivamente em `STATE.currentUser` (variável JS em memória)
- F5 / reload exige novo login — comportamento esperado por design
- `localStorage` é usado **somente** para preferência de tema (dado não sensível)
- Sessões legadas em `sessionStorage` são limpas silenciosamente

### Sanitização XSS
- Função `escapeHtml()` / `esc()` aplicada em **todas as saídas HTML** que recebem dados do servidor:
  - Nomes de clientes, lotes, motoristas, usuários
  - Histórico de ações, notas, observações
  - Cidades, endereços, pinturas, login
- Arquivos afetados: `data.js`, `lots.js`, `dashboard.js`, `deliveries.js`, `tv2.html`

### Role `diretoria`
- Novo role: **Diretoria** — administrador sem função de reset de lotes
- Permissões iguais ao admin **exceto**: não vê e não acessa o botão "Resetar Lotes"
- Botão "Resetar Lotes" (`btnResetLots`) é **exclusivo do role `admin`**
- `diretoria` tem acesso a todas as páginas exceto "Usuários" e "Importar Pedidos"

---

## 👤 Roles e Permissões

| Role | Label | Acesso |
|---|---|---|
| `admin` | Administrador | Total, incluindo resetar lotes e gerenciar usuários |
| `diretoria` | Diretoria | Igual ao admin, **sem** reset de lotes |
| `pcp` | PCP | Criar/gerenciar lotes, pedidos, entregas |
| `pcp_lib` | PCP (Liberação) | Setores de revisão/liberação |
| `manager` | Gerente | Amplo acesso, sem editar usuários |
| `sector` | Usuário de Setor | Apenas setor atribuído |
| `driver` | Motorista | App de entrega mobile |
| `viewer` | Visualizador | Dashboards e relatórios |
| `tv` | TV / Painel | Somente visualização TV |

---

## 📊 tv2.html – Painel de Estatísticas (REFORMULADO)

O `tv2.html` foi **completamente reconstruído**. Não exibe mais o Kanban.

### Slides automáticos (a cada 10 segundos)
1. **Visão Geral** – 6 KPIs principais + gráfico de barras por setor + donut de prioridades
2. **Tempos por Setor** – barras de trabalhado/pausado/aguardando + grid de eficiência %
3. **Alertas e Urgentes** – lotes mesmo-dia/urgentes + alertas de lotes parados >2h
4. **Fluxo de Produção** – gráfico de lotes por setor + tabela de ocupação
5. **Entregas e Rotas** – rotas ativas com progresso + lotes prontos para entrega
6. **Top Clientes e Cidades** – ranking de clientes + cidades + tipos de produto
7. **Eficiência Geral** – KPIs de taxa de entrega/trabalho/atraso + anéis de progresso SVG
8. **🆕 Reprovações** – total reprovados, taxa de reprovação, setor que mais reprova, últimas reprovações, gráfico de reprovações por setor

### Funcionalidades do novo tv2.html
- Fundo animado (nebula + grid drift + scanlines)
- Barra de progresso temporal por slide
- Auto-refresh dos dados a cada 10 segundos
- Sanitização XSS em todos os dados exibidos
- Hash FNV-1a para autenticação (sem sessionStorage)
- Acesso: admin, diretoria, pcp, pcp_lib, manager, tv

---

## ⚙️ Limites de API

| Tabela | Limit |
|---|---|
| `ff_users` | 500 (limite máximo da plataforma) |
| `ff_lots` | 500 |
| `ff_orders` | 500 |
| `ff_routes` | 500 |

> **Nota (v5.1):** O limite foi revertido para 500 em todos os endpoints após identificar que `limit=2000` causava erro HTTP 422 na API da plataforma. Isso corrigiu o erro de login "GET ff_users falhou: 422".

---

## 🗄️ Banco de Dados

### `ff_users`
| Campo | Tipo | Descrição |
|---|---|---|
| id | text | UUID único |
| name | text | Nome completo |
| login | text | Login único |
| password | text | **Hash FNV-1a + salt** (formato `salt:hash`) |
| role | text | admin, diretoria, pcp, pcp_lib, manager, sector, driver, viewer, tv |
| sector | text | Setor atribuído (só para role=sector) |
| theme | text | dark \| light |

### `ff_lots`
| Campo | Tipo | Descrição |
|---|---|---|
| id | text | UUID |
| number | text | Número do lote |
| orderId | text | ID do pedido pai |
| client | text | Nome do cliente |
| paint | text | Tinta/produto |
| productType | text | tinta \| diluente \| endurecedor \| base |
| qty | number | Quantidade |
| unit | text | Kg, L, etc. |
| priority | text | normal \| urgent \| sameday |
| deliveryDate | text | Data ISO |
| sector | text | Setor atual |
| lotStatus | text | idle \| working \| paused \| rejected |
| rejected | bool | true quando lote é reprovado (some do Kanban) |
| rejectedAt | number | Timestamp da reprovação |
| rejectedBy | text | Nome do operador que reprovou |
| rejectedById | text | ID do operador |
| rejectedSector | text | Setor onde foi reprovado |
| rejectedReason | text | Justificativa da reprovação |
| sectorEnteredAt | number | Timestamp de entrada no setor atual |
| workSessions | rich_text | JSON array de sessões de trabalho |
| history | rich_text | JSON array de histórico de movimentações |

### `ff_orders`
Pedidos com múltiplos lotes. Campos: id, number, client, city, address, deliveryDate, priority, status, lotIds (JSON).

### `ff_routes`
Rotas de entrega. Campos: id, driverId, driverName, status, departureTime, lots (JSON com sequência e status).

---

## 🗂️ Estrutura de Arquivos

```
index.html          ← App principal
tv.html             ← Painel TV Kanban (tempo real)
tv2.html            ← Painel de Estatísticas (slides automáticos)
driver.html         ← App mobile para motoristas
css/style.css       ← Estilos globais
js/
  data.js           ← Estado global, API helpers, hash, escapeHtml, MySQL Bridge helpers
  auth.js           ← Login (hash FNV-1a), sessão em memória, PAGE_MAP, Bridge config modal
  app.js            ← Auto-update, tema
  lots.js           ← Cards de lotes/pedidos, modais (XSS protegido)
  kanban.js         ← Quadro Kanban (inclui badge ERP para lotes MySQL)
  deliveries.js     ← Entregas, motoristas, gerenciar usuários (hash ao criar/editar)
  dashboard.js      ← Dashboards, painel geral (XSS protegido)
  reports.js        ← Relatórios com KPIs de tempo
  ui.js             ← Helpers UI (showToast, etc.)
backend/
  server.js         ← Express API + inicialização do loop de sync
  sync.js           ← Lógica de sync MySQL empresa → producao_lotes
  db.js             ← Pools de conexão (banco empresa + banco local)
  setup.js          ← Cria a tabela producao_lotes (executar 1x)
  package.json      ← Dependências npm
  .env.example      ← Modelo de variáveis de ambiente (NUNCA comitar .env com senha real)
  README_BACKEND.md ← Instruções completas de instalação e uso
```

---

## 🔄 Últimas Atualizações (v5.0 – Abril 2026)

- ✅ **Hash de senhas FNV-1a + salt** – sem mais senhas em texto puro
- ✅ **Sessão apenas em memória** – removido sessionStorage de autenticação
- ✅ **Sanitização XSS** – `escapeHtml()` em todas saídas HTML com dados do servidor
- ✅ **Role `diretoria`** – admin sem função de resetar lotes
- ✅ **Botão "Resetar Lotes" exclusivo para `admin`**
- ✅ **Limite de API elevado para 2000** em todos os endpoints
- ✅ **tv2.html reconstruído** – 8 slides de estatísticas com auto-rotação, sem kanban
- ✅ **Migração automática de senhas** legadas ao logar

---

## 🔄 Últimas Atualizações (v5.1 – Abril 2026)

- ✅ **Corrigido erro 422 no login** – `limit=2000` causava erro na API; revertido para 500
- ✅ **Botão "Reprovar Lote" no Kanban** – em todos os lotes, para todos os setores
  - Modal de justificativa (mín. 10 caracteres)
  - Modal de confirmação antes de reprovar definitivamente
  - Lote reprovado desaparece do Kanban e não avança para nenhum setor
- ✅ **Histórico de reprovação** – setor, motivo, responsável e timestamp registrados
- ✅ **Indicadores de reprovação**:
  - Dashboard principal: card "Reprovados" + banner com setor campeão
  - Relatórios: seção dedicada com tabela completa + ranking de setores + gráfico de barras
  - TV Ultra-3D (tv2.html): **Slide 8 – Reprovações** com KPIs, gráfico e lista recente
  - Bottom bar do TV: chip de reprovados (em vermelho)
- ✅ **Sincronização em tempo real** – auto-update a cada 8 s (app) e 10 s (TV); mudanças em um computador aparecem automaticamente nos outros sem reload

---

## 🔄 Últimas Atualizações (v5.2 – Abril 2026)

- ✅ **Migração de senhas** – página Usuários mostra indicador `🔒 Hash` / `🔓 Exposta` por usuário + banner + botão "Migrar Senhas" com 1 clique
- ✅ **Bug de rotação de slides corrigido (TV Ultra-3D)** – `setInterval` agora chama `refreshData()` que atualiza só o slide ativo sem resetar o carrossel
- ✅ **Usuário TV dedicado**: `tv_painel` / `tv2025` (role `tv`) criado no banco
- ✅ **Acesso rápido na tela de login do TV** – botão de 1 clique sem digitar credenciais
- ✅ **Re-hash automático no login TV** – senhas legadas migradas para FNV-1a + salt

---

## 🔄 Últimas Atualizações (v5.3 – Abril 2026)

### 🏭 Integração MySQL ERP (Backend Node.js)

- ✅ **Backend Node.js criado** – pasta `backend/` com 6 arquivos prontos para download e deploy
- ✅ **Sincronização automática a cada 10 s** – lê `cli_pedidos_itens JOIN cli_clientes` do MySQL da empresa e insere novos lotes em `producao_lotes` (local)
- ✅ **Chave de unicidade `pits_numero + pits_op`** – novos lotes nunca sobrescrevem atualizações locais
- ✅ **API REST exposta pelo backend**:
  - `GET  /api/producao` – lista lotes (filtros: status, setor, search, limit, offset)
  - `GET  /api/producao/:id` – detalhe do lote
  - `PATCH /api/producao/:id` – atualiza status/setor
  - `POST /api/sync/run` – dispara sync manual
  - `GET  /api/sync/status` – estatísticas da sincronização
  - `GET  /health` – health check
- ✅ **Credenciais protegidas via `.env`** – `.env.example` fornecido sem dados reais; `backend/.env` nunca deve ser commitado
- ✅ **Frontend integrado ao bridge**:
  - Lotes do ERP aparecem no **Kanban** com badge azul `🗄 ERP` + borda esquerda azul
  - Badge **OP xxx** exibido para identificar a Ordem de Produção
  - Chip **"ERP · N lotes"** no header do Kanban
  - Chip de status do bridge na **sidebar** (verde=online, vermelho=erro, cinza=desconectado)
  - **Modal de configuração** acessível pelo chip da sidebar: campo URL, botões "Testar", "Sync manual", "Desconectar"
  - URL do bridge salva em `localStorage` e restaurada a cada login
  - Auto-reload dos lotes MySQL junto com o polling de 8 s do FactoryFlow
  - Lotes rejeitados (`status=rejeitado`) são filtrados fora do Kanban

### Como ativar a integração ERP no frontend

1. Suba o backend em um servidor com Node.js ≥ 18 (ver `backend/README_BACKEND.md`)
2. Faça login no FactoryFlow com role `admin`, `pcp`, `manager` ou `diretoria`
3. Na sidebar, clique no chip **"ERP Desconectado"** (rodapé)
4. Cole a URL do backend (ex: `http://192.168.1.100:3001`) e clique **Aplicar**
5. Clique **Testar conexão** – se verde, os lotes do ERP aparecem no Kanban imediatamente

---

## 📺 Usuário TV Dedicado

| Campo | Valor |
|---|---|
| Login | `tv_painel` |
| Senha | `tv2025` |
| Role | `tv` |
| Acesso | Apenas `tv2.html` (Painel Ultra-3D) |

- A tela de login do `tv2.html` tem botão **"Abrir Painel TV"** (acesso em 1 clique)
- A senha é convertida para hash FNV-1a + salt automaticamente no primeiro login
- O role `tv` não tem acesso ao sistema principal (`index.html`)

---

## ⛔ Reprovação de Lotes

### Fluxo de reprovação
1. Operador clica em **"Reprovar"** no card do lote no Kanban
2. Abre-se o modal de **Justificativa** (texto com ≥ 10 chars obrigatório)
3. Abre-se o modal de **Confirmação** com resumo do lote e aviso de ação irreversível
4. Ao confirmar: lote é marcado com `rejected=true`, `lotStatus='rejected'`, setor registrado
5. O lote **desaparece do Kanban** e não é mais exibido na produção ativa
6. O histórico registra: `⛔ LOTE REPROVADO no setor X – Motivo: ...`

### Quem pode reprovar
- Operadores do setor correspondente (`role=sector`)
- admin, diretoria, pcp, pcp_lib, manager

### Indicadores disponíveis
| Localização | Indicador |
|---|---|
| Dashboard | Card "Reprovados" + banner setor campeão |
| Relatórios | Tabela completa + ranking + gráfico por setor |
| TV Ultra-3D | Slide 8 com KPIs + gráfico + lista recente |
| TV bottom bar | Chip vermelho com total de reprovados |

---

## 🔄 Últimas Atualizações (v5.4 – Abril 2026)

### 📥 Aba "Pedidos Novos" (ERP → FactoryFlow)

- ✅ **Nova aba "Pedidos Novos"** – visível para admin, diretoria, pcp, pcp_lib, manager
- ✅ **Integração com API externa** – `GET https://app-producao-backend-production.up.railway.app/api/pedidos?limit=100`
- ✅ **Grid de cards** com número do pedido, cliente, data de entrega, total de itens/OPs, quantidade total e chip de status (Novo / Liberado)
- ✅ **Busca em tempo real** – filtra cards por cliente, número ou produto
- ✅ **Modal de classificação** – ao clicar em "Classificar / Liberar":
  - Busca detalhes via `GET /api/pedidos/{numero}`
  - Exibe cada item/OP com seletores de **tipo de produto** (tinta/diluente/base/endurecedor) e **prioridade** (normal/urgente/mesmo dia)
  - Itens duplicados detectados e marcados com aviso
- ✅ **Liberação para o fluxo** – cria lotes em `coloracao_revisao` com todos os campos (OP, orderNumber, client, productCode, paint, productType, qty, unit, priority, sector, lotStatus, sectorEnteredAt, history)
- ✅ **Criação de pedido interno** via `apiCreateOrder` com `status=in_production`
- ✅ **Guarda anti-duplicidade** – verifica `STATE.lots` (por OP/número) e `STATE.orders` antes de criar; itens já existentes são ignorados
- ✅ **Tratamento de API offline** – timeout de 10 s; mensagem "API indisponível" com botão "Tentar novamente"
- ✅ **XSS** – todos os dados da API passam por `escapeHtml()` antes de inserção no DOM
- ✅ **Arquivo**: `js/pedidos-novos.js`

---

## 🔄 Últimas Atualizações (v5.5 – Abril 2026)

### 📅 Programação de Entregas

- ✅ **Nova aba "Programação de Entregas"** – visível a **todos os roles** (admin, diretoria, pcp, pcp_lib, manager, sector, viewer)
- ✅ **Calendário mensal** com grid 7×N:
  - Dia atual destacado em azul com ponto indicador
  - Células com lotes mostram contagem + pontos de urgência (amarelo) e atraso (vermelho)
  - Navegação por mês (← →) + botão "Hoje"
  - Borda vermelha esquerda em dias com lotes atrasados
- ✅ **Painel lateral** – ao clicar num dia:
  - Lista todos os lotes do dia (ordenados por prioridade)
  - Cada linha exibe: Nº lote, Nº pedido, cliente, produto, tipo, setor atual, status (badge colorido), cidade
  - Chips "Hoje" / "Passado" no header do painel
- ✅ **Edição de data de entrega** (somente admin e pcp):
  - Botão de lápis por lote; abre seletor de data inline
  - Salva `deliveryDateManual` no lote (prioridade sobre `deliveryDate`)
  - Atualiza `deliveryDate` do pedido relacionado (se existir)
  - Registra no histórico: `"Data de entrega alterada manualmente para DD/MM/AAAA"`
  - Chip laranja `✏️` indica datas editadas manualmente
- ✅ **Arquivo**: `js/programacao-entregas.js`

### ⚗️ Ajustes de Fluxo de Produto

- ✅ **Diluente** – Fluxo ajustado: `PCP (Liberação) → Envase → Pronto` (sem Pesagem, Produção, Coloração ou Laboratório)
- ✅ **Endurecedor** – Fluxo dinâmico em `pcp_liberacao`:
  - PCP escolhe entre **Pesagem** (fluxo: Pesagem → Produção → Envase → Pronto) ou **Direto para Envase** (PCP → Envase → Pronto)
  - Escolha feita via radio buttons no modal "Enviar para Próximo Setor"
  - A escolha fica registrada nos campos `endurecedorRoute` / `destinoEndurecedor` do lote
  - Em `Produção`, endurecedor vai direto para `Envase` (não passa por Coloração/Laboratório)
- ✅ **Hints de fluxo corrigidos** no modal "Novo Pedido" para refletir os fluxos reais de diluente e endurecedor
- ✅ **`PRODUCT_FLOWS`** e `getNextSectorOptions` em `data.js` já cobrem todos os casos corretamente

---

## 🗺️ Mapa de Páginas (PAGE_MAP atual)

| Chave | Label | Ícone | Roles com acesso |
|---|---|---|---|
| `dashboard` | Dashboard | tachometer-alt | admin, diretoria, pcp, pcp_lib, manager, sector, viewer |
| `kanban` | Kanban | columns | admin, diretoria, pcp, pcp_lib, manager, sector |
| `lots` | Lotes | boxes | admin, diretoria, pcp, pcp_lib, manager, sector |
| `orders` | Pedidos | clipboard-list | admin, diretoria, pcp, pcp_lib, manager |
| `deliveries` | Entregas | truck | admin, diretoria, pcp, manager |
| `drivers` | Motoristas | id-card | admin, diretoria, pcp, manager |
| `factory` | Painel Geral | industry | admin, diretoria, pcp, manager |
| `reports` | Relatórios | chart-bar | admin, diretoria, pcp, pcp_lib, manager, viewer |
| `import` | Importar Pedidos | file-import | admin, pcp |
| `pedidos_novos` | Pedidos Novos | inbox | admin, diretoria, pcp, pcp_lib, manager |
| `programacao_entregas` | Programação de Entregas | calendar-alt | **todos** (admin, diretoria, pcp, pcp_lib, manager, sector, viewer) |
| `users` | Usuários | users-cog | admin |

---

## 🔁 Fluxos de Produção por Tipo

| Tipo | Fluxo |
|---|---|
| **Tinta** | Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → Pesagem → Produção → Coloração → Laboratório → Envase → Pronto |
| **Diluente** | Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → Envase → Pronto |
| **Endurecedor (via Pesagem)** | Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → Pesagem → Produção → Envase → Pronto |
| **Endurecedor (direto)** | Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → Envase → Pronto |
| **Base** | Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → Pesagem → Produção → Laboratório → Envase → Pronto |

> A escolha de fluxo para **Endurecedor** ocorre no modal de avanço em `pcp_liberacao` — o PCP seleciona "Pesagem" ou "Direto para Envase" via radio buttons.

---

## 🔄 Últimas Atualizações (v5.6 – Maio 2026)

### 👷 Tela "Meu Setor" – Interface do Operador

- ✅ **Nova aba "Meu Setor"** – visível exclusivamente para role `sector`
- ✅ **Filtro automático de lotes**: exibe apenas os lotes do setor atribuído ao usuário logado (via `getSectorVisibility(user.sector)`) – sem lotes reprovados
- ✅ **Header informativo** com:
  - Nome do setor (colorido conforme `SECTOR_COLORS`) e nome do operador
  - KPIs em tempo real: Total, Trabalhando, Pausado, Aguardando, Urgentes e Atrasados
  - Botão "Atualizar" manual
- ✅ **Grid responsivo de cards** lado a lado (auto-fill `minmax(300px, 1fr)`)
- ✅ **Cada card exibe**:
  - Barra de prioridade colorida no topo (verde/amarelo/vermelho)
  - Número do lote + badge OP (quando presente)
  - Badges de prioridade e status (Aguardando / Em Produção / Pausado)
  - Setor atual em destaque
  - Cliente, tipo de produto (badge colorido), nome do produto
  - Quantidade com unidade
  - Número do pedido (quando há)
  - Data de entrega com chips "ATRASADO" / "HOJE" + indicador de edição manual
  - Cronômetro ao vivo (atualiza a cada 10 s sem re-render completo) + barra visual Trabalhado/Pausado/Ocioso
- ✅ **Botões de ação por card**:
  - **Iniciar / Retomar** (verde) – inicia uma sessão de trabalho, fecha sessões abertas acidentalmente
  - **Pausar** (amarelo) – abre o modal de pausa existente (`openPauseModal`)
  - **Avançar** (azul) – abre modal `openSendSector` com próximos setores possíveis
  - **Detalhes** (cinza) – abre `openLotDetail` com histórico e sessões completas
  - **Reprovar** (vermelho) – abre `openRejectModal` para reprovação com justificativa
- ✅ **Estado vazio** – mensagem amigável quando o setor não tem lotes
- ✅ **Auto-refresh integrado** – o polling geral de 5 s do `app.js` chama `renderMeuSetor()` silenciosamente quando esta tela está ativa
- ✅ **Ticker de cronômetro** – atualiza somente os valores de tempo nos cards (sem re-render completo da grade), parando automaticamente quando a tela sai de foco
- ✅ **Arquivo**: `js/meu-setor.js`

### 🐛 Correção: `confirmPauseLot` com página ativa

- ✅ **Bug corrigido em `kanban.js`**: `confirmPauseLot()` agora verifica a página ativa antes de chamar `renderKanban()`. Se a página ativa for `meu_setor`, chama `renderMeuSetor()` em vez do Kanban — garantindo que o operador veja o resultado da pausa sem sair da sua tela.
- ✅ **Removido monkey-patch** de `confirmPauseLot` do `meu-setor.js` (era sobreescrito pelo `kanban.js` por ordem de carregamento); toda a lógica agora vive no local correto.

### 🗺️ PAGE_MAP atualizado

| Chave | Label | Ícone | Roles com acesso |
|---|---|---|---|
| `meu_setor` | Meu Setor | hard-hat | **sector** (exclusivo) |

> O operador de setor vê no sidebar apenas as abas relevantes para ele: **Dashboard**, **Kanban**, **Lotes**, **Programação de Entregas** e **Meu Setor**.

---

## 🔄 Últimas Atualizações (v5.7 – Maio 2026)

### ⏱ Relatório de Tempos

**Nova aba completa de análise de tempos por setor por lote.**

#### Aba no menu lateral
- ✅ **Nova aba "Relatório de Tempos"** – visível para roles: `admin`, `diretoria`, `pcp`, `pcp_lib`, `manager`
- ✅ Chave no `PAGE_MAP`: `relatorio_tempos` | ícone: `fas fa-clock`
- ✅ **Carregamento sob demanda** – a página só renderiza quando o usuário clica na aba; nunca impacta o Kanban
- ✅ `_silentRefresh('relatorio_tempos')` é um no-op intencional – evita auto-refresh de dados pesados
- ✅ `pageRelatorioTempos` div adicionada ao `index.html`; script `js/relatorio-tempos.js?v=1` também adicionado

#### Filtros
| Campo | Descrição |
|---|---|
| Código do Produto | Multi-prefixo por vírgula (`127`, `127, 190`, `034.007`) |
| Nome do Produto | Busca parcial (case-insensitive) |
| OP/Lote | Número do lote ou OP |
| Pedido | Número do pedido |
| Cliente | Busca parcial |
| Data Inicial / Final | Filtro por faixa de datas |
| Setor | Setor específico da cadeia produtiva |

#### Cards de Resumo (5 KPIs)
- Total de linhas | Total trabalhado | Total pausado | Total ocioso | Eficiência média

#### Tabela (16 colunas, scroll horizontal)
OP/Lote · Pedido · Código Produto · Nome Produto · Cliente · Quantidade · Linha · Setor · Data Entrada · Data Saída · Tempo Total · Tempo Trabalhado · Tempo Pausado · Tempo Ocioso · Eficiência % · Status

#### Integração com Backend
- ✅ `loadRelatorioTempos()` tenta primeiro `GET /api/producao/relatorio-tempos` (backend ainda não criado)
- ✅ Se backend retornar 404 ou falhar: fallback automático para dados locais em `STATE.lots`
- ✅ Banner amarelo `rt-backend-notice` informa o usuário sobre a integração pendente (ocultado automaticamente quando o backend responder com sucesso)
- ⏳ **Endpoint backend ainda não implementado** — aguarda criação futura

#### Exportação
- ✅ `exportRelatorioTemposExcel()` – gera planilha via tabela HTML reconhecida pelo Excel (`.xls`), sem depender de biblioteca externa; não precisa de fallback
- ✅ `exportRelatorioTemposPDF()` – usa **jsPDF + autoTable**; se a biblioteca não estiver disponível ou a geração falhar, aciona `exportRelatorioTemposCSV()` como fallback real (download de CSV simples). Nunca usa `window.print()`

#### Melhoria no Modal de Lote – Seção "Tempos por Setor"
- ✅ `renderLotSectorTimesHistory(lot)` injetado em `js/lots.js` dentro de `openLotDetail()`
- ✅ Seção aparece **abaixo** da linha do tempo existente (não substitui nenhum histórico)
- ✅ Cada setor exibe: nome, entrada, saída, tempo total, trabalhado, pausado, ocioso, eficiência %, mini-barra visual e lista de pausas com motivo
- ✅ Setor atual marcado com dot verde animado + badge "Em Andamento"
- ✅ Injeção protegida por `typeof renderLotSectorTimesHistory === 'function'` – zero risco se o script falhar ao carregar

#### Indicador Visual de Tempo no Kanban
- ✅ `buildKanbanCard()` em `js/kanban.js` exibe chip discreto **"No setor há: Xh Ymin"** em cada card
- ✅ Três níveis visuais:
  - 🟢 `rt-sector-time-normal` — até 4h (< 14.400.000 ms) — verde sutil
  - 🟡 `rt-sector-time-attention` — entre 4h e 8h — amarelo pulsante
  - 🔴 `rt-sector-time-critical` — acima de 8h (> 28.800.000 ms) — vermelho com glow
- ✅ Não exibido se tempo < 1 min (evita poluição visual em lotes recém-chegados)
- ✅ Protegido por `try/catch` – nunca quebra o card em caso de erro

---

### 🛠 Funções Criadas em `js/relatorio-tempos.js`

| Função | Descrição |
|---|---|
| `safeParseJson(value, fallback)` | Parser seguro; aceita string/array/objeto; nunca lança exceção |
| `rtFormatMs(ms)` | Formata milissegundos → `"1h 21min"`, `"45min"`, `"–"` |
| `rtFormatDateTime(ts)` | Formata timestamp → `"21/05/2026 09:14"` |
| `getLotSectorMetrics(lot)` | Lê `sectorMetrics` ou `ff_sectorMetrics` do lote |
| `getLotPauseReasons(lot)` | Extrai `workSessions` com `pauseReason` |
| `calculateSectorTimesFromLot(lot)` | Reconstrói linha do tempo por setor a partir de `history` + `workSessions` |
| `getCurrentSectorElapsedTime(lot)` | Retorna ms decorridos no setor atual |
| `renderLotSectorTimesHistory(lot)` | Retorna HTML da seção "Tempos por Setor" para o modal |
| `renderRelatorioTempos()` | Renderiza a página completa em `#pageRelatorioTempos` |
| `loadRelatorioTempos()` | Tenta backend; fallback para dados locais |
| `_rtFetchBackend()` | `GET /api/producao/relatorio-tempos`; retorna `null` em 404/offline |
| `renderRelatorioTemposSummary(rows)` | Preenche `#rtSummaryArea` com 5 KPI cards |
| `renderRelatorioTemposTable(rows)` | Preenche `#rtTableArea` com tabela de 16 colunas + linha de TOTAIS GERAIS |
| `_rtCalculateTotals(rows)` | Soma total/worked/paused/idle de linhas normalizadas (suporta ms e strings formatadas) |
| `_rtNormalizeRow(r)` | Normaliza linha backend/local; valida timestamps (exitAt > enteredAt) |
| `exportRelatorioTemposExcel()` | Exporta XLSX sem coluna Status; pivot por OP/lote; freeze + autofilter |
| `exportRelatorioTemposPDF()` | Exporta PDF com resumo geral no topo; tabela limpa com colunas essenciais |
| `buildRelatorioTemposPivotRows(rows)` | Agrupa por OP/lote em 1 linha com 14 colunas de setores |
| `_rtSyncFilters()` | Sincroniza inputs DOM → `_rtFilters` |
| `_rtApplyFilters(rows)` | Aplica todos os filtros incluindo multi-prefixo de código |
| `rtClearFilters()` | Limpa filtros e re-renderiza |

> **Prefixo `rt`**: todas as funções e variáveis deste módulo usam o prefixo `rt` para evitar colisão com `formatMs()` e outras funções já existentes em `data.js`.

---

## 🆕 Atualizações v7.0 – Maio 2026 (Session D – Correções Completas)

### ✅ 1. Fix de Timestamps Impossíveis (saída < entrada)
- `_rtNormalizeRow()` agora valida `exitAt > enteredAt`; se inválido: zera todos os cálculos derivados e marca `_tsValid = false`
- `calculateSectorTimesFromLot()` ordena o histórico por timestamp antes de processar; ignora transições com ordem inválida
- Na tabela: linhas com timestamp inválido exibem ícone de aviso em laranja em vez de data corrompida
- Nos exports: timestamps inválidos ficam vazios, sem datas impossíveis

### ✅ 2. Totais Gerais na Tabela do Relatório
- Linha extra no rodapé da tabela somando **Total · Trabalhado · Pausado · Ocioso** de todos os registros visíveis
- Respeita filtros: se o usuário filtrou por produto/cliente/OP, a soma é só dos registros filtrados
- `_rtCalculateTotals(rows)` suporta valores em ms (número) e strings formatadas (`"3h"`, `"< 1min"`, `"2h 8min"`, `"–"`)
- Resultado exibido como `"7h 35min"` no formato padrão `rtFormatMs`

### ✅ 3. Auto-update do Kanban ao Avançar Lote
- `confirmSendToSector()` em `lots.js` agora:
  1. Renderiza imediatamente com dados em memória (sem flicker, sem perda de filtro)
  2. 800ms depois: `reloadData()` em background + re-renderiza tela ativa
- Outros usuários com o sistema aberto recebem a atualização no próximo ciclo de polling (20s no Kanban)
- Sem duplicação de cards, sem piscar tela, sem perda de modal aberto (`isModalOrEditingActive()` protege)

### ✅ 4–6. Sistema de Alertas de Expediente (`js/expediente-alerts.js`)

**Novo arquivo criado: `js/expediente-alerts.js`**

#### Horários configurados:
| Horário | Mensagem | Condição |
|---|---|---|
| 07:10 | ABRIR EXPEDIENTE | Sempre |
| 11:25 | HORÁRIO DE ALMOÇO EM BREVE | Só se expediente **aberto** |
| 13:05 | REABRIR EXPEDIENTE | Só se expediente **fechado** |
| 17:25 | ENCERRAR EXPEDIENTE | Sempre (dias normais) |
| 16:25 | ENCERRAR EXPEDIENTE | Apenas sexta-feira |
| 15:20 | ENCERRAR EXPEDIENTE | Última sexta-feira do mês |

#### Modal de alerta:
- Tela inteira com overlay escurecido + blur
- Modal grande centralizado com ícone colorido por tipo
- Só pode ser fechado clicando em **"Entendi — Fechar aviso"**
- Animação de entrada suave

#### Anti-duplicata (localStorage):
- Chave por usuário/dia/horário: `ff_alerta_expediente_YYYY-MM-DD_HHMM`
- Cada alerta aparece **no máximo 1 vez por dia** por slot de horário
- Reseta automaticamente no dia seguinte

#### Botão admin "Encerrar expediente geral":
- Visível apenas para roles: `admin`, `manager`, `gerente`, `diretoria`
- Injetado automaticamente na sidebar após login
- Pede confirmação antes de executar
- Chama `POST /api/expediente/encerrar-geral` (backend); fallback local via `sectorShifts`
- Exibe toast de sucesso + recarrega tela

### ✅ 7. Cálculo Correto de Tempos
- `calculateSectorTimesFromLot()` reescrito:
  - `totalMs = exitAt - enteredAt` (nunca negativo)
  - Sessions clippadas dentro do intervalo do setor (evita overlap)
  - `workedMs` e `pausedMs` caps: nunca ultrapassam `totalMs`
  - `idleMs = totalMs - workedMs - pausedMs` (sempre ≥ 0)
  - Sessões com `end < start` ignoradas
  - Lote em andamento: usa `Date.now()` como saída provisória

### ✅ 8. Excel sem Coluna Status
- `exportRelatorioTemposExcel()` exclui `'Status Atual'` e `'_resumoSetores'` das colunas
- Colunas exportadas: OP/Lote, Pedido, Código, Nome, Cliente, Qtd, Linha, Setor Atual, Total Geral, Trabalhado, Pausado, Ocioso, Eficiência, + colunas por setor (Entrada/Saída/Total/Trabalhado/Pausado/Ocioso/Efic.%)
- Freeze linha 1, autofilter, larguras ajustadas

### ✅ 9. PDF Mais Limpo com Resumo Geral
- `exportRelatorioTemposPDF()` reformulado:
  - **Caixa de resumo geral no topo** (fundo azul): Total · Trabalhado · Pausado · Ocioso · Eficiência Média
  - Tabela por OP/lote com 10 colunas essenciais: OP/Lote, Código, Produto, Cliente, Setor Atual, Total, Trabalhado, Pausado, Ocioso, Efic.%
  - Eficiência colorida por faixa (verde/amarelo/vermelho)
  - Rodapé com número de página
  - `doc.save()` direto, nunca `window.print()`

### ✅ 10. Dados Históricos Quebrados
- Histórico ordenado por timestamp antes de processar transições
- Transições com `exitAt ≤ enteredAt` descartadas silenciosamente
- Registros com `_broken: true` exibem `–` em vez de calcular números falsos
- Nenhum `console.error` para dados antigos — apenas `console.warn`

### 📂 Arquivos Modificados em v7.0

| Arquivo | Tipo | O que mudou |
|---|---|---|
| `js/relatorio-tempos.js` | **modificado** (v7.0) | Fix timestamps, totais na tabela, Excel sem Status, PDF com resumo, cálculos corretos |
| `js/expediente-alerts.js` | **CRIADO** | Sistema completo de alertas de expediente + modal admin |
| `js/auth.js` | modificado | Hook `ffInitExpedienteAlerts()` após login bem-sucedido (2 pontos) |
| `js/lots.js` | modificado | `confirmSendToSector()`: reload em background 800ms após salvar |
| `index.html` | modificado | `<script src="js/expediente-alerts.js?v=1">` adicionado; versão `relatorio-tempos.js?v=70` |

---

## 🆕 Atualizações v8.0 – Junho 2026 (Session D – Simulador Inteligente de Entrega)

### ✅ Simulador Inteligente de Entrega

Nova tela de decisão para o PCP: permite simular se um pedido urgente pode ser encaixado na produção sem comprometer a fila existente.

#### Arquivo: `js/simulador-entrega.js` (novo)

**Constantes editáveis no topo do arquivo:**
```js
window.DEBUG_SIMULADOR = false;
const FF_SECTOR_DAILY_CAPACITY_KG = { pesagem:800, producao:1200, coloracao:600, ... };
const FF_SECTOR_DEFAULT_TIME_MINUTES = { pcp_liberacao:20, pesagem:40, producao:120, ... };
const FF_WORKDAY_MINUTES = 540; // 9 horas
const FF_WORKDAY_START   = '07:10';
const FF_WORKDAY_END     = '17:25';
const FF_MAX_OVERTIME_MINUTES = 180; // até 3h de hora extra
```

#### Funções principais (16 funções globais):
| Função | Descrição |
|---|---|
| `calculateProductionPriorityScore(lot)` | Score 0–320 pts com `reasons[]` explicando cada fator |
| `simulateUrgentOrderWithQueue(input)` | Motor central: retorna resultado completo da simulação |
| `renderSimuladorEntrega()` | Renderiza a página completa com formulário + contexto atual |
| `runDeliverySimulation()` | Lê formulário, executa simulação, exibe resultado |
| `clearDeliverySimulation()` | Limpa formulário e resultado |
| `ffLoadSimulationContext()` | Async: tenta backend, fallback STATE.lots |
| `ffGetLotDeliveryDate(lot)` | Accessor seguro para data de entrega (multi-campo) |
| `ffGetLotPriority(lot)` | Accessor seguro para prioridade |
| `ffGetLotQtyKg(lot)` | Accessor seguro para quantidade em kg |
| `ffGetLotSector(lot)` | Accessor seguro para setor atual |
| `ffGetLotProductType(lot)` | Accessor seguro para tipo de produto |
| `ffGetProductFlowForSimulation(productType)` | Fluxo produtivo (usa PRODUCT_FLOWS de data.js + fallback) |
| `ffEstimateSectorTimeMinutes(productType, kg, sector)` | Estimativa de tempo por setor |
| `ffBuildCurrentProductionQueue(lots)` | Fila atual ordenada por score desc |
| `ffBuildSimulatedQueue(currentQueue, newOrderEntry)` | Fila simulada com novo pedido inserido |
| `ffCalculateQueueImpact(before, after, newOrder)` | Calcula `canPassAheadOf`, `cannotPassAheadOf`, `delayedOrders` |
| `ffFormatSimulationDecision(result)` | Formata decisão com `{ label, color, icon }` |
| `ffCalculateSectorLoad(lots)` | Carga por setor: `{ lots, kg, capacity, pct }` |
| `ffGetDeliveryForecast(lots)` | Previsão de entregas: late/d0/d1/d2/d3_4/d5p |
| `ffBuildSectorPlan(productType, kg, startFromNow, sectorLoad)` | Plano por setor com timestamps |
| `buildSimulationExplanationPrompt(result)` | Prepara prompt para futura integração com IA |

#### Decisões possíveis:
| Decisão | Cor | Quando |
|---|---|---|
| `recommended` | 🟢 Verde | Cabe sem atrasar pedidos críticos, sem hora extra |
| `recommended_with_reorder` | 🔵 Azul/Roxo | Cabe passando na frente de pedidos menos urgentes |
| `overtime` | 🟡 Amarelo | Só cabe com hora extra; informa setor e duração |
| `not_recommended` | 🔴 Vermelho | Atrasaria pedidos críticos ou há conflito de prioridade |
| `impossible` | 🔴 Vermelho forte | Prazo curto demais ou capacidade esgotada |

#### Score de Prioridade (0–320 pts):
- **Prazo**: atrasado +150 / hoje +100 / amanhã +80 / 2d +50 / 3-4d +25 / 5d+ +5
- **Prioridade**: mesmo_dia +100 / urgente +70 / normal +20
- **Setor atual**: envase +25 / lab +20 / produção +15 / pcp +5
- **Quantidade**: pequeno ≤50kg +10 / grande >500kg −10
- *(futuro)* cliente estratégico +40

#### Integração no SPA:
```
PAGE_MAP: simulador_entrega → pageSimuladorEntrega (roles: admin, diretoria, pcp, pcp_lib, manager)
navigateTo: case 'simulador_entrega' → renderSimuladorEntrega()
_silentRefresh: case 'simulador_entrega' → no-op (carregado sob demanda)
```

#### Backend futuro (comentado no arquivo):
```
GET  /api/producao/simulador-contexto  – lotes abertos, pedidos, capacidades, médias históricas
POST /api/producao/simular-entrega     – cálculo no backend e retorno do resultado oficial
```

#### Tela possui 9 seções:
1. Formulário de simulação (produto, qty, cliente, data/hora, prioridade)
2. Card de decisão principal (cor + ícone + mensagem)
3. KPIs: previsão de pronto, hora extra, gargalo, pedidos impactados, score
4. Plano por setor (tabela: setor → tempo estimado → início → fim → obs)
5. Pedidos que pode passar na frente (cards com score + razão)
6. Pedidos que NÃO deve passar na frente
7. Pedidos impactados (ficariam atrasados)
8. Carga atual da fábrica por setor (barra de ocupação %)
9. Previsão de entregas por período (Atrasados / Hoje / Amanhã / 2d / 3-4d / 5d+)

#### CSS adicionado em `css/style.css`:
Prefixo `.sim-*` — ~380 linhas; inclui:
`.sim-page`, `.sim-grid-main`, `.sim-card`, `.sim-form-card`, `.sim-btn`, `.sim-decision-*`,
`.sim-kpi-grid`, `.sim-load-bar`, `.sim-forecast-grid`, `.sim-queue-card`, `.sim-table`, `.sim-bottleneck-row`

### 📂 Arquivos Modificados em v8.0

| Arquivo | Tipo | O que mudou |
|---|---|---|
| `js/simulador-entrega.js` | **CRIADO** | Simulador completo com 16+ funções globais (~1100 linhas) |
| `js/auth.js` | modificado | `simulador_entrega` em `PAGE_MAP`; `case 'simulador_entrega'` em `navigateTo()` |
| `js/app.js` | modificado | No-op `case 'simulador_entrega'` em `_silentRefresh()` |
| `index.html` | modificado | `<div id="pageSimuladorEntrega">` + `<script src="js/simulador-entrega.js?v=1">` |
| `css/style.css` | modificado | Bloco completo `.sim-*` adicionado ao final (~380 linhas) |

---

### 📂 Arquivos Modificados em v5.7

| Arquivo | Tipo | O que mudou |
|---|---|---|
| `js/relatorio-tempos.js` | **CRIADO** | Módulo completo com todas as 17 funções listadas acima |
| `js/auth.js` | modificado | `relatorio_tempos` adicionado ao `PAGE_MAP`; `case 'relatorio_tempos'` adicionado ao `navigateTo()` |
| `js/app.js` | modificado | No-op `case 'relatorio_tempos'` adicionado ao `_silentRefresh()` |
| `index.html` | modificado | `<div id="pageRelatorioTempos" class="page"></div>` + `<script src="js/relatorio-tempos.js?v=1">` |
| `js/lots.js` | modificado | `renderLotSectorTimesHistory(lot)` injetado em `openLotDetail()` com guarda `typeof` |
| `js/kanban.js` | modificado | Chip `rt-sector-elapsed` adicionado em `buildKanbanCard()` com 3 níveis de alerta |
| `css/style.css` | modificado | Bloco completo de estilos `.rt-*` adicionado ao final (~280 linhas) |
| `indusone.html` | **CRIADO** | Painel executivo AI standalone para Induscolor (não faz parte do SPA FactoryFlow) |

---

### 🗺️ PAGE_MAP atualizado (v5.7)

| Chave | Label | Ícone | Roles com acesso |
|---|---|---|---|
| `relatorio_tempos` | Relatório de Tempos | fa-clock | admin, diretoria, pcp, pcp_lib, manager |
| `simulador_entrega` | Simulador | fa-route | admin, diretoria, pcp, pcp_lib, manager |

---

### ⏳ Pendências Técnicas

- [ ] Criar endpoint `GET /api/producao/relatorio-tempos` no backend Railway
- [ ] Quando o backend existir: remover o banner `rt-backend-notice` da tela
- [ ] Avaliar persistência de `sectorEnteredAt` e `ff_workSessions` no banco para alimentar `calculateSectorTimesFromLot()`
- [ ] Adicionar SheetJS e jsPDF ao `index.html` via CDN para habilitar exportação completa
- [ ] **Simulador:** Criar endpoint `GET /api/producao/simulador-contexto` no backend (retorna lotes abertos, capacidades, médias históricas)
- [ ] **Simulador:** Criar endpoint `POST /api/producao/simular-entrega` para cálculo no backend
- [ ] **Simulador:** Integrar dados de tempo médio histórico por setor/código nas estimativas (`ffEstimateSectorTimeMinutes`)
- [ ] **Simulador:** Flag "cliente estratégico" no cadastro de clientes para ativar bônus +40 no score
