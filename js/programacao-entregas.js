// ===================================================
// PROGRAMACAO-ENTREGAS.JS – Programação de Entregas POR PEDIDO
// VISÃO GLOBAL: todos os usuários veem todos os pedidos programados.
// Não filtra por setor/role. Permissão só controla edição da data.
// ===================================================

'use strict';

let _peYear  = new Date().getFullYear();
let _peMonth = new Date().getMonth();
let _peDayPanel = null;

const PE_MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];
const PE_DAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// ===================================================
// HELPERS GERAIS
// ===================================================
function _peNormalizeDate(value) {
  if (!value) return '';
  if (typeof normalizeMysqlDate === 'function') return normalizeMysqlDate(value);

  const s = String(value).trim();
  if (!s || s === '0000-00-00' || s === 'null' || s === 'undefined') return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return '';
}

function _peFmtDate(d) {
  if (!d || d === '–') return '–';
  const s = String(d);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return s;
  return `${day}/${m}/${y}`;
}

function _pePedidoKeyFromLot(lot) {
  return String(
    lot?.orderNumber ||
    lot?.pedido ||
    lot?.pits_numero ||
    lot?.pedidoNumero ||
    lot?.raw_mysql?.numero_pedido ||
    ''
  ).trim();
}

function _peLotDate(lot) {
  if (!lot) return '';

  if (typeof getEffectiveDeliveryDate === 'function') {
    const d = _peNormalizeDate(getEffectiveDeliveryDate(lot));
    if (d) return d;
  }

  return (
    _peNormalizeDate(lot.deliveryDateManual) ||
    _peNormalizeDate(lot.deliveryDate) ||
    _peNormalizeDate(lot.pits_previsao) ||
    _peNormalizeDate(lot.previsao_entrega) ||
    _peNormalizeDate(lot.data_entrega) ||
    _peNormalizeDate(lot.entrega) ||
    _peNormalizeDate(lot.raw_mysql?.deliveryDate) ||
    _peNormalizeDate(lot.raw_mysql?.pits_previsao) ||
    _peNormalizeDate(lot.raw_mysql?.previsao_entrega) ||
    _peNormalizeDate(lot.raw_mysql?.data_entrega) ||
    _peNormalizeDate(lot.raw_mysql?.pits_previsao_formatada) ||
    ''
  );
}

function _peIsRelevantLot(lot) {
  if (!lot || lot.rejected) return false;

  const sector = String(lot.sector || '').toLowerCase();
  const status = String(lot.status || lot.mysql_status || '').toLowerCase();

  if (['cancelado','rejeitado'].includes(sector)) return false;
  if (['cancelado','rejeitado'].includes(status)) return false;

  return true;
}

function _peOrderStatus(lots) {
  if (!lots || lots.length === 0) return 'open';

  if (lots.every(l => String(l.sector || '').toLowerCase() === 'entregue')) return 'delivered';

  if (lots.some(l =>
    String(l.sector || '').toLowerCase() === 'entrega' ||
    String(l.status || l.mysql_status || '').toLowerCase() === 'em_rota'
  )) return 'in_delivery';

  if (lots.every(l => ['pronto','entregue'].includes(String(l.sector || '').toLowerCase()))) return 'ready';

  return 'in_production';
}

function _peStatusLabel(status) {
  const map = {
    open: 'Aberto',
    in_production: 'Em Produção',
    ready: 'Pronto',
    in_delivery: 'Em Rota',
    delivered: 'Entregue'
  };
  return map[status] || status || '–';
}

function _peStatusClass(status) {
  const map = {
    open: 'pe-status-idle',
    in_production: 'pe-status-working',
    ready: 'pe-status-ready',
    in_delivery: 'pe-status-delivery',
    delivered: 'pe-status-delivered'
  };
  return map[status] || 'pe-status-idle';
}

