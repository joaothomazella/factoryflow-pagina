// ===================================================
// PEDIDOS-NOVOS.JS – Aba "Pedidos Novos" (ERP → Kanban)
// Busca pedidos do backend e permite ao PCP classificar
// e liberar cada item para o fluxo do FactoryFlow.
// ===================================================

'use strict';

// ── Configuração da API do backend ───────────────────
const PEDIDOS_API = 'https://app-producao-backend-production.up.railway.app';

// Cache em memória (limpo a cada navegação para a aba)
let _pedidosCache      = [];   // lista resumida de pedidos
let _pedidosLoading    = false;
let _pedidosLastFetch  = 0;

// Mapa de tipos de produto legíveis
const PN_TIPOS = {
  tinta:       'Tinta',
  diluente:    'Diluente',
  base:        'Base',
  endurecedor: 'Endurecedor',
  amostra:     'Amostra',
};

// Mapa de prioridades (valor → label / classe)
const PN_PRIO = {
  normal:     { label: 'Normal',     cls: 'prio-normal'   },
  urgente:    { label: 'Urgente',    cls: 'prio-urgente'  },
  mesmo_dia:  { label: 'Mesmo Dia', cls: 'prio-mesmodia' },
};

function _pnFirstPositiveNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function _pnQuantidadeKg(item) {
  // No ERP: pits_qtde pode ser embalagem/unidade; pits_peso é o Kg real.
  return _pnFirstPositiveNumber(
    item?.peso,
    item?.pits_peso,
    item?.peso_kg,
    item?.quantidade_kg,
    item?.kg,
    item?.weight,
    item?.quantidade,
    item?.qty,
    item?.pits_qtde
  );
}


