'use strict';

// =========================================================
// IMERSÃO NA FÁBRICA (MVP)
// Arquitetura em camadas:
//   CAMADA 1 — imagem real do cenário (só existe para a Coloração hoje,
//              frontend/images/imersao/coloracao-cenario.png, usada como
//              está, sem redesenho, apenas escurecida por um véu). Os
//              demais setores usam um fundo ambiente genérico (gradiente)
//              até termos fotos reais deles.
//   CAMADA 2 — cartões HTML das OPs, centralizados sobre o fundo.
//   CAMADA 3 — dados reais das OPs, vindos de STATE.lots (mesmos dados
//              do Kanban/Lotes) via ffGetLotCurrentSector. Nada mockado.
//
// Navegação: a tela abre num HUB com um quadradinho por setor (com a
// contagem de OPs de cada um). Qualquer usuário pode clicar em qualquer
// setor para ver as OPs reais de lá. Tempo médio de liberação e previsão
// de chegada (hoje só calculados para a Coloração) só aparecem para quem
// está logado com o setor daquele setor — os demais usuários e os outros
// setores veem só as OPs sobre o fundo.
// =========================================================

const IM_IMAGE_SRC = 'images/imersao/coloracao-cenario.png';
const IM_IMAGE_NATIVE = { w: 1536, h: 1024 };

// Janela de recorte (em pixels da imagem original) — mostra só a sala
// física, excluindo a barra superior, o painel lateral direito e as
// tabelas inferiores do mockup original.
const IM_CROP = { left: 0, top: 76, width: 1350, height: 530 };

// --------- GRUPOS DE OPs DA COLORAÇÃO ---------
// A Coloração é o único setor com cenário fotográfico + subdivisão em 3
// grupos (mesma bancada física). Os demais setores do HUB usam a view
// genérica (um card só, ver _imRenderGenericDetail).
const IMERSAO_SECTOR_MAP = {
  coloracao: {
    groups: {
      coloracao: {
        sector: 'coloracao',
        label: 'Coloração',
        color: '#22d3ee',
        glow: 'rgba(34,211,238,.5)'
      },
      coloracao_revisao: {
        sector: 'coloracao_revisao',
        label: 'Coloração Revisão',
        color: '#f59e0b',
        glow: 'rgba(245,158,11,.5)'
      },
      coloracao_amostras: {
        sector: 'coloracao_amostras',
        label: 'Coloração Amostras',
        color: '#e879f9',
        glow: 'rgba(232,121,249,.5)'
      }
    }
  }
};

// --------- SETORES DO HUB ---------
// Todo setor do fluxo real ganha um quadradinho no hub (exceto 'pronto',
// que não é um lugar físico onde uma OP fica parada). O clique leva à
// view daquele setor com as OPs reais de lá.
const IM_HUB_SECTORS = [
  { key: 'coloracao_revisao',   icon: 'fa-magnifying-glass' },
  { key: 'laboratorio_revisao', icon: 'fa-flask-vial' },
  { key: 'pcp_liberacao',       icon: 'fa-clipboard-check' },
  { key: 'laboratorio_amostras', icon: 'fa-vial' },
  { key: 'coloracao_amostras',  icon: 'fa-droplet' },
  { key: 'pesagem',             icon: 'fa-weight-scale' },
  { key: 'producao',            icon: 'fa-industry' },
  { key: 'coloracao',           icon: 'fa-palette' },
  { key: 'laboratorio',         icon: 'fa-flask' },
  { key: 'envase_produzir',     icon: 'fa-fill-drip' },
  { key: 'envase_enlatamento',  icon: 'fa-box' }
];

const IM_MAX_PRANCHETA_ICONS = 40;

// Setor(es) considerado(s) para a previsão de chegada à Coloração. A
// pedido do usuário, PCP e Pesagem são ignorados aqui (fila deles não é
// confiável para prever gargalo) — só Produção conta como "a caminho".
const IM_FLOW_BEFORE_COLORACAO = ['producao'];

const IM_FORECAST_HORIZON_MS = 24 * 60 * 60 * 1000; // horizonte de previsão: 24h
const IM_BOTTLENECK_THRESHOLD = 5;
const IM_DEFAULT_SECTOR_MS = 90 * 60 * 1000; // fallback quando não há histórico (90min)

let _imState = {
  view: 'hub',
  groups: null,
  refreshTimer: null,
  tickTimer: null,
  analyticsTimer: null,
  chart: null
};

