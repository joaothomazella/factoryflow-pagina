'use strict';

/* global STATE, showToast, escapeHtml, resolveFactoryFlowApiBase, factoryFlowAuthHeaders, fetchWithTimeout */

// Wrapper de fetch autenticado para os endpoints /api/amostras
async function _amFetch(path, options = {}) {
  const base = resolveFactoryFlowApiBase();
  const url  = `${base}${path}`;
  const isJson = !options.method || options.method === 'GET' ? false : true;
  const headers = { ...factoryFlowAuthHeaders(isJson), ...(options.headers || {}) };
  const res = await fetchWithTimeout(url, { ...options, headers }, 10000);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`);
  return json;
}

// ─── STATUS DEFINITIONS ────────────────────────────────────────────────────
const SAMPLE_STATUS = {
  aguardando_inicio:   { label:'Aguardando Início',        color:'#94a3b8', icon:'fa-clock',          group:'em_producao'       },
  em_laboratorio:      { label:'Em Laboratório',            color:'#3b82f6', icon:'fa-microscope',     group:'em_producao'       },
  em_coloracao:        { label:'Em Coloração',              color:'#f59e0b', icon:'fa-palette',        group:'em_producao'       },
  pronta:              { label:'Pronta para Entrega',       color:'#06b6d4', icon:'fa-box-open',       group:'prontas'           },
  aguardando_retorno:  { label:'Aguardando Retorno',        color:'#8b5cf6', icon:'fa-hourglass-half', group:'aguardando_retorno'},
  aprovada:            { label:'Aprovada',                  color:'#22c55e', icon:'fa-check-circle',   group:'aprovadas'         },
  aprovada_aguardando: { label:'Aprovada – Ag. Pedido',     color:'#22c55e', icon:'fa-check-circle',   group:'aprovadas'         },
  reprovada:           { label:'Reprovada',                 color:'#ef4444', icon:'fa-times-circle',   group:'reprovadas'        },
  convertida:          { label:'Convertida em Pedido',      color:'#10b981', icon:'fa-handshake',      group:'convertidas'       },
  nao_convertida:      { label:'Não Convertida',            color:'#64748b', icon:'fa-minus-circle',   group:'nao_convertidas'   },
};

const TECH_REJECTION_REASONS = [
  'Cor fora do padrão',
  'Viscosidade incorreta',
  'Brilho fora do padrão',
  'Tempo de secagem incorreto',
  'Aderência insuficiente',
  'Nivelamento ruim',
  'Outro',
];

const COMM_FAILURE_REASONS = [
  'Preço acima do esperado',
  'Prazo de entrega incompatível',
  'Cliente desistiu',
  'Concorrência',
  'Projeto cancelado',
  'Outro',
];

let _amState = { samples: [], filter: 'todas', search: '', loading: false };

// ─── STATUS HELPERS ────────────────────────────────────────────────────────
function _amStatusKey(row) {
  const setor = (row.setor_atual || '').toLowerCase();
  const tech  = row.technical_result  || 'aguardando';
  const comm  = row.commercial_status || 'aguardando';
  if (comm === 'convertida')                                              return 'convertida';
  if (comm === 'nao_convertida')                                          return 'nao_convertida';
  if (tech === 'reprovada')                                               return 'reprovada';
  if (tech === 'aprovada' && comm === 'aprovada_aguardando_pedido')       return 'aprovada_aguardando';
  if (tech === 'aprovada')                                                return 'aprovada';
  if (row.delivered_at)                                                   return 'aguardando_retorno';
  if (setor === 'pronto')                                                 return 'pronta';
  if (setor === 'laboratorio_amostras')                                   return 'em_laboratorio';
  if (setor === 'coloracao_amostras')                                     return 'em_coloracao';
  if (setor === 'pcp_liberacao')                                          return 'aguardando_inicio';
  return 'em_producao';
}

function _amFilterSamples(samples, filter, search) {
  let list = samples;
  if (filter && filter !== 'todas') {
    list = list.filter(s => (SAMPLE_STATUS[_amStatusKey(s)] || {}).group === filter);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s =>
      (s.op              || '').toLowerCase().includes(q) ||
      (s.produto_nome    || '').toLowerCase().includes(q) ||
      (s.cliente_nome    || '').toLowerCase().includes(q) ||
      (s.requester_name  || '').toLowerCase().includes(q) ||
      (s.numero_pedido   || '').toLowerCase().includes(q)
    );
  }
  return list;
}

// ─── PERMISSION HELPERS ────────────────────────────────────────────────────
function _amCanTech(user) {
  return ['admin','pcp','pcp_lib','laboratorio','manager'].includes(user.role) ||
         (user.role === 'sector' && (user.sector || '').includes('laboratorio'));
}
function _amCanComm(user) {
  return ['admin','pcp','pcp_lib','manager','diretoria','vendor'].includes(user.role);
}
function _amCanDeliver(user) {
  return ['admin','pcp','pcp_lib','manager','diretoria'].includes(user.role);
}

// ─── MAIN RENDER ────────────────────────────────────────────────────────────
async function renderAmostras() {
  const page = document.getElementById('pageAmostras');
  if (!page) return;

  const user     = STATE.currentUser;
  const isVendor = user.role === 'vendor';

  page.innerHTML = `
    <div class="am-container">
      <div class="am-header">
        <div class="am-header-left">
          <h2><i class="fas fa-vial"></i> ${isVendor ? 'Minhas Amostras' : 'Controle de Amostras'}</h2>
          <p class="am-subtitle">${isVendor
            ? 'Acompanhe o status das suas amostras solicitadas'
            : 'Gestão de amostras comerciais e técnicas'}</p>
        </div>
        <div class="am-header-right">
          <input type="search" class="am-search" placeholder="Buscar OP, produto, cliente, solicitante…"
                 value="${escapeHtml(_amState.search)}" oninput="amOnSearch(this.value)" />
          <button class="btn btn-ghost am-btn-refresh" onclick="renderAmostras()" title="Atualizar">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>

      <div id="amKpis" class="am-kpis"></div>

      <div id="amFilterBar" class="am-filter-bar"></div>

      <div id="amList" class="am-list">
        <div class="am-loading"><i class="fas fa-spinner fa-spin"></i> Carregando amostras…</div>
      </div>
    </div>

    <!-- Modal overlay exclusivo das amostras -->
    <div id="amModalOverlay" class="am-modal-overlay" onclick="_amCloseModal()">
      <div id="amModalBox" class="am-modal" onclick="event.stopPropagation()">
        <div id="amModalContent"></div>
      </div>
    </div>
  `;

  _amState.loading = true;
  try {
    const qs      = isVendor ? `?requester_id=${encodeURIComponent(user.id)}` : '';
    const data    = await _amFetch(`/api/amostras${qs}`);
    _amState.samples = data.data || [];
    _amRender();
  } catch (err) {
    const listEl = document.getElementById('amList');
    if (listEl) listEl.innerHTML = `<div class="am-empty"><i class="fas fa-exclamation-triangle"></i> Erro: ${escapeHtml(err.message)}</div>`;
  } finally {
    _amState.loading = false;
  }
}

// ─── RE-RENDER ─────────────────────────────────────────────────────────────
function _amRender() {
  _amRenderKpis();
  _amRenderFilterBar();
  _amRenderList();
}

function _amRenderKpis() {
  const el = document.getElementById('amKpis');
  if (!el) return;
  const totals = {};
  _amState.samples.forEach(s => {
    const g = (SAMPLE_STATUS[_amStatusKey(s)] || {}).group || 'em_producao';
    totals[g] = (totals[g] || 0) + 1;
  });
  const total     = _amState.samples.length;
  const produtivo = totals.em_producao || 0;
  const aprovadas = (totals.aprovadas || 0) + (totals.convertidas || 0);
  const reprov    = totals.reprovadas || 0;
  const convert   = totals.convertidas || 0;

  el.innerHTML = `
    <div class="am-kpi"><span class="am-kpi-num">${total}</span><span class="am-kpi-lbl">Total</span></div>
    <div class="am-kpi am-kpi-blue"><span class="am-kpi-num">${produtivo}</span><span class="am-kpi-lbl">Em Produção</span></div>
    <div class="am-kpi am-kpi-green"><span class="am-kpi-num">${aprovadas}</span><span class="am-kpi-lbl">Aprovadas</span></div>
    <div class="am-kpi am-kpi-red"><span class="am-kpi-num">${reprov}</span><span class="am-kpi-lbl">Reprovadas</span></div>
    <div class="am-kpi am-kpi-emerald"><span class="am-kpi-num">${convert}</span><span class="am-kpi-lbl">Convertidas</span></div>
  `;
}

function _amRenderFilterBar() {
  const el = document.getElementById('amFilterBar');
  if (!el) return;
  const tabs = [
    { key:'todas',             label:'Todas',         icon:'fa-list'          },
    { key:'em_producao',       label:'Em Produção',   icon:'fa-flask'         },
    { key:'prontas',           label:'Prontas',       icon:'fa-box-open'      },
    { key:'aguardando_retorno',label:'Aguardando',    icon:'fa-hourglass-half'},
    { key:'aprovadas',         label:'Aprovadas',     icon:'fa-check-circle'  },
    { key:'reprovadas',        label:'Reprovadas',    icon:'fa-times-circle'  },
    { key:'convertidas',       label:'Convertidas',   icon:'fa-handshake'     },
  ];
  el.innerHTML = tabs.map(t => {
    const cnt    = t.key === 'todas'
      ? _amState.samples.length
      : _amState.samples.filter(s => (SAMPLE_STATUS[_amStatusKey(s)] || {}).group === t.key).length;
    const active = _amState.filter === t.key ? ' am-tab-active' : '';
    return `<button class="am-tab${active}" onclick="amSetFilter('${t.key}')">
      <i class="fas ${t.icon}"></i> ${t.label}${cnt ? ` <span class="am-tab-cnt">${cnt}</span>` : ''}
    </button>`;
  }).join('');
}

function _amRenderList() {
  const el = document.getElementById('amList');
  if (!el) return;
  const filtered = _amFilterSamples(_amState.samples, _amState.filter, _amState.search);
  if (!filtered.length) {
    el.innerHTML = `<div class="am-empty"><i class="fas fa-search"></i> Nenhuma amostra encontrada.</div>`;
    return;
  }
  el.innerHTML = filtered.map(s => _amRenderCard(s)).join('');
}

// ─── CARD ───────────────────────────────────────────────────────────────────
function _amRenderCard(s) {
  const user   = STATE.currentUser;
  const sk     = _amStatusKey(s);
  const st     = SAMPLE_STATUS[sk] || SAMPLE_STATUS.em_laboratorio;
  const setor  = (s.setor_atual || '').toLowerCase();

  // Timeline steps
  const steps = [
    { label:'PCP',         done: true,                                                                          current: setor === 'pcp_liberacao'        },
    { label:'Laboratório', done: ['laboratorio_amostras','coloracao_amostras','pronto'].includes(setor) || s.technical_result !== 'aguardando', current: setor === 'laboratorio_amostras' },
    { label:'Coloração',   done: ['coloracao_amostras','pronto'].includes(setor) || s.technical_result !== 'aguardando', current: setor === 'coloracao_amostras'   },
    { label:'Pronto',      done: setor === 'pronto' || !!s.delivered_at,                                        current: setor === 'pronto'               },
    { label:'Resultado',   done: s.technical_result !== 'aguardando',                                           current: false                            },
  ];

  const showTech     = _amCanTech(user)    && s.technical_result === 'aguardando' && ['laboratorio_amostras','pronto'].includes(setor);
  const showComm     = _amCanComm(user)    && s.technical_result === 'aprovada'   && s.commercial_status === 'aguardando';
  const showDeliver  = _amCanDeliver(user) && setor === 'pronto'                  && !s.delivered_at;

  const dtCriado = s.criado_em ? new Date(s.criado_em).toLocaleDateString('pt-BR') : '—';
  const sid      = s.sample_id || null;
  const bid      = s.bridge_id;

  return `
    <div class="am-card" onclick="amOpenDetail(${bid})">
      <div class="am-card-header">
        <div class="am-card-info">
          <div class="am-card-op">OP ${escapeHtml(s.op || s.numero_pedido || '—')}</div>
          <div class="am-card-product">${escapeHtml(s.produto_nome || '—')}</div>
          <div class="am-card-client"><i class="fas fa-building"></i> ${escapeHtml(s.cliente_nome || '—')}</div>
        </div>
        <div class="am-card-badge" style="background:${st.color}20;color:${st.color};border:1px solid ${st.color}40">
          <i class="fas ${st.icon}"></i> ${st.label}
        </div>
      </div>

      <div class="am-card-timeline">
        ${steps.map((step, i) => `
          <div class="am-tl-step${step.done ? ' am-tl-done' : ''}${step.current ? ' am-tl-current' : ''}">
            <div class="am-tl-dot"></div>
            ${i < steps.length - 1 ? '<div class="am-tl-line"></div>' : ''}
            <div class="am-tl-lbl">${step.label}</div>
          </div>
        `).join('')}
      </div>

      <div class="am-card-footer">
        ${s.requester_name ? `<span class="am-meta"><i class="fas fa-user-tie"></i> ${escapeHtml(s.requester_name)}</span>` : ''}
        <span class="am-meta"><i class="fas fa-calendar-alt"></i> ${dtCriado}</span>
        ${s.quantidade ? `<span class="am-meta"><i class="fas fa-weight-hanging"></i> ${s.quantidade} kg</span>` : ''}
        ${s.application ? `<span class="am-meta"><i class="fas fa-tag"></i> ${escapeHtml(s.application)}</span>` : ''}
        <div class="am-card-actions" onclick="event.stopPropagation()">
          ${showTech    ? `<button class="btn btn-xs btn-primary" onclick="amOpenTechResult(${sid},${bid})"><i class="fas fa-flask"></i> Resultado Técnico</button>`        : ''}
          ${showComm    ? `<button class="btn btn-xs btn-success" onclick="amOpenCommResult(${sid},${bid})"><i class="fas fa-handshake"></i> Resultado Comercial</button>`  : ''}
          ${showDeliver ? `<button class="btn btn-xs btn-info"    onclick="amMarkDelivered(${sid},${bid},event)"><i class="fas fa-truck"></i> Marcar Entregue</button>`    : ''}
        </div>
      </div>
    </div>
  `;
}

// ─── FILTER / SEARCH ────────────────────────────────────────────────────────
function amOnSearch(val) {
  _amState.search = val;
  _amRender();
}

function amSetFilter(filter) {
  _amState.filter = filter;
  _amRender();
}

// ─── MODAL HELPERS ──────────────────────────────────────────────────────────
function _amShowModal(html) {
  const overlay = document.getElementById('amModalOverlay');
  const box     = document.getElementById('amModalContent');
  if (!overlay || !box) return;
  box.innerHTML = html;
  overlay.classList.add('am-modal-open');
}

function _amCloseModal() {
  const overlay = document.getElementById('amModalOverlay');
  if (overlay) overlay.classList.remove('am-modal-open');
}

// ─── DETAIL VIEW ────────────────────────────────────────────────────────────
async function amOpenDetail(bridgeId) {
  _amShowModal('<div class="am-modal-loading"><i class="fas fa-spinner fa-spin"></i> Carregando…</div>');
  try {
    const data = await _amFetch(`/api/amostras/${bridgeId}`);
    const s    = data.data;
    const user = STATE.currentUser;
    const sk   = _amStatusKey(s);
    const st   = SAMPLE_STATUS[sk] || SAMPLE_STATUS.em_laboratorio;
    const setor = (s.setor_atual || '').toLowerCase();

    const showTech    = _amCanTech(user)    && s.technical_result === 'aguardando' && ['laboratorio_amostras','pronto'].includes(setor);
    const showComm    = _amCanComm(user)    && s.technical_result === 'aprovada'   && s.commercial_status === 'aguardando';
    const showDeliver = _amCanDeliver(user) && setor === 'pronto'                  && !s.delivered_at;

    const sid = s.id || null;
    const bid = s.bridge_id;

    const history = (s.history || []).map(h => `
      <div class="am-hist-item">
        <div class="am-hist-dot"></div>
        <div>
          <div class="am-hist-action">${escapeHtml(h.action)}</div>
          <div class="am-hist-meta">${h.user_name ? escapeHtml(h.user_name) + ' · ' : ''}${h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : ''}</div>
        </div>
      </div>
    `).join('');

    _amShowModal(`
      <div class="am-detail">
        <div class="am-detail-head">
          <div>
            <h3><i class="fas fa-vial"></i> OP ${escapeHtml(s.op || s.numero_pedido || '—')}</h3>
            <div class="am-card-badge" style="background:${st.color}20;color:${st.color};border:1px solid ${st.color}40;display:inline-flex;margin-top:4px">
              <i class="fas ${st.icon}"></i> ${st.label}
            </div>
          </div>
          <button class="am-detail-close" onclick="_amCloseModal()"><i class="fas fa-times"></i></button>
        </div>

        <div class="am-detail-body">
          <div class="am-detail-col">
            <div class="am-detail-section">
              <h4>Lote</h4>
              ${_amDetailRow('OP', s.op)}
              ${_amDetailRow('Pedido', s.numero_pedido)}
              ${_amDetailRow('Produto', s.produto_nome)}
              ${_amDetailRow('Quantidade', s.quantidade ? s.quantidade + ' kg' : null)}
              ${_amDetailRow('Cliente', s.cliente_nome)}
              ${_amDetailRow('Setor atual', s.setor_atual)}
              ${_amDetailRow('Previsão entrega', s.previsao_entrega ? new Date(s.previsao_entrega).toLocaleDateString('pt-BR') : null)}
            </div>
            <div class="am-detail-section">
              <h4>Amostra</h4>
              ${_amDetailRow('Solicitante', s.requester_name)}
              ${_amDetailRow('Aplicação', s.application)}
              ${_amDetailRow('Prioridade', s.priority)}
              ${s.delivered_at ? _amDetailRow('Entregue em', new Date(s.delivered_at).toLocaleDateString('pt-BR')) : ''}
            </div>
          </div>

          <div class="am-detail-col">
            ${s.technical_result !== 'aguardando' ? `
            <div class="am-detail-section">
              <h4>Resultado Técnico</h4>
              ${_amDetailRow('Resultado', s.technical_result === 'aprovada' ? '✓ Aprovada' : '✗ Reprovada', s.technical_result === 'aprovada' ? '#22c55e' : '#ef4444')}
              ${s.technical_result_at ? _amDetailRow('Data', new Date(s.technical_result_at).toLocaleDateString('pt-BR')) : ''}
              ${_amDetailRow('Motivo', s.technical_rejection_reason)}
              ${_amDetailRow('Observações', s.technical_feedback_notes)}
            </div>` : ''}

            ${s.commercial_status !== 'aguardando' ? `
            <div class="am-detail-section">
              <h4>Resultado Comercial</h4>
              ${_amDetailRow('Status', s.commercial_status)}
              ${s.commercial_result_at ? _amDetailRow('Data', new Date(s.commercial_result_at).toLocaleDateString('pt-BR')) : ''}
              ${_amDetailRow('Pedido gerado', s.generated_order_number)}
              ${_amDetailRow('Motivo', s.commercial_failure_reason)}
            </div>` : ''}

            ${history ? `
            <div class="am-detail-section">
              <h4>Histórico</h4>
              <div class="am-hist-list">${history}</div>
            </div>` : ''}
          </div>
        </div>

        <div class="am-detail-actions">
          ${showTech    ? `<button class="btn btn-primary"  onclick="amOpenTechResult(${sid},${bid})"><i class="fas fa-flask"></i> Resultado Técnico</button>`       : ''}
          ${showComm    ? `<button class="btn btn-success"  onclick="amOpenCommResult(${sid},${bid})"><i class="fas fa-handshake"></i> Resultado Comercial</button>` : ''}
          ${showDeliver ? `<button class="btn btn-info"     onclick="amMarkDelivered(${sid},${bid},null)"><i class="fas fa-truck"></i> Marcar Entregue</button>`     : ''}
          <button class="btn btn-ghost" onclick="_amCloseModal()">Fechar</button>
        </div>
      </div>
    `);
  } catch (err) {
    _amShowModal(`<div class="am-modal-err"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(err.message)}<br><button class="btn btn-ghost" onclick="_amCloseModal()">Fechar</button></div>`);
  }
}

function _amDetailRow(label, value, color) {
  if (!value && value !== 0) return '';
  const style = color ? ` style="color:${color};font-weight:600"` : '';
  return `<div class="am-detail-row"><span>${label}</span><strong${style}>${escapeHtml(String(value))}</strong></div>`;
}

// ─── TECHNICAL RESULT ───────────────────────────────────────────────────────
async function amOpenTechResult(sampleId, bridgeId) {
  let sid = sampleId;
  if (!sid) {
    try {
      const lot = _amState.samples.find(s => s.bridge_id === bridgeId) || {};
      const res = await _amFetch('/api/amostras/upsert', {
        method: 'POST',
  
        body: JSON.stringify({ bridge_id: bridgeId, op: lot.op, numero_pedido: lot.numero_pedido }),
      });
      sid = res.data.id;
    } catch (e) {
      showToast('Erro ao criar registro de amostra', 'error');
      return;
    }
  }

  const reasonOptions = TECH_REJECTION_REASONS.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');

  _amShowModal(`
    <div class="am-form">
      <div class="am-form-head">
        <h3><i class="fas fa-flask"></i> Resultado Técnico</h3>
        <button class="am-detail-close" onclick="_amCloseModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="am-form-body">
        <div class="am-form-group">
          <label>Resultado *</label>
          <div class="am-result-btns">
            <button class="am-result-btn am-result-approve" id="amTechApprove" onclick="_amTechSelect('aprovada')">
              <i class="fas fa-check-circle"></i> Aprovada
            </button>
            <button class="am-result-btn am-result-reject" id="amTechReject" onclick="_amTechSelect('reprovada')">
              <i class="fas fa-times-circle"></i> Reprovada
            </button>
          </div>
          <input type="hidden" id="amTechResultVal" value="" />
        </div>
        <div class="am-form-group" id="amTechReasonWrap" style="display:none">
          <label>Motivo da reprovação *</label>
          <select id="amTechReason" class="am-input">
            <option value="">Selecione…</option>
            ${reasonOptions}
          </select>
        </div>
        <div class="am-form-group">
          <label>Observações técnicas</label>
          <textarea id="amTechNotes" class="am-input am-textarea" rows="3" placeholder="Notas do laboratório…"></textarea>
        </div>
      </div>
      <div class="am-form-footer">
        <button class="btn btn-ghost" onclick="_amCloseModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="_amSaveTechResult(${sid}, ${bridgeId})">
          <i class="fas fa-save"></i> Salvar Resultado
        </button>
      </div>
    </div>
  `);
}

function _amTechSelect(val) {
  document.getElementById('amTechResultVal').value = val;
  document.getElementById('amTechApprove').classList.toggle('am-result-selected', val === 'aprovada');
  document.getElementById('amTechReject').classList.toggle('am-result-selected', val === 'reprovada');
  document.getElementById('amTechReasonWrap').style.display = val === 'reprovada' ? '' : 'none';
}

async function _amSaveTechResult(sampleId, bridgeId) {
  const result = document.getElementById('amTechResultVal')?.value;
  if (!result) { showToast('Selecione o resultado', 'warning'); return; }
  const reason = document.getElementById('amTechReason')?.value || '';
  const notes  = document.getElementById('amTechNotes')?.value  || '';
  if (result === 'reprovada' && !reason) { showToast('Informe o motivo da reprovação', 'warning'); return; }

  const user = STATE.currentUser;
  try {
    await _amFetch(`/api/amostras/${sampleId}`, {
      method: 'PATCH',

      body: JSON.stringify({
        technical_result:            result,
        technical_rejection_reason:  reason || null,
        technical_feedback_notes:    notes  || null,
      }),
    });
    await _amFetch(`/api/amostras/${sampleId}/history`, {
      method: 'POST',

      body: JSON.stringify({
        action:    `Resultado técnico registrado: ${result === 'aprovada' ? 'Aprovada' : 'Reprovada'}${reason ? ' – ' + reason : ''}`,
        user_id:   String(user.id),
        user_name: user.name,
      }),
    });
    showToast('Resultado técnico salvo!', 'success');
    _amCloseModal();
    await _amRefresh();
  } catch (err) {
    showToast('Erro ao salvar resultado: ' + err.message, 'error');
  }
}

// ─── COMMERCIAL RESULT ──────────────────────────────────────────────────────
async function amOpenCommResult(sampleId, bridgeId) {
  let sid = sampleId;
  if (!sid) {
    try {
      const lot = _amState.samples.find(s => s.bridge_id === bridgeId) || {};
      const res = await _amFetch('/api/amostras/upsert', {
        method: 'POST',
  
        body: JSON.stringify({ bridge_id: bridgeId, op: lot.op, numero_pedido: lot.numero_pedido }),
      });
      sid = res.data.id;
    } catch (e) {
      showToast('Erro ao criar registro de amostra', 'error');
      return;
    }
  }

  const failOptions = COMM_FAILURE_REASONS.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');

  _amShowModal(`
    <div class="am-form">
      <div class="am-form-head">
        <h3><i class="fas fa-handshake"></i> Resultado Comercial</h3>
        <button class="am-detail-close" onclick="_amCloseModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="am-form-body">
        <div class="am-form-group">
          <label>O cliente converteu em pedido? *</label>
          <div class="am-result-btns">
            <button class="am-result-btn am-result-approve" id="amCommYes" onclick="_amCommSelect('convertida')">
              <i class="fas fa-check-circle"></i> Sim, gerou pedido
            </button>
            <button class="am-result-btn am-result-reject" id="amCommNo" onclick="_amCommSelect('nao_convertida')">
              <i class="fas fa-times-circle"></i> Não converteu
            </button>
            <button class="am-result-btn" id="amCommPending" onclick="_amCommSelect('aprovada_aguardando_pedido')"
                    style="border-color:#f59e0b;color:#f59e0b">
              <i class="fas fa-hourglass-half"></i> Aprovado, aguardando pedido
            </button>
          </div>
          <input type="hidden" id="amCommResultVal" value="" />
        </div>
        <div class="am-form-group" id="amCommOrderWrap" style="display:none">
          <label>Número do pedido gerado</label>
          <input type="text" id="amCommOrderNum" class="am-input" placeholder="Ex: 00001234" />
        </div>
        <div class="am-form-group" id="amCommFailWrap" style="display:none">
          <label>Motivo da não conversão</label>
          <select id="amCommFail" class="am-input">
            <option value="">Selecione…</option>
            ${failOptions}
          </select>
        </div>
      </div>
      <div class="am-form-footer">
        <button class="btn btn-ghost" onclick="_amCloseModal()">Cancelar</button>
        <button class="btn btn-success" onclick="_amSaveCommResult(${sid}, ${bridgeId})">
          <i class="fas fa-save"></i> Salvar Resultado
        </button>
      </div>
    </div>
  `);
}

function _amCommSelect(val) {
  document.getElementById('amCommResultVal').value = val;
  ['amCommYes','amCommNo','amCommPending'].forEach(id => {
    document.getElementById(id)?.classList.remove('am-result-selected');
  });
  const map = { convertida:'amCommYes', nao_convertida:'amCommNo', aprovada_aguardando_pedido:'amCommPending' };
  document.getElementById(map[val])?.classList.add('am-result-selected');
  document.getElementById('amCommOrderWrap').style.display = val === 'convertida' ? '' : 'none';
  document.getElementById('amCommFailWrap').style.display  = val === 'nao_convertida' ? '' : 'none';
}

async function _amSaveCommResult(sampleId, bridgeId) {
  const status  = document.getElementById('amCommResultVal')?.value;
  if (!status) { showToast('Selecione o resultado', 'warning'); return; }
  const orderNum = document.getElementById('amCommOrderNum')?.value || '';
  const failReason = document.getElementById('amCommFail')?.value || '';

  const user = STATE.currentUser;
  try {
    await _amFetch(`/api/amostras/${sampleId}`, {
      method: 'PATCH',

      body: JSON.stringify({
        commercial_status:        status,
        generated_order_number:   orderNum  || null,
        commercial_failure_reason: failReason || null,
      }),
    });
    const actionLabel = { convertida:'Convertida em pedido', nao_convertida:'Não convertida', aprovada_aguardando_pedido:'Aprovada – aguardando pedido' };
    await _amFetch(`/api/amostras/${sampleId}/history`, {
      method: 'POST',

      body: JSON.stringify({
        action:    `Resultado comercial: ${actionLabel[status] || status}${orderNum ? ' – Pedido ' + orderNum : ''}${failReason ? ' – ' + failReason : ''}`,
        user_id:   String(user.id),
        user_name: user.name,
      }),
    });
    showToast('Resultado comercial salvo!', 'success');
    _amCloseModal();
    await _amRefresh();
  } catch (err) {
    showToast('Erro ao salvar resultado: ' + err.message, 'error');
  }
}

// ─── MARK DELIVERED ─────────────────────────────────────────────────────────
async function amMarkDelivered(sampleId, bridgeId, evt) {
  if (evt) evt.stopPropagation();

  let sid = sampleId;
  if (!sid) {
    try {
      const lot = _amState.samples.find(s => s.bridge_id === bridgeId) || {};
      const res = await _amFetch('/api/amostras/upsert', {
        method: 'POST',
  
        body: JSON.stringify({ bridge_id: bridgeId, op: lot.op }),
      });
      sid = res.data.id;
    } catch (e) {
      showToast('Erro ao criar registro de amostra', 'error');
      return;
    }
  }

  const user = STATE.currentUser;
  try {
    await _amFetch(`/api/amostras/${sid}`, {
      method: 'PATCH',

      body: JSON.stringify({ delivered_at: 'NOW()' }),
    });
    await _amFetch(`/api/amostras/${sid}/history`, {
      method: 'POST',

      body: JSON.stringify({
        action:    'Amostra marcada como entregue ao cliente',
        user_id:   String(user.id),
        user_name: user.name,
      }),
    });
    showToast('Amostra marcada como entregue!', 'success');
    _amCloseModal();
    await _amRefresh();
  } catch (err) {
    showToast('Erro ao marcar entregue: ' + err.message, 'error');
  }
}

// ─── REFRESH ────────────────────────────────────────────────────────────────
async function _amRefresh() {
  const user     = STATE.currentUser;
  const isVendor = user.role === 'vendor';
  const qs       = isVendor ? `?requester_id=${encodeURIComponent(user.id)}` : '';
  try {
    const data = await _amFetch(`/api/amostras${qs}`);
    _amState.samples = data.data || [];
    _amRender();
  } catch (_) { /* silently fail */ }
}
