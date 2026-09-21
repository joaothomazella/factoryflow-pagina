// ===================================================
// OPS-SETOR.JS – Quantidade de Ordens de Produção por Setor / Dia
//
// Backend: GET /api/producao/litragem-setor (mesmo endpoint da litragem, para que os
// dois relatórios batam entre si por construção).
//
// Metodologia (igual à da litragem, trocando litros por contagem de OPs):
//  - A passagem da OP por um setor vem do ff_history: entrada = um evento,
//    saída = o evento seguinte. Só conta passagem CONCLUÍDA (a OP saiu do setor).
//  - Uma OP conta UMA vez por setor por dia (idas e voltas no mesmo dia não duplicam).
//  - OPs que nunca foram formalmente iniciadas também contam, porque o histórico de
//    transição existe mesmo sem sessão de trabalho registrada.
//  - Diferente da litragem, OPs sem peso ou sem densidade cadastrada CONTAM aqui:
//    a ordem passou pelo setor do mesmo jeito.
//  - Base = tipo_lote 'base', linha_produto 'base' ou produto iniciando com "BASE".
// ===================================================
'use strict';

let _osData = null;
let _osFilters = { inicio: '', fim: '', modo: 'conclusao' };
let _osSemanaIdx = 0;
let _osShowDiario = false;

const OS_CORES = {
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

function _osResolveApiBase() {
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

function _osAuthHeaders() {
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

function osFmt(n, casas) {
  const v = Number(n || 0);
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas == null ? 0 : casas, maximumFractionDigits: casas == null ? 0 : casas });
}
function osFmtOps(n) {
  const v = Number(n || 0);
  return osFmt(v, Number.isInteger(v) ? 0 : 1) + ' OP' + (Math.abs(v) === 1 ? '' : 's');
}

function osDiaLabel(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y) return iso;
  const dt = new Date(y, m - 1, d);
  const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return `${nomes[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
function osMesLabel(iso) {
  const [y, m] = String(iso || '').split('-').map(Number);
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return y ? `${nomes[m - 1]}/${y}` : iso;
}
function osSemanaLabel(s) {
  const semana = _osData && _osData.semanal.find(x => x.semana === s);
  if (!semana) return s;
  const fmt = iso => { const p = String(iso).split('-'); return `${p[2]}/${p[1]}`; };
  return `${fmt(semana.inicio)} a ${fmt(semana.fim)}`;
}

// ===================================================
// RENDER DA PÁGINA
// ===================================================
function renderOpsSetor() {
  const page = document.getElementById('pageOpsSetor');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-clipboard-list"></i> Quantidade de OPs por Setor</h2>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="exportOpsSetorPDF()" id="osBtnPdf" disabled>
          <i class="fas fa-file-pdf"></i> Relatório PDF
        </button>
        <button class="btn btn-secondary" onclick="exportOpsSetorPPT()" id="osBtnPpt" disabled>
          <i class="fas fa-file-powerpoint"></i> PowerPoint
        </button>
        <button class="btn btn-primary" onclick="loadOpsSetor()">
          <i class="fas fa-search"></i> Buscar
        </button>
      </div>
    </div>

    <div class="rt-filters-card" style="margin-bottom:1rem">
      <div class="rt-filters-title"><i class="fas fa-filter"></i> Período e critério</div>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:end">
        <div class="rt-filter-group" style="max-width:200px">
          <label class="rt-filter-label">Data Inicial</label>
          <input type="date" id="osInicio" class="rt-filter-input" value="${_osFilters.inicio}">
        </div>
        <div class="rt-filter-group" style="max-width:200px">
          <label class="rt-filter-label">Data Final</label>
          <input type="date" id="osFim" class="rt-filter-input" value="${_osFilters.fim}">
        </div>
        <div class="rt-filter-group" style="max-width:320px">
          <label class="rt-filter-label">Critério da etapa</label>
          <select id="osModo" class="rt-filter-input">
            <option value="conclusao" ${_osFilters.modo === 'conclusao' ? 'selected' : ''}>Contar no dia em que a OP saiu do setor</option>
            <option value="mesmo_dia" ${_osFilters.modo === 'mesmo_dia' ? 'selected' : ''}>Só etapas iniciadas e concluídas no mesmo dia</option>
          </select>
        </div>
      </div>
    </div>

    <div id="osContent">
      <div class="empty-state" style="padding:3rem;text-align:center;color:#64748b">
        <i class="fas fa-chart-column" style="font-size:2.5rem;opacity:.35"></i>
        <p style="margin-top:1rem">Clique em <strong>Buscar</strong> para contar as OPs por setor.</p>
      </div>
    </div>
  `;

  if (!_osData) loadOpsSetor();
  else _osRenderContent();
}

