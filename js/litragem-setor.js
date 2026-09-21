// ===================================================
// LITRAGEM-SETOR.JS – Capacidade de Produção por Setor / Dia
//
// Backend: GET /api/producao/litragem-setor
//
// Metodologia (definida com o PCP):
//  - A produção é medida pelo que CADA SETOR conclui por dia, não por ordem de produção.
//  - A passagem do lote por um setor vem do ff_history: entrada = um evento,
//    saída = o evento seguinte. Só conta passagem CONCLUÍDA (o lote saiu do setor).
//  - Lotes que nunca foram formalmente iniciados também contam, porque o histórico de
//    transição existe mesmo sem sessão de trabalho registrada.
//  - Litros = peso (kg) / densidade. Densidade: medida no CQ Vision -> padrão da análise
//    -> esperada da ordem de produção -> média do mesmo produto (faixa 0,3–3,5 g/cm³).
//  - Base = tipo_lote 'base', linha_produto 'base' ou produto iniciando com "BASE".
// ===================================================
'use strict';

let _lsData = null;
let _lsFilters = { inicio: '', fim: '', modo: 'conclusao' };
let _lsSemanaIdx = 0;
let _lsShowDiario = false;

const LS_CORES = {
  pesagem: '#2563eb',
  producao: '#16a34a',
  coloracao: '#9333ea',
  laboratorio: '#ea580c',
  envase_produzir: '#0891b2',
  envase_enlatamento: '#c026d3',
  coloracao_revisao: '#94a3b8',
  laboratorio_revisao: '#64748b',
  pcp_liberacao: '#475569',
  laboratorio_amostras: '#a3a3a3',
  coloracao_amostras: '#d4d4d4'
};

function _lsResolveApiBase() {
  const baseCandidates = [
    (typeof resolveFactoryFlowApiBase === 'function' ? resolveFactoryFlowApiBase() : ''),
    (typeof PEDIDOS_API !== 'undefined' ? PEDIDOS_API : ''),
    (window.PEDIDOS_API || ''),
    (typeof API_BASE !== 'undefined' ? API_BASE : ''),
    (window.API_BASE || ''),
    'https://app-producao-backend-production.up.railway.app'
  ];
  const base = baseCandidates.map(v => String(v || '').trim().replace(/\/$/, '')).find(Boolean);
  return base ? base.replace(/\/api$/i, '') : '';
}

function _lsAuthHeaders() {
  const token =
    (typeof resolveFactoryFlowSessionToken === 'function' ? resolveFactoryFlowSessionToken() : '') ||
    sessionStorage.getItem('ff_token') ||
    localStorage.getItem('ff_token') ||
    localStorage.getItem('factoryflow_token') ||
    localStorage.getItem('token') ||
    '';
  const headers = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function lsFmt(n, casas) {
  const v = Number(n || 0);
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas == null ? 0 : casas });
}
function lsFmtL(n) { return lsFmt(n) + ' L'; }