// ───────────────────────────────────────────────────
// 1. RENDER PRINCIPAL DA PÁGINA
// ───────────────────────────────────────────────────
async function renderPedidosNovos() {
  const page = document.getElementById('pagePedidosNovos');
  if (!page) return;

  // Garante que o bridge aponta para o backend correto
  if (typeof setBridgeUrl === 'function' && (!BRIDGE_CONFIG || !BRIDGE_CONFIG.baseUrl)) {
    setBridgeUrl(PEDIDOS_API);
  }

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-inbox"></i> Pedidos Novos
        <span class="pn-badge-api" title="Backend ERP">
          <i class="fas fa-plug"></i> ERP
        </span>
      </h2>
      <div class="header-actions">
  <button class="btn btn-secondary" onclick="renderPedidosNovos()" title="Atualizar lista">
    <i class="fas fa-sync-alt"></i> Atualizar
  </button>

  ${
    ['admin','pcp','manager','gerente'].includes(String(STATE.currentUser?.role || '').toLowerCase())
    ? `
      <button onclick="abrirModalLoteManual()" class="btn btn-primary">
        <i class="fas fa-plus-circle"></i> Criar Lote Manual
      </button>
    `
    : ''
  }
</div>
    </div>

    <div id="pnStatusBar" class="pn-status-bar" style="display:none"></div>

    <div id="pnContainer" class="pn-container">
      <div class="pn-loading">
        <i class="fas fa-spinner fa-spin pn-spin-icon"></i>
        <p>Buscando pedidos do ERP…</p>
      </div>
    </div>
  `;

  await _fetchAndRenderPedidos();
}

// ───────────────────────────────────────────────────
// 2. FETCH LISTA DE PEDIDOS
// ───────────────────────────────────────────────────
async function _fetchAndRenderPedidos() {
  const container = document.getElementById('pnContainer');
  if (!container) return;

  _pedidosLoading = true;

  try {
    const res = await _pnFetch(`${PEDIDOS_API}/api/pedidos?limit=100`);

    if (!res.ok) {
      _renderPedidosError(container, `Erro HTTP ${res.status} ao buscar pedidos.`);
      return;
    }

    const json = await res.json();
    // A API pode retornar array direto ou { data: [] } ou { pedidos: [] }
    _pedidosCache = Array.isArray(json)
      ? json
      : (json.data || json.pedidos || json.items || []);

    _pedidosLastFetch = Date.now();

    if (_pedidosCache.length === 0) {
      container.innerHTML = `
        <div class="pn-empty">
          <i class="fas fa-check-circle pn-empty-icon"></i>
          <h3>Nenhum pedido pendente</h3>
          <p>Todos os pedidos do ERP já foram liberados para o fluxo de produção.</p>
          <button class="btn btn-secondary" onclick="renderPedidosNovos()" style="margin-top:1rem">
            <i class="fas fa-sync-alt"></i> Verificar novamente
          </button>
        </div>`;
      return;
    }

    _renderListaPedidos(container, _pedidosCache);

  } catch (err) {
    _renderPedidosError(container, `API indisponível: ${err.message}`);
  } finally {
    _pedidosLoading = false;
  }
}

// ───────────────────────────────────────────────────
// 3. RENDER DOS CARDS DE PEDIDOS
// ───────────────────────────────────────────────────
function _renderListaPedidos(container, pedidos) {
  // Marca pedidos já liberados. Hoje a fonte oficial dos lotes é producao_lotes,
  // então também considera pedidos presentes em STATE.lots/bridge MySQL.
  const liberados = new Set([
    ...STATE.orders.map(o => String(o.number || '').trim()).filter(Boolean),
    ...(STATE.lots || []).map(l => String(l.orderNumber || l.numero_pedido || l.raw_mysql?.numero_pedido || '').trim()).filter(Boolean)
  ]);

  const html = pedidos.map(p => {
    const num       = escapeHtml(String(p.numero || p.number || p.pits_numero || ''));
    const cliente   = escapeHtml(String(p.cliente || p.nome_cliente || p.client || p.cli_nome || '–'));
    const entrega   = p.previsao_entrega || p.pits_previsao || p.deliveryDate || p.data_entrega || '';
    const totalItens= p.total_itens  ?? p.qtd_itens  ?? (p.itens ? p.itens.length : '?');
    const totalOps  = p.total_ops    ?? p.qtd_ops    ?? totalItens;
   const totalQtd  = Number(p.total_quantidade ?? p.quantidade_total ?? p.qty_total ?? 0).toLocaleString('pt-BR');
    const jaLiberado= liberados.has(num);

    return `
      <div class="pn-card ${jaLiberado ? 'pn-card-liberado' : ''}" data-num="${num}">
        <div class="pn-card-header">
          <div class="pn-card-num">
            <i class="fas fa-file-invoice"></i>
            <span>Pedido&nbsp;<strong>#${num}</strong></span>
          </div>
          ${jaLiberado
            ? `<span class="pn-chip pn-chip-ok"><i class="fas fa-check"></i> Liberado</span>`
            : `<span class="pn-chip pn-chip-new"><i class="fas fa-circle"></i> Novo</span>`}
        </div>

        <div class="pn-card-body">
          <div class="pn-info-row">
            <i class="fas fa-user"></i>
            <span>${cliente}</span>
          </div>
          ${entrega ? `
          <div class="pn-info-row">
            <i class="fas fa-calendar-alt"></i>
            <span>Entrega: <strong>${_formatData(entrega)}</strong></span>
          </div>` : ''}
          <div class="pn-stats-row">
            <div class="pn-stat">
              <span class="pn-stat-num">${totalItens}</span>
              <span class="pn-stat-lbl">Itens</span>
            </div>
            <div class="pn-stat">
              <span class="pn-stat-num">${totalOps}</span>
              <span class="pn-stat-lbl">OPs</span>
            </div>
            <div class="pn-stat">
              <span class="pn-stat-num">${totalQtd}</span>
              <span class="pn-stat-lbl">Qtd total</span>
            </div>
          </div>
        </div>

        <div class="pn-card-footer">
          ${jaLiberado
            ? `<button class="btn pn-btn-liberar" onclick="openPnModal('${num}', false)">
                 <i class="fas fa-plus-circle"></i> Ver / Liberar OP nova
               </button>`
            : `<button class="btn pn-btn-liberar" onclick="openPnModal('${num}', false)">
                 <i class="fas fa-play-circle"></i> Classificar / Liberar
               </button>`}
        </div>
      </div>
    `;
  }).join('');

  const total     = pedidos.length;
  const novos     = pedidos.filter(p => !liberados.has(String(p.numero || p.number || p.pits_numero || ''))).length;

  container.innerHTML = `
    <div class="pn-toolbar">
      <div class="pn-toolbar-info">
        <span><strong>${total}</strong> pedido${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}</span>
        ${novos > 0
          ? `<span class="pn-chip pn-chip-new" style="margin-left:.6rem">${novos} aguardando liberação</span>`
          : `<span class="pn-chip pn-chip-ok" style="margin-left:.6rem"><i class="fas fa-check"></i> Todos liberados</span>`}
      </div>
      <div class="pn-toolbar-actions">
        <input type="text" id="pnSearch" placeholder="Buscar pedido ou cliente…"
               class="pn-search-input" oninput="_pnFilterCards(this.value)" />
      </div>
    </div>
    <div class="pn-grid" id="pnGrid">
      ${html}
    </div>
  `;
}

// Filtra cards pelo texto digitado
function _pnFilterCards(q) {
  const q2 = q.toLowerCase().trim();
  document.querySelectorAll('.pn-card').forEach(card => {
    const txt = card.textContent.toLowerCase();
    card.style.display = (!q2 || txt.includes(q2)) ? '' : 'none';
  });
}

// ───────────────────────────────────────────────────
// 4. MODAL DE CLASSIFICAÇÃO / DETALHES
// ───────────────────────────────────────────────────
let _pnModalNumero  = null;
let _pnModalReadOnly= false;
let _pnDetalhe      = null;

async function openPnModal(numero, readOnly = false) {
  _pnModalNumero   = numero;
  _pnModalReadOnly = readOnly;
  _pnDetalhe       = null;

  const overlay = document.getElementById('pnModalOverlay');
  const body    = document.getElementById('pnModalBody');
  if (!overlay || !body) return;

  overlay.style.display = 'flex';
  body.innerHTML = `
    <div class="pn-modal-loading">
      <i class="fas fa-spinner fa-spin pn-spin-icon"></i>
      <p>Carregando detalhes do pedido #${escapeHtml(numero)}…</p>
    </div>`;

  try {
    const res = await _pnFetch(`${PEDIDOS_API}/api/pedidos/${encodeURIComponent(numero)}`);

    if (!res.ok) {
      body.innerHTML = `<div class="pn-error-box">
        <i class="fas fa-exclamation-triangle"></i>
        Pedido não encontrado ou API indisponível (HTTP ${res.status}).
      </div>`;
      return;
    }

    const json = await res.json();
    // A API pode retornar o pedido direto ou dentro de { data: {...} }
    _pnDetalhe = {
  ...(json.pedido || json.data || json),
  itens: Array.isArray(json.itens)
    ? json.itens
    : Array.isArray(json.data?.itens)
      ? json.data.itens
      : Array.isArray(json.pedido?.itens)
        ? json.pedido.itens
        : []
};

    _renderModalBody(body, _pnDetalhe, readOnly);

  } catch (err) {
    body.innerHTML = `<div class="pn-error-box">
      <i class="fas fa-exclamation-triangle"></i>
      Erro ao buscar detalhes: ${escapeHtml(err.message)}
    </div>`;
  }
}

function closePnModal() {
  const overlay = document.getElementById('pnModalOverlay');
  if (overlay) overlay.style.display = 'none';
  _pnModalNumero   = null;
  _pnModalReadOnly = false;
  _pnDetalhe       = null;
}

// ───────────────────────────────────────────────────
// 5. RENDER DO CORPO DO MODAL
// ───────────────────────────────────────────────────
function _renderModalBody(body, detalhe, readOnly) {
  // Normaliza campos da API (aceita diferentes nomenclaturas)
  const numero  = escapeHtml(String(detalhe.numero || detalhe.number || _pnModalNumero || ''));
  const cliente = escapeHtml(String(detalhe.cliente || detalhe.client || detalhe.cli_nome || '–'));
  const entrega = detalhe.previsao_entrega || detalhe.deliveryDate || detalhe.data_entrega || '';
  const obs     = detalhe.observacao || detalhe.notes || '';

  // Itens / OPs do pedido
  let itens = detalhe.itens || detalhe.items || detalhe.ops || detalhe.lots || [];

// 🔥 REMOVE DUPLICADOS (mesmo OP + produto + quantidade)
const itensUnicosMap = new Map();

itens.forEach(item => {
  const op  = String(item.op || item.pits_op || item.number || '').trim();
  const cod = String(item.produto_codigo || item.productCode || item.pits_produto || '').trim();

  // usa peso (kg real)
  const kg = _pnQuantidadeKg(item);

  // chave agora NÃO usa quantidade
  const chave = `${op}_${cod}`;

  if (!itensUnicosMap.has(chave)) {
    itensUnicosMap.set(chave, {
      ...item,
      quantidade: kg, // garante que vai usar kg correto
      peso: kg,
      pits_peso: kg,
      quantidade_kg: kg
    });
  }
});

itens = Array.from(itensUnicosMap.values());

  if (itens.length === 0) {
    body.innerHTML = `
      <div class="pn-modal-header-info">
        <strong>#${numero}</strong> — ${cliente}
      </div>
      <div class="pn-error-box" style="margin-top:1rem">
        <i class="fas fa-info-circle"></i>
        Este pedido não possui itens/OPs para liberar.
      </div>`;
    document.getElementById('pnModalFooter').innerHTML = `
      <button class="btn btn-secondary" onclick="closePnModal()">Fechar</button>`;
    return;
  }

  // Verifica duplicidades existentes (mesmo OP ou número de pedido)
  const lotNums = new Set(
  (STATE.lots || [])
    .map(l => String(l.number || l.op || l.pits_op || '').trim())
    .filter(Boolean)
);
  const orderNums = new Set(STATE.orders.map(o => String(o.number || '').trim()));
  const pedidoJaExiste = orderNums.has(String(_pnModalNumero || '').trim());

  const itensHtml = itens.map((item, idx) => {
    const op        = escapeHtml(String(item.op || item.pits_op || item.number || ''));
    const cod       = escapeHtml(String(item.produto_codigo || item.productCode || item.pits_produto || ''));
    const nome      = escapeHtml(String(item.produto_nome || item.productName || item.pits_nome_produto || item.paint || cod));
    const qtd       = _pnQuantidadeKg(item);
    const lotNum    = op || `${_pnModalNumero}-${idx + 1}`;
    const jaExiste  = op ? lotNums.has(op) : lotNums.has(lotNum);

    // Tenta inferir o tipo pelo código/nome do produto
    const tipoInferido = _inferirTipo(cod, nome);

    return `
      <div class="pn-item ${jaExiste ? 'pn-item-existe' : ''}" data-idx="${idx}">
        <div class="pn-item-header">
          <div class="pn-item-op">
            <span class="pn-op-badge">OP</span>
            <strong>${op || `–`}</strong>
          </div>
          ${jaExiste
            ? `<span class="pn-chip pn-chip-warn"><i class="fas fa-exclamation-triangle"></i> Lote já existe</span>`
            : ''}
        </div>

        <div class="pn-item-grid">
          <div class="pn-item-field">
            <label>Código</label>
            <span>${cod || '–'}</span>
          </div>
          <div class="pn-item-field pn-item-nome">
            <label>Produto</label>
            <span>${nome || '–'}</span>
          </div>
          <div class="pn-item-field">
            <label>Quantidade</label>
            <span>${qtd.toLocaleString('pt-BR')} Kg</span>
          </div>
        </div>

        ${readOnly ? `
          <div class="pn-item-grid" style="margin-top:.5rem">
            <div class="pn-item-field">
              <label>Tipo</label>
              <span>${PN_TIPOS[tipoInferido] || tipoInferido}</span>
            </div>
            <div class="pn-item-field">
              <label>Prioridade</label>
              <span>Normal</span>
            </div>
          </div>
        ` : `
          <div class="pn-item-selects">
            <div class="pn-item-select-group">
              <label>Tipo de produto *</label>
              <select id="pnTipo_${idx}" class="pn-select" data-ja-existe="${jaExiste ? 'true' : 'false'}" ${jaExiste ? 'disabled' : ''} onchange="_pnToggleEndurecedorRoute(${idx})">
                <option value="tinta"       ${tipoInferido === 'tinta'       ? 'selected' : ''}>Tinta</option>
                <option value="diluente"    ${tipoInferido === 'diluente'    ? 'selected' : ''}>Diluente</option>
                <option value="base"        ${tipoInferido === 'base'        ? 'selected' : ''}>Base</option>
                <option value="endurecedor" ${tipoInferido === 'endurecedor' ? 'selected' : ''}>Endurecedor</option>
                <option value="amostra"     ${tipoInferido === 'amostra'     ? 'selected' : ''}>Amostra</option>
              </select>
            </div>
            <div class="pn-item-select-group">
              <label>Prioridade *</label>
              <select id="pnPrio_${idx}" class="pn-select" ${jaExiste ? 'disabled' : ''}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgente</option>
                <option value="sameday">Mesmo Dia</option>
              </select>
            </div>
            <div class="pn-item-select-group pn-endurecedor-route" id="pnEndRouteWrap_${idx}" style="${tipoInferido === 'endurecedor' ? '' : 'display:none'}">
              <label>Destino do endurecedor *</label>
              <select id="pnEndRoute_${idx}" class="pn-select" ${jaExiste ? 'disabled' : ''}>
                <option value="pesagem">Liberar para Pesagem</option>
                <option value="envase">Liberar direto para Envase</option>
              </select>
            </div>
          </div>
          ${jaExiste ? `<p class="pn-item-aviso"><i class="fas fa-info-circle"></i> Este item já foi liberado anteriormente e será ignorado.</p>` : ''}
        `}
      </div>
    `;
  }).join('');

  body.innerHTML = `
    <div class="pn-modal-header-info">
      <div class="pn-modal-pedido-info">
        <div>
          <span class="pn-label-small">Pedido</span>
          <strong class="pn-num-grande">#${numero}</strong>
        </div>
        <div>
          <span class="pn-label-small">Cliente</span>
          <strong>${cliente}</strong>
        </div>
        ${entrega ? `<div>
          <span class="pn-label-small">Previsão de entrega</span>
          <strong>${_formatData(entrega)}</strong>
        </div>` : ''}
        ${obs ? `<div class="pn-obs">
          <i class="fas fa-comment-alt"></i> ${escapeHtml(obs)}
        </div>` : ''}
      </div>
      ${pedidoJaExiste && !readOnly
        ? `<div class="pn-aviso-pedido">
            <i class="fas fa-exclamation-triangle"></i>
            Um pedido interno com este número já existe no FactoryFlow.
            Os itens novos (sem lote) ainda podem ser liberados individualmente.
           </div>`
        : ''}
    </div>

    ${!readOnly ? `
      <div class="pn-amostra-box">
        <label class="pn-amostra-option">
          <input type="checkbox" id="pnPedidoAmostra" onchange="_pnTogglePedidoAmostra()" />
          <span>
            <strong><i class="fas fa-vial"></i> Este pedido inteiro é AMOSTRA</strong>
            <small>Todos os itens serão enviados direto para Laboratório – Amostras. Depois o laboratório escolhe: Coloração – Amostras ou Pronto para Entrega.</small>
          </span>
        </label>
      </div>
    ` : ''}

    <div class="pn-items-list">
      <div class="pn-items-title">
        <i class="fas fa-list-ul"></i>
        ${itens.length} ${itens.length === 1 ? 'item' : 'itens'} neste pedido
        ${!readOnly ? '— classifique cada item antes de liberar' : ''}
      </div>
      ${itensHtml}
    </div>
  `;

  // Atualiza o footer do modal
  const footer = document.getElementById('pnModalFooter');
  if (readOnly) {
    footer.innerHTML = `<button class="btn btn-secondary" onclick="closePnModal()">
      <i class="fas fa-times"></i> Fechar
    </button>`;
  } else {
    const todosExistem = itens.every((item, idx) => {
  const op = String(
    item.op ||
    item.pits_op ||
    item.number ||
    ''
  ).trim();

  // sem OP válida = NÃO existe
  if (!op) return false;

  return lotNums.has(op);
});

    console.log('[Pedidos Novos] Itens do modal:', itens.map((item, idx) => ({
      idx,
      op: String(item.op || item.pits_op || item.number || '').trim(),
      existe: lotNums.has(String(item.op || item.pits_op || item.number || '').trim())
    })), 'todosExistem=', todosExistem);

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="closePnModal()">
        <i class="fas fa-times"></i> Cancelar
      </button>
      ${todosExistem
        ? `<button class="btn btn-secondary" disabled style="opacity:.5;cursor:not-allowed">
             <i class="fas fa-check"></i> Todos os itens já liberados
           </button>`
        : `<button class="btn pn-btn-liberar" id="pnBtnLiberar" onclick="liberarPedido()">
             <i class="fas fa-play-circle"></i> Liberar para o Fluxo
           </button>`}
    `;
  }
}


