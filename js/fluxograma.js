'use strict';

// =========================================================
// FLUXOGRAMA DA EMPRESA
// Mostra a sequência real de setores de produção como um
// fluxograma (início -> setores -> fim), com o tempo médio
// de liberação (trabalhado) de cada um. Cada setor é
// clicável e mostra o detalhamento dos lotes que passaram
// por ele. Pensado para impressão (A4).
// =========================================================

let _fluxogramaData = null;
let _fluxogramaLoading = false;

async function renderFluxograma() {
  const page = document.getElementById('pageFluxograma');
  if (!page) return;

  page.innerHTML = `
    <div class="fx-toolbar">
      <div>
        <h2><i class="fas fa-sitemap"></i> Fluxograma de Produção</h2>
        <p class="fx-subtitle">Sequência de setores e tempo médio de liberação, com base no histórico real dos lotes. Clique em um setor para ver o detalhamento.</p>
      </div>
      <div class="fx-toolbar-actions">
        <button class="btn" onclick="loadFluxogramaAverages(true)"><i class="fas fa-sync"></i> Atualizar</button>
        <button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Imprimir</button>
      </div>
    </div>
    <div id="fxContent" class="fx-content">
      <div class="fx-loading"><i class="fas fa-spinner fa-spin"></i> Calculando tempos médios...</div>
    </div>
  `;

  await loadFluxogramaAverages(false);
}

async function loadFluxogramaAverages(force) {
  if (_fluxogramaLoading) return;
  if (_fluxogramaData && !force) {
    renderFluxogramaContent(_fluxogramaData);
    return;
  }

  _fluxogramaLoading = true;
  const content = document.getElementById('fxContent');
  if (content) {
    content.innerHTML = `<div class="fx-loading"><i class="fas fa-spinner fa-spin"></i> Calculando tempos médios...</div>`;
  }

  try {
    const rows = await _fxFetchRows();
    const sectors = _fxComputeSectorStats(rows);
    _fluxogramaData = sectors;
    renderFluxogramaContent(sectors);
  } catch (err) {
    console.error('[Fluxograma] erro ao calcular médias:', err);
    if (content) {
      content.innerHTML = `<div class="fx-error"><i class="fas fa-exclamation-triangle"></i> Não foi possível calcular os tempos médios agora.<br><small>${escapeHtml(err.message || '')}</small></div>`;
    }
  } finally {
    _fluxogramaLoading = false;
  }
}

// Busca as linhas de histórico direto do endpoint já usado no Relatório de Tempos.
async function _fxFetchRows() {
  const baseCandidates = [
    (typeof resolveFactoryFlowApiBase === 'function' ? resolveFactoryFlowApiBase() : ''),
    (typeof PEDIDOS_API !== 'undefined' ? PEDIDOS_API : ''),
    (window.PEDIDOS_API || ''),
    'https://app-producao-backend-production.up.railway.app'
  ];
  let base = baseCandidates.map(v => String(v || '').trim().replace(/\/$/, '')).find(Boolean);
  if (!base) throw new Error('Nenhuma base de API definida.');
  base = base.replace(/\/api$/i, '');

  const sessionToken =
    (typeof resolveFactoryFlowSessionToken === 'function' ? resolveFactoryFlowSessionToken() : '') ||
    sessionStorage.getItem('ff_token') ||
    localStorage.getItem('ff_token') ||
    localStorage.getItem('factoryflow_token') ||
    localStorage.getItem('token') ||
    '';

  const headers = { 'Accept': 'application/json' };
  if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  const res = await fetch(`${base}/api/producao/relatorio-tempos?limit=5000`, {
    method: 'GET',
    headers,
    signal: controller.signal,
    cache: 'no-store'
  }).finally(() => clearTimeout(timer));

  if (!res.ok) throw new Error(`Backend respondeu ${res.status}`);
  const json = await res.json().catch(() => null);
  if (!json) throw new Error('Resposta inválida do backend.');

  return Array.isArray(json.data) ? json.data : (Array.isArray(json.rows) ? json.rows : []);
}

