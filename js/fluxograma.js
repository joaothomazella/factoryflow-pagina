'use strict';

// =========================================================
// FLUXOGRAMA DA EMPRESA
// A empresa tem fluxos de produção diferentes dependendo do
// tipo do lote (Tinta, Base, Amostra — ver PRODUCT_FLOWS em
// data.js). Esta tela mostra um fluxograma por tipo, com o
// tempo médio de liberação (trabalhado) de cada setor, com
// base no histórico real dos lotes daquele tipo. Cada setor
// clicável mostra o detalhamento dos lotes. Pensado para
// impressão (A4).
// =========================================================

// Definição visual de cada fluxo. `type`:
//   'marker'   -> etapa de liberação/aprovação, sem tempo (só o nome)
//   'sector'   -> etapa normal, com tempo médio/mín/máx e drill-down
//   'branch'   -> etapa opcional (ex: Coloração antes do Laboratório)
//   'terminal' -> início/fim do fluxo
const FX_FLOWS = {
  tinta: {
    label: 'Tintas Normais',
    icon: 'fas fa-fill-drip',
    steps: [
      { type: 'marker', key: 'pcp_liberacao', label: 'PCP Liberação' },
      { type: 'marker', key: 'coloracao_revisao', label: 'Coloração Revisão' },
      { type: 'marker', key: 'laboratorio_revisao', label: 'Laboratório Revisão' },
      { type: 'sector', key: 'pesagem', label: 'Pesagem' },
      { type: 'sector', key: 'producao', label: 'Produção' },
      { type: 'branch', key: 'coloracao', label: 'Coloração', note: 'Etapa opcional — o lote pode ir direto para o Laboratório' },
      { type: 'sector', key: 'laboratorio', label: 'Laboratório' },
      { type: 'sector', key: 'envase_enlatamento', label: 'Envase Enlatamento' },
      { type: 'terminal', label: 'Pronto' }
    ]
  },
  base: {
    label: 'Base',
    icon: 'fas fa-flask',
    steps: [
      { type: 'marker', key: 'pcp_liberacao', label: 'PCP Liberação' },
      { type: 'marker', key: 'coloracao_revisao', label: 'Coloração Revisão' },
      { type: 'marker', key: 'laboratorio_revisao', label: 'Laboratório Revisão' },
      { type: 'sector', key: 'pesagem', label: 'Pesagem' },
      { type: 'sector', key: 'producao', label: 'Produção' },
      { type: 'sector', key: 'laboratorio', label: 'Laboratório' },
      { type: 'terminal', label: 'Entregue', note: 'Base sai direto do Laboratório — não passa por Envase' }
    ]
  },
  amostra: {
    label: 'Amostras',
    icon: 'fas fa-vial',
    steps: [
      { type: 'marker', key: 'pcp_liberacao', label: 'PCP Liberação' },
      { type: 'sector', key: 'laboratorio_amostras', label: 'Laboratório Amostras' },
      { type: 'sector', key: 'coloracao_amostras', label: 'Coloração Amostras', note: 'Pode retornar ao Laboratório Amostras antes de finalizar' },
      { type: 'terminal', label: 'Pronto' }
    ]
  }
};

let _fluxogramaData = null; // { tinta: {key->stat}, base: {...}, amostra: {...} }
let _fluxogramaLoading = false;
let _fxActiveFlow = 'tinta';

async function renderFluxograma() {
  const page = document.getElementById('pageFluxograma');
  if (!page) return;

  page.innerHTML = `
    <div class="fx-toolbar">
      <div>
        <h2><i class="fas fa-sitemap"></i> Fluxograma de Produção</h2>
        <p class="fx-subtitle">Sequência de setores e tempo médio de liberação de cada fluxo, com base no histórico real dos lotes. Clique em um setor para ver o detalhamento.</p>
      </div>
      <div class="fx-toolbar-actions">
        <button class="btn" onclick="loadFluxogramaAverages(true)"><i class="fas fa-sync"></i> Atualizar</button>
        <button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Imprimir</button>
      </div>
    </div>
    <div class="fx-tabs" id="fxTabs">
      ${Object.keys(FX_FLOWS).map(key => `
        <button class="fx-tab ${key === _fxActiveFlow ? 'fx-tab-active' : ''}" onclick="switchFluxogramaFlow('${key}')">
          <i class="${FX_FLOWS[key].icon}"></i> ${escapeHtml(FX_FLOWS[key].label)}
        </button>
      `).join('')}
    </div>
    <div id="fxContent" class="fx-content">
      <div class="fx-loading"><i class="fas fa-spinner fa-spin"></i> Calculando tempos médios...</div>
    </div>
  `;

  await loadFluxogramaAverages(false);
}

