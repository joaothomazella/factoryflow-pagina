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
    .dash-clean{padding:1.1rem 1.2rem 1.6rem;display:flex;flex-direction:column;gap:1.2rem;color:var(--text,#e2f0ff);max-width:1500px;margin:0 auto}

    .dash-hero{display:flex;justify-content:space-between;align-items:center;gap:1rem;background:linear-gradient(135deg,rgba(15,23,42,.97),rgba(2,6,23,.92));border:1px solid var(--border,#334155);border-radius:18px;padding:1.15rem 1.4rem;overflow:hidden;position:relative}
    .dash-hero::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 0% 0%,rgba(20,65,150,.14),transparent 55%);pointer-events:none}
    .dash-hero h2{font-size:1.3rem;margin:0 0 .3rem;display:flex;gap:.55rem;align-items:center;letter-spacing:-.01em}
    .dash-hero h2 i{color:#60a5fa}
    .dash-muted{color:var(--text2,#94a3b8);font-size:.82rem}
    .dash-live{display:flex;gap:.5rem;align-items:center;color:#93c5fd;font-size:.82rem;white-space:nowrap;background:rgba(20,65,150,.1);border:1px solid rgba(20,65,150,.22);border-radius:999px;padding:.4rem .85rem;flex-shrink:0}
    .dash-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.15);animation:dashPulse 2s ease-in-out infinite}
    @keyframes dashPulse{0%,100%{opacity:1}50%{opacity:.45}}

    .dash-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:.85rem}
    .dash-metric{background:linear-gradient(160deg,rgba(17,33,63,.92),rgba(8,18,36,.9));border:1px solid var(--border,#334155);border-radius:15px;padding:.95rem 1rem;display:flex;align-items:center;gap:.85rem;min-height:80px;cursor:pointer;overflow:hidden;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease}
    .dash-metric:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.28)}
    .dash-metric i{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.05rem}
    .dash-metric strong{display:block;font-size:1.5rem;line-height:1.1;font-weight:800;color:#fff}
    .dash-metric span{font-size:.7rem;color:#a9c7ef;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
    .dash-metric small{display:block;color:var(--text2,#94a3b8);font-size:.7rem;margin-top:.1rem}
    .dash-metric.m-blue{border-color:rgba(20,65,150,.3)}.dash-metric.m-blue i{background:rgba(20,65,150,.16);color:#60a5fa}
    .dash-metric.m-teal{border-color:rgba(45,212,191,.3)}.dash-metric.m-teal i{background:rgba(45,212,191,.16);color:#2dd4bf}
    .dash-metric.m-orange{border-color:rgba(249,115,22,.32)}.dash-metric.m-orange i{background:rgba(249,115,22,.16);color:#fb923c}
    .dash-metric.m-green{border-color:rgba(34,197,94,.3)}.dash-metric.m-green i{background:rgba(34,197,94,.16);color:#4ade80}
    .dash-metric.m-purple{border-color:rgba(139,92,246,.32)}.dash-metric.m-purple i{background:rgba(139,92,246,.16);color:#a78bfa}
    .dash-metric.m-yellow{border-color:rgba(234,179,8,.32)}.dash-metric.m-yellow i{background:rgba(234,179,8,.16);color:#facc15}
    .dash-metric.m-red{border-color:rgba(239,68,68,.34)}.dash-metric.m-red i{background:rgba(239,68,68,.16);color:#f87171}

    .dash-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr);gap:1.1rem;align-items:start}
    .dash-panel{background:linear-gradient(180deg,rgba(16,24,43,.9),rgba(2,6,23,.82));border:1px solid var(--border,#334155);border-radius:17px;padding:1.05rem;min-width:0;overflow:hidden}
    .dash-panel.orange{border-color:rgba(249,115,22,.4)}
    .dash-panel.green{border-color:rgba(34,197,94,.32)}
    .dash-panel.purple{border-color:rgba(139,92,246,.32)}
    .dash-panel-title{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.85rem;padding-bottom:.7rem;border-bottom:1px solid rgba(148,163,184,.12)}
    .dash-panel-title h3{font-size:.92rem;margin:0;display:flex;align-items:center;gap:.5rem;min-width:0;font-weight:700;letter-spacing:-.005em}
    .dash-count{background:rgba(20,65,150,.16);border:1px solid rgba(20,65,150,.32);color:#93c5fd;border-radius:999px;padding:.15rem .6rem;font-weight:800;font-size:.72rem;white-space:nowrap}

    .dash-route-card{border:1px solid rgba(249,115,22,.4);border-radius:14px;padding:.9rem;background:rgba(15,23,42,.6);cursor:pointer;overflow:hidden;margin-bottom:.75rem;transition:border-color .15s ease,background .15s ease}
    .dash-route-card:hover{background:rgba(15,23,42,.85)}
    .dash-route-card:last-child{margin-bottom:0}
    .dash-route-card.completed{border-color:rgba(34,197,94,.4)}
    .dash-route-head{display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start}
    .dash-route-pct{font-size:1.3rem;color:#fb923c;font-weight:900;text-align:right;line-height:1}
    .dash-route-card.completed .dash-route-pct{color:#4ade80}
    .dash-route-status{display:inline-flex;margin-top:.32rem;border-radius:999px;padding:.16rem .5rem;font-size:.65rem;font-weight:800;letter-spacing:.03em;background:rgba(249,115,22,.15);color:#fb923c;border:1px solid rgba(249,115,22,.3)}
    .dash-route-card.completed .dash-route-status{background:rgba(34,197,94,.14);color:#86efac;border-color:rgba(34,197,94,.3)}
    .dash-next{margin:.7rem 0;color:#bfdbfe;line-height:1.3;overflow-wrap:anywhere;font-size:.84rem}
    .dash-chips{display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.6rem}
    .dash-chip{display:inline-flex;max-width:100%;border:1px solid rgba(96,165,250,.26);background:rgba(20,65,150,.1);color:#bfdbfe;border-radius:999px;padding:.22rem .58rem;font-size:.72rem;font-weight:700;white-space:nowrap}
    .dash-chip.done{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.3);color:#86efac}
    .dash-progress{height:6px;background:rgba(148,163,184,.16);border-radius:999px;overflow:hidden;margin:.5rem 0}
    .dash-progress span{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#86efac);border-radius:999px;transition:width .3s ease}
    .dash-route-orders{margin-top:.7rem;border-top:1px solid rgba(148,163,184,.12);padding-top:.6rem;display:flex;flex-direction:column;gap:.4rem}
    .dash-route-order{display:grid;grid-template-columns:22px 1fr auto;gap:.45rem;align-items:center;border:1px solid rgba(96,165,250,.12);background:rgba(15,31,60,.4);border-radius:10px;padding:.45rem .55rem;min-width:0}
    .dash-route-order.done{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.2)}
    .dash-route-order-main{min-width:0}
    .dash-route-order strong,.dash-route-order span{overflow-wrap:anywhere}
    .dash-route-order strong{font-size:.8rem}
    .dash-route-confirm{font-size:.68rem;color:#86efac;white-space:nowrap;font-weight:700}
    .dash-route-pending{font-size:.68rem;color:#cbd5e1;background:rgba(148,163,184,.12);border-radius:999px;padding:.14rem .4rem;white-space:nowrap}

    .dash-list{display:flex;flex-direction:column;gap:.55rem;max-height:540px;overflow:auto;padding-right:.25rem;scrollbar-width:thin}
    .dash-list::-webkit-scrollbar{width:6px}
    .dash-list::-webkit-scrollbar-thumb{background:rgba(148,163,184,.25);border-radius:999px}
    .dash-order{border:1px solid rgba(96,165,250,.16);background:rgba(15,31,60,.6);border-radius:12px;padding:.7rem .75rem;min-width:0;overflow:hidden;transition:border-color .15s ease,background .15s ease}
    .dash-order:hover{border-color:rgba(96,165,250,.32);background:rgba(15,31,60,.85)}
    .dash-order-top{display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start}
    .dash-order strong{display:block;color:#fff;font-size:.86rem;line-height:1.2;overflow-wrap:anywhere;font-weight:700}
    .dash-client{color:#9fc5ff;font-weight:700;font-size:.77rem;line-height:1.25;overflow-wrap:anywhere;margin-top:.18rem}
    .dash-product{color:#94a3b8;font-size:.71rem;margin-top:.2rem;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .dash-lot-count{color:#60a5fa;font-size:.68rem;font-weight:800;white-space:nowrap;background:rgba(20,65,150,.12);border-radius:999px;padding:.12rem .45rem}
    .dash-empty{color:var(--text2,#94a3b8);padding:1.4rem 1rem;text-align:center;border:1px dashed rgba(148,163,184,.2);border-radius:12px;font-size:.83rem}

    .dash-factory-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.1rem}
    .dash-sector-list{display:flex;flex-direction:column;gap:.5rem}
    .dash-sector-row{display:grid;grid-template-columns:140px 1fr 32px;align-items:center;gap:.6rem;background:rgba(15,31,60,.45);border:1px solid rgba(96,165,250,.12);border-radius:11px;padding:.55rem .65rem}
    .dash-sector-label{font-size:.76rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dash-sector-bar{height:7px;background:rgba(148,163,184,.14);border-radius:999px;overflow:hidden}
    .dash-sector-bar span{display:block;height:100%;border-radius:999px;transition:width .3s ease}
    .dash-sector-count{text-align:right;font-weight:800;color:#e2f0ff;font-size:.85rem}

    @media(max-width:1200px){.dash-grid{grid-template-columns:1fr}.dash-factory-grid{grid-template-columns:1fr}}
    @media(max-width:640px){.dash-hero{flex-direction:column;align-items:flex-start}.dash-live{align-self:flex-start}}

    .sdb-sub-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem}
    .sdb-panel{transition:border-color .2s}
    .sdb-status-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:.7rem}
    .sdb-status-item{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:.55rem;border-radius:10px;background:rgba(15,31,60,.5)}
    .sdb-status-item strong{font-size:1.35rem;font-weight:800;line-height:1}
    .sdb-status-item span{font-size:.67rem;color:var(--text2,#94a3b8);text-transform:uppercase;letter-spacing:.05em;margin-top:.18rem}
    .sdb-working strong{color:#4ade80}.sdb-working{border:1px solid rgba(34,197,94,.2)}
    .sdb-paused  strong{color:#fbbf24}.sdb-paused {border:1px solid rgba(245,158,11,.2)}
    .sdb-idle    strong{color:#94a3b8}.sdb-idle   {border:1px solid rgba(100,116,139,.2)}
    .sdb-bar{display:flex;height:7px;border-radius:999px;overflow:hidden;background:rgba(100,116,139,.15);margin-bottom:.8rem}
    .sdb-bar-w{background:#22c55e;transition:width .3s}
    .sdb-bar-p{background:#f59e0b;transition:width .3s}
    .sdb-bar-i{flex:1;background:rgba(100,116,139,.25)}
    .sdb-tags{display:flex;flex-wrap:wrap;gap:.4rem}
    .sdb-tag{font-size:.7rem;border-radius:999px;padding:.18rem .55rem;font-weight:700;display:inline-flex;align-items:center;gap:.3rem}
    .sdb-tag-sd{background:rgba(239,68,68,.16);color:#f87171;border:1px solid rgba(239,68,68,.26)}
    .sdb-tag-u {background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.26)}
    .sdb-tag-l {background:rgba(239,68,68,.14);color:#fca5a5;border:1px solid rgba(239,68,68,.22)}
    .sdb-tag-ok{background:rgba(34,197,94,.12);color:#4ade80;border:1px solid rgba(34,197,94,.22)}
    .sdb-delivery-list{display:flex;flex-direction:column;gap:.4rem;max-height:280px;overflow:auto;scrollbar-width:thin}
    .sdb-delivery-row{display:grid;grid-template-columns:70px 1fr auto;align-items:center;gap:.65rem;padding:.45rem .6rem;border-radius:9px;border:1px solid rgba(96,165,250,.12);background:rgba(15,31,60,.45);font-size:.8rem}
    .sdb-delivery-row.sdb-dr-late{border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.07)}
    .sdb-delivery-row.sdb-dr-today{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.07)}
    .sdb-dr-lot{font-weight:800;color:#93c5fd}
    .sdb-dr-client{color:var(--text,#e2f0ff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sdb-dr-date{white-space:nowrap;color:var(--text2,#94a3b8);font-size:.72rem}
    .sdb-dr-date b{color:#fca5a5}
    .sdb-dr-today .sdb-dr-date b{color:#fbbf24}
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
// DASHBOARD DO SETOR – MÉTRICAS
// ===================================================
function renderSectorDashboard(page) {
  ffDashInstallStyles();

  const user = STATE.currentUser || {};
  const setoresVisiveis = typeof getSectorVisibility === 'function'
    ? getSectorVisibility(user.sector)
    : [user.sector];

  const allLots    = (STATE.lots || []).filter(l => setoresVisiveis.includes(l.sector) && !l.rejected);
  const working    = allLots.filter(l => l.lotStatus === 'working').length;
  const paused     = allLots.filter(l => l.lotStatus === 'paused').length;
  const idle       = allLots.filter(l => !l.lotStatus || l.lotStatus === 'idle').length;
  const lateCount  = allLots.filter(l => typeof isLate === 'function' && isLate(l)).length;
  const urgentCount= allLots.filter(l => l.priority !== 'normal').length;
  const todayCount = allLots.filter(l => typeof isToday === 'function' && isToday(l.deliveryDate)).length;
  const samedayCount = allLots.filter(l => l.priority === 'sameday').length;

  const sectorName  = ffDashText((SECTOR_LABELS || {})[user.sector] || user.sector || 'Meu Setor');
  const sectorColor = (SECTOR_COLORS || {})[user.sector] || '#144196';

  // Painel por sub-setor
  const subPanels = setoresVisiveis.map(s => {
    const sLots    = allLots.filter(l => l.sector === s);
    const color    = (SECTOR_COLORS || {})[s] || '#6b7280';
    const label    = ffDashText((SECTOR_LABELS || {})[s] || s);
    const sWorking = sLots.filter(l => l.lotStatus === 'working').length;
    const sPaused  = sLots.filter(l => l.lotStatus === 'paused').length;
    const sIdle    = sLots.filter(l => !l.lotStatus || l.lotStatus === 'idle').length;
    const sLate    = sLots.filter(l => typeof isLate === 'function' && isLate(l)).length;
    const sUrgent  = sLots.filter(l => l.priority !== 'normal').length;
    const sSameday = sLots.filter(l => l.priority === 'sameday').length;
    const total    = sLots.length;
    const wPct     = total ? Math.round(sWorking / total * 100) : 0;
    const pPct     = total ? Math.round(sPaused  / total * 100) : 0;
    const iPct     = 100 - wPct - pPct;

    return `
      <div class="dash-panel sdb-panel" style="border-color:${color}40">
        <div class="dash-panel-title">
          <h3><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:.4rem;flex-shrink:0"></span>${label}</h3>
          <span class="dash-count">${total} lote${total !== 1 ? 's' : ''}</span>
        </div>

        <div class="sdb-status-row">
          <div class="sdb-status-item sdb-working">
            <strong>${sWorking}</strong><span>Trabalhando</span>
          </div>
          <div class="sdb-status-item sdb-paused">
            <strong>${sPaused}</strong><span>Pausado</span>
          </div>
          <div class="sdb-status-item sdb-idle">
            <strong>${sIdle}</strong><span>Aguardando</span>
          </div>
        </div>

        <div class="sdb-bar" title="${wPct}% trabalhando · ${pPct}% pausado · ${iPct}% aguardando">
          <div class="sdb-bar-w" style="width:${wPct}%"></div>
          <div class="sdb-bar-p" style="width:${pPct}%"></div>
          <div class="sdb-bar-i" style="flex:1"></div>
        </div>

        <div class="sdb-tags">
          ${sSameday ? `<span class="sdb-tag sdb-tag-sd"><i class="fas fa-fire"></i> ${sSameday} Mesmo Dia</span>` : ''}
          ${sUrgent  ? `<span class="sdb-tag sdb-tag-u"><i class="fas fa-bolt"></i> ${sUrgent} Urgente${sUrgent > 1 ? 's' : ''}</span>` : ''}
          ${sLate    ? `<span class="sdb-tag sdb-tag-l"><i class="fas fa-exclamation-triangle"></i> ${sLate} Atrasado${sLate > 1 ? 's' : ''}</span>` : ''}
          ${!sSameday && !sUrgent && !sLate ? '<span class="sdb-tag sdb-tag-ok"><i class="fas fa-check-circle"></i> Sem pendências</span>' : ''}
        </div>
      </div>`;
  }).join('');

  // Próximas entregas do setor (lotes com entrega hoje ou passada)
  const upcoming = allLots
    .filter(l => l.deliveryDate)
    .sort((a, b) => (a.deliveryDate || '') < (b.deliveryDate || '') ? -1 : 1)
    .slice(0, 8);

  const upcomingHtml = upcoming.length ? upcoming.map(l => {
    const late  = typeof isLate  === 'function' && isLate(l);
    const today = typeof isToday === 'function' && isToday(l.deliveryDate);
    return `
      <div class="sdb-delivery-row ${late ? 'sdb-dr-late' : today ? 'sdb-dr-today' : ''}">
        <span class="sdb-dr-lot">#${ffDashText(l.number || '–')}</span>
        <span class="sdb-dr-client">${ffDashText(l.client || '–')}</span>
        <span class="sdb-dr-date">${ffDashText(l.deliveryDate || '–')}${late ? ' <b>ATRASADO</b>' : today ? ' <b>HOJE</b>' : ''}</span>
      </div>`;
  }).join('') : `<div class="dash-empty">Nenhum lote com data de entrega cadastrada.</div>`;

  page.innerHTML = `
    <div class="dash-clean">
      <div class="dash-hero" style="border-color:${sectorColor}40">
        <div>
          <h2 style="color:${sectorColor}"><i class="fas fa-hard-hat"></i> ${sectorName}</h2>
          <div class="dash-muted">Métricas do seu setor em tempo real</div>
        </div>
        <div class="dash-live"><span class="dash-dot"></span> ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</div>
      </div>

      <div class="dash-metrics">
        <div class="dash-metric m-blue"  onclick="navigateTo('meu_setor')"><i class="fas fa-boxes"></i><div><strong>${allLots.length}</strong><span>Total</span><small>Lotes no setor</small></div></div>
        <div class="dash-metric m-green" onclick="navigateTo('meu_setor')"><i class="fas fa-play-circle"></i><div><strong>${working}</strong><span>Trabalhando</span><small>Em produção agora</small></div></div>
        <div class="dash-metric m-yellow"onclick="navigateTo('meu_setor')"><i class="fas fa-pause-circle"></i><div><strong>${paused}</strong><span>Pausados</span><small>Aguardando retomada</small></div></div>
        <div class="dash-metric m-teal"  onclick="navigateTo('meu_setor')"><i class="fas fa-clock"></i><div><strong>${idle}</strong><span>Aguardando</span><small>Sem início</small></div></div>
        <div class="dash-metric m-purple"onclick="navigateTo('orders')"><i class="fas fa-calendar-day"></i><div><strong>${todayCount}</strong><span>Hoje</span><small>Entrega hoje</small></div></div>
        <div class="dash-metric m-orange"onclick="navigateTo('meu_setor')"><i class="fas fa-bolt"></i><div><strong>${urgentCount}</strong><span>Urgentes</span><small>Prioritários</small></div></div>
        <div class="dash-metric m-red"   onclick="navigateTo('meu_setor')"><i class="fas fa-exclamation-triangle"></i><div><strong>${lateCount}</strong><span>Atrasados</span><small>Fora do prazo</small></div></div>
      </div>

      <div class="sdb-sub-grid">
        ${subPanels}
      </div>

      <div class="dash-panel" style="border-color:rgba(139,92,246,.32)">
        <div class="dash-panel-title">
          <h3><i class="fas fa-calendar-alt"></i> Próximas entregas do setor</h3>
          <span class="dash-count">${upcoming.length}</span>
        </div>
        <div class="sdb-delivery-list">${upcomingHtml}</div>
      </div>
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
  const late = lots.filter(l => typeof isLate === 'function' && isLate(l) && String(l.sector || '').toLowerCase() !== 'entregue');
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
        <div class="dash-metric m-blue" onclick="navigateTo('lots')"><i class="fas fa-industry"></i><div><strong>${inProd.length}</strong><span>Em produção</span><small>Lotes ativos</small></div></div>
        <div class="dash-metric m-teal" onclick="navigateTo('deliveries')"><i class="fas fa-check"></i><div><strong>${readyLots.length}</strong><span>Prontos</span><small>Aguardando rota</small></div></div>
        <div class="dash-metric m-orange" onclick="navigateTo('deliveries')"><i class="fas fa-truck"></i><div><strong>${inRouteLots.length}</strong><span>Em rota</span><small>Pedidos/lotes na rua</small></div></div>
        <div class="dash-metric m-green" onclick="navigateTo('deliveries')"><i class="fas fa-box"></i><div><strong>${deliveredLots.length}</strong><span>Entregues</span><small>Concluídos</small></div></div>
        <div class="dash-metric m-purple" onclick="navigateTo('orders')"><i class="fas fa-calendar-day"></i><div><strong>${today.length}</strong><span>Hoje</span><small>Entrega hoje</small></div></div>
        <div class="dash-metric m-yellow" onclick="navigateTo('orders')"><i class="fas fa-bolt"></i><div><strong>${urgent.length}</strong><span>Prioritários</span><small>Urgente/mesmo dia</small></div></div>
        <div class="dash-metric m-red" onclick="navigateTo('orders')"><i class="fas fa-clock"></i><div><strong>${late.length}</strong><span>Atrasados</span><small>Fora do prazo</small></div></div>
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
  const late = lots.filter(l => typeof isLate === 'function' && isLate(l) && String(l.sector || '').toLowerCase() !== 'entregue');
  const recentRoutes = ffDashLatestRoutesByDriver(STATE.routes, STATE.lots, 3);

  page.innerHTML = `
    <div class="dash-clean">
      <div class="dash-hero">
        <div><h2><i class="fas fa-industry"></i> Painel Geral da Fábrica</h2><div class="dash-muted">Visão consolidada em tempo real.</div></div>
        <div class="dash-live"><span class="dash-dot"></span> Ao vivo</div>
      </div>

      <div class="dash-metrics">
        <div class="dash-metric m-blue"><i class="fas fa-industry"></i><div><strong>${inProd.length}</strong><span>Em produção</span></div></div>
        <div class="dash-metric m-teal"><i class="fas fa-check"></i><div><strong>${ready.length}</strong><span>Prontos</span></div></div>
        <div class="dash-metric m-orange"><i class="fas fa-truck"></i><div><strong>${inRoute.length}</strong><span>Em rota</span></div></div>
        <div class="dash-metric m-green"><i class="fas fa-box"></i><div><strong>${delivered.length}</strong><span>Entregues</span></div></div>
        <div class="dash-metric m-red"><i class="fas fa-clock"></i><div><strong>${late.length}</strong><span>Atrasados</span></div></div>
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
            <div class="dash-sector-bar"><span style="width:${pct}%;background:${(SECTOR_COLORS || {})[s] || '#144196'}"></span></div>
            <div class="dash-sector-count">${count}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}