function lsDiaLabel(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y) return iso;
  const dt = new Date(y, m - 1, d);
  const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return `${nomes[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
function lsMesLabel(iso) {
  const [y, m] = String(iso || '').split('-').map(Number);
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return y ? `${nomes[m - 1]}/${y}` : iso;
}
function lsSemanaLabel(s) {
  const semana = _lsData && _lsData.semanal.find(x => x.semana === s);
  if (!semana) return s;
  const fmt = iso => { const p = String(iso).split('-'); return `${p[2]}/${p[1]}`; };
  return `${fmt(semana.inicio)} a ${fmt(semana.fim)}`;
}

// ===================================================
// RENDER DA PÁGINA
// ===================================================
function renderLitragemSetor() {
  const page = document.getElementById('pageLitragemSetor');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-industry"></i> Capacidade de Produção por Setor</h2>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="exportLitragemSetorPDF()" id="lsBtnPdf" disabled>
          <i class="fas fa-file-pdf"></i> Relatório PDF
        </button>
        <button class="btn btn-secondary" onclick="exportLitragemSetorPPT()" id="lsBtnPpt" disabled>
          <i class="fas fa-file-powerpoint"></i> PowerPoint
        </button>
        <button class="btn btn-primary" onclick="loadLitragemSetor()">
          <i class="fas fa-search"></i> Buscar
        </button>
      </div>
    </div>

    <div class="rt-filters-card" style="margin-bottom:1rem">
      <div class="rt-filters-title"><i class="fas fa-filter"></i> Período e critério</div>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:end">
        <div class="rt-filter-group" style="max-width:200px">
          <label class="rt-filter-label">Data Inicial</label>
          <input type="date" id="lsInicio" class="rt-filter-input" value="${_lsFilters.inicio}">
        </div>
        <div class="rt-filter-group" style="max-width:200px">
          <label class="rt-filter-label">Data Final</label>
          <input type="date" id="lsFim" class="rt-filter-input" value="${_lsFilters.fim}">
        </div>
        <div class="rt-filter-group" style="max-width:320px">
          <label class="rt-filter-label">Critério da etapa</label>
          <select id="lsModo" class="rt-filter-input">
            <option value="conclusao" ${_lsFilters.modo === 'conclusao' ? 'selected' : ''}>Contar no dia em que o lote saiu do setor</option>
            <option value="mesmo_dia" ${_lsFilters.modo === 'mesmo_dia' ? 'selected' : ''}>Só etapas iniciadas e concluídas no mesmo dia</option>
          </select>
        </div>
      </div>
    </div>

    <div id="lsContent">
      <div class="empty-state" style="padding:3rem;text-align:center;color:#64748b">
        <i class="fas fa-chart-column" style="font-size:2.5rem;opacity:.35"></i>
        <p style="margin-top:1rem">Clique em <strong>Buscar</strong> para calcular a litragem por setor.</p>
      </div>
    </div>
  `;

  if (!_lsData) loadLitragemSetor();
  else _lsRenderContent();
}

async function loadLitragemSetor() {
  const el = document.getElementById('lsContent');
  if (!el) return;

  _lsFilters.inicio = (document.getElementById('lsInicio') || {}).value || '';
  _lsFilters.fim = (document.getElementById('lsFim') || {}).value || '';
  _lsFilters.modo = (document.getElementById('lsModo') || {}).value || 'conclusao';

  el.innerHTML = `<div style="padding:3rem;text-align:center;color:#64748b">
    <i class="fas fa-spinner fa-spin" style="font-size:2rem"></i>
    <p style="margin-top:1rem">Calculando litragem por setor…</p></div>`;

  const params = new URLSearchParams();
  if (_lsFilters.inicio) params.set('inicio', _lsFilters.inicio);
  if (_lsFilters.fim) params.set('fim', _lsFilters.fim);
  if (_lsFilters.modo) params.set('modo', _lsFilters.modo);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const resp = await fetch(`${_lsResolveApiBase()}/api/producao/litragem-setor?${params.toString()}`, {
      headers: _lsAuthHeaders(), signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json || json.ok !== true) throw new Error(json && json.error ? json.error : 'Resposta inválida');
    _lsData = json;
    _lsSemanaIdx = Math.max(0, (json.semanal || []).length - 1);
    _lsRenderContent();
  } catch (err) {
    clearTimeout(timer);
    el.innerHTML = `<div class="section-card" style="text-align:center;padding:2rem">
      <i class="fas fa-triangle-exclamation" style="font-size:2rem;color:#dc2626"></i>
      <p style="margin-top:1rem">Não foi possível carregar o relatório.</p>
      <p style="color:#64748b;font-size:.9rem">${err.name === 'AbortError' ? 'Tempo esgotado.' : err.message}</p>
    </div>`;
  }
}

