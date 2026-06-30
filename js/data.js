// ===================================================
// DATA.JS – Estado global, helpers e API compartilhada
// ===================================================

// --------- CONSTANTES ---------
// Ordem exata do Kanban (3 novos setores ANTES do restante)
const SECTORS = [
  'coloracao_revisao',
  'laboratorio_revisao',
  'pcp_liberacao',

  // Setores exclusivos para AMOSTRAS
  'laboratorio_amostras',
  'coloracao_amostras',

  'pesagem',
  'producao',
  'coloracao',
  'laboratorio',
  'envase_produzir',
  'envase_enlatamento',
  'pronto'
];

const SECTOR_LABELS = {
  coloracao_revisao:   'Coloração (Revisão)',
  laboratorio_revisao: 'Laboratório (Revisão)',
  pcp_liberacao:       'PCP (Liberação)',
  pesagem:             'Pesagem',
  producao:            'Produção',
  coloracao:           'Coloração',
  coloracao_amostras:  'Coloração – Amostras',
  laboratorio:         'Laboratório',
  laboratorio_amostras:'Laboratório – Amostras',
  envase:              'Envase',
  envase_produzir:     'Envase – Produzir',
  envase_enlatamento:  'Envase – Enlatamento',
  pronto:              'Pronto para Entrega',
  entrega:             'Em Rota de Entrega',
  entregue:            'Produto Entregue'
};

// Quais setores cada role/setor consegue ver no Kanban
// coloracao_user vê: coloracao + coloracao_revisao
// laboratorio_user vê: laboratorio + laboratorio_revisao
const SECTOR_VISIBILITY = {
  // PCP continua com acesso geral pelo role='pcp', mas também passa a existir
  // como grupo de expediente para tocar alerta e pausar/retomar tempos da liberação.
  pcp_liberacao: ['pcp_liberacao'],
  pcp:           ['pcp_liberacao'],

  pesagem:     ['pesagem'],
  producao:    ['producao'],

  // Coloração vê revisão, setor normal e amostras.
  // NÃO vê Produção.
  coloracao:   ['coloracao_revisao', 'coloracao', 'coloracao_amostras'],

  // Laboratório vê revisão, setor normal e amostras.
  // NÃO vê Produção.
  laboratorio: ['laboratorio_revisao', 'laboratorio', 'laboratorio_amostras'],

  envase:      ['envase_produzir', 'envase_enlatamento']
};

const PRIORITY_LABELS = { normal:'Normal', urgent:'Urgente', sameday:'Mesmo Dia' };
const PRIORITY_COLORS  = { normal:'#22c55e', urgent:'#f59e0b', sameday:'#ef4444' };
const PRIORITY_ORDER   = { sameday: 0, urgent: 1, normal: 2 };

const ROLE_LABELS = {
  sector:      'Usuário de Setor',
  driver:      'Motorista',
  viewer:      'Visualizador',
  tv:          'TV / Painel',
  pcp:         'PCP',
  pcp_lib:     'PCP (Liberação)',
  manager:     'Gerente',
  diretoria:   'Diretoria',
  admin:       'Administrador'
};

const SECTOR_COLORS = {
  coloracao_revisao:   '#e879f9',   // fuchsia
  laboratorio_revisao: '#2dd4bf',   // teal
  pcp_liberacao:       '#f43f5e',   // rose
  pesagem:             '#144196',
  producao:            '#8b5cf6',
  coloracao:           '#f59e0b',
  coloracao_amostras:  '#facc15',
  laboratorio:         '#10b981',
  laboratorio_amostras:'#14b8a6',
  envase_produzir:     '#f97316',
  envase_enlatamento:  '#06b6d4',
  pronto:              '#22c55e',
  entrega:             '#f97316',
  entregue:            '#6b7280'
};

// --------- TIPOS DE PRODUTO ---------
const PRODUCT_TYPES = {
  tinta:       'Tinta',
  diluente:    'Diluente',
  endurecedor: 'Endurecedor',
  base:        'Base',
  amostra:     'Amostra'
};

// Fluxos por tipo de produto
// diluente:    PCP → Envase → Pronto (sem pesagem/producao/coloracao/lab)
// endurecedor: PCP → [Pesagem → Produção → Envase] OU [Direto Envase] – escolha dinâmica em pcp_liberacao
// tinta / base: fluxo completo conforme antes
const PRODUCT_FLOWS = {
  // Tinta: quando sai do laboratório vai para Envase – Enlatamento
  // Isso resolve o problema do lote sair do Laboratório e cair no envase antigo/genérico.
  tinta:       ['coloracao_revisao','laboratorio_revisao','pcp_liberacao','pesagem','producao','coloracao','laboratorio','envase_enlatamento','pronto'],

  // Diluente: sai direto do PCP para Envase – Produzir
  diluente:    ['coloracao_revisao','laboratorio_revisao','pcp_liberacao','envase_produzir','pronto'],

  // Endurecedor: pode ir para produção e depois Enlatamento; se sair direto do PCP, vai para Produzir
  endurecedor: ['coloracao_revisao','laboratorio_revisao','pcp_liberacao','pesagem','producao','envase_enlatamento','pronto'],

  // Base: NÃO passa pelo envase e NÃO vai para entrega.
  // Ao sair do laboratório, finaliza automaticamente no FactoryFlow.
  base:        ['coloracao_revisao','laboratorio_revisao','pcp_liberacao','pesagem','producao','laboratorio','entregue'],

  // Amostra: PCP manda direto para Laboratório – Amostras.
  // No Laboratório – Amostras, o operador escolhe: Coloração – Amostras ou Pronto para Entrega.
  // Se passar pela Coloração – Amostras, volta para Laboratório – Amostras e depois pode ir para Pronto.
  amostra:     ['pcp_liberacao','laboratorio_amostras','coloracao_amostras','laboratorio_amostras','pronto']
};
// Fluxo alternativo para endurecedor direto (PCP → Envase Produzir → Pronto)
const ENDURECEDOR_FLOW_DIRECT = ['coloracao_revisao','laboratorio_revisao','pcp_liberacao','envase_produzir','pronto'];

// --------- ESTADO GLOBAL ---------
let STATE = {
  currentUser:   null,
  lots:          [],
  orders:        [],
  users:         [],
  routes:        [],
  alertsOpen:    false,
  loading:       false,

  // Controle de expediente por setor
  // Ex.: { coloracao: { setor:'coloracao', expediente_aberto:1, iniciado_em:'...', finalizado_em:'...' } }
  sectorShifts:  {},

  // Rastreia sons já tocados p/ não repetir
  _soundedLots:  new Set()
};

// PATCH PERFORMANCE/DEBUG: deixa o estado acessível no F12 e para outros módulos que usam window.STATE.
window.STATE = STATE;

// ===================================================
// API HELPERS
// ===================================================
const FACTORYFLOW_DATA_API_BASE = 'https://app-producao-backend-production.up.railway.app';

function resolveFactoryFlowApiBase() {
  if (typeof PEDIDOS_API !== 'undefined' && PEDIDOS_API) return String(PEDIDOS_API).replace(/\/$/, '');
  if (typeof API_BASE !== 'undefined' && API_BASE) return String(API_BASE).replace(/\/$/, '');
  if (typeof API_URL !== 'undefined' && API_URL) return String(API_URL).replace(/\/$/, '');
  if (typeof BACKEND_URL !== 'undefined' && BACKEND_URL) return String(BACKEND_URL).replace(/\/$/, '');
  if (window.PEDIDOS_API) return String(window.PEDIDOS_API).replace(/\/$/, '');
  if (window.API_BASE) return String(window.API_BASE).replace(/\/$/, '');
  if (window.API_URL) return String(window.API_URL).replace(/\/$/, '');
  if (window.BACKEND_URL) return String(window.BACKEND_URL).replace(/\/$/, '');
  return FACTORYFLOW_DATA_API_BASE;
}

function resolveFactoryFlowApiToken() {
  return sessionStorage.getItem('ff_token')
    || localStorage.getItem('ff_token')
    || localStorage.getItem('factoryflow_token')
    || localStorage.getItem('ff_api_token')
    || localStorage.getItem('api_token')
    || localStorage.getItem('token')
    || '';
}

function resolveFactoryFlowSessionToken() {
  return sessionStorage.getItem('ff_token')
    || localStorage.getItem('ff_token')
    || localStorage.getItem('token')
    || '';
}

