// ===================================================
// RELATORIO-LITRAGEM.JS – Litragem Produzida (dia/semana/mês) e Capacidade
//
// Backend: GET /api/producao/relatorio-litragem
// Densidade por OP: cq_analises.densidade_encontrada (medida no CQ Vision)
//   -> cq_analises.densidade_padrao (padrão da análise)
//   -> cli_pedidos_itens.pits_densidade (esperada da ordem de produção)
// Litros = peso_kg / densidade_usada
// ===================================================
'use strict';

let _rlData = null;
let _rlFilters = { inicio: '', fim: '' };
let _rlShowDetalhe = false;

function _rlResolveApiBase() {
  const baseCandidates = [
    (typeof resolveFactoryFlowApiBase === 'function' ? resolveFactoryFlowApiBase() : ''),
    (typeof PEDIDOS_API !== 'undefined' ? PEDIDOS_API : ''),
    (window.PEDIDOS_API || ''),
    (typeof API_BASE !== 'undefined' ? API_BASE : ''),
    (window.API_BASE || ''),
    'https://app-producao-backend-production.up.railway.app'
  ];
  let base = baseCandidates.map(v => String(v || '').trim().replace(/\/$/, '')).find(Boolean);
  if (!base) return '';
  return base.replace(/\/api$/i, '');
}

function _rlAuthHeaders() {
  const sessionToken =
    (typeof resolveFactoryFlowSessionToken === 'function' ? resolveFactoryFlowSessionToken() : '') ||
    sessionStorage.getItem('ff_token') ||
    localStorage.getItem('ff_token') ||
    localStorage.getItem('factoryflow_token') ||
    localStorage.getItem('token') ||
    '';
  const headers = { 'Accept': 'application/json' };
  if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
  return headers;
}

function rlFormatLitros(n) {
  const v = Number(n || 0);
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' L';
}

const RL_MOTIVO_LABELS = {
  lote_rejeitado: 'Lote reprovado',
  sem_analise_cq_e_sem_lote_finalizado: 'Sem análise de CQ e sem lote finalizado',
  sem_peso: 'Sem peso cadastrado na OP',
  sem_densidade: 'Sem densidade (nem medida, nem padrão, nem esperada)',
  sem_data_producao: 'Sem data de produção identificável',
  fora_do_periodo: 'Fora do período filtrado'
};