function _lsRenderContent() {
  const el = document.getElementById('lsContent');
  if (!el || !_lsData) return;
  const d = _lsData;
  const r = d.resumo;

  ['lsBtnPdf', 'lsBtnPpt'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = false; });

  const produtivos = d.setores.filter(s => s.produtivo);
  const apoio = d.setores.filter(s => !s.produtivo);

  el.innerHTML = `
    <div class="metrics-row">
      <div class="metric-card metric-blue">
        <div class="metric-num">${lsFmtL(r.total_litros_finalizados)}</div>
        <div class="metric-label">Produção concluída no período</div>
      </div>
      <div class="metric-card metric-green">
        <div class="metric-num">${lsFmtL(r.media_diaria_finalizados)}</div>
        <div class="metric-label">Capacidade média por dia</div>
      </div>
      <div class="metric-card metric-purple">
        <div class="metric-num">${lsFmtL(r.total_litros_finalizados_base)}</div>
        <div class="metric-label">Somente base (${lsFmt(r.total_litros_finalizados ? (r.total_litros_finalizados_base / r.total_litros_finalizados) * 100 : 0, 1)}%)</div>
      </div>
      <div class="metric-card metric-orange">
        <div class="metric-num">${lsFmtL(r.total_litros_finalizados_nao_base)}</div>
        <div class="metric-label">Produto acabado (sem base)</div>
      </div>
    </div>

    <div class="metrics-row">
      <div class="metric-card metric-blue">
        <div class="metric-num">${lsFmt(r.dias_com_producao)}</div>
        <div class="metric-label">Dias com produção</div>
      </div>
      <div class="metric-card metric-green">
        <div class="metric-num">${lsFmtL(r.media_semanal_fabrica)}</div>
        <div class="metric-label">Média por semana (movimentado)</div>
      </div>
      <div class="metric-card metric-purple">
        <div class="metric-num">${lsFmtL(r.media_mensal_fabrica)}</div>
        <div class="metric-label">Média por mês (movimentado)</div>
      </div>
      <div class="metric-card metric-orange">
        <div class="metric-num">${lsFmt(r.lotes_computados)}</div>
        <div class="metric-label">Lotes considerados</div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-gauge-high"></i> Capacidade média diária por setor</h3>
      <p style="color:#64748b;font-size:.85rem;margin:-.25rem 0 1rem">
        Média de litros que cada setor conclui por dia, considerando apenas os dias em que o setor trabalhou.
      </p>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Setor</th>
              <th style="text-align:right">Média diária</th>
              <th style="text-align:right">Média diária (base)</th>
              <th style="text-align:right">Total no período</th>
              <th style="text-align:right">Base</th>
              <th style="text-align:right">Sem base</th>
              <th style="text-align:right">Dias</th>
              <th style="text-align:right">Lotes</th>
            </tr>
          </thead>
          <tbody>
            ${produtivos.map(s => _lsLinhaSetor(s, true)).join('')}
            ${apoio.length ? `<tr><td colspan="8" style="background:#f8fafc;font-weight:600;color:#64748b;font-size:.8rem">ETAPAS DE APOIO (revisão, liberação e amostras — não somam na produção da fábrica)</td></tr>` : ''}
            ${apoio.map(s => _lsLinhaSetor(s, false)).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-chart-column"></i> Litragem por setor, dia a dia</h3>
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="_lsSemana(-1)"><i class="fas fa-chevron-left"></i></button>
        <select id="lsSelSemana" class="rt-filter-input" style="max-width:240px" onchange="_lsSemanaSel(this.value)">
          ${d.semanal.map((s, i) => `<option value="${i}" ${i === _lsSemanaIdx ? 'selected' : ''}>Semana ${lsSemanaLabel(s.semana)}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="_lsSemana(1)"><i class="fas fa-chevron-right"></i></button>
        <span id="lsSemanaResumo" style="color:#64748b;font-size:.85rem"></span>
      </div>
      <div class="chart-card" style="height:380px"><canvas id="lsChartSemana"></canvas></div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h4>Produção concluída por mês</h4>
        <div style="height:280px"><canvas id="lsChartMes"></canvas></div>
      </div>
      <div class="chart-card">
        <h4>Participação de cada setor no total</h4>
        <div style="height:280px"><canvas id="lsChartSetores"></canvas></div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-calendar"></i> Resumo mensal</h3>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mês</th><th style="text-align:right">Dias</th>
              <th style="text-align:right">Concluído</th>
              <th style="text-align:right">Base</th>
              <th style="text-align:right">Sem base</th>
              <th style="text-align:right">Média/dia</th>
            </tr>
          </thead>
          <tbody>
            ${d.mensal.map(m => `
              <tr>
                <td><strong>${lsMesLabel(m.mes)}</strong></td>
                <td style="text-align:right">${m.dias_com_producao}</td>
                <td style="text-align:right">${lsFmtL(m.litros_finalizados)}</td>
                <td style="text-align:right">${lsFmtL(m.litros_finalizados_base)}</td>
                <td style="text-align:right">${lsFmtL(m.litros_finalizados_nao_base)}</td>
                <td style="text-align:right"><strong>${lsFmtL(m.media_diaria_finalizados)}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-card">
      <h3 style="cursor:pointer" onclick="_lsToggleDiario()">
        <i class="fas fa-table-list"></i> Detalhamento diário
        <i class="fas fa-chevron-${_lsShowDiario ? 'up' : 'down'}" style="font-size:.8rem;margin-left:.5rem"></i>
      </h3>
      <div id="lsDiarioWrap" style="display:${_lsShowDiario ? 'block' : 'none'}"></div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-circle-info"></i> Como os números foram apurados</h3>
      <ul style="color:#475569;font-size:.88rem;line-height:1.8;margin:0;padding-left:1.2rem">
        <li><strong>Etapa concluída:</strong> ${d.criterios.atribuicao_do_dia}.</li>
        <li><strong>Litros:</strong> peso do lote ÷ densidade. Densidade medida no CQ Vision quando existe; senão a esperada da ordem de produção; senão a média do mesmo produto.</li>
        <li><strong>Base:</strong> ${d.criterios.base}.</li>
        <li><strong>Produção concluída:</strong> litragem dos lotes que chegaram a pronto/entrega — cada lote conta uma única vez, sem dupla contagem.</li>
        <li><strong>Movimentado:</strong> soma de todas as etapas concluídas; um mesmo lote aparece em vários setores, então esse número mede carga de trabalho, não volume produzido.</li>
        <li><strong>Cobertura:</strong> ${lsFmt(d.diagnostico.lotes_computados)} de ${lsFmt(d.diagnostico.lotes_avaliados)} lotes entraram no cálculo
          (${lsFmt(d.diagnostico.sem_historico)} sem histórico de movimentação,
           ${lsFmt(d.diagnostico.sem_densidade)} sem densidade conhecida,
           ${lsFmt(d.diagnostico.lote_rejeitado)} reprovados,
           ${lsFmt(d.diagnostico.sem_passagem_concluida)} ainda sem nenhuma etapa concluída).</li>
      </ul>
    </div>
  `;

  if (_lsShowDiario) _lsRenderDiario();
  setTimeout(() => { _lsRenderChartSemana(); _lsRenderChartMes(); _lsRenderChartSetores(); }, 100);
}

function _lsLinhaSetor(s, destaque) {
  return `
    <tr${destaque ? '' : ' style="color:#64748b"'}>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${LS_CORES[s.setor] || '#94a3b8'};margin-right:.5rem"></span>${s.label}</td>
      <td style="text-align:right"><strong>${lsFmtL(s.media_diaria)}</strong></td>
      <td style="text-align:right">${lsFmtL(s.media_diaria_base)}</td>
      <td style="text-align:right">${lsFmtL(s.litros_total)}</td>
      <td style="text-align:right">${lsFmtL(s.litros_base)}</td>
      <td style="text-align:right">${lsFmtL(s.litros_nao_base)}</td>
      <td style="text-align:right">${s.dias_com_producao}</td>
      <td style="text-align:right">${s.lotes}</td>
    </tr>`;
}

function _lsToggleDiario() {
  _lsShowDiario = !_lsShowDiario;
  const wrap = document.getElementById('lsDiarioWrap');
  if (!wrap) return;
  wrap.style.display = _lsShowDiario ? 'block' : 'none';
  if (_lsShowDiario) _lsRenderDiario();
}

function _lsRenderDiario() {
  const wrap = document.getElementById('lsDiarioWrap');
  if (!wrap || !_lsData) return;
  const setores = _lsData.setores.filter(s => s.produtivo);
  wrap.innerHTML = `
    <div class="table-container" style="max-height:520px;overflow:auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>Dia</th>
            ${setores.map(s => `<th style="text-align:right">${s.label}</th>`).join('')}
            <th style="text-align:right">Concluído</th>
            <th style="text-align:right">Base</th>
          </tr>
        </thead>
        <tbody>
          ${[..._lsData.diario].reverse().map(d => `
            <tr>
              <td>${lsDiaLabel(d.dia)}</td>
              ${setores.map(s => `<td style="text-align:right">${d.por_setor[s.setor] ? lsFmt(d.por_setor[s.setor].litros) : '—'}</td>`).join('')}
              <td style="text-align:right"><strong>${lsFmt(d.litros_finalizados)}</strong></td>
              <td style="text-align:right">${lsFmt(d.litros_finalizados_base)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function _lsSemana(delta) {
  if (!_lsData) return;
  const max = _lsData.semanal.length - 1;
  _lsSemanaIdx = Math.min(max, Math.max(0, _lsSemanaIdx + delta));
  const sel = document.getElementById('lsSelSemana');
  if (sel) sel.value = String(_lsSemanaIdx);
  _lsRenderChartSemana();
}
function _lsSemanaSel(v) {
  _lsSemanaIdx = Number(v) || 0;
  _lsRenderChartSemana();
}

// ===================================================
// GRÁFICOS
// ===================================================
function _lsDadosSemana() {
  const semana = _lsData.semanal[_lsSemanaIdx];
  if (!semana) return null;
  const dias = _lsData.diario.filter(d => d.semana === semana.semana);
  const setores = _lsData.setores.filter(s => s.produtivo);
  return {
    semana,
    labels: dias.map(d => lsDiaLabel(d.dia)),
    datasets: setores.map(s => ({
      label: s.label,
      data: dias.map(d => (d.por_setor[s.setor] ? d.por_setor[s.setor].litros : 0)),
      backgroundColor: LS_CORES[s.setor] || '#94a3b8',
      borderRadius: 3
    }))
  };
}

function _lsRenderChartSemana() {
  const ctx = document.getElementById('lsChartSemana');
  if (!ctx || !window.Chart || !_lsData) return;
  const dados = _lsDadosSemana();
  if (!dados) return;

  const resumo = document.getElementById('lsSemanaResumo');
  if (resumo) {
    resumo.innerHTML = `Concluído na semana: <strong>${lsFmtL(dados.semana.litros_finalizados)}</strong>
      &nbsp;·&nbsp; Base: <strong>${lsFmtL(dados.semana.litros_finalizados_base)}</strong>
      &nbsp;·&nbsp; ${dados.semana.dias_com_producao} dia(s)`;
  }

  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: { labels: dados.labels, datasets: dados.datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${lsFmtL(c.parsed.y)}` } }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: v => lsFmt(v) + ' L' } }
      }
    }
  });
}

function _lsRenderChartMes() {
  const ctx = document.getElementById('lsChartMes');
  if (!ctx || !window.Chart || !_lsData) return;
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: _lsData.mensal.map(m => lsMesLabel(m.mes)),
      datasets: [
        { label: 'Sem base', data: _lsData.mensal.map(m => m.litros_finalizados_nao_base), backgroundColor: '#2563eb', borderRadius: 3 },
        { label: 'Base', data: _lsData.mensal.map(m => m.litros_finalizados_base), backgroundColor: '#9333ea', borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${lsFmtL(c.parsed.y)}` } } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { callback: v => lsFmt(v) + ' L' } } }
    }
  });
}