function _pePriority(order, lots) {
  const all = [
    order?.priority,
    ...(lots || []).map(l => l.priority)
  ].filter(Boolean);

  if (all.includes('sameday')) return 'sameday';
  if (all.includes('urgent')) return 'urgent';
  return 'normal';
}

// ===================================================
// FONTE GLOBAL DOS PEDIDOS
// IMPORTANTE: não usa getLotsForUser(), não filtra por setor.
// Todos os usuários veem todos os pedidos.
// ===================================================
function _peGetAllLotsGlobal() {
  return (STATE.lots || []).filter(_peIsRelevantLot);
}

function _peBuildOrdersFromAllLots() {
  const grouped = new Map();

  _peGetAllLotsGlobal().forEach(lot => {
    const pedido = _pePedidoKeyFromLot(lot);
    if (!pedido) return;

    if (!grouped.has(pedido)) grouped.set(pedido, []);
    grouped.get(pedido).push(lot);
  });

  const ordersFromLots = [];

  grouped.forEach((lots, pedido) => {
    const first = lots[0] || {};
    const date = lots.map(_peLotDate).find(Boolean) || '';

    if (!date) return;

    const status = _peOrderStatus(lots);

    // Por padrão não mostra pedido totalmente entregue/finalizado na programação.
    // Se quiser mostrar também entregues, remova este if.
    if (status === 'delivered') return;

    ordersFromLots.push({
      id: 'bridge_order_' + pedido,
      number: pedido,
      orderNumber: pedido,
      client: first.client || first.raw_mysql?.cliente_nome || '',
      city: first.city || first.raw_mysql?.cliente_cidade || '',
      address: first.address || first.raw_mysql?.cliente_endereco || '',
      deliveryDate: date,
      priority: _pePriority({}, lots),
      status,
      createdAt: Math.min(...lots.map(l => Number(l.createdAt) || Date.now())),
      lotIds: lots.map(l => l.id),
      _source: 'mysql',
      _lots: lots,
      _deliveryDate: date,
      _status: status,
      _priority: _pePriority({}, lots)
    });
  });

  return ordersFromLots;
}

function _peGetOrdersGlobal() {
  // Reconstrói SEMPRE a agenda por todos os lotes do STATE.
  // Isso evita que usuário de laboratório veja só os lotes do laboratório.
  return _peBuildOrdersFromAllLots();
}

