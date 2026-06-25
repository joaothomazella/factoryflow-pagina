// ===================================================
// LOTS.JS – Gestão de lotes e pedidos via API
// ===================================================


// ===================================================
// PATCH INDUSCOLOR – PADRONIZAÇÃO DEFINITIVA DO ENVASE
// O Kanban normal precisa que sector, stage, status e currentSector usem o MESMO nome da coluna.
// ===================================================
function ffNormalizeSectorName(sector) {
  const s = String(sector || '').trim().toLowerCase();
  const aliases = {
    'envase': 'envase_enlatamento',
    'envase-antigo': 'envase_enlatamento',
    'envase_antigo': 'envase_enlatamento',
    'enlatamento': 'envase_enlatamento',
    'envase-enlatamento': 'envase_enlatamento',
    'envase_enlatamento': 'envase_enlatamento',
    'envase-produzir': 'envase_produzir',
    'envase_produzir': 'envase_produzir',
    'envase_producao': 'envase_produzir',

    // Amostras
    'laboratorio-amostras': 'laboratorio_amostras',
    'laboratório-amostras': 'laboratorio_amostras',
    'laboratorio amostras': 'laboratorio_amostras',
    'laboratório amostras': 'laboratorio_amostras',
    'laboratorio_amostras': 'laboratorio_amostras',

    'coloracao-amostras': 'coloracao_amostras',
    'coloração-amostras': 'coloracao_amostras',
    'coloracao amostras': 'coloracao_amostras',
    'coloração amostras': 'coloracao_amostras',
    'coloracao_amostras': 'coloracao_amostras'
  };
  return aliases[s] || s;
}

function ffGetLotCurrentSector(lot) {
  if (!lot) return '';
  const candidates = [lot.sector, lot.stage, lot.status, lot.currentSector];

  const specificEnvase = candidates.find(v => {
    const n = ffNormalizeSectorName(v);
    return n === 'envase_produzir' || n === 'envase_enlatamento';
  });

  if (specificEnvase) return ffNormalizeSectorName(specificEnvase);
  return ffNormalizeSectorName(lot.sector || lot.stage || lot.status || lot.currentSector);
}

function ffApplySectorToLot(lot, sector) {
  const normalized = ffNormalizeSectorName(sector);
  lot.sector = normalized;
  lot.stage = normalized;
  lot.status = normalized;
  lot.currentSector = normalized;
  return normalized;
}


// ===================================================
// PATCH INDUSCOLOR – HISTÓRICO PERSISTENTE
// Garante que lotes vindos do MySQL nunca salvem ff_history vazio.
// Se o lote foi criado antes da correção e chegou com history vazio,
// criamos uma base mínima antes de registrar o próximo avanço.
// ===================================================
function ffEnsureLotHistoryBeforeAction(lot, user, currentSector) {
  if (!lot) return [];

  let history = [];

  try {
    if (Array.isArray(lot.history)) {
      history = [...lot.history];
    } else if (typeof lot.history === 'string' && lot.history.trim()) {
      history = JSON.parse(lot.history);
    } else if (Array.isArray(lot.raw_mysql?.ff_history)) {
      history = [...lot.raw_mysql.ff_history];
    } else if (typeof lot.raw_mysql?.ff_history === 'string' && lot.raw_mysql.ff_history.trim()) {
      history = JSON.parse(lot.raw_mysql.ff_history);
    }
  } catch (_) {
    history = [];
  }

  if (!Array.isArray(history)) history = [];

  const setorAtual = ffNormalizeSectorName(currentSector || lot.sector || lot.setor_atual || 'pcp_liberacao');
  const usuarioId = user?.id || lot.createdBy || 'sistema';
  const usuarioNome = user?.name || user?.username || 'Sistema';
  const createdAt = Number(lot.createdAt || lot.raw_mysql?.data_criacao && new Date(lot.raw_mysql.data_criacao).getTime()) || Date.now();
  const enteredAt = Number(lot.sectorEnteredAt || lot.raw_mysql?.ff_sectorEnteredAt || lot.raw_mysql?.updated_at && new Date(lot.raw_mysql.updated_at).getTime()) || createdAt;

  if (history.length === 0) {
    history.push({
      sector: 'pcp_liberacao',
      user: usuarioId,
      userName: usuarioNome,
      action: lot.notes || 'Lote criado no FactoryFlow',
      timestamp: createdAt
    });

    if (setorAtual && setorAtual !== 'pcp_liberacao') {
      history.push({
        sector: setorAtual,
        user: usuarioId,
        userName: usuarioNome,
        action: `Registro inicial no setor ${SECTOR_LABELS[setorAtual] || setorAtual}`,
        timestamp: enteredAt
      });
    }
  }

  lot.history = history;
  return history;
}



// ===================================================
// PATCH INDUSCOLOR – COMPARAÇÃO HISTÓRICA POR CÓDIGO/SETOR
// ===================================================
function ffLotTempoComparativoHtml(lot) {
  try {
    const sector = ffGetLotCurrentSector(lot);
    const code = String(lot.productCode || lot.produto_codigo || lot.raw_mysql?.produto_codigo || '').trim();
    const ts = typeof getLotTimeSummary === 'function' ? getLotTimeSummary(lot) : { total: 0, worked: 0, paused: 0, idle: 0 };
    const localAvg = typeof ffGetProductSectorAverageLocal === 'function' ? ffGetProductSectorAverageLocal(code, sector) : null;

    const avgWorked = localAvg?.avgWorkedMs || 0;
    const diff = avgWorked ? ts.worked - avgWorked : 0;
    const diffLabel = diff > 0 ? `${formatMs(diff)} acima da média` : `${formatMs(Math.abs(diff))} abaixo da média`;
    const diffColor = diff > 0 ? '#ef4444' : '#22c55e';

    return `
      <h4 style="margin:1rem 0 .5rem"><i class="fas fa-chart-line"></i> Comparação Histórica</h4>
      <div class="detail-time-stats" id="ffHistoricalCompareBox">
        <div class="dts-item dts-total">
          <span class="dts-icon">🏷</span>
          <div><div class="dts-label">Código</div><div class="dts-val">${escapeHtml(code || '–')}</div></div>
        </div>
        <div class="dts-item dts-worked">
          <span class="dts-icon">▶</span>
          <div><div class="dts-label">Trabalhado agora</div><div class="dts-val">${formatMs(ts.worked)}</div></div>
        </div>
        <div class="dts-item dts-paused">
          <span class="dts-icon">📊</span>
          <div><div class="dts-label">Média local</div><div class="dts-val">${avgWorked ? formatMs(avgWorked) : 'Sem histórico local'}</div></div>
        </div>
        <div class="dts-item dts-idle">
          <span class="dts-icon">${avgWorked ? (diff > 0 ? '⚠️' : '✅') : '⏳'}</span>
          <div><div class="dts-label">Comparativo</div><div class="dts-val" style="color:${avgWorked ? diffColor : 'var(--text2)'}">${avgWorked ? diffLabel : 'Aguardando histórico'}</div></div>
        </div>
      </div>
      <div id="ffHistoricalCompareRemote" style="font-size:.78rem;color:var(--text2);margin-top:.4rem">
        Buscando média histórica no banco...
      </div>
    `;
  } catch (e) {
    return '';
  }
}

async function ffLoadHistoricalCompareRemote(lotId) {
  try {
    const lot = STATE.lots.find(l => l.id === lotId);
    const target = document.getElementById('ffHistoricalCompareRemote');
    if (!lot || !target) return;

    const code = String(lot.productCode || lot.produto_codigo || lot.raw_mysql?.produto_codigo || '').trim();
    const sector = ffGetLotCurrentSector(lot);
    if (!code || !sector) {
      target.textContent = 'Sem código/setor suficiente para comparar.';
      return;
    }

    const url = `${resolveFactoryFlowApiBase()}/api/producao/metricas/codigo/${encodeURIComponent(code)}?setor=${encodeURIComponent(sector)}&limit=200`;
    const res = await fetchWithTimeout(url, { headers: factoryFlowAuthHeaders(false) }, 7000);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false || !json.data) {
      target.textContent = 'Ainda não há média histórica consolidada no banco para este código/setor.';
      return;
    }

    const avg = json.data;
    const ts = getLotTimeSummary(lot);
    const avgWorked = Number(avg.avgWorkedMs || 0);
    const diff = avgWorked ? ts.worked - avgWorked : 0;
    const diffText = avgWorked
      ? (diff > 0 ? `⚠️ ${formatMs(diff)} acima da média histórica` : `✅ ${formatMs(Math.abs(diff))} abaixo da média histórica`)
      : 'Sem média histórica trabalhada.';

    target.innerHTML = `
      <strong>Média real no banco:</strong> ${avg.count || 0} passagem(ns) neste setor ·
      Total médio: <strong>${formatMs(avg.avgTotalMs || 0)}</strong> ·
      Trabalhado médio: <strong>${formatMs(avg.avgWorkedMs || 0)}</strong> ·
      Pausado médio: <strong>${formatMs(avg.avgPausedMs || 0)}</strong> ·
      Ocioso médio: <strong>${formatMs(avg.avgIdleMs || 0)}</strong><br>
      ${diffText}
    `;
  } catch (e) {
    const target = document.getElementById('ffHistoricalCompareRemote');
    if (target) target.textContent = 'Não consegui buscar a média histórica agora.';
  }
}

