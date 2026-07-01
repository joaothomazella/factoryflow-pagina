// ===================================================
// KANBAN.JS – Quadro Kanban completo
// PATCH: mantém Envase Produzir + Envase Enlatamento
// PATCH: libera avanço para Laboratório – Amostras e Coloração – Amostras
// ===================================================

// ===================================================
// PATCH INDUSCOLOR – NORMALIZAÇÃO DE SETORES ANTIGOS
// Objetivo: manter os 2 quadros do envase e evitar que Envase – Produzir seja convertido em Enlatamento.
// ===================================================
function normalizeKanbanSector(sector) {
  const s = String(sector || '').trim().toLowerCase();

  // IMPORTANTE:
  // Mantém os DOIS quadros do envase:
  // - envase_produzir     = Envase – Produzir
  // - envase_enlatamento  = Envase – Enlatamento
  //
  // Só convertemos nomes antigos/genéricos para o destino correto.
  // NÃO converter envase_produzir para envase_enlatamento.
  const aliases = {
    envase: 'envase_enlatamento',
    envase_antigo: 'envase_enlatamento',
    enlatamento: 'envase_enlatamento',
    envase_producao: 'envase_produzir',

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

function getLotKanbanSector(lot) {
  if (!lot) return '';

  // Prioridade máxima para os nomes NOVOS das colunas do Envase e Amostras.
  const candidates = [lot.sector, lot.stage, lot.status, lot.currentSector];

  const specificSector = candidates.find(v => {
    const n = normalizeKanbanSector(v);
    return n === 'envase_produzir' ||
      n === 'envase_enlatamento' ||
      n === 'laboratorio_amostras' ||
      n === 'coloracao_amostras';
  });

  if (specificSector) return normalizeKanbanSector(specificSector);

  return normalizeKanbanSector(lot.sector || lot.stage || lot.status || lot.currentSector);
}

function normalizeLotSectorForKanban(lot) {
  if (!lot) return lot;

  const normalized = getLotKanbanSector(lot);

  // Corrige em memória para o Kanban conseguir enxergar o lote.
  // Para Envase/Amostras, o app normal exige que sector seja exatamente a coluna.
  if (normalized && lot.sector !== normalized) {
    lot.sector = normalized;
  }

  return lot;
}

function normalizeAllLotsForKanban() {
  if (!window.STATE || !Array.isArray(STATE.lots)) return;
  STATE.lots.forEach(normalizeLotSectorForKanban);
}


// ===================================================
// PATCH INDUSCOLOR – AVANÇO SEGURO PARA ENDURECEDOR / VERNIZ / AMOSTRAS
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

  const rawSector = (typeof getLotKanbanSector === 'function') ? getLotKanbanSector(lot) : (lot?.sector || lot?.stage || lot?.status || lot?.currentSector || '');
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

  if (Array.isArray(options) && options.length > 0) return options;

  return [];
}

function renderKanban() {
  normalizeAllLotsForKanban();

  const page = document.getElementById('pageKanban');
  const user = STATE.currentUser;

  let columns;
  if (isFullAccess(user) || user.role === 'pcp_lib') {
    columns = [...SECTORS];
  } else if (user.role === 'sector') {
    columns = getSectorVisibility(user.sector).map(normalizeKanbanSector);
  } else {
    columns = [...SECTORS];
  }

  // Garante que a coluna nova exista mesmo se algum arquivo antigo ainda não tiver SECTORS atualizado.
  if (!columns.includes('envase_enlatamento')) {
    const oldEnvaseIndex = columns.indexOf('envase');
    if (oldEnvaseIndex >= 0) {
      columns.splice(oldEnvaseIndex, 1, 'envase_enlatamento');
    }
  }

  // Garante que as colunas de amostras existam mesmo se algum arquivo antigo ainda não tiver SECTORS atualizado.
  if (!columns.includes('laboratorio_amostras') && (isFullAccess(user) || user.role === 'pcp_lib' || user.sector === 'laboratorio')) {
    columns.splice(Math.max(columns.indexOf('pcp_liberacao') + 1, 0), 0, 'laboratorio_amostras');
  }
  if (!columns.includes('coloracao_amostras') && (isFullAccess(user) || user.role === 'pcp_lib' || user.sector === 'coloracao')) {
    columns.splice(Math.max(columns.indexOf('laboratorio_amostras') + 1, columns.indexOf('pcp_liberacao') + 1, 0), 0, 'coloracao_amostras');
  }

  // Garante ordem visual: revisão primeiro, depois setor principal.
  // Ex.: Coloração (Revisão) → Coloração.
  columns = [...new Set(columns.map(normalizeKanbanSector))].sort((a, b) => {
    const aRev = String(a).includes('revisao');
    const bRev = String(b).includes('revisao');
    if (aRev && !bRev) return -1;
    if (!aRev && bRev) return 1;
    return SECTORS.indexOf(a) - SECTORS.indexOf(b);
  });

  const mysqlCount = STATE.lots.filter(l => l._source === 'mysql' && !l.rejected).length;
  const mysqlChip  = mysqlCount > 0
    ? `<span class="kanban-mysql-count" title="Lotes importados do ERP (MySQL)" onclick="openBridgeConfigModal()">
         <i class="fas fa-database"></i> ${mysqlCount} ERP
       </span>`
    : (BRIDGE_CONFIG.enabled
        ? `<span class="kanban-mysql-count" style="opacity:.5" title="Bridge ERP ativo, sem lotes novos">
             <i class="fas fa-database"></i> ERP 0
           </span>`
        : '');

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-columns"></i> Quadro Kanban</h2>
      <div class="header-actions">
        ${mysqlChip}
        ${['admin','pcp'].includes(user.role) ? `<button onclick="openNewOrderModal()" class="btn btn-primary"><i class="fas fa-plus"></i> Novo Pedido</button>` : ''}
      </div>
    </div>
    <div class="kanban-snap-hint"><i class="fas fa-hand-point-left"></i> Deslize para ver os setores <i class="fas fa-hand-point-right"></i></div>
    <div class="kanban-board" id="kanbanBoard">
      ${columns.map(sector => buildKanbanColumn(sector, user)).join('')}
    </div>
  `;
}

function buildKanbanColumn(sector, user) {
  const normalizedSector = normalizeKanbanSector(sector);
  const allLotsForUser = getLotsForUser(user).map(normalizeLotSectorForKanban);

  // Lotes reprovados NÃO aparecem no Kanban
  const lots = allLotsForUser.filter(l => normalizeKanbanSector(l.sector) === normalizedSector && !l.rejected);

  // Ordenar por prioridade: sameday → urgent → normal; depois por tempo total no setor (mais antigo primeiro)
  lots.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return getLotTimeInSector(b) - getLotTimeInSector(a);
  });

  const urgentCount = lots.filter(l => l.priority !== 'normal').length;
  const lateCount   = lots.filter(l => isLate(l)).length;
  const isReviewSector = ['coloracao_revisao','laboratorio_revisao','pcp_liberacao'].includes(normalizedSector);
  const isSampleSector = ['coloracao_amostras','laboratorio_amostras'].includes(normalizedSector);
  const sectorColor = SECTOR_COLORS[normalizedSector] || '#6b7280';
  const sectorLabel = SECTOR_LABELS[normalizedSector] || SECTOR_LABELS[sector] || normalizedSector;

  const columnBadge = isReviewSector
    ? `<span class="kanban-review-badge">REVISÃO/LIB</span>`
    : isSampleSector
      ? `<span class="kanban-review-badge">AMOSTRAS</span>`
      : '';

  const expedienteAberto = typeof isExpedienteAbertoForSector === 'function'
    ? isExpedienteAbertoForSector(normalizedSector)
    : true;
  const expedienteBadge = canTrackWork(normalizedSector)
    ? `<span class="kanban-expediente-badge ${expedienteAberto ? 'open' : 'closed'}">${expedienteAberto ? 'EXPEDIENTE ABERTO' : 'EXPEDIENTE FECHADO'}</span>`
    : '';

  return `
    <div class="kanban-col ${isReviewSector?'kanban-col-review':''} ${isSampleSector?'kanban-col-review':''}" data-sector="${normalizedSector}">
      <div class="kanban-col-header" style="border-top:3px solid ${sectorColor}">
        <div class="kanban-col-title">
          <span style="color:${sectorColor}">${sectorLabel}</span>
          ${columnBadge}
          ${expedienteBadge}
          <span class="kanban-count">${lots.length}</span>
        </div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          ${urgentCount > 0 ? `<small class="text-warning">⚡ ${urgentCount}</small>` : ''}
          ${lateCount   > 0 ? `<small class="text-danger">⚠️ ${lateCount}</small>`   : ''}
        </div>
      </div>
      <div class="kanban-cards">
        ${lots.length === 0
          ? '<div class="kanban-empty">Nenhum lote neste setor</div>'
          : lots.map(lot => buildKanbanCard(lot, user, normalizedSector)).join('')}
      </div>
    </div>
  `;
}

function buildKanbanCard(lot, user, currentSector) {
  normalizeLotSectorForKanban(lot);

  const late      = isLate(lot);
  const today     = isToday(lot.deliveryDate);
  const timeSummary = getLotTimeSummary(lot);
  const alertThr  = timeSummary.total > 7200000; // >2h no setor
  const pColor    = PRIORITY_COLORS[lot.priority];
  const pt        = lot.productType || 'tinta';
  const status    = lot.lotStatus || 'idle';
  const currentLotSector = (typeof getLotKanbanSector === 'function') ? getLotKanbanSector(lot) : normalizeKanbanSector(lot.sector);
  const visibleSectors = user.role === 'sector'
    ? getSectorVisibility(user.sector).map(normalizeKanbanSector)
    : [];

  const canAdvance = (user.role === 'sector' && visibleSectors.includes(currentLotSector))
    || ['admin','diretoria','pcp','pcp_lib','manager'].includes(user.role);
  const nextOptions = getSafeNextSectorOptions(lot);

  const isTrackable = canTrackWork(currentLotSector);
  const expedienteAberto = typeof isExpedienteAbertoForSector === 'function'
    ? isExpedienteAbertoForSector(currentLotSector)
    : true;
  const canTrack = isTrackable && expedienteAberto && (
    (user.role === 'sector' && visibleSectors.includes(currentLotSector))
    || ['admin','diretoria','pcp','manager'].includes(user.role)
  );

  // Quem pode reprovar: operadores do setor, pcp, admin, diretoria, manager
  const canReject = (user.role === 'sector' && visibleSectors.includes(currentLotSector))
    || ['admin','diretoria','pcp','pcp_lib','manager'].includes(user.role);

  let workBtns = '';
  if (isTrackable && !expedienteAberto) {
    workBtns = `<span class="shift-closed-chip"><i class="fas fa-lock"></i> Expediente fechado</span>`;
  }
  if (canTrack) {
    if (status === 'idle' || status === 'paused') {
      workBtns = `
        <button class="btn btn-sm btn-work-start" onclick="event.stopPropagation(); startLotWork('${lot.id}')">
          <i class="fas fa-play"></i> ${status==='paused'?'Retomar':'Iniciar'}
        </button>`;
    } else if (status === 'working') {
      workBtns = `
        <button class="btn btn-sm btn-work-pause" onclick="event.stopPropagation(); pauseLotWork('${lot.id}')">
          <i class="fas fa-pause"></i> Pausar
        </button>`;
    }
  }

  const statusIndicator = status === 'working'
    ? `<span class="work-status-dot working" title="Em produção"></span>`
    : status === 'paused'
    ? `<span class="work-status-dot paused" title="Pausado"></span>`
    : '';

  // Barra visual de tempo: verde=trabalhado, amarelo=pausado, cinza=ocioso
  const totalMs  = timeSummary.total || 1;
  const wPct     = Math.min(100, Math.round(timeSummary.worked / totalMs * 100));
  const pPct     = Math.min(100 - wPct, Math.round(timeSummary.paused / totalMs * 100));
  const idlePct  = 100 - wPct - pPct;

  const timeBarHtml = isTrackable ? `
    <div class="time-bar-wrap" title="Verde=Trabalhado | Amarelo=Pausado | Cinza=Ocioso">
      <div class="time-bar">
        <div class="time-bar-worked" style="width:${wPct}%"></div>
        <div class="time-bar-paused" style="width:${pPct}%"></div>
        <div class="time-bar-idle"   style="width:${idlePct}%"></div>
      </div>
      <div class="time-bar-labels">
        <span class="tbl-total">⏱ ${formatMs(timeSummary.total)}</span>
        ${timeSummary.worked > 0 ? `<span class="tbl-worked">▶ ${formatMsShort(timeSummary.worked)}</span>` : ''}
        ${timeSummary.paused > 0 ? `<span class="tbl-paused">⏸ ${formatMsShort(timeSummary.paused)}</span>` : ''}
      </div>
    </div>` : `<div class="kanban-card-time">⏱ ${formatMs(timeSummary.total)} no setor</div>`;

  // Badge de origem MySQL (bridge)
  const isMysql     = lot._source === 'mysql';
  const mysqlBadge  = isMysql
    ? `<span class="badge-mysql" title="Importado do ERP (MySQL)"><i class="fas fa-database"></i> ERP</span>`
    : '';
  // OP badge para lotes MySQL
  const opBadge = isMysql && lot.op
    ? `<span class="badge-op" title="Ordem de Produção">OP ${escapeHtml(String(lot.op))}</span>`
    : '';
  // Mostramos sempre o nome do produto (nunca o código)
  const paintOrProduct = escapeHtml(
    lot.paint || lot.productName || lot.nome_produto || lot.pits_nome_produto || ''
  );
  const clientDisplay  = escapeHtml(lot.client || '');
  const cityDisplay    = escapeHtml(lot.city   || '');
  const numDisplay     = escapeHtml(String(lot.number || ''));
  const orderDisplay   = escapeHtml(String(lot.orderNumber || ''));

  return `
    <div class="kanban-card priority-card-${lot.priority} ${late?'late-card':''} ${alertThr?'alert-card':''} ${isMysql?'kanban-card-mysql':''}"
         onclick="openLotDetail('${lot.id}')">
      <div class="kanban-card-top">
        <span class="kanban-lot-num">#${numDisplay}${opBadge}</span>
        <div style="display:flex;align-items:center;gap:.4rem">
          ${mysqlBadge}
          ${statusIndicator}
          <span class="priority-dot" style="background:${pColor}" title="${PRIORITY_LABELS[lot.priority]}"></span>
        </div>
      </div>
      <div class="kanban-card-client">${clientDisplay}</div>
      ${paintOrProduct ? `<div class="kanban-card-paint">${paintOrProduct}</div>` : ''}
      <div style="margin:.2rem 0">
        <span class="product-type-badge type-${pt}">${PRODUCT_TYPES[pt]||pt}</span>
        ${orderDisplay ? `<span class="order-ref" style="margin-left:.3rem">Ped.#${orderDisplay}</span>` : ''}
      </div>
      <div class="kanban-card-qty">${lot.qty} ${lot.unit||'Kg'}</div>
      ${lot.deliveryDate ? `
      <div class="kanban-card-date ${late?'text-danger':today?'text-warning':''}">
        <i class="fas fa-calendar-alt"></i> ${formatDate(lot.deliveryDate)}
        ${late?' ⚠️':today?' 📅':''}
      </div>` : ''}
      ${cityDisplay ? `<div class="kanban-card-city"><i class="fas fa-map-pin"></i> ${cityDisplay}</div>` : ''}
      ${timeBarHtml}
      ${(() => {
        try {
          const elapsed = typeof getCurrentSectorElapsedTime === 'function'
            ? getCurrentSectorElapsedTime(lot) : 0;
          if (!elapsed || elapsed < 60000) return '';
          const cls = elapsed > 28800000 ? 'rt-sector-time-critical'
                    : elapsed > 14400000 ? 'rt-sector-time-attention'
                    : 'rt-sector-time-normal';
          const label = typeof rtFormatMs === 'function' ? rtFormatMs(elapsed) : formatMs(elapsed);
          return `<div class="rt-sector-elapsed ${cls}"><i class="fas fa-stopwatch"></i> No setor há: ${label}</div>`;
        } catch(_) { return ''; }
      })()}
      ${alertThr ? '<div class="kanban-alert">⚠️ Possível atraso</div>' : ''}
      <div class="kanban-card-actions" onclick="event.stopPropagation()">
        ${workBtns}
        ${canAdvance && nextOptions.length > 0 ? `
          <button class="btn btn-sm btn-success kanban-advance-btn"
            onclick="event.stopPropagation(); openSendSector('${lot.id}')">
            <i class="fas fa-arrow-right"></i> Avançar
          </button>` : ''}
        ${canReject ? `
          <button class="btn-reject"
            onclick="event.stopPropagation(); openRejectModal('${lot.id}')">
            <i class="fas fa-ban"></i> Reprovar
          </button>` : ''}
      </div>
    </div>
  `;
}

// ===================================================
// INICIAR TRABALHO
// ===================================================
async function startLotWork(lotId) {
  const lot  = STATE.lots.find(l => l.id === lotId);
  const user = STATE.currentUser || {};
  if (!lot) return;

  normalizeLotSectorForKanban(lot);

  if (typeof isExpedienteAbertoForSector === 'function' && !isExpedienteAbertoForSector(lot.sector)) {
    alert('O expediente deste setor está fechado. Clique em Iniciar expediente antes de iniciar o lote.');
    return;
  }

  if (typeof ffEnsureTimeArrays === 'function') ffEnsureTimeArrays(lot);

  const now = Date.now();
  const sector = normalizeKanbanSector(lot.sector);
  const sessions = Array.isArray(lot.workSessions) ? [...lot.workSessions] : [];

  // Fecha pausa aberta, se existir. Pausa é uma sessão própria com pauseReason.
  const openPauseSession = [...sessions].reverse().find(s =>
    normalizeKanbanSector(s.sector) === sector &&
    !s.end &&
    s.pauseReason &&
    String(s.pauseReason).trim()
  );

  if (openPauseSession) {
    openPauseSession.end = now;
  }

  // Fecha qualquer trabalho aberto acidentalmente sem transformar em pausa.
  sessions.forEach(s => {
    if (
      normalizeKanbanSector(s.sector) === sector &&
      !s.end &&
      !(s.pauseReason && String(s.pauseReason).trim())
    ) {
      s.end = now;
    }
  });

  // Abre nova sessão de trabalho limpa.
  sessions.push({
    sector,
    start: now,
    end: null,
    user: user.id || 'sistema',
    userName: user.name || user.username || user.login || 'Sistema'
  });

  lot.workSessions = sessions;
  lot.lotStatus = 'working';
  lot.expedientePausedStatus = '';
  // NÃO alterar lot.history aqui para não zerar o timer de tempo no setor.
  // sectorEnteredAt permanece o mesmo (só muda quando avança de setor).

  try {
    await apiUpdateLot(lot);
    showToast(`▶️ Produção iniciada – Lote #${lot.number}`);

    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage === 'meu_setor' && typeof renderMeuSetor === 'function') {
      renderMeuSetor();
    } else {
      renderKanban();
    }
  } catch(e) { alert('Erro ao iniciar: '+e.message); }
}