function _pnIsPedidoAmostra() {
  return !!document.getElementById('pnPedidoAmostra')?.checked;
}

function _pnTogglePedidoAmostra() {
  const isAmostra = _pnIsPedidoAmostra();

  document.querySelectorAll('.pn-item').forEach(item => {
    item.classList.toggle('pn-item-amostra', isAmostra);

    const idx = item.dataset.idx;
    const tipoEl = document.getElementById(`pnTipo_${idx}`);
    const endWrap = document.getElementById(`pnEndRouteWrap_${idx}`);
    const endRoute = document.getElementById(`pnEndRoute_${idx}`);

    if (tipoEl) {
      tipoEl.disabled = isAmostra || tipoEl.dataset.jaExiste === 'true';
    }

    if (endWrap) {
      endWrap.style.display = (!isAmostra && tipoEl && tipoEl.value === 'endurecedor') ? '' : 'none';
    }

    if (endRoute) {
      endRoute.disabled = isAmostra;
    }
  });

  const title = document.querySelector('.pn-items-title');
  if (title) {
    title.innerHTML = isAmostra
      ? '<i class="fas fa-vial"></i> Pedido marcado como AMOSTRA — todos os itens irão direto para Laboratório – Amostras'
      : '<i class="fas fa-list-ul"></i> Itens neste pedido — classifique cada item antes de liberar';
  }
}