// ===================================================
// RENDER PRINCIPAL
// ===================================================
function renderProgramacaoEntregas() {
  const page = document.getElementById('pageProgramacaoEntregas');
  if (!page) return;

  const user = STATE.currentUser;
  const canEdit = user && ['admin','pcp','pcp_lib'].includes(String(user.role || '').toLowerCase());

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-calendar-alt"></i> Programação de Entregas</h2>
      <div class="header-actions">
        <span class="pe-perm-badge"><i class="fas fa-eye"></i> Visão geral</span>
        ${canEdit ? `<span class="pe-perm-badge"><i class="fas fa-edit"></i> Pode editar datas</span>` : ''}
        <button class="btn btn-secondary" onclick="_peToday()" title="Ir para hoje">
          <i class="fas fa-crosshairs"></i> Hoje
        </button>
      </div>
    </div>

    <div class="pe-layout" id="peLayout">
      <div class="pe-calendar-col" id="peCalendarCol">
        ${_buildCalendar(_peYear, _peMonth)}
      </div>

      <div class="pe-day-panel" id="peDayPanel">
        <div class="pe-day-panel-empty">
          <i class="fas fa-hand-pointer pe-day-empty-icon"></i>
          <p>Clique em um dia no calendário para ver todos os pedidos programados.</p>
        </div>
      </div>
    </div>
  `;
}

// ===================================================
// CALENDÁRIO
// ===================================================
function _buildCalendar(year, month) {
  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = _getOrdersByDeliveryDay(year, month);

  const header = PE_DAYS_PT.map(d => `<div class="pe-cal-head">${d}</div>`).join('');
  let cells = '';

  for (let i = 0; i < firstDay; i++) {
    cells += `<div class="pe-cal-cell pe-cal-empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === today;
    const orders = byDay[dateStr] || [];
    const count = orders.length;
    const hasLate = orders.some(o => o._isLate);
    const hasUrgent = orders.some(o => o._priority !== 'normal');
    const isActive = _peDayPanel === dateStr;

    cells += `
      <div class="pe-cal-cell ${isToday?'pe-today':''} ${count>0?'pe-has-lots':''} ${hasLate?'pe-has-late':''} ${isActive?'pe-active-day':''}"
           onclick="openDeliveryDay('${dateStr}')"
           title="${dateStr}${count>0?' – '+count+' pedido'+(count>1?'s':''):''}">
        <div class="pe-cal-day-num">${d}</div>
        ${count > 0 ? `
          <div class="pe-cal-count">
            ${count} pedido${count>1?'s':''}
            ${hasUrgent ? '<span class="pe-cal-dot pe-dot-urgent"></span>' : ''}
            ${hasLate   ? '<span class="pe-cal-dot pe-dot-late"></span>'   : ''}
          </div>` : ''}
      </div>`;
  }

  const totalCells = firstDay + daysInMonth;
  const remainder = totalCells % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      cells += `<div class="pe-cal-cell pe-cal-empty"></div>`;
    }
  }

  return `
    <div class="pe-cal-nav">
      <button class="btn pe-nav-btn" onclick="_peNavMonth(-1)">
        <i class="fas fa-chevron-left"></i>
      </button>
      <h3 class="pe-cal-title">${PE_MONTHS_PT[month]} ${year}</h3>
      <button class="btn pe-nav-btn" onclick="_peNavMonth(1)">
        <i class="fas fa-chevron-right"></i>
      </button>
    </div>
    <div class="pe-cal-grid">
      ${header}
      ${cells}
    </div>
  `;
}

function _getOrdersByDeliveryDay(year, month) {
  const today = new Date().toISOString().split('T')[0];
  const result = {};
  const prefix = `${year}-${String(month + 1).padStart(2,'0')}`;

  _peGetOrdersGlobal().forEach(order => {
    const date = order._deliveryDate || order.deliveryDate;
    if (!date || !date.startsWith(prefix)) return;

    if (!result[date]) result[date] = [];
    result[date].push({
      ...order,
      _isLate: date < today && order._status !== 'delivered'
    });
  });

  return result;
}

// ===================================================
// PAINEL DO DIA
// ===================================================
function openDeliveryDay(dateStr) {
  _peDayPanel = dateStr;

  document.querySelectorAll('.pe-cal-cell').forEach(el => el.classList.remove('pe-active-day'));
  const clicked = document.querySelector(`.pe-cal-cell[title^="${dateStr}"]`);
  if (clicked) clicked.classList.add('pe-active-day');

  const panel = document.getElementById('peDayPanel');
  if (!panel) return;

  const today = new Date().toISOString().split('T')[0];
  const orders = _peGetOrdersGlobal().filter(order => order._deliveryDate === dateStr);

  const [y, m, d] = dateStr.split('-');
  const label = `${d}/${m}/${y}`;
  const isToday = dateStr === today;
  const isPast = dateStr < today;

  const user = STATE.currentUser;
  const canEditDate = user && ['admin','pcp','pcp_lib'].includes(String(user.role || '').toLowerCase());

  if (orders.length === 0) {
    panel.innerHTML = `
      <div class="pe-panel-header">
        <div class="pe-panel-date">
          <i class="fas fa-calendar-day"></i>
          <strong>${label}</strong>
          ${isToday ? `<span class="pe-today-chip">Hoje</span>` : ''}
          ${isPast  ? `<span class="pe-past-chip">Passado</span>` : ''}
        </div>
      </div>
      <div class="pe-panel-empty">
        <i class="fas fa-calendar-check" style="font-size:2rem;color:var(--text3);margin-bottom:.6rem"></i>
        <p>Nenhum pedido programado para este dia.</p>
      </div>`;
    return;
  }

  const sorted = [...orders].sort((a, b) => {
    const po = { sameday: 0, urgent: 1, normal: 2 };
    return (po[a._priority] ?? 2) - (po[b._priority] ?? 2);
  });

  panel.innerHTML = `
    <div class="pe-panel-header">
      <div class="pe-panel-date">
        <i class="fas fa-calendar-day"></i>
        <strong>${label}</strong>
        ${isToday ? `<span class="pe-today-chip">Hoje</span>` : ''}
        ${isPast  ? `<span class="pe-past-chip">Passado</span>` : ''}
      </div>
      <div class="pe-panel-count">
        ${orders.length} pedido${orders.length > 1 ? 's' : ''}
      </div>
    </div>
    <div class="pe-panel-list">
      ${sorted.map(order => _buildDayPanelOrderRow(order, canEditDate)).join('')}
    </div>
  `;
}