// ===================================================
// PATCH INDUSCOLOR – AVANÇO SEGURO PARA ENDURECEDOR
// Garante botão Avançar quando o fluxo padrão não retorna destino.
// ===================================================
function getSafeNextSectorOptions(lot) {
  let options = [];

  try {
    if (typeof getNextSectorOptions === 'function') {
      options = getNextSectorOptions(lot) || [];
    }
  } catch (err) {
    console.warn('getNextSectorOptions falhou, usando fluxo seguro:', err);
    options = [];
  }

  const rawSector = (typeof ffGetLotCurrentSector === 'function') ? ffGetLotCurrentSector(lot) : (lot?.sector || lot?.stage || lot?.status || lot?.currentSector || '');
  const sector = (typeof normalizeKanbanSector === 'function')
    ? normalizeKanbanSector(rawSector)
    : String(rawSector).trim().toLowerCase();

  const productType = String(lot?.productType || lot?.tipo || '').trim().toLowerCase();
  const productName = String(lot?.paint || lot?.productName || lot?.nome_produto || lot?.pits_nome_produto || '').trim().toLowerCase();
  const productCode = String(lot?.productCode || lot?.produto_codigo || lot?.pits_produto || '').trim().toLowerCase();

  const isEndurecedor =
    productType === 'endurecedor' ||
    productName.includes('endurecedor') ||
    productCode.startsWith('035');

  // Verniz NÃO pode ir direto para entregue/pronto após laboratório.
  // Fluxo correto: Laboratório -> Envase – Enlatamento -> Pronto para Entrega -> Rota/Entregue.
  const isVerniz =
    productType === 'verniz' ||
    productType === 'varnish' ||
    productName.includes('verniz') ||
    productName.includes('varnish') ||
    productCode.startsWith('027');

  const isBase =
    productType === 'base' ||
    String(lot?.tipo_lote || lot?.raw_mysql?.tipo_lote || '').trim().toLowerCase() === 'base' ||
    productName.includes('base');

  // BASE: não pode cair em Coloração nem Envase.
  // Produção -> Laboratório; Laboratório -> Finalizar/Entregue.
  if (isBase && sector === 'producao') {
    return [
      { value: 'laboratorio', label: '🔬 Laboratório' }
    ];
  }

  if (isBase && sector === 'laboratorio') {
    return [
      { value: 'entregue', label: '✅ Finalizar Base' }
    ];
  }

  // AMOSTRAS:
  // Laboratório – Amostras pode mandar para Coloração – Amostras ou Pronto.
  if (sector === 'laboratorio_amostras') {
    return [
      {
        value: 'coloracao_amostras',
        label: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS.coloracao_amostras)
          ? SECTOR_LABELS.coloracao_amostras
          : 'Coloração – Amostras'
      },
      {
        value: 'pronto',
        label: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS.pronto)
          ? SECTOR_LABELS.pronto
          : 'Pronto para Entrega'
      }
    ];
  }

  // Coloração – Amostras volta para Laboratório – Amostras.
  if (sector === 'coloracao_amostras') {
    return [
      {
        value: 'laboratorio_amostras',
        label: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS.laboratorio_amostras)
          ? SECTOR_LABELS.laboratorio_amostras
          : 'Laboratório – Amostras'
      }
    ];
  }

  // Produção: sempre deixa escolher o destino.
  if (sector === 'producao') {
    return [
      { value: 'laboratorio', label: '🔬 Laboratório' },
      { value: 'coloracao', label: '🎨 Coloração' }
    ];
  }

  // Endurecedor e Verniz no laboratório devem ir para Envase – Enlatamento.
  if ((isEndurecedor || isVerniz) && sector === 'laboratorio') {
    return [
      { value: 'envase_enlatamento', label: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS.envase_enlatamento) ? SECTOR_LABELS.envase_enlatamento : 'Envase – Enlatamento' }
    ];
  }

  // Endurecedor e Verniz no envase vão para Pronto para Entrega.
  if ((isEndurecedor || isVerniz) && ['envase', 'envase_produzir', 'envase_enlatamento', 'envase_producao'].includes(sector)) {
    return [
      { value: 'pronto', label: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS.pronto) ? SECTOR_LABELS.pronto : 'Pronto para Entrega' }
    ];
  }

  // Qualquer lote no Envase deve conseguir avançar para Pronto,
  // inclusive Diluente, Endurecedor e Saída Manual.
  if (['envase', 'envase_produzir', 'envase_enlatamento', 'envase_producao'].includes(sector)) {
    return [
      { value: 'pronto', label: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS.pronto) ? SECTOR_LABELS.pronto : 'Pronto para Entrega' }
    ];
  }

  if (Array.isArray(options) && options.length > 0) return options;

  return [];
}


// ===================================================
// PATCH INDUSCOLOR – NOME DO PRODUTO NO CARD
// Alguns lotes podem chegar com lot.paint igual ao código do produto
// (ex.: 035.060). Estes helpers priorizam o nome real vindo do MySQL/ERP.
// ===================================================
function ffLooksLikeProductCode(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return /^\d{2,4}[.\-]?\d{2,4}([.\-]?\d{1,4})?$/.test(s);
}

function ffGetLotProductCode(lot) {
  return String(
    lot?.productCode ||
    lot?.produto_codigo ||
    lot?.pits_produto ||
    lot?.raw_mysql?.produto_codigo ||
    lot?.raw_mysql?.pits_produto ||
    ''
  ).trim();
}

function ffGetLotProductName(lot) {
  const candidates = [
    lot?.productName,
    lot?.produto_nome,
    lot?.nome_produto,
    lot?.pits_nome_produto,
    lot?.raw_mysql?.produto_nome,
    lot?.raw_mysql?.pits_nome_produto,
    lot?.raw_mysql?.nome_produto,
    lot?.paint
  ];

  for (const value of candidates) {
    const s = String(value || '').trim();
    if (!s) continue;
    if (!ffLooksLikeProductCode(s)) return s;
  }

  return String(lot?.paint || ffGetLotProductCode(lot) || 'Produto não informado').trim();
}