function _pnToggleEndurecedorRoute(idx) {
  const tipoEl = document.getElementById(`pnTipo_${idx}`);
  const wrap = document.getElementById(`pnEndRouteWrap_${idx}`);
  if (!tipoEl || !wrap) return;

  if (_pnIsPedidoAmostra()) {
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = tipoEl.value === 'endurecedor' ? '' : 'none';
}

// ───────────────────────────────────────────────────
// 6. LIBERAR PEDIDO → CRIAR LOTES + PEDIDO INTERNO
// ───────────────────────────────────────────────────
async function liberarPedido() {
  if (!_pnDetalhe || !_pnModalNumero) return;

  const user = STATE.currentUser;
  if (!user) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }

  const btn = document.getElementById('pnBtnLiberar');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Liberando…';
  }

  try {
    let itens = _pnDetalhe.itens || _pnDetalhe.items || _pnDetalhe.ops || _pnDetalhe.lots || [];

    // 🔥 REMOVE DUPLICADOS TAMBÉM NA LIBERAÇÃO
    const itensUnicosMapLiberacao = new Map();

    itens.forEach(item => {
      const op   = String(item.op || item.pits_op || item.number || '').trim();
      const cod  = String(item.produto_codigo || item.productCode || item.pits_produto || '').trim();
      const chave = `${op}_${cod}`;

      if (!itensUnicosMapLiberacao.has(chave)) {
        itensUnicosMapLiberacao.set(chave, item);
      }
    });

    itens = Array.from(itensUnicosMapLiberacao.values());
    const numero  = String(_pnModalNumero).trim();
    const cliente = String(_pnDetalhe.cliente || _pnDetalhe.client || _pnDetalhe.cli_nome || '');
    const entrega = _pnDetalhe.previsao_entrega || _pnDetalhe.deliveryDate || _pnDetalhe.data_entrega || '';
    const pedidoAmostra = _pnIsPedidoAmostra();

    // Identifica quais lotes já existem (pelo number)
    const lotNums = new Set(
  (STATE.lots || [])
    .map(l => String(l.number || l.op || l.pits_op || '').trim())
    .filter(Boolean)
);

    const lotsCriados = [];
    let   maxPrio     = 'normal';
    const prioOrder   = { sameday: 2, urgent: 1, normal: 0 };

    for (let idx = 0; idx < itens.length; idx++) {
      const item   = itens[idx];
      const op     = String(item.op || item.pits_op || item.number || '').trim();
      const lotNum = op || `${numero}-${idx + 1}`;

      // Pula se já existe pela OP/lote
      if ((op && lotNums.has(op)) || lotNums.has(lotNum)) continue;

      const cod       = String(item.produto_codigo || item.productCode || item.pits_produto || '');
      const nome      = String(item.produto_nome   || item.productName || item.pits_nome_produto || item.paint || cod);
      const qtd       = _pnQuantidadeKg(item);
      const tipoEl    = document.getElementById(`pnTipo_${idx}`);
      const prioEl    = document.getElementById(`pnPrio_${idx}`);
      const tipoSelecionado = tipoEl ? tipoEl.value : _inferirTipo(cod, nome);
      const tipo      = pedidoAmostra ? 'amostra' : tipoSelecionado;
      const prioridade= prioEl  ? prioEl.value  : 'normal';
      const endRouteEl = document.getElementById(`pnEndRoute_${idx}`);
      const endurecedorRoute = (!pedidoAmostra && tipo === 'endurecedor') ? (endRouteEl?.value || 'pesagem') : '';

      // Atualiza prioridade máxima
      if (prioOrder[prioridade] > prioOrder[maxPrio]) maxPrio = prioridade;

      const now = Date.now();

      // AMOSTRA: se marcou o pedido inteiro como amostra OU se classificou o item como amostra,
      // o lote deve cair direto no quadro Laboratório – Amostras.
      const isAmostra = pedidoAmostra || tipo === 'amostra';
      const setorInicial = isAmostra ? 'laboratorio_amostras' : 'coloracao_revisao';
      const acaoInicial = isAmostra
        ? `AMOSTRA liberada pelo PCP – enviada direto para Laboratório – Amostras – Pedido #${numero}${op ? ' | OP ' + op : ''}`
        : `Lote criado via Pedidos Novos pelo PCP – Pedido #${numero}${op ? ' | OP ' + op : ''}${tipo === 'endurecedor' ? ' | Destino: ' + (endurecedorRoute === 'envase' ? 'Direto Envase' : 'Pesagem') : ''}`;

      const novoLot = {
        id:              genId('lot'),
        number:          lotNum,
        orderId:         '',            // será preenchido após criar o pedido
        orderNumber:     numero,
        client:          cliente,
        productCode:     cod,
        paint:           nome,
        productType:     tipo,
        tipo_lote:       tipo,
        linha_produto:   tipo,
        endurecedorRoute: endurecedorRoute,
        destinoEndurecedor: endurecedorRoute,
        qty:             qtd,
        peso:            qtd,
        pits_peso:       qtd,
        quantidade_kg:   qtd,
        unit:            'Kg',
        priority:        prioridade,
        deliveryDate:    entrega ? entrega.split('T')[0] : '',
        skipColor:       tipo === 'endurecedor',
        city:            String(_pnDetalhe.cidade || _pnDetalhe.city || _pnDetalhe.cli_cidade || ''),
        address:         String(_pnDetalhe.endereco || _pnDetalhe.address || ''),
        notes:           '',
        sector:          setorInicial,
        lotStatus:       'idle',
        workSessions:    [],
        sectorEnteredAt: now,
        createdAt:       now,
        createdBy:       user.id,
        rejected:        false,
        rejectedAt:      null,
        rejectedReason:  '',
        rejectedBy:      '',
        rejectedSector:  '',
        history: [{
          sector:    setorInicial,
          user:      user.id,
          userName:  user.name,
          action:    acaoInicial,
          timestamp: now
        }]
      };

      const criado = await apiCreateLot(novoLot);
      lotsCriados.push(criado);
    }

    if (lotsCriados.length === 0) {
      showToast('⚠️ Nenhum lote novo foi criado — todos já existiam.', 'warning');
      closePnModal();
      return;
    }

    // Cria pedido interno no FactoryFlow (se não existir)
    const orderNums = new Set(STATE.orders.map(o => String(o.number || '').trim()));
    if (!orderNums.has(numero)) {
      const novaOrder = {
        id:           genId('ord'),
        number:       numero,
        client:       cliente,
        city:         String(_pnDetalhe.cidade || _pnDetalhe.city || _pnDetalhe.cli_cidade || ''),
        address:      String(_pnDetalhe.endereco || _pnDetalhe.address || ''),
        deliveryDate: entrega ? entrega.split('T')[0] : new Date().toISOString().split('T')[0],
        priority:     maxPrio,
        notes:        `${pedidoAmostra ? 'Pedido AMOSTRA – ' : ''}Liberado via Pedidos Novos em ${new Date().toLocaleString('pt-BR')}`,
        status:       'in_production',
        createdAt:    Date.now(),
        createdBy:    user.id,
        lotIds:       lotsCriados.map(l => l.id),
      };

      const pedidoCriado = await apiCreateOrder(novaOrder);

      // Atualiza orderId nos lotes criados (sem re-salvar tudo, só atualiza STATE)
      lotsCriados.forEach(l => {
        l.orderId = pedidoCriado.id;
        const idx = STATE.lots.findIndex(x => x.id === l.id);
        if (idx !== -1) {
          STATE.lots[idx].orderId = pedidoCriado.id;
          // MYSQL-ONLY: orderId é virtual. O vínculo real é pelo numero_pedido em producao_lotes.
        }
      });
    } else {
      // Pedido já existe → só adiciona os novos lote IDs
      const pedidoExistente = STATE.orders.find(o => String(o.number || '').trim() === numero);
      if (pedidoExistente) {
        const novosIds = [...(pedidoExistente.lotIds || []), ...lotsCriados.map(l => l.id)];
        pedidoExistente.lotIds = novosIds;
        // MYSQL-ONLY: não atualiza mais ff_orders. Pedidos são derivados de producao_lotes.

        lotsCriados.forEach(l => {
          l.orderId = pedidoExistente.id;
          const idx = STATE.lots.findIndex(x => x.id === l.id);
          if (idx !== -1) STATE.lots[idx].orderId = pedidoExistente.id;
          // MYSQL-ONLY: não atualiza mais ff_lots. O vínculo real é pelo numero_pedido.
        });
      }
    }

    // Sucesso
    const qtd = lotsCriados.length;
    showToast(
      pedidoAmostra
        ? `✅ Pedido AMOSTRA liberado! ${qtd} lote${qtd !== 1 ? 's' : ''} enviado${qtd !== 1 ? 's' : ''} direto para Laboratório.`
        : `✅ ${qtd} lote${qtd !== 1 ? 's' : ''} criado${qtd !== 1 ? 's' : ''} e enviado${qtd !== 1 ? 's' : ''} para Coloração (Revisão)!`,
      'success'
    );

    await _pnMarcarPedidoProcessado(numero);

    if (typeof reloadData === 'function') {
      await reloadData().catch(() => {});
    }

    closePnModal();
    navigateTo('kanban');

  } catch (err) {
    console.error('Erro ao liberar pedido:', err);
    showToast('❌ Erro ao liberar pedido: ' + err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-play-circle"></i> Liberar para o Fluxo';
    }
  }
}


