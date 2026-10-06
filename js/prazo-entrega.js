// ===================================================
// PRAZO-ENTREGA.JS – Indicador de prazo dos pedidos
//
// Backend: GET /api/producao/prazo-entrega
//
// O que mede: quantos dias existem entre a ENTRADA do pedido (a criação do
// primeiro lote dele) e a DATA DE ENTREGA.
//
//   4 dias ou mais  -> ideal
//   3 dias ou menos -> crítico
//
// Pontos que importam entender antes de olhar os números:
//
//  - A data de entrega é lida na hora, na ordem: o que estiver no calendário
//    da Programação de Entregas, depois a previsão do ERP, e por último a
//    previsão gravada no próprio lote. Não existe cópia guardada: mexer na data
//    pelo calendário muda este indicador na próxima busca. Medido no banco:
//    dos 78 pedidos com data alterada no calendário, 75 têm data diferente da
//    do ERP, o indicador usou a do calendário em todos os 75, e 22 pedidos
//    trocam de classificação por causa dessa alteração.
//
//  - Base não entra na conta (corte por tipo_lote = 'base').
//
//  - Pedido com entrega marcada ANTES da entrada não é atraso, é resquício da
//    carga inicial de maio/2026. Aparece na tela identificado, mas fora do
//    percentual.
//
//  - Prazo acima de 60 dias distorce a média sem dizer nada sobre a operação
//    (hoje é 1 pedido com entrega digitada para 2029). Continua contado no
//    percentual, mas a média mostrada é a sem fora de curva.
// ===================================================
'use strict';

let _peiData = null;
let _peiFilters = { inicio: '', fim: '' };
let _peiMostrarTodos = false;
let _peiFiltroClasse = 'todos';   // todos | ideal | critico | invalido

