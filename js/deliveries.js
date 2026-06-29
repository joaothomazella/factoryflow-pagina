// ===================================================
// DELIVERIES.JS – Entregas por PEDIDO + status em tempo real
// PATCH INDUSCOLOR
// - Rota aparece por PEDIDO, não por lote
// - Busca ff_routes atualizado do backend antes de renderizar
// - Quando motorista confirma, mostra pedido entregue na tela do PCP
// - Compatível com rota nova por pedido e rota antiga por lote
// ===================================================

function ffDeliveriesResolveApiBase() {
  if (typeof PEDIDOS_API !== 'undefined' && PEDIDOS_API) return String(PEDIDOS_API).replace(/\/$/, '');
  if (typeof API_BASE !== 'undefined' && API_BASE) return String(API_BASE).replace(/\/$/, '');
  if (typeof API_URL !== 'undefined' && API_URL) return String(API_URL).replace(/\/$/, '');
  if (typeof BACKEND_URL !== 'undefined' && BACKEND_URL) return String(BACKEND_URL).replace(/\/$/, '');
  if (window.PEDIDOS_API) return String(window.PEDIDOS_API).replace(/\/$/, '');
  if (window.API_BASE) return String(window.API_BASE).replace(/\/$/, '');
  if (window.API_URL) return String(window.API_URL).replace(/\/$/, '');
  return 'https://app-producao-backend-production.up.railway.app';
}

function ffDeliveriesResolveToken() {
  return sessionStorage.getItem('ff_token')
    || localStorage.getItem('ff_token')
    || localStorage.getItem('factoryflow_token')
    || localStorage.getItem('ff_api_token')
    || localStorage.getItem('api_token')
    || localStorage.getItem('token')
    || '';
}

function ffDeliveriesHeaders(json = true) {
  const token = ffDeliveriesResolveToken();
  const headers = json ? { 'Content-Type': 'application/json' } : {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function ffDeliveriesApiGet(table, params = {}) {
  const api = ffDeliveriesResolveApiBase();
  const qs = new URLSearchParams({ limit: 1000, ...params }).toString();
  const res = await fetch(`${api}/api/tables/${table}?${qs}`, { headers: ffDeliveriesHeaders(false) });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GET ${table} falhou (${res.status}): ${txt}`);
  }
  const json = await res.json().catch(() => ({}));
  return json.data || [];
}

async function ffDeliveriesApiPut(table, id, data) {
  const api = ffDeliveriesResolveApiBase();
  const res = await fetch(`${api}/api/tables/${table}/${id}`, {
    method: 'PUT',
    headers: ffDeliveriesHeaders(true),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PUT ${table}/${id} falhou (${res.status}): ${txt}`);
  }
  return await res.json().catch(() => ({}));
}