function switchFluxogramaFlow(flowKey) {
  if (!FX_FLOWS[flowKey]) return;
  _fxActiveFlow = flowKey;
  document.querySelectorAll('#fxTabs .fx-tab').forEach(btn => btn.classList.remove('fx-tab-active'));
  const idx = Object.keys(FX_FLOWS).indexOf(flowKey);
  const btn = document.querySelectorAll('#fxTabs .fx-tab')[idx];
  if (btn) btn.classList.add('fx-tab-active');

  if (_fluxogramaData) {
    renderFluxogramaContent(flowKey);
  }
}
window.switchFluxogramaFlow = switchFluxogramaFlow;

async function loadFluxogramaAverages(force) {
  if (_fluxogramaLoading) return;
  if (_fluxogramaData && !force) {
    renderFluxogramaContent(_fxActiveFlow);
    return;
  }

  _fluxogramaLoading = true;
  const content = document.getElementById('fxContent');
  if (content) {
    content.innerHTML = `<div class="fx-loading"><i class="fas fa-spinner fa-spin"></i> Calculando tempos médios...</div>`;
  }

  try {
    const rows = await _fxFetchRows();
    _fluxogramaData = _fxComputeAllFlowStats(rows);
    renderFluxogramaContent(_fxActiveFlow);
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

// Classifica uma linha já normalizada (_rtNormalizeRow) no tipo de fluxo
// (tinta/base/diluente/endurecedor/amostra), igual à regra usada no
// resto do app (ffNormalizeProductType).
function _fxClassifyRow(r) {
  return typeof ffNormalizeProductType === 'function'
    ? ffNormalizeProductType(r.productTypeRaw, r.productName, r.productCode)
    : 'tinta';
}

// Para cada fluxo (tinta/base/amostra), agrupa por setor e calcula
// tempo médio/mín/máx TRABALHADO + lista de lotes (para o drill-down).
function _fxComputeAllFlowStats(rows) {
  const buckets = {}; // flowKey -> sectorKey -> {sumMs,count,minMs,maxMs,rows}
  Object.keys(FX_FLOWS).forEach(flowKey => { buckets[flowKey] = {}; });

  (Array.isArray(rows) ? rows : []).forEach(raw => {
    const r = typeof _rtNormalizeRow === 'function' ? _rtNormalizeRow(raw) : null;
    if (!r || !r.workedMs || r.workedMs <= 0) return;

    const flowKey = _fxClassifyRow(r);
    if (!buckets[flowKey]) return; // fluxo sem tela própria (ex: diluente/endurecedor)

    const sectorKey = typeof _rtNormalizeSectorKeyForAverage === 'function'
      ? _rtNormalizeSectorKeyForAverage(r.sector || r.sectorLabel)
      : String(r.sector || '').toLowerCase();
    if (!sectorKey) return;

    const bucket = buckets[flowKey];
    if (!bucket[sectorKey]) bucket[sectorKey] = { sumMs: 0, count: 0, minMs: Infinity, maxMs: 0, rows: [] };
    const stat = bucket[sectorKey];
    stat.sumMs += r.workedMs;
    stat.count += 1;
    stat.minMs = Math.min(stat.minMs, r.workedMs);
    stat.maxMs = Math.max(stat.maxMs, r.workedMs);
    stat.rows.push(r);
  });

  const result = {};
  Object.keys(buckets).forEach(flowKey => {
    const map = {};
    Object.keys(buckets[flowKey]).forEach(sectorKey => {
      const stat = buckets[flowKey][sectorKey];
      stat.rows.sort((a, b) => (b.exitAt || b.enteredAt || 0) - (a.exitAt || a.enteredAt || 0));
      map[sectorKey] = {
        count: stat.count,
        avgMs: Math.round(stat.sumMs / stat.count),
        minMs: stat.minMs,
        maxMs: stat.maxMs,
        rows: stat.rows
      };
    });
    result[flowKey] = map;
  });
  return result;
}

function renderFluxogramaContent(flowKey) {
  const content = document.getElementById('fxContent');
  if (!content || !_fluxogramaData) return;

  const flow = FX_FLOWS[flowKey];
  const statsMap = _fluxogramaData[flowKey] || {};
  if (!flow) return;

  const sectorSteps = flow.steps.filter(s => s.type === 'sector' || s.type === 'branch');
  const comDados = sectorSteps.filter(s => statsMap[s.key] && statsMap[s.key].count > 0);
  const semDados = sectorSteps.filter(s => !statsMap[s.key] || statsMap[s.key].count === 0);

  if (comDados.length === 0) {
    content.innerHTML = `<div class="fx-error"><i class="fas fa-info-circle"></i> Ainda não há histórico suficiente de "${escapeHtml(flow.label)}" para montar esse fluxograma.</div>`;
    return;
  }

  const totalMs = comDados.reduce((sum, s) => sum + statsMap[s.key].avgMs, 0);

  const stepsHtml = flow.steps.map((step, idx) => {
    const isLast = idx === flow.steps.length - 1;
    const connector = !isLast ? `<div class="fx-connector"><div class="fx-connector-line"></div><i class="fas fa-chevron-down"></i></div>` : '';

    if (step.type === 'terminal') {
      return `
        <div class="fx-step">
          <div class="fx-node fx-node-terminal">${escapeHtml(step.label)}</div>
          ${step.note ? `<div class="fx-step-note">${escapeHtml(step.note)}</div>` : ''}
          ${connector}
        </div>`;
    }

    if (step.type === 'marker') {
      return `
        <div class="fx-step">
          <div class="fx-node fx-node-sector fx-node-liberacao">
            <div class="fx-node-label">${escapeHtml(step.label)}</div>
            <div class="fx-node-count">Etapa de liberação de ordem de produção</div>
          </div>
          ${connector}
        </div>`;
    }

    // 'sector' e 'branch' usam o mesmo card, só muda o texto de apoio.
    const stat = statsMap[step.key];
    const semDadosFlag = !stat || stat.count === 0;
    const isBranch = step.type === 'branch';
    return `
      <div class="fx-step">
        ${isBranch ? `<div class="fx-branch-label"><i class="fas fa-code-branch"></i> Etapa opcional</div>` : ''}
        <div class="fx-node fx-node-sector ${semDadosFlag ? 'fx-node-empty' : 'fx-node-clickable'} ${isBranch ? 'fx-node-branch' : ''}"
             ${semDadosFlag ? '' : `onclick="openFluxogramaSetor('${flowKey}','${step.key}')" role="button" tabindex="0"`}>
          <div class="fx-node-label">${escapeHtml(step.label)}</div>
          <div class="fx-node-time">${semDadosFlag ? 'Sem histórico' : formatMs(stat.avgMs)}</div>
          ${!semDadosFlag ? `<div class="fx-node-count">${stat.count} lote${stat.count === 1 ? '' : 's'} · toque para detalhar</div>` : ''}
        </div>
        ${step.note ? `<div class="fx-step-note">${escapeHtml(step.note)}</div>` : ''}
        ${connector}
      </div>`;
  }).join('');

  content.innerHTML = `
    <div class="fx-summary">
      <div class="fx-summary-item">
        <span class="fx-summary-label">Tempo total médio — ${escapeHtml(flow.label)}</span>
        <span class="fx-summary-value">${formatMs(totalMs)}</span>
      </div>
    </div>
    <div class="fx-flow">
      <div class="fx-step">
        <div class="fx-node fx-node-terminal">Início</div>
        <div class="fx-connector"><div class="fx-connector-line"></div><i class="fas fa-chevron-down"></i></div>
      </div>
      ${stepsHtml}
    </div>
    ${semDados.length > 0 ? `<p class="fx-note"><i class="fas fa-info-circle"></i> Sem histórico ainda: ${semDados.map(s => escapeHtml(s.label)).join(', ')}.</p>` : ''}
    <div class="fx-print-footer">
      Gerado em ${new Date().toLocaleString('pt-BR')} · FactoryFlow · ${escapeHtml(flow.label)}
    </div>
  `;
}

// Abre o drill-down de um setor de um fluxo específico.
function openFluxogramaSetor(flowKey, sectorKey) {
  if (!_fluxogramaData || !_fluxogramaData[flowKey]) return;
  const stat = _fluxogramaData[flowKey][sectorKey];
  if (!stat || stat.count === 0) return;

  const flow = FX_FLOWS[flowKey];
  const step = flow ? flow.steps.find(s => s.key === sectorKey) : null;
  const label = step ? step.label : sectorKey;

  const modalTitle = document.getElementById('modalFluxogramaSetorTitle');
  const modalBody = document.getElementById('modalFluxogramaSetorBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = `${label} — ${flow ? flow.label : ''}`;

  const rowsHtml = stat.rows.map(r => `
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
        <span class="fx-drill-stat-value">${formatMs(stat.avgMs)}</span>
      </div>
      <div class="fx-drill-stat">
        <span class="fx-drill-stat-label">Mínimo</span>
        <span class="fx-drill-stat-value">${formatMs(stat.minMs)}</span>
      </div>
      <div class="fx-drill-stat">
        <span class="fx-drill-stat-label">Máximo</span>
        <span class="fx-drill-stat-value">${formatMs(stat.maxMs)}</span>
      </div>
      <div class="fx-drill-stat">
        <span class="fx-drill-stat-label">Lotes analisados</span>
        <span class="fx-drill-stat-value">${stat.count}</span>
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
      <p class="fx-drill-more">Total: ${stat.rows.length} lote${stat.rows.length === 1 ? '' : 's'} nesse setor.</p>
    </div>
  `;

  openModal('modalFluxogramaSetor');
}
window.openFluxogramaSetor = openFluxogramaSetor;