// --------- ENTRADA DA PÁGINA (sempre abre no hub) ---------
function renderImersaoColoracao() {
  _imRenderHub();
}

// --------- HUB: um quadradinho por setor ---------
function _imRenderHub() {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page) return;

  _imClearTimers();
  _imState.view = 'hub';
  _imState.groups = null;

  const tiles = IM_HUB_SECTORS.map(s => {
    const label = SECTOR_LABELS[s.key] || s.key;
    const color = SECTOR_COLORS[s.key] || '#38bdf8';
    const count = _imLotsForSector(s.key).length;
    return `
      <div class="im-hub-tile" id="imHubTile_${s.key}" style="--im-color:${color};" onclick="_imOpenSector('${s.key}')">
        <div class="im-hub-tile-icon"><i class="fas ${s.icon}"></i></div>
        <div class="im-hub-tile-label">${escapeHtml(label)}</div>
        <div class="im-hub-tile-count" id="imHubCount_${s.key}">${count} OP${count === 1 ? '' : 's'}</div>
      </div>
    `;
  }).join('');

  page.innerHTML = `
    <div class="im-toolbar">
      <div>
        <h2><i class="fas fa-vr-cardboard"></i> Imersão na Fábrica</h2>
        <p class="im-subtitle">Selecione um setor para ver as OPs em tempo real de lá.</p>
      </div>
    </div>

    <div class="im-hub-stage">
      <div class="im-hub-tiles">${tiles}</div>
    </div>
  `;

  _imState.refreshTimer = setInterval(_imRefreshHubCounts, 5000);
}

function _imRefreshHubCounts() {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page || !page.classList.contains('active') || _imState.view !== 'hub') return;
  IM_HUB_SECTORS.forEach(s => {
    const el = document.getElementById(`imHubCount_${s.key}`);
    if (!el) return;
    const count = _imLotsForSector(s.key).length;
    const text = `${count} OP${count === 1 ? '' : 's'}`;
    if (el.textContent !== text) el.textContent = text;
  });
}

function _imOpenSector(sector) {
  if (sector === 'coloracao') _imRenderColoracaoDetail();
  else _imRenderGenericDetail(sector);
}

function _imBackToHub() {
  _imRenderHub();
}

// --------- VIEW DA COLORAÇÃO (cenário fotográfico + analytics) ---------
function _imRenderColoracaoDetail() {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page) return;

  _imClearTimers();
  _imState.view = 'coloracao';
  _imState.groups = IMERSAO_SECTOR_MAP.coloracao.groups;

  const cropAspect = (IM_CROP.width / IM_CROP.height).toFixed(4);
  const imgWidthPct = ((IM_IMAGE_NATIVE.w / IM_CROP.width) * 100).toFixed(3);
  const imgLeftPct = (-(IM_CROP.left / IM_CROP.width) * 100).toFixed(3);
  const imgTopPct = (-(IM_CROP.top / IM_CROP.height) * 100).toFixed(3);
  const canSeeAnalytics = _imCanSeeAnalytics('coloracao');

  page.innerHTML = `
    <div class="im-toolbar">
      <button class="im-back-btn" onclick="_imBackToHub()"><i class="fas fa-arrow-left"></i> Setores</button>
      <div>
        <h2><i class="fas fa-vr-cardboard"></i> Imersão na Fábrica — Coloração</h2>
        <p class="im-subtitle">Visualização em tempo real do setor. Clique numa prancheta para ver os detalhes da OP.</p>
      </div>
    </div>

    <div class="im-stage" id="imStage" style="aspect-ratio:${cropAspect};">
      <div class="im-scene" id="imScene">
        <img class="im-bg-img" src="${IM_IMAGE_SRC}" alt="Cenário do setor de Coloração"
             style="left:${imgLeftPct}%; top:${imgTopPct}%; width:${imgWidthPct}%;">
        <div class="im-dim"></div>
        <div class="im-center-wrap">${_imRenderGroupCards(_imState.groups)}</div>
      </div>
    </div>

    ${canSeeAnalytics ? `
    <div class="im-analytics-row">
      <div class="im-analytics-card">
        <div class="im-analytics-title"><i class="fas fa-chart-column"></i> Tempo médio de liberação — Coloração</div>
        <div class="im-chart-wrap"><canvas id="imChartAvgTime"></canvas></div>
      </div>
      <div class="im-analytics-card" id="imForecastCard">
        <div class="im-analytics-title"><i class="fas fa-truck-ramp-box"></i> Previsão de chegada à Coloração</div>
        <div id="imForecastBody">Calculando...</div>
      </div>
    </div>
    ` : ''}
  `;

  _imStartTimers({ analytics: canSeeAnalytics });
  if (canSeeAnalytics) _imRenderAnalytics();
}