function _peiResolveApiBase() {
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

function _peiAuthHeaders() {
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

function peiFmt(n, casas) {
  const v = Number(n || 0);
  const c = casas == null ? 0 : casas;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
}

function peiDataBR(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : (iso || '—');
}

function peiMesLabel(iso) {
  const [y, m] = String(iso || '').split('-').map(Number);
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return y ? `${nomes[m - 1]}/${y}` : iso;
}

function peiEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===================================================
// RENDER DA PÁGINA
// ===================================================
function renderPrazoEntrega() {
  const page = document.getElementById('pagePrazoEntrega');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-hourglass-half"></i> Prazo de Entrega dos Pedidos</h2>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="exportPrazoEntregaCSV()" id="peiBtnCsv" disabled>
          <i class="fas fa-file-csv"></i> Exportar CSV
        </button>
        <button class="btn btn-primary" onclick="loadPrazoEntrega()">
          <i class="fas fa-search"></i> Buscar
        </button>
      </div>
    </div>

    <div class="rt-filters-card" style="margin-bottom:1rem">
      <div class="rt-filters-title"><i class="fas fa-filter"></i> Período de entrada do pedido</div>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:end">
        <div class="rt-filter-group" style="max-width:200px">
          <label class="rt-filter-label">Data Inicial</label>
          <input type="date" id="peiInicio" class="rt-filter-input" value="${_peiFilters.inicio}">
        </div>
        <div class="rt-filter-group" style="max-width:200px">
          <label class="rt-filter-label">Data Final</label>
          <input type="date" id="peiFim" class="rt-filter-input" value="${_peiFilters.fim}">
        </div>
        <div class="rt-filter-group" style="max-width:420px">
          <label class="rt-filter-label">Atalhos</label>
          <div style="display:flex;gap:.4rem;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" onclick="peiAtalho(30)">30 dias</button>
            <button class="btn btn-secondary btn-sm" onclick="peiAtalho(90)">90 dias</button>
            <button class="btn btn-secondary btn-sm" onclick="peiAtalho('confiavel')">Desde 01/06</button>
            <button class="btn btn-secondary btn-sm" onclick="peiAtalho(0)">Tudo</button>
          </div>
        </div>
      </div>
    </div>

    <div id="peiContent">
      <div class="empty-state" style="padding:3rem;text-align:center;color:#64748b">
        <i class="fas fa-hourglass-half" style="font-size:2.5rem;opacity:.35"></i>
        <p style="margin-top:1rem">Clique em <strong>Buscar</strong> para medir o prazo dos pedidos.</p>
      </div>
    </div>
  `;

  if (!_peiData) loadPrazoEntrega();
  else _peiRenderContent();
}

// Atalhos de período. 'confiavel' = 1º de junho do ano em curso: antes disso os
// lotes foram carregados em massa para trás e o prazo medido não é real.
function peiAtalho(dias) {
  const hoje = new Date();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const elIni = document.getElementById('peiInicio');
  const elFim = document.getElementById('peiFim');
  if (!elIni || !elFim) return;

  if (dias === 0) { elIni.value = ''; elFim.value = ''; }
  else if (dias === 'confiavel') { elIni.value = `${hoje.getFullYear()}-06-01`; elFim.value = ''; }
  else {
    const de = new Date(hoje.getTime() - dias * 86400000);
    elIni.value = iso(de);
    elFim.value = iso(hoje);
  }
  loadPrazoEntrega();
}

async function loadPrazoEntrega() {
  const el = document.getElementById('peiContent');
  if (!el) return;

  _peiFilters.inicio = (document.getElementById('peiInicio') || {}).value || '';
  _peiFilters.fim = (document.getElementById('peiFim') || {}).value || '';

  el.innerHTML = `<div style="padding:3rem;text-align:center;color:#64748b">
    <i class="fas fa-spinner fa-spin" style="font-size:2rem"></i>
    <p style="margin-top:1rem">Medindo o prazo dos pedidos…</p></div>`;

  const params = new URLSearchParams({ detalhe: '1' });
  if (_peiFilters.inicio) params.set('inicio', _peiFilters.inicio);
  if (_peiFilters.fim) params.set('fim', _peiFilters.fim);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const resp = await fetch(`${_peiResolveApiBase()}/api/producao/prazo-entrega?${params.toString()}`, {
      headers: _peiAuthHeaders(), signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json || json.ok !== true) throw new Error(json && json.error ? json.error : 'Resposta inválida');
    _peiData = json;
    _peiMostrarTodos = false;
    _peiRenderContent();
  } catch (err) {
    clearTimeout(timer);
    el.innerHTML = `<div class="section-card" style="text-align:center;padding:2rem">
      <i class="fas fa-triangle-exclamation" style="font-size:2rem;color:#dc2626"></i>
      <p style="margin-top:1rem">Não foi possível carregar o indicador.</p>
      <p style="color:#64748b;font-size:.9rem">${peiEscape(err.name === 'AbortError' ? 'Tempo esgotado.' : err.message)}</p>
    </div>`;
  }
}

function peiFiltrarClasse(classe) {
  _peiFiltroClasse = classe;
  _peiRenderContent();
}

function peiVerTodos() {
  _peiMostrarTodos = true;
  _peiRenderContent();
}

function _peiRenderContent() {
  const el = document.getElementById('peiContent');
  if (!el || !_peiData) return;
  const d = _peiData;
  const r = d.resumo;

  const btn = document.getElementById('peiBtnCsv');
  if (btn) btn.disabled = false;

  const pct = Number(r.percentual_ideal) || 0;
  // Semáforo do percentual: a barra muda de cor para a leitura ser imediata.
  const corPct = pct >= 80 ? '#16a34a' : pct >= 60 ? '#ea580c' : '#dc2626';

  const lista = (d.pedidos || []).filter(p => {
    if (_peiFiltroClasse === 'todos') return true;
    if (_peiFiltroClasse === 'invalido') return p.prazo_invalido;
    return !p.prazo_invalido && p.classificacao === _peiFiltroClasse;
  });
  const visiveis = _peiMostrarTodos ? lista : lista.slice(0, 100);

  el.innerHTML = `
    <div class="metrics-row">
      <div class="metric-card metric-green">
        <div class="metric-num">${peiFmt(r.ideal)}</div>
        <div class="metric-label">Ideal — ${d.criterio.ideal_minimo_dias} dias ou mais</div>
      </div>
      <div class="metric-card metric-orange">
        <div class="metric-num">${peiFmt(r.critico)}</div>
        <div class="metric-label">Crítico — ${d.criterio.ideal_minimo_dias - 1} dias ou menos</div>
      </div>
      <div class="metric-card metric-blue">
        <div class="metric-num">${peiFmt(r.percentual_ideal, 1)}%</div>
        <div class="metric-label">dos ${peiFmt(r.pedidos)} pedidos estão no ideal</div>
      </div>
      <div class="metric-card metric-purple">
        <div class="metric-num">${peiFmt(r.mediana_dias, 1)}</div>
        <div class="metric-label">dias de prazo (mediana)</div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-traffic-light"></i> Situação geral</h3>
      <div style="display:flex;height:34px;border-radius:8px;overflow:hidden;margin:.5rem 0 .75rem;background:#f1f5f9">
        <div style="width:${pct}%;background:${corPct};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.85rem;transition:width .3s">
          ${pct >= 12 ? peiFmt(pct, 1) + '% ideal' : ''}
        </div>
        <div style="flex:1;background:#fecaca;display:flex;align-items:center;justify-content:center;color:#7f1d1d;font-weight:700;font-size:.85rem">
          ${(100 - pct) >= 12 ? peiFmt(100 - pct, 1) + '% crítico' : ''}
        </div>
      </div>
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;color:#64748b;font-size:.85rem">
        <span><strong style="color:#0f172a">${peiFmt(r.media_dias_sem_fora_de_curva, 1)}</strong> dias de média</span>
        <span>menor prazo: <strong style="color:#0f172a">${peiFmt(r.menor_prazo_dias)}</strong> d</span>
        <span>maior prazo: <strong style="color:#0f172a">${peiFmt(r.maior_prazo_dias)}</strong> d</span>
        <span><strong style="color:#0f172a">${peiFmt(r.datas_vindas_do_calendario)}</strong> com data ajustada no calendário</span>
      </div>
      ${(d.avisos || []).length ? `
        <div style="margin-top:1rem;padding:.75rem .9rem;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:6px">
          <div style="font-weight:600;color:#92400e;font-size:.85rem;margin-bottom:.35rem">
            <i class="fas fa-circle-info"></i> O que ficou de fora da conta
          </div>
          <ul style="margin:0;padding-left:1.1rem;color:#78350f;font-size:.82rem;line-height:1.6">
            ${d.avisos.map(a => `<li>${peiEscape(a)}</li>`).join('')}
          </ul>
        </div>` : ''}
    </div>

    <div class="section-card">
      <h3><i class="fas fa-chart-line"></i> Mês a mês</h3>
      <p style="color:#64748b;font-size:.85rem;margin:-.25rem 0 1rem">
        Agrupado pelo mês em que o pedido entrou. A média exclui prazos fora de curva (acima de 60 dias).
      </p>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mês</th>
              <th style="text-align:right">Pedidos</th>
              <th style="text-align:right">Ideal</th>
              <th style="text-align:right">Crítico</th>
              <th style="text-align:right">% ideal</th>
              <th style="text-align:right">Média (dias)</th>
              <th style="text-align:right">Fora da conta</th>
            </tr>
          </thead>
          <tbody>
            ${(d.mensal || []).map(m => {
              const c = m.percentual_ideal >= 80 ? '#16a34a' : m.percentual_ideal >= 60 ? '#ea580c' : '#dc2626';
              return `<tr>
                <td><strong>${peiMesLabel(m.mes)}</strong></td>
                <td style="text-align:right">${peiFmt(m.pedidos)}</td>
                <td style="text-align:right;color:#16a34a">${peiFmt(m.ideal)}</td>
                <td style="text-align:right;color:#dc2626">${peiFmt(m.critico)}</td>
                <td style="text-align:right;font-weight:700;color:${c}">${peiFmt(m.percentual_ideal, 1)}%</td>
                <td style="text-align:right">${peiFmt(m.media_dias_sem_fora_de_curva, 1)}</td>
                <td style="text-align:right;color:#94a3b8">${m.invalidos ? peiFmt(m.invalidos) : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-chart-simple"></i> Quantos pedidos em cada prazo</h3>
      <p style="color:#64748b;font-size:.85rem;margin:-.25rem 0 1rem">
        Verde é ideal, vermelho é crítico. A linha do 4º dia é o corte.
      </p>
      ${_peiBarras(d.distribuicao || [], d.criterio.ideal_minimo_dias)}
    </div>

    <div class="section-card">
      <h3><i class="fas fa-list"></i> Pedidos (${peiFmt(lista.length)})</h3>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:-.25rem 0 1rem">
        ${[['todos', 'Todos'], ['critico', 'Só críticos'], ['ideal', 'Só ideais'], ['invalido', 'Fora da conta']]
          .map(([k, rot]) => `<button class="btn btn-sm ${_peiFiltroClasse === k ? 'btn-primary' : 'btn-secondary'}"
            onclick="peiFiltrarClasse('${k}')">${rot}</button>`).join('')}
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th style="text-align:center">Entrada</th>
              <th style="text-align:center">Entrega</th>
              <th style="text-align:right">Dias</th>
              <th style="text-align:center">Situação</th>
              <th style="text-align:center">OPs</th>
              <th>Origem da data</th>
            </tr>
          </thead>
          <tbody>
            ${visiveis.length ? visiveis.map(p => _peiLinhaPedido(p)).join('')
              : `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:1.5rem">Nenhum pedido nesse filtro.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${lista.length > visiveis.length ? `
        <div style="text-align:center;margin-top:.85rem">
          <button class="btn btn-secondary btn-sm" onclick="peiVerTodos()">
            Ver os outros ${peiFmt(lista.length - visiveis.length)} pedidos
          </button>
        </div>` : ''}
    </div>

    <div class="section-card" style="background:#f8fafc">
      <h3><i class="fas fa-circle-question"></i> Como este número é calculado</h3>
      <ul style="color:#475569;font-size:.85rem;line-height:1.75;margin:0;padding-left:1.15rem">
        <li><strong>Entrada</strong>: o dia em que o primeiro lote do pedido foi criado no sistema.</li>
        <li><strong>Entrega</strong>: ${peiEscape(d.criterio.data_entrega)}. A data é lida na hora —
            alterar no calendário da Programação de Entregas muda este indicador na próxima busca.</li>
        <li><strong>Ideal</strong>: ${peiEscape(d.criterio.ideal)}.</li>
        <li><strong>Base não é contabilizada.</strong></li>
        <li>Pedido com entrega marcada antes da entrada fica fora do percentual, no filtro
            <em>Fora da conta</em>: é resquício da carga inicial de lotes antigos, não atraso.</li>
      </ul>
    </div>
  `;
}

function _peiBarras(distribuicao, corte) {
  if (!distribuicao.length) return '<p style="color:#94a3b8">Sem dados no período.</p>';
  // Barras acima de 20 dias viram uma faixa única: esticar o eixo até 1100 dias
  // por causa de um pedido deixaria todo o resto ilegível.
  const curtos = distribuicao.filter(x => x.dias <= 20);
  const longos = distribuicao.filter(x => x.dias > 20);
  const somaLongos = longos.reduce((s, x) => s + x.pedidos, 0);
  const itens = curtos.concat(somaLongos ? [{ dias: '20+', pedidos: somaLongos, classificacao: 'ideal' }] : []);
  const max = Math.max(...itens.map(x => x.pedidos), 1);

  return `<div style="display:flex;align-items:flex-end;gap:.3rem;overflow-x:auto;padding-bottom:.35rem;min-height:170px">
    ${itens.map(x => {
      const alt = Math.max(6, Math.round((x.pedidos / max) * 130));
      const ideal = x.dias === '20+' || Number(x.dias) >= corte;
      return `<div style="display:flex;flex-direction:column;align-items:center;min-width:34px;flex:1">
        <div style="font-size:.72rem;color:#475569;font-weight:600">${peiFmt(x.pedidos)}</div>
        <div title="${x.dias} dia(s): ${x.pedidos} pedido(s)"
             style="width:100%;height:${alt}px;border-radius:4px 4px 0 0;background:${ideal ? '#16a34a' : '#dc2626'}"></div>
        <div style="font-size:.7rem;color:#64748b;margin-top:.25rem;white-space:nowrap">${x.dias}d</div>
      </div>`;
    }).join('')}
  </div>`;
}

function _peiLinhaPedido(p) {
  const badge = p.prazo_invalido
    ? '<span class="badge" style="background:#e2e8f0;color:#475569">fora da conta</span>'
    : p.classificacao === 'ideal'
      ? '<span class="badge" style="background:#dcfce7;color:#166534">ideal</span>'
      : '<span class="badge" style="background:#fee2e2;color:#991b1b">crítico</span>';

  const origem = p.origem_data_entrega === 'calendario'
    ? '<span style="color:#2563eb"><i class="fas fa-calendar-check"></i> calendário</span>'
    : p.origem_data_entrega === 'erp'
      ? '<span style="color:#64748b">previsão do ERP</span>'
      : '<span style="color:#94a3b8">previsão do lote</span>';

  return `<tr${p.fora_de_curva ? ' style="background:#fffbeb"' : ''}>
    <td><strong>${peiEscape(p.pedido)}</strong></td>
    <td>${peiEscape(p.cliente)}</td>
    <td style="text-align:center;white-space:nowrap">${peiDataBR(p.entrada)}</td>
    <td style="text-align:center;white-space:nowrap">${peiDataBR(p.entrega)}</td>
    <td style="text-align:right;font-weight:700">${peiFmt(p.dias)}</td>
    <td style="text-align:center">${badge}</td>
    <td style="text-align:center">${peiFmt(p.ops)}</td>
    <td style="font-size:.82rem">${origem}</td>
  </tr>`;
}

function exportPrazoEntregaCSV() {
  if (!_peiData) return;
  const linhas = [['Pedido', 'Cliente', 'Entrada', 'Entrega', 'Dias', 'Situacao', 'OPs', 'Origem da data', 'Alterada no calendario']];
  for (const p of (_peiData.pedidos || [])) {
    linhas.push([
      p.pedido, p.cliente, p.entrada, p.entrega, p.dias,
      p.prazo_invalido ? 'fora da conta' : p.classificacao,
      p.ops, p.origem_data_entrega, p.data_alterada_no_calendario ? 'sim' : 'nao'
    ]);
  }
  // ; como separador e BOM: é o que o Excel em português abre sem perguntar nada.
  const csv = '﻿' + linhas.map(l => l.map(c => {
    const s = String(c == null ? '' : c);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const per = _peiFilters.inicio || _peiFilters.fim ? `_${_peiFilters.inicio || 'inicio'}_a_${_peiFilters.fim || 'hoje'}` : '';
  a.download = `prazo_entrega${per}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