async function ffDeliveriesProductionGet(params = {}) {
  const api = ffDeliveriesResolveApiBase();
  // Entregas só precisa de lotes prontos/em rota/entregues — filtrar por setor evita
  // que o backend faça o join pesado (cli_pedidos_itens/cli_clientes) sobre TODOS os
  // lotes de produção (pesagem, produção, coloração etc.), que é o que tornava a aba lenta.
  const setoresEntrega = 'pronto,entrega,entregue,finalizado,finalizada,concluido,concluído,cancelado,cancelada,rejeitado,rejeitada';
  const qs = new URLSearchParams({ limit: 2000, setor: setoresEntrega, ...params }).toString();
  const res = await fetch(`${api}/api/producao?${qs}`, { headers: ffDeliveriesHeaders(false) });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GET producao falhou (${res.status}): ${txt}`);
  }
  const json = await res.json().catch(() => ({}));
  return json.data || [];
}

function ffDeliveriesDeserializeProductionLot(row) {
  const sectorMap = {
    coloracao_revisao: 'coloracao_revisao', laboratorio_revisao: 'laboratorio_revisao', pcp_liberacao: 'pcp_liberacao',
    laboratorio_amostras: 'laboratorio_amostras', coloracao_amostras: 'coloracao_amostras', pesagem: 'pesagem', producao: 'producao',
    coloracao: 'coloracao', laboratorio: 'laboratorio', envase: 'envase_enlatamento', envase_produzir: 'envase_produzir',
    envase_enlatamento: 'envase_enlatamento', pronto: 'pronto', entrega: 'entrega', entregue: 'entregue'
  };
  const sector = sectorMap[String(row.setor_atual || '').toLowerCase()] || String(row.setor_atual || 'pesagem').toLowerCase();
  return {
    id: 'bridge_' + row.id,
    _bridgeId: row.id,
    _source: 'mysql',
    number: String(row.op || ''),
    op: String(row.op || ''),
    orderId: 'bridge_order_' + String(row.numero_pedido || ''),
    orderNumber: String(row.numero_pedido || ''),
    client: String(row.cliente_nome || ''),
    city: String(row.cliente_cidade || ''),
    address: [row.cliente_endereco, row.cliente_bairro].filter(Boolean).join(', '),
    productCode: String(row.produto_codigo || ''),
    paint: String(row.produto_nome || row.produto_codigo || ''),
    productType: String(row.tipo_lote || 'tinta').toLowerCase(),
    qty: Number(row.quantidade || 0),
    unit: 'Kg',
    priority: String(row.prioridade || 'normal').toLowerCase(),
    sector,
    status: sector,
    lotStatus: String(row.ff_lotStatus || row.status || 'idle'),
    deliveredAt: sector === 'entregue' ? (row.updated_at ? new Date(row.updated_at).getTime() : null) : null
  };
}

async function ffDeliveryAutoFinalizeCompletedRoutes(routes, lots) {
  // Corrige automaticamente rota que já teve todos os pedidos entregues,
  // mas ainda ficou salva como in_progress / Em Rota.
  const promises = [];

  for (const route of routes || []) {
    const stops = Array.isArray(route.lots) ? route.lots : [];
    if (!stops.length) continue;

    const allDelivered = stops.every(stop => ffDeliveryIsStopDelivered(stop, lots));
    const alreadyCompleted = String(route.status || '').toLowerCase() === 'completed';
    if (!allDelivered || alreadyCompleted) continue;

    const now = Date.now();
    const fixedStops = stops.map(stop => ({
      ...stop,
      status: 'delivered',
      deliveredAt: stop.deliveredAt || now
    }));

    route.status = 'completed';
    route.completedAt = route.completedAt || now;
    route.lots = fixedStops;

    promises.push(ffDeliveriesApiPut('ff_routes', route.id, {
      ...route,
      lots: JSON.stringify(fixedStops),
      status: 'completed',
      completedAt: route.completedAt,
      createdAt: Number(route.createdAt) || Date.now(),
      departureTime: route.departureTime ? Number(route.departureTime) : null
    }).catch(err => console.warn('Não consegui auto-finalizar rota', route.id, err)));
  }

  if (promises.length) await Promise.all(promises);
}

function ffDeliveriesParseJsonArray(value) {
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

function ffDeliveriesDeserializeRoute(row) {
  return {
    ...row,
    lots: ffDeliveriesParseJsonArray(row.lots),
    createdAt: Number(row.createdAt) || 0,
    departureTime: row.departureTime ? Number(row.departureTime) : null,
    completedAt: row.completedAt ? Number(row.completedAt) : null
  };
}

function ffDeliveriesDeserializeLot(row) {
  return {
    ...row,
    history: ffDeliveriesParseJsonArray(row.history),
    qty: Number(row.qty) || 0
  };
}

function ffDeliveryStopKey(stop) {
  return String(stop.orderKey || stop.orderNumber || stop.lotId || stop.number || '').trim();
}

function ffDeliveryStopLotIds(stop) {
  if (Array.isArray(stop.lotIds)) return stop.lotIds.map(String);
  if (typeof stop.lotIds === 'string' && stop.lotIds.trim()) {
    try {
      const parsed = JSON.parse(stop.lotIds);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch (_) {
      return stop.lotIds.split(',').map(x => x.trim()).filter(Boolean).map(String);
    }
  }
  if (stop.lotId) return [String(stop.lotId)];
  return [];
}

function ffDeliveryStopLotNumbers(stop) {
  if (Array.isArray(stop.lotNumbers) && stop.lotNumbers.length) return stop.lotNumbers.map(String);
  if (stop.number) return [String(stop.number)];
  return [];
}

function ffDeliveryOrderNumber(stop) {
  return String(stop.orderNumber || stop.orderKey || stop.number || ffDeliveryStopKey(stop) || 'Pedido').trim();
}

function ffDeliverySameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function ffDeliveryLotMatchesStop(lot, stop) {
  const ids = ffDeliveryStopLotIds(stop);
  if (ids.length && ids.includes(String(lot.id))) return true;

  const stopOrders = [stop.orderKey, stop.orderNumber, stop.number]
    .map(v => String(v || '').trim())
    .filter(Boolean);
  const lotOrders = [lot.orderNumber, lot.pedido, lot.pits_numero, lot.orderId, lot.pedidoNumero]
    .map(v => String(v || '').trim())
    .filter(Boolean);

  if (stopOrders.length && lotOrders.some(k => stopOrders.includes(k))) return true;

  // Rota antiga sem lotIds: usa cliente como fallback, só para lotes em entrega/entregue.
  if (!ids.length && ffDeliverySameText(lot.client || lot.cliente, stop.client) && ['entrega','entregue'].includes(String(lot.sector || '').toLowerCase())) {
    return true;
  }

  return false;
}

function ffDeliveryIsStopDelivered(stop, lots) {
  if (String(stop.status || '').toLowerCase() === 'delivered') return true;
  if (stop.deliveredAt) return true;

  const relatedLots = (lots || []).filter(l => ffDeliveryLotMatchesStop(l, stop));
  if (relatedLots.length === 0) return false;
  return relatedLots.every(l => String(l.sector || '').toLowerCase() === 'entregue' || l.deliveredAt);
}

function ffDeliveryFormatDateTime(ts) {
  if (!ts) return '–';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function ffDeliveryEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ffDeliveryRouteIsCompleted(route, lots) {
  const stops = Array.isArray(route.lots) ? route.lots : [];
  if (!stops.length) return String(route.status || '').toLowerCase() === 'completed';
  return String(route.status || '').toLowerCase() === 'completed' || stops.every(s => ffDeliveryIsStopDelivered(s, lots));
}

function ffDeliveryBuildRouteCard(route, lots, completed = false) {
  const stops = Array.isArray(route.lots) ? route.lots : [];
  const total = stops.length;
  const done = stops.filter(s => ffDeliveryIsStopDelivered(s, lots)).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const driverName = route.driverName || route.motorista || 'Motorista';

  return `
    <div class="delivery-route-card" style="background:var(--bg2,#1e293b);border:1px solid ${completed ? 'rgba(34,197,94,.45)' : 'rgba(249,115,22,.45)'};border-radius:16px;padding:1rem;margin-bottom:1rem;max-width:520px">
      <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;margin-bottom:.75rem">
        <div>
          <div style="font-weight:800;font-size:1rem;color:var(--text,#f1f5f9)"><i class="fas fa-user"></i> ${ffDeliveryEscape(driverName)}</div>
          <div style="font-size:.82rem;color:var(--text2,#94a3b8);margin-top:.25rem">
            <i class="fas fa-clock"></i> Saída: ${ffDeliveryFormatDateTime(route.departureTime || route.createdAt)}
          </div>
        </div>
        <span style="background:${completed ? '#22c55e' : '#f97316'};color:#fff;border-radius:999px;padding:.28rem .65rem;font-size:.72rem;font-weight:800">
          ${completed ? 'CONCLUÍDA' : 'EM ROTA'}
        </span>
      </div>

      <div style="display:flex;flex-direction:column;gap:.45rem;margin:.65rem 0">
        ${stops.map(stop => {
          const delivered = ffDeliveryIsStopDelivered(stop, lots);
          const orderNumber = ffDeliveryOrderNumber(stop);
          const lotNumbers = ffDeliveryStopLotNumbers(stop).join(', ');
          return `
            <div style="border:1px solid rgba(148,163,184,.18);background:${delivered ? 'rgba(34,197,94,.12)' : 'rgba(15,23,42,.35)'};border-radius:10px;padding:.55rem .65rem">
              <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center">
                <strong style="font-size:.85rem;color:${delivered ? '#86efac' : '#fff'}">${delivered ? '✅ ' : ''}Pedido #${ffDeliveryEscape(orderNumber)}</strong>
                <span style="font-size:.7rem;color:${delivered ? '#86efac' : 'var(--text2,#94a3b8)'};font-weight:700">${delivered ? 'ENTREGUE' : 'PENDENTE'}</span>
              </div>
              <div style="font-size:.78rem;color:var(--text2,#94a3b8);margin-top:.2rem">${ffDeliveryEscape(stop.client || '')}${stop.city ? ' – ' + ffDeliveryEscape(stop.city) : ''}</div>
              ${lotNumbers ? `<div style="font-size:.72rem;color:var(--text2,#94a3b8);margin-top:.15rem">Lotes: ${ffDeliveryEscape(lotNumbers)}</div>` : ''}
              ${delivered && stop.deliveredAt ? `<div style="font-size:.72rem;color:#86efac;margin-top:.15rem">Confirmado: ${ffDeliveryFormatDateTime(stop.deliveredAt)}${stop.deliveredBy ? ' por ' + ffDeliveryEscape(stop.deliveredBy) : ''}</div>` : ''}
            </div>`;
        }).join('')}
      </div>

      <div style="height:7px;background:rgba(148,163,184,.18);border-radius:999px;overflow:hidden;margin:.75rem 0 .45rem">
        <div style="height:100%;width:${percent}%;background:${completed ? '#22c55e' : '#3b82f6'};border-radius:999px"></div>
      </div>
      <div style="font-size:.85rem;color:var(--text2,#94a3b8);font-weight:700">${done}/${total} pedido(s) entregues</div>
    </div>`;
}


const FF_DELIVERIES_REFRESH_MS = 60000;
let __ffDeliveriesLoading = false;
let __ffDeliveriesLastLoad = 0;
let __ffDeliveriesCache = null;

function ffDeliveryRenderLoadedPage(page, routes, lots) {
  const activeRoutes = routes.filter(r => !ffDeliveryRouteIsCompleted(r, lots));
  const completedRoutes = routes.filter(r => ffDeliveryRouteIsCompleted(r, lots)).slice(0, 10);
  const lastUpdate = __ffDeliveriesLastLoad
    ? new Date(__ffDeliveriesLastLoad).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '–';

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-truck"></i> Entregas</h2>
      <div class="header-actions">
        <span class="pe-perm-badge"><i class="fas fa-clock"></i> Atualiza a cada 1 min</span>
        <span class="pe-perm-badge"><i class="fas fa-sync-alt"></i> Última: ${lastUpdate}</span>
        <button onclick="renderDeliveries({ force: true })" class="btn btn-secondary"><i class="fas fa-sync"></i> Atualizar</button>
        ${typeof openSendToDelivery === 'function' ? `<button onclick="openSendToDelivery()" class="btn btn-primary"><i class="fas fa-route"></i> Nova Rota</button>` : ''}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;margin-bottom:1rem">
      <div class="metric-card"><div class="metric-num">${activeRoutes.length}</div><div class="metric-label">Rotas em andamento</div></div>
      <div class="metric-card"><div class="metric-num">${completedRoutes.length}</div><div class="metric-label">Rotas concluídas recentes</div></div>
    </div>

    <section style="margin-top:1rem">
      <h3 style="color:#f97316;margin-bottom:.75rem"><i class="fas fa-truck-moving"></i> Rotas em Andamento (${activeRoutes.length})</h3>
      ${activeRoutes.length === 0
        ? `<div class="empty-state"><i class="fas fa-check-circle"></i><p>Nenhuma rota em andamento.</p></div>`
        : activeRoutes.map(r => ffDeliveryBuildRouteCard(r, lots, false)).join('')}
    </section>

    <section style="margin-top:1.25rem">
      <h3 style="color:#22c55e;margin-bottom:.75rem"><i class="fas fa-check-circle"></i> Concluídas Recentes (${completedRoutes.length})</h3>
      ${completedRoutes.length === 0
        ? `<div class="empty-state"><p>Nenhuma rota concluída recente.</p></div>`
        : completedRoutes.map(r => ffDeliveryBuildRouteCard(r, lots, true)).join('')}
    </section>`;
}