// ===================================================
// PAUSAR TRABALHO
// ===================================================
function pauseLotWork(lotId) {
  const lot = STATE.lots.find(l => l.id === lotId);
  if (!lot) return;
  normalizeLotSectorForKanban(lot);
  if (typeof isExpedienteAbertoForSector === 'function' && !isExpedienteAbertoForSector(lot.sector)) {
    alert('O expediente deste setor está fechado. Os tempos já estão pausados.');
    return;
  }
  openPauseModal(lot);
}

let _pauseLotId = null;
function openPauseModal(lot) {
  _pauseLotId = lot.id;
  const existing = document.getElementById('modalPause');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modalPause';
  modal.className = 'modal';
  modal.style.cssText = 'display:flex;flex-direction:column;';

  const ts = getLotTimeSummary(lot);
  modal.innerHTML = `
    <div class="modal-header">
      <h3><i class="fas fa-pause-circle"></i> Pausar Produção – Lote #${lot.number}</h3>
      <button onclick="document.getElementById('modalOverlay').style.display='none'" class="modal-close"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body">
      <div class="pause-time-summary">
        <div class="pts-item pts-total"><span>⏱ Total no setor</span><strong>${formatMs(ts.total)}</strong></div>
        <div class="pts-item pts-worked"><span>▶ Trabalhado</span><strong>${formatMs(ts.worked)}</strong></div>
        <div class="pts-item pts-paused"><span>⏸ Pausado</span><strong>${formatMs(ts.paused)}</strong></div>
        <div class="pts-item pts-idle"><span>💤 Ocioso</span><strong>${formatMs(ts.idle)}</strong></div>
      </div>
      <div class="form-group" style="margin-top:1rem">
        <label>Motivo da Pausa *</label>
        <textarea id="pauseReason" rows="3" placeholder="Descreva o motivo da pausa (falta de material, intervalo, manutenção, etc.)..."
          style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.625rem;border-radius:8px;font-size:.9rem;"></textarea>
      </div>
      <div class="modal-footer">
        <button onclick="document.getElementById('modalOverlay').style.display='none'" class="btn btn-secondary">Cancelar</button>
        <button onclick="confirmPauseLot()" class="btn btn-warning"><i class="fas fa-pause"></i> Confirmar Pausa</button>
      </div>
    </div>`;

  document.getElementById('modalOverlay').appendChild(modal);
  openModal('modalPause');
}

