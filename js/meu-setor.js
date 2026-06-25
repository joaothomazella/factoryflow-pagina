// ===================================================
// MEU-SETOR.JS – Tela do operador: lotes do seu setor
// Interface focada, simples e rápida para uso em chão de fábrica
// 2===================================================

'use strict';

// Fallback local para garantir avanço no Meu Setor caso lots.js ainda não tenha carregado.
// Principalmente para Diluente, Endurecedor e Saída Manual no Envase.
function msGetFallbackNextSectorOptions(lot) {
  const sector = String(lot?.sector || lot?.stage || lot?.status || lot?.currentSector || '').trim().toLowerCase();

  if (['envase', 'envase_produzir', 'envase_enlatamento', 'envase_producao'].includes(sector)) {
    return [{ value: 'pronto', label: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS.pronto) ? SECTOR_LABELS.pronto : 'Pronto para Entrega' }];
  }

  return [];
}


// Intervalo de auto-refresh da tela (ms)
const MS_REFRESH_INTERVAL = 10000;
let _msRefreshTimer = null;

// ───────────────────────────────────────────────────
// RENDER PRINCIPAL
// ───────────────────────────────────────────────────
function renderMeuSetor() {
  const page = document.getElementById('pageMeuSetor');
  if (!page) return;

  const main = document.getElementById('mainContent');
  if (main) main.scrollTop = 0;

  page.scrollTop = 0;

  const user = STATE.currentUser;
  if (!user) return;

  // Determina o setor visível para o usuário
  const userSector = user.sector || '';
  const visibleSectors = userSector
    ? getSectorVisibility(userSector)
    : (isFullAccess(user) ? SECTORS : []);

  // Filtra lotes: apenas do setor do usuário, não reprovados
  const lots = STATE.lots.filter(l =>
    !l.rejected &&
    visibleSectors.includes(l.sector)
  );

  // Ordena: sameday → urgent → normal; dentro da mesma prioridade: mais antigo primeiro
  lots.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return getLotTimeInSector(b) - getLotTimeInSector(a);
  });

  const sectorLabel = userSector
    ? (SECTOR_LABELS[userSector] || userSector)
    : 'Todos os Setores';

  const sectorColor = SECTOR_COLORS[userSector] || '#3b82f6';

  // Contadores rápidos
  const working  = lots.filter(l => l.lotStatus === 'working').length;
  const paused   = lots.filter(l => l.lotStatus === 'paused').length;
  const idle     = lots.filter(l => !l.lotStatus || l.lotStatus === 'idle').length;
  const lateCount = lots.filter(l => isLate(l)).length;
  const urgentCount = lots.filter(l => l.priority !== 'normal').length;

  page.innerHTML = `
    <!-- HEADER -->
    <div class="ms-header" style="border-left:4px solid ${sectorColor}">
      <div class="ms-header-left">
        <div class="ms-sector-name" style="color:${sectorColor}">
          <i class="fas fa-hard-hat"></i>
          ${escapeHtml(sectorLabel)}
        </div>
        <div class="ms-user-line">
          <i class="fas fa-user-circle"></i>
          ${escapeHtml(user.name)}
          <span class="ms-role-chip">${ROLE_LABELS[user.role] || user.role}</span>
        </div>
      </div>
      <div class="ms-header-right">
        <div class="ms-kpi-row">
          <div class="ms-kpi ms-kpi-total">
            <span class="ms-kpi-num">${lots.length}</span>
            <span class="ms-kpi-lbl">Total</span>
          </div>
          <div class="ms-kpi ms-kpi-working">
            <span class="ms-kpi-num">${working}</span>
            <span class="ms-kpi-lbl">Trabalhando</span>
          </div>
          <div class="ms-kpi ms-kpi-paused">
            <span class="ms-kpi-num">${paused}</span>
            <span class="ms-kpi-lbl">Pausado</span>
          </div>
          <div class="ms-kpi ms-kpi-idle">
            <span class="ms-kpi-num">${idle}</span>
            <span class="ms-kpi-lbl">Aguardando</span>
          </div>
          ${urgentCount > 0 ? `
          <div class="ms-kpi ms-kpi-urgent">
            <span class="ms-kpi-num">${urgentCount}</span>
            <span class="ms-kpi-lbl">Urgentes</span>
          </div>` : ''}
          ${lateCount > 0 ? `
          <div class="ms-kpi ms-kpi-late">
            <span class="ms-kpi-num">${lateCount}</span>
            <span class="ms-kpi-lbl">Atrasados</span>
          </div>` : ''}
        </div>
        <button class="ms-refresh-btn" onclick="renderMeuSetor()" title="Atualizar">
          <i class="fas fa-sync-alt"></i> Atualizar
        </button>
      </div>
    </div>

    <!-- GRADE DE CARDS -->
    <div class="ms-grid" id="msGrid">
      ${lots.length === 0
        ? _buildMsEmpty(sectorLabel)
        : lots.map(lot => _buildMsCard(lot, user)).join('')
      }
    </div>
  `;

  // Inicia ticker de tempo ao vivo (atualiza cronômetros a cada 10s)
  _msStartTicker();
}