// --------- VIEW GENÉRICA (qualquer outro setor do hub) ---------
// Sem foto real ainda (só a Coloração tem cenário fotografado hoje) — usa
// um fundo ambiente escuro com um brilho na cor do setor, e mostra as OPs
// reais daquele setor exatamente como na Coloração (mesma prancheta).
function _imRenderGenericDetail(sector) {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page) return;

  _imClearTimers();
  _imState.view = sector;

  const label = SECTOR_LABELS[sector] || sector;
  const color = SECTOR_COLORS[sector] || '#38bdf8';
  _imState.groups = {
    [sector]: { sector, label, color, glow: _imHexToRgba(color, .5) }
  };

  page.innerHTML = `
    <div class="im-toolbar">
      <button class="im-back-btn" onclick="_imBackToHub()"><i class="fas fa-arrow-left"></i> Setores</button>
      <div>
        <h2><i class="fas fa-vr-cardboard"></i> Imersão na Fábrica — ${escapeHtml(label)}</h2>
        <p class="im-subtitle">Visualização em tempo real do setor. Clique numa prancheta para ver os detalhes da OP.</p>
      </div>
    </div>

    <div class="im-stage im-stage-generic" style="--im-generic-glow:${_imHexToRgba(color, .16)};">
      <div class="im-scene">
        <div class="im-center-wrap">${_imRenderGroupCards(_imState.groups)}</div>
      </div>
    </div>
  `;

  _imStartTimers({ analytics: false });
}

function _imHexToRgba(hex, alpha) {
  const clean = (hex || '#38bdf8').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16) || 0x38bdf8;
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// --------- PERMISSÃO: tempo médio e previsão só para o setor logado ---------
// (ou para quem enxerga a fábrica inteira: admin, diretoria, gerente e PCP)
const IM_FULL_VISIBILITY_ROLES = ['admin', 'diretoria', 'manager', 'pcp', 'pcp_lib'];

function _imCanSeeAnalytics(sector) {
  const u = STATE.currentUser;
  if (!u) return false;
  if (IM_FULL_VISIBILITY_ROLES.includes(u.role)) return true;
  return u.sector === sector;
}

function _imRenderGroupCards(groups) {
  return Object.entries(groups).map(([key, g]) => {
    const lots = _imLotsForSector(g.sector);
    return `
      <div class="im-group-card" id="imWall_${key}" style="--im-color:${g.color}; --im-glow:${g.glow};">
        <div class="im-group-title">${escapeHtml(g.label)} <span class="im-wall-count" id="imCount_${key}">${lots.length}</span></div>
        <div class="im-card-pranchetas" id="imPranchetas_${key}">${_imRenderPranchetas(lots)}</div>
      </div>
    `;
  }).join('');
}

function _imRenderPranchetas(lots) {
  if (!lots.length) return '<div class="im-card-empty">Nenhuma OP neste grupo agora.</div>';
  const visible = lots.slice(0, IM_MAX_PRANCHETA_ICONS);
  const icons = visible.map(l => {
    const op = l.number || l.op || '?';
    const client = l.client || '';
    const product = l.productName || '';
    const due = l.deliveryDate ? formatDate(l.deliveryDate) : '';
    const enteredAt = Number(l.sectorEnteredAt) || Date.now();
    const tooltipParts = [`OP ${op}`, client, product, due ? `Prazo ${due}` : '', `No setor há ${formatMs(Date.now() - enteredAt)}`].filter(Boolean);
    return `
    <div class="im-prancheta" onclick="event.stopPropagation(); openImersaoOp('${l.id}')" title="${escapeHtml(tooltipParts.join(' · '))}">
      <span class="im-prancheta-label">OP ${escapeHtml(op)}</span>
      ${client ? `<span class="im-prancheta-client">${escapeHtml(client)}</span>` : ''}
      ${product ? `<span class="im-prancheta-product">${escapeHtml(product)}</span>` : ''}
      <span class="im-prancheta-time" data-entered-at="${enteredAt}"><i class="fas fa-clock"></i> ${formatMs(Date.now() - enteredAt)}</span>
      ${due ? `<span class="im-prancheta-due"><i class="fas fa-truck"></i> ${escapeHtml(due)}</span>` : ''}
    </div>
  `;
  }).join('');
  const overflow = lots.length > IM_MAX_PRANCHETA_ICONS
    ? `<div class="im-prancheta im-prancheta-more">+${lots.length - IM_MAX_PRANCHETA_ICONS}</div>`
    : '';
  return icons + overflow;
}

