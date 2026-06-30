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
function _msInstallStyles() {
  if (document.getElementById('msSectorGroupStyles')) return;
  const s = document.createElement('style');
  s.id = 'msSectorGroupStyles';
  s.textContent = `
    .ms-search-bar{display:flex;align-items:center;gap:.75rem;padding:.85rem 1rem .55rem;flex-wrap:wrap}
    .ms-search-wrap{position:relative;flex:1;min-width:220px;max-width:440px}
    .ms-search-ico{position:absolute;left:.82rem;top:50%;transform:translateY(-50%);color:#64748b;font-size:.83rem;pointer-events:none}
    .ms-search-inp{width:100%;background:rgba(15,31,60,.85);border:1px solid var(--border,#334155);border-radius:10px;padding:.58rem .9rem .58rem 2.3rem;color:var(--text,#e2f0ff);font-size:.86rem;outline:none;transition:border-color .2s,box-shadow .2s}
    .ms-search-inp:focus{border-color:#144196;box-shadow:0 0 0 3px rgba(20,65,150,.15)}
    .ms-search-inp::placeholder{color:#64748b}
    [data-theme="light"] .ms-search-inp{background:rgba(241,245,249,.9)}
    .ms-search-clear{background:rgba(100,116,139,.14);border:1px solid rgba(100,116,139,.22);border-radius:8px;color:#94a3b8;font-size:.78rem;padding:.5rem .85rem;cursor:pointer;white-space:nowrap;transition:background .15s}
    .ms-search-clear:hover{background:rgba(100,116,139,.24)}
    .ms-search-info{font-size:.78rem;color:#64748b;white-space:nowrap}

    .ms-sections{display:flex;flex-direction:column;gap:1.6rem;padding:0 1rem 1.5rem}
    .ms-section-hdr{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.6rem .95rem;background:rgba(0,0,0,.2);border:1px solid rgba(148,163,184,.15);border-left:4px solid var(--ms-sec-color,#144196);border-radius:10px;margin-bottom:.8rem}
    .ms-section-title{display:flex;align-items:center;gap:.65rem;font-weight:700;font-size:.93rem}
    .ms-section-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 3px rgba(255,255,255,.07)}
    .ms-section-right{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
    .ms-section-count{background:rgba(20,65,150,.14);border:1px solid rgba(20,65,150,.28);color:#93c5fd;border-radius:999px;padding:.12rem .6rem;font-size:.7rem;font-weight:800;white-space:nowrap}
    .ms-sec-tag{font-size:.68rem;border-radius:999px;padding:.1rem .48rem;font-weight:700;white-space:nowrap}
    .ms-sec-tag-urgent{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.26)}
    .ms-sec-tag-late{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.26)}
    .ms-sec-tag-working{background:rgba(34,197,94,.14);color:#4ade80;border:1px solid rgba(34,197,94,.26)}

    .ms-section-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:.9rem}
    .ms-card-wrap{display:block}
    .ms-card-wrap > .ms-card{margin:0;height:100%}
    .ms-sec-no-results{display:none;grid-column:1/-1;padding:1.4rem;text-align:center;color:#64748b;border:1px dashed rgba(148,163,184,.18);border-radius:12px;font-size:.83rem}
    @media(max-width:600px){.ms-section-grid{grid-template-columns:1fr}.ms-sections{padding:0 .5rem 1rem}}
    [data-theme="light"] .ms-section-hdr{background:rgba(241,245,249,.8)}
  `;
  document.head.appendChild(s);
}