function _buildDayPanelOrderRow(order, canEditDate) {
  const pColors = { normal:'#22c55e', urgent:'#f59e0b', sameday:'#ef4444' };
  const pLabels = { normal:'Normal', urgent:'Urgente', sameday:'Mesmo Dia' };

  const lots = order._lots || [];
  const effDate = order._deliveryDate || order.deliveryDate || '';
  const priority = order._priority || 'normal';
  const status = order._status || order.status || 'open';
  const pedido = String(order.number || order.orderNumber || order.id || '')
    .replace(/^bridge_order_/, '')
    .trim();

  const lotLines = lots.map(lot => {
    const sector = SECTOR_LABELS[lot.sector] || lot.sector || '–';
    const tipo = PRODUCT_TYPES[lot.productType] || lot.productType || 'Lote';
    return `
      <div class="pe-order-lot-line" style="display:grid;grid-template-columns:.8fr .9fr 1.2fr;gap:.45rem;font-size:.74rem;color:var(--text2);padding:.18rem 0;border-top:1px solid rgba(148,163,184,.12)">
        <span>#${escapeHtml(lot.number || lot.op || '–')}</span>
        <span>${escapeHtml(tipo)}</span>
        <span>${escapeHtml(sector)}</span>
      </div>`;
  }).join('');

  const dateEditBlock = canEditDate ? `
    <div class="pe-row-date-edit" id="peDateEdit_${pedido}">
      <div class="pe-date-row">
        <span class="pe-date-label">
          <i class="fas fa-calendar-alt"></i>
          Entrega: <strong>${effDate ? _peFmtDate(effDate) : '–'}</strong>
        </span>
        <button class="btn pe-btn-edit-date" onclick="_peToggleDateInput('${pedido}')"
          title="Alterar data de entrega do pedido">
          <i class="fas fa-edit"></i>
        </button>
      </div>
      <div class="pe-date-input-row" id="peDateInputRow_${pedido}" style="display:none">
        <input type="date" id="peDateInput_${pedido}"
          class="pe-date-input"
          value="${effDate || ''}"
          min="${new Date().toISOString().split('T')[0]}" />
        <button class="btn pe-btn-save-date" onclick="updateOrderDeliveryDate('${pedido}')">
          <i class="fas fa-check"></i> Salvar
        </button>
        <button class="btn btn-secondary pe-btn-cancel-date" onclick="_peToggleDateInput('${pedido}')">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>` : `
    <div class="pe-date-row" style="margin-top:.5rem">
      <span class="pe-date-label">
        <i class="fas fa-calendar-alt"></i>
        Entrega: <strong>${effDate ? _peFmtDate(effDate) : '–'}</strong>
      </span>
    </div>`;

  return `
    <div class="pe-row pe-order-row">
      <div class="pe-row-top">
        <div class="pe-row-id">
          <span class="pe-row-num">Pedido #${escapeHtml(pedido || '–')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.4rem">
          <span class="pe-priority-dot" style="background:${pColors[priority] || '#22c55e'}" title="${pLabels[priority] || 'Normal'}"></span>
          <span class="pe-status-badge ${_peStatusClass(status)}">${_peStatusLabel(status)}</span>
        </div>
      </div>

      <div class="pe-row-client">
        <i class="fas fa-building"></i> ${escapeHtml(order.client || '–')}
      </div>

      <div class="pe-row-status-row">
        <span><i class="fas fa-layer-group"></i> ${lots.length} lote${lots.length !== 1 ? 's' : ''}</span>
        ${order.city ? `<span class="pe-city"><i class="fas fa-map-pin"></i> ${escapeHtml(order.city)}</span>` : ''}
      </div>

      ${lotLines ? `<div class="pe-order-lots-box" style="margin-top:.55rem;padding:.55rem;border-radius:12px;background:rgba(15,23,42,.25);border:1px solid rgba(148,163,184,.12)">${lotLines}</div>` : ''}

      <div onclick="event.stopPropagation()">
        ${dateEditBlock}
      </div>
    </div>`;
}