function renderRelatorioLitragem() {
  const page = document.getElementById('pageRelatorioLitragem');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-flask"></i> Litragem Produzida</h2>
      <div class="header-actions">
        <button class="btn btn-primary" onclick="loadRelatorioLitragem()">
          <i class="fas fa-search"></i> Buscar
        </button>
      </div>
    </div>

    <div class="rt-filters-card" style="margin-bottom:1rem">
      <div class="rt-filters-title"><i class="fas fa-filter"></i> Período (opcional)</div>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:end">
        <div class="rt-filter-group" style="max-width:200px">
          <label class="rt-filter-label">Data Inicial</label>
          <input type="date" id="rlFilterInicio" class="rt-filter-input" value="${escapeHtml(_rlFilters.inicio)}" />
        </div>
        <div class="rt-filter-group" style="max-width:200px">
          <label class="rt-filter-label">Data Final</label>
          <input type="date" id="rlFilterFim" class="rt-filter-input" value="${escapeHtml(_rlFilters.fim)}" />
        </div>
        <span style="font-size:.8rem;color:var(--text3);max-width:420px">
          <i class="fas fa-info-circle"></i>
          Sem período informado, mostra todo o histórico disponível.
        </span>
      </div>
    </div>

    <div id="rlContent">
      <div class="rt-empty-state">
        <i class="fas fa-flask"></i>
        <p>Clique em <strong>Buscar</strong> para carregar o relatório de litragem.</p>
      </div>
    </div>
  `;

  if (_rlData) _rlRenderContent();
}

async function loadRelatorioLitragem() {
  const btn = document.querySelector('#pageRelatorioLitragem .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando…'; }

  const content = document.getElementById('rlContent');
  if (content) content.innerHTML = `<div class="rt-loading"><i class="fas fa-spinner fa-spin"></i> Carregando relatório…</div>`;

  _rlFilters.inicio = document.getElementById('rlFilterInicio')?.value || '';
  _rlFilters.fim = document.getElementById('rlFilterFim')?.value || '';

  try {
    const base = _rlResolveApiBase();
    if (!base) throw new Error('Nenhuma base de API configurada.');

    const params = new URLSearchParams();
    if (_rlFilters.inicio) params.set('inicio', _rlFilters.inicio);
    if (_rlFilters.fim) params.set('fim', _rlFilters.fim);

    const url = `${base}/api/producao/relatorio-litragem?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(url, { method: 'GET', headers: _rlAuthHeaders(), signal: controller.signal, cache: 'no-store' })
      .finally(() => clearTimeout(timer));

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Backend respondeu ${res.status}: ${txt}`);
    }
    const json = await res.json();
    if (!json || json.ok === false) throw new Error(json?.error || 'Resposta inválida do backend.');

    _rlData = json;
    _rlRenderContent();

  } catch (e) {
    console.error('[Relatório de Litragem] erro:', e);
    if (content) {
      content.innerHTML = `
        <div class="rt-error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Erro ao carregar o relatório de litragem.<br>
          <small style="color:var(--text3)">${escapeHtml(e.message || '')}</small></p>
        </div>`;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> Buscar'; }
  }
}

function _rlRenderContent() {
  const content = document.getElementById('rlContent');
  if (!content || !_rlData) return;

  const r = _rlData.resumo;
  const excluidosPorMotivo = {};
  (_rlData.excluidos || []).forEach(e => {
    excluidosPorMotivo[e.motivo_exclusao] = (excluidosPorMotivo[e.motivo_exclusao] || 0) + 1;
  });

  content.innerHTML = `
    <div class="metrics-row">
      <div class="metric-card metric-blue">
        <div class="metric-num">${rlFormatLitros(r.total_litros)}</div>
        <div class="metric-label">Total Produzido no Período</div>
      </div>
      <div class="metric-card metric-green">
        <div class="metric-num">${rlFormatLitros(r.capacidade_estimada.diaria_media)}</div>
        <div class="metric-label">Capacidade Diária (média)</div>
      </div>
      <div class="metric-card metric-purple">
        <div class="metric-num">${rlFormatLitros(r.capacidade_estimada.semanal_media)}</div>
        <div class="metric-label">Capacidade Semanal (média)</div>
      </div>
      <div class="metric-card metric-orange">
        <div class="metric-num">${rlFormatLitros(r.capacidade_estimada.mensal_media)}</div>
        <div class="metric-label">Capacidade Mensal (média)</div>
      </div>
    </div>

    <div class="metrics-row" style="margin-top:.75rem">
      <div class="metric-card" style="border-color:rgba(34,197,94,.3)">
        <div class="metric-num" style="color:#22c55e">${r.total_ops_incluidas}</div>
        <div class="metric-label">OPs Incluídas no Cálculo</div>
      </div>
      <div class="metric-card" style="border-color:rgba(239,68,68,.3)">
        <div class="metric-num" style="color:#ef4444">${r.total_ops_excluidas}</div>
        <div class="metric-label">OPs Excluídas (sem dado suficiente)</div>
      </div>
      <div class="metric-card">
        <div class="metric-num">${r.dias_com_producao}</div>
        <div class="metric-label">Dias com Produção</div>
      </div>
      <div class="metric-card">
        <div class="metric-num">${r.semanas_com_producao}</div>
        <div class="metric-label">Semanas com Produção</div>
      </div>
      <div class="metric-card">
        <div class="metric-num">${r.meses_com_producao}</div>
        <div class="metric-label">Meses com Produção</div>
      </div>
    </div>

    <div class="charts-row" style="margin-top:1rem">
      <div class="chart-card">
        <h4><i class="fas fa-chart-bar"></i> Litragem por Mês</h4>
        <div style="height:240px"><canvas id="rlChartMensal"></canvas></div>
      </div>
      <div class="chart-card">
        <h4><i class="fas fa-chart-line"></i> Litragem por Semana</h4>
        <div style="height:240px"><canvas id="rlChartSemanal"></canvas></div>
      </div>
    </div>

    <div class="section-card" style="margin-top:1rem">
      <h3><i class="fas fa-calendar-day"></i> Litragem por Dia</h3>
      <div style="height:220px"><canvas id="rlChartDiario"></canvas></div>
    </div>

    <div class="section-card" style="margin-top:1rem">
      <h3><i class="fas fa-table"></i> Resumo Mensal</h3>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>Mês</th><th>Litros</th><th>OPs</th></tr></thead>
          <tbody>
            ${(_rlData.mensal || []).map(m => `
              <tr><td>${escapeHtml(m.chave)}</td><td>${rlFormatLitros(m.litros)}</td><td>${m.ops}</td></tr>
            `).join('') || '<tr><td colspan="3" class="text-muted">Sem dados</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    ${r.total_ops_excluidas > 0 ? `
    <div class="section-card" style="margin-top:1rem;border-color:rgba(239,68,68,.25)">
      <h3><i class="fas fa-exclamation-circle" style="color:#ef4444"></i> OPs Excluídas do Cálculo
        <span style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);color:#fca5a5;font-size:.8rem;padding:.15rem .55rem;border-radius:8px;margin-left:.6rem;font-weight:700">${r.total_ops_excluidas}</span>
      </h3>
      <p style="font-size:.8rem;color:var(--text3);margin-bottom:.7rem">
        Estas OPs não entraram no cálculo de litragem/capacidade porque não têm análise de CQ nem status finalizado,
        ou porque faltam dados de peso/densidade/data. Isso evita distorcer a estimativa de capacidade.
      </p>
      <div class="top-list">
        ${Object.entries(excluidosPorMotivo).map(([motivo, count]) => `
          <div class="top-item">
            <span class="top-name">${escapeHtml(RL_MOTIVO_LABELS[motivo] || motivo)}</span>
            <span class="top-count">${count} OP(s)</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="section-card" style="margin-top:1rem">
      <h3 style="cursor:pointer" onclick="_rlToggleDetalhe()">
        <i class="fas fa-list"></i> Detalhe por OP (auditoria)
        <i class="fas fa-chevron-${_rlShowDetalhe ? 'up' : 'down'}" style="float:right"></i>
      </h3>
      <div id="rlDetalheArea" ${_rlShowDetalhe ? '' : 'style="display:none"'}>
        ${_rlRenderDetalheTable()}
      </div>
    </div>
  `;

  setTimeout(() => _rlRenderCharts(), 50);
}

function _rlToggleDetalhe() {
  _rlShowDetalhe = !_rlShowDetalhe;
  const area = document.getElementById('rlDetalheArea');
  if (!area) return;
  area.style.display = _rlShowDetalhe ? '' : 'none';
  if (_rlShowDetalhe && !area.dataset.filled) {
    area.innerHTML = _rlRenderDetalheTable();
    area.dataset.filled = '1';
  }
}

function _rlRenderDetalheTable() {
  const rows = (_rlData.detalhe || []).slice().sort((a, b) => {
    if (a.incluido !== b.incluido) return a.incluido ? -1 : 1;
    return String(b.data_producao || '').localeCompare(String(a.data_producao || ''));
  });

  return `
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>OP</th><th>Pedido</th><th>Produto</th><th>Peso (kg)</th>
            <th>Densidade Usada</th><th>Origem Densidade</th><th>Litros</th>
            <th>Data Produção</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr style="${row.incluido ? '' : 'opacity:.5'}">
              <td><strong>${escapeHtml(row.op)}</strong></td>
              <td>${escapeHtml(row.pedido || '–')}</td>
              <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(row.produto_nome || '')}">${escapeHtml(row.produto_nome || '–')}</td>
              <td>${row.peso_kg != null ? row.peso_kg.toLocaleString('pt-BR') : '–'}</td>
              <td>${row.densidade_usada != null ? row.densidade_usada.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '–'}</td>
              <td style="font-size:.75rem;color:var(--text3)">${escapeHtml(row.densidade_fonte || '–')}</td>
              <td>${row.litros != null ? rlFormatLitros(row.litros) : '–'}</td>
              <td style="font-size:.78rem">${row.data_producao ? new Date(row.data_producao).toLocaleDateString('pt-BR') : '–'}</td>
              <td style="font-size:.75rem;color:${row.incluido ? '#22c55e' : '#ef4444'}">
                ${row.incluido ? 'Incluído' : escapeHtml(RL_MOTIVO_LABELS[row.motivo_exclusao] || row.motivo_exclusao || '–')}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function _rlRenderCharts() {
  const mensal = _rlData.mensal || [];
  const semanal = (_rlData.semanal || []).slice(-16);
  const diario = (_rlData.diario || []).slice(-30);

  const ctxM = document.getElementById('rlChartMensal');
  if (ctxM) {
    if (ctxM._chart) ctxM._chart.destroy();
    ctxM._chart = new Chart(ctxM, {
      type: 'bar',
      data: { labels: mensal.map(m => m.chave), datasets: [{ label: 'Litros', data: mensal.map(m => m.litros), backgroundColor: '#144196', borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  const ctxS = document.getElementById('rlChartSemanal');
  if (ctxS) {
    if (ctxS._chart) ctxS._chart.destroy();
    ctxS._chart = new Chart(ctxS, {
      type: 'line',
      data: { labels: semanal.map(m => m.chave), datasets: [{ label: 'Litros', data: semanal.map(m => m.litros), borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,.15)', fill: true, tension: .3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  const ctxD = document.getElementById('rlChartDiario');
  if (ctxD) {
    if (ctxD._chart) ctxD._chart.destroy();
    ctxD._chart = new Chart(ctxD, {
      type: 'bar',
      data: { labels: diario.map(m => m.chave), datasets: [{ label: 'Litros', data: diario.map(m => m.litros), backgroundColor: '#22c55e', borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 60, minRotation: 60 } } } }
    });
  }
}

window.renderRelatorioLitragem = renderRelatorioLitragem;
window.loadRelatorioLitragem = loadRelatorioLitragem;
window._rlToggleDetalhe = _rlToggleDetalhe;