async function loadOpsSetor() {
  const el = document.getElementById('osContent');
  if (!el) return;

  _osFilters.inicio = (document.getElementById('osInicio') || {}).value || '';
  _osFilters.fim = (document.getElementById('osFim') || {}).value || '';
  _osFilters.modo = (document.getElementById('osModo') || {}).value || 'conclusao';

  el.innerHTML = `<div style="padding:3rem;text-align:center;color:#64748b">
    <i class="fas fa-spinner fa-spin" style="font-size:2rem"></i>
    <p style="margin-top:1rem">Contando ordens de produção por setor…</p></div>`;

  const params = new URLSearchParams();
  if (_osFilters.inicio) params.set('inicio', _osFilters.inicio);
  if (_osFilters.fim) params.set('fim', _osFilters.fim);
  if (_osFilters.modo) params.set('modo', _osFilters.modo);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const resp = await fetch(`${_osResolveApiBase()}/api/producao/litragem-setor?${params.toString()}`, {
      headers: _osAuthHeaders(), signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json || json.ok !== true) throw new Error(json && json.error ? json.error : 'Resposta inválida');
    _osData = json;
    _osSemanaIdx = Math.max(0, (json.semanal || []).length - 1);
    _osRenderContent();
  } catch (err) {
    clearTimeout(timer);
    el.innerHTML = `<div class="section-card" style="text-align:center;padding:2rem">
      <i class="fas fa-triangle-exclamation" style="font-size:2rem;color:#dc2626"></i>
      <p style="margin-top:1rem">Não foi possível carregar o relatório.</p>
      <p style="color:#64748b;font-size:.9rem">${err.name === 'AbortError' ? 'Tempo esgotado.' : err.message}</p>
    </div>`;
  }
}