async function renderDeliveries(options = {}) {
  const page = document.getElementById('pageDeliveries')
    || document.getElementById('pageDelivery')
    || document.getElementById('pageEntregas')
    || document.querySelector('[data-page="deliveries"].page')
    || document.querySelector('.page.active');

  if (!page) return;

  const force = options === true || !!options.force;
  const now = Date.now();
  const cacheIsFresh = __ffDeliveriesCache && (now - __ffDeliveriesLastLoad) < FF_DELIVERIES_REFRESH_MS;

  // Se já temos dados recentes, renderiza instantâneo e evita bater no backend toda hora.
  if (!force && cacheIsFresh) {
    ffDeliveryRenderLoadedPage(page, __ffDeliveriesCache.routes, __ffDeliveriesCache.lots);
    return;
  }

  // Evita várias requisições simultâneas quando a aba fica re-renderizando.
  if (__ffDeliveriesLoading) {
    if (__ffDeliveriesCache) ffDeliveryRenderLoadedPage(page, __ffDeliveriesCache.routes, __ffDeliveriesCache.lots);
    return;
  }

  __ffDeliveriesLoading = true;

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-truck"></i> Entregas</h2>
      <div class="header-actions">
        <button onclick="renderDeliveries({ force: true })" class="btn btn-secondary"><i class="fas fa-sync"></i> Atualizar</button>
        ${typeof openSendToDelivery === 'function' ? `<button onclick="openSendToDelivery()" class="btn btn-primary"><i class="fas fa-route"></i> Nova Rota</button>` : ''}
      </div>
    </div>
    <div style="padding:1rem;color:var(--text2,#94a3b8)"><i class="fas fa-spinner fa-spin"></i> Buscando rotas atualizadas...</div>`;

  try {
    const [routesRaw, productionRows] = await Promise.all([
      ffDeliveriesApiGet('ff_routes'),
      ffDeliveriesProductionGet()
    ]);

    const routes = routesRaw.map(ffDeliveriesDeserializeRoute)
      .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    const lots = productionRows.map(ffDeliveriesDeserializeProductionLot);

    if (window.STATE) {
      STATE.routes = routes;
      STATE.lots = lots;
    }

    __ffDeliveriesLastLoad = Date.now();
    __ffDeliveriesCache = { routes, lots };
    ffDeliveryRenderLoadedPage(page, routes, lots);

  } catch (err) {
    page.innerHTML = `
      <div class="page-header">
        <h2><i class="fas fa-truck"></i> Entregas</h2>
        <div class="header-actions"><button onclick="renderDeliveries({ force: true })" class="btn btn-secondary"><i class="fas fa-sync"></i> Tentar novamente</button></div>
      </div>
      <div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);color:#fecaca;padding:1rem;border-radius:12px">
        <strong>Erro ao carregar entregas:</strong><br>${ffDeliveryEscape(err.message)}
      </div>`;
  } finally {
    __ffDeliveriesLoading = false;
  }
}

// Atualização automática só quando a aba de entregas estiver aberta, com intervalo de 1 minuto.
if (!window.__ffDeliveriesAutoRefreshPedidoPatch) {
  window.__ffDeliveriesAutoRefreshPedidoPatch = true;
  setInterval(() => {
    const activePage = document.querySelector('.nav-item.active')?.dataset.page || '';
    const visibleDeliveries = document.getElementById('pageDeliveries')?.classList.contains('active')
      || document.getElementById('pageEntregas')?.classList.contains('active')
      || activePage === 'deliveries'
      || activePage === 'entregas';
    if (visibleDeliveries && typeof renderDeliveries === 'function') renderDeliveries();
  }, FF_DELIVERIES_REFRESH_MS);
}