function factoryFlowAuthHeaders(json = true) {
  const sessionToken = resolveFactoryFlowSessionToken();
  const apiToken = resolveFactoryFlowApiToken();
  const token = sessionToken || apiToken;
  const headers = json ? { 'Content-Type': 'application/json' } : {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function normalizeFactoryFlowTable(table) {
  return String(table || '')
    .replace(/^\/+/, '')
    .replace(/^api\/tables\/?/i, '')
    .replace(/^tables\/?/i, '');
}

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

async function apiGet(table, params = {}) {
  const tableName = normalizeFactoryFlowTable(table);
  const timeoutMs = Number(params._timeout || 8000);
  const cleanParams = { limit: 500, ...params };
  delete cleanParams._timeout;
  const qs = new URLSearchParams(cleanParams).toString();
  const res = await fetchWithTimeout(`${resolveFactoryFlowApiBase()}/api/tables/${tableName}?${qs}`, {
    headers: factoryFlowAuthHeaders(false)
  }, timeoutMs);
  if (!res.ok) throw new Error(`GET ${tableName} falhou: ${res.status}`);
  return (await res.json()).data || [];
}
async function apiPost(table, data) {
  const tableName = normalizeFactoryFlowTable(table);
  const res = await fetch(`${resolveFactoryFlowApiBase()}/api/tables/${tableName}`, {
    method:'POST', headers:factoryFlowAuthHeaders(true), body:JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`POST ${tableName} falhou: ${res.status}`);
  return res.json();
}
async function apiPut(table, id, data) {
  const tableName = normalizeFactoryFlowTable(table);
  const res = await fetch(`${resolveFactoryFlowApiBase()}/api/tables/${tableName}/${id}`, {
    method:'PUT', headers:factoryFlowAuthHeaders(true), body:JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`PUT ${tableName}/${id} falhou: ${res.status}`);
  return res.json();
}
async function apiPatch(table, id, data) {
  const tableName = normalizeFactoryFlowTable(table);
  const res = await fetch(`${resolveFactoryFlowApiBase()}/api/tables/${tableName}/${id}`, {
    method:'PATCH', headers:factoryFlowAuthHeaders(true), body:JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`PATCH ${tableName}/${id} falhou: ${res.status}`);
  return res.json();
}
async function apiDelete(table, id) {
  const tableName = normalizeFactoryFlowTable(table);
  const res = await fetch(`${resolveFactoryFlowApiBase()}/api/tables/${tableName}/${id}`, {
    method:'DELETE',
    headers: factoryFlowAuthHeaders(false)
  });
  if (!res.ok) throw new Error(`DELETE ${tableName}/${id} falhou: ${res.status}`);
}

// ===================================================
// SERIALIZAÇÃO
// ===================================================
function serializeLot(lot) {
  return {
    ...lot,
    history:              typeof lot.history         === 'string' ? lot.history         : JSON.stringify(lot.history         || []),
    workSessions:         typeof lot.workSessions    === 'string' ? lot.workSessions    : JSON.stringify(lot.workSessions    || []),
    sectorMetrics:        typeof lot.sectorMetrics   === 'string' ? lot.sectorMetrics   : JSON.stringify(lot.sectorMetrics   || []),
    skipColor:            lot.skipColor ? true : false,
    rejected:             lot.rejected  ? true : false,
    rejectedAt:           Number(lot.rejectedAt)      || null,
    rejectedReason:       lot.rejectedReason || '',
    rejectedBy:           lot.rejectedBy     || '',
    rejectedSector:       lot.rejectedSector || '',
    qty:                  Number(lot.qty) || 0,
    createdAt:            Number(lot.createdAt)       || Date.now(),
    sectorEnteredAt:      Number(lot.sectorEnteredAt) || Date.now(),
    productType:          lot.productType || 'tinta',
    lotStatus:            lot.lotStatus   || 'idle',
    deliveryDateManual:   lot.deliveryDateManual   || '',
    endurecedorRoute:     lot.endurecedorRoute     || '',
    destinoEndurecedor:   lot.destinoEndurecedor   || '',
    expedientePausedStatus: lot.expedientePausedStatus || ''
  };
}
function deserializeLot(row) {
  let history = [], workSessions = [], sectorMetrics = [];
  try { history      = typeof row.history      === 'string' ? JSON.parse(row.history)      : (row.history      || []); } catch(e){ history=[]; }
  try { workSessions = typeof row.workSessions === 'string' ? JSON.parse(row.workSessions) : (row.workSessions || []); } catch(e){ workSessions=[]; }
  try { sectorMetrics = typeof row.sectorMetrics === 'string' ? JSON.parse(row.sectorMetrics) : (row.sectorMetrics || []); } catch(e){ sectorMetrics=[]; }
  // sectorEnteredAt: fallback to last history entry or createdAt (backward compat)
  const sea = Number(row.sectorEnteredAt) || (history.length>0 ? Number(history[history.length-1].timestamp) : Number(row.createdAt)) || Date.now();
  return {
    ...row,
    history,
    workSessions,
    sectorMetrics,
    skipColor:            row.skipColor  === true || row.skipColor  === 'true',
    rejected:             row.rejected   === true || row.rejected   === 'true',
    rejectedAt:           Number(row.rejectedAt) || null,
    rejectedReason:       row.rejectedReason || '',
    rejectedBy:           row.rejectedBy     || '',
    rejectedSector:       row.rejectedSector || '',
    qty:                  Number(row.qty) || 0,
    createdAt:            Number(row.createdAt) || 0,
    updatedAt:            Number(row.updatedAt) || Number(row.updated_at) || 0,
    updated_at:           row.updated_at || '',
    sectorEnteredAt:      sea,
    productType:          row.productType || 'tinta',
    lotStatus:            row.lotStatus   || 'idle',
    deliveryDateManual:   row.deliveryDateManual   || '',
    endurecedorRoute:     row.endurecedorRoute     || '',
    destinoEndurecedor:   row.destinoEndurecedor   || '',
    expedientePausedStatus: row.expedientePausedStatus || row.ff_expedientePausedStatus || ''
  };
}

const ACTIVE_KANBAN_EXCLUDED_VALUES = new Set([
  'entrega',
  'entregue',
  'finalizado',
  'finalizada',
  'cancelado',
  'cancelada',
  'rejeitado',
  'rejeitada',
  'em_rota'
]);

function normalizeActiveKanbanValue(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseKanbanLotDate(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n < 10000000000 ? n * 1000 : n;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseKanbanArray(value) {
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

function kanbanRouteStops(route) {
  return [
    ...parseKanbanArray(route?.lots),
    ...parseKanbanArray(route?.orders),
    ...parseKanbanArray(route?.stops),
    ...parseKanbanArray(route?.entregas)
  ];
}

function kanbanStopDelivered(route, stop) {
  const routeStatus = normalizeActiveKanbanValue(route?.status || route?.routeStatus || route?.situacao);
  const stopStatus = normalizeActiveKanbanValue(stop?.status || stop?.deliveryStatus || stop?.situacao);
  return ['completed', 'complete', 'concluida', 'concluido', 'finalizada', 'finalizado', 'done'].includes(routeStatus)
    || ['delivered', 'entregue', 'completed', 'complete', 'concluido', 'concluida', 'done', 'ok'].includes(stopStatus)
    || !!(stop?.deliveredAt || stop?.confirmedAt);
}

function kanbanStopLotNumbers(stop) {
  const values = [];
  const lots = stop?.lotNumbers || stop?.lotsNumbers || stop?.lotes || stop?.lots || [];

  if (Array.isArray(lots)) {
    lots.forEach(item => {
      if (item && typeof item === 'object') values.push(item.number, item.op, item.lotNumber, item.id);
      else values.push(item);
    });
  }

  values.push(stop?.lotNumber, stop?.lot, stop?.op, stop?.number);
  return values.map(v => String(v || '').trim()).filter(Boolean);
}

function kanbanStopLotIds(stop) {
  const ids = stop?.lotIds || stop?.lotId || [];
  if (Array.isArray(ids)) return ids.map(v => String(v || '').trim()).filter(Boolean);
  if (typeof ids === 'string' && ids.trim()) {
    try {
      const parsed = JSON.parse(ids);
      if (Array.isArray(parsed)) return parsed.map(v => String(v || '').trim()).filter(Boolean);
    } catch (_) {}
    return ids.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function kanbanStopOrderNumbers(stop) {
  return [
    stop?.orderKey,
    stop?.orderNumber,
    stop?.pedido,
    stop?.pedidoNumero,
    stop?.numeroPedido,
    stop?.number
  ].map(v => String(v || '').trim()).filter(Boolean);
}

function isDeliveredByRoute(lot) {
  const lotId = String(lot?.id || '').trim();
  const lotNumber = String(lot?.number || lot?.op || '').trim();
  const orderNumber = String(lot?.orderNumber || lot?.pedido || lot?.pits_numero || lot?.raw_mysql?.numero_pedido || '').trim();

  if (!lotId && !lotNumber && !orderNumber) return false;

  return (STATE.routes || []).some(route => kanbanRouteStops(route).some(stop => {
    if (!kanbanStopDelivered(route, stop)) return false;
    const ids = kanbanStopLotIds(stop);
    const numbers = kanbanStopLotNumbers(stop);
    const orders = kanbanStopOrderNumbers(stop);
    return (lotId && ids.includes(lotId))
      || (lotNumber && numbers.includes(lotNumber))
      || (orderNumber && orders.includes(orderNumber));
  }));
}

function isManualKanbanLot(lot) {
  const origem = normalizeActiveKanbanValue(lot?.origem || lot?.raw_mysql?.origem || lot?.notes);
  const id = String(lot?.id || '').toLowerCase();
  return origem === 'manual' || id.startsWith('lot') || (!lot?._source && !id.startsWith('bridge_'));
}

function isActiveKanbanLot(lot) {
  if (!lot || lot.rejected) return false;

  const sector = normalizeActiveKanbanValue(
    lot.sector || lot.setor_atual || lot.sourceSector || lot.raw_mysql?.setor_atual || lot.setor
  );
  const status = normalizeActiveKanbanValue(
    lot.status || lot.backendStatus || lot.mysql_status || lot.raw_mysql?.status || lot.lotStatus
  );

  if (ACTIVE_KANBAN_EXCLUDED_VALUES.has(sector)) return false;
  if (ACTIVE_KANBAN_EXCLUDED_VALUES.has(status)) return false;
  if (isDeliveredByRoute(lot)) return false;

  const dateMs = parseKanbanLotDate(lot.updatedAt)
    || parseKanbanLotDate(lot.updated_at)
    || parseKanbanLotDate(lot.raw_mysql?.updated_at)
    || parseKanbanLotDate(lot.createdAt)
    || parseKanbanLotDate(lot.raw_mysql?.data_criacao);

  // PATCH: não derruba lote ativo por idade.
  // O backend /api/producao/ativos já filtra entregue/finalizado/cancelado.
  // Antes havia corte de 7 dias, que fazia o Kanban zerar quando o relógio/data divergia.
  if (dateMs) return true;

  return isManualKanbanLot(lot) || ['working', 'paused', 'idle'].includes(normalizeActiveKanbanValue(lot.lotStatus));
}
function serializeOrder(order) {
  return { ...order, lotIds: typeof order.lotIds==='string'?order.lotIds:JSON.stringify(order.lotIds||[]), createdAt:Number(order.createdAt)||Date.now() };
}
function deserializeOrder(row) {
  let lotIds=[];
  try{ lotIds=typeof row.lotIds==='string'?JSON.parse(row.lotIds):(row.lotIds||[]); }catch(e){}
  return { ...row, lotIds, createdAt:Number(row.createdAt)||0 };
}
function serializeRoute(route) {
  return { ...route, lots:typeof route.lots==='string'?route.lots:JSON.stringify(route.lots||[]), createdAt:Number(route.createdAt)||Date.now(), departureTime:route.departureTime?Number(route.departureTime):null };
}
function deserializeRoute(row) {
  let lots=[];
  try{ lots=typeof row.lots==='string'?JSON.parse(row.lots):(row.lots||[]); }catch(e){}
  return { ...row, lots, createdAt:Number(row.createdAt)||0, departureTime:row.departureTime?Number(row.departureTime):null };
}


// ===================================================
// MYSQL-ONLY / DEDUPE DE LOTES
// Fonte oficial atual: producao_lotes via bridge (/api/producao/ativos).
// ff_lots fica como legado e não deve alimentar o Kanban quando houver lote MySQL.
// ===================================================
function ffLotOpKey(lot) {
  const raw = String(
    lot?.op ||
    lot?.number ||
    lot?.numero_lote ||
    lot?.lote ||
    lot?.raw_mysql?.op ||
    lot?.raw_mysql?.pits_op ||
    lot?.raw_mysql?.numero_lote ||
    ''
  ).trim();

  const match = raw.match(/\b\d{5,8}\b/);
  return match ? match[0].padStart(6, '0') : raw;
}

function ffIsMysqlLot(lot) {
  return !!(
    lot && (
      lot._source === 'mysql' ||
      lot.raw_mysql ||
      String(lot.id || '').startsWith('bridge_')
    )
  );
}

function ffDedupeLotsPreferMysql(lots) {
  const map = new Map();

  for (const lot of lots || []) {
    if (!lot) continue;
    const op = ffLotOpKey(lot);
    const key = op || `__sem_op_${lot.id || Math.random()}`;
    const current = map.get(key);

    if (!current) {
      map.set(key, lot);
      continue;
    }

    const lotMysql = ffIsMysqlLot(lot);
    const currentMysql = ffIsMysqlLot(current);

    // Preferência absoluta: MySQL/producao_lotes.
    if (lotMysql && !currentMysql) {
      map.set(key, lot);
      continue;
    }

    // Se os dois têm a mesma origem, fica com o mais atualizado.
    const lotTime = Number(lot.updatedAt || lot.updated_at || lot.createdAt || 0);
    const currentTime = Number(current.updatedAt || current.updated_at || current.createdAt || 0);
    if (lotMysql === currentMysql && lotTime > currentTime) {
      map.set(key, lot);
    }
  }

  return [...map.values()];
}

function ffApplyOfficialLots(lots) {
  STATE.lots = ffDedupeLotsPreferMysql(lots || [])
    .filter(isActiveKanbanLot);
  return STATE.lots;
}

function ffProductionStatusForSector(sector, rejected = false) {
  const s = String(sector || '').toLowerCase().trim();
  if (rejected) return 'rejeitado';
  if (s === 'pronto') return 'pronto';
  if (s === 'entrega' || s === 'em_rota') return 'em_rota';
  if (s === 'entregue' || s === 'finalizado') return 'entregue';
  return 'em_producao';
}


function ffFirstPositiveNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function ffResolveQuantidadeKgFromLot(lot) {
  // Prioridade: peso real em Kg. Só usa qty/quantidade como fallback.
  return ffFirstPositiveNumber(
    lot?.peso,
    lot?.pits_peso,
    lot?.peso_kg,
    lot?.quantidade_kg,
    lot?.kg,
    lot?.weight,
    lot?.raw_mysql?.pits_peso,
    lot?.raw_mysql?.peso,
    lot?.raw_mysql?.peso_kg,
    lot?.raw_mysql?.quantidade_kg,
    lot?.qty,
    lot?.quantidade,
    lot?.raw_mysql?.quantidade,
    lot?.pits_qtde,
    lot?.raw_mysql?.pits_qtde
  );
}


function ffNormalizeProductType(value, productName = '', productCode = '') {
  const raw = String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const name = String(productName || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const code = String(productCode || '').toLowerCase().trim();

  if (raw === 'base' || raw.includes('base') || name.includes('base')) return 'base';
  if (raw === 'amostra' || raw.includes('amostra') || name.includes('amostra')) return 'amostra';
  if (raw === 'diluente' || raw.includes('diluente') || raw.includes('solvente') || name.includes('diluente') || name.includes('solvente')) return 'diluente';
  if (raw === 'endurecedor' || raw.includes('endurecedor') || name.includes('endurecedor') || code.startsWith('035')) return 'endurecedor';

  return 'tinta';
}

function ffBuildProductionPayloadFromLot(lot) {
  const sector = String(lot?.sector || lot?.setor_atual || lot?.currentSector || 'pcp_liberacao').trim();
  const produtoCodigo = String(lot?.productCode || lot?.produto_codigo || lot?.raw_mysql?.produto_codigo || '').trim();
  const produtoNome = String(lot?.paint || lot?.productName || lot?.produto_nome || lot?.raw_mysql?.produto_nome || '').trim();
  const productType = ffNormalizeProductType(
    lot?.productType || lot?.tipo_lote || lot?.tipo || lot?.raw_mysql?.tipo_lote || lot?.linha_produto || lot?.raw_mysql?.linha_produto,
    produtoNome,
    produtoCodigo
  );

  return {
    op: String(lot?.op || lot?.number || '').trim(),
    numero_pedido: String(lot?.orderNumber || lot?.pedido || lot?.numero_pedido || '').trim(),
    cliente_codigo: String(lot?.cliente_codigo || lot?.clientCode || lot?.raw_mysql?.cliente_codigo || '').trim(),
    cliente_nome: String(lot?.client || lot?.cliente_nome || lot?.raw_mysql?.cliente_nome || '').trim(),
    produto_codigo: produtoCodigo,
    produto_nome: produtoNome,
    quantidade: ffResolveQuantidadeKgFromLot(lot),
    peso: ffResolveQuantidadeKgFromLot(lot),
    tipo_lote: productType,
    linha_produto: String(lot?.linha_produto || lot?.raw_mysql?.linha_produto || productType),
    prioridade: String(lot?.priority || lot?.prioridade || 'normal').toLowerCase(),
    status: ffProductionStatusForSector(sector, !!lot?.rejected),
    setor_atual: sector
  };
}

async function ffCreateProductionLot(lot) {
  const baseUrl = resolveFactoryFlowApiBase();
  const payload = ffBuildProductionPayloadFromLot(lot);

  if (!payload.op) {
    throw new Error('Não foi possível criar lote em producao_lotes: OP/lote vazio.');
  }

  const createRes = await fetch(`${baseUrl}/api/producao/manual`, {
    method: 'POST',
    headers: factoryFlowAuthHeaders(true),
    body: JSON.stringify(payload)
  });

  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok || createJson.ok === false || !createJson.data?.id) {
    throw new Error(createJson.error || createJson.message || `POST /api/producao/manual falhou: ${createRes.status}`);
  }

  const bridgeId = createJson.data.id;
  const now = Date.now();
  const history = ffSafeParseArray(lot.history);
  const workSessions = ffSafeParseArray(lot.workSessions);
  const sectorMetrics = ffSafeParseArray(lot.sectorMetrics);

  const patchPayload = {
    setor_atual: payload.setor_atual,
    status: payload.status,
    prioridade: payload.prioridade,
    tipo_lote: payload.tipo_lote,
    ff_lotStatus: lot.lotStatus || 'idle',
    ff_sectorEnteredAt: Number(lot.sectorEnteredAt) || Number(history.at(-1)?.timestamp) || now,
    ff_workSessions: JSON.stringify(workSessions),
    ff_sectorMetrics: JSON.stringify(sectorMetrics),
    ff_history: JSON.stringify(history.length ? history : [{
      sector: payload.setor_atual,
      user: lot.createdBy || STATE.currentUser?.id || 'sistema',
      userName: STATE.currentUser?.name || STATE.currentUser?.username || 'Sistema',
      action: `Lote criado no FactoryFlow - OP ${payload.op}`,
      timestamp: now
    }]),
    ff_expedientePausedStatus: lot.expedientePausedStatus || ''
  };

  const patchRes = await fetch(`${baseUrl}/api/producao/${bridgeId}`, {
    method: 'PATCH',
    headers: factoryFlowAuthHeaders(true),
    body: JSON.stringify(patchPayload)
  });

  const patchJson = await patchRes.json().catch(() => ({}));
  if (!patchRes.ok || patchJson.ok === false) {
    throw new Error(patchJson.error || patchJson.message || `PATCH /api/producao/${bridgeId} falhou: ${patchRes.status}`);
  }

  return deserializeBridgeLot(patchJson.data || { ...createJson.data, ...patchPayload, id: bridgeId });
}

// ===================================================
// CARREGAMENTO
// ===================================================
let _ffReloadDataPromise = null;

async function initData() {
  showLoadingOverlay(true);
  try {
    // Fonte oficial dos lotes: producao_lotes via bridge.
    await loadBridgeLots({ limit: 300, force: true, timeout: 12000 });
    ffApplyOfficialLots(STATE.lots || []);

    const [routesRes, usersRes, ordersRes] = await Promise.allSettled([
      apiGet('ff_routes', { limit: 300, _timeout: 5000 }),
      apiGet('ff_users', { limit: 500, _timeout: 5000 }),
      apiGet('ff_orders', { limit: 500, _timeout: 5000 })
    ]);

    if (routesRes.status === 'fulfilled') STATE.routes = routesRes.value.map(deserializeRoute);
    else console.warn('initData: ff_routes falhou:', routesRes.reason?.message || routesRes.reason);

    if (usersRes.status === 'fulfilled') STATE.users = usersRes.value;
    else console.warn('initData: ff_users falhou:', usersRes.reason?.message || usersRes.reason);

    if (ordersRes.status === 'fulfilled') STATE.orders = ordersRes.value.map(deserializeOrder);
    else console.warn('initData: ff_orders falhou:', ordersRes.reason?.message || ordersRes.reason);

    if (typeof loadSectorShifts === 'function') {
      await loadSectorShifts().catch(() => {});
    }

    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage && typeof _silentRefresh === 'function') _silentRefresh(activePage);
  } catch(e) {
    alert('Erro ao conectar ao banco de dados. Verifique sua conexão.\n'+e.message);
  } finally { showLoadingOverlay(false); }
}
async function reloadData() {
  if (_ffReloadDataPromise) return _ffReloadDataPromise;

  _ffReloadDataPromise = (async () => {
  try {
    const prevLots = [...(STATE.lots || [])];

    await loadBridgeLots({ limit: 300, force: true, timeout: 12000 }).catch(e => {
      console.warn('reloadData: /api/producao falhou:', e.message);
    });

    const [routesRes, ordersRes] = await Promise.allSettled([
      apiGet('ff_routes', { limit: 300, _timeout: 5000 }),
      apiGet('ff_orders', { limit: 500, _timeout: 5000 })
    ]);

    if (routesRes.status === 'fulfilled') STATE.routes = routesRes.value.map(deserializeRoute);
    else console.warn('reloadData: ff_routes falhou:', routesRes.reason?.message || routesRes.reason);

    if (ordersRes.status === 'fulfilled') STATE.orders = ordersRes.value.map(deserializeOrder);
    else console.warn('reloadData: ff_orders falhou:', ordersRes.reason?.message || ordersRes.reason);

    // ff_users não pode travar o auto-update dos usuários de setor
    apiGet('ff_users', { limit: 500, _timeout: 5000 })
      .then(ur => {
        STATE.users = ur;
      })
      .catch(() => {});

    if (typeof loadSectorShifts === 'function') {
      await loadSectorShifts().catch(() => {});
    }

    // Mantém apenas a fonte oficial e remove qualquer duplicado legado.
    ffApplyOfficialLots(STATE.lots || []);

    if (typeof checkUrgentSoundOnReload === 'function') {
      checkUrgentSoundOnReload(prevLots, STATE.lots);
    }

  } catch (e) {
    console.warn('Auto-update falhou:', e.message);
  } finally {
    _ffReloadDataPromise = null;
  }
  })();

  return _ffReloadDataPromise;
}

// ===================================================
// OPERAÇÕES DE LOTES
// ===================================================
async function apiCreateLot(lot) {
  // MYSQL-ONLY: toda nova OP/lote nasce em producao_lotes.
  const created = await ffCreateProductionLot(lot);

  // Remove qualquer versão local antiga da mesma OP e adiciona a versão MySQL.
  const op = ffLotOpKey(created);
  STATE.lots = (STATE.lots || []).filter(l => ffLotOpKey(l) !== op);
  STATE.lots.push(created);
  ffApplyOfficialLots(STATE.lots);

  return created;
}
function ffRenderAfterLotChange(lot) {
  // Atualiza a tela imediatamente depois que um lote muda de setor/status.
  // Isso evita ter que trocar de aba para o card sumir do setor antigo
  // e aparecer no próximo setor.
  try {
    if (typeof normalizeLotSectorForKanban === 'function' && lot) {
      normalizeLotSectorForKanban(lot);
    }

    const activePage = document.querySelector('.nav-item.active')?.dataset.page;

    if (activePage === 'kanban' && typeof renderKanban === 'function') {
      renderKanban();
      return;
    }

    if (activePage === 'meu_setor' && typeof renderMeuSetor === 'function') {
      renderMeuSetor();
      return;
    }

    if (activePage === 'lots' && typeof renderLots === 'function') {
      renderLots();
      return;
    }

    // Se não conseguir identificar a página, pelo menos atualiza o Kanban se ele existir.
    if (typeof renderKanban === 'function') renderKanban();
  } catch (e) {
    console.warn('Falha ao atualizar tela após mudança de lote:', e.message);
  }
}

function ffReplaceLotInState(updatedLot) {
  if (!updatedLot || !Array.isArray(STATE.lots)) return;

  const updatedId = String(updatedLot.id || '');
  const updatedBridgeId = String(updatedLot._bridgeId || '').trim();
  const updatedOp = String(updatedLot.op || updatedLot.number || updatedLot.lote || '').trim();

  const i = STATE.lots.findIndex(l => {
    if (updatedId && String(l.id || '') === updatedId) return true;
    if (updatedBridgeId && String(l._bridgeId || '') === updatedBridgeId) return true;
    if (updatedOp) {
      const lop = String(l.op || l.number || l.lote || '').trim();
      if (lop && lop === updatedOp) return true;
    }
    return false;
  });

  if (i !== -1) {
    STATE.lots[i] = { ...STATE.lots[i], ...updatedLot };
  }
}

async function apiUpdateLot(lot) {

  // 🔥 Se for lote vindo do MySQL (bridge)
  if (lot && (lot._source === 'mysql' || String(lot.id || '').startsWith('bridge_'))) {

    const bridgeId = lot._bridgeId || String(lot.id).replace('bridge_', '');

    const payload = {
      setor_atual: lot.sector,
      status: lot.rejected
        ? 'rejeitado'
        : (lot.sector === 'pronto' ? 'pronto' : 'em_producao'),
      prioridade: lot.priority || 'normal',
      tipo_lote: ffNormalizeProductType(lot.productType || lot.tipo_lote || lot.raw_mysql?.tipo_lote, lot.paint || lot.productName || lot.produto_nome, lot.productCode || lot.produto_codigo),
      ff_lotStatus: lot.lotStatus || 'idle',
      ff_sectorEnteredAt: Number(lot.sectorEnteredAt) || Date.now(),
      ff_workSessions: JSON.stringify(ffSafeParseArray(lot.workSessions)),
      ff_sectorMetrics: JSON.stringify(ffSafeParseArray(lot.sectorMetrics)),
      ff_history: JSON.stringify(ffSafeParseArray(lot.history)),
      ff_expedientePausedStatus: lot.expedientePausedStatus || ''
    };

    const baseUrl = typeof PEDIDOS_API !== 'undefined'
      ? PEDIDOS_API
      : 'https://app-producao-backend-production.up.railway.app';

    const token = resolveFactoryFlowSessionToken() || resolveFactoryFlowApiToken();

    const res = await fetch(`${baseUrl}/api/producao/${bridgeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || json.ok === false) {
      throw new Error(json.error || json.detail || `PATCH producao/${bridgeId} falhou`);
    }

    ffReplaceLotInState(lot);
    ffRenderAfterLotChange(lot);

    return lot;
  }

  // Se ainda aparecer algum lote legado/local, migra para producao_lotes em vez de salvar em ff_lots.
  const migrated = await apiCreateLot(lot);
  ffRenderAfterLotChange(migrated);
  return migrated;
}
async function apiDeleteLot(id) {
  await apiDelete('ff_lots', id);
  STATE.lots = STATE.lots.filter(l=>l.id!==id);
}

// ===================================================
// OPERAÇÕES DE PEDIDOS
// ===================================================
async function apiCreateOrder(order) {
  const c = await apiPost('ff_orders', serializeOrder(order));
  const d = deserializeOrder(c);
  STATE.orders.push(d);
  return d;
}
async function apiUpdateOrder(order) {
  await apiPut('ff_orders', order.id, serializeOrder(order));
  const i = STATE.orders.findIndex(o=>o.id===order.id);
  if(i!==-1) STATE.orders[i]=order;
}
async function apiDeleteOrder(id) {
  await apiDelete('ff_orders', id);
  STATE.orders = STATE.orders.filter(o=>o.id!==id);
}

// ===================================================
// OPERAÇÕES DE ROTAS
// ===================================================
async function apiCreateRoute(route) {
  const c = await apiPost('ff_routes', serializeRoute(route));
  const d = deserializeRoute(c);
  STATE.routes.push(d);
  return d;
}
async function apiUpdateRoute(route) {
  await apiPut('ff_routes', route.id, serializeRoute(route));
  const i = STATE.routes.findIndex(r=>r.id===route.id);
  if(i!==-1) STATE.routes[i]=route;
}

// ===================================================
// OPERAÇÕES DE USUÁRIOS
// ===================================================
async function apiCreateUser(user) {
  const c = await apiPost('ff_users', user);
  STATE.users.push(c);
  return c;
}
async function apiUpdateUser(user) {
  await apiPut('ff_users', user.id, user);
  const i = STATE.users.findIndex(u=>u.id===user.id);
  if(i!==-1) STATE.users[i]=user;
}
async function apiDeleteUser(id) {
  await apiDelete('ff_users', id);
  STATE.users = STATE.users.filter(u=>u.id!==id);
}

// ===================================================
// IMPORTAÇÃO EXTERNA
// ===================================================
async function importExternalOrder(data) {
  const user = STATE.currentUser;
  const orderId = genId('ord');
  const orderNumber = data.orderNumber || String(Date.now()).slice(-6);
  const lotIds = [], createdLots = [];

  for (const ld of (data.lots||[])) {
    const productType = ld.productType || 'tinta';
    const lot = {
      id: genId('lot'), number: ld.lotNumber||genId('L'), orderId, orderNumber,
      client: data.client, productCode: ld.productCode||'', paint: ld.paint||'',
      productType, qty: parseFloat(ld.qty)||0, unit: ld.unit||'Kg',
      priority: data.priority||'normal', deliveryDate: data.deliveryDate||'',
      skipColor: false, city: data.city||'', address: data.address||'',
      notes: ld.notes||data.notes||'', sector: 'coloracao_revisao',
      lotStatus: 'idle', workSessions: [],
      createdAt: Date.now(), createdBy: user?user.id:'import',
      history: [{ sector:'coloracao_revisao', user:user?user.id:'import',
        userName:user?user.name:'Importação Externa',
        action:`Lote importado automaticamente – Pedido #${orderNumber}`, timestamp:Date.now() }]
    };
    const created = await apiCreateLot(lot);
    lotIds.push(created.id); createdLots.push(created);
  }

  const order = {
    id:orderId, number:orderNumber, client:data.client, city:data.city||'',
    address:data.address||'', deliveryDate:data.deliveryDate||'',
    priority:data.priority||'normal', notes:data.notes||'',
    status:'in_production', createdAt:Date.now(),
    createdBy:user?user.id:'import', lotIds
  };
  await apiCreateOrder(order);
  return { order, lots: createdLots };
}

// ===================================================
// RESET DE LOTES (admin)
// ===================================================
async function resetAllLots() {
  alert('Função de reset de lotes desativada.');
  return;
}

// ===================================================
// REPROVAÇÃO DE LOTES
// ===================================================
/**
 * Reprova um lote: marca como rejeitado, registra motivo, setor e usuário.
 * O lote some do Kanban e da produção ativa, mas é mantido no histórico.
 */
async function rejectLot(lotId, reason) {
  const lot  = STATE.lots.find(l => l.id === lotId);
  const user = STATE.currentUser;
  if (!lot || !user) return;

  const now = Date.now();
  lot.rejected       = true;
  lot.rejectedAt     = now;
  lot.rejectedReason = reason;
  lot.rejectedBy     = user.name;
  lot.rejectedById   = user.id;
  lot.rejectedSector = lot.sector;
  lot.lotStatus      = 'rejected';

  const history = Array.isArray(lot.history) ? lot.history : [];
  history.push({
    sector:    lot.sector,
    user:      user.id,
    userName:  user.name,
    action:    `⛔ LOTE REPROVADO no setor ${SECTOR_LABELS[lot.sector]} – Motivo: ${reason}`,
    timestamp: now
  });
  lot.history = history;

  await apiUpdateLot(lot);
  return lot;
}

/** Retorna todos os lotes reprovados */
function getRejectedLots() {
  return STATE.lots.filter(l => l.rejected === true);
}

/** Estatísticas de reprovação por setor */
function getRejectionStats() {
  const rejected = getRejectedLots();
  const bySector = {};
  SECTORS.forEach(s => { bySector[s] = 0; });
  rejected.forEach(l => {
    const s = l.rejectedSector || l.sector;
    if (bySector[s] !== undefined) bySector[s]++;
    else bySector[s] = (bySector[s] || 0) + 1;
  });
  // Ordena por mais reprovações
  const sorted = Object.entries(bySector)
    .filter(([,n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return { bySector, sorted, total: rejected.length };
}

// ===================================================
// HASH FNV-1a (32-bit) + SALT
// ===================================================
/**
 * Gera um salt aleatório de 16 caracteres hex.
 */
function generateSalt() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}

/**
 * FNV-1a 32-bit hash (pure JS, sem eval/Function).
 * Retorna string hexadecimal de 8 chars.
 */
function fnv1a32(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiplicação por FNV prime mod 2^32
    hash = Math.imul(hash, 0x01000193);
    hash = hash >>> 0; // mantém unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Gera hash com salt: "<salt>:<fnv1a(salt+password)>"
 * Usa 4 rounds para aumentar custo de brute-force.
 */
function hashPassword(password, salt) {
  if (!salt) salt = generateSalt();
  let h = fnv1a32(salt + password);
  // Extra rounds
  for (let r = 0; r < 3; r++) h = fnv1a32(salt + h + password);
  return `${salt}:${h}`;
}

/**
 * Verifica se a senha digitada bate com o hash armazenado.
 * Aceita formato "salt:hash" (novo) ou texto puro (legado).
 */
function verifyPassword(entered, stored) {
  if (!stored) return false;
  if (stored.includes(':')) {
    const [salt] = stored.split(':');
    return hashPassword(entered, salt) === stored;
  }
  // LEGADO: senha em texto puro – ainda aceita para não bloquear usuários existentes
  // mas marca para re-hash no próximo login
  return entered === stored;
}

// ===================================================
// LOADING OVERLAY
// ===================================================
function showLoadingOverlay(show) {
  let el = document.getElementById('loadingOverlay');
  if (!el) {
    el = document.createElement('div'); el.id='loadingOverlay';
    el.innerHTML=`<div class="loading-box"><div class="loading-spinner"></div><div class="loading-text">Carregando...</div></div>`;
    document.body.appendChild(el);
  }
  el.style.display = show?'flex':'none'; STATE.loading=show;
}

// ===================================================
// HELPERS
// ===================================================
// ===================================================
// XSS SANITIZATION
// ===================================================
/**
 * Escapa todos os caracteres HTML perigosos antes de inserir no DOM.
 * Use em TODA string proveniente de dados do servidor/usuário.
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function genId(p){ return (p||'')+Date.now()+Math.random().toString(36).slice(2,6); }

// Normaliza datas vindas do MySQL/ERP para YYYY-MM-DD.
// Usada pela Programação de Entregas e pelos lotes vindos de producao_lotes.
function normalizeMysqlDate(value) {
  if (value === undefined || value === null || value === '') return '';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw || raw === '0000-00-00' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') return '';

  // MySQL DATETIME / ISO: 2026-05-27T00:00:00.000Z ou 2026-05-27 00:00:00
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  // Formato BR: 27/05/2026
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return '';
}

function formatDate(d){ if(!d)return'–'; const[y,m,dd]=d.split('-'); return`${dd}/${m}/${y}`; }
function formatDateTime(ts){
  if(!ts)return'–';
  return new Date(Number(ts)).toLocaleDateString('pt-BR')+' '+new Date(Number(ts)).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function timeAgo(ts){
  if(!ts)return'–';
  const d=Date.now()-Number(ts), h=Math.floor(d/3600000), m=Math.floor((d%3600000)/60000);
  return h>0?`${h}h ${m}min`:`${m}min`;
}
/**
 * Retorna a data de entrega efetiva do lote:
 * prioriza deliveryDateManual (editada pelo PCP), senão usa deliveryDate.
 */
function getEffectiveDeliveryDate(lot) {
  if (!lot) return '';
  return normalizeMysqlDate(
    lot.deliveryDateManual ||
    lot.deliveryDate ||
    lot.previsao_entrega ||
    lot.pits_previsao ||
    lot.data_entrega ||
    lot.raw_mysql?.deliveryDate ||
    lot.raw_mysql?.previsao_entrega ||
    lot.raw_mysql?.pits_previsao ||
    lot.raw_mysql?.data_entrega ||
    ''
  );
}
function isLate(lot){
  if(['entregue'].includes(lot.sector)) return false;
  const d = getEffectiveDeliveryDate(lot);
  if (!d) return false;
  return d < new Date().toISOString().split('T')[0];
}
function isToday(d){ return d===new Date().toISOString().split('T')[0]; }

// ===================================================
// FLUXO AUTOMÁTICO POR TIPO
// ===================================================
function getNextSectorOptions(lot) {
  const ptype = lot.productType||'tinta';
  const flow  = PRODUCT_FLOWS[ptype]||PRODUCT_FLOWS['tinta'];
  const idx   = flow.indexOf(lot.sector);
  if(idx===-1||idx>=flow.length-1) return [];

  // Amostra: PCP envia direto para Laboratório – Amostras.
  if (ptype === 'amostra' && lot.sector === 'pcp_liberacao') {
    return [{ value: 'laboratorio_amostras', label: 'Laboratório – Amostras' }];
  }

  // Amostra: no Laboratório – Amostras, escolher se precisa passar pela Coloração – Amostras ou se já fica pronto.
  if (ptype === 'amostra' && lot.sector === 'laboratorio_amostras') {
    return [
      { value: 'coloracao_amostras', label: 'Coloração – Amostras' },
      { value: 'pronto',             label: 'Pronto para Entrega' }
    ];
  }

  // Amostra: depois da Coloração – Amostras, volta para Laboratório – Amostras.
  if (ptype === 'amostra' && lot.sector === 'coloracao_amostras') {
    return [{ value: 'laboratorio_amostras', label: 'Laboratório – Amostras' }];
  }

  // Diluente: ao sair do PCP, vai para Envase – Produzir
  if (ptype === 'diluente' && lot.sector === 'pcp_liberacao') {
    return [{ value: 'envase_produzir', label: 'Envase – Produzir' }];
  }

  // Endurecedor: PCP escolhe Pesagem ou direto para Envase – Produzir
  if (ptype === 'endurecedor' && lot.sector === 'pcp_liberacao') {
    const rota = String(lot.endurecedorRoute || lot.destinoEndurecedor || '').toLowerCase();

    if (rota === 'envase' || rota === 'envase_produzir') {
      return [{ value: 'envase_produzir', label: 'Direto para Envase – Produzir' }];
    }

    if (rota === 'pesagem') {
      return [{ value: 'pesagem', label: 'Pesagem' }];
    }

    return [
      { value: 'pesagem', label: 'Pesagem' },
      { value: 'envase_produzir', label: 'Direto para Envase – Produzir' }
    ];
  }

  // Tinta em producao pode pular coloracao
  if(ptype==='tinta' && lot.sector==='producao') {
    if(lot.skipColor) return [{value:'laboratorio',label:'Laboratório (coloração pulada)'}];
    return [
      {value:'coloracao',   label:'Coloração'},
      {value:'laboratorio', label:'Direto para Laboratório (pular coloração)'}
    ];
  }

  // Endurecedor: se passou pela Produção, vai para Envase – Enlatamento
  if (ptype === 'endurecedor' && lot.sector === 'producao') {
    return [{ value: 'envase_enlatamento', label: 'Envase – Enlatamento' }];
  }

  // Base: ao sair do laboratório, finaliza e sai do FactoryFlow
  if (ptype === 'base' && lot.sector === 'laboratorio') {
    return [{ value: 'entregue', label: 'Finalizar Base' }];
  }

  // Os dois quadros do envase levam para o mesmo destino
  if (lot.sector === 'envase_produzir' || lot.sector === 'envase_enlatamento') {
    return [{ value: 'pronto', label: 'Pronto para Entrega' }];
  }

  return [{value:flow[idx+1], label:SECTOR_LABELS[flow[idx+1]]}];
}
function getProductFlow(pt){ return PRODUCT_FLOWS[pt]||PRODUCT_FLOWS['tinta']; }

// ===================================================
// USER HELPERS
// ===================================================
function getUserById(id){ return STATE.users.find(u=>u.id===id); }
function isFullAccess(user){ return ['admin','diretoria','pcp','pcp_lib','manager','viewer','tv'].includes(user.role); }
function canEdit(user){ return ['admin','diretoria','pcp','pcp_lib','manager','sector'].includes(user.role); }

function getLotsForUser(user) {
  if(isFullAccess(user)) return STATE.lots;
  if(user.role==='sector') {
    // Setores que este usuário pode ver (inclui sub-setores)
    const visible = getSectorVisibility(user.sector);
    return STATE.lots.filter(l=>visible.includes(l.sector));
  }
  return [];
}

// Retorna lista de setores visíveis para um setor
function getSectorVisibility(sector) {
  return SECTOR_VISIBILITY[sector] || [sector];
}

// ===================================================
// LOT HELPERS
// ===================================================

/**
 * Tempo TOTAL que o lote está no setor atual (desde que entrou, independente de
 * start/pause). Usa sectorEnteredAt, que é gravado APENAS quando o lote muda de setor.
 */

// ===================================================
// PATCH INDUSCOLOR – MOTOR ÚNICO DE TEMPOS (FRONTEND)
// Cards, modal e relatório devem usar esta mesma regra.
// Congela a contagem quando o expediente do setor está fechado.
// ===================================================
window.DEBUG_TEMPOS = window.DEBUG_TEMPOS || false;
window.FF_TIME_FREEZE_CACHE = window.FF_TIME_FREEZE_CACHE || Object.create(null);

function ffTimeSafeArray(value) {
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

function ffTimeToMs(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10000000000 ? Math.round(value * 1000) : Math.round(value);
  }
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n < 10000000000 ? Math.round(n * 1000) : Math.round(n);
  }
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function ffTimeNormalizeSector(sector) {
  if (typeof ffNormalizeSectorForMetrics === 'function') return ffNormalizeSectorForMetrics(sector);
  if (typeof ffNormalizeSectorName === 'function') return ffNormalizeSectorName(sector);
  if (typeof normalizeKanbanSector === 'function') return normalizeKanbanSector(sector);
  return String(sector || '').trim().toLowerCase();
}

function ffTimeNormalizeGroup(sector) {
  if (typeof normalizeShiftGroup === 'function') return normalizeShiftGroup(sector);
  const s = ffTimeNormalizeSector(sector);
  const map = {
    coloracao_revisao: 'coloracao',
    coloracao_amostras: 'coloracao',
    laboratorio_revisao: 'laboratorio',
    laboratorio_amostras: 'laboratorio',
    envase: 'envase',
    envase_produzir: 'envase',
    envase_enlatamento: 'envase'
  };
  return map[s] || s;
}

function ffTimeSameSectorOrGroup(a, b) {
  const sa = ffTimeNormalizeSector(a);
  const sb = ffTimeNormalizeSector(b);
  if (!sa || !sb) return true;
  if (sa === sb) return true;
  return ffTimeNormalizeGroup(sa) === ffTimeNormalizeGroup(sb);
}

function ffTimeMergeIntervals(intervals) {
  const clean = (intervals || [])
    .map(i => ({ start: Number(i.start || 0), end: Number(i.end || 0) }))
    .filter(i => i.start > 0 && i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const item of clean) {
    const last = merged[merged.length - 1];
    if (!last || item.start > last.end) merged.push({ ...item });
    else last.end = Math.max(last.end, item.end);
  }
  return merged;
}

function ffTimeIntervalsTotal(intervals) {
  return ffTimeMergeIntervals(intervals).reduce((sum, i) => sum + Math.max(0, i.end - i.start), 0);
}

function ffTimeSubtractIntervals(baseIntervals, subtractIntervals) {
  let result = ffTimeMergeIntervals(baseIntervals);
  const subtracts = ffTimeMergeIntervals(subtractIntervals);

  for (const sub of subtracts) {
    const next = [];
    for (const base of result) {
      if (sub.end <= base.start || sub.start >= base.end) {
        next.push(base);
        continue;
      }
      if (sub.start > base.start) next.push({ start: base.start, end: Math.min(sub.start, base.end) });
      if (sub.end < base.end) next.push({ start: Math.max(sub.end, base.start), end: base.end });
    }
    result = next;
  }

  return ffTimeMergeIntervals(result);
}

function ffTimeClipInterval(start, end, limitStart, limitEnd) {
  const s = Math.max(Number(start || 0), Number(limitStart || 0));
  const e = Math.min(Number(end || 0), Number(limitEnd || 0));
  return e > s ? { start: s, end: e } : null;
}

function ffGetShiftClosedAtMs(sector) {
  try {
    const shift = typeof getShiftForSector === 'function'
      ? getShiftForSector(sector)
      : STATE?.sectorShifts?.[ffTimeNormalizeGroup(sector)];

    const candidates = [
      shift?.finalizado_em,
      shift?.finalizadoEm,
      shift?.closedAt,
      shift?.closed_at,
      shift?.fim,
      shift?.endedAt,
      shift?.updated_at,
      shift?.atualizado_em
    ];

    for (const value of candidates) {
      const ms = ffTimeToMs(value);
      if (ms > 0) return ms;
    }
  } catch (_) {}
  return 0;
}

function ffGetEffectiveNowForSectorSafe(sector, lot) {
  const now = Date.now();
  const normalized = ffTimeNormalizeSector(sector);
  const group = ffTimeNormalizeGroup(normalized);

  const trackable = typeof canTrackWork === 'function' ? canTrackWork(normalized) : true;
  if (!trackable) return now;

  const opened = typeof isExpedienteAbertoForSector === 'function'
    ? isExpedienteAbertoForSector(normalized)
    : true;

  if (opened) return now;

  const closedAt = ffGetShiftClosedAtMs(normalized);
  if (closedAt > 0) return closedAt;

  const key = `${lot?.id || lot?.number || 'sem_lote'}::${group}`;
  const cached = window.FF_TIME_FREEZE_CACHE?.[key];
  if (cached?.effectiveNow) return Number(cached.effectiveNow);

  if (window.DEBUG_TEMPOS) {
    console.warn('[TEMPOS] Expediente fechado sem timestamp de fechamento; congelando no primeiro cálculo em memória.', {
      lote: lot?.number || lot?.id,
      setor: normalized
    });
  }

  return now;
}

function ffSessionType(session) {
  if (session?.pauseReason && String(session.pauseReason).trim()) return 'pause';
  if (session?.motivoPausa && String(session.motivoPausa).trim()) return 'pause';

  const raw = String(session?.type || session?.tipo || session?.status || session?.action || session?.acao || session?.mode || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (raw.includes('pause') || raw.includes('pausa') || raw.includes('paused') || raw.includes('pausado')) return 'pause';
  return 'work';
}

function ffPickTime(...values) {
  for (const value of values) {
    const ms = ffTimeToMs(value);
    if (ms > 0) return ms;
  }
  return 0;
}

function ffCalculateRawLotTimeSummary(lot, options = {}) {
  const sector = ffTimeNormalizeSector(options.sector || lot?.sector || lot?.stage || lot?.status || lot?.currentSector || '');
  const enteredAt = ffPickTime(
    options.enteredAt,
    lot?.sectorEnteredAt,
    lot?.raw_mysql?.ff_sectorEnteredAt,
    lot?.createdAt,
    lot?.raw_mysql?.data_criacao
  ) || Date.now();

  const exitAt = ffPickTime(options.exitAt, options.leftAt);
  const effectiveNow = exitAt || ffGetEffectiveNowForSectorSafe(sector, lot);
  const endLimit = Math.max(enteredAt, effectiveNow);

  const rawTotal = Math.max(0, endLimit - enteredAt);
  const sessions = ffTimeSafeArray(lot?.workSessions || lot?.raw_mysql?.ff_workSessions)
    .filter(s => s && typeof s === 'object' && ffTimeSameSectorOrGroup(s.sector || s.setor || s.sectorKey || s.setorAtual || s.setor_atual || sector, sector))
    .sort((a, b) => ffPickTime(a.start, a.startedAt, a.inicio, a.timestamp) - ffPickTime(b.start, b.startedAt, b.inicio, b.timestamp));

  const workIntervals = [];
  const pauseIntervals = [];
  let workedDirect = 0;
  let pausedDirect = 0;
  let hasExplicitPause = false;

  for (const s of sessions) {
    const type = ffSessionType(s);

    if (type === 'pause') {
      hasExplicitPause = true;
      const start = ffPickTime(s.pauseStart, s.pausaInicio, s.pausadoEm, s.pausedAt, s.paused_at, s.startPause, s.start_pause, s.start, s.startedAt, s.inicio, s.timestamp);
      const end = ffPickTime(s.pauseEnd, s.pausaFim, s.retomadoEm, s.retomado_em, s.resumedAt, s.resumed_at, s.endPause, s.end_pause, s.end, s.endedAt, s.fim) || endLimit;
      const clipped = ffTimeClipInterval(start, end, enteredAt, endLimit);
      if (clipped) pauseIntervals.push(clipped);
      else {
        const duration = Number(s.durationMs || s.duration_ms || s.pausedMs || s.paused_ms || 0);
        if (duration > 0) pausedDirect += duration;
      }
      continue;
    }

    const start = ffPickTime(s.startedAt, s.started_at, s.startAt, s.start_at, s.start, s.inicio, s.iniciadoEm, s.iniciado_em, s.createdAt, s.created_at, s.timestamp);
    const end = ffPickTime(s.endedAt, s.ended_at, s.endAt, s.end_at, s.end, s.fim, s.finalizadoEm, s.finalizado_em, s.stoppedAt, s.updatedAt, s.updated_at) || endLimit;
    const clipped = ffTimeClipInterval(start, end, enteredAt, endLimit);
    if (clipped) workIntervals.push(clipped);
    else {
      const duration = Number(s.durationMs || s.duration_ms || s.workedMs || s.worked_ms || 0);
      if (duration > 0) workedDirect += duration;
    }
  }

  let worked = workedDirect + ffTimeIntervalsTotal(ffTimeSubtractIntervals(workIntervals, pauseIntervals));
  let paused = pausedDirect + ffTimeIntervalsTotal(pauseIntervals);

  // Compatibilidade com dados antigos: quando não havia sessão explícita de pausa,
  // a pausa era inferida pelo intervalo entre uma sessão de trabalho e a próxima.
  if (!hasExplicitPause) {
    const workOnly = ffTimeMergeIntervals(workIntervals);
    for (let i = 1; i < workOnly.length; i++) {
      const prevEnd = workOnly[i - 1].end;
      const nextStart = workOnly[i].start;
      if (prevEnd && nextStart > prevEnd) paused += nextStart - prevEnd;
    }

    if (String(lot?.lotStatus || '').toLowerCase() === 'paused' && workOnly.length > 0) {
      const lastEnd = workOnly[workOnly.length - 1].end;
      if (lastEnd && endLimit > lastEnd) paused += endLimit - lastEnd;
    }
  }

  worked = Math.max(0, Math.min(worked, rawTotal));
  paused = Math.max(0, Math.min(paused, Math.max(0, rawTotal - worked)));
  const idle = Math.max(0, rawTotal - worked - paused);
  const efficiency = rawTotal > 0 ? Math.min(100, Math.round((worked / rawTotal) * 100)) : 0;

  return {
    total: rawTotal,
    worked,
    paused,
    idle,
    efficiency,
    status: lot?.lotStatus || 'idle',
    sector,
    enteredAt,
    exitAt: exitAt || null,
    effectiveNow: endLimit
  };
}

function ffCalculateLotTimeSummary(lot, options = {}) {
  if (!lot) {
    return { total: 0, worked: 0, paused: 0, idle: 0, efficiency: 0, status: 'idle', sector: '', enteredAt: null, exitAt: null };
  }

  const sector = ffTimeNormalizeSector(options.sector || lot.sector || lot.stage || lot.status || lot.currentSector || '');
  const group = ffTimeNormalizeGroup(sector);
  const key = `${lot.id || lot.number || 'sem_lote'}::${group}`;
  const trackable = typeof canTrackWork === 'function' ? canTrackWork(sector) : true;
  const opened = !trackable || (typeof isExpedienteAbertoForSector === 'function' ? isExpedienteAbertoForSector(sector) : true);
  const closedAt = (!opened && trackable && typeof ffGetShiftClosedAtMs === 'function')
    ? ffGetShiftClosedAtMs(sector)
    : 0;

  // Se o expediente está fechado e existe timestamp real de fechamento, recalcula usando
  // exatamente esse horário. O cache só é usado quando o backend ainda não trouxe
  // finalizado_em, evitando congelar em um valor antigo do último refresh da tela.
  if (!opened && !options.exitAt && !options.leftAt && !closedAt) {
    const cached = window.FF_TIME_FREEZE_CACHE?.[key];
    if (cached?.summary) {
      if (window.DEBUG_TEMPOS) console.log('[TEMPOS] usando cache congelado', cached.summary);
      return { ...cached.summary, frozen: true };
    }
  }

  const summary = ffCalculateRawLotTimeSummary(lot, options);

  if (!opened && !options.exitAt && !options.leftAt) {
    window.FF_TIME_FREEZE_CACHE[key] = {
      effectiveNow: summary.effectiveNow,
      summary: { ...summary, frozen: true },
      savedAt: Date.now()
    };
  } else if (opened) {
    // Enquanto aberto, mantém um último valor bom para usar imediatamente ao fechar.
    window.FF_TIME_FREEZE_CACHE[key] = {
      effectiveNow: summary.effectiveNow,
      summary: { ...summary, frozen: false },
      savedAt: Date.now()
    };
  }

  if (window.DEBUG_TEMPOS) {
    console.log('[TEMPOS] cálculo', {
      lote: lot.number || lot.id,
      setor: sector,
      expedienteAberto: opened,
      entrada: summary.enteredAt,
      saidaOuAgoraEfetivo: summary.effectiveNow,
      total: summary.total,
      trabalhado: summary.worked,
      pausado: summary.paused,
      ocioso: summary.idle,
      eficiencia: summary.efficiency,
      congelado: !opened
    });
  }

  return summary;
}

window.ffCalculateLotTimeSummary = ffCalculateLotTimeSummary;

/**
 * Tempo TOTAL que o lote está no setor atual, usando o mesmo motor dos cards/modal/relatório.
 */
function getLotTimeInSector(lot) {
  return ffCalculateLotTimeSummary(lot).total;
}

function getAlerts(){
  const threshold=2*3600000;
  return STATE.lots.filter(l=>{
    if(['pronto','entrega','entregue'].includes(l.sector))return false;
    return getLotTimeInSector(l)>threshold;
  });
}

// ===================================================
// TEMPO TRABALHADO / PAUSADO / OCIOSO – Work Sessions
// ===================================================

function getWorkTimeForSector(lot, sector) {
  return ffCalculateLotTimeSummary(lot, { sector }).worked;
}

/**
 * Retorna objeto completo de tempos para o setor ATUAL do lote.
 * Fonte única de verdade para cards, modal e relatório.
 */
function getLotTimeSummary(lot) {
  return ffCalculateLotTimeSummary(lot);
}

/** Tempo médio TRABALHADO dos lotes que já passaram por um setor */
function getAvgWorkTimeMs(sector) {
  const relevant = STATE.lots.filter(l => {
    const sessions = Array.isArray(l.workSessions) ? l.workSessions : [];
    return sessions.some(s => s.sector === sector && s.end);
  });
  if (relevant.length === 0) return 0;
  const total = relevant.reduce((acc, l) => acc + getWorkTimeForSector(l, sector), 0);
  return total / relevant.length;
}

/** Estatísticas agregadas por setor: avg total, avg worked, avg paused, avg idle */
function getSectorTimeStats(sector) {
  // Lotes que JÁ passaram por este setor (têm history com setor diferente depois)
  // OU estão no setor agora com sectorEnteredAt preenchido
  const lotsInOrPassed = STATE.lots.filter(l => {
    if (l.sector === sector) return true;
    const h = Array.isArray(l.history) ? l.history : [];
    return h.some(e => e.sector === sector);
  });

  if (lotsInOrPassed.length === 0) return { avgTotal:0, avgWorked:0, avgPaused:0, avgIdle:0, count:0 };

  let sumTotal=0, sumWorked=0, sumPaused=0, sumIdle=0, count=0;

  lotsInOrPassed.forEach(lot => {
    // Se o lote está neste setor agora, usa dados em tempo real
    if (lot.sector === sector) {
      const s = getLotTimeSummary(lot);
      sumTotal  += s.total;
      sumWorked += s.worked;
      sumPaused += s.paused;
      sumIdle   += s.idle;
      count++;
      return;
    }
    // Lote já saiu deste setor: calcular com base nas sessões
    const sessions = (Array.isArray(lot.workSessions) ? lot.workSessions : []).filter(s => s.sector === sector);
    if (sessions.length === 0) return;
    const h = Array.isArray(lot.history) ? lot.history : [];
    // Encontrar quando entrou e quando saiu deste setor via history
    const entries = h.filter(e => e.sector === sector);
    const nextEntry = h.find(e => e.sector !== sector && h.indexOf(e) > h.indexOf(entries[0]));
    if (!entries[0]) return;
    const enteredTs = Number(entries[0].timestamp);
    const exitTs    = nextEntry ? Number(nextEntry.timestamp) : Date.now();
    const total     = Math.max(0, exitTs - enteredTs);
    const worked    = sessions.reduce((a,s) => a + Math.max(0,(s.end||exitTs)-s.start), 0);
    let paused = 0;
    for (let i=1; i<sessions.length; i++) {
      const pe = sessions[i-1].end; const ns = sessions[i].start;
      if (pe) paused += Math.max(0, ns - pe);
    }
    const idle = Math.max(0, total - worked - paused);
    sumTotal  += total;
    sumWorked += worked;
    sumPaused += paused;
    sumIdle   += idle;
    count++;
  });

  if (count === 0) return { avgTotal:0, avgWorked:0, avgPaused:0, avgIdle:0, count:0 };
  return {
    avgTotal:  sumTotal  / count,
    avgWorked: sumWorked / count,
    avgPaused: sumPaused / count,
    avgIdle:   sumIdle   / count,
    count
  };
}

function formatMs(ms) {
  if (!ms || ms < 0) return '0min';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0)  return `${h}h ${m}min`;
  if (m > 0)  return `${m}min ${s}s`;
  return `${s}s`;
}

function formatMsShort(ms) {
  if (!ms || ms < 0) return '–';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h${m>0?m+'m':''}`;
  return `${m}m`;
}

// Setores que suportam iniciar/pausar (todos exceto os 3 de revisão/liberação)
const WORK_TRACKABLE_SECTORS = ['pcp_liberacao','pesagem','producao','coloracao','coloracao_amostras','laboratorio','laboratorio_amostras','envase_produzir','envase_enlatamento'];

function canTrackWork(sector) {
  const group = typeof normalizeShiftGroup === 'function' ? normalizeShiftGroup(sector) : String(sector || '').trim().toLowerCase();
  return WORK_TRACKABLE_SECTORS.includes(sector) || WORK_TRACKABLE_SECTORS.includes(group);
}


// ===================================================
// MÉTRICAS SÓLIDAS POR SETOR – FactoryFlow MES
// ===================================================
function ffSafeParseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  return [];
}

function ffNow() { return Date.now(); }

function ffNormalizeSectorForMetrics(sector) {
  if (typeof ffNormalizeSectorName === 'function') return ffNormalizeSectorName(sector);
  if (typeof normalizeKanbanSector === 'function') return normalizeKanbanSector(sector);
  return String(sector || '').trim().toLowerCase();
}

function ffEnsureTimeArrays(lot) {
  if (!lot) return lot;
  lot.history = ffSafeParseArray(lot.history || lot.raw_mysql?.ff_history);
  lot.workSessions = ffSafeParseArray(lot.workSessions || lot.raw_mysql?.ff_workSessions);
  lot.sectorMetrics = ffSafeParseArray(lot.sectorMetrics || lot.raw_mysql?.ff_sectorMetrics);
  return lot;
}

function ffCloseOpenWorkSessions(lot, now = ffNow(), reason = '') {
  ffEnsureTimeArrays(lot);
  const currentSector = ffNormalizeSectorForMetrics(lot.sector || lot.setor_atual || lot.raw_mysql?.setor_atual);

  lot.workSessions.forEach(s => {
    const sameSector = ffNormalizeSectorForMetrics(s.sector) === currentSector;
    const isOpen = !s.end;
    const isPause = !!(s.pauseReason && String(s.pauseReason).trim());

    // Fecha somente sessões abertas. Não transforma trabalho em pausa.
    // A pausa precisa ser uma sessão separada, com pauseReason próprio.
    if (sameSector && isOpen) {
      s.end = now;
      if (reason && !isPause) s.closeReason = reason;
    }
  });

  return lot.workSessions;
}

function ffBuildCurrentSectorMetric(lot, leftAt = ffNow(), meta = {}) {
  ffEnsureTimeArrays(lot);
  const sector = ffNormalizeSectorForMetrics(lot.sector || lot.setor_atual || lot.raw_mysql?.setor_atual);
  const enteredAt = Number(lot.sectorEnteredAt || lot.raw_mysql?.ff_sectorEnteredAt || lot.createdAt) || leftAt;
  const sessions = lot.workSessions
    .filter(s => ffNormalizeSectorForMetrics(s.sector) === sector)
    .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));

  let workedMs = 0;
  let pausedMs = 0;
  let hasExplicitPauseSession = false;

  for (const s of sessions) {
    const start = Number(s.start || 0);
    const end = Number(s.end || leftAt);
    if (!start || end < start) continue;

    const duration = Math.max(0, end - start);
    const isPause = !!(s.pauseReason && String(s.pauseReason).trim());

    if (isPause) {
      hasExplicitPauseSession = true;
      pausedMs += duration;
    } else {
      workedMs += duration;
    }
  }

  // Compatibilidade com dados antigos: antes a pausa era inferida pelo intervalo entre sessões.
  // Quando já existe sessão explícita de pausa, não soma gaps para não duplicar.
  if (!hasExplicitPauseSession) {
    for (let i = 1; i < sessions.length; i++) {
      const prevEnd = Number(sessions[i - 1].end || 0);
      const nextStart = Number(sessions[i].start || 0);
      if (prevEnd && nextStart > prevEnd) pausedMs += nextStart - prevEnd;
    }

    if (String(lot.lotStatus || '').toLowerCase() === 'paused' && sessions.length) {
      const lastEnd = Number(sessions[sessions.length - 1].end || 0);
      if (lastEnd && leftAt > lastEnd) pausedMs += leftAt - lastEnd;
    }
  }

  const totalMs = Math.max(0, leftAt - enteredAt);
  const idleMs = Math.max(0, totalMs - workedMs - pausedMs);
  const efficiency = totalMs > 0 ? Math.round((workedMs / totalMs) * 100) : 0;

  return {
    sector,
    sectorLabel: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[sector]) ? SECTOR_LABELS[sector] : sector,
    productCode: String(lot.productCode || lot.produto_codigo || lot.raw_mysql?.produto_codigo || '').trim(),
    productName: String(lot.paint || lot.productName || lot.produto_nome || lot.raw_mysql?.produto_nome || '').trim(),
    op: String(lot.op || lot.number || '').trim(),
    orderNumber: String(lot.orderNumber || lot.numero_pedido || lot.raw_mysql?.numero_pedido || '').trim(),
    enteredAt,
    leftAt,
    totalMs,
    workedMs,
    pausedMs,
    idleMs,
    efficiency,
    user: meta.user || STATE?.currentUser?.id || 'sistema',
    userName: meta.userName || STATE?.currentUser?.name || 'Sistema',
    note: meta.note || ''
  };
}

function ffFinalizeCurrentSectorMetric(lot, leftAt = ffNow(), meta = {}) {
  ffEnsureTimeArrays(lot);
  const metric = ffBuildCurrentSectorMetric(lot, leftAt, meta);

  // Evita duplicar métrica do mesmo setor com mesmo intervalo.
  const exists = lot.sectorMetrics.some(m =>
    ffNormalizeSectorForMetrics(m.sector) === metric.sector &&
    Number(m.enteredAt || 0) === Number(metric.enteredAt || 0) &&
    Number(m.leftAt || 0) === Number(metric.leftAt || 0)
  );

  if (!exists && metric.totalMs >= 0) lot.sectorMetrics.push(metric);
  return metric;
}

function ffGetMetricsForLotAndSector(lot, sector) {
  ffEnsureTimeArrays(lot);
  const s = ffNormalizeSectorForMetrics(sector);
  return lot.sectorMetrics.filter(m => ffNormalizeSectorForMetrics(m.sector) === s);
}

function ffGetProductCode(lot) {
  return String(lot?.productCode || lot?.produto_codigo || lot?.pits_produto || lot?.raw_mysql?.produto_codigo || '').trim();
}

function ffGetProductSectorAverageLocal(productCode, sector) {
  const code = String(productCode || '').trim();
  const s = ffNormalizeSectorForMetrics(sector);
  const metrics = [];

  (STATE.lots || []).forEach(lot => {
    ffEnsureTimeArrays(lot);
    const lotCode = ffGetProductCode(lot);
    if (!code || lotCode !== code) return;
    lot.sectorMetrics.forEach(m => {
      if (ffNormalizeSectorForMetrics(m.sector) === s && Number(m.workedMs || 0) > 0) metrics.push(m);
    });
  });

  if (!metrics.length) return null;
  const sum = metrics.reduce((acc, m) => {
    acc.totalMs += Number(m.totalMs || 0);
    acc.workedMs += Number(m.workedMs || 0);
    acc.pausedMs += Number(m.pausedMs || 0);
    acc.idleMs += Number(m.idleMs || 0);
    return acc;
  }, { totalMs: 0, workedMs: 0, pausedMs: 0, idleMs: 0 });

  return {
    count: metrics.length,
    avgTotalMs: sum.totalMs / metrics.length,
    avgWorkedMs: sum.workedMs / metrics.length,
    avgPausedMs: sum.pausedMs / metrics.length,
    avgIdleMs: sum.idleMs / metrics.length,
    samples: metrics.slice(-10)
  };
}

// ===================================================
// SOM – Alertas de lote urgente chegando no setor
// ===================================================
function playUrgentSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Toque de 3 beeps rápidos
    [0, 0.25, 0.5].forEach(offset => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime+offset);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime+offset+0.03);
      gain.gain.linearRampToValueAtTime(0,   ctx.currentTime+offset+0.18);
      osc.start(ctx.currentTime+offset);
      osc.stop(ctx.currentTime+offset+0.2);
    });
  } catch(e) { /* AudioContext não disponível */ }
}

function checkUrgentSoundOnReload(prevLots, newLots) {
  const user = STATE.currentUser;
  if (!user) return;

  const shiftGroup = getCurrentUserShiftGroup(user);
  if (!shiftGroup) return;

  const userIsPcp = ['pcp', 'pcp_lib'].includes(String(user.role || '').toLowerCase());
  const visible = user.role === 'sector'
    ? getSectorVisibility(user.sector).map(normalizeShiftGroup)
    : [shiftGroup];

  newLots.forEach(newLot => {
    if (!newLot || newLot.rejected) return;

    const lotGroup = normalizeShiftGroup(newLot.sector);
    const isForThisUser = visible.includes(lotGroup) || lotGroup === shiftGroup;
    if (!isForThisUser) return;

    // PCP precisa ser avisado quando QUALQUER ordem chegar na liberação.
    // Setores operacionais continuam tocando só para urgente/mesmo dia.
    const shouldSound = userIsPcp || ['urgent', 'sameday'].includes(newLot.priority);
    if (!shouldSound) return;

    const key = `${newLot.id}_${newLot.sector}`;
    if (STATE._soundedLots.has(key)) return;

    const prev = prevLots.find(l => l.id === newLot.id);
    const arrivedNow = !prev || normalizeShiftGroup(prev.sector) !== lotGroup;
    if (!arrivedNow) return;

    STATE._soundedLots.add(key);
    playUrgentSound();

    const label = SECTOR_LABELS[newLot.sector] || SECTOR_LABELS[lotGroup] || lotGroup;
    const msg = userIsPcp
      ? `🔔 Nova ordem #${newLot.lot || newLot.number || newLot.op || ''} chegou para ${label}!`
      : `🔔 Lote urgente #${newLot.lot || newLot.number || newLot.op || ''} chegou no seu setor!`;

    if (typeof showToast === 'function') showToast(msg, 'urgent');
  });
}

// ===================================================
// ORDER HELPERS
// ===================================================
function getOrderLots(id){
  const order = (STATE.orders || []).find(o => o.id === id);
  const orderNumber = String(order?.number || '').trim();
  return STATE.lots.filter(l => {
    if (l.orderId === id) return true;
    if (!orderNumber) return false;
    return String(l.orderNumber || '').trim() === orderNumber;
  });
}
function getOrderStatus(order){
  const lots=getOrderLots(order.id);
  if(lots.length===0)return'open';
  if(lots.every(l=>l.sector==='entregue'))return'delivered';
  if(lots.every(l=>l.sector==='pronto'||l.sector==='entregue'))return'ready';
  return'in_production';
}

// ===================================================
// ROUTE OPTIMIZATION (Nearest Neighbor TSP)
// ===================================================
const CITY_COORDS = {
  'conchal':       {lat:-22.33,lng:-47.17},
  'araras':        {lat:-22.36,lng:-47.38},
  'limeira':       {lat:-22.56,lng:-47.40},
  'campinas':      {lat:-22.90,lng:-47.06},
  'piracicaba':    {lat:-22.72,lng:-47.65},
  'sao paulo':     {lat:-23.55,lng:-46.63},
  'rio claro':     {lat:-22.41,lng:-47.56},
  'americana':     {lat:-22.74,lng:-47.33},
  'sorocaba':      {lat:-23.50,lng:-47.46},
  'jundiai':       {lat:-23.19,lng:-46.88},
  'santa barbara': {lat:-22.75,lng:-47.70},
  'mogi mirim':    {lat:-22.43,lng:-46.96},
  'default':       {lat:-22.50,lng:-47.30}
};
function getCityCoords(city){
  if(!city)return CITY_COORDS['default'];
  const k=city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return CITY_COORDS[k]||CITY_COORDS['default'];
}
function haversine(c1,c2){
  const R=6371, dLat=(c2.lat-c1.lat)*Math.PI/180, dLng=(c2.lng-c1.lng)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(c1.lat*Math.PI/180)*Math.cos(c2.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function optimizeRoute(lots){
  if(!lots.length)return[];
  const factory={lat:-22.33,lng:-47.17};
  const unvisited=lots.map((l,i)=>({...l,_coords:getCityCoords(l.city),_idx:i}));
  const route=[]; let current=factory;
  while(unvisited.length){
    let nearest=null,nearestDist=Infinity,nearestI=-1;
    unvisited.forEach((l,i)=>{ const d=haversine(current,l._coords); if(d<nearestDist){nearestDist=d;nearest=l;nearestI=i;}});
    route.push({...nearest,distance:nearestDist}); current=nearest._coords; unvisited.splice(nearestI,1);
  }
  return route;
}

// ===================================================
// MYSQL BRIDGE – Integração com backend Node.js
// ===================================================
/**
 * URL base do backend Node.js (MySQL Bridge).
 * Altere BRIDGE_BASE_URL para o endereço do seu servidor após o deploy.
 * Ex: 'http://192.168.1.100:3001'  ou  'https://api.induscolor.com.br'
 *
 * Se null, a integração com o MySQL é desabilitada silenciosamente.
 */
const BRIDGE_CONFIG = {
  // 🔥 Backend real do FactoryFlow / MySQL.
  // Assim, ao dar F5 em qualquer tela, os lotes manuais salvos em producao_lotes
  // continuam sendo carregados para o STATE.lots.
  baseUrl:    'https://app-producao-backend-production.up.railway.app',
  enabled:    true,
  timeout:    30000,
  retryDelay: 5000,
  _lastError: null,
  _errorAt:   0,
};

/**
 * Tenta configurar e habilitar o bridge.
 * Chame na inicialização: setBridgeUrl('http://meuservidor:3001');
 */
function setBridgeUrl(url) {
  if (!url) return;
  BRIDGE_CONFIG.baseUrl  = url.replace(/\/$/, '');
  BRIDGE_CONFIG.enabled  = true;
  BRIDGE_CONFIG._lastError = null;
  BRIDGE_CONFIG._errorAt   = 0;
  console.log('🔗 MySQL Bridge configurado →', BRIDGE_CONFIG.baseUrl);
}

function bridgeAuthHeaders(json = false) {
  const token = resolveFactoryFlowSessionToken() || resolveFactoryFlowApiToken();
  const headers = json ? { 'Content-Type': 'application/json' } : {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Faz GET no backend bridge com timeout e controle de erros.
 */
async function bridgeApiGet(path, params = {}, options = {}) {
  if (!BRIDGE_CONFIG.enabled || !BRIDGE_CONFIG.baseUrl) return null;

  // Backoff: se houve erro recente, aguarda retryDelay
  if (!options.force && BRIDGE_CONFIG._errorAt && (Date.now() - BRIDGE_CONFIG._errorAt) < BRIDGE_CONFIG.retryDelay) {
    return null;
  }

  const qs  = new URLSearchParams(params).toString();
  const url = `${BRIDGE_CONFIG.baseUrl}${path}${qs ? '?' + qs : ''}`;

  const timeout = options.timeout ?? BRIDGE_CONFIG.timeout;
  const controller = timeout > 0 ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const fetchOptions = { headers: bridgeAuthHeaders(false) };
    if (controller) fetchOptions.signal = controller.signal;
    const res = await fetch(url, fetchOptions);
    if (timer) clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    BRIDGE_CONFIG._lastError = null;
    BRIDGE_CONFIG._errorAt   = 0;
    return await res.json();
  } catch (err) {
    if (timer) clearTimeout(timer);
    BRIDGE_CONFIG._lastError = err.message;
    BRIDGE_CONFIG._errorAt   = Date.now();
    console.warn('⚠️ Bridge indisponível:', err.message);
    return null;
  }
}

/**
 * Converte um registro de producao_lotes (MySQL) no formato de lote do FactoryFlow.
 * O lot.id recebe prefixo "bridge_" para nunca colidir com IDs do ff_lots.
 */
const BRIDGE_KANBAN_ACTIVE_SECTORS = new Set([
  'pcp_liberacao',
  'pesagem',
  'producao',
  'moagem',
  'laboratorio',
  'laboratorio_revisao',
  'laboratorio_amostras',
  'coloracao',
  'coloracao_revisao',
  'coloracao_amostras',
  'envase',
  'envase_produzir',
  'envase_enlatamento',
  'pronto'
]);

const BRIDGE_KANBAN_EXCLUDED_STATES = new Set([
  'entregue',
  'finalizado',
  'finalizada',
  'cancelado',
  'cancelada',
  'rejeitado',
  'rejeitada',
  'em_rota',
  'entrega'
]);

function normalizeBridgeKanbanValue(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isBridgeKanbanActiveRow(row) {
  const status = normalizeBridgeKanbanValue(row?.status || row?.situacao || row?.backendStatus);
  const sector = normalizeBridgeKanbanValue(row?.setor_atual || row?.sector || row?.setor);

  if (!sector || !BRIDGE_KANBAN_ACTIVE_SECTORS.has(sector)) return false;
  if (BRIDGE_KANBAN_EXCLUDED_STATES.has(status)) return false;
  if (BRIDGE_KANBAN_EXCLUDED_STATES.has(sector)) return false;

  return true;
}

function deserializeBridgeLot(row) {
  // Mapeia setor_atual → sector do FactoryFlow
  const sectorMap = {
    moagem:                'pesagem',
    pesagem:               'pesagem',
    producao:              'producao',
    coloracao:             'coloracao',
    coloracao_revisao:     'coloracao_revisao',
    coloracao_amostras:    'coloracao_amostras',
    laboratorio:           'laboratorio',
    laboratorio_revisao:   'laboratorio_revisao',
    laboratorio_amostras:  'laboratorio_amostras',
    pcp_liberacao:         'pcp_liberacao',
    envase:                'envase_enlatamento',
    envase_produzir:       'envase_produzir',
    envase_enlatamento:    'envase_enlatamento',
    expedicao:             'pronto',
    pronto:                'pronto',
    entregue:              'entregue',
  };
  const rawSector = normalizeBridgeKanbanValue(row.setor_atual || 'pesagem');
  const sector = sectorMap[rawSector] || rawSector;

  // Mapeia status MySQL → lotStatus do FactoryFlow
  const statusMap = {
    aguardando:   'idle',
    em_producao:  'working',
    pausado:      'paused',
    concluido:    'idle',
    pronto:       'idle',
    rejeitado:    'rejected',
  };
  const fallbackLotStatus = statusMap[String(row.status || 'aguardando').toLowerCase()] || 'idle';
  const lotStatus = String(row.ff_lotStatus || '').trim() || fallbackLotStatus;
  // Prioriza ff_lotStatus (fonte de verdade operacional); status (legado) é fallback.
  const rejected  = String(row.ff_lotStatus || '').toLowerCase() === 'rejected'
    || String(row.status || '').toLowerCase() === 'rejeitado';

  const createdAt = row.data_criacao ? new Date(row.data_criacao).getTime() : Date.now();
  const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : createdAt;
  const ffSectorEnteredAt = Number(row.ff_sectorEnteredAt || row.ff_sector_entered_at || 0);
  let ffWorkSessions = [];
  try {
    ffWorkSessions = typeof row.ff_workSessions === 'string'
      ? JSON.parse(row.ff_workSessions || '[]')
      : (Array.isArray(row.ff_workSessions) ? row.ff_workSessions : []);
  } catch (_) { ffWorkSessions = []; }

  let ffHistory = [];
  try {
    ffHistory = typeof row.ff_history === 'string'
      ? JSON.parse(row.ff_history || '[]')
      : (Array.isArray(row.ff_history) ? row.ff_history : []);
  } catch (_) { ffHistory = []; }

  let ffSectorMetrics = [];
  try {
    ffSectorMetrics = typeof row.ff_sectorMetrics === 'string'
      ? JSON.parse(row.ff_sectorMetrics || '[]')
      : (Array.isArray(row.ff_sectorMetrics) ? row.ff_sectorMetrics : []);
  } catch (_) { ffSectorMetrics = []; }

  return {
    id:            'bridge_' + row.id,
    _bridgeId:     row.id,              // ID numérico original no MySQL
    _source:       'mysql',             // flag para distinguir origem
    raw_mysql:     row,
    sourceSector:  String(row.setor_atual || ''),
    setor_atual:   String(row.setor_atual || ''),
    number:        String(row.op || row.numero_pedido || ''),
    op:            String(row.op || ''),
    orderId:       'bridge_order_' + row.numero_pedido,
    orderNumber:   String(row.numero_pedido || ''),
    client:        String(row.cliente_nome  || ''),
    city:          '', // cliente_cidade do ERP é a cidade da fábrica, não do cliente; acessível via raw_mysql.cliente_cidade quando necessário
    address:       [row.cliente_endereco, row.cliente_bairro].filter(Boolean).join(', '),
    productCode:   String(row.produto_codigo || ''),
    productName:   String(row.produto_nome || ''),
    produto_nome:  String(row.produto_nome || ''),
    productType:   ffNormalizeProductType(row.tipo_lote || row.linha_produto, row.produto_nome, row.produto_codigo),
    paint:         String(row.produto_nome || row.produto_codigo || ''),
    qty:           ffFirstPositiveNumber(row.peso, row.pits_peso, row.quantidade),
    peso:          ffFirstPositiveNumber(row.peso, row.pits_peso, row.quantidade),
    unit:          'Kg',
    priority:      String(row.prioridade || 'normal').toLowerCase(),
    deliveryDate:  normalizeMysqlDate(row.deliveryDate || row.pits_previsao || row.previsao_entrega || row.data_entrega || ''),
    previsao_entrega: normalizeMysqlDate(row.previsao_entrega || row.deliveryDate || row.pits_previsao || row.data_entrega || ''),
    pits_previsao: normalizeMysqlDate(row.pits_previsao || row.deliveryDate || row.previsao_entrega || row.data_entrega || ''),
    skipColor:     false,
    notes:         String(row.origem || '') === 'MANUAL' ? 'Criado manualmente no FactoryFlow' : '',
    sector,
    lotStatus,
    rejected,
    rejectedAt:    null,
    rejectedReason:'',
    rejectedBy:    '',
    rejectedSector:'',
    createdAt,
    updatedAt,
    updated_at:     row.updated_at || '',
    sectorEnteredAt: ffSectorEnteredAt || updatedAt,
    history:       ffHistory,
    workSessions:  ffWorkSessions,
    sectorMetrics: ffSectorMetrics,
    // dados extras do MySQL
    cliente_codigo:  String(row.cliente_codigo || ''),
    cliente_cep:     String(row.cliente_cep    || ''),
    cliente_estado:  String(row.cliente_estado || ''),
    cliente_bairro:  String(row.cliente_bairro || ''),
    mysql_status:    String(row.status || 'aguardando'),
    backendStatus:   String(row.status || 'aguardando'),
    expedientePausedStatus: String(row.ff_expedientePausedStatus || '')
  };
}

/**
 * Atualiza o status/setor de um lote no backend bridge via PATCH.
 * Retorna true se ok, false se falhou.
 */
async function bridgePatchLot(bridgeId, data) {
  if (!BRIDGE_CONFIG.enabled || !BRIDGE_CONFIG.baseUrl) return false;
  try {
    const res = await fetch(`${BRIDGE_CONFIG.baseUrl}/api/producao/${bridgeId}`, {
      method: 'PATCH',
      headers: bridgeAuthHeaders(true),
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch (err) {
    console.warn('bridgePatchLot falhou:', err.message);
    return false;
  }
}

/**
 * Carrega os lotes do MySQL bridge e mescla com STATE.lots.
 * Lotes bridge existentes são substituídos; lotes ff_lots são mantidos intactos.
 */
let _ffBridgeLoadPromise = null;

async function loadBridgeLots(options = {}) {
  if (!BRIDGE_CONFIG.enabled) return;
  if (_ffBridgeLoadPromise) return _ffBridgeLoadPromise;

  _ffBridgeLoadPromise = (async () => {
    const limit = Math.min(Number(options.limit || 300), 500);

    // Rota leve criada no backend. Não usa /api/producao no carregamento inicial.
    let result = await bridgeApiGet('/api/producao/ativos', { limit }, {
      ...options,
      force: true,
      timeout: options.timeout ?? 12000
    });

    // Fallback seguro caso o deploy do backend ainda não tenha /ativos.
    if (!result || !Array.isArray(result.data)) {
      console.warn('loadBridgeLots: /api/producao/ativos falhou, tentando fallback /api/producao leve');
      result = await bridgeApiGet('/api/producao', { limit }, {
        ...options,
        force: true,
        timeout: options.timeout ?? 12000
      });
    }

    if (!result || !Array.isArray(result.data)) {
      STATE._bridgeConnected = false;
      console.warn('loadBridgeLots: nenhuma resposta válida da API de produção', result);
      return;
    }

    const rows = result.data;

    // O backend já manda apenas ativos; aqui só bloqueamos estados realmente finalizados/entregues.
    const excludedSector = new Set(['entrega', 'entregue', 'finalizado', 'finalizada', 'cancelado', 'cancelada', 'rejeitado', 'rejeitada']);
    const excludedStatus = new Set(['entregue', 'finalizado', 'finalizada', 'cancelado', 'cancelada', 'rejeitado', 'rejeitada', 'em_rota']);

    const bridgeLots = rows
      .map(deserializeBridgeLot)
      .filter(lot => {
        const sector = normalizeActiveKanbanValue(lot.sector || lot.setor_atual || lot.raw_mysql?.setor_atual);
        const status = normalizeActiveKanbanValue(lot.status || lot.backendStatus || lot.mysql_status || lot.raw_mysql?.status);
        return !excludedSector.has(sector) && !excludedStatus.has(status);
      });

    // Remove bridges antigos e também descarta lotes locais/ff_lots com a mesma OP já existente no MySQL.
    const nonBridgeLots = (STATE.lots || []).filter(l => l && l._source !== 'mysql' && !String(l.id || '').startsWith('bridge_'));
    STATE.lots = ffApplyOfficialLots([...nonBridgeLots, ...bridgeLots]);

    STATE._bridgeTotal = Number(result.total || rows.length || bridgeLots.length);
    STATE._bridgeConnected = true;
    STATE._bridgeLoadedAt = Date.now();

    console.log(`✅ loadBridgeLots: ${bridgeLots.length}/${rows.length} lotes MySQL carregados via ${BRIDGE_CONFIG.baseUrl}`);

    if (!bridgeLots.length && rows.length) {
      console.table(rows.slice(0, 10).map(r => ({
        id: r.id,
        op: r.op,
        setor_atual: r.setor_atual,
        status: r.status
      })));
    }
  })().finally(() => {
    _ffBridgeLoadPromise = null;
  });

  return _ffBridgeLoadPromise;
}

/**
 * Reload silencioso (usado pelo auto-update a cada 8s).
 */
async function reloadBridgeLots() {
  if (!BRIDGE_CONFIG.enabled) return;
  try {
    await loadBridgeLots({ limit: 300, force: true, timeout: 12000 });
  } catch (e) {
    console.warn('reloadBridgeLots falhou:', e.message);
  }
}

/**
 * Verifica se o bridge está online.
 * Retorna objeto { ok, latency } ou { ok: false, error }.
 */
async function checkBridgeHealth() {
  if (!BRIDGE_CONFIG.baseUrl) return { ok: false, error: 'URL não configurada' };
  const t0 = Date.now();
  try {
    const res = await fetch(`${BRIDGE_CONFIG.baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, latency: Date.now() - t0, sync: data.sync };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}


// ===================================================
// AUTO-UPDATE INTELIGENTE – preserva tela, scroll e modais
// ===================================================
// Use esta função no app.js no lugar de chamar renderKanban/renderLots direto
// depois do reloadData(). Ela evita "voltar para o topo" enquanto alguém está olhando o Kanban.
function shouldAvoidAutoRender() {
  const active = document.activeElement;
  const isTyping = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
  const hasModalOpen = Array.from(document.querySelectorAll('.modal')).some(m => {
    const st = window.getComputedStyle(m);
    return st.display !== 'none' && st.visibility !== 'hidden';
  });
  return isTyping || hasModalOpen;
}

function preserveScrollAndRender(renderFn) {
  if (typeof renderFn !== 'function') return;
  const x = window.scrollX;
  const y = window.scrollY;
  renderFn();
  requestAnimationFrame(() => window.scrollTo(x, y));
}

async function smartAutoUpdate(activePage) {
  const page = activePage || document.querySelector('.nav-item.active')?.dataset.page;

  await reloadData();

  // Se a pessoa está digitando ou com modal aberto, não redesenha a tela agora.
  // Os dados já ficam atualizados no STATE e aparecem no próximo refresh/troca de tela.
  if (shouldAvoidAutoRender()) return;

  if (page === 'kanban' && typeof renderKanban === 'function') {
    preserveScrollAndRender(renderKanban);
  } else if (page === 'lots' && typeof renderLots === 'function') {
    preserveScrollAndRender(renderLots);
  } else if (page === 'deliveries' && typeof renderDeliveries === 'function') {
    preserveScrollAndRender(renderDeliveries);
  } else if (page === 'dashboard' && typeof renderDashboard === 'function') {
    preserveScrollAndRender(renderDashboard);
  } else if (typeof _silentRefresh === 'function') {
    _silentRefresh(page);
  }
}

window.smartAutoUpdate = smartAutoUpdate;
window.shouldAvoidAutoRender = shouldAvoidAutoRender;
window.preserveScrollAndRender = preserveScrollAndRender;


// ===================================================
// CONTROLE DE EXPEDIENTE POR SETOR
// ===================================================
function normalizeShiftGroup(sector) {
  const s = String(sector || '').trim().toLowerCase();
  const map = {
    pcp: 'pcp_liberacao',
    pcp_lib: 'pcp_liberacao',
    pcp_liberacao: 'pcp_liberacao',
    coloracao_revisao: 'coloracao',
    coloracao_amostras: 'coloracao',
    laboratorio_revisao: 'laboratorio',
    laboratorio_amostras: 'laboratorio',
    envase: 'envase',
    envase_produzir: 'envase',
    envase_enlatamento: 'envase'
  };
  return map[s] || s;
}

function getCurrentUserShiftGroup(user = STATE.currentUser) {
  if (!user) return null;

  const role = String(user.role || '').trim().toLowerCase();

  // IMPORTANTE: PCP continua como role administrativo, portanto segue vendo Dashboard,
  // Pedidos, Entregas, Motoristas etc. Aqui ele apenas ganha um grupo de expediente.
  if (role === 'pcp' || role === 'pcp_lib') return 'pcp_liberacao';

  if (role === 'sector' && user.sector) return normalizeShiftGroup(user.sector);

  const acesso = String(user.acesso_factoryflow || user.factoryflow || '').trim().toLowerCase();
  if (['pcp', 'pcp_lib', 'liberacao', 'liberacao pcp'].includes(acesso)) return 'pcp_liberacao';
  if (SECTOR_VISIBILITY[acesso] || WORK_TRACKABLE_SECTORS.includes(acesso)) return normalizeShiftGroup(acesso);

  return null;
}

function isSectorUser(user = STATE.currentUser) {
  return !!getCurrentUserShiftGroup(user);
}

function getShiftForSector(sector) {
  const group = normalizeShiftGroup(sector);
  return STATE.sectorShifts?.[group] || null;
}

function isExpedienteAbertoForSector(sector) {
  const group = normalizeShiftGroup(sector);
  const shift = STATE.sectorShifts?.[group];
  return !!(shift && Number(shift.expediente_aberto) === 1);
}

function parseFactoryFlowDateMs(value) {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10000000000 ? Math.round(value * 1000) : Math.round(value);
  }

  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }

  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n < 10000000000 ? Math.round(n * 1000) : Math.round(n);
  }

  let t = new Date(raw).getTime();
  if (Number.isFinite(t)) return t;

  // Compatibilidade com DATETIME do MySQL sem timezone: "YYYY-MM-DD HH:mm:ss".
  // O navegador entende melhor quando trocamos o espaço por "T".
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw)) {
    t = new Date(raw.replace(' ', 'T')).getTime();
    if (Number.isFinite(t)) return t;
  }

  return null;
}

function getShiftFinalizadoMs(sector) {
  const shift = getShiftForSector(sector);
  if (!shift) return null;
  return parseFactoryFlowDateMs(shift.finalizado_em || shift.finalizadoEm || shift.closedAt || shift.closed_at);
}

function getShiftIniciadoMs(sector) {
  const shift = getShiftForSector(sector);
  if (!shift) return null;
  return parseFactoryFlowDateMs(shift.iniciado_em || shift.iniciadoEm || shift.openedAt || shift.opened_at);
}

function getEffectiveNowForSector(sector) {
  if (typeof ffGetEffectiveNowForSectorSafe === 'function') {
    return ffGetEffectiveNowForSectorSafe(sector, null);
  }
  if (!canTrackWork(sector)) return Date.now();
  if (isExpedienteAbertoForSector(sector)) return Date.now();
  return getShiftFinalizadoMs(sector) || Date.now();
}

function getEffectiveNowForLot(lot) {
  if (typeof ffGetEffectiveNowForSectorSafe === 'function') {
    return ffGetEffectiveNowForSectorSafe(lot?.sector, lot);
  }
  return getEffectiveNowForSector(lot?.sector);
}

async function expedienteApiGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const base = (typeof BRIDGE_CONFIG !== 'undefined' && BRIDGE_CONFIG.baseUrl) ? BRIDGE_CONFIG.baseUrl : '';
  const url = `${base}${path}${qs ? '?' + qs : ''}`;
  const headers = typeof bridgeAuthHeaders === 'function' ? bridgeAuthHeaders(false) : {};
  const res = await fetch(url, { headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || `GET ${path} falhou: ${res.status}`);
  return json;
}

async function expedienteApiPost(path, data = {}) {
  const base = (typeof BRIDGE_CONFIG !== 'undefined' && BRIDGE_CONFIG.baseUrl) ? BRIDGE_CONFIG.baseUrl : '';
  const headers = typeof bridgeAuthHeaders === 'function' ? bridgeAuthHeaders(true) : { 'Content-Type':'application/json' };
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || `POST ${path} falhou: ${res.status}`);
  return json;
}

async function loadSectorShifts() {
  try {
    const json = await expedienteApiGet('/api/expediente');
    const rows = Array.isArray(json.data) ? json.data : [];
    const map = {};
    rows.forEach(r => {
      const key = normalizeShiftGroup(r.setor);
      map[key] = { ...r, setor: key };
    });
    STATE.sectorShifts = map;
    updateExpedienteButton();
    return map;
  } catch (e) {
    console.warn('Não foi possível carregar expediente dos setores:', e.message);
    updateExpedienteButton();
    return STATE.sectorShifts || {};
  }
}

async function loadCurrentSectorShift() {
  const setor = getCurrentUserShiftGroup();
  if (!setor) { updateExpedienteButton(); return null; }
  try {
    const json = await expedienteApiGet(`/api/expediente/${encodeURIComponent(setor)}`);
    const row = json.data || json;
    STATE.sectorShifts[setor] = { ...row, setor };
    updateExpedienteButton();
    return STATE.sectorShifts[setor];
  } catch (e) {
    console.warn('Não foi possível carregar expediente do setor:', e.message);
    updateExpedienteButton();
    return null;
  }
}

function getLotsByShiftGroup(group) {
  const normalizedGroup = normalizeShiftGroup(group);
  return (STATE.lots || []).filter(lot => {
    if (!lot || lot.rejected) return false;
    if (['pronto','entrega','entregue'].includes(lot.sector)) return false;
    if (!canTrackWork(lot.sector)) return false;
    return normalizeShiftGroup(lot.sector) === normalizedGroup;
  });
}

async function persistLotsQuietly(lots) {
  const list = Array.isArray(lots) ? lots : [];
  for (const lot of list) {
    try { await apiUpdateLot(lot); }
    catch (e) { console.warn(`Falha ao salvar tempo do lote ${lot.number || lot.id}:`, e.message); }
  }
}

async function freezeLotsForShiftClose(group, closeMs) {
  const lots = getLotsByShiftGroup(group);
  const user = STATE.currentUser || {};

  lots.forEach(lot => {
    const sessions = Array.isArray(lot.workSessions) ? [...lot.workSessions] : [];

    if (lot.lotStatus === 'working') {
      let openSession = sessions.find(s =>
        normalizeShiftGroup(s.sector) === group &&
        !s.end &&
        !(s.pauseReason && String(s.pauseReason).trim())
      );
      if (openSession) {
        openSession.end = closeMs;
        openSession.closeReason = 'Fim de expediente';
      }
      lot.expedientePausedStatus = 'working';
      lot.lotStatus = 'idle';
    } else if (lot.lotStatus === 'paused') {
      let openPause = sessions.find(s =>
        normalizeShiftGroup(s.sector) === group &&
        !s.end &&
        s.pauseReason &&
        String(s.pauseReason).trim()
      );
      if (openPause) openPause.end = closeMs;
      lot.expedientePausedStatus = 'paused';
      lot.lotStatus = 'idle';
    } else {
      lot.expedientePausedStatus = lot.expedientePausedStatus || '';
    }

    lot.workSessions = sessions;
    lot._expedienteFrozenAt = closeMs;
    lot._expedienteFrozenBy = user.name || user.login || user.id || '';
  });

  await persistLotsQuietly(lots);
}

async function resumeLotsForShiftOpen(group, openMs, lastCloseMs) {
  const lots = getLotsByShiftGroup(group);
  const user = STATE.currentUser || {};
  const closedMs = lastCloseMs ? Math.max(0, openMs - lastCloseMs) : 0;

  lots.forEach(lot => {
    if (closedMs > 0) {
      lot.sectorEnteredAt = (Number(lot.sectorEnteredAt) || Number(lot.createdAt) || openMs) + closedMs;
    }

    const sessions = Array.isArray(lot.workSessions) ? [...lot.workSessions] : [];
    if (lot.expedientePausedStatus === 'working') {
      sessions.push({
        sector: lot.sector,
        start: openMs,
        end: null,
        user: user.id,
        userName: user.name || user.login || 'Usuário'
      });
      lot.lotStatus = 'working';
    }

    lot.expedientePausedStatus = '';
    lot.workSessions = sessions;
    delete lot._expedienteFrozenAt;
  });

  await persistLotsQuietly(lots);
}

// Evita disparar dois toggles em paralelo (duplo clique, Enter repetido) enquanto a API
// ainda não respondeu o clique anterior.
let _expedienteToggleBusy = false;

function ffFormatHora(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Verifica se algum dia entre startMs e endMs cai num sábado/domingo, para reforçar o
// alerta de "expediente aberto há muito tempo" quando ele atravessa o fim de semana
// (foi exatamente esse cenário — fechar a sexta, reabrir por engano e ficar aberto até
// segunda — que motivou esta funcionalidade).
function ffRangeIncludesWeekend(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  let guard = 0;
  while (cursor.getTime() <= endMs && guard < 14) {
    const day = cursor.getDay();
    if (day === 0 || day === 6) return true;
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return false;
}

// Aplica o estado otimista (antes da API responder) e devolve uma função de reconciliação.
// O backend continua sendo a fonte da verdade: o estado otimista é só visual e é substituído
// pelo retorno real do POST /toggle (ou desfeito, em caso de erro).
function ffApplyOptimisticShift(setor, aberto) {
  const previous = STATE.sectorShifts?.[setor] || null;
  const now = new Date();
  STATE.sectorShifts[setor] = {
    ...(previous || {}),
    setor,
    expediente_aberto: aberto ? 1 : 0,
    iniciado_em: aberto ? now : (previous?.iniciado_em ?? previous?.iniciadoEm ?? null),
    finalizado_em: aberto ? null : now
  };
  updateExpedienteButton();
  return previous;
}

async function iniciarExpedienteSetor() {
  if (_expedienteToggleBusy) return;
  const setor = getCurrentUserShiftGroup();
  if (!setor) return alert('Não consegui identificar o setor deste usuário.');
  const label = SECTOR_LABELS[setor] || setor;

  // Estado já aberto na tela: avisa e não deixa abrir de novo (o backend também bloqueia,
  // isto é só para dar feedback imediato sem round-trip).
  if (isExpedienteAbertoForSector(setor)) {
    const openedAt = ffFormatHora(getShiftIniciadoMs(setor));
    showToast(`⚠️ O expediente deste setor já está aberto${openedAt ? ' desde ' + openedAt : ''}.`, 'error');
    updateExpedienteButton();
    return;
  }

  const previous = STATE.sectorShifts?.[setor] || null;
  const lastCloseMs = parseFactoryFlowDateMs(previous?.finalizado_em || previous?.finalizadoEm || previous?.closedAt || previous?.closed_at);

  // Reabertura acidental pouco depois de fechar (o incidente que motivou esta melhoria):
  // exige confirmação mais forte, mas não bloqueia — pode ser intencional.
  const minutesSinceClose = Number.isFinite(lastCloseMs) ? (Date.now() - lastCloseMs) / 60000 : null;
  if (minutesSinceClose !== null && minutesSinceClose >= 0 && minutesSinceClose < 10) {
    const ok = confirm(`Este setor (${label}) foi fechado há poucos minutos. Tem certeza que deseja reabrir o expediente?`);
    if (!ok) return;
  } else {
    const ok = confirm(`Deseja iniciar o expediente do setor ${label} agora?`);
    if (!ok) return;
  }

  _expedienteToggleBusy = true;
  // Atualização otimista: a tela já mostra "aberto" e o horário antes da API responder.
  // O botão em si mostra "Salvando..." (via _expedienteToggleBusy) até a confirmação do backend.
  const previousForRevert = ffApplyOptimisticShift(setor, true);

  try {
    const json = await expedienteApiPost('/api/expediente/toggle', { setor, expediente_aberto: 1 });
    const savedShift = { ...(json.data || json), setor };
    STATE.sectorShifts[setor] = savedShift;
    _expedienteToggleBusy = false;
    updateExpedienteButton();

    if (json.unchanged) {
      showToast(`⚠️ O expediente deste setor já está aberto.`, 'error');
    } else {
      showToast(`✅ Expediente iniciado – ${label}`);
      // Congelamento/retomada de sessões dos lotes não precisa travar a atualização visual
      // do botão: roda em segundo plano e só então atualiza Kanban/relatório em tela.
      const openMs = parseFactoryFlowDateMs(savedShift.iniciado_em || savedShift.iniciadoEm || savedShift.openedAt || savedShift.opened_at) || Date.now();
      resumeLotsForShiftOpen(setor, openMs, Number.isFinite(lastCloseMs) ? lastCloseMs : null)
        .then(refreshActiveFactoryFlowPage)
        .catch(e => console.warn('Falha ao retomar lotes após abrir expediente:', e.message));
    }
  } catch (e) {
    STATE.sectorShifts[setor] = previousForRevert;
    _expedienteToggleBusy = false;
    updateExpedienteButton();
    alert('Erro ao iniciar expediente: ' + e.message);
  }
}

async function finalizarExpedienteSetor() {
  if (_expedienteToggleBusy) return;
  const setor = getCurrentUserShiftGroup();
  if (!setor) return alert('Não consegui identificar o setor deste usuário.');
  const label = SECTOR_LABELS[setor] || setor;

  if (!isExpedienteAbertoForSector(setor)) {
    showToast(`⚠️ O expediente deste setor já está fechado.`, 'error');
    updateExpedienteButton();
    return;
  }

  const ok = confirm(`Deseja fechar o expediente do setor ${label} agora (${ffFormatHora(Date.now())})?`);
  if (!ok) return;

  _expedienteToggleBusy = true;
  const previousForRevert = ffApplyOptimisticShift(setor, false);

  try {
    const json = await expedienteApiPost('/api/expediente/toggle', { setor, expediente_aberto: 0 });
    const savedShift = { ...(json.data || json), setor };
    STATE.sectorShifts[setor] = savedShift;
    _expedienteToggleBusy = false;
    updateExpedienteButton();

    if (json.unchanged) {
      showToast(`⚠️ O expediente deste setor já está fechado.`, 'error');
    } else {
      showToast(`⏸️ Expediente finalizado – ${label}`);
      const closeMs = parseFactoryFlowDateMs(savedShift.finalizado_em || savedShift.finalizadoEm || savedShift.closedAt || savedShift.closed_at) || Date.now();
      freezeLotsForShiftClose(setor, closeMs)
        .then(refreshActiveFactoryFlowPage)
        .catch(e => console.warn('Falha ao congelar lotes após fechar expediente:', e.message));
    }
  } catch (e) {
    STATE.sectorShifts[setor] = previousForRevert;
    _expedienteToggleBusy = false;
    updateExpedienteButton();
    alert('Erro ao finalizar expediente: ' + e.message);
  }
}

async function toggleExpedienteSetor() {
  if (_expedienteToggleBusy) return;
  const setor = getCurrentUserShiftGroup();
  if (!setor) return alert('Usuário sem setor vinculado.');
  const aberto = isExpedienteAbertoForSector(setor);
  if (aberto) return finalizarExpedienteSetor();
  return iniciarExpedienteSetor();
}

function updateExpedienteButton() {
  const box = document.getElementById('expedienteBox');
  const btn = document.getElementById('btnExpedienteSetor');
  const status = document.getElementById('expedienteStatus');
  const alertBox = document.getElementById('expedienteAlert');
  if (!box || !btn || !status) return;

  const setor = getCurrentUserShiftGroup();
  if (!setor) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  const aberto = isExpedienteAbertoForSector(setor);
  const label = SECTOR_LABELS[setor] || (setor === 'pcp_liberacao' ? 'PCP (Liberação)' : setor);

  btn.disabled = _expedienteToggleBusy;
  btn.classList.toggle('is-open', aberto);
  btn.classList.toggle('is-closed', !aberto);
  if (_expedienteToggleBusy) {
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
  } else {
    btn.innerHTML = aberto
      ? '<i class="fas fa-stop-circle"></i> Finalizar expediente'
      : '<i class="fas fa-play-circle"></i> Iniciar expediente';
  }

  const openedAt = ffFormatHora(getShiftIniciadoMs(setor));
  const closedAt = ffFormatHora(getShiftFinalizadoMs(setor));
  const lastTimeLine = aberto
    ? (openedAt ? `<small>Aberto desde ${openedAt}</small>` : '')
    : (closedAt ? `<small>Fechado às ${closedAt}</small>` : '');

  status.innerHTML = aberto
    ? `<span class="dot on"></span> Expediente aberto – ${label}${lastTimeLine}`
    : `<span class="dot off"></span> Expediente fechado – ${label}${lastTimeLine}`;

  if (!alertBox) return;
  if (aberto) {
    const openMs = getShiftIniciadoMs(setor);
    const openHours = Number.isFinite(openMs) ? (Date.now() - openMs) / 3600000 : 0;
    if (Number.isFinite(openMs) && openHours >= 12) {
      const crossesWeekend = ffRangeIncludesWeekend(openMs, Date.now());
      alertBox.style.display = 'block';
      alertBox.className = `expediente-alert ${crossesWeekend ? 'danger' : 'warn'}`;
      alertBox.textContent = crossesWeekend
        ? `Atenção: expediente aberto há mais de ${Math.floor(openHours)}h e atravessando um fim de semana. Verifique se não foi esquecido aberto.`
        : `Atenção: expediente aberto há mais de ${Math.floor(openHours)}h. Verifique se não foi esquecido aberto.`;
    } else {
      alertBox.style.display = 'none';
    }
  } else {
    alertBox.style.display = 'none';
  }
}

function refreshActiveFactoryFlowPage() {
  const activePage = document.querySelector('.nav-item.active')?.dataset.page;
  if (activePage && typeof _silentRefresh === 'function') return _silentRefresh(activePage);
  if (typeof renderKanban === 'function') renderKanban();
}

window.loadSectorShifts = loadSectorShifts;
window.loadCurrentSectorShift = loadCurrentSectorShift;
window.toggleExpedienteSetor = toggleExpedienteSetor;
window.updateExpedienteButton = updateExpedienteButton;
window.isExpedienteAbertoForSector = isExpedienteAbertoForSector;