async function confirmPauseLot() {
  const reason = document.getElementById('pauseReason')?.value?.trim();
  if (!reason) { alert('Informe o motivo da pausa.'); return; }

  const lot  = STATE.lots.find(l => l.id === _pauseLotId);
  const user = STATE.currentUser || {};
  if (!lot) return;

  normalizeLotSectorForKanban(lot);

  if (typeof ffEnsureTimeArrays === 'function') ffEnsureTimeArrays(lot);

  const now = Date.now();
  const sector = normalizeKanbanSector(lot.sector);
  const sessions = Array.isArray(lot.workSessions) ? [...lot.workSessions] : [];

  // Fecha a sessão de TRABALHO aberta sem marcar como pausa.
  const openWorkSession = [...sessions].reverse().find(s =>
    normalizeKanbanSector(s.sector) === sector &&
    !s.end &&
    !(s.pauseReason && String(s.pauseReason).trim())
  );

  if (openWorkSession) {
    openWorkSession.end = now;
  }

  // Evita criar pausa duplicada se já existir uma pausa aberta.
  let openPauseSession = [...sessions].reverse().find(s =>
    normalizeKanbanSector(s.sector) === sector &&
    !s.end &&
    s.pauseReason &&
    String(s.pauseReason).trim()
  );

  if (openPauseSession) {
    openPauseSession.pauseReason = reason;
    openPauseSession.reason = reason;
  } else {
    // Cria uma sessão separada só para PAUSA.
    sessions.push({
      sector,
      start: now,
      end: null,
      pauseReason: reason,
      reason,
      user: user.id || 'sistema',
      userName: user.name || user.username || user.login || 'Sistema'
    });
  }

  lot.workSessions = sessions;
  lot.lotStatus = 'paused';
  // NÃO adicionar ao history para não resetar o timer de tempo no setor.

  try {
    await apiUpdateLot(lot);
    document.getElementById('modalOverlay').style.display = 'none';
    _pauseLotId = null;
    showToast(`⏸️ Produção pausada – Lote #${lot.number}`);
    // Atualiza a tela ativa (Kanban ou Meu Setor)
    const _activePg = document.querySelector('.nav-item.active')?.dataset.page;
    if (_activePg === 'meu_setor' && typeof renderMeuSetor === 'function') {
      renderMeuSetor();
    } else {
      renderKanban();
    }
  } catch(e) { alert('Erro ao pausar: '+e.message); }
}