// ───────────────────────────────────────────────────
// EMPTY STATE
// ───────────────────────────────────────────────────
function _buildMsEmpty(sectorLabel) {
  return `
    <div class="ms-empty">
      <i class="fas fa-check-circle ms-empty-icon"></i>
      <h3>Nenhum lote no setor</h3>
      <p>${escapeHtml(sectorLabel)} está livre no momento.</p>
    </div>`;
}

// ───────────────────────────────────────────────────
// CARD DE LOTE
// ───────────────────────────────────────────────────
function _buildMsCard(lot, user) {
  const status   = lot.lotStatus || 'idle';
  const late     = isLate(lot);
  const todayDel = isToday(getEffectiveDeliveryDate(lot));
  const pt       = lot.productType || 'tinta';
  const pColor   = PRIORITY_COLORS[lot.priority] || '#22c55e';
  const sColor   = SECTOR_COLORS[lot.sector] || '#6b7280';
  const ts       = getLotTimeSummary(lot);
  const isTrack  = canTrackWork(lot.sector);

  // Permissões
  const canTrack = isTrack && (
    (user.role === 'sector' && getSectorVisibility(user.sector).includes(lot.sector))
    || ['admin','diretoria','pcp','manager'].includes(user.role)
  );
  const canAdvance = (
    (user.role === 'sector' && getSectorVisibility(user.sector).includes(lot.sector))
    || ['admin','diretoria','pcp','pcp_lib','manager'].includes(user.role)
  );
  let nextOptions = (typeof getSafeNextSectorOptions === 'function')
    ? getSafeNextSectorOptions(lot)
    : getNextSectorOptions(lot);

  if (!Array.isArray(nextOptions) || nextOptions.length === 0) {
    nextOptions = msGetFallbackNextSectorOptions(lot);
  }
  const canReject = (
    (user.role === 'sector' && getSectorVisibility(user.sector).includes(lot.sector))
    || ['admin','diretoria','pcp','pcp_lib','manager'].includes(user.role)
  );

  // Classe de urgência para borda e animação
  const urgencyClass = lot.priority === 'sameday' ? 'ms-card-sameday'
    : lot.priority === 'urgent' ? 'ms-card-urgent'
    : '';

  // Status label + cor
  const statusMeta = {
    idle:    { label: 'Aguardando', cls: 'ms-status-idle',    icon: 'fa-clock' },
    working: { label: 'Em Produção', cls: 'ms-status-working', icon: 'fa-play-circle' },
    paused:  { label: 'Pausado',    cls: 'ms-status-paused',  icon: 'fa-pause-circle' },
  };
  const sm = statusMeta[status] || statusMeta.idle;

  // Barra de progresso de tempo
  const totalMs = ts.total || 1;
  const wPct    = Math.min(100, Math.round(ts.worked / totalMs * 100));
  const pPct    = Math.min(100 - wPct, Math.round(ts.paused / totalMs * 100));

  // Botões de controle de trabalho
  let workBtn = '';
  if (canTrack) {
    if (status === 'idle' || status === 'paused') {
      workBtn = `
        <button class="ms-btn ms-btn-start" onclick="event.stopPropagation(); _msStartWork('${lot.id}')">
          <i class="fas fa-play"></i>
          ${status === 'paused' ? 'Retomar' : 'Iniciar'}
        </button>`;
    } else if (status === 'working') {
      workBtn = `
        <button class="ms-btn ms-btn-pause" onclick="event.stopPropagation(); _msPauseWork('${lot.id}')">
          <i class="fas fa-pause"></i> Pausar
        </button>`;
    }
  }

  // Botão avançar
  const advanceBtn = (canAdvance && nextOptions.length > 0) ? `
    <button class="ms-btn ms-btn-advance" onclick="event.stopPropagation(); openSendSector('${lot.id}')">
      <i class="fas fa-arrow-right"></i> Avançar
    </button>` : '';

  // Botão reprovar
  const rejectBtn = canReject ? `
    <button class="ms-btn ms-btn-reject" onclick="event.stopPropagation(); openRejectModal('${lot.id}')">
      <i class="fas fa-ban"></i> Reprovar
    </button>` : '';

  // OP / número de pedido
  const orderLine = lot.orderNumber
    ? `<div class="ms-card-order"><i class="fas fa-clipboard-list"></i> Pedido #${escapeHtml(lot.orderNumber)}</div>`
    : '';

  // Data de entrega
  const effDate = getEffectiveDeliveryDate(lot);
  const dateLine = effDate ? `
    <div class="ms-card-date ${late ? 'ms-date-late' : todayDel ? 'ms-date-today' : ''}">
      <i class="fas fa-calendar-alt"></i>
      Entrega: ${_msFmtDate(effDate)}
      ${late ? ' <span class="ms-late-chip">ATRASADO</span>' : todayDel ? ' <span class="ms-today-chip">HOJE</span>' : ''}
      ${lot.deliveryDateManual ? ' <span class="ms-manual-chip" title="Data editada manualmente">✏️</span>' : ''}
    </div>` : '';

  // Indicador de tempo no setor
  const timeStr = formatMs(ts.total);

  return `
    <div class="ms-card ${urgencyClass} ${late ? 'ms-card-late' : ''} ${status === 'working' ? 'ms-card-is-working' : ''}"
         onclick="openLotDetail('${lot.id}')">

      <!-- Barra superior de prioridade -->
      <div class="ms-card-priority-bar" style="background:${pColor}"></div>

      <!-- Cabeçalho do card -->
      <div class="ms-card-head">
        <div class="ms-card-num">
          <i class="fas fa-box-open"></i>
          <strong>#${escapeHtml(String(lot.number || '–'))}</strong>
          ${lot.op ? `<span class="ms-op-badge">OP ${escapeHtml(String(lot.op))}</span>` : ''}
        </div>
        <div class="ms-card-badges">
          <span class="ms-priority-badge" style="background:${pColor}20;border-color:${pColor}50;color:${pColor}">
            ${PRIORITY_LABELS[lot.priority] || 'Normal'}
          </span>
          <span class="ms-status-badge ${sm.cls}">
            <i class="fas ${sm.icon}"></i> ${sm.label}
          </span>
        </div>
      </div>

      <!-- Setor atual -->
      <div class="ms-card-sector" style="color:${sColor}">
        <i class="fas fa-map-marker-alt"></i>
        ${escapeHtml(SECTOR_LABELS[lot.sector] || lot.sector)}
      </div>

      <!-- Dados principais -->
      <div class="ms-card-body">

        <div class="ms-card-client">
          <i class="fas fa-building"></i>
          <span>${escapeHtml(lot.client || '–')}</span>
        </div>

        <div class="ms-card-product">
          <span class="product-type-badge type-${pt}">${PRODUCT_TYPES[pt] || pt}</span>
          <span class="ms-card-paint">${escapeHtml(lot.paint || lot.productCode || '–')}</span>
        </div>

        <div class="ms-card-qty">
          <i class="fas fa-weight-hanging"></i>
          <strong>${lot.qty || 0}</strong>
          <span>${escapeHtml(lot.unit || 'Kg')}</span>
        </div>

        ${orderLine}
        ${dateLine}

      </div>

      <!-- Cronômetro + barra de tempo -->
      <div class="ms-card-timer" onclick="event.stopPropagation()">
        <div class="ms-timer-row">
          <span class="ms-timer-icon ${status === 'working' ? 'ms-timer-running' : ''}">
            <i class="fas fa-stopwatch"></i>
          </span>
          <span class="ms-timer-val" data-lot-id="${lot.id}">${timeStr}</span>
          ${ts.worked > 0 ? `<span class="ms-timer-worked">▶ ${formatMsShort(ts.worked)}</span>` : ''}
          ${ts.paused > 0 ? `<span class="ms-timer-paused">⏸ ${formatMsShort(ts.paused)}</span>` : ''}
        </div>
        ${isTrack ? `
        <div class="ms-time-bar">
          <div class="ms-bar-worked" style="width:${wPct}%"></div>
          <div class="ms-bar-paused" style="width:${pPct}%"></div>
          <div class="ms-bar-idle"   style="width:${100 - wPct - pPct}%"></div>
        </div>` : ''}
      </div>

      <!-- Ações -->
      <div class="ms-card-actions" onclick="event.stopPropagation()">
        ${workBtn}
        ${advanceBtn}
        <button class="ms-btn ms-btn-detail" onclick="event.stopPropagation(); openLotDetail('${lot.id}')">
          <i class="fas fa-eye"></i> Detalhes
        </button>
        ${rejectBtn}
      </div>

    </div>
  `;
}