// ===================================================
// ALTERAÇÃO DE DATA DO PEDIDO
// ===================================================

// Base da API: tenta reaproveitar variáveis globais do FactoryFlow.
// Se o seu projeto usa outro nome de variável, ajuste aqui.
function _peGetApiBase() {
  // IMPORTANTE:
  // Quando API_BASE/API_URL/BACKEND_URL não existem no Genspark,
  // o fetch cai no próprio domínio do site estático e dá erro HTTP 405.
  // Por isso deixamos o Railway como fallback obrigatório.
  const fallbackBackend = 'https://app-producao-backend-production.up.railway.app';

  const base = String(
    window.API_BASE ||
    window.API_URL ||
    window.BACKEND_URL ||
    fallbackBackend
  ).replace(/\/$/, '');

  return base;
}

function _peGetAuthHeaders() {
  const token =
    sessionStorage.getItem('ff_token') ||
    localStorage.getItem('ff_token') ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('token') ||
    '';

  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

async function _peSaveOrderDeliveryDateOnServer(pedido, newDate) {
  const base = _peGetApiBase();
  const url = `${base}/api/pedidos/${encodeURIComponent(pedido)}/data-entrega`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: _peGetAuthHeaders(),
    body: JSON.stringify({ data_entrega: newDate })
  });

  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    json = null;
  }

  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `Erro HTTP ${res.status} ao salvar data do pedido.`);
  }

  return json || { success: true, pedido, data_entrega: newDate };
}

function _peApplyOrderDateLocally(pedido, newDate, user, oldDate) {
  const [ny, nm, nd] = newDate.split('-');

  (STATE.lots || []).forEach(lot => {
    const lotPedido = _pePedidoKeyFromLot(lot);
    if (String(lotPedido) !== String(pedido)) return;

    const history = Array.isArray(lot.history) ? [...lot.history] : [];
    history.push({
      sector: lot.sector,
      user: user?.id,
      userName: user?.name,
      action: `Data de entrega do pedido alterada para ${nd}/${nm}/${ny} (anterior: ${_peFmtDate(oldDate)})`,
      timestamp: Date.now()
    });

    lot.deliveryDateManual = newDate;
    lot.deliveryDate = newDate;
    lot.pits_previsao = newDate;
    lot.previsao_entrega = newDate;
    lot.data_entrega = newDate;
    lot.data_entrega_override = newDate;
    lot.history = history;

    if (lot.raw_mysql) {
      lot.raw_mysql.deliveryDate = newDate;
      lot.raw_mysql.pits_previsao = newDate;
      lot.raw_mysql.previsao_entrega = newDate;
      lot.raw_mysql.data_entrega = newDate;
      lot.raw_mysql.data_entrega_override = newDate;
    }
  });
}