// Agrupa por setor (independente do produto), calcula tempo médio/mín/máx
// TRABALHADO e guarda a lista de lotes que passaram por cada setor
// (para o drill-down ao clicar).
function _fxComputeSectorStats(rows) {
  const acc = {};

  (Array.isArray(rows) ? rows : []).forEach(raw => {
    const r = typeof _rtNormalizeRow === 'function' ? _rtNormalizeRow(raw) : null;
    if (!r || !r.workedMs || r.workedMs <= 0) return;

    const sectorKey = typeof _rtNormalizeSectorKeyForAverage === 'function'
      ? _rtNormalizeSectorKeyForAverage(r.sector || r.sectorLabel)
      : String(r.sector || '').toLowerCase();
    if (!sectorKey) return;

    if (!acc[sectorKey]) acc[sectorKey] = { sumMs: 0, count: 0, minMs: Infinity, maxMs: 0, rows: [] };
    const bucket = acc[sectorKey];
    bucket.sumMs += r.workedMs;
    bucket.count += 1;
    bucket.minMs = Math.min(bucket.minMs, r.workedMs);
    bucket.maxMs = Math.max(bucket.maxMs, r.workedMs);
    bucket.rows.push(r);
  });

  // Ordem real do fluxo da empresa (PCP -> Coloração Revisão -> Laboratório
  // Revisão -> Pesagem -> Produção -> ...). Setores fora dessa lista
  // (ex: Moagem) não aparecem no fluxograma.
  const FX_ORDEM_SETORES = [
    'pcp_liberacao',
    'coloracao_revisao',
    'laboratorio_revisao',
    'pesagem',
    'producao',
    'laboratorio_amostras',
    'coloracao_amostras',
    'laboratorio',
    'coloracao',
    'envase_produzir',
    'envase_enlatamento',
    'pronto',
    'entrega'
  ];

  const pivotByKey = new Map(typeof _RT_SETORES_PIVOT !== 'undefined' ? _RT_SETORES_PIVOT : []);
  const order = FX_ORDEM_SETORES
    .filter(key => pivotByKey.has(key))
    .map(key => [key, pivotByKey.get(key)]);

  return order
    .map(([key, label]) => {
      const stat = acc[key];
      if (!stat || stat.count === 0) {
        return { key, label, count: 0, avgMs: 0, minMs: 0, maxMs: 0, rows: [] };
      }
      stat.rows.sort((a, b) => (b.exitAt || b.enteredAt || 0) - (a.exitAt || a.enteredAt || 0));
      return {
        key,
        label,
        count: stat.count,
        avgMs: Math.round(stat.sumMs / stat.count),
        minMs: stat.minMs,
        maxMs: stat.maxMs,
        rows: stat.rows
      };
    })
    // Remove setores terminais sem nenhum tempo de trabalho (ex: "Pronto"/"Entrega" são só status).
    .filter(s => !(['pronto', 'entrega'].includes(s.key) && s.count === 0));
}