// ===================================================
// REPROVAR LOTE – Modal + Confirmação
// ===================================================
let _rejectLotId = null;

function openRejectModal(lotId) {
  const lot = STATE.lots.find(l => l.id === lotId);
  if (!lot) return;
  normalizeLotSectorForKanban(lot);
  _rejectLotId = lotId;

  document.getElementById('modalRejectTitle').innerHTML =
    `<i class="fas fa-ban" style="color:#ef4444"></i> Reprovar Lote #${escapeHtml(lot.number)}`;
  document.getElementById('modalRejectInfo').innerHTML =
    `Lote <strong>#${escapeHtml(lot.number)}</strong> – ${escapeHtml(lot.client)}<br>
     Setor: <strong>${SECTOR_LABELS[lot.sector] || lot.sector}</strong> | Produto: ${escapeHtml(lot.paint)}`;
  document.getElementById('rejectReason').value = '';
  openModal('modalRejectLot');
}

function openRejectConfirmation() {
  const reason = document.getElementById('rejectReason').value.trim();
  if (!reason || reason.length < 10) {
    alert('Por favor, informe a justificativa com pelo menos 10 caracteres.');
    return;
  }
  const lot = STATE.lots.find(l => l.id === _rejectLotId);
  if (!lot) return;
  normalizeLotSectorForKanban(lot);

  document.getElementById('modalRejectConfirmLot').innerHTML =
    `Lote #${escapeHtml(lot.number)} – ${escapeHtml(lot.client)}`;
  document.getElementById('modalRejectConfirmReason').innerHTML =
    `Motivo: "<em>${escapeHtml(reason)}</em>"<br>Setor: ${SECTOR_LABELS[lot.sector] || lot.sector}`;

  // Esconde o modal anterior e abre o de confirmação
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  const confirmModal = document.getElementById('modalRejectConfirm');
  confirmModal.style.display = 'flex';
  confirmModal.style.flexDirection = 'column';
}

function backToRejectForm() {
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  const rejectModal = document.getElementById('modalRejectLot');
  rejectModal.style.display = 'flex';
  rejectModal.style.flexDirection = 'column';
}

async function confirmRejectLot() {
  const reason = document.getElementById('rejectReason').value.trim();
  if (!_rejectLotId || !reason) return;

  const btn = document.getElementById('btnFinalReject');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reprovando...';

  try {
    const lot = await rejectLot(_rejectLotId, reason);
    closeModal();
    _rejectLotId = null;

    showToast(`⛔ Lote #${lot.number} reprovado e removido da produção.`, 'error');

    // Atualiza todas as views relevantes
    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage) {
      switch(activePage) {
        case 'kanban':     renderKanban();     break;
        case 'lots':       renderLots();       break;
        case 'dashboard':  renderDashboard();  break;
        case 'orders':     renderOrdersPage(); break;
        default: break;
      }
    }
    updateAlertBadge();
  } catch(err) {
    alert('Erro ao reprovar lote: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-ban"></i> Reprovar Definitivamente';
  }
}