// ───────────────────────────────────────────────────
// AÇÕES – WRAPPERS DAS FUNÇÕES EXISTENTES
// Reutilizamos startLotWork / pauseLotWork do kanban.js
// e após a ação re-renderizamos ESTA tela (não o Kanban)
// ───────────────────────────────────────────────────

async function _msStartWork(lotId) {
  const lot  = STATE.lots.find(l => l.id === lotId);
  const user = STATE.currentUser;
  if (!lot) return;

  const sessions = Array.isArray(lot.workSessions) ? [...lot.workSessions] : [];
  // Fecha qualquer sessão aberta acidentalmente
  sessions.forEach(s => { if (!s.end && s.sector === lot.sector) s.end = Date.now(); });

  sessions.push({
    sector:   lot.sector,
    start:    Date.now(),
    end:      null,
    user:     user.id,
    userName: user.name
  });

  lot.workSessions = sessions;
  lot.lotStatus    = 'working';

  // Desabilita o botão imediatamente para evitar duplo clique
  _msSetCardBusy(lotId, true);

  try {
    await apiUpdateLot(lot);
    showToast(`▶️ Produção iniciada – Lote #${lot.number}`);
    renderMeuSetor();
  } catch(e) {
    showToast('Erro ao iniciar: ' + e.message, 'error');
    _msSetCardBusy(lotId, false);
  }
}