// --------- DADOS (100% de STATE.lots, sem mock) ---------
function _imLotsForSector(sector) {
  const lots = Array.isArray(STATE.lots) ? STATE.lots : [];
  return lots
    .filter(l => !l.rejected && ffGetLotCurrentSector(l) === sector)
    .sort((a, b) => (a.sectorEnteredAt || 0) - (b.sectorEnteredAt || 0));
}

// --------- MODAL RÁPIDO DE UMA OP (reaproveita padrão de modal existente) ---------
function openImersaoOp(lotId) {
  const lot = (STATE.lots || []).find(l => l.id === lotId);
  if (!lot) return;

  const sector = ffGetLotCurrentSector(lot);
  const enteredAt = Number(lot.sectorEnteredAt) || Date.now();

  document.getElementById('modalImersaoOpTitle').textContent = `OP ${lot.number || lot.op || ''}`;
  document.getElementById('modalImersaoOpBody').innerHTML = `
    <table class="im-modal-table">
      <tr><td>Cliente</td><td>${escapeHtml(lot.client || '–')}</td></tr>
      <tr><td>Produto</td><td><strong>${escapeHtml(lot.productName || '–')}</strong></td></tr>
      <tr><td>Quantidade</td><td>${escapeHtml(String(lot.qty || '–'))} ${escapeHtml(lot.unit || '')}</td></tr>
      <tr><td>Prazo de entrega</td><td>${formatDate(lot.deliveryDate)}</td></tr>
      <tr><td>Setor atual</td><td><span class="sector-tag" style="background:${SECTOR_COLORS[sector] || '#334155'}">${escapeHtml(SECTOR_LABELS[sector] || sector)}</span></td></tr>
      <tr><td>Entrada no setor</td><td>${formatDateTime(enteredAt)}</td></tr>
      <tr><td>Tempo no setor</td><td id="imModalOpTime" data-entered-at="${enteredAt}">${formatMs(Date.now() - enteredAt)}</td></tr>
      <tr><td>Status</td><td>${escapeHtml(lot.rejected ? 'Reprovado' : 'Em ' + (SECTOR_LABELS[sector] || sector))}</td></tr>
    </table>
    <button class="btn btn-primary im-btn-full" onclick="closeModal(); openLotDetail('${lot.id}')">
      <i class="fas fa-external-link-alt"></i> Ver OP completa
    </button>
  `;

  openModal('modalImersaoOp');
}

// --------- ATUALIZAÇÃO CONTÍNUA (dados reais, sem mock) ---------
// STATE.lots já é mantido atualizado pelo ciclo global de auto-update do
// app (app.js). Aqui só recalculamos pranchetas/contadores periodicamente
// e atualizamos o relógio de "tempo no setor" a cada segundo.
function _imStartTimers(opts) {
  opts = opts || {};
  _imClearTimers();
  _imState.tickTimer = setInterval(_imTickClocks, 1000);
  _imState.refreshTimer = setInterval(_imRefreshCounts, 4000);
  if (opts.analytics) {
    _imState.analyticsTimer = setInterval(_imRenderAnalytics, 20000);
  }
}

function _imClearTimers() {
  if (_imState.tickTimer) clearInterval(_imState.tickTimer);
  if (_imState.refreshTimer) clearInterval(_imState.refreshTimer);
  if (_imState.analyticsTimer) clearInterval(_imState.analyticsTimer);
  _imState.tickTimer = null;
  _imState.refreshTimer = null;
  _imState.analyticsTimer = null;
  if (_imState.chart) {
    try { _imState.chart.destroy(); } catch (_) { /* já removido do DOM */ }
    _imState.chart = null;
  }
}

