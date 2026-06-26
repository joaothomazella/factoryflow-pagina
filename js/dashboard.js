// ===================================================
// DASHBOARD.JS – Dashboard clean + rotas reais por pedido
// PATCH INDUSCOLOR
// - Dashboard e Painel Geral sem tela em branco
// - Rotas puxadas igual aba Entregas: busca ff_routes/ff_lots direto no backend
// - Mostra a rota MAIS RECENTE por motorista, mesmo concluída
// - Para de exibir rota antiga presa como in_progress
// - Textos longos ficam dentro dos cards
// ===================================================

function renderDashboard() {
  const user = STATE.currentUser;
  const page = document.getElementById('pageDashboard');
  if (!page) return;

  if (user && user.role === 'sector') {
    renderSectorDashboard(page);
  } else {
    renderManagerDashboard(page);
  }
}

// ===================================================
// HELPERS GERAIS
// ===================================================
function ffDashEscape(v) {
  if (typeof escapeHtml === 'function') return escapeHtml(String(v ?? ''));
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ffDashText(v, fallback = '') {
  const s = String(v ?? '').trim();
  return ffDashEscape(s || fallback);
}

function ffDashParseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function ffDashNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const FF_DASH_PRODUCTION_SECTORS = new Set([
  'pesagem',
  'producao',
  'moagem',
  'laboratorio',
  'laboratorio_amostras',
  'coloracao',
  'coloracao_amostras',
  'envase_produzir',
  'envase_enlatamento',
  'pcp_liberacao'
]);

const FF_DASH_FINISHED_STATUSES = new Set([
  'pronto',
  'entregue',
  'finalizado',
  'finalizada',
  'cancelado',
  'cancelada'
]);

function ffDashNormalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function ffDashLotSourceSector(lot) {
  return ffDashNormalizeKey(
    lot?.sourceSector ||
    lot?.setor_atual ||
    lot?.setorAtual ||
    lot?.sector ||
    lot?.setor
  );
}

function ffDashLotSourceStatus(lot) {
  return ffDashNormalizeKey(
    lot?.mysql_status ||
    lot?.backendStatus ||
    lot?.status ||
    lot?.situacao ||
    lot?.lotStatus
  );
}

function ffDashIsProductionActiveLot(lot) {
  if (!lot || lot.rejected) return false;
  const sector = ffDashLotSourceSector(lot);
  const status = ffDashLotSourceStatus(lot);
  if (!FF_DASH_PRODUCTION_SECTORS.has(sector)) return false;
  if (FF_DASH_FINISHED_STATUSES.has(status)) return false;
  return true;
}

function ffDashRouteTime(route) {
  // Prioridade para saída da rota. Isso evita rota antiga “atualizada” aparecer na frente.
  const candidates = [
    route?.departureTime,
    route?.startedAt,
    route?.startTime,
    route?.createdAt,
    route?.updatedAt,
    route?.completedAt,
    route?.finishedAt
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;

    const d = Date.parse(c);
    if (Number.isFinite(d) && d > 0) return d;
  }
  return 0;
}

function ffDashFormatDateTime(ts) {
  if (typeof formatDateTime === 'function') return formatDateTime(ts);
  if (!ts) return '–';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function ffDashStatus(route) {
  return String(route?.status || route?.routeStatus || route?.situacao || '').toLowerCase().trim();
}

function ffDashIsCancelledRoute(route) {
  return ['cancelled', 'canceled', 'cancelada', 'cancelado'].includes(ffDashStatus(route));
}

function ffDashRouteStopsRaw(route) {
  const pools = [route?.orders, route?.pedidos, route?.stops, route?.entregas, route?.lots];
  for (const p of pools) {
    const arr = ffDashParseArray(p);
    if (arr.length) return arr;
  }
  return [];
}

function ffDashStopOrderNumber(stop) {
  return String(
    stop?.orderNumber ||
    stop?.pedido ||
    stop?.pedidoNumero ||
    stop?.numeroPedido ||
    stop?.orderKey ||
    stop?.number ||
    ''
  ).trim();
}

function ffDashStopLotIds(stop) {
  const ids = stop?.lotIds || stop?.lotId || [];
  if (Array.isArray(ids)) return ids.map(String).filter(Boolean);
  if (typeof ids === 'string' && ids.trim()) {
    try {
      const parsed = JSON.parse(ids);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (_) {}
    return ids.split(',').map(x => x.trim()).filter(Boolean);
  }
  return [];
}

function ffDashStopLotNumbers(stop) {
  const arr = stop?.lotNumbers || stop?.lotsNumbers || stop?.lotes || stop?.lots || [];
  if (Array.isArray(arr)) {
    return arr.map(x => {
      if (typeof x === 'object') return x.number || x.op || x.lotNumber || x.id || '';
      return x;
    }).map(String).filter(Boolean);
  }

  const n = String(stop?.lotNumber || stop?.lot || stop?.op || stop?.number || '').trim();
  return n ? [n] : [];
}

function ffDashStopClient(stop) {
  return String(stop?.client || stop?.cliente || stop?.clientName || stop?.nomeCliente || '').trim();
}

function ffDashStopProduct(stop) {
  return String(stop?.product || stop?.paint || stop?.produto || stop?.productName || stop?.nomeProduto || '').trim();
}

function ffDashStopDelivered(stop) {
  const st = String(stop?.status || stop?.deliveryStatus || stop?.situacao || '').toLowerCase().trim();
  return ['delivered', 'entregue', 'completed', 'concluido', 'concluído', 'done', 'ok'].includes(st)
    || !!(stop?.deliveredAt || stop?.confirmedAt);
}

function ffDashLotMatchesOrder(lot, order) {
  const lotId = String(lot?.id || '').trim();
  const lotNumber = String(lot?.number || lot?.op || '').trim();
  const lotOrder = String(lot?.orderNumber || lot?.pedido || lot?.pits_numero || lot?.pedidoNumero || '').trim();

  if (order.lotIds.includes(lotId)) return true;
  if (order.lotNumbers.includes(lotNumber)) return true;
  if (order.orderNumber && lotOrder && String(order.orderNumber) === String(lotOrder)) return true;
  return false;
}

function ffDashBuildRouteOrders(route, lotsOverride) {
  const lots = lotsOverride || STATE.lots || [];
  const raw = ffDashRouteStopsRaw(route);
  const map = new Map();

  raw.forEach((stop, index) => {
    const orderNumber = ffDashStopOrderNumber(stop) || `SEM-${index + 1}`;
    const key = String(stop?.orderKey || stop?.pedidoKey || orderNumber).trim();
    const lotIds = ffDashStopLotIds(stop);
    const lotNumbers = ffDashStopLotNumbers(stop);

    if (!map.has(key)) {
      map.set(key, {
        key,
        orderNumber,
        client: ffDashStopClient(stop),
        product: ffDashStopProduct(stop),
        lotIds: [],
        lotNumbers: [],
        delivered: ffDashStopDelivered(stop),
        deliveredAt: ffDashNumber(stop?.deliveredAt || stop?.confirmedAt, 0),
        deliveredBy: stop?.deliveredBy || stop?.confirmedBy || ''
      });
    }

    const item = map.get(key);
    if (!item.client && ffDashStopClient(stop)) item.client = ffDashStopClient(stop);
    if (!item.product && ffDashStopProduct(stop)) item.product = ffDashStopProduct(stop);
    if (ffDashStopDelivered(stop)) item.delivered = true;
    if (!item.deliveredAt && (stop?.deliveredAt || stop?.confirmedAt)) item.deliveredAt = ffDashNumber(stop?.deliveredAt || stop?.confirmedAt, 0);
    if (!item.deliveredBy && (stop?.deliveredBy || stop?.confirmedBy)) item.deliveredBy = stop?.deliveredBy || stop?.confirmedBy;

    lotIds.forEach(id => { if (id && !item.lotIds.includes(id)) item.lotIds.push(id); });
    lotNumbers.forEach(n => { if (n && !item.lotNumbers.includes(n)) item.lotNumbers.push(n); });
  });

  for (const item of map.values()) {
    const related = lots.filter(l => ffDashLotMatchesOrder(l, item));

    if (!item.client && related[0]?.client) item.client = related[0].client;
    if (!item.product && related[0]?.paint) item.product = related[0].paint;

    related.forEach(l => {
      const id = String(l.id || '').trim();
      const n = String(l.number || l.op || '').trim();
      if (id && !item.lotIds.includes(id)) item.lotIds.push(id);
      if (n && !item.lotNumbers.includes(n)) item.lotNumbers.push(n);
    });

    if (!item.delivered && related.length) {
      item.delivered = related.every(l => String(l.sector || '').toLowerCase() === 'entregue' || l.deliveredAt);
    }
  }

  return Array.from(map.values());
}

function ffDashRouteCompleted(route, lotsOverride) {
  const st = ffDashStatus(route);
  if (['completed', 'complete', 'concluida', 'concluída', 'finalizada', 'finished', 'done'].includes(st)) return true;

  const orders = ffDashBuildRouteOrders(route, lotsOverride);
  return orders.length > 0 && orders.every(o => o.delivered);
}

function ffDashUsefulRoute(route, lotsOverride) {
  if (!route || ffDashIsCancelledRoute(route)) return false;
  return ffDashBuildRouteOrders(route, lotsOverride).length > 0;
}

function ffDashLatestRoutesByDriver(routesOverride, lotsOverride, limit = 3) {
  const routes = (routesOverride || STATE.routes || [])
    .filter(r => ffDashUsefulRoute(r, lotsOverride))
    .sort((a, b) => ffDashRouteTime(b) - ffDashRouteTime(a));

  const byDriver = new Map();

  routes.forEach(route => {
    const key = String(route.driverId || route.driverName || route.motorista || 'sem_motorista').trim().toLowerCase();
    if (!byDriver.has(key)) byDriver.set(key, route);
  });

  return Array.from(byDriver.values())
    .sort((a, b) => ffDashRouteTime(b) - ffDashRouteTime(a))
    .slice(0, limit);
}

function ffDashReadyOrders(limit = 8) {
  const readyLots = (STATE.lots || []).filter(l => String(l.sector || '').toLowerCase() === 'pronto' && !l.rejected);
  const map = new Map();

  readyLots.forEach(l => {
    const orderNumber = String(l.orderNumber || l.pedido || l.pits_numero || '').trim();
    const key = orderNumber || `${l.client || ''}_${l.deliveryDate || ''}`;
    if (!map.has(key)) map.set(key, { orderNumber, client: l.client || '', product: l.paint || '', lots: [] });
    const item = map.get(key);
    item.lots.push(l);
    if (!item.client && l.client) item.client = l.client;
    if (!item.product && l.paint) item.product = l.paint;
  });

  return Array.from(map.values()).slice(0, limit);
}

function ffDashNewOrders(limit = 6) {
  const reviewSectors = ['coloracao_revisao', 'laboratorio_revisao', 'pcp_liberacao'];
  const candidates = (STATE.lots || [])
    .filter(l => !l.rejected && reviewSectors.includes(String(l.sector || '').toLowerCase()))
    .sort((a, b) => ffDashNumber(b.createdAt) - ffDashNumber(a.createdAt));

  const map = new Map();
  candidates.forEach(l => {
    const orderNumber = String(l.orderNumber || l.pedido || l.pits_numero || '').trim();
    const key = orderNumber || `${l.client || ''}_${l.createdAt || ''}`;
    if (!map.has(key)) map.set(key, { orderNumber, client: l.client || '', product: l.paint || '', lots: [] });
    const item = map.get(key);
    item.lots.push(l);
    if (!item.client && l.client) item.client = l.client;
    if (!item.product && l.paint) item.product = l.paint;
  });

  return Array.from(map.values()).slice(0, limit);
}

// ===================================================
// BUSCA FRESCA DO BACKEND – MESMO PADRÃO DA ABA ENTREGAS
// ===================================================
function ffDashResolveApiBase() {
  if (typeof ffDeliveriesResolveApiBase === 'function') return ffDeliveriesResolveApiBase();
  if (typeof PEDIDOS_API !== 'undefined' && PEDIDOS_API) return String(PEDIDOS_API).replace(/\/$/, '');
  if (typeof API_BASE !== 'undefined' && API_BASE) return String(API_BASE).replace(/\/$/, '');
  if (typeof API_URL !== 'undefined' && API_URL) return String(API_URL).replace(/\/$/, '');
  if (window.PEDIDOS_API) return String(window.PEDIDOS_API).replace(/\/$/, '');
  return 'https://app-producao-backend-production-b4a7.up.railway.app';
}

function ffDashResolveToken() {
  if (typeof ffDeliveriesResolveToken === 'function') return ffDeliveriesResolveToken();
  return sessionStorage.getItem('ff_token')
    || localStorage.getItem('ff_token')
    || localStorage.getItem('factoryflow_token')
    || localStorage.getItem('ff_api_token')
    || localStorage.getItem('api_token')
    || '';
}

async function ffDashApiGet(table) {
  const token = ffDashResolveToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${ffDashResolveApiBase()}/api/tables/${table}?limit=1000`, { headers });
  if (!res.ok) throw new Error(`GET ${table} falhou (${res.status})`);
  const json = await res.json().catch(() => ({}));
  return json.data || [];
}

function ffDashDeserializeRoute(row) {
  return {
    ...row,
    lots: ffDashParseArray(row.lots),
    orders: ffDashParseArray(row.orders),
    stops: ffDashParseArray(row.stops),
    createdAt: ffDashNumber(row.createdAt),
    updatedAt: ffDashNumber(row.updatedAt),
    departureTime: row.departureTime ? ffDashNumber(row.departureTime) : null,
    completedAt: row.completedAt ? ffDashNumber(row.completedAt) : null
  };
}

function ffDashDeserializeLot(row) {
  return {
    ...row,
    history: ffDashParseArray(row.history),
    workSessions: ffDashParseArray(row.workSessions),
    qty: ffDashNumber(row.qty)
  };
}

let __ffDashLastBackendRefresh = 0;
let __ffDashRefreshPromise = null;

async function ffDashRefreshBackend(force = false) {
  const now = Date.now();
  if (!force && now - __ffDashLastBackendRefresh < 8000) return;
  if (__ffDashRefreshPromise) return __ffDashRefreshPromise;

  __ffDashRefreshPromise = (async () => {
    // IMPORTANTE:
    // Antes este dashboard buscava ff_routes + ff_lots direto do backend e fazia:
    //   STATE.lots = lotsRaw.map(...)
    // Quando ff_lots vinha vazio/sem os lotes do bridge ERP, todas as métricas zeravam.
    // Agora o dashboard atualiza os lotes pelo fluxo oficial do app (reloadData),
    // que também carrega o bridge/MySQL, e busca as rotas frescas por fora.

    if (typeof reloadData === 'function') {
      await reloadData().catch(err => {
        console.warn('Dashboard: reloadData falhou, mantendo lotes atuais:', err.message);
      });
    }

    const routesRaw = await ffDashApiGet('ff_routes').catch(err => {
      console.warn('Dashboard: ff_routes falhou, mantendo rotas atuais:', err.message);
      return null;
    });

    if (Array.isArray(routesRaw)) {
      STATE.routes = routesRaw.map(ffDashDeserializeRoute);
    }

    // Fallback para quando reloadData não existir. Nunca troca STATE.lots por vazio.
    if (typeof reloadData !== 'function') {
      const lotsRaw = await ffDashApiGet('ff_lots').catch(err => {
        console.warn('Dashboard: ff_lots falhou, mantendo lotes atuais:', err.message);
        return null;
      });

      if (Array.isArray(lotsRaw) && lotsRaw.length > 0) {
        const normalLots = lotsRaw.map(ffDashDeserializeLot);
        const bridgeLots = (STATE.lots || []).filter(l =>
          l && (l._source === 'mysql' || String(l.id || '').startsWith('bridge_'))
        );
        STATE.lots = [...normalLots, ...bridgeLots];
      }
    }

    __ffDashLastBackendRefresh = Date.now();
  })().catch(err => {
    console.warn('Dashboard: não consegui atualizar backend:', err.message);
  }).finally(() => {
    __ffDashRefreshPromise = null;
  });

  return __ffDashRefreshPromise;
}

// ===================================================
// CSS DO DASHBOARD
// ===================================================
function ffDashInstallStyles() {
  if (document.getElementById('ffDashboardRealRoutesStyles')) return;

  const css = document.createElement('style');
  css.id = 'ffDashboardRealRoutesStyles';
  css.textContent = `
    .dash-clean{padding:1rem;display:flex;flex-direction:column;gap:1rem;color:var(--text,#e2f0ff)}
    .dash-hero{display:flex;justify-content:space-between;align-items:center;gap:1rem;background:linear-gradient(135deg,rgba(15,23,42,.95),rgba(2,6,23,.9));border:1px solid var(--border,#334155);border-radius:18px;padding:1rem 1.15rem;overflow:hidden}
    .dash-hero h2{font-size:1.25rem;margin:0 0 .25rem;display:flex;gap:.5rem;align-items:center}.dash-muted{color:var(--text2,#94a3b8);font-size:.82rem}.dash-live{display:flex;gap:.45rem;align-items:center;color:#93c5fd;font-size:.85rem;white-space:nowrap}.dash-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}
    .dash-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem}.dash-metric{background:linear-gradient(135deg,rgba(15,31,60,.9),rgba(8,18,36,.88));border:1px solid var(--border,#334155);border-radius:16px;padding:.9rem;display:flex;align-items:center;gap:.75rem;min-height:82px;cursor:pointer;overflow:hidden}.dash-metric i{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(59,130,246,.16);color:#60a5fa;flex-shrink:0}.dash-metric strong{display:block;font-size:1.45rem;line-height:1}.dash-metric span{font-size:.72rem;color:#a9c7ef;font-weight:800;text-transform:uppercase;letter-spacing:.5px}.dash-metric small{display:block;color:var(--text2,#94a3b8);font-size:.72rem;margin-top:.15rem}
    .dash-grid{display:grid;grid-template-columns:1.15fr .85fr .85fr;gap:1rem;align-items:start}.dash-panel{background:linear-gradient(180deg,rgba(15,23,42,.86),rgba(2,6,23,.78));border:1px solid var(--border,#334155);border-radius:18px;padding:1rem;min-width:0;overflow:hidden}.dash-panel.orange{border-color:rgba(249,115,22,.45)}.dash-panel.green{border-color:rgba(34,197,94,.34)}.dash-panel.purple{border-color:rgba(139,92,246,.34)}.dash-panel-title{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.75rem}.dash-panel-title h3{font-size:1rem;margin:0;display:flex;align-items:center;gap:.45rem;min-width:0}.dash-count{background:rgba(59,130,246,.16);border:1px solid rgba(59,130,246,.32);color:#93c5fd;border-radius:999px;padding:.12rem .55rem;font-weight:900;font-size:.75rem;white-space:nowrap}
    .dash-route-card{border:1px solid rgba(249,115,22,.45);border-radius:15px;padding:.85rem;background:rgba(15,23,42,.72);cursor:pointer;overflow:hidden;margin-bottom:.75rem}.dash-route-card.completed{border-color:rgba(34,197,94,.45)}.dash-route-head{display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start}.dash-route-pct{font-size:1.25rem;color:#fb923c;font-weight:900;text-align:right}.dash-route-card.completed .dash-route-pct{color:#4ade80}.dash-route-status{display:inline-flex;margin-top:.25rem;border-radius:999px;padding:.15rem .48rem;font-size:.68rem;font-weight:900;background:rgba(249,115,22,.15);color:#fb923c;border:1px solid rgba(249,115,22,.32)}.dash-route-card.completed .dash-route-status{background:rgba(34,197,94,.14);color:#86efac;border-color:rgba(34,197,94,.32)}.dash-next{margin:.65rem 0;color:#bfdbfe;line-height:1.25;overflow-wrap:anywhere}.dash-chips{display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.55rem}.dash-chip{display:inline-flex;max-width:100%;border:1px solid rgba(96,165,250,.28);background:rgba(59,130,246,.11);color:#bfdbfe;border-radius:999px;padding:.2rem .55rem;font-size:.75rem;font-weight:800;white-space:nowrap}.dash-chip.done{background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.32);color:#86efac}.dash-progress{height:7px;background:rgba(148,163,184,.18);border-radius:999px;overflow:hidden;margin:.45rem 0}.dash-progress span{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#86efac);border-radius:999px}.dash-route-orders{margin-top:.65rem;border-top:1px solid rgba(148,163,184,.14);padding-top:.55rem;display:flex;flex-direction:column;gap:.4rem}.dash-route-order{display:grid;grid-template-columns:24px 1fr auto;gap:.45rem;align-items:center;border:1px solid rgba(96,165,250,.14);background:rgba(15,31,60,.48);border-radius:10px;padding:.45rem;min-width:0}.dash-route-order.done{background:rgba(34,197,94,.10);border-color:rgba(34,197,94,.22)}.dash-route-order-main{min-width:0}.dash-route-order strong,.dash-route-order span{overflow-wrap:anywhere}.dash-route-confirm{font-size:.70rem;color:#86efac;white-space:nowrap}.dash-route-pending{font-size:.70rem;color:#cbd5e1;background:rgba(148,163,184,.12);border-radius:999px;padding:.12rem .38rem;white-space:nowrap}
    .dash-list{display:flex;flex-direction:column;gap:.5rem;max-height:540px;overflow:auto;padding-right:.2rem}.dash-order{border:1px solid rgba(96,165,250,.18);background:rgba(15,31,60,.72);border-radius:13px;padding:.65rem;min-width:0;overflow:hidden}.dash-order-top{display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start}.dash-order strong{display:block;color:#fff;font-size:.88rem;line-height:1.15;overflow-wrap:anywhere}.dash-client{color:#9fc5ff;font-weight:800;font-size:.78rem;line-height:1.2;overflow-wrap:anywhere;margin-top:.15rem}.dash-product{color:#94a3b8;font-size:.72rem;margin-top:.18rem;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.dash-lot-count{color:#60a5fa;font-size:.7rem;font-weight:900;white-space:nowrap}.dash-empty{color:var(--text2,#94a3b8);padding:1rem;text-align:center;border:1px dashed rgba(148,163,184,.22);border-radius:12px}
    .dash-factory-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.dash-sector-list{display:flex;flex-direction:column;gap:.5rem}.dash-sector-row{display:grid;grid-template-columns:145px 1fr 34px;align-items:center;gap:.55rem;background:rgba(15,31,60,.55);border:1px solid rgba(96,165,250,.14);border-radius:12px;padding:.55rem}.dash-sector-label{font-size:.78rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-sector-bar{height:7px;background:rgba(148,163,184,.15);border-radius:999px;overflow:hidden}.dash-sector-bar span{display:block;height:100%;border-radius:999px}.dash-sector-count{text-align:right;font-weight:900;color:#e2f0ff}
    @media(max-width:1200px){.dash-grid{grid-template-columns:1fr}.dash-factory-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(css);
}

// ===================================================
// CARDS
// ===================================================
function ffDashRouteCard(route) {
  const orders = ffDashBuildRouteOrders(route);
  const done = orders.filter(o => o.delivered).length;
  const total = Math.max(orders.length, 1);
  const pct = Math.round((done / total) * 100);
  const completed = ffDashRouteCompleted(route);
  const next = orders.find(o => !o.delivered) || orders[orders.length - 1] || {};
  const time = ffDashRouteTime(route);

  const chips = orders.slice(0, 5).map(o => `
    <span class="dash-chip ${o.delivered ? 'done' : ''}">${o.delivered ? '✓ ' : ''}Ped. ${ffDashText(o.orderNumber || '—')}</span>
  `).join('');

  const orderRows = orders.slice(0, 5).map(o => `
    <div class="dash-route-order ${o.delivered ? 'done' : ''}">
      <div>${o.delivered ? '✅' : '🕘'}</div>
      <div class="dash-route-order-main">
        <strong>Ped. ${ffDashText(o.orderNumber || '—')}</strong>
        <div class="dash-product">${ffDashText(o.client || 'Cliente não informado')}</div>
      </div>
      ${o.delivered
        ? `<span class="dash-route-confirm">${o.deliveredAt ? ffDashFormatDateTime(o.deliveredAt).replace(/.*\//,'') : 'Entregue'}</span>`
        : '<span class="dash-route-pending">Pendente</span>'}
    </div>
  `).join('');

  return `
    <div class="dash-route-card ${completed ? 'completed' : ''}" onclick="navigateTo('deliveries')">
      <div class="dash-route-head">
        <div>
          <strong><i class="fas fa-truck"></i> ${ffDashText(route.driverName || route.motorista || 'Motorista')}</strong>
          <div class="dash-muted">Saída: ${time ? ffDashFormatDateTime(time) : '–'}</div>
          <span class="dash-route-status">${completed ? 'CONCLUÍDA' : 'EM ROTA'}</span>
        </div>
        <div class="dash-route-pct">${pct}%</div>
      </div>
      <div class="dash-next">${completed ? 'Última entrega' : 'Próxima'}: <b>${ffDashText(next.client || '—')}</b>${next.orderNumber ? ` · Ped. ${ffDashText(next.orderNumber)}` : ''}</div>
      <div class="dash-chips">${chips}</div>
      <div class="dash-progress"><span style="width:${pct}%"></span></div>
      <div class="dash-muted">${done}/${orders.length} pedido(s) entregues</div>
      <div class="dash-route-orders">${orderRows}</div>
    </div>
  `;
}

function ffDashOrderCard(o) {
  const lot = o.lots?.[0] || {};
  return `
    <div class="dash-order">
      <div class="dash-order-top">
        <strong>Ped. ${ffDashText(o.orderNumber || '—')}</strong>
        <span class="dash-lot-count">${o.lots.length} lote(s)</span>
      </div>
      <div class="dash-client">${ffDashText(o.client || 'Cliente não informado')}</div>
      <div class="dash-product">${ffDashText((lot.number ? '#' + lot.number + ' ' : '') + (o.product || lot.paint || ''))}</div>
    </div>
  `;
}

// ===================================================
// DASHBOARD DO SETOR
// ===================================================
function renderSectorDashboard(page) {
  const user = STATE.currentUser || {};
  const setoresVisiveis = typeof getSectorVisibility === 'function' ? getSectorVisibility(user.sector) : [user.sector];
  const myLots = (STATE.lots || []).filter(l => setoresVisiveis.includes(l.sector) && !l.rejected);
  const lateLots = myLots.filter(l => typeof isLate === 'function' && isLate(l));
  const urgentLots = myLots.filter(l => l.priority !== 'normal');

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-tachometer-alt"></i> Meu Setor – ${ffDashText((SECTOR_LABELS || {})[user.sector] || user.sector || '')}</h2>
    </div>
    <div class="metrics-row">
      <div class="metric-card metric-blue"><div class="metric-num">${myLots.length}</div><div class="metric-label">Lotes no Setor</div></div>
      <div class="metric-card metric-yellow"><div class="metric-num">${urgentLots.length}</div><div class="metric-label">Urgentes</div></div>
      <div class="metric-card metric-red"><div class="metric-num">${lateLots.length}</div><div class="metric-label">Atrasados</div></div>
    </div>
    <h3 style="margin:1.5rem 0 1rem"><i class="fas fa-boxes"></i> Lotes no Meu Setor</h3>
    <div class="lots-grid">
      ${myLots.length && typeof buildLotCard === 'function'
        ? myLots.map(l => buildLotCard(l)).join('')
        : '<div class="empty-state"><i class="fas fa-check-circle"></i><p>Nenhum lote no seu setor</p></div>'}
    </div>
  `;
}

// ===================================================
// DASHBOARD GERAL
// ===================================================
function renderManagerDashboard(page) {
  if (!page) return;
  ffDashInstallStyles();

  // Renderiza com cache e dispara busca fresca. Quando voltar, re-renderiza.
  ffDashRefreshBackend(false).then(() => {
    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage === 'dashboard' && page.classList.contains('active')) {
      ffDashRenderManagerDashboard(page);
    }
  });

  ffDashRenderManagerDashboard(page);
}

function ffDashRenderManagerDashboard(page) {
  const lots = (STATE.lots || []).filter(l => !l.rejected);
  const inProd = lots.filter(ffDashIsProductionActiveLot);
  const readyLots = lots.filter(l => String(l.sector || '').toLowerCase() === 'pronto');
  const inRouteLots = lots.filter(l => String(l.sector || '').toLowerCase() === 'entrega');
  const deliveredLots = lots.filter(l => String(l.sector || '').toLowerCase() === 'entregue');
  const today = lots.filter(l => typeof isToday === 'function' && isToday(l.deliveryDate) && String(l.sector || '').toLowerCase() !== 'entregue');
  const urgent = lots.filter(l => l.priority !== 'normal' && String(l.sector || '').toLowerCase() !== 'entregue');
  const late = lots.filter(l => typeof isLate === 'function' && isLate(l));
  const readyOrders = ffDashReadyOrders(8);
  const newOrders = ffDashNewOrders(6);
  const recentRoutes = ffDashLatestRoutesByDriver(STATE.routes, STATE.lots, 3);
  const sectorSituationRoles = ['admin', 'diretoria', 'pcp', 'manager'];
  const showSectorSituation = sectorSituationRoles.includes(String(STATE.currentUser?.role || '').toLowerCase());

  page.innerHTML = `
    <div class="dash-clean">
      <div class="dash-hero">
        <div>
          <h2><i class="fas fa-tachometer-alt"></i> Dashboard Geral</h2>
          <div class="dash-muted">Resumo operacional limpo, com rotas reais da aba Entregas.</div>
        </div>
        <div class="dash-live"><span class="dash-dot"></span> Atualizado em ${new Date().toLocaleTimeString('pt-BR')}</div>
      </div>

      <div class="dash-metrics">
        <div class="dash-metric" onclick="navigateTo('lots')"><i class="fas fa-industry"></i><div><strong>${inProd.length}</strong><span>Em produção</span><small>Lotes ativos</small></div></div>
        <div class="dash-metric" onclick="navigateTo('deliveries')"><i class="fas fa-check"></i><div><strong>${readyLots.length}</strong><span>Prontos</span><small>Aguardando rota</small></div></div>
        <div class="dash-metric" onclick="navigateTo('deliveries')"><i class="fas fa-truck"></i><div><strong>${inRouteLots.length}</strong><span>Em rota</span><small>Pedidos/lotes na rua</small></div></div>
        <div class="dash-metric" onclick="navigateTo('deliveries')"><i class="fas fa-box"></i><div><strong>${deliveredLots.length}</strong><span>Entregues</span><small>Concluídos</small></div></div>
        <div class="dash-metric" onclick="navigateTo('orders')"><i class="fas fa-calendar-day"></i><div><strong>${today.length}</strong><span>Hoje</span><small>Entrega hoje</small></div></div>
        <div class="dash-metric" onclick="navigateTo('orders')"><i class="fas fa-bolt"></i><div><strong>${urgent.length}</strong><span>Prioritários</span><small>Urgente/mesmo dia</small></div></div>
        <div class="dash-metric" onclick="navigateTo('orders')"><i class="fas fa-clock"></i><div><strong>${late.length}</strong><span>Atrasados</span><small>Fora do prazo</small></div></div>
      </div>

      <div class="dash-grid">
        <div class="dash-panel orange">
          <div class="dash-panel-title"><h3><i class="fas fa-route"></i> Rotas recentes</h3><span class="dash-count">${recentRoutes.length} rota(s)</span></div>
          ${recentRoutes.length ? recentRoutes.map(ffDashRouteCard).join('') : '<div class="dash-empty">Nenhuma rota encontrada.</div>'}
        </div>

        <div class="dash-panel green">
          <div class="dash-panel-title"><h3><i class="fas fa-clipboard-check"></i> Prontos aguardando rota</h3><span class="dash-count">${readyOrders.length}</span></div>
          <div class="dash-list">${readyOrders.length ? readyOrders.map(ffDashOrderCard).join('') : '<div class="dash-empty">Nenhum pedido pronto aguardando rota.</div>'}</div>
        </div>

        <div class="dash-panel purple">
          <div class="dash-panel-title"><h3><i class="fas fa-inbox"></i> Pedidos novos / revisão</h3><span class="dash-count">${newOrders.length}</span></div>
          <div class="dash-list">${newOrders.length ? newOrders.map(ffDashOrderCard).join('') : '<div class="dash-empty">Nenhum pedido novo/revisão.</div>'}</div>
        </div>
      </div>

      ${showSectorSituation ? ffDashBuildSectorSituationHtml(inProd) : ''}
    </div>
  `;
}

// ===================================================
// PAINEL GERAL DA FÁBRICA
// ===================================================
function renderFactoryPanel() {
  ffDashInstallStyles();
  const page = document.getElementById('pageFactory');
  if (!page) return;

  ffDashRefreshBackend(false).then(() => {
    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage === 'factory' && page.classList.contains('active')) {
      ffDashRenderFactoryPanel(page);
    }
  });

  ffDashRenderFactoryPanel(page);
}

function ffDashRenderFactoryPanel(page) {
  const lots = (STATE.lots || []).filter(l => !l.rejected);
  const inProd = lots.filter(ffDashIsProductionActiveLot);
  const ready = lots.filter(l => String(l.sector || '').toLowerCase() === 'pronto');
  const inRoute = lots.filter(l => String(l.sector || '').toLowerCase() === 'entrega');
  const delivered = lots.filter(l => String(l.sector || '').toLowerCase() === 'entregue');
  const late = lots.filter(l => typeof isLate === 'function' && isLate(l));
  const recentRoutes = ffDashLatestRoutesByDriver(STATE.routes, STATE.lots, 3);
  const maxCount = Math.max(...(SECTORS || []).map(s => inProd.filter(l => l.sector === s).length), 1);

  page.innerHTML = `
    <div class="dash-clean">
      <div class="dash-hero">
        <div><h2><i class="fas fa-industry"></i> Painel Geral da Fábrica</h2><div class="dash-muted">Visão consolidada em tempo real.</div></div>
        <div class="dash-live"><span class="dash-dot"></span> Ao vivo</div>
      </div>

      <div class="dash-metrics">
        <div class="dash-metric"><i class="fas fa-industry"></i><div><strong>${inProd.length}</strong><span>Em produção</span></div></div>
        <div class="dash-metric"><i class="fas fa-check"></i><div><strong>${ready.length}</strong><span>Prontos</span></div></div>
        <div class="dash-metric"><i class="fas fa-truck"></i><div><strong>${inRoute.length}</strong><span>Em rota</span></div></div>
        <div class="dash-metric"><i class="fas fa-box"></i><div><strong>${delivered.length}</strong><span>Entregues</span></div></div>
        <div class="dash-metric"><i class="fas fa-clock"></i><div><strong>${late.length}</strong><span>Atrasados</span></div></div>
      </div>

      <div class="dash-factory-grid">
        ${ffDashBuildSectorSituationHtml(inProd)}

        <div class="dash-panel orange">
          <div class="dash-panel-title"><h3><i class="fas fa-route"></i> Rotas recentes</h3><span class="dash-count">${recentRoutes.length}</span></div>
          ${recentRoutes.length ? recentRoutes.map(ffDashRouteCard).join('') : '<div class="dash-empty">Nenhuma rota encontrada.</div>'}
        </div>
      </div>
    </div>
  `;
}

// ===================================================
// SITUAÇÃO POR SETOR (reutilizado por Painel Geral e Dashboard)
// ===================================================
function ffDashBuildSectorSituationHtml(inProd) {
  const maxCount = Math.max(...(SECTORS || []).map(s => inProd.filter(l => l.sector === s).length), 1);
  return `
    <div class="dash-panel">
      <div class="dash-panel-title"><h3><i class="fas fa-sitemap"></i> Situação por setor</h3></div>
      <div class="dash-sector-list">
        ${(SECTORS || []).map(s => {
          const count = inProd.filter(l => l.sector === s).length;
          const pct = Math.round((count / maxCount) * 100);
          return `<div class="dash-sector-row">
            <div class="dash-sector-label" style="color:${(SECTOR_COLORS || {})[s] || '#93c5fd'}">${ffDashText((SECTOR_LABELS || {})[s] || s)}</div>
            <div class="dash-sector-bar"><span style="width:${pct}%;background:${(SECTOR_COLORS || {})[s] || '#3b82f6'}"></span></div>
            <div class="dash-sector-count">${count}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}