function _peToggleDateInput(id) {
  const row = document.getElementById(`peDateInputRow_${id}`);
  if (!row) return;
  row.style.display = row.style.display !== 'none' ? 'none' : 'flex';
}

async function updateOrderDeliveryDate(pedido) {
  const user = STATE.currentUser;
  if (!user || !['admin','pcp','pcp_lib'].includes(String(user.role || '').toLowerCase())) {
    showToast('⛔ Sem permissão para alterar datas.', 'error');
    return;
  }

  const input = document.getElementById(`peDateInput_${pedido}`);
  if (!input || !input.value) {
    showToast('Selecione uma data válida.', 'warning');
    return;
  }

  const newDate = input.value;
  const order = _peGetOrdersGlobal().find(o => {
    const n = String(o.number || o.orderNumber || o.id || '').replace(/^bridge_order_/, '').trim();
    return n === String(pedido);
  });

  if (!order) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  const lots = order._lots || [];
  if (!lots.length) {
    showToast('Pedido sem lotes vinculados.', 'warning');
    return;
  }

  const oldDate = order._deliveryDate || '–';
  const btn = document.querySelector(`#peDateInputRow_${pedido} .pe-btn-save-date`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  try {
    const [ny, nm, nd] = newDate.split('-');

    // Salva no backend/MySQL por número de pedido.
    // Isso é o que faz a data aparecer para todos os usuários após atualizar a página.
    await _peSaveOrderDeliveryDateOnServer(pedido, newDate);

    // Atualiza visualmente o navegador atual sem precisar esperar o próximo refresh.
    _peApplyOrderDateLocally(pedido, newDate, user, oldDate);

    showToast(`✅ Data do pedido alterada para ${nd}/${nm}/${ny}`, 'success');

    if (typeof syncBridgeOrdersFromLots === 'function') syncBridgeOrdersFromLots();

    const calCol = document.getElementById('peCalendarCol');
    if (calCol) calCol.innerHTML = _buildCalendar(_peYear, _peMonth);

    if (_peDayPanel) {
      // Se o pedido mudou de dia, mantém a tela coerente:
      // abre o novo dia da entrega alterada.
      openDeliveryDay(newDate);
    }

  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
    console.error('updateOrderDeliveryDate erro:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Salvar'; }
  }
}

// Compatibilidade com chamada antiga por lote.
async function updateLotDeliveryDate(lotId) {
  const lot = (STATE.lots || []).find(l => String(l.id) === String(lotId));
  if (!lot) return;
  const pedido = _pePedidoKeyFromLot(lot);
  if (pedido) return updateOrderDeliveryDate(pedido);
}

// ===================================================
// NAVEGAÇÃO
// ===================================================
function _peNavMonth(delta) {
  _peMonth += delta;
  if (_peMonth < 0)  { _peMonth = 11; _peYear--; }
  if (_peMonth > 11) { _peMonth = 0;  _peYear++; }

  const calCol = document.getElementById('peCalendarCol');
  if (calCol) calCol.innerHTML = _buildCalendar(_peYear, _peMonth);

  if (_peDayPanel) {
    const prefix = `${_peYear}-${String(_peMonth + 1).padStart(2,'0')}`;
    if (!_peDayPanel.startsWith(prefix)) {
      _peDayPanel = null;
      const panel = document.getElementById('peDayPanel');
      if (panel) panel.innerHTML = `
        <div class="pe-day-panel-empty">
          <i class="fas fa-hand-pointer pe-day-empty-icon"></i>
          <p>Clique em um dia no calendário para ver todos os pedidos programados.</p>
        </div>`;
    }
  }
}

function _peToday() {
  const now = new Date();
  _peYear = now.getFullYear();
  _peMonth = now.getMonth();

  const calCol = document.getElementById('peCalendarCol');
  if (calCol) calCol.innerHTML = _buildCalendar(_peYear, _peMonth);

  openDeliveryDay(now.toISOString().split('T')[0]);
}