function renderFluxogramaContent(sectors) {
  const content = document.getElementById('fxContent');
  if (!content) return;

  const comData = sectors.filter(s => s.count > 0);
  const semDados = sectors.filter(s => s.count === 0);

  if (comData.length === 0) {
    content.innerHTML = `<div class="fx-error"><i class="fas fa-info-circle"></i> Ainda não há histórico suficiente de tempos por setor para montar o fluxograma.</div>`;
    return;
  }

  const totalMs = comData.reduce((sum, s) => sum + s.avgMs, 0);

  const nodesHtml = sectors.map((s) => {
    const semDadosFlag = s.count === 0;
    return `
      <div class="fx-step">
        <div class="fx-node fx-node-sector ${semDadosFlag ? 'fx-node-empty' : 'fx-node-clickable'}"
             ${semDadosFlag ? '' : `onclick="openFluxogramaSetor('${s.key}')" role="button" tabindex="0"`}>
          <div class="fx-node-label">${escapeHtml(s.label)}</div>
          <div class="fx-node-time">${semDadosFlag ? 'Sem histórico' : formatMs(s.avgMs)}</div>
          ${!semDadosFlag ? `<div class="fx-node-count">${s.count} lote${s.count === 1 ? '' : 's'} · toque para detalhar</div>` : ''}
        </div>
        <div class="fx-connector"><div class="fx-connector-line"></div><i class="fas fa-chevron-down"></i></div>
      </div>`;
  }).join('');

  content.innerHTML = `
    <div class="fx-summary">
      <div class="fx-summary-item">
        <span class="fx-summary-label">Tempo total médio de produção (ponta a ponta)</span>
        <span class="fx-summary-value">${formatMs(totalMs)}</span>
      </div>
    </div>
    <div class="fx-flow">
      <div class="fx-step">
        <div class="fx-node fx-node-terminal">Início</div>
        <div class="fx-connector"><div class="fx-connector-line"></div><i class="fas fa-chevron-down"></i></div>
      </div>
      ${nodesHtml}
      <div class="fx-step">
        <div class="fx-node fx-node-terminal">Fim</div>
      </div>
    </div>
    ${semDados.length > 0 ? `<p class="fx-note"><i class="fas fa-info-circle"></i> Setores sem histórico ainda: ${semDados.map(s => escapeHtml(s.label)).join(', ')}.</p>` : ''}
    <div class="fx-print-footer">
      Gerado em ${new Date().toLocaleString('pt-BR')} · FactoryFlow
    </div>
  `;
}

// Abre o drill-down de um setor: estatísticas + lista dos lotes mais recentes.
function openFluxogramaSetor(key) {
  if (!_fluxogramaData) return;
  const sector = _fluxogramaData.find(s => s.key === key);
  if (!sector || sector.count === 0) return;

  const modalTitle = document.getElementById('modalFluxogramaSetorTitle');
  const modalBody = document.getElementById('modalFluxogramaSetorBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = sector.label;

  const rowsHtml = sector.rows.map(r => `
    <tr>
      <td>${escapeHtml(r.orderNumber || '–')}</td>
      <td>${escapeHtml(r.lotNumber || '–')}</td>
      <td>${escapeHtml(r.productName || '–')}</td>
      <td>${escapeHtml(r.client || '–')}</td>
      <td>${r.exitAt ? formatDateTime(r.exitAt) : '–'}</td>
      <td class="fx-td-right">${formatMs(r.workedMs)}</td>
    </tr>
  `).join('');

  modalBody.innerHTML = `
    <div class="fx-drill-stats">
      <div class="fx-drill-stat">
        <span class="fx-drill-stat-label">Média</span>
        <span class="fx-drill-stat-value">${formatMs(sector.avgMs)}</span>
      </div>
      <div class="fx-drill-stat">
        <span class="fx-drill-stat-label">Mínimo</span>
        <span class="fx-drill-stat-value">${formatMs(sector.minMs)}</span>
      </div>
      <div class="fx-drill-stat">
        <span class="fx-drill-stat-label">Máximo</span>
        <span class="fx-drill-stat-value">${formatMs(sector.maxMs)}</span>
      </div>
      <div class="fx-drill-stat">
        <span class="fx-drill-stat-label">Lotes analisados</span>
        <span class="fx-drill-stat-value">${sector.count}</span>
      </div>
    </div>
    <div class="fx-drill-table-wrap">
      <table class="fx-drill-table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Lote/OP</th>
            <th>Produto</th>
            <th>Cliente</th>
            <th>Saída</th>
            <th class="fx-td-right">Tempo</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p class="fx-drill-more">Total: ${sector.rows.length} lote${sector.rows.length === 1 ? '' : 's'} nesse setor.</p>
    </div>
  `;

  openModal('modalFluxogramaSetor');
}
window.openFluxogramaSetor = openFluxogramaSetor;