function _osRenderContent() {
  const el = document.getElementById('osContent');
  if (!el || !_osData) return;
  const d = _osData;
  const r = d.resumo;

  ['osBtnPdf', 'osBtnPpt'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = false; });

  const produtivos = d.setores.filter(s => s.produtivo);
  const apoio = d.setores.filter(s => !s.produtivo);

  el.innerHTML = `
    <div class="metrics-row">
      <div class="metric-card metric-blue">
        <div class="metric-num">${osFmt(r.total_ops_finalizadas)}</div>
        <div class="metric-label">OPs concluídas no período</div>
      </div>
      <div class="metric-card metric-green">
        <div class="metric-num">${osFmt(r.media_diaria_ops_finalizadas, 1)}</div>
        <div class="metric-label">OPs concluídas por dia (média)</div>
      </div>
      <div class="metric-card metric-purple">
        <div class="metric-num">${osFmt(r.total_ops_finalizadas_base)}</div>
        <div class="metric-label">Somente base (${osFmt(r.total_ops_finalizadas ? (r.total_ops_finalizadas_base / r.total_ops_finalizadas) * 100 : 0, 1)}%)</div>
      </div>
      <div class="metric-card metric-orange">
        <div class="metric-num">${osFmt(r.total_ops_finalizadas_nao_base)}</div>
        <div class="metric-label">Produtos de linha finais</div>
      </div>
    </div>

    <div class="metrics-row">
      <div class="metric-card metric-blue">
        <div class="metric-num">${osFmt(r.media_diaria_ops_fabrica, 1)}</div>
        <div class="metric-label">OPs distintas movimentadas por dia</div>
      </div>
      <div class="metric-card metric-green">
        <div class="metric-num">${osFmt(r.media_diaria_ops_setores, 1)}</div>
        <div class="metric-label">Etapas de OP concluídas por dia</div>
      </div>
      <div class="metric-card metric-purple">
        <div class="metric-num">${osFmt(r.media_semanal_ops_fabrica, 1)}</div>
        <div class="metric-label">OPs por semana (média)</div>
      </div>
      <div class="metric-card metric-orange">
        <div class="metric-num">${osFmt(r.media_mensal_ops_fabrica, 1)}</div>
        <div class="metric-label">OPs por mês (média)</div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-gauge-high"></i> Média de OPs por dia em cada setor</h3>
      <p style="color:#64748b;font-size:.85rem;margin:-.25rem 0 1rem">
        Quantas ordens de produção cada setor atende por dia, considerando apenas os dias em que o setor trabalhou.
        Uma mesma OP conta uma vez por setor por dia.
      </p>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Setor</th>
              <th style="text-align:right">OPs/dia</th>
              <th style="text-align:right">OPs/dia (base)</th>
              <th style="text-align:right">OPs/dia (linha final)</th>
              <th style="text-align:right">Total no período</th>
              <th style="text-align:right">Base</th>
              <th style="text-align:right">Linha final</th>
              <th style="text-align:right">Dias</th>
              <th style="text-align:right">OPs distintas</th>
            </tr>
          </thead>
          <tbody>
            ${produtivos.map(s => _osLinhaSetor(s, true)).join('')}
            ${apoio.length ? `<tr><td colspan="9" style="background:#f8fafc;font-weight:600;color:#64748b;font-size:.8rem">ETAPAS DE APOIO (revisão, liberação e amostras — não somam na produção da fábrica)</td></tr>` : ''}
            ${apoio.map(s => _osLinhaSetor(s, false)).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-chart-column"></i> OPs por setor, dia a dia</h3>
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="_osSemana(-1)"><i class="fas fa-chevron-left"></i></button>
        <select id="osSelSemana" class="rt-filter-input" style="max-width:240px" onchange="_osSemanaSel(this.value)">
          ${d.semanal.map((s, i) => `<option value="${i}" ${i === _osSemanaIdx ? 'selected' : ''}>Semana ${osSemanaLabel(s.semana)}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="_osSemana(1)"><i class="fas fa-chevron-right"></i></button>
        <span id="osSemanaResumo" style="color:#64748b;font-size:.85rem"></span>
      </div>
      <div class="chart-card" style="height:380px"><canvas id="osChartSemana"></canvas></div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h4>OPs concluídas por mês</h4>
        <div style="height:280px"><canvas id="osChartMes"></canvas></div>
      </div>
      <div class="chart-card">
        <h4>Média de OPs por dia em cada setor</h4>
        <div style="height:280px"><canvas id="osChartSetores"></canvas></div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-calendar"></i> Resumo mensal</h3>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mês</th><th style="text-align:right">Dias</th>
              <th style="text-align:right">OPs concluídas</th>
              <th style="text-align:right">Base</th>
              <th style="text-align:right">Linha final</th>
              <th style="text-align:right">OPs/dia</th>
            </tr>
          </thead>
          <tbody>
            ${d.mensal.map(m => `
              <tr>
                <td><strong>${osMesLabel(m.mes)}</strong></td>
                <td style="text-align:right">${m.dias_com_producao}</td>
                <td style="text-align:right">${osFmt(m.ops_finalizadas)}</td>
                <td style="text-align:right">${osFmt(m.ops_finalizadas_base)}</td>
                <td style="text-align:right">${osFmt(m.ops_finalizadas_nao_base)}</td>
                <td style="text-align:right"><strong>${osFmt(m.dias_com_producao ? m.ops_finalizadas / m.dias_com_producao : 0, 1)}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-card">
      <h3 style="cursor:pointer" onclick="_osToggleDiario()">
        <i class="fas fa-table-list"></i> Detalhamento diário
        <i class="fas fa-chevron-${_osShowDiario ? 'up' : 'down'}" style="font-size:.8rem;margin-left:.5rem"></i>
      </h3>
      <div id="osDiarioWrap" style="display:${_osShowDiario ? 'block' : 'none'}"></div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-circle-info"></i> Como os números foram apurados</h3>
      <ul style="color:#475569;font-size:.88rem;line-height:1.8;margin:0;padding-left:1.2rem">
        <li><strong>Etapa concluída:</strong> ${d.criterios.atribuicao_do_dia}.</li>
        <li><strong>Contagem:</strong> uma OP conta uma vez por setor por dia. Idas e voltas ao mesmo setor no mesmo dia não duplicam.</li>
        <li><strong>OPs concluídas:</strong> ordens que chegaram a pronto/entrega — cada OP conta uma única vez, sem dupla contagem.</li>
        <li><strong>OPs movimentadas:</strong> ordens distintas que passaram por algum setor produtivo no dia.</li>
        <li><strong>Etapas de OP:</strong> soma das passagens por setor; uma mesma OP aparece em vários setores, então esse número mede carga de trabalho, não quantidade de ordens.</li>
        <li><strong>Base:</strong> ${d.criterios.base}.</li>
        <li><strong>Cobertura:</strong> ${osFmt(d.diagnostico.lotes_computados)} de ${osFmt(d.diagnostico.lotes_avaliados)} ordens entraram no cálculo
          (${osFmt(d.diagnostico.sem_historico)} sem histórico de movimentação,
           ${osFmt(d.diagnostico.lote_rejeitado)} reprovadas,
           ${osFmt(d.diagnostico.sem_passagem_concluida)} ainda sem nenhuma etapa concluída).
          Diferente do relatório de litragem, ordens sem peso ou densidade cadastrada contam aqui normalmente.</li>
      </ul>
    </div>
  `;

  if (_osShowDiario) _osRenderDiario();
  setTimeout(() => { _osRenderChartSemana(); _osRenderChartMes(); _osRenderChartSetores(); }, 100);
}

function _osLinhaSetor(s, destaque) {
  return `
    <tr${destaque ? '' : ' style="color:#64748b"'}>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${OS_CORES[s.setor] || '#94a3b8'};margin-right:.5rem"></span>${s.label}</td>
      <td style="text-align:right"><strong>${osFmt(s.media_ops_dia, 1)}</strong></td>
      <td style="text-align:right">${osFmt(s.media_ops_dia_base, 1)}</td>
      <td style="text-align:right">${osFmt(s.media_ops_dia_nao_base, 1)}</td>
      <td style="text-align:right">${osFmt(s.ops_total)}</td>
      <td style="text-align:right">${osFmt(s.ops_base)}</td>
      <td style="text-align:right">${osFmt(s.ops_nao_base)}</td>
      <td style="text-align:right">${s.dias_com_producao}</td>
      <td style="text-align:right">${s.lotes}</td>
    </tr>`;
}

function _osToggleDiario() {
  _osShowDiario = !_osShowDiario;
  const wrap = document.getElementById('osDiarioWrap');
  if (!wrap) return;
  wrap.style.display = _osShowDiario ? 'block' : 'none';
  if (_osShowDiario) _osRenderDiario();
}

function _osRenderDiario() {
  const wrap = document.getElementById('osDiarioWrap');
  if (!wrap || !_osData) return;
  const setores = _osData.setores.filter(s => s.produtivo);
  wrap.innerHTML = `
    <div class="table-container" style="max-height:520px;overflow:auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>Dia</th>
            ${setores.map(s => `<th style="text-align:right">${s.label}</th>`).join('')}
            <th style="text-align:right">OPs movimentadas</th>
            <th style="text-align:right">OPs concluídas</th>
            <th style="text-align:right">Base</th>
          </tr>
        </thead>
        <tbody>
          ${[..._osData.diario].reverse().map(d => `
            <tr>
              <td>${osDiaLabel(d.dia)}</td>
              ${setores.map(s => `<td style="text-align:right">${d.por_setor[s.setor] ? osFmt(d.por_setor[s.setor].ops) : '—'}</td>`).join('')}
              <td style="text-align:right">${osFmt(d.ops_fabrica)}</td>
              <td style="text-align:right"><strong>${osFmt(d.ops_finalizadas)}</strong></td>
              <td style="text-align:right">${osFmt(d.ops_finalizadas_base)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function _osSemana(delta) {
  if (!_osData) return;
  const max = _osData.semanal.length - 1;
  _osSemanaIdx = Math.min(max, Math.max(0, _osSemanaIdx + delta));
  const sel = document.getElementById('osSelSemana');
  if (sel) sel.value = String(_osSemanaIdx);
  _osRenderChartSemana();
}
function _osSemanaSel(v) {
  _osSemanaIdx = Number(v) || 0;
  _osRenderChartSemana();
}

// ===================================================
// GRÁFICOS
// ===================================================
function _osDadosSemana() {
  const semana = _osData.semanal[_osSemanaIdx];
  if (!semana) return null;
  const dias = _osData.diario.filter(d => d.semana === semana.semana);
  const setores = _osData.setores.filter(s => s.produtivo);
  return {
    semana,
    labels: dias.map(d => osDiaLabel(d.dia)),
    datasets: setores.map(s => ({
      label: s.label,
      data: dias.map(d => (d.por_setor[s.setor] ? d.por_setor[s.setor].ops : 0)),
      backgroundColor: OS_CORES[s.setor] || '#94a3b8',
      borderRadius: 3
    }))
  };
}

function _osRenderChartSemana() {
  const ctx = document.getElementById('osChartSemana');
  if (!ctx || !window.Chart || !_osData) return;
  const dados = _osDadosSemana();
  if (!dados) return;

  const resumo = document.getElementById('osSemanaResumo');
  if (resumo) {
    resumo.innerHTML = `Concluídas na semana: <strong>${osFmt(dados.semana.ops_finalizadas)}</strong>
      &nbsp;·&nbsp; Base: <strong>${osFmt(dados.semana.ops_finalizadas_base)}</strong>
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
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${osFmtOps(c.parsed.y)}` } }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

function _osRenderChartMes() {
  const ctx = document.getElementById('osChartMes');
  if (!ctx || !window.Chart || !_osData) return;
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: _osData.mensal.map(m => osMesLabel(m.mes)),
      datasets: [
        { label: 'Linha final', data: _osData.mensal.map(m => m.ops_finalizadas_nao_base), backgroundColor: '#2563eb', borderRadius: 3 },
        { label: 'Base', data: _osData.mensal.map(m => m.ops_finalizadas_base), backgroundColor: '#9333ea', borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${osFmtOps(c.parsed.y)}` } } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function _osRenderChartSetores() {
  const ctx = document.getElementById('osChartSetores');
  if (!ctx || !window.Chart || !_osData) return;
  const setores = _osData.setores.filter(s => s.produtivo);
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: setores.map(s => s.label),
      datasets: [{ label: 'Média de OPs por dia', data: setores.map(s => s.media_ops_dia), backgroundColor: setores.map(s => OS_CORES[s.setor] || '#94a3b8'), borderRadius: 3 }]
    },
    options: {
      // barras deitadas: o nome do setor fica legível no eixo vertical
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => osFmtOps(c.parsed.x) + '/dia' } } },
      scales: {
        x: { beginAtZero: true },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

// ===================================================
// EXPORTAÇÃO – PDF
// ===================================================
function _osPeriodoTexto() {
  const d = _osData;
  if (!d || !d.diario.length) return '';
  const f = iso => String(iso).split('-').reverse().join('/');
  return `${f(d.diario[0].dia)} a ${f(d.diario[d.diario.length - 1].dia)}`;
}

function _osCanvasPNG(id) {
  const c = document.getElementById(id);
  try { return c && c._chart ? c.toDataURL('image/png', 1.0) : null; } catch (_) { return null; }
}

function exportOpsSetorPDF() {
  if (!_osData) return;
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert('Biblioteca de PDF não carregada. Atualize a página e tente de novo.'); return; }

  const d = _osData, r = d.resumo;
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // ---- Capa ----
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, W, H, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
  doc.text('Ordens de Produção', W / 2, H / 2 - 60, { align: 'center' });
  doc.setFontSize(20); doc.setFont('helvetica', 'normal');
  doc.text('Quantidade de OPs por setor e por dia', W / 2, H / 2 - 28, { align: 'center' });
  doc.setFontSize(13);
  doc.text(`Período: ${_osPeriodoTexto()}`, W / 2, H / 2 + 14, { align: 'center' });
  doc.setFontSize(10); doc.setTextColor(200, 215, 245);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, W / 2, H - 40, { align: 'center' });

  // ---- Indicadores ----
  doc.addPage();
  _osPdfTitulo(doc, 'Indicadores do período', W);
  const cards = [
    ['OPs concluídas', osFmt(r.total_ops_finalizadas), [37, 99, 235]],
    ['OPs concluídas/dia', osFmt(r.media_diaria_ops_finalizadas, 1), [22, 163, 74]],
    ['Somente base', osFmt(r.total_ops_finalizadas_base), [147, 51, 234]],
    ['Linha final', osFmt(r.total_ops_finalizadas_nao_base), [234, 88, 12]]
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
    head: [['Setor', 'OPs/dia', 'OPs/dia (base)', 'OPs/dia (linha final)', 'Total', 'Base', 'Linha final', 'Dias', 'OPs distintas']],
    body: d.setores.filter(s => s.produtivo).map(s => [
      s.label, osFmt(s.media_ops_dia, 1), osFmt(s.media_ops_dia_base, 1), osFmt(s.media_ops_dia_nao_base, 1),
      osFmt(s.ops_total), osFmt(s.ops_base), osFmt(s.ops_nao_base), String(s.dias_com_producao), String(s.lotes)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 138], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
    margin: { left: 40, right: 40 }
  });

  // ---- Gráficos ----
  const graficos = [
    ['osChartSetores', 'Média de OPs por dia em cada setor'],
    ['osChartMes', 'OPs concluídas por mês'],
    ['osChartSemana', `OPs por setor, dia a dia — semana ${osSemanaLabel((d.semanal[_osSemanaIdx] || {}).semana)}`]
  ];
  for (const [id, titulo] of graficos) {
    const img = _osCanvasPNG(id);
    if (!img) continue;
    doc.addPage();
    _osPdfTitulo(doc, titulo, W);
    const iw = W - 80, ih = Math.min(H - 130, iw * 0.42);
    doc.addImage(img, 'PNG', 40, 80, iw, ih, undefined, 'FAST');
  }

  // ---- Tabela mensal ----
  doc.addPage();
  _osPdfTitulo(doc, 'Resumo mensal', W);
  doc.autoTable({
    startY: 80,
    head: [['Mês', 'Dias com produção', 'OPs concluídas', 'Base', 'Linha final', 'OPs/dia']],
    body: d.mensal.map(m => [osMesLabel(m.mes), String(m.dias_com_producao), osFmt(m.ops_finalizadas),
      osFmt(m.ops_finalizadas_base), osFmt(m.ops_finalizadas_nao_base),
      osFmt(m.dias_com_producao ? m.ops_finalizadas / m.dias_com_producao : 0, 1)]),
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 138], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 40, right: 40 }
  });

  // ---- Metodologia ----
  doc.addPage();
  _osPdfTitulo(doc, 'Como os números foram apurados', W);
  const linhas = [
    `Etapa concluída: ${d.criterios.atribuicao_do_dia}.`,
    'Contagem: uma OP conta uma vez por setor por dia. Idas e voltas ao mesmo setor no mesmo dia não duplicam.',
    'OPs concluídas: ordens que chegaram a pronto/entrega. Cada OP conta uma única vez, sem dupla contagem.',
    'OPs movimentadas: ordens distintas que passaram por algum setor produtivo no dia.',
    'Etapas de OP: soma das passagens por setor. Uma mesma OP aparece em vários setores, então mede carga de trabalho, não quantidade de ordens.',
    `Base: ${d.criterios.base}.`,
    'Ordens que nunca foram formalmente iniciadas também contam, pois o histórico de transição entre setores existe mesmo sem sessão de trabalho registrada.',
    'Diferente do relatório de litragem, ordens sem peso ou densidade cadastrada contam normalmente aqui.',
    `Cobertura: ${osFmt(d.diagnostico.lotes_computados)} de ${osFmt(d.diagnostico.lotes_avaliados)} ordens. Fora do cálculo: ${osFmt(d.diagnostico.sem_historico)} sem histórico, ${osFmt(d.diagnostico.lote_rejeitado)} reprovadas, ${osFmt(d.diagnostico.sem_passagem_concluida)} sem etapa concluída.`
  ];
  doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  let y = 90;
  for (const l of linhas) {
    const wrapped = doc.splitTextToSize('•  ' + l, W - 90);
    doc.text(wrapped, 45, y);
    y += wrapped.length * 16 + 8;
  }

  doc.save(`ordens-producao-setor-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function _osPdfTitulo(doc, texto, W) {
  doc.setFillColor(30, 58, 138); doc.rect(0, 0, W, 50, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(texto, 40, 32);
  doc.setTextColor(0, 0, 0);
}

// ===================================================
// EXPORTAÇÃO – POWERPOINT
// ===================================================
function _osLoadPptx() {
  if (window.PptxGenJS) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar a biblioteca de PowerPoint.'));
    document.head.appendChild(s);
  });
}

async function exportOpsSetorPPT() {
  if (!_osData) return;
  const btn = document.getElementById('osBtnPpt');
  const htmlOrig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando…'; }
  try {
    await _osLoadPptx();
    const d = _osData, r = d.resumo;
    const pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = 'Quantidade de OPs por Setor';

    const AZUL = '1E3A8A';

    // Capa
    let s = pptx.addSlide();
    s.background = { color: AZUL };
    s.addText('Ordens de Produção', { x: 0.5, y: 2.0, w: 12.3, align: 'center', fontSize: 40, bold: true, color: 'FFFFFF' });
    s.addText('Quantidade de OPs por setor e por dia', { x: 0.5, y: 3.0, w: 12.3, align: 'center', fontSize: 22, color: 'C8D7F5' });
    s.addText(`Período: ${_osPeriodoTexto()}`, { x: 0.5, y: 3.8, w: 12.3, align: 'center', fontSize: 16, color: 'FFFFFF' });
    s.addText(`Emitido em ${new Date().toLocaleString('pt-BR')}`, { x: 0.5, y: 6.6, w: 12.3, align: 'center', fontSize: 11, color: 'A8BCE8' });

    // Indicadores
    s = _osPptSlide(pptx, 'Indicadores do período');
    const cards = [
      ['OPs concluídas', osFmt(r.total_ops_finalizadas), '2563EB'],
      ['OPs concluídas/dia', osFmt(r.media_diaria_ops_finalizadas, 1), '16A34A'],
      ['Somente base', osFmt(r.total_ops_finalizadas_base), '9333EA'],
      ['Linha final', osFmt(r.total_ops_finalizadas_nao_base), 'EA580C']
    ];
    cards.forEach((c, i) => {
      const x = 0.55 + i * 3.1;
      s.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: 2.9, h: 1.5, fill: { color: c[2] }, line: { color: c[2] }, rectRadius: 0.1 });
      s.addText(c[1], { x, y: 1.7, w: 2.9, align: 'center', fontSize: 22, bold: true, color: 'FFFFFF' });
      s.addText(c[0], { x, y: 2.4, w: 2.9, align: 'center', fontSize: 11, color: 'FFFFFF' });
    });
    const prod = d.setores.filter(x => x.produtivo);
    s.addTable(
      [[{ text: 'Setor', options: { bold: true } }, { text: 'OPs/dia', options: { bold: true } },
        { text: 'OPs/dia (base)', options: { bold: true } }, { text: 'Total', options: { bold: true } },
        { text: 'Base', options: { bold: true } }, { text: 'Linha final', options: { bold: true } },
        { text: 'Dias', options: { bold: true } }]]
        .concat(prod.map(x => [x.label, osFmt(x.media_ops_dia, 1), osFmt(x.media_ops_dia_base, 1), osFmt(x.ops_total), osFmt(x.ops_base), osFmt(x.ops_nao_base), String(x.dias_com_producao)])),
      { x: 0.55, y: 3.3, w: 12.2, fontSize: 11, border: { pt: 0.5, color: 'DDDDDD' }, fill: { color: 'F8FAFC' }, color: '1F2937', align: 'right', colW: [3.2, 1.6, 1.9, 1.7, 1.5, 1.5, 0.8] }
    );

    // Gráficos
    for (const [id, titulo] of [
      ['osChartSetores', 'Média de OPs por dia em cada setor'],
      ['osChartMes', 'OPs concluídas por mês'],
      ['osChartSemana', `OPs por setor, dia a dia — semana ${osSemanaLabel((d.semanal[_osSemanaIdx] || {}).semana)}`]
    ]) {
      const img = _osCanvasPNG(id);
      if (!img) continue;
      const sl = _osPptSlide(pptx, titulo);
      sl.addImage({ data: img, x: 0.6, y: 1.3, w: 12.1, h: 5.6, sizing: { type: 'contain', w: 12.1, h: 5.6 } });
    }

    // Mensal
    const sm = _osPptSlide(pptx, 'Resumo mensal');
    sm.addTable(
      [[{ text: 'Mês', options: { bold: true } }, { text: 'Dias', options: { bold: true } },
        { text: 'OPs concluídas', options: { bold: true } }, { text: 'Base', options: { bold: true } },
        { text: 'Linha final', options: { bold: true } }, { text: 'OPs/dia', options: { bold: true } }]]
        .concat(d.mensal.map(m => [osMesLabel(m.mes), String(m.dias_com_producao), osFmt(m.ops_finalizadas),
          osFmt(m.ops_finalizadas_base), osFmt(m.ops_finalizadas_nao_base),
          osFmt(m.dias_com_producao ? m.ops_finalizadas / m.dias_com_producao : 0, 1)])),
      { x: 0.6, y: 1.5, w: 12.1, fontSize: 13, border: { pt: 0.5, color: 'DDDDDD' }, fill: { color: 'F8FAFC' }, color: '1F2937', align: 'right', colW: [2.6, 1.6, 2.2, 2.0, 2.0, 1.7] }
    );

    // Metodologia
    const sme = _osPptSlide(pptx, 'Como os números foram apurados');
    sme.addText([
      { text: `Etapa concluída: ${d.criterios.atribuicao_do_dia}.`, options: { bullet: true } },
      { text: 'Uma OP conta uma vez por setor por dia. Idas e voltas ao mesmo setor no mesmo dia não duplicam.', options: { bullet: true } },
      { text: 'OPs concluídas: ordens que chegaram a pronto/entrega. Cada OP conta uma única vez.', options: { bullet: true } },
      { text: 'Etapas de OP: soma das passagens por setor — mede carga de trabalho, não quantidade de ordens.', options: { bullet: true } },
      { text: `Base: ${d.criterios.base}.`, options: { bullet: true } },
      { text: 'Ordens nunca iniciadas formalmente também contam, pois o histórico de transição entre setores existe mesmo sem sessão de trabalho.', options: { bullet: true } },
      { text: `Cobertura: ${osFmt(d.diagnostico.lotes_computados)} de ${osFmt(d.diagnostico.lotes_avaliados)} ordens.`, options: { bullet: true } }
    ], { x: 0.7, y: 1.5, w: 11.9, h: 5.2, fontSize: 14, color: '374151', lineSpacingMultiple: 1.4 });

    await pptx.writeFile({ fileName: `ordens-producao-setor-${new Date().toISOString().slice(0, 10)}.pptx` });
  } catch (err) {
    alert('Não foi possível gerar o PowerPoint: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = htmlOrig; }
  }
}

function _osPptSlide(pptx, titulo) {
  const s = pptx.addSlide();
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.9, fill: { color: '1E3A8A' }, line: { color: '1E3A8A' } });
  s.addText(titulo, { x: 0.5, y: 0.2, w: 12.3, fontSize: 22, bold: true, color: 'FFFFFF' });
  return s;
}

window.renderOpsSetor = renderOpsSetor;
window.loadOpsSetor = loadOpsSetor;
window._osToggleDiario = _osToggleDiario;
window._osSemana = _osSemana;
window._osSemanaSel = _osSemanaSel;
window.exportOpsSetorPDF = exportOpsSetorPDF;
window.exportOpsSetorPPT = exportOpsSetorPPT;