function renderMeuSetor() {
  const page = document.getElementById('pageMeuSetor');
  if (!page) return;

  _msInstallStyles();

  const main = document.getElementById('mainContent');
  if (main) main.scrollTop = 0;
  page.scrollTop = 0;

  const user = STATE.currentUser;
  if (!user) return;

  const userSector = user.sector || '';
  const visibleSectors = userSector
    ? getSectorVisibility(userSector)
    : (isFullAccess(user) ? SECTORS : []);

  // Ordena por prioridade e depois por tempo no setor (mais antigo primeiro)
  const sortLots = arr => [...arr].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return getLotTimeInSector(b) - getLotTimeInSector(a);
  });

  const allLots = STATE.lots.filter(l => !l.rejected && visibleSectors.includes(l.sector));

  const sectorLabel = userSector ? (SECTOR_LABELS[userSector] || userSector) : 'Todos os Setores';
  const sectorColor = SECTOR_COLORS[userSector] || '#144196';

  // KPIs globais
  const working     = allLots.filter(l => l.lotStatus === 'working').length;
  const paused      = allLots.filter(l => l.lotStatus === 'paused').length;
  const idle        = allLots.filter(l => !l.lotStatus || l.lotStatus === 'idle').length;
  const lateCount   = allLots.filter(l => isLate(l)).length;
  const urgentCount = allLots.filter(l => l.priority !== 'normal').length;

  // Seções agrupadas por sub-setor
  const sectionsHtml = visibleSectors.map(s => {
    const sLots     = sortLots(allLots.filter(l => l.sector === s));
    const color     = SECTOR_COLORS[s] || '#6b7280';
    const label     = SECTOR_LABELS[s] || s;
    const lateN     = sLots.filter(l => isLate(l)).length;
    const urgentN   = sLots.filter(l => l.priority !== 'normal').length;
    const workingN  = sLots.filter(l => l.lotStatus === 'working').length;

    const tags = [
      workingN ? `<span class="ms-sec-tag ms-sec-tag-working"><i class="fas fa-play-circle"></i> ${workingN} trabalhando</span>` : '',
      urgentN  ? `<span class="ms-sec-tag ms-sec-tag-urgent"><i class="fas fa-bolt"></i> ${urgentN} urgente${urgentN > 1 ? 's' : ''}</span>` : '',
      lateN    ? `<span class="ms-sec-tag ms-sec-tag-late"><i class="fas fa-exclamation-triangle"></i> ${lateN} atrasado${lateN > 1 ? 's' : ''}</span>` : ''
    ].join('');

    const cardsHtml = sLots.map(lot => {
      const searchText = [lot.number, lot.client, lot.paint, lot.orderNumber, lot.productCode]
        .filter(Boolean).join(' ').toLowerCase().replace(/"/g, '&quot;');
      return `<div class="ms-card-wrap" data-search="${searchText}">${_buildMsCard(lot, user)}</div>`;
    }).join('');

    return `
      <div class="ms-section" data-sector="${s}">
        <div class="ms-section-hdr" style="--ms-sec-color:${color}">
          <div class="ms-section-title">
            <span class="ms-section-dot" style="background:${color}"></span>
            ${escapeHtml(label)}
          </div>
          <div class="ms-section-right">
            ${tags}
            <span class="ms-section-count">${sLots.length} lote${sLots.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="ms-section-grid">
          ${cardsHtml || `<div class="ms-empty" style="grid-column:1/-1"><i class="fas fa-check-circle ms-empty-icon"></i><h3>Setor livre</h3><p>${escapeHtml(label)} não tem lotes no momento.</p></div>`}
          <div class="ms-sec-no-results"><i class="fas fa-search" style="display:block;font-size:1.3rem;margin-bottom:.5rem"></i>Nenhum resultado para esta busca</div>
        </div>
      </div>`;
  }).join('');

  page.innerHTML = `
    <div class="ms-header" style="border-left:4px solid ${sectorColor}">
      <div class="ms-header-left">
        <div class="ms-sector-name" style="color:${sectorColor}">
          <i class="fas fa-hard-hat"></i> ${escapeHtml(sectorLabel)}
        </div>
        <div class="ms-user-line">
          <i class="fas fa-user-circle"></i>
          ${escapeHtml(user.name)}
          <span class="ms-role-chip">${ROLE_LABELS[user.role] || user.role}</span>
        </div>
      </div>
      <div class="ms-header-right">
        <div class="ms-kpi-row">
          <div class="ms-kpi ms-kpi-total"><span class="ms-kpi-num">${allLots.length}</span><span class="ms-kpi-lbl">Total</span></div>
          <div class="ms-kpi ms-kpi-working"><span class="ms-kpi-num">${working}</span><span class="ms-kpi-lbl">Trabalhando</span></div>
          <div class="ms-kpi ms-kpi-paused"><span class="ms-kpi-num">${paused}</span><span class="ms-kpi-lbl">Pausado</span></div>
          <div class="ms-kpi ms-kpi-idle"><span class="ms-kpi-num">${idle}</span><span class="ms-kpi-lbl">Aguardando</span></div>
          ${urgentCount > 0 ? `<div class="ms-kpi ms-kpi-urgent"><span class="ms-kpi-num">${urgentCount}</span><span class="ms-kpi-lbl">Urgentes</span></div>` : ''}
          ${lateCount   > 0 ? `<div class="ms-kpi ms-kpi-late"><span class="ms-kpi-num">${lateCount}</span><span class="ms-kpi-lbl">Atrasados</span></div>` : ''}
        </div>
        <button class="ms-refresh-btn" onclick="renderMeuSetor()" title="Atualizar">
          <i class="fas fa-sync-alt"></i> Atualizar
        </button>
      </div>
    </div>

    <div class="ms-search-bar">
      <div class="ms-search-wrap">
        <i class="fas fa-search ms-search-ico"></i>
        <input id="msSearchInput" type="text" class="ms-search-inp"
          placeholder="Buscar por nº do lote, cliente ou cor…"
          oninput="msSectorSearch(this.value)">
      </div>
      <button class="ms-search-clear" onclick="msSectorSearch('');var i=document.getElementById('msSearchInput');if(i)i.value=''">
        <i class="fas fa-times"></i> Limpar
      </button>
    </div>

    <div class="ms-sections" id="msSections">
      ${allLots.length === 0 ? _buildMsEmpty(sectorLabel) : sectionsHtml}
    </div>
  `;

  _msStartTicker();
}

function msSectorSearch(q) {
  const query = (q || '').trim().toLowerCase();
  const page  = document.getElementById('pageMeuSetor');
  if (!page) return;

  page.querySelectorAll('.ms-card-wrap').forEach(el => {
    const match = !query || (el.dataset.search || '').includes(query);
    el.style.display = match ? '' : 'none';
  });

  page.querySelectorAll('.ms-section').forEach(sec => {
    const grid    = sec.querySelector('.ms-section-grid');
    if (!grid) return;
    const visible = sec.querySelectorAll('.ms-card-wrap:not([style*="display: none"])').length;
    const noRes   = grid.querySelector('.ms-sec-no-results');
    if (noRes) noRes.style.display = query && visible === 0 ? '' : 'none';
  });
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