function _lsRenderChartSetores() {
  const ctx = document.getElementById('lsChartSetores');
  if (!ctx || !window.Chart || !_lsData) return;
  const setores = _lsData.setores.filter(s => s.produtivo);
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    indexAxis: 'y',
    data: {
      labels: setores.map(s => s.label),
      datasets: [{ label: 'Média diária', data: setores.map(s => s.media_diaria), backgroundColor: setores.map(s => LS_CORES[s.setor] || '#94a3b8'), borderRadius: 3 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => lsFmtL(c.parsed.x) + '/dia' } } },
      scales: { x: { beginAtZero: true, ticks: { callback: v => lsFmt(v) + ' L' } }, y: { grid: { display: false } } }
    }
  });
}

// ===================================================
// EXPORTAÇÃO – PDF
// ===================================================
function _lsPeriodoTexto() {
  const d = _lsData;
  if (!d || !d.diario.length) return '';
  const f = iso => String(iso).split('-').reverse().join('/');
  return `${f(d.diario[0].dia)} a ${f(d.diario[d.diario.length - 1].dia)}`;
}

function _lsCanvasPNG(id) {
  const c = document.getElementById(id);
  try { return c && c._chart ? c.toDataURL('image/png', 1.0) : null; } catch (_) { return null; }
}