async function _pnMarcarPedidoProcessado(numero) {
  const n = String(numero || '').trim();
  if (!n) return;

  try {
    const res = await _pnFetch(`${PEDIDOS_API}/api/pedidos/${encodeURIComponent(n)}/processado`, {
      method: 'PATCH'
    });

    if (!res.ok) {
      console.warn(`[Pedidos Novos] Não consegui marcar pedido ${n} como processado: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Pedidos Novos] Falha ao marcar pedido ${n} como processado:`, err.message);
  }
}

// ───────────────────────────────────────────────────
// 7. HELPERS
// ───────────────────────────────────────────────────

/**
 * Fetch com timeout de 10 segundos.
 */
async function _pnFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  const jwt = sessionStorage.getItem('ff_token') || localStorage.getItem('ff_token') || '';
  const headers = {
    ...(options.headers || {}),
    ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Formata data ISO → DD/MM/AAAA.
 */
function _formatData(d) {
  if (!d) return '–';
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('pt-BR');
  } catch (_) { return d; }
}

/**
 * Infere o tipo de produto pelo código ou nome.
 */
function _inferirTipo(cod, nome) {
  const texto = `${cod} ${nome}`.toLowerCase();
  if (/amostra|sample/i.test(texto))     return 'amostra';
  if (/diluen|diluent/i.test(texto))    return 'diluente';
  if (/endurec|hardener/i.test(texto))  return 'endurecedor';
  if (/base\b/i.test(texto)) return 'base';
  return 'tinta'; // padrão
}

/**
 * Renderiza mensagem de erro no container principal.
 */
function _renderPedidosError(container, msg) {
  container.innerHTML = `
    <div class="pn-empty pn-error-state">
      <i class="fas fa-exclamation-triangle pn-empty-icon" style="color:#f59e0b"></i>
      <h3>API indisponível</h3>
      <p>${escapeHtml(msg)}</p>
      <p style="font-size:.8rem;color:var(--text3);margin-top:.3rem">
        Verifique se o backend está online:<br>
        <code style="font-size:.75rem">${PEDIDOS_API}/health</code>
      </p>
      <button class="btn btn-secondary" onclick="renderPedidosNovos()" style="margin-top:1rem">
        <i class="fas fa-sync-alt"></i> Tentar novamente
      </button>
    </div>`;
}

/**
 * Fecha o modal ao clicar no overlay (fora da janela).
 */
function _pnOverlayClick(event) {
  if (event.target === document.getElementById('pnModalOverlay')) {
    closePnModal();
  }
}

// Exposição explícita no window para navegação do FactoryFlow
window.renderPedidosNovos = renderPedidosNovos;
window.openPnModal = openPnModal;
window.closePnModal = closePnModal;
window.liberarPedido = liberarPedido;
window._pnFilterCards = _pnFilterCards;
window._pnToggleEndurecedorRoute = _pnToggleEndurecedorRoute;
window._pnTogglePedidoAmostra = _pnTogglePedidoAmostra;
window._pnOverlayClick = _pnOverlayClick;


// ───────────────────────────────────────────────────
// 8. ESTILO EXTRA – Pedido Amostra
// ───────────────────────────────────────────────────
(function _injectPnAmostraStyle() {
  if (document.getElementById('pnAmostraStyle')) return;

  const style = document.createElement('style');
  style.id = 'pnAmostraStyle';
  style.textContent = `
    .pn-amostra-box {
      margin: 1rem 0;
      padding: .95rem 1rem;
      border-radius: 14px;
      border: 1px solid rgba(45, 212, 191, .35);
      background: linear-gradient(135deg, rgba(45,212,191,.12), rgba(59,130,246,.08));
    }

    .pn-amostra-option {
      display: flex;
      align-items: flex-start;
      gap: .75rem;
      cursor: pointer;
      color: var(--text);
    }

    .pn-amostra-option input {
      margin-top: .25rem;
      transform: scale(1.2);
      accent-color: #2dd4bf;
    }

    .pn-amostra-option strong {
      display: block;
      color: #5eead4;
      font-size: .95rem;
      margin-bottom: .2rem;
    }

    .pn-amostra-option small {
      display: block;
      color: var(--text2);
      line-height: 1.35;
      font-size: .8rem;
    }

    .pn-item-amostra {
      border-color: rgba(45, 212, 191, .45) !important;
      box-shadow: 0 0 0 1px rgba(45, 212, 191, .12);
    }

    .pn-item-amostra::before {
      content: 'AMOSTRA → LABORATÓRIO';
      display: inline-flex;
      margin-bottom: .6rem;
      padding: .22rem .55rem;
      border-radius: 999px;
      background: rgba(45, 212, 191, .14);
      color: #5eead4;
      font-size: .68rem;
      font-weight: 800;
      letter-spacing: .04em;
    }
  `;
  document.head.appendChild(style);
})();