function _msPauseWork(lotId) {
  // Abre o modal de pausa existente (kanban.js).
  // confirmPauseLot() já verifica a página ativa e chama
  // renderMeuSetor() quando necessário — nenhum monkey-patch precisado.
  const lot = STATE.lots.find(l => l.id === lotId);
  if (!lot) return;
  openPauseModal(lot);
}

// ───────────────────────────────────────────────────
// TICKER DE TEMPO AO VIVO
// Atualiza apenas os valores de cronômetro sem re-renderizar tudo
// ───────────────────────────────────────────────────
function _msStartTicker() {
  _msStopTicker();
  _msRefreshTimer = setInterval(() => {
    const page = document.getElementById('pageMeuSetor');
    if (!page || !page.classList.contains('active')) {
      _msStopTicker();
      return;
    }
    // Atualiza cronômetros ao vivo
    page.querySelectorAll('.ms-timer-val[data-lot-id]').forEach(el => {
      const lotId = el.dataset.lotId;
      const lot   = STATE.lots.find(l => l.id === lotId);
      if (!lot) return;
      const ts = getLotTimeSummary(lot);
      el.textContent = formatMs(ts.total);
    });
  }, MS_REFRESH_INTERVAL);
}

function _msStopTicker() {
  if (_msRefreshTimer) {
    clearInterval(_msRefreshTimer);
    _msRefreshTimer = null;
  }
}

// ───────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────

// Desabilita botões do card enquanto a ação está em andamento
function _msSetCardBusy(lotId, busy) {
  const cards = document.querySelectorAll(`#pageMeuSetor .ms-card`);
  cards.forEach(card => {
    const btn = card.querySelector(`.ms-btn-start, .ms-btn-pause`);
    if (!btn) return;
    if (btn.getAttribute('onclick')?.includes(lotId)) {
      btn.disabled = busy;
      if (busy) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
  });
}

// Formata data YYYY-MM-DD → DD/MM/AAAA
function _msFmtDate(d) {
  if (!d) return '–';
  try {
    const [y, m, day] = String(d).split('-');
    return `${day}/${m}/${y}`;
  } catch(_) { return d; }
}