function exportLitragemSetorPDF() {
  if (!_lsData) return;
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert('Biblioteca de PDF não carregada. Atualize a página e tente de novo.'); return; }

  const d = _lsData, r = d.resumo;
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // ---- Capa ----
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, W, H, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
  doc.text('Capacidade de Produção', W / 2, H / 2 - 60, { align: 'center' });
  doc.setFontSize(20); doc.setFont('helvetica', 'normal');
  doc.text('Litragem por setor e por dia', W / 2, H / 2 - 28, { align: 'center' });
  doc.setFontSize(13);
  doc.text(`Período: ${_lsPeriodoTexto()}`, W / 2, H / 2 + 14, { align: 'center' });
  doc.setFontSize(10); doc.setTextColor(200, 215, 245);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, W / 2, H - 40, { align: 'center' });

  // ---- Indicadores ----
  doc.addPage();
  _lsPdfTitulo(doc, 'Indicadores do período', W);
  const cards = [
    ['Produção concluída', lsFmtL(r.total_litros_finalizados), [37, 99, 235]],
    ['Capacidade média/dia', lsFmtL(r.media_diaria_finalizados), [22, 163, 74]],
    ['Somente base', lsFmtL(r.total_litros_finalizados_base), [147, 51, 234]],
    ['Sem base', lsFmtL(r.total_litros_finalizados_nao_base), [234, 88, 12]]
  ];
  const cw = (W - 80 - 3 * 14) / 4;
  cards.forEach((c, i) => {
    const x = 40 + i * (cw + 14);
    doc.setFillColor(...c[2]); doc.roundedRect(x, 80, cw, 74, 6, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text(c[1], x + cw / 2, 114, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(c[0], x + cw / 2, 134, { align: 'center' });
  });

  doc.autoTable({
    startY: 180,
    head: [['Setor', 'Média diária', 'Média diária (base)', 'Total no período', 'Base', 'Sem base', 'Dias', 'Lotes']],
    body: d.setores.filter(s => s.produtivo).map(s => [
      s.label, lsFmtL(s.media_diaria), lsFmtL(s.media_diaria_base), lsFmtL(s.litros_total),
      lsFmtL(s.litros_base), lsFmtL(s.litros_nao_base), String(s.dias_com_producao), String(s.lotes)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 138], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    margin: { left: 40, right: 40 }
  });

  // ---- Gráficos ----
  const graficos = [
    ['lsChartSetores', 'Capacidade média diária por setor'],
    ['lsChartMes', 'Produção concluída por mês'],
    ['lsChartSemana', `Litragem por setor, dia a dia — semana ${lsSemanaLabel((d.semanal[_lsSemanaIdx] || {}).semana)}`]
  ];
  for (const [id, titulo] of graficos) {
    const img = _lsCanvasPNG(id);
    if (!img) continue;
    doc.addPage();
    _lsPdfTitulo(doc, titulo, W);
    const iw = W - 80, ih = Math.min(H - 130, iw * 0.42);
    doc.addImage(img, 'PNG', 40, 80, iw, ih, undefined, 'FAST');
  }

  // ---- Tabela mensal ----
  doc.addPage();
  _lsPdfTitulo(doc, 'Resumo mensal', W);
  doc.autoTable({
    startY: 80,
    head: [['Mês', 'Dias com produção', 'Concluído', 'Base', 'Sem base', 'Média/dia']],
    body: d.mensal.map(m => [lsMesLabel(m.mes), String(m.dias_com_producao), lsFmtL(m.litros_finalizados),
      lsFmtL(m.litros_finalizados_base), lsFmtL(m.litros_finalizados_nao_base), lsFmtL(m.media_diaria_finalizados)]),
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 138], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 40, right: 40 }
  });

  // ---- Metodologia ----
  doc.addPage();
  _lsPdfTitulo(doc, 'Como os números foram apurados', W);
  const linhas = [
    `Etapa concluída: ${d.criterios.atribuicao_do_dia}.`,
    'Litros = peso do lote (kg) ÷ densidade.',
    'Densidade: medida no CQ Vision > padrão da análise > esperada da ordem de produção > média do mesmo produto. Faixa aceita: 0,3 a 3,5 g/cm³.',
    `Base: ${d.criterios.base}.`,
    'Produção concluída: litragem dos lotes que chegaram a pronto/entrega. Cada lote conta uma única vez, sem dupla contagem.',
    'Lotes que nunca foram formalmente iniciados também contam, pois o histórico de transição entre setores existe mesmo sem sessão de trabalho registrada.',
    `Cobertura: ${lsFmt(d.diagnostico.lotes_computados)} de ${lsFmt(d.diagnostico.lotes_avaliados)} lotes. Fora do cálculo: ${lsFmt(d.diagnostico.sem_historico)} sem histórico, ${lsFmt(d.diagnostico.sem_densidade)} sem densidade, ${lsFmt(d.diagnostico.lote_rejeitado)} reprovados, ${lsFmt(d.diagnostico.sem_passagem_concluida)} sem etapa concluída.`
  ];
  doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  let y = 90;
  for (const l of linhas) {
    const wrapped = doc.splitTextToSize('•  ' + l, W - 90);
    doc.text(wrapped, 45, y);
    y += wrapped.length * 16 + 8;
  }

  doc.save(`capacidade-producao-setor-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function _lsPdfTitulo(doc, texto, W) {
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, W, 50, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(texto, 40, 32);
  doc.setTextColor(0, 0, 0);
}

// ===================================================
// EXPORTAÇÃO – POWERPOINT
// ===================================================
function _lsLoadPptx() {
  if (window.PptxGenJS) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar a biblioteca de PowerPoint.'));
    document.head.appendChild(s);
  });
}

async function exportLitragemSetorPPT() {
  if (!_lsData) return;
  const btn = document.getElementById('lsBtnPpt');
  const htmlOrig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando…'; }
  try {
    await _lsLoadPptx();
    const d = _lsData, r = d.resumo;
    const pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = 'Capacidade de Produção por Setor';

    const AZUL = '1E3A8A';

    // Capa
    let s = pptx.addSlide();
    s.background = { color: AZUL };
    s.addText('Capacidade de Produção', { x: 0.5, y: 2.0, w: 12.3, align: 'center', fontSize: 40, bold: true, color: 'FFFFFF' });
    s.addText('Litragem por setor e por dia', { x: 0.5, y: 3.0, w: 12.3, align: 'center', fontSize: 22, color: 'C8D7F5' });
    s.addText(`Período: ${_lsPeriodoTexto()}`, { x: 0.5, y: 3.8, w: 12.3, align: 'center', fontSize: 16, color: 'FFFFFF' });
    s.addText(`Emitido em ${new Date().toLocaleString('pt-BR')}`, { x: 0.5, y: 6.6, w: 12.3, align: 'center', fontSize: 11, color: 'A8BCE8' });

    // Indicadores
    s = _lsPptSlide(pptx, 'Indicadores do período');
    const cards = [
      ['Produção concluída', lsFmtL(r.total_litros_finalizados), '2563EB'],
      ['Capacidade média/dia', lsFmtL(r.media_diaria_finalizados), '16A34A'],
      ['Somente base', lsFmtL(r.total_litros_finalizados_base), '9333EA'],
      ['Sem base', lsFmtL(r.total_litros_finalizados_nao_base), 'EA580C']
    ];
    cards.forEach((c, i) => {
      const x = 0.55 + i * 3.1;
      s.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: 2.9, h: 1.5, fill: { color: c[2] }, line: { color: c[2] }, rectRadius: 0.1 });
      s.addText(c[1], { x, y: 1.7, w: 2.9, align: 'center', fontSize: 22, bold: true, color: 'FFFFFF' });
      s.addText(c[0], { x, y: 2.4, w: 2.9, align: 'center', fontSize: 11, color: 'FFFFFF' });
    });
    const prod = d.setores.filter(x => x.produtivo);
    s.addTable(
      [[{ text: 'Setor', options: { bold: true } }, { text: 'Média diária', options: { bold: true } },
        { text: 'Média diária (base)', options: { bold: true } }, { text: 'Total', options: { bold: true } },
        { text: 'Base', options: { bold: true } }, { text: 'Sem base', options: { bold: true } },
        { text: 'Dias', options: { bold: true } }]]
        .concat(prod.map(x => [x.label, lsFmtL(x.media_diaria), lsFmtL(x.media_diaria_base), lsFmtL(x.litros_total), lsFmtL(x.litros_base), lsFmtL(x.litros_nao_base), String(x.dias_com_producao)])),
      { x: 0.55, y: 3.3, w: 12.2, fontSize: 11, border: { pt: 0.5, color: 'DDDDDD' }, fill: { color: 'F8FAFC' }, color: '1F2937', align: 'right', colW: [3.2, 1.6, 1.9, 1.7, 1.5, 1.5, 0.8] }
    );

    // Gráficos
    for (const [id, titulo] of [
      ['lsChartSetores', 'Capacidade média diária por setor'],
      ['lsChartMes', 'Produção concluída por mês'],
      ['lsChartSemana', `Litragem por setor, dia a dia — semana ${lsSemanaLabel((d.semanal[_lsSemanaIdx] || {}).semana)}`]
    ]) {
      const img = _lsCanvasPNG(id);
      if (!img) continue;
      const sl = _lsPptSlide(pptx, titulo);
      sl.addImage({ data: img, x: 0.6, y: 1.3, w: 12.1, h: 5.6, sizing: { type: 'contain', w: 12.1, h: 5.6 } });
    }

    // Mensal
    const sm = _lsPptSlide(pptx, 'Resumo mensal');
    sm.addTable(
      [[{ text: 'Mês', options: { bold: true } }, { text: 'Dias', options: { bold: true } },
        { text: 'Concluído', options: { bold: true } }, { text: 'Base', options: { bold: true } },
        { text: 'Sem base', options: { bold: true } }, { text: 'Média/dia', options: { bold: true } }]]
        .concat(d.mensal.map(m => [lsMesLabel(m.mes), String(m.dias_com_producao), lsFmtL(m.litros_finalizados),
          lsFmtL(m.litros_finalizados_base), lsFmtL(m.litros_finalizados_nao_base), lsFmtL(m.media_diaria_finalizados)])),
      { x: 0.6, y: 1.5, w: 12.1, fontSize: 13, border: { pt: 0.5, color: 'DDDDDD' }, fill: { color: 'F8FAFC' }, color: '1F2937', align: 'right', colW: [2.6, 1.6, 2.2, 2.0, 2.0, 1.7] }
    );

    // Metodologia
    const sme = _lsPptSlide(pptx, 'Como os números foram apurados');
    sme.addText([
      { text: `Etapa concluída: ${d.criterios.atribuicao_do_dia}.`, options: { bullet: true } },
      { text: 'Litros = peso do lote (kg) ÷ densidade.', options: { bullet: true } },
      { text: 'Densidade: medida no CQ Vision > padrão da análise > esperada da ordem de produção > média do mesmo produto (faixa 0,3 a 3,5 g/cm³).', options: { bullet: true } },
      { text: `Base: ${d.criterios.base}.`, options: { bullet: true } },
      { text: 'Produção concluída: lotes que chegaram a pronto/entrega. Cada lote conta uma única vez.', options: { bullet: true } },
      { text: 'Lotes nunca iniciados formalmente também contam, pois o histórico de transição entre setores existe mesmo sem sessão de trabalho.', options: { bullet: true } },
      { text: `Cobertura: ${lsFmt(d.diagnostico.lotes_computados)} de ${lsFmt(d.diagnostico.lotes_avaliados)} lotes.`, options: { bullet: true } }
    ], { x: 0.7, y: 1.5, w: 11.9, h: 5.2, fontSize: 14, color: '374151', lineSpacingMultiple: 1.4 });

    await pptx.writeFile({ fileName: `capacidade-producao-setor-${new Date().toISOString().slice(0, 10)}.pptx` });
  } catch (err) {
    alert('Não foi possível gerar o PowerPoint: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = htmlOrig; }
  }
}

function _lsPptSlide(pptx, titulo) {
  const s = pptx.addSlide();
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.9, fill: { color: '1E3A8A' }, line: { color: '1E3A8A' } });
  s.addText(titulo, { x: 0.5, y: 0.2, w: 12.3, fontSize: 22, bold: true, color: 'FFFFFF' });
  return s;
}

window.renderLitragemSetor = renderLitragemSetor;
window.loadLitragemSetor = loadLitragemSetor;
window._lsToggleDiario = _lsToggleDiario;
window._lsSemana = _lsSemana;
window._lsSemanaSel = _lsSemanaSel;
window.exportLitragemSetorPDF = exportLitragemSetorPDF;
window.exportLitragemSetorPPT = exportLitragemSetorPPT;