function _imTickClocks() {
  const modalTime = document.getElementById('imModalOpTime');
  if (modalTime) {
    const enteredAt = Number(modalTime.dataset.enteredAt) || Date.now();
    modalTime.textContent = formatMs(Date.now() - enteredAt);
  }
  document.querySelectorAll('#pageImersaoColoracao .im-prancheta-time').forEach(el => {
    const enteredAt = Number(el.dataset.enteredAt) || Date.now();
    el.innerHTML = `<i class="fas fa-clock"></i> ${formatMs(Date.now() - enteredAt)}`;
  });
}

function _imRefreshCounts() {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page || !page.classList.contains('active') || !_imState.groups) return;

  Object.entries(_imState.groups).forEach(([key, g]) => {
    const lots = _imLotsForSector(g.sector);
    const countEl = document.getElementById(`imCount_${key}`);
    const pranchetasEl = document.getElementById(`imPranchetas_${key}`);
    if (countEl && countEl.textContent !== String(lots.length)) {
      countEl.textContent = String(lots.length);
      countEl.classList.remove('im-pulse');
      void countEl.offsetWidth; // reinicia a animação
      countEl.classList.add('im-pulse');
    }
    if (pranchetasEl) pranchetasEl.innerHTML = _imRenderPranchetas(lots);
  });
}

// --------- GRÁFICO: TEMPO MÉDIO DE LIBERAÇÃO (dados reais de sectorMetrics) ---------
// Cada visita finalizada de um lote pela Coloração fica registrada em
// lot.sectorMetrics (enteredAt/leftAt/totalMs). Juntamos isso de todos os
// lotes em STATE.lots para calcular a média de hoje/semana/mês — sem mock.
// Só é chamado quando _imCanSeeAnalytics('coloracao') é verdadeiro.
function _imColoracaoMetricEntries() {
  const lots = Array.isArray(STATE.lots) ? STATE.lots : [];
  const entries = [];
  lots.forEach(l => {
    if (typeof ffEnsureTimeArrays === 'function') ffEnsureTimeArrays(l);
    const metrics = Array.isArray(l.sectorMetrics) ? l.sectorMetrics : [];
    metrics.forEach(m => {
      if (m && m.sector === 'coloracao' && m.leftAt && m.totalMs > 0) entries.push(m);
    });
  });
  return entries;
}

function _imAvgMsSince(entries, sinceTs) {
  const filtered = entries.filter(m => m.leftAt >= sinceTs);
  if (!filtered.length) return null;
  return filtered.reduce((sum, m) => sum + m.totalMs, 0) / filtered.length;
}

function _imRenderAnalytics() {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page || !page.classList.contains('active') || _imState.view !== 'coloracao') return;
  if (!_imCanSeeAnalytics('coloracao')) return;

  const entries = _imColoracaoMetricEntries();
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startWeek = startToday - 6 * 24 * 60 * 60 * 1000;
  const startMonth = startToday - 29 * 24 * 60 * 60 * 1000;

  const avgToday = _imAvgMsSince(entries, startToday);
  const avgWeek = _imAvgMsSince(entries, startWeek);
  const avgMonth = _imAvgMsSince(entries, startMonth);

  _imDrawAvgChart([avgToday, avgWeek, avgMonth]);
  _imRenderForecastPanel(avgWeek || avgMonth || null);
}

function _imDrawAvgChart(avgs) {
  const canvas = document.getElementById('imChartAvgTime');
  if (!canvas || typeof Chart === 'undefined') return;

  const dataHours = avgs.map(v => v ? +(v / 3600000).toFixed(2) : 0);
  const labels = ['Hoje', 'Semana', 'Mês'];

  if (_imState.chart) {
    _imState.chart.data.datasets[0].data = dataHours;
    _imState.chart.update();
    return;
  }

  _imState.chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tempo médio (h)',
        data: dataHours,
        backgroundColor: ['#22d3ee', '#f59e0b', '#e879f9'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
      }
    }
  });
}

// --------- PREVISÃO DE CHEGADA / GARGALO ---------
// Olha os lotes que ainda estão em Produção — o único setor considerado
// "a caminho" (PCP e Pesagem ficam de fora a pedido do usuário) — e
// estima quando cada um deve chegar usando o tempo médio real da
// Produção (sectorMetrics), com fallback genérico quando não há
// histórico suficiente. Só é chamado quando _imCanSeeAnalytics('coloracao').
function _imAvgMsForSector(sector) {
  const lots = Array.isArray(STATE.lots) ? STATE.lots : [];
  const totals = [];
  lots.forEach(l => {
    if (typeof ffEnsureTimeArrays === 'function') ffEnsureTimeArrays(l);
    const metrics = Array.isArray(l.sectorMetrics) ? l.sectorMetrics : [];
    metrics.forEach(m => {
      if (m && m.sector === sector && m.totalMs > 0) totals.push(m.totalMs);
    });
  });
  if (!totals.length) return IM_DEFAULT_SECTOR_MS;
  return totals.reduce((a, b) => a + b, 0) / totals.length;
}