// ===== LOT CARD BUILDER (shared) =====
function buildLotCard(lot) {
  const user = STATE.currentUser;
  const late  = isLate(lot);
  const today = isToday(lot.deliveryDate);
  const pColor = PRIORITY_COLORS[lot.priority];
  const sColor = SECTOR_COLORS[lot.sector] || '#6b7280';
  const history = Array.isArray(lot.history) ? lot.history : [];
  const lastEvent = history[history.length - 1];
  // Não usar timeAgo(lastEvent.timestamp), porque ele conta tempo corrido
  // mesmo com o expediente fechado. O motor correto é getLotTimeSummary(),
  // que respeita o botão Iniciar/Finalizar expediente.
  const timeSummary = typeof getLotTimeSummary === 'function'
    ? getLotTimeSummary(lot)
    : { total: 0, frozen: false };
  const timeInSector = timeSummary.total > 0 ? formatMs(timeSummary.total) : (lastEvent ? '0min' : '–');
  const expedientePausado =
    typeof canTrackWork === 'function' &&
    typeof isExpedienteAbertoForSector === 'function' &&
    canTrackWork(lot.sector) &&
    !isExpedienteAbertoForSector(lot.sector);
  const alertThreshold = Number(timeSummary.total || 0) > 7200000;
  const pt = lot.productType || 'tinta';
  const productName = ffGetLotProductName(lot);
  const productCode = ffGetLotProductCode(lot);

  const canAdvance = (user.role === 'sector' && user.sector === lot.sector &&
    !['pronto','entrega','entregue'].includes(lot.sector))
    || ['admin','pcp','pcp_lib','manager','diretoria'].includes(user.role);
  const nextOptions = getSafeNextSectorOptions(lot);

  const flowSteps = getProductFlow(pt);
  const currentIdx = flowSteps.indexOf(lot.sector);

  return `
    <div class="lot-card ${late?'late':''} ${alertThreshold?'alert-lot':''} priority-border-${lot.priority}" onclick="openLotDetail('${lot.id}')">
      <div class="lot-card-header">
        <div class="lot-number">#${lot.number}</div>
        <div class="priority-badge" style="background:${pColor}">${PRIORITY_LABELS[lot.priority]}</div>
      </div>
      <div class="lot-client"><i class="fas fa-building"></i> ${escapeHtml(lot.client)}</div>
      <div class="lot-paint"><i class="fas fa-paint-roller"></i> ${escapeHtml(productName)} – ${escapeHtml(String(lot.qty))} ${escapeHtml(lot.unit||'Kg')}</div>
      <div style="display:flex;gap:.4rem;align-items:center;margin:.3rem 0">
        <span class="product-type-badge type-${pt}">${PRODUCT_TYPES[pt]||pt}</span>
        ${lot.orderNumber ? `<span class="order-ref"><i class="fas fa-clipboard-list"></i> Ped. #${lot.orderNumber}</span>` : ''}
      </div>
      <div class="lot-sector-badge" style="background:${sColor}">
        <i class="fas fa-map-marker-alt"></i> ${SECTOR_LABELS[lot.sector]}
      </div>
      <div class="lot-flow-mini">
        ${flowSteps.map((s, i) => `
          <div class="flow-step-dot ${i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending'}"
               title="${SECTOR_LABELS[s]}"
               style="${i === currentIdx ? 'background:'+sColor : ''}">
          </div>`).join('')}
      </div>
      <div class="lot-meta">
        <span class="${late?'text-danger':today?'text-warning':''}">
          <i class="fas fa-calendar"></i> ${formatDate(lot.deliveryDate)}
          ${late?' ⚠️ ATRASADO':today?' 📅 HOJE':''}
        </span>
        <span class="text-muted">⏱ ${timeInSector} no setor${expedientePausado ? ' · expediente pausado' : ''}</span>
      </div>
      ${lot.city ? `<div class="lot-city"><i class="fas fa-map-pin"></i> ${escapeHtml(lot.city)}</div>` : ''}
      ${alertThreshold ? `<div class="alert-banner"><i class="fas fa-exclamation-triangle"></i> Atenção: possível atraso</div>` : ''}
      <div class="lot-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-outline" onclick="openLotDetail('${lot.id}')">
          <i class="fas fa-eye"></i> Detalhes
        </button>
        ${canAdvance && nextOptions.length > 0 ? `
          <button class="btn btn-sm btn-success" onclick="openSendSector('${lot.id}')">
            <i class="fas fa-arrow-right"></i> Avançar
          </button>` : ''}
      </div>
    </div>`;
}

// ===== ORDER CARD BUILDER =====
function buildOrderCard(order) {
  const lots = getOrderLots(order.id);
  const statusMap = { open:'Aberto', in_production:'Em Produção', ready:'Pronto', delivered:'Entregue' };
  const statusColors = { open:'#6b7280', in_production:'#8b5cf6', ready:'#22c55e', delivered:'#06b6d4' };
  const computedStatus = getOrderStatus(order);
  const sColor = statusColors[computedStatus] || '#6b7280';
  const pColor = PRIORITY_COLORS[order.priority] || '#22c55e';
  const late = order.deliveryDate < new Date().toISOString().split('T')[0] && computedStatus !== 'delivered';
  const today = isToday(order.deliveryDate) && computedStatus !== 'delivered';

  return `
    <div class="lot-card order-card" onclick="openOrderDetail('${order.id}')">
      <div class="lot-card-header">
        <div class="lot-number">Pedido #${escapeHtml(order.number)}</div>
        <div class="priority-badge" style="background:${pColor}">${PRIORITY_LABELS[order.priority]||'Normal'}</div>
      </div>
      <div class="lot-client"><i class="fas fa-building"></i> ${escapeHtml(order.client)}</div>
      <div class="lot-meta" style="margin:.4rem 0">
        <span class="${late?'text-danger':today?'text-warning':''}">
          <i class="fas fa-calendar"></i> ${formatDate(order.deliveryDate)}
          ${late?' ⚠️':today?' 📅 HOJE':''}
        </span>
        ${order.city ? `<span><i class="fas fa-map-pin"></i> ${escapeHtml(order.city)}</span>` : ''}
      </div>
      <div class="lot-sector-badge" style="background:${sColor}">
        <i class="fas fa-tasks"></i> ${statusMap[computedStatus]||computedStatus}
      </div>
      <div style="margin:.5rem 0;font-size:.78rem;color:var(--text2)">
        <i class="fas fa-boxes"></i> ${lots.length} lote(s)
        ${lots.length > 0 ? `· ${lots.filter(l=>l.sector==='entregue').length} entregue(s)` : ''}
      </div>
      ${lots.length > 0 ? `
        <div class="lot-flow-mini">
          ${lots.slice(0,6).map(l => `
            <div class="flow-step-dot ${['pronto','entregue'].includes(l.sector)?'done':'current'}"
                 title="#${l.number} – ${SECTOR_LABELS[l.sector]}"
                 style="background:${SECTOR_COLORS[l.sector]||'#6b7280'}">
            </div>`).join('')}
          ${lots.length > 6 ? `<span style="font-size:.65rem;color:var(--text3)">+${lots.length-6}</span>` : ''}
        </div>` : ''}
    </div>`;
}

// ===== RENDER LOTS PAGE =====
function renderLots() {
  const page = document.getElementById('pageLots');
  const user = STATE.currentUser;
  const lots = getLotsForUser(user);
  const canCreate = ['admin','pcp','pcp_lib'].includes(user.role);

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-boxes"></i> Lotes em Produção</h2>
      <div class="header-actions">
        <input type="text" id="lotSearch" placeholder="Buscar lote, cliente, tinta..." oninput="filterLots()" class="search-input" />
        ${canCreate ? `<button onclick="openNewOrderModal()" class="btn btn-primary"><i class="fas fa-plus"></i> Novo Pedido</button>` : ''}
      </div>
    </div>
    <div class="filter-tabs" id="lotFilterTabs">
      <button class="tab-btn active" onclick="filterByStatus('all',this)">Todos (${lots.length})</button>
      <button class="tab-btn" onclick="filterByStatus('active',this)">Em Produção</button>
      <button class="tab-btn" onclick="filterByStatus('pronto',this)">Pronto</button>
      <button class="tab-btn" onclick="filterByStatus('late',this)">⚠️ Atrasados</button>
      <button class="tab-btn" onclick="filterByStatus('sameday',this)">🔴 Mesmo Dia</button>
    </div>
    <div id="lotsGrid" class="lots-grid"></div>
  `;
  renderLotsGrid(lots);
}

