'use strict';

// =========================================================
// FLUXOGRAMA DA EMPRESA
// Mostra a sequência real de setores de produção e o tempo
// médio de liberação (trabalhado) de cada um, com base no
// histórico real dos lotes. Pensado para impressão (A4).
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
        <p class="fx-subtitle">Sequência de setores e tempo médio de liberação, com base no histórico real dos lotes.</p>
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
    const averages = _fxComputeSectorAverages(rows);
    _fluxogramaData = averages;
    renderFluxogramaContent(averages);
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

  return Array.isArray(json.rows) ? json.rows : (Array.isArray(json.data) ? json.data : []);
}

// Agrupa por setor (independente do produto) e calcula tempo médio TRABALHADO.
function _fxComputeSectorAverages(rows) {
  const acc = {};

  (Array.isArray(rows) ? rows : []).forEach(raw => {
    const r = typeof _rtNormalizeRow === 'function' ? _rtNormalizeRow(raw) : null;
    if (!r || !r.workedMs || r.workedMs <= 0) return;

    const sectorKey = typeof _rtNormalizeSectorKeyForAverage === 'function'
      ? _rtNormalizeSectorKeyForAverage(r.sector || r.sectorLabel)
      : String(r.sector || '').toLowerCase();
    if (!sectorKey) return;

    if (!acc[sectorKey]) acc[sectorKey] = { sumMs: 0, count: 0 };
    acc[sectorKey].sumMs += r.workedMs;
    acc[sectorKey].count += 1;
  });

  const order = typeof _RT_SETORES_PIVOT !== 'undefined' ? _RT_SETORES_PIVOT : [];

  return order
    .map(([key, label]) => {
      const stat = acc[key];
      return {
        key,
        label,
        count: stat ? stat.count : 0,
        avgMs: stat && stat.count > 0 ? Math.round(stat.sumMs / stat.count) : 0
      };
    })
    // Remove setores terminais sem nenhum tempo de trabalho (ex: "Pronto"/"Entrega" são só status).
    .filter(s => !(['pronto', 'entrega'].includes(s.key) && s.count === 0));
}

function renderFluxogramaContent(averages) {
  const content = document.getElementById('fxContent');
  if (!content) return;

  const comData = averages.filter(s => s.count > 0);
  const semDados = averages.filter(s => s.count === 0);

  if (comData.length === 0) {
    content.innerHTML = `<div class="fx-error"><i class="fas fa-info-circle"></i> Ainda não há histórico suficiente de tempos por setor para montar o fluxograma.</div>`;
    return;
  }

  const totalMs = comData.reduce((sum, s) => sum + s.avgMs, 0);

  const nodesHtml = averages.map((s, idx) => {
    const isLast = idx === averages.length - 1;
    const semDadosFlag = s.count === 0;
    return `
      <div class="fx-node ${semDadosFlag ? 'fx-node-empty' : ''}">
        <div class="fx-node-box">
          <div class="fx-node-label">${escapeHtml(s.label)}</div>
          <div class="fx-node-time">${semDadosFlag ? 'Sem histórico' : formatMs(s.avgMs)}</div>
          ${!semDadosFlag ? `<div class="fx-node-count">${s.count} lote${s.count===1?'':'s'} analisado${s.count===1?'':'s'}</div>` : ''}
        </div>
        ${!isLast ? '<div class="fx-arrow"><i class="fas fa-arrow-right"></i></div>' : ''}
      </div>`;
  }).join('');

  content.innerHTML = `
    <div class="fx-summary">
      <div class="fx-summary-item">
        <span class="fx-summary-label">Tempo total médio de produção (ponta a ponta)</span>
        <span class="fx-summary-value">${formatMs(totalMs)}</span>
      </div>
    </div>
    <div class="fx-flow">${nodesHtml}</div>
    ${semDados.length > 0 ? `<p class="fx-note"><i class="fas fa-info-circle"></i> Setores sem histórico ainda: ${semDados.map(s=>escapeHtml(s.label)).join(', ')}.</p>` : ''}
    <div class="fx-print-footer">
      Gerado em ${new Date().toLocaleString('pt-BR')} · FactoryFlow
    </div>
  `;
}