function _imComputeForecast() {
  const lots = Array.isArray(STATE.lots) ? STATE.lots : [];
  const flow = IM_FLOW_BEFORE_COLORACAO;

  const incoming = lots
    .filter(l => !l.rejected && l.productType === 'tinta' && !l.skipColor)
    .map(l => {
      const sector = ffGetLotCurrentSector(l);
      const idx = flow.indexOf(sector);
      if (idx === -1) return null; // não está mais num setor anterior (ou já passou)
      const enteredAt = Number(l.sectorEnteredAt) || Date.now();
      const elapsed = Date.now() - enteredAt;
      const remainingInCurrent = Math.max(0, _imAvgMsForSector(sector) - elapsed);
      const remainingSectors = flow.slice(idx + 1);
      const remainingSectorsMs = remainingSectors.reduce((sum, s) => sum + _imAvgMsForSector(s), 0);
      const etaMs = remainingInCurrent + remainingSectorsMs;
      return { lot: l, etaMs };
    })
    .filter(Boolean)
    .sort((a, b) => a.etaMs - b.etaMs);

  return incoming;
}

function _imRenderForecastPanel(avgColoracaoMsOverride) {
  const body = document.getElementById('imForecastBody');
  if (!body) return;

  const forecast = _imComputeForecast();
  const currentQueue = _imLotsForSector('coloracao').length;
  const avgColoracaoMs = avgColoracaoMsOverride || _imAvgMsForSector('coloracao');

  const arrivingSoon = forecast.filter(f => f.etaMs <= IM_FORECAST_HORIZON_MS);
  const throughputRatio = avgColoracaoMs > 0 ? Math.min(1, IM_FORECAST_HORIZON_MS / avgColoracaoMs) : 0;
  const estimatedLeaving = Math.round(currentQueue * throughputRatio);
  const projected = Math.max(0, currentQueue - estimatedLeaving) + arrivingSoon.length;
  const gargalo = projected > IM_BOTTLENECK_THRESHOLD;

  const listHtml = arrivingSoon.slice(0, 8).map(f => {
    const op = f.lot.number || f.lot.op || '?';
    const client = f.lot.client || '';
    const sectorAtual = SECTOR_LABELS[ffGetLotCurrentSector(f.lot)] || ffGetLotCurrentSector(f.lot);
    return `
      <div class="im-forecast-item">
        <span class="im-forecast-op">OP ${escapeHtml(op)}</span>
        <span class="im-forecast-detail">${escapeHtml(client)} · vindo de ${escapeHtml(sectorAtual)}</span>
        <span class="im-forecast-eta">chega em ~${formatMs(f.etaMs)}</span>
      </div>
    `;
  }).join('');

  body.innerHTML = `
    <div class="im-bottleneck-banner ${gargalo ? 'im-bottleneck-warn' : 'im-bottleneck-ok'}">
      <i class="fas ${gargalo ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
      ${gargalo
        ? `Risco de gargalo: previsão de ~${projected} OPs na Coloração nas próximas 24h (limite ${IM_BOTTLENECK_THRESHOLD}).`
        : `Sem risco de gargalo previsto: ~${projected} OPs esperadas na Coloração nas próximas 24h.`}
    </div>
    <div class="im-forecast-summary">
      Fila atual: <strong>${currentQueue}</strong> · Chegando em até 24h: <strong>${arrivingSoon.length}</strong> · Saída estimada em 24h: <strong>${estimatedLeaving}</strong>
    </div>
    ${listHtml ? `<div class="im-forecast-list">${listHtml}</div>` : '<div class="im-card-empty">Nenhuma OP prevista para chegar nas próximas 24h.</div>'}
  `;
}

window.renderImersaoColoracao = renderImersaoColoracao;
window.openImersaoOp = openImersaoOp;
window._imOpenSector = _imOpenSector;
window._imBackToHub = _imBackToHub;