let _lotsFilter = 'all';
function filterByStatus(status, btn) {
  _lotsFilter = status;
  document.querySelectorAll('#lotFilterTabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterLots();
}

function filterLots() {
  const user = STATE.currentUser;
  let lots = getLotsForUser(user);
  const q = document.getElementById('lotSearch')?.value.toLowerCase() || '';
  if (q) lots = lots.filter(l =>
    l.number.toLowerCase().includes(q) ||
    l.client.toLowerCase().includes(q) ||
    (l.paint||'').toLowerCase().includes(q) ||
    (l.productType||'').toLowerCase().includes(q)
  );
  if (_lotsFilter === 'active') lots = lots.filter(l => !['pronto','entrega','entregue'].includes(l.sector));
  else if (_lotsFilter === 'pronto')  lots = lots.filter(l => l.sector === 'pronto');
  else if (_lotsFilter === 'late')    lots = lots.filter(l => isLate(l));
  else if (_lotsFilter === 'sameday') lots = lots.filter(l => l.priority === 'sameday');
  renderLotsGrid(lots);
}

function renderLotsGrid(lots) {
  const grid = document.getElementById('lotsGrid');
  if (!grid) return;
  if (lots.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><p>Nenhum lote encontrado</p></div>';
    return;
  }
  grid.innerHTML = lots.map(lot => buildLotCard(lot)).join('');
}

// ===== LOT DETAIL =====
function openLotDetail(lotId) {
  const lot = STATE.lots.find(l => l.id === lotId);
  if (!lot) return;
  const user = STATE.currentUser;
  const canAdvance = (user.role === 'sector' && user.sector === lot.sector)
    || ['admin','pcp','pcp_lib','manager','diretoria'].includes(user.role);
  const nextOptions = getSafeNextSectorOptions(lot);
  const late  = isLate(lot);
  const today = isToday(lot.deliveryDate);
  const history = Array.isArray(lot.history) ? lot.history : [];
  const pt = lot.productType || 'tinta';
  const productName = ffGetLotProductName(lot);
  const productCode = ffGetLotProductCode(lot);
  const flow = getProductFlow(pt);
  const currentIdx = flow.indexOf(lot.sector);

  document.getElementById('modalLotDetailTitle').innerHTML =
    `<i class="fas fa-box"></i> Lote #${escapeHtml(lot.number)} – ${escapeHtml(lot.client)}`;

  document.getElementById('modalLotDetailBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-col">
        <h4><i class="fas fa-info-circle"></i> Informações</h4>
        <table class="detail-table">
          <tr><td>Lote</td><td><strong>#${escapeHtml(lot.number)}</strong></td></tr>
          ${lot.orderNumber ? `<tr><td>Pedido</td><td>#${escapeHtml(lot.orderNumber)}</td></tr>` : ''}
          <tr><td>Cliente</td><td>${escapeHtml(lot.client)}</td></tr>
          <tr><td>Cód. Produto</td><td>${escapeHtml(productCode || '–')}</td></tr>
          <tr><td>Tinta/Produto</td><td>${escapeHtml(productName)}</td></tr>
          <tr><td>Tipo</td><td><span class="product-type-badge type-${pt}">${PRODUCT_TYPES[pt]||pt}</span></td></tr>
          <tr><td>Quantidade</td><td>${escapeHtml(String(lot.qty))} ${escapeHtml(lot.unit||'Kg')}</td></tr>
          <tr><td>Prioridade</td><td><span class="priority-badge" style="background:${PRIORITY_COLORS[lot.priority]}">${PRIORITY_LABELS[lot.priority]}</span></td></tr>
          <tr><td>Setor Atual</td><td><span class="sector-tag" style="background:${SECTOR_COLORS[lot.sector]}">${SECTOR_LABELS[lot.sector]}</span></td></tr>
          <tr><td>Entrega</td><td class="${late?'text-danger':today?'text-warning':''}">${formatDate(lot.deliveryDate)} ${late?'⚠️ ATRASADO':today?'📅 HOJE':''}</td></tr>
          <tr><td>Cidade</td><td>${escapeHtml(lot.city||'–')}</td></tr>
          <tr><td>Endereço</td><td>${escapeHtml(lot.address||'–')}</td></tr>
          ${lot.notes?`<tr><td>Obs.</td><td>${escapeHtml(lot.notes)}</td></tr>`:''}
        </table>

        ${(() => {
          const ts = getLotTimeSummary(lot);
          const isTrackable = canTrackWork(lot.sector);
          const expedientePausadoDetalhe =
            typeof isExpedienteAbertoForSector === 'function' &&
            isTrackable &&
            !isExpedienteAbertoForSector(lot.sector);
          const effectiveSessionEnd = Number(ts.effectiveNow || 0) ||
            (typeof getEffectiveNowForLot === 'function' ? getEffectiveNowForLot(lot) : Date.now());
          if (!isTrackable && ts.total === 0) return '';
          const totalMs = ts.total || 1;
          const wPct = Math.min(100, Math.round(ts.worked/totalMs*100));
          const pPct = Math.min(100-wPct, Math.round(ts.paused/totalMs*100));
          return `
          <h4 style="margin:1rem 0 .5rem"><i class="fas fa-stopwatch"></i> Tempos no Setor Atual</h4>
          ${expedientePausadoDetalhe ? `
          <div class="alert-banner" style="margin-bottom:.75rem">
            <i class="fas fa-pause-circle"></i> Expediente fechado: a contagem deste setor está congelada.
          </div>` : ''}
          <div class="detail-time-stats">
            <div class="dts-item dts-total">
              <span class="dts-icon">⏱</span>
              <div><div class="dts-label">Total no Setor</div><div class="dts-val">${formatMs(ts.total)}</div></div>
            </div>
            <div class="dts-item dts-worked">
              <span class="dts-icon">▶</span>
              <div><div class="dts-label">Trabalhado</div><div class="dts-val">${formatMs(ts.worked)}</div></div>
            </div>
            <div class="dts-item dts-paused">
              <span class="dts-icon">⏸</span>
              <div><div class="dts-label">Pausado</div><div class="dts-val">${formatMs(ts.paused)}</div></div>
            </div>
            <div class="dts-item dts-idle">
              <span class="dts-icon">💤</span>
              <div><div class="dts-label">Aguardando</div><div class="dts-val">${formatMs(ts.idle)}</div></div>
            </div>
          </div>
          <div class="detail-time-bar">
            <div class="dtb-worked" style="width:${wPct}%" title="Trabalhado ${wPct}%"></div>
            <div class="dtb-paused" style="width:${pPct}%" title="Pausado ${pPct}%"></div>
            <div class="dtb-idle"   style="width:${100-wPct-pPct}%" title="Ocioso"></div>
          </div>
          ${ffLotTempoComparativoHtml(lot)}
          ${Array.isArray(lot.workSessions) && lot.workSessions.filter(s=>s.sector===lot.sector).length>0 ? `
          <h4 style="margin:1rem 0 .5rem;font-size:.82rem;color:var(--text2)"><i class="fas fa-list-ul"></i> Sessões de Trabalho</h4>
          <div class="work-sessions-list">
            ${lot.workSessions.filter(s=>s.sector===lot.sector).map((s,i)=>`
              <div class="ws-item">
                <div class="ws-num">${i+1}</div>
                <div class="ws-info">
                  <span>${formatDateTime(s.start)} → ${s.end?formatDateTime(s.end):'<em style="color:var(--green)">Em andamento</em>'}</span>
                  <span class="ws-dur">${formatMs(s.end ? (s.end - s.start) : (effectiveSessionEnd - s.start))}</span>
                  ${s.pauseReason?`<div class="ws-reason">⏸ ${s.pauseReason}</div>`:''}
                </div>
              </div>`).join('')}
          </div>` : ''}`;
        })()}

        <h4 style="margin:1rem 0 .5rem"><i class="fas fa-route"></i> Fluxo de Produção</h4>
        <div class="flow-steps-detail">
          ${flow.map((s, i) => `
            <div class="flow-detail-step ${i < currentIdx ? 'step-done' : i === currentIdx ? 'step-current' : 'step-pending'}">
              <div class="flow-detail-dot" style="${i <= currentIdx ? 'background:'+SECTOR_COLORS[s] : ''}"></div>
              <span>${SECTOR_LABELS[s]}</span>
              ${i === currentIdx ? '<span class="step-now-badge">Agora</span>' : ''}
              ${i < currentIdx ? '<i class="fas fa-check step-check"></i>' : ''}
            </div>`).join('')}
        </div>

        ${canAdvance && nextOptions.length > 0 ? `
          <button class="btn btn-primary" style="margin-top:1rem;width:100%" onclick="openSendSector('${lot.id}');closeModal();">
            <i class="fas fa-arrow-right"></i> Enviar para Próximo Setor
          </button>` : ''}
        ${lot.sector === 'pronto' && ['admin','pcp','pcp_lib','manager','diretoria'].includes(user.role) ? `
          <div style="display:grid;grid-template-columns:1fr;gap:.5rem;margin-top:.5rem">
            <button class="btn btn-warning" style="width:100%" onclick="openSendToDelivery('${lot.id}');closeModal();">
              <i class="fas fa-truck"></i> Incluir em Rota de Entrega
            </button>
            <button class="btn btn-success" style="width:100%" onclick="confirmClientPickup('${lot.id}');closeModal();">
              <i class="fas fa-handshake"></i> Cliente retirou / Finalizar
            </button>
          </div>` : ''}
      </div>

      <div class="detail-col">
        <h4><i class="fas fa-history"></i> Histórico</h4>
        <div class="timeline">
          ${history.map(h => `
            <div class="timeline-item">
              <div class="timeline-dot" style="background:${SECTOR_COLORS[h.sector]||'#6b7280'}"></div>
              <div class="timeline-content">
                <div class="timeline-action">${escapeHtml(h.action)}</div>
                <div class="timeline-meta">
                  <i class="fas fa-user"></i> ${escapeHtml(h.userName)} &nbsp;
                  <i class="fas fa-clock"></i> ${formatDateTime(h.timestamp)}
                </div>
              </div>
            </div>`).join('')}
        </div>

        <!-- TEMPOS POR SETOR – renderizado por relatorio-tempos.js -->
        ${typeof renderLotSectorTimesHistory === 'function'
          ? renderLotSectorTimesHistory(lot)
          : ''}

      </div>
    </div>`;
  openModal('modalLotDetail');
  if (typeof ffLoadHistoricalCompareRemote === 'function') ffLoadHistoricalCompareRemote(lot.id);
}

// ===== ORDER DETAIL =====
function openOrderDetail(orderId) {
  const order = STATE.orders.find(o => o.id === orderId);
  if (!order) return;
  const lots = getOrderLots(orderId);
  const statusMap = { open:'Aberto', in_production:'Em Produção', ready:'Pronto', delivered:'Entregue' };
  const computedStatus = getOrderStatus(order);
  const late  = order.deliveryDate < new Date().toISOString().split('T')[0] && computedStatus !== 'delivered';
  const today = isToday(order.deliveryDate) && computedStatus !== 'delivered';

  document.getElementById('modalOrderDetailTitle').innerHTML =
    `<i class="fas fa-clipboard-list"></i> Pedido #${escapeHtml(order.number)}`;

  document.getElementById('modalOrderDetailBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-col">
        <h4><i class="fas fa-info-circle"></i> Dados do Pedido</h4>
        <table class="detail-table">
          <tr><td>Pedido</td><td><strong>#${escapeHtml(order.number)}</strong></td></tr>
          <tr><td>Cliente</td><td>${escapeHtml(order.client)}</td></tr>
          <tr><td>Entrega</td><td class="${late?'text-danger':today?'text-warning':''}">${formatDate(order.deliveryDate)} ${late?'⚠️':today?'📅 HOJE':''}</td></tr>
          <tr><td>Cidade</td><td>${escapeHtml(order.city||'–')}</td></tr>
          <tr><td>Endereço</td><td>${escapeHtml(order.address||'–')}</td></tr>
          <tr><td>Prioridade</td><td><span class="priority-badge" style="background:${PRIORITY_COLORS[order.priority]}">${PRIORITY_LABELS[order.priority]||'Normal'}</span></td></tr>
          <tr><td>Status</td><td>${statusMap[computedStatus]||escapeHtml(computedStatus)}</td></tr>
          ${order.notes ? `<tr><td>Obs.</td><td>${escapeHtml(order.notes)}</td></tr>` : ''}
        </table>
      </div>
      <div class="detail-col">
        <h4><i class="fas fa-boxes"></i> Lotes do Pedido (${lots.length})</h4>
        ${lots.length === 0
          ? '<div class="empty-state"><p>Nenhum lote</p></div>'
          : `<div class="order-lots-list">
              ${lots.map(l => `
                <div class="order-lot-row" onclick="openLotDetail('${l.id}')">
                  <div style="display:flex;align-items:center;gap:.5rem">
                    <strong>#${escapeHtml(l.number)}</strong>
                    <span class="product-type-badge type-${l.productType||'tinta'}">${PRODUCT_TYPES[l.productType||'tinta']||l.productType}</span>
                  </div>
                  <div style="font-size:.8rem;color:var(--text2)">${escapeHtml(l.paint)} · ${escapeHtml(String(l.qty))}${escapeHtml(l.unit||'Kg')}</div>
                  <div class="lot-sector-badge" style="background:${SECTOR_COLORS[l.sector]};font-size:.72rem;padding:.2rem .6rem">
                    ${SECTOR_LABELS[l.sector]}
                  </div>
                </div>`).join('')}
            </div>`}
      </div>
    </div>
    <div class="modal-footer">
      <button onclick="closeModal()" class="btn btn-secondary">Fechar</button>
    </div>`;
  openModal('modalOrderDetail');
}

// ===== SEND TO SECTOR =====
let _pendingSendLotId  = null;
let _pendingSendSector = null;

function openSendSector(lotId) {
  _pendingSendLotId  = lotId;
  _pendingSendSector = null;

  const lot = STATE.lots.find(l => l.id === lotId);
  if (!lot) return;

  let options = getSafeNextSectorOptions(lot);

  // Produção normal ainda pode escolher destino, mas BASE é tratada dentro de getSafeNextSectorOptions()
  // e retorna somente Laboratório. Este fallback só entra se alguma regra antiga devolver vazio.
  if ((!Array.isArray(options) || options.length === 0) && ffGetLotCurrentSector(lot) === 'producao') {
    options = [
      { value: 'laboratorio', label: '🔬 Laboratório' },
      { value: 'coloracao', label: '🎨 Coloração' }
    ];
  }

  // Segurança extra:
  // Se por qualquer motivo o fluxo retornar vazio para lote em Envase,
  // força o destino correto para evitar o alerta "Selecione o destino do lote".
  const setorAtualNormalizado = ffGetLotCurrentSector(lot);
  if ((!Array.isArray(options) || options.length === 0) &&
      ['envase', 'envase_produzir', 'envase_enlatamento', 'envase_producao'].includes(setorAtualNormalizado)) {
    options = [
      {
        value: 'pronto',
        label: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS.pronto)
          ? SECTOR_LABELS.pronto
          : 'Pronto para Entrega'
      }
    ];
  }

  // ===================================================
  // RESTO DO SISTEMA NORMAL
  // ===================================================
  document.getElementById('modalSendSectorText').textContent =
    `Lote #${lot.number} – ${lot.client} | Setor atual: ${SECTOR_LABELS[ffGetLotCurrentSector(lot)] || SECTOR_LABELS[lot.sector] || lot.sector}`;

  const optDiv = document.getElementById('modalSendSectorOptions');

  if (!Array.isArray(options) || options.length === 0) {
    _pendingSendSector = null;
    optDiv.innerHTML = `<p style="color:#fca5a5"><i class="fas fa-exclamation-triangle"></i> Nenhum destino disponível para este lote.</p>`;
  } else if (options.length === 1) {
    _pendingSendSector = options[0].value;
    optDiv.innerHTML = `<p>Destino: <strong>${options[0].label}</strong></p>`;
  } else {
    optDiv.innerHTML = options.map(opt => `
      <label class="radio-option">
        <input type="radio" name="sendSector" value="${opt.value}" onchange="_pendingSendSector=this.value" />
        ${opt.label}
      </label>
    `).join('');
  }

  document.getElementById('sendSectorNote').value = '';
  openModal('modalSendSector');
}

async function confirmSendToSector() {
  const lot = STATE.lots.find(l => l.id === _pendingSendLotId);
  if (!_pendingSendLotId || !lot) return;

  if (!_pendingSendSector) {
    const setorAtual = ffGetLotCurrentSector(lot);
    if (['envase', 'envase_produzir', 'envase_enlatamento', 'envase_producao'].includes(setorAtual)) {
      _pendingSendSector = 'pronto';
    }
  }

  if (!_pendingSendSector) {
    alert('Selecione o destino do lote.');
    return;
  }

  const user = STATE.currentUser;
  const note = document.getElementById('sendSectorNote').value.trim();
  const btn  = document.getElementById('btnConfirmSend');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

  if (_pendingSendSector === 'laboratorio' && ffGetLotCurrentSector(lot) === 'producao') lot.skipColor = true;

  // Segurança extra: verniz nunca pode sair do Laboratório direto como entregue/pronto.
  const _ptCheck = String(lot.productType || lot.tipo || '').trim().toLowerCase();
  const _nameCheck = String(lot.paint || lot.productName || lot.nome_produto || lot.pits_nome_produto || '').trim().toLowerCase();
  const _codeCheck = String(lot.productCode || lot.produto_codigo || lot.pits_produto || '').trim().toLowerCase();
  const _isVernizLot = _ptCheck === 'verniz' || _ptCheck === 'varnish' || _nameCheck.includes('verniz') || _nameCheck.includes('varnish') || _codeCheck.startsWith('027');

  if (
    _isVernizLot &&
    ffGetLotCurrentSector(lot) === 'laboratorio' &&
    ['entregue', 'entrega', 'pronto', 'retirada', 'finalizado'].includes(String(_pendingSendSector || '').toLowerCase())
  ) {
    _pendingSendSector = 'envase_enlatamento';
  }

  if (
    _isVernizLot &&
    ['envase', 'envase_produzir', 'envase_enlatamento', 'envase_producao'].includes(ffGetLotCurrentSector(lot)) &&
    ['entregue', 'entrega', 'retirada', 'finalizado'].includes(String(_pendingSendSector || '').toLowerCase())
  ) {
    _pendingSendSector = 'pronto';
  }

  // BASE: nunca vai para Coloração, Envase ou Pronto.
  // Produção sempre envia para Laboratório; Laboratório finaliza como Entregue.
  const _isBaseLot =
    _ptCheck === 'base' ||
    String(lot.tipo_lote || lot.raw_mysql?.tipo_lote || '').trim().toLowerCase() === 'base' ||
    _nameCheck.includes('base');

  if (_isBaseLot && ffGetLotCurrentSector(lot) === 'producao') {
    _pendingSendSector = 'laboratorio';
  }

  if (_isBaseLot && ffGetLotCurrentSector(lot) === 'laboratorio') {
    _pendingSendSector = 'entregue';
  }

  // ===================================================
  // CORREÇÃO DEFINITIVA – LABORATÓRIO → ENVASE ENLATAMENTO
  // ===================================================
  // Antes, alguns fluxos ainda salvavam apenas "envase".
  // Como agora existem dois quadros separados:
  // - envase_produzir
  // - envase_enlatamento
  // tudo que sair do Laboratório para Envase precisa cair em Envase – Enlatamento.
  if (
    ffGetLotCurrentSector(lot) === 'laboratorio' &&
    ['envase', 'envase_produzir', 'envase_producao', 'envase_antigo'].includes(String(_pendingSendSector || '').toLowerCase())
  ) {
    _pendingSendSector = 'envase_enlatamento';
  }

  // Salva o setor em TODOS os campos que o app usa.
  // Isso evita o bug onde o modo TV via stage/status mostrava o lote, mas o Kanban normal não,
  // porque ele filtrava pelo campo sector.
  const previousSector = ffGetLotCurrentSector(lot);
  const now = Date.now();
  const history = ffEnsureLotHistoryBeforeAction(lot, user, previousSector);

  // Fecha qualquer sessão aberta e consolida a métrica do setor que está sendo encerrado.
  if (typeof ffCloseOpenWorkSessions === 'function') {
    ffCloseOpenWorkSessions(lot, now, 'Encerrada automaticamente ao avançar de setor');
  }
  let finishedMetric = null;
  if (typeof ffFinalizeCurrentSectorMetric === 'function') {
    finishedMetric = ffFinalizeCurrentSectorMetric(lot, now, {
      user: user.id,
      userName: user.name,
      note
    });
  }

  const savedSector = ffApplySectorToLot(lot, _pendingSendSector);
  lot.sectorEnteredAt = now; // ← CRITICAL: reset timer when lot moves to new sector
  lot.lotStatus       = 'idle';     // reset work status on sector change

  history.push({
    sector:    savedSector,
    user:      user.id,
    userName:  user.name,
    action:    `Enviado para ${SECTOR_LABELS[savedSector] || savedSector}${note?' – '+note:''}`,
    timestamp: now
  });
  lot.history = history;

  try {
    await apiUpdateLot(lot);
    closeModal();
    _pendingSendLotId  = null;
    _pendingSendSector = null;
    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    // Renderiza imediatamente com dados em memória (sem flicker)
    if (activePage) _silentRefresh(activePage);
    showToast(`✅ Lote enviado para ${SECTOR_LABELS[lot.sector] || lot.sector}`);
    // Recarrega dados do backend em background para sincronizar outros usuários
    // na próxima renderização automática (sem piscar a tela)
    setTimeout(async () => {
      try {
        await reloadData();
        const currentPage = document.querySelector('.nav-item.active')?.dataset.page;
        if (currentPage && !isModalOrEditingActive()) _silentRefresh(currentPage);
      } catch (_) {}
    }, 800);
  } catch(err) {
    alert('Erro ao salvar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Confirmar Envio';
  }
}

// ===== NEW ORDER MODAL =====
let _lotRows = 1;

function openNewOrderModal() {
  document.getElementById('formNewOrder').reset();
  document.getElementById('orderDeliveryDate').min = new Date().toISOString().split('T')[0];
  _lotRows = 0;
  document.getElementById('lotRowsContainer').innerHTML = '';
  addLotRow();
  openModal('modalNewOrder');
}

function addLotRow() {
  _lotRows++;
  const container = document.getElementById('lotRowsContainer');
  const row = document.createElement('div');
  row.className = 'lot-row-form';
  row.id = `lotRow-${_lotRows}`;
  row.innerHTML = `
    <div class="lot-row-header">
      <span><i class="fas fa-box"></i> Lote ${_lotRows}</span>
      ${_lotRows > 1 ? `<button type="button" onclick="removeLotRow(${_lotRows})" class="btn btn-sm btn-danger"><i class="fas fa-trash"></i></button>` : ''}
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Número do Lote *</label>
        <input type="text" name="lotNumber_${_lotRows}" placeholder="Ex: 084501" required />
      </div>
      <div class="form-group">
        <label>Tipo de Produto *</label>
        <select name="productType_${_lotRows}" onchange="updateProductTypeHint(${_lotRows},this.value)" required>
          <option value="tinta">🎨 Tinta</option>
          <option value="diluente">💧 Diluente</option>
          <option value="endurecedor">⚗️ Endurecedor</option>
          <option value="base">🧪 Base</option>
        </select>
      </div>
      <div class="form-group">
        <label>Nome do Produto *</label>
        <input type="text" name="paint_${_lotRows}" placeholder="Ex: Branco Neve" required />
      </div>
      <div class="form-group">
        <label>Código do Produto</label>
        <input type="text" name="productCode_${_lotRows}" placeholder="Código" />
      </div>
      <div class="form-group">
        <label>Quantidade *</label>
        <input type="number" name="qty_${_lotRows}" placeholder="500" required min="0.1" step="0.1" />
      </div>
      <div class="form-group">
        <label>Unidade</label>
        <select name="unit_${_lotRows}">
          <option value="Kg">Kg</option>
          <option value="L">Litros</option>
        </select>
      </div>
    </div>
    <div id="flowHint_${_lotRows}" class="flow-hint">
      <i class="fas fa-route"></i> Fluxo: Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → Pesagem → Produção → Coloração → Laboratório → Envase → Pronto
    </div>`;
  container.appendChild(row);
}

function removeLotRow(rowId) {
  const el = document.getElementById(`lotRow-${rowId}`);
  if (el) el.remove();
}

function updateProductTypeHint(rowId, type) {
  const hint = document.getElementById(`flowHint_${rowId}`);
  if (!hint) return;
  const flows = {
    tinta:       'Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → Pesagem → Produção → Coloração → Laboratório → Envase → Pronto',
    diluente:    'Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → Envase → Pronto (sem Pesagem/Produção/Coloração)',
    endurecedor: 'Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → [Pesagem → Produção → Envase] OU [Direto Envase] → Pronto',
    base:        'Col.(Rev.) → Lab.(Rev.) → PCP(Lib.) → Pesagem → Produção → Laboratório → Finalizado'
  };
  hint.innerHTML = `<i class="fas fa-route"></i> Fluxo: ${flows[type] || flows.tinta}`;
}

async function submitNewOrder(e) {
  e.preventDefault();
  const user = STATE.currentUser;
  const btn  = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';

  const orderNumber  = document.getElementById('orderNumber').value.trim();
  const client       = document.getElementById('orderClient').value.trim();
  const city         = document.getElementById('orderCity').value.trim();
  const address      = document.getElementById('orderAddress').value.trim();
  const deliveryDate = document.getElementById('orderDeliveryDate').value;
  const priority     = document.getElementById('orderPriority').value;
  const notes        = document.getElementById('orderNotes').value.trim();

  // Check duplicate order number
  if (STATE.orders.find(o => o.number === orderNumber)) {
    alert('Já existe um pedido com esse número!');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Criar Pedido';
    return;
  }

  // Collect lot rows
  const container = document.getElementById('lotRowsContainer');
  const lotRows = Array.from(container.querySelectorAll('.lot-row-form'));
  if (lotRows.length === 0) {
    alert('Adicione pelo menos um lote ao pedido.');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Criar Pedido';
    return;
  }

  const lotsData = lotRows.map(row => {
    const rowId = row.id.replace('lotRow-', '');
    return {
      lotNumber:   row.querySelector(`[name="lotNumber_${rowId}"]`)?.value?.trim(),
      productType: row.querySelector(`[name="productType_${rowId}"]`)?.value,
      paint:       row.querySelector(`[name="paint_${rowId}"]`)?.value?.trim(),
      productCode: row.querySelector(`[name="productCode_${rowId}"]`)?.value?.trim() || '',
      qty:         parseFloat(row.querySelector(`[name="qty_${rowId}"]`)?.value) || 0,
      unit:        row.querySelector(`[name="unit_${rowId}"]`)?.value || 'Kg'
    };
  }).filter(l => l.lotNumber && l.qty > 0);

  if (lotsData.length === 0) {
    alert('Preencha os dados dos lotes corretamente.');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Criar Pedido';
    return;
  }

  // Check for duplicate lot numbers
  for (const ld of lotsData) {
    if (STATE.lots.find(l => l.number === ld.lotNumber)) {
      alert(`Lote #${ld.lotNumber} já existe no sistema!`);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Criar Pedido';
      return;
    }
  }

  try {
    const orderId = genId('ord');
    const lotIds  = [];

    for (const ld of lotsData) {
      const lot = {
        id:          genId('lot'),
        number:      ld.lotNumber,
        orderId,
        orderNumber,
        client,
        productCode: ld.productCode,
        paint:       ld.paint,
        productType: ld.productType,
        tipo_lote:   ld.productType,
        linha_produto: ld.productType,
        qty:         ld.qty,
        unit:        ld.unit,
        priority,
        deliveryDate,
        skipColor:   false,
        city,
        address,
        notes,
        sector:          'coloracao_revisao',
        lotStatus:       'idle',
        workSessions:    [],
        sectorEnteredAt: Date.now(),
        createdAt:       Date.now(),
        createdBy:       user.id,
        history: [{
          sector:    'coloracao_revisao',
          user:      user.id,
          userName:  user.name,
          action:    `Lote criado – Pedido #${orderNumber} – Aguardando Coloração (Revisão)`,
          timestamp: Date.now()
        }]
      };
      const created = await apiCreateLot(lot);
      lotIds.push(created.id);
    }

    const order = {
      id:          orderId,
      number:      orderNumber,
      client,
      city,
      address,
      deliveryDate,
      priority,
      notes,
      status:      'in_production',
      createdAt:   Date.now(),
      createdBy:   user.id,
      lotIds
    };
    await apiCreateOrder(order);

    closeModal();
    renderLots();
    showToast(`✅ Pedido #${orderNumber} criado com ${lotIds.length} lote(s)!`);
  } catch(err) {
    alert('Erro ao criar pedido: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Criar Pedido';
  }
}

// ===== ORDERS PAGE =====
function renderOrdersPage() {
  const page = document.getElementById('pageOrders');
  const lots  = STATE.lots;
  const orders = STATE.orders;
  const canCreate = ['admin','pcp','pcp_lib'].includes(STATE.currentUser.role);

  const todayLots    = lots.filter(l => isToday(l.deliveryDate) && l.sector !== 'entregue');
  const urgentLots   = lots.filter(l => l.priority === 'urgent'  && l.sector !== 'entregue');
  const sameDayLots  = lots.filter(l => l.priority === 'sameday' && l.sector !== 'entregue');
  const lateLots     = lots.filter(l => isLate(l));
  const readyLots    = lots.filter(l => l.sector === 'pronto');
  const deliveredLots= lots.filter(l => l.sector === 'entregue');

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-clipboard-list"></i> Pedidos e Ordens</h2>
      ${canCreate ? `<button onclick="openNewOrderModal()" class="btn btn-primary"><i class="fas fa-plus"></i> Novo Pedido</button>` : ''}
    </div>
    <div class="metrics-row">
      <div class="metric-card metric-blue"><div class="metric-num">${orders.length}</div><div class="metric-label">Total Pedidos</div></div>
      <div class="metric-card metric-purple"><div class="metric-num">${lots.filter(l=>!['entregue'].includes(l.sector)).length}</div><div class="metric-label">Lotes Ativos</div></div>
      <div class="metric-card metric-red"><div class="metric-num">${lateLots.length}</div><div class="metric-label">Atrasados</div></div>
      <div class="metric-card metric-yellow"><div class="metric-num">${urgentLots.length}</div><div class="metric-label">Urgentes</div></div>
      <div class="metric-card metric-green"><div class="metric-num">${readyLots.length}</div><div class="metric-label">Prontos</div></div>
    </div>
    <div class="section-tabs">
      <button class="tab-btn active" onclick="showOrderTab('orders',this)">📋 Pedidos (${orders.length})</button>
      <button class="tab-btn" onclick="showOrderTab('today',this)">📅 Hoje (${todayLots.length})</button>
      <button class="tab-btn" onclick="showOrderTab('urgent',this)">🟡 Urgentes (${urgentLots.length})</button>
      <button class="tab-btn" onclick="showOrderTab('sameday',this)">🔴 Mesmo Dia (${sameDayLots.length})</button>
      <button class="tab-btn" onclick="showOrderTab('late',this)">⚠️ Atrasados (${lateLots.length})</button>
      <button class="tab-btn" onclick="showOrderTab('ready',this)">✅ Prontos (${readyLots.length})</button>
      <button class="tab-btn" onclick="showOrderTab('delivered',this)">📦 Entregues (${deliveredLots.length})</button>
    </div>
    <div id="orderTabContent" class="lots-grid"></div>`;
  showOrderTab('orders', document.querySelector('#pageOrders .tab-btn'));
}

function showOrderTab(tab, btn) {
  document.querySelectorAll('#pageOrders .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const lots = STATE.lots;
  const grid = document.getElementById('orderTabContent');
  let html = '';

  if (tab === 'orders') {
    const orders = STATE.orders;
    if (orders.length === 0) {
      grid.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard"></i><p>Nenhum pedido cadastrado</p></div>';
      return;
    }
    html = orders.slice().reverse().map(o => buildOrderCard(o)).join('');
  } else {
    let filtered;
    switch(tab) {
      case 'today':     filtered = lots.filter(l => isToday(l.deliveryDate) && l.sector!=='entregue'); break;
      case 'urgent':    filtered = lots.filter(l => l.priority==='urgent'   && l.sector!=='entregue'); break;
      case 'sameday':   filtered = lots.filter(l => l.priority==='sameday'  && l.sector!=='entregue'); break;
      case 'late':      filtered = lots.filter(l => isLate(l)); break;
      case 'ready':     filtered = lots.filter(l => l.sector==='pronto'); break;
      case 'delivered': filtered = lots.filter(l => l.sector==='entregue'); break;
      default: filtered = lots;
    }
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>Nenhum item nesta categoria</p></div>';
      return;
    }
    html = filtered.map(lot => buildLotCard(lot)).join('');
  }
  grid.innerHTML = html;
}


// ===== CLIENTE RETIROU / FINALIZAR SEM ROTA =====
async function confirmClientPickup(lotId) {
  const lot = STATE.lots.find(l => l.id === lotId);
  const user = STATE.currentUser;

  if (!lot || !user) return;

  const ok = confirm(`Confirmar retirada pelo cliente?\n\nLote #${lot.number} – ${lot.client}\n\nEle será finalizado e sairá do Kanban.`);
  if (!ok) return;

  const now = Date.now();

  lot.sector = 'entregue';
  lot.lotStatus = 'finalizado';
  lot.sectorEnteredAt = now;
  lot.deliveryMode = 'retirada_cliente';
  lot.deliveredAt = now;
  lot.deliveredBy = user.name || user.username || 'PCP';

  lot.history = ffEnsureLotHistoryBeforeAction(lot, user, lot.sector);
  lot.history.push({
    sector: 'entregue',
    user: user.id,
    userName: user.name || user.username || 'PCP',
    action: 'Cliente retirou o pedido – lote finalizado sem rota de motorista',
    timestamp: now
  });

  try {
    await apiUpdateLot(lot);

    if (typeof reloadData === 'function') await reloadData();
    if (typeof renderKanban === 'function') renderKanban();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderLots === 'function') renderLots();

    showToast(`✅ Lote #${lot.number} finalizado por retirada do cliente.`);
  } catch (err) {
    alert('Erro ao finalizar retirada: ' + err.message);
  }
}


// ===== MOTORISTAS DO BACKEND CENTRAL =====
const FACTORYFLOW_BACKEND_API = (typeof PEDIDOS_API !== 'undefined' && PEDIDOS_API)
  ? PEDIDOS_API
  : 'https://app-producao-backend-production.up.railway.app';

async function carregarMotoristasFactoryFlow() {
  try {
    const _motoristasToken = (typeof ffLotsRouteResolveToken === 'function') ? ffLotsRouteResolveToken() : '';
    const res = await fetch(`${FACTORYFLOW_BACKEND_API}/api/motoristas`, {
      headers: _motoristasToken
        ? { 'Authorization': `Bearer ${_motoristasToken}` }
        : {}
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }

    return Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    console.warn('Falha ao buscar motoristas no backend central:', err.message);

    // Fallback: usa STATE.users se a API estiver indisponível
    return (STATE.users || []).filter(u => {
      const role   = String(u.role || '').toLowerCase().trim();
      const acesso = String(u.acesso_factoryflow || u.factoryflow_access || u.acessoFactoryFlow || '').toLowerCase().trim();
      const setor  = String(u.sector || u.setor || '').toLowerCase().trim();

      return (
        role === 'driver' ||
        role === 'motorista' ||
        acesso === 'motorista' ||
        acesso === 'driver' ||
        setor === 'motorista'
      ) && u.ativo !== 0 && u.active !== false;
    });
  }
}


// ===================================================
// PATCH ROTAS API – salva rota direto no banco ff_routes
// Tabela esperada: id, driverId, driverName, lots, status, createdAt, departureTime
// ===================================================
function ffLotsRouteResolveApiBase() {
  if (typeof PEDIDOS_API !== 'undefined' && PEDIDOS_API) return String(PEDIDOS_API).replace(/\/$/, '');
  if (typeof API_BASE !== 'undefined' && API_BASE) return String(API_BASE).replace(/\/$/, '');
  if (typeof API_URL !== 'undefined' && API_URL) return String(API_URL).replace(/\/$/, '');
  if (typeof BACKEND_URL !== 'undefined' && BACKEND_URL) return String(BACKEND_URL).replace(/\/$/, '');
  if (window.PEDIDOS_API) return String(window.PEDIDOS_API).replace(/\/$/, '');
  if (window.API_BASE) return String(window.API_BASE).replace(/\/$/, '');
  if (window.API_URL) return String(window.API_URL).replace(/\/$/, '');
  return 'https://app-producao-backend-production.up.railway.app';
}

function ffLotsRouteResolveToken() {
  return sessionStorage.getItem('ff_token')
    || localStorage.getItem('ff_token')
    || localStorage.getItem('factoryflow_token')
    || localStorage.getItem('ff_api_token')
    || localStorage.getItem('api_token')
    || localStorage.getItem('token')
    || '';
}

function ffLotsRouteHeaders(json = true) {
  const token = ffLotsRouteResolveToken();
  const headers = json ? { 'Content-Type': 'application/json' } : {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function ffLotsSerializeRoute(route) {
  return {
    id: String(route.id),
    driverId: route.driverId != null ? String(route.driverId) : '',
    driverName: String(route.driverName || ''),
    lots: JSON.stringify(Array.isArray(route.lots) ? route.lots : []),
    status: String(route.status || 'pending'),
    createdAt: Number(route.createdAt) || Date.now(),
    departureTime: route.departureTime ? Number(route.departureTime) : null
  };
}

async function ffLotsSaveRouteToBackend(route) {
  // Se deliveries.js novo estiver carregado, usa ele. Senão usa este fallback direto.
  if (typeof ffSaveRouteToBackend === 'function') {
    return await ffSaveRouteToBackend(route);
  }

  const api = ffLotsRouteResolveApiBase();
  const payload = ffLotsSerializeRoute(route);
  const id = encodeURIComponent(payload.id);

  let res = await fetch(`${api}/api/tables/ff_routes/${id}`, {
    method: 'PUT',
    headers: ffLotsRouteHeaders(true),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    res = await fetch(`${api}/api/tables/ff_routes`, {
      method: 'POST',
      headers: ffLotsRouteHeaders(true),
      body: JSON.stringify(payload)
    });
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Falha ao salvar rota em ff_routes (${res.status}): ${txt}`);
  }

  return await res.json().catch(() => ({ ok: true }));
}

// ===== SEND TO DELIVERY POR PEDIDO =====
// Agora a rota é criada por PEDIDO, não por lote.
// Só aparecem pedidos onde TODOS os lotes ativos do pedido estão em "pronto".
function getDeliveryOrderKey(lot) {
  return String(
    lot?.orderNumber ||
    lot?.pedido ||
    lot?.pits_numero ||
    lot?.orderId ||
    lot?.pedidoNumero ||
    lot?.number ||
    lot?.id ||
    ''
  ).trim();
}

function getDeliveryLotOrderKey(lot) {
  // Para agrupar corretamente, prioriza o número do pedido.
  // Se não existir pedido, cai no próprio lote para não sumir do sistema.
  return String(
    lot?.orderNumber ||
    lot?.pedido ||
    lot?.pits_numero ||
    lot?.orderId ||
    lot?.pedidoNumero ||
    lot?.number ||
    lot?.id ||
    ''
  ).trim();
}

function getPriorityWeight(priority) {
  const p = String(priority || 'normal').toLowerCase();
  if (p === 'sameday') return 3;
  if (p === 'urgent') return 2;
  return 1;
}

function getHighestPriority(lots) {
  const sorted = [...lots].sort((a, b) => getPriorityWeight(b.priority) - getPriorityWeight(a.priority));
  return sorted[0]?.priority || 'normal';
}

function getReadyDeliveryOrders() {
  const allLots = (STATE.lots || []).filter(l => !l.rejected && l.sector !== 'entregue');
  const grouped = new Map();

  for (const lot of allLots) {
    const key = getDeliveryLotOrderKey(lot);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(lot);
  }

  const readyOrders = [];

  grouped.forEach((lots, key) => {
    const hasReady = lots.some(l => l.sector === 'pronto');
    const allReady = lots.length > 0 && lots.every(l => l.sector === 'pronto');
    if (!hasReady || !allReady) return;

    const first = lots[0] || {};
    const totalQty = lots.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
    const products = lots
      .map(l => String(l.paint || l.productName || l.pits_nome_produto || l.productCode || '').trim())
      .filter(Boolean);
    const uniqueProducts = [...new Set(products)];

    readyOrders.push({
      orderKey: key,
      orderNumber: String(first.orderNumber || first.pedido || first.pits_numero || key),
      lotIds: lots.map(l => l.id),
      lotNumbers: lots.map(l => l.number).filter(Boolean),
      lots,
      client: first.client || first.cliente || '',
      city: first.city || '',
      address: first.address || '',
      qty: totalQty,
      unit: first.unit || 'Kg',
      paint: uniqueProducts.length <= 2 ? uniqueProducts.join(' + ') : `${uniqueProducts.length} produtos`,
      products: uniqueProducts,
      priority: getHighestPriority(lots),
      deliveryDate: first.deliveryDate || '',
      sequence: 0,
      status: 'pending',
      deliveredAt: null
    });
  });

  readyOrders.sort((a, b) => {
    const pa = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    if (pa) return pa;
    return String(a.client || '').localeCompare(String(b.client || ''), 'pt-BR');
  });

  return readyOrders;
}

async function openSendToDelivery(preSelectLotId) {
  const readyOrders = getReadyDeliveryOrders();
  const preLot = STATE.lots.find(l => l.id === preSelectLotId);
  const preSelectOrderKey = preLot ? getDeliveryLotOrderKey(preLot) : '';
  const body = document.getElementById('modalRouteBody');
  if (!body) return;

  body.innerHTML = `
    <div style="padding:1rem;text-align:center;color:var(--text2)">
      <i class="fas fa-spinner fa-spin"></i> Carregando motoristas do backend...
    </div>`;
  openModal('modalNewRoute');

  const drivers = await carregarMotoristasFactoryFlow();
  STATE.motoristasBackend = drivers;

  body.innerHTML = `
    <p style="margin-bottom:1rem">Selecione os <b>pedidos prontos</b> e o motorista para criar uma nova rota:</p>

    ${drivers.length === 0 ? `
      <div style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);color:#fbbf24;padding:.85rem 1rem;border-radius:12px;margin-bottom:1rem;font-size:.9rem">
        <strong><i class="fas fa-exclamation-triangle"></i> Nenhum motorista encontrado no backend central.</strong><br>
        Confira se o usuário está ativo e com <b>role = driver</b> ou <b>acesso_factoryflow = motorista</b> na tabela <b>users</b>.
      </div>
    ` : ''}

    <div class="form-group">
      <label>Motorista *</label>
      <select id="routeDriver">
        <option value="">– Selecione o motorista –</option>
        ${drivers.map(d => {
          const id = escapeHtml(String(d.id));
          const name = escapeHtml(String(d.name || d.nome || d.username || d.usuario || 'Motorista'));
          const login = escapeHtml(String(d.login || d.usuario || d.username || ''));
          return `<option value="${id}">${name}${login ? ' – ' + login : ''}</option>`;
        }).join('')}
      </select>
    </div>

    <div class="form-group">
      <label>Pedidos prontos para entrega</label>
      ${readyOrders.length === 0
        ? '<p class="text-muted">Nenhum pedido 100% pronto para entrega no momento.</p>'
        : `<div class="checkbox-list" id="routeOrdersList">
            ${readyOrders.map(o=>`
              <label class="checkbox-option ${o.orderKey===preSelectOrderKey?'checked':''}">
                <input type="checkbox" value="${escapeHtml(o.orderKey)}" ${o.orderKey===preSelectOrderKey?'checked':''} />
                <strong>Pedido #${escapeHtml(o.orderNumber)}</strong> – ${escapeHtml(o.client)} – ${escapeHtml(o.city || 'S/Cidade')}<br>
                <small>${o.lotIds.length} lote(s): ${escapeHtml(o.lotNumbers.join(', '))} · ${escapeHtml(String(o.qty))} ${escapeHtml(o.unit || 'Kg')} · ${PRIORITY_LABELS[o.priority] || 'Normal'}</small>
              </label>`).join('')}
          </div>`}
    </div>

    <div id="routeOptimized"></div>

    <div class="modal-footer">
      <button type="button" onclick="computeRoutePreview()" class="btn btn-secondary">
        <i class="fas fa-route"></i> Calcular Rota Otimizada
      </button>
      <button type="button" id="btnCreateRoute" onclick="confirmCreateRoute()" class="btn btn-primary" ${drivers.length === 0 || readyOrders.length === 0 ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>
        <i class="fas fa-truck"></i> Criar Rota por Pedido
      </button>
    </div>`;
}

function getSelectedReadyOrders() {
  const checked = Array.from(document.querySelectorAll('#routeOrdersList input:checked')).map(i => i.value);
  const readyOrders = getReadyDeliveryOrders();
  return checked.map(key => readyOrders.find(o => String(o.orderKey) === String(key))).filter(Boolean);
}

function computeRoutePreview() {
  const orders = getSelectedReadyOrders();
  if (orders.length === 0) { alert('Selecione pelo menos um pedido'); return; }
  const optimized = optimizeRoute(orders);
  document.getElementById('routeOptimized').innerHTML = `
    <h4 style="margin:.75rem 0"><i class="fas fa-magic"></i> Rota Otimizada por Pedido</h4>
    <div class="route-preview">
      ${optimized.map((order,i)=>`
        <div class="route-step">
          <div class="route-step-num">${i+1}</div>
          <div class="route-step-info">
            <strong>Pedido #${escapeHtml(order.orderNumber)} – ${escapeHtml(order.client)}</strong> – ${escapeHtml(order.city||'–')}<br>
            <small>${order.lotIds.length} lote(s): ${escapeHtml(order.lotNumbers.join(', '))} | ${escapeHtml(String(order.qty))}${escapeHtml(order.unit||'Kg')} | ${escapeHtml(order.address||'S/Endereço')}</small>
            ${i>0?`<small class="text-muted"> (~${order.distance?.toFixed(0)||'?'} km)</small>`:''}
          </div>
        </div>`).join('')}
    </div>
    <small class="text-muted">* Distâncias estimadas. Algoritmo vizinho mais próximo.</small>`;
}

async function confirmCreateRoute() {
  const selectedOrders = getSelectedReadyOrders();
  const driverId = document.getElementById('routeDriver')?.value;

  if (selectedOrders.length === 0) {
    alert('Selecione pelo menos um pedido');
    return;
  }

  if (!driverId) {
    alert('Selecione um motorista');
    return;
  }

  const optimized = optimizeRoute(selectedOrders);
  const user = STATE.currentUser;
  const driver = (STATE.motoristasBackend || []).find(u => String(u.id) === String(driverId)) || STATE.users.find(u => String(u.id) === String(driverId));

  if (!driver) {
    alert('Motorista não encontrado no sistema.');
    return;
  }

  const btn = document.getElementById('btnCreateRoute');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';

  const now = Date.now();
  const driverName = driver.name || driver.nome || driver.username || driver.usuario || 'Motorista';

  const route = {
    id:            genId('route'),
    driverId:      String(driver.id),
    driverName,
    createdBy:     user.id,
    createdByName: user.name,
    createdAt:     now,
    departureTime: null,
    status:        'pending',
    mode:          'pedido',
    lots: optimized.map((order, i) => ({
      orderKey:    order.orderKey,
      orderNumber: order.orderNumber,
      lotIds:      order.lotIds,
      lotNumbers:  order.lotNumbers,
      number:      order.orderNumber, // compatibilidade visual antiga
      client:      order.client,
      city:        order.city,
      address:     order.address,
      paint:       order.paint,
      products:    order.products,
      qty:         order.qty,
      unit:        order.unit || 'Kg',
      priority:    order.priority,
      sequence:    i + 1,
      status:      'pending',
      deliveredAt: null
    }))
  };

  try {
    await ffLotsSaveRouteToBackend(route);

    const idxRoute = STATE.routes.findIndex(r => String(r.id) === String(route.id));
    if (idxRoute === -1) STATE.routes.push(route);
    else STATE.routes[idxRoute] = route;

    const routeLotIds = new Set(optimized.flatMap(o => o.lotIds.map(String)));
    const routeLots = STATE.lots.filter(l => routeLotIds.has(String(l.id)));

    for (const lot of routeLots) {
      lot.sector = 'entrega';
      lot.lotStatus = 'idle';
      lot.sectorEnteredAt = now;
      lot.routeId = route.id;
      lot.driverId = String(driver.id);
      lot.driverName = driverName;
      lot.deliveryMode = 'rota_pedido';

      const orderKey = getDeliveryLotOrderKey(lot);
      lot.history = ffEnsureLotHistoryBeforeAction(lot, user, lot.sector);
      lot.history.push({
        sector: 'entrega',
        user: user.id,
        userName: user.name,
        action: `Pedido #${orderKey} incluído em rota de entrega – Motorista: ${driverName}`,
        timestamp: now
      });

      await apiUpdateLot(lot);
    }

    closeModal();

    if (typeof reloadData === 'function') await reloadData();
    if (typeof renderDeliveries === 'function') renderDeliveries();
    if (typeof renderKanban === 'function') renderKanban();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderLots === 'function') renderLots();

    showToast(`✅ Rota criada para ${driverName} com ${selectedOrders.length} pedido(s).`);

  } catch(err) {
    alert('Erro ao criar rota: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-truck"></i> Criar Rota por Pedido';
  }
}

// ===== TOAST =====
function showToast(msg, type) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.borderColor = type === 'error' ? 'var(--red)' : 'var(--green)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}
