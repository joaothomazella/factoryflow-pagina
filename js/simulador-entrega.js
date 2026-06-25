// ===================================================
// SIMULADOR-ENTREGA.JS – Simulador Inteligente de Entrega
// FactoryFlow v1.1 – PATCH: exclui Pronto/Entregue da fila produtiva
//
// Permite ao PCP simular se um pedido urgente pode ser
// encaixado na produção sem comprometer a fila existente.
//
// Usa STATE.lots como fonte de dados.
// Preparado para futura integração com:
//   GET /api/producao/simulador-contexto
//   POST /api/producao/simular-entrega
// ===================================================
'use strict';

// ─────────────────────────────────────────────────────────────────
// DEBUG FLAG – setar window.DEBUG_SIMULADOR = true no console para logs
// ─────────────────────────────────────────────────────────────────
window.DEBUG_SIMULADOR = false;
function _simLog(...args) {
  if (window.DEBUG_SIMULADOR) console.log('[Simulador]', ...args);
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTES – edite aqui para ajustar capacidades e tempos
// ─────────────────────────────────────────────────────────────────

/** Capacidade diária aproximada em Kg por setor */
const FF_SECTOR_DAILY_CAPACITY_KG = {
  pcp_liberacao:         99999,
  pesagem:               800,
  producao:              1200,
  moagem:                600,
  coloracao:             600,
  laboratorio:           900,
  laboratorio_revisao:   900,
  coloracao_revisao:     600,
  laboratorio_amostras:  500,
  coloracao_amostras:    400,
  envase_produzir:       1000,
  envase_enlatamento:    1000,
  pronto:                99999,
  entregue:              99999
};

/** Tempo base em minutos por setor (independente de quantidade) */
const FF_SECTOR_DEFAULT_TIME_MINUTES = {
  pcp_liberacao:         20,
  pesagem:               40,
  producao:              120,
  moagem:                90,
  coloracao:             90,
  laboratorio:           80,
  laboratorio_revisao:   60,
  coloracao_revisao:     60,
  laboratorio_amostras:  60,
  coloracao_amostras:    60,
  envase_produzir:       90,
  envase_enlatamento:    120,
  pronto:                0,
  entregue:              0
};

/** Minutos úteis num dia de trabalho (9h úteis) */
const FF_WORKDAY_MINUTES = 540;

/** Hora de início do expediente (HH:MM) */
const FF_WORKDAY_START = '07:10';

/** Hora de término do expediente normal (HH:MM) */
const FF_WORKDAY_END   = '17:25';

/** Máximo de minutos extra permitidos antes de classificar como "impossível" */
const FF_MAX_OVERTIME_MINUTES = 180; // 3h

// ─────────────────────────────────────────────────────────────────
// SETORES QUE AINDA IMPACTAM PRODUÇÃO (não finais)
// ─────────────────────────────────────────────────────────────────
// Setores que ainda fazem parte do PROCESSO PRODUTIVO.
// IMPORTANTE: 'pronto' / 'pronto_para_entrega' NÃO entram aqui, porque o simulador
// deve calcular somente até o lote ficar pronto para entrega. Depois disso não
// deve bloquear fila produtiva, carga por setor, forecast nem prioridade.
const FF_ACTIVE_SECTORS = new Set([
  'pcp_liberacao', 'pesagem', 'producao', 'moagem',
  'coloracao', 'laboratorio', 'laboratorio_revisao',
  'coloracao_revisao', 'laboratorio_amostras', 'coloracao_amostras',
  'envase_produzir', 'envase_enlatamento'
]);

const FF_DONE_SECTORS = new Set([
  'pronto', 'pronto_para_entrega', 'pronto_entrega',
  'entrega', 'em_entrega', 'em_rota', 'rota',
  'entregue', 'finalizado', 'finalizada', 'cancelado', 'cancelada',
  'rejected', 'rejeitado', 'rejeitada', 'entregue_direto',
  'done', 'delivered', 'finished'
]);

// Setores de revisão pré-PCP não entram no cálculo de capacidade produtiva
// nem no fluxo previsto do pedido novo. Eles são etapas administrativas/de revisão
// e estavam distorcendo a previsão do simulador.
const FF_IGNORED_SIMULATION_SECTORS = new Set([
  'coloracao_revisao',
  'laboratorio_revisao'
]);

// ─────────────────────────────────────────────────────────────────
// FLUXOS POR TIPO (fallback – usa PRODUCT_FLOWS de data.js se existir)
// ─────────────────────────────────────────────────────────────────
const FF_SIM_PRODUCT_FLOWS_FALLBACK = {
  tinta:        ['pcp_liberacao','pesagem','producao','coloracao','laboratorio','envase_enlatamento','pronto'],
  base:         ['pcp_liberacao','pesagem','producao','laboratorio','entregue'],
  diluente:     ['pcp_liberacao','envase_produzir','pronto'],
  endurecedor:  ['pcp_liberacao','pesagem','producao','envase_enlatamento','pronto'],
  amostra:      ['pcp_liberacao','laboratorio_amostras','coloracao_amostras','laboratorio_amostras','pronto'],
  verniz:       ['pcp_liberacao','pesagem','producao','laboratorio','envase_enlatamento','pronto'],
  epoxi:        ['pcp_liberacao','pesagem','producao','coloracao','laboratorio','envase_enlatamento','pronto'],
  poliuretano:  ['pcp_liberacao','pesagem','producao','coloracao','laboratorio','envase_enlatamento','pronto'],
  esmalte:      ['pcp_liberacao','pesagem','producao','coloracao','laboratorio','envase_enlatamento','pronto'],
  outro:        ['pcp_liberacao','pesagem','producao','coloracao','laboratorio','envase_enlatamento','pronto']
};

// ─────────────────────────────────────────────────────────────────
// ESTADO INTERNO DO SIMULADOR
// ─────────────────────────────────────────────────────────────────
let _simContext = null;  // lotes carregados
let _simResult  = null;  // último resultado

// ─────────────────────────────────────────────────────────────────
// HELPERS DE CAMPOS (fallback seguro)
// ─────────────────────────────────────────────────────────────────

// Normaliza setores vindos de fontes diferentes para evitar que
// 'Pronto para Entrega', 'envase-enlatamento' etc. entrem como setores produtivos.
function ffNormalizeSimSector(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');

  const map = {
    'pcp': 'pcp_liberacao',
    'pcp_liberacao': 'pcp_liberacao',
    'pcp_lib': 'pcp_liberacao',
    'pesagem': 'pesagem',
    'producao': 'producao',
    'moagem': 'moagem',
    'coloracao': 'coloracao',
    'coloracao_revisao': 'coloracao_revisao',
    'coloracao_amostras': 'coloracao_amostras',
    'laboratorio': 'laboratorio',
    'laboratorio_revisao': 'laboratorio_revisao',
    'laboratorio_amostras': 'laboratorio_amostras',
    'envase': 'envase_enlatamento',
    'enlatamento': 'envase_enlatamento',
    'envase_enlatamento': 'envase_enlatamento',
    'envase_produzir': 'envase_produzir',
    'envase_producao': 'envase_produzir',
    'pronto': 'pronto',
    'pronto_para_entrega': 'pronto',
    'pronto_entrega': 'pronto',
    'entrega': 'entrega',
    'em_rota': 'entrega',
    'rota': 'entrega',
    'entregue': 'entregue',
    'produto_entregue': 'entregue',
    'finalizado': 'finalizado',
    'finalizada': 'finalizado',
    'cancelado': 'cancelado',
    'cancelada': 'cancelado',
    'rejeitado': 'rejected',
    'rejeitada': 'rejected'
  };

  return map[s] || s;
}

function ffIsLotDoneForSimulation(lot) {
  const sector = ffGetLotSector(lot);
  const statusCandidates = [
    lot?.lotStatus, lot?.status, lot?.stage, lot?.currentSector, lot?.setor_atual,
    lot?.mysql_status, lot?.raw_mysql?.status, lot?.raw_mysql?.setor_atual
  ].map(ffNormalizeSimSector);

  if (FF_DONE_SECTORS.has(sector)) return true;
  if (statusCandidates.some(s => FF_DONE_SECTORS.has(s))) return true;
  if (lot?.rejected || lot?.cancelado || lot?.cancelled) return true;

  return false;
}

function ffIsLotProductiveForSimulation(lot) {
  const sector = ffGetLotSector(lot);
  return !ffIsLotDoneForSimulation(lot) &&
         FF_ACTIVE_SECTORS.has(sector) &&
         !FF_IGNORED_SIMULATION_SECTORS.has(sector);
}

function ffGetLotDeliveryDate(lot) {
  return lot?.deliveryDate || lot?.data_entrega ||
         lot?.pits_previsao || lot?.raw_mysql?.data_entrega ||
         lot?.raw_mysql?.pits_previsao || null;
}

function ffGetLotPriority(lot) {
  return (lot?.priority || lot?.prioridade || 'normal').toLowerCase();
}

function ffGetLotQtyKg(lot) {
  const v = lot?.qty ?? lot?.quantidade ?? lot?.peso ??
            lot?.raw_mysql?.quantidade ?? lot?.raw_mysql?.peso ?? 0;
  return Math.max(0, parseFloat(String(v).replace(/[^\d.,]/g,'').replace(',','.')) || 0);
}

function ffGetLotSector(lot) {
  const raw = lot?.sector || lot?.stage || lot?.currentSector ||
              lot?.setor_atual || lot?.raw_mysql?.setor_atual ||
              lot?.status || '';
  return ffNormalizeSimSector(raw);
}

function ffGetLotProductType(lot) {
  return (lot?.productType || lot?.tipo || lot?.tipo_produto ||
          lot?.raw_mysql?.tipo || 'tinta').toLowerCase();
}

function ffGetLotOP(lot) {
  return lot?.op || lot?.number || lot?.numero_lote || lot?.id || '–';
}

function ffGetLotClient(lot) {
  return lot?.client || lot?.cliente || lot?.cliente_nome ||
         lot?.raw_mysql?.cliente_nome || '–';
}

function ffGetLotProductName(lot) {
  return lot?.paint || lot?.productName || lot?.produto_nome ||
         lot?.nome_produto || lot?.raw_mysql?.produto_nome || '–';
}

function ffGetLotProductCode(lot) {
  return lot?.productCode || lot?.produto_codigo || lot?.codigo_produto ||
         lot?.raw_mysql?.produto_codigo || '–';
}

// ─────────────────────────────────────────────────────────────────
// FLUXO DO PRODUTO
// ─────────────────────────────────────────────────────────────────

function ffGetProductFlowForSimulation(productType) {
  const pt = (productType || 'tinta').toLowerCase();
  const rawFlow = (typeof PRODUCT_FLOWS !== 'undefined' && PRODUCT_FLOWS[pt])
    ? PRODUCT_FLOWS[pt]
    : (FF_SIM_PRODUCT_FLOWS_FALLBACK[pt] || FF_SIM_PRODUCT_FLOWS_FALLBACK['tinta']);

  // O simulador estima somente o caminho PRODUTIVO até ficar pronto para entrega.
  // Portanto remove 'pronto', 'entregue' e qualquer setor final.
  return [...new Set(rawFlow.map(ffNormalizeSimSector))]
    .filter(s =>
      FF_ACTIVE_SECTORS.has(s) &&
      !FF_DONE_SECTORS.has(s) &&
      !FF_IGNORED_SIMULATION_SECTORS.has(s)
    );
}

// ─────────────────────────────────────────────────────────────────
// ESTIMATIVA DE TEMPO POR SETOR
// ─────────────────────────────────────────────────────────────────

/**
 * Estima minutos necessários para processar `kg` kg no `sector`.
 * Futuramente pode usar média histórica do backend.
 *
 * BACKEND FUTURO: GET /api/producao/simulador-contexto
 * deveria retornar mediaHistoricaPorSetor[setor][productType]
 */
function ffEstimateSectorTimeMinutes(productType, kg, sector, lotOrInput) {
  const base   = FF_SECTOR_DEFAULT_TIME_MINUTES[sector] || 30;
  const capKg  = FF_SECTOR_DAILY_CAPACITY_KG[sector]    || 999;

  if (capKg >= 99999 || base === 0) return base; // setores administrativos

  const kgSafe     = Math.max(1, kg || 50);
  // Proporção do dia necessária para este lote
  const fraction   = kgSafe / capKg;
  const estimated  = Math.round(base + fraction * FF_WORKDAY_MINUTES);

  // Garante mínimo de base e máximo razoável de 1 dia útil
  return Math.min(FF_WORKDAY_MINUTES, Math.max(base, estimated));
}

// ─────────────────────────────────────────────────────────────────
// SCORE DE PRIORIDADE
// ─────────────────────────────────────────────────────────────────

function calculateProductionPriorityScore(lot) {
  const reasons = [];
  let score = 0;

  if (ffIsLotDoneForSimulation(lot)) {
    return { score: 0, reasons: ['Lote pronto/entregue/finalizado: fora da fila produtiva'] };
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const today    = new Date(todayStr);
  const rawDate  = ffGetLotDeliveryDate(lot);
  const priority = ffGetLotPriority(lot);
  const sector   = ffGetLotSector(lot);
  const kg       = ffGetLotQtyKg(lot);

  // ── Data de entrega ──
  if (rawDate) {
    const dd   = new Date(rawDate.includes('T') ? rawDate : rawDate + 'T00:00:00');
    const diff = Math.round((dd - today) / 86400000);

    if (diff < 0)       { score += 150; reasons.push('Pedido atrasado: +150'); }
    else if (diff === 0){ score += 100; reasons.push('Entrega hoje: +100'); }
    else if (diff === 1){ score += 80;  reasons.push('Entrega amanhã: +80'); }
    else if (diff === 2){ score += 50;  reasons.push('Entrega em 2 dias: +50'); }
    else if (diff <= 4) { score += 25;  reasons.push(`Entrega em ${diff} dias: +25`); }
    else                { score += 5;   reasons.push(`Entrega em ${diff} dias: +5`); }
  }

  // ── Prioridade ──
  if (priority === 'sameday') { score += 100; reasons.push('Prioridade mesmo dia: +100'); }
  else if (priority === 'urgent') { score += 70; reasons.push('Prioridade urgente: +70'); }
  else { score += 20; reasons.push('Prioridade normal: +20'); }

  // ── Setor atual (mais avançado = maior score) ──
  if (['envase_produzir','envase_enlatamento'].includes(sector)) {
    score += 25; reasons.push('Já em envase: +25');
  } else if (['laboratorio','laboratorio_revisao','coloracao','coloracao_revisao',
              'laboratorio_amostras','coloracao_amostras'].includes(sector)) {
    score += 20; reasons.push('Já em laboratório/coloração: +20');
  } else if (['producao','moagem','pesagem'].includes(sector)) {
    score += 15; reasons.push('Já em produção/pesagem: +15');
  } else {
    score += 5; reasons.push('Ainda no PCP: +5');
  }

  // ── Quantidade ──
  if (kg <= 50)      { score += 10; reasons.push('Pedido pequeno (≤50kg): +10'); }
  else if (kg > 500) { score -= 10; reasons.push('Pedido grande (>500kg): −10'); }

  // ── Placeholder cliente estratégico (futuramente via backend) ──
  // if (isStrategicClient(ffGetLotClient(lot))) { score += 40; reasons.push('Cliente estratégico: +40'); }

  _simLog('Score', ffGetLotOP(lot), score, reasons);
  return { score: Math.max(0, score), reasons };
}

// ─────────────────────────────────────────────────────────────────
// CONTEXTO DE SIMULAÇÃO – carrega lotes ativos
// ─────────────────────────────────────────────────────────────────

/**
 * Carrega o contexto de simulação.
 * BACKEND FUTURO: GET /api/producao/simulador-contexto
 * Se o endpoint não existir, usa STATE.lots.
 */
async function ffLoadSimulationContext() {
  // FUTURO: tentar endpoint real
  // const base = typeof API_BASE !== 'undefined' ? API_BASE : '';
  // if (base) {
  //   try {
  //     const res = await fetch(`${base}/api/producao/simulador-contexto`, { ... });
  //     if (res.ok) return await res.json();
  //   } catch (_) {}
  // }

  // Fallback: dados locais
  if (typeof STATE === 'undefined' || !Array.isArray(STATE.lots)) return [];

  const activeLots = STATE.lots.filter(l => ffIsLotProductiveForSimulation(l));

  _simLog('Lotes ativos para simulação:', activeLots.length);
  return activeLots;
}

// ─────────────────────────────────────────────────────────────────
// FILA ATUAL
// ─────────────────────────────────────────────────────────────────

function ffBuildCurrentProductionQueue(lots) {
  return lots
    .map(l => {
      const { score, reasons } = calculateProductionPriorityScore(l);
      return { lot: l, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────
// FILA SIMULADA (com o novo pedido)
// ─────────────────────────────────────────────────────────────────

function ffBuildSimulatedQueue(currentQueue, newOrderEntry) {
  const merged = [...currentQueue, newOrderEntry];
  return merged.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────
// ANÁLISE DE IMPACTO
// ─────────────────────────────────────────────────────────────────

function ffCalculateQueueImpact(queueBefore, queueAfter, newOrder) {
  const canPassAheadOf    = [];
  const cannotPassAheadOf = [];
  const delayedOrders     = [];

  const todayStr = new Date().toISOString().split('T')[0];
  const today = new Date(todayStr + 'T00:00:00');
  const newScore = Number(newOrder?.score || 0);
  const newDesiredDate = ffGetLotDeliveryDate(newOrder?.lot);
  const newDesiredDay = newDesiredDate
    ? new Date(String(newDesiredDate).includes('T') ? newDesiredDate : newDesiredDate + 'T00:00:00')
    : null;

  queueBefore.forEach(entry => {
    const lot = entry.lot;
    if (!ffIsLotProductiveForSimulation(lot)) return;

    const rawDate  = ffGetLotDeliveryDate(lot);
    const priority = ffGetLotPriority(lot);
    const lotDay   = rawDate
      ? new Date(String(rawDate).includes('T') ? rawDate : rawDate + 'T00:00:00')
      : null;
    const diff = lotDay ? Math.round((lotDay - today) / 86400000) : 99;

    // Crítico duro: atrasado, entrega hoje/amanhã ou prioridade mesmo dia.
    // "Urgente" sozinho não deve bloquear se a entrega é futura; senão o simulador
    // fica pessimista demais e marca atraso onde ainda há vários dias de folga.
    const hardCritical =
      diff < 0 ||
      diff === 0 ||
      diff === 1 ||
      priority === 'sameday';

    const scoreBlocks = hardCritical && Number(entry.score || 0) >= newScore;
    const sameOrEarlierDue = lotDay && newDesiredDay && lotDay.getTime() <= newDesiredDay.getTime();

    if (scoreBlocks) {
      cannotPassAheadOf.push({
        ...entry,
        diff,
        pushReason: 'Entrega crítica ou prioridade superior/igual'
      });

      // Só marca como atraso real se o lote bloqueador tem entrega no mesmo prazo
      // ou antes do novo pedido. Pedido futuro não vira atraso apenas por perder posição.
      if (sameOrEarlierDue) delayedOrders.push({ ...entry, diff });
    } else {
      canPassAheadOf.push({ ...entry, diff });
    }
  });

  return { canPassAheadOf, cannotPassAheadOf, delayedOrders };
}

// ─────────────────────────────────────────────────────────────────
// CARGA POR SETOR
// ─────────────────────────────────────────────────────────────────

function ffCalculateSectorLoad(lots) {
  const load = {};

  lots.forEach(l => {
    if (!ffIsLotProductiveForSimulation(l)) return;
    const sector = ffGetLotSector(l);
    if (!sector || !FF_ACTIVE_SECTORS.has(sector)) return;
    if (!load[sector]) load[sector] = { lots: 0, kg: 0, capacity: FF_SECTOR_DAILY_CAPACITY_KG[sector] || 999 };
    load[sector].lots++;
    load[sector].kg += ffGetLotQtyKg(l);
  });

  Object.keys(load).forEach(s => {
    load[s].pct = load[s].capacity >= 99999 ? 0
      : Math.min(100, Math.round((load[s].kg / load[s].capacity) * 100));
  });

  return load;
}

// ─────────────────────────────────────────────────────────────────
// ENTREGAS FUTURAS (resumo por período)
// ─────────────────────────────────────────────────────────────────

function ffGetDeliveryForecast(lots) {
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
  const buckets = {
    late:  { label: 'Atrasados', lots: [], totalKg: 0 },
    d0:    { label: 'Hoje',      lots: [], totalKg: 0 },
    d1:    { label: 'Amanhã',    lots: [], totalKg: 0 },
    d2:    { label: '2 dias',    lots: [], totalKg: 0 },
    d3_4:  { label: '3-4 dias',  lots: [], totalKg: 0 },
    d5p:   { label: '5+ dias',   lots: [], totalKg: 0 }
  };

  lots.forEach(l => {
    if (!ffIsLotProductiveForSimulation(l)) return;
    const sector  = ffGetLotSector(l);
    const rawDate = ffGetLotDeliveryDate(l);
    if (!rawDate) return;
    const dd   = new Date(rawDate.includes('T') ? rawDate : rawDate + 'T00:00:00');
    const diff = Math.round((dd - today) / 86400000);
    const kg   = ffGetLotQtyKg(l);

    let bk;
    if      (diff < 0)  bk = 'late';
    else if (diff === 0) bk = 'd0';
    else if (diff === 1) bk = 'd1';
    else if (diff === 2) bk = 'd2';
    else if (diff <= 4)  bk = 'd3_4';
    else                 bk = 'd5p';

    buckets[bk].lots.push(l);
    buckets[bk].totalKg += kg;
  });

  return buckets;
}

// ─────────────────────────────────────────────────────────────────
// EXPEDIENTE DO SIMULADOR
// ─────────────────────────────────────────────────────────────────
function ffSimWorkdayBounds(dateLike) {
  const d = new Date(dateLike);
  const [sh, sm] = FF_WORKDAY_START.split(':').map(Number);
  const [eh, em] = FF_WORKDAY_END.split(':').map(Number);
  const start = new Date(d); start.setHours(sh, sm, 0, 0);
  const end = new Date(d); end.setHours(eh, em, 0, 0);
  return { start, end };
}

function ffSimIsWeekend(d) {
  return d.getDay() === 0 || d.getDay() === 6;
}

function ffSimNextWorkStart(ts) {
  let d = new Date(ts);
  const { start, end } = ffSimWorkdayBounds(d);

  if (ffSimIsWeekend(d) || d.getTime() >= end.getTime()) {
    d.setDate(d.getDate() + 1);
    while (ffSimIsWeekend(d)) d.setDate(d.getDate() + 1);
    const bounds = ffSimWorkdayBounds(d);
    return bounds.start.getTime();
  }

  if (d.getTime() < start.getTime()) return start.getTime();
  return d.getTime();
}

function ffSimAddWorkingMinutes(startTs, minutes) {
  let remaining = Math.max(0, Number(minutes || 0));
  let cursor = ffSimNextWorkStart(startTs);

  while (remaining > 0) {
    cursor = ffSimNextWorkStart(cursor);
    const { end } = ffSimWorkdayBounds(cursor);
    const availableMin = Math.max(0, Math.floor((end.getTime() - cursor) / 60000));

    if (remaining <= availableMin) {
      return cursor + remaining * 60000;
    }

    remaining -= availableMin;
    cursor = end.getTime() + 60000;
  }

  return cursor;
}

function ffSimFormatTs(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,'0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─────────────────────────────────────────────────────────────────
// PLANO POR SETOR (previsão de início/fim)
// ─────────────────────────────────────────────────────────────────

function ffBuildSectorPlan(productType, kg, startFromNow, sectorLoad) {
  const flow = ffGetProductFlowForSimulation(productType);
  const plan = [];
  let cursor = ffSimNextWorkStart(startFromNow);

  flow.forEach(sector => {
    if (FF_DONE_SECTORS.has(sector) || FF_IGNORED_SIMULATION_SECTORS.has(sector)) return;

    const baseTime = ffEstimateSectorTimeMinutes(productType, kg, sector);
    const load = sectorLoad[sector];
    let timeMin = baseTime;

    // A ocupação alta aumenta a estimativa, mas não deve sozinha transformar
    // um pedido pequeno em "não recomendado". O impacto entra como alerta/gargalo.
    if (load && load.pct > 70) {
      timeMin = Math.round(baseTime * (1 + Math.min(0.45, (load.pct - 70) / 140)));
    }

    const effectiveStart = ffSimNextWorkStart(cursor);
    const endTs = ffSimAddWorkingMinutes(effectiveStart, timeMin);
    cursor = endTs;

    const sectorLbl = (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[sector])
      ? SECTOR_LABELS[sector] : sector;

    const obs = load
      ? (load.pct > 90 ? '⚠️ Setor sobrecarregado' : load.pct > 70 ? '⚡ Alta ocupação' : '')
      : '';

    plan.push({
      sector,
      sectorLabel: sectorLbl,
      timeMin,
      startTs: effectiveStart,
      endTs,
      startLabel: ffSimFormatTs(effectiveStart),
      endLabel:   ffSimFormatTs(endTs),
      obs,
      load: load ? load.pct : 0
    });
  });

  return { plan, finishTs: cursor };
}

// ─────────────────────────────────────────────────────────────────
// DECISÃO FINAL
// ─────────────────────────────────────────────────────────────────

function ffFormatSimulationDecision(result) {
  const map = {
    recommended:              { label: '✅ Recomendado',                    color: '#22c55e', icon: 'fas fa-check-circle' },
    recommended_with_reorder: { label: '🔵 Recomendado com Reordenação',   color: '#3b82f6', icon: 'fas fa-sort-amount-up' },
    overtime:                 { label: '⚡ Possível com Hora Extra',        color: '#f59e0b', icon: 'fas fa-bolt' },
    not_recommended:          { label: '⛔ Não Recomendado',               color: '#ef4444', icon: 'fas fa-times-circle' },
    impossible:               { label: '🚫 Impossível no Prazo',            color: '#dc2626', icon: 'fas fa-ban' }
  };
  return map[result] || map['not_recommended'];
}

// ─────────────────────────────────────────────────────────────────
// MOTOR PRINCIPAL DA SIMULAÇÃO
// ─────────────────────────────────────────────────────────────────

function simulateUrgentOrderWithQueue(input) {
  _simLog('Input simulação:', input);

  const lots       = _simContext || [];
  const now        = Date.now();
  const todayStr   = new Date().toISOString().split('T')[0];
  const today      = new Date(todayStr + 'T00:00:00');
  const kg         = Math.max(1, parseFloat(input.qty) || 50);
  const productType = (input.productType || 'tinta').toLowerCase();
  const desiredDate = input.deliveryDate || null;
  const desiredTime = input.deliveryTime || '17:00';

  // ── Prazo desejado em ms ──
  let desiredTs = null;
  if (desiredDate) {
    const [dh, dm] = (desiredTime || '17:00').split(':').map(Number);
    const dt = new Date(desiredDate + 'T00:00:00');
    dt.setHours(dh, dm, 0, 0);
    desiredTs = dt.getTime();
  }

  // ── Fila atual e carga por setor ──
  const currentQueue = ffBuildCurrentProductionQueue(lots);
  const sectorLoad   = ffCalculateSectorLoad(lots);
  const forecast     = ffGetDeliveryForecast(lots);

  // ── Score do novo pedido ──
  const fakeNewLot = {
    deliveryDate: input.deliveryDate,
    priority:     input.priority || 'normal',
    qty:          kg,
    sector:       'pcp_liberacao',
    id:           '_new_'
  };
  const { score: newScore, reasons: newScoreReasons } = calculateProductionPriorityScore(fakeNewLot);
  const newOrderEntry = { lot: fakeNewLot, score: newScore, reasons: newScoreReasons, isNew: true };

  // ── Fila simulada ──
  const simulatedQueue = ffBuildSimulatedQueue(currentQueue, newOrderEntry);

  // ── Impacto ──
  const { canPassAheadOf, cannotPassAheadOf, delayedOrders } =
    ffCalculateQueueImpact(currentQueue, simulatedQueue, newOrderEntry);

  // ── Plano por setor ──
  const { plan: sectorPlan, finishTs } = ffBuildSectorPlan(productType, kg, now, sectorLoad);

  // ── Hora extra ──
  // Como o plano já respeita o expediente normal, hora extra só é necessária
  // quando a previsão normal ultrapassa a data/hora desejada pelo cliente.
  let overtimeMinutes = 0;
  let overtimeSectors = [];
  if (desiredTs && finishTs > desiredTs) {
    overtimeMinutes = Math.ceil((finishTs - desiredTs) / 60000);
    const lastStep = sectorPlan[sectorPlan.length - 1];
    if (lastStep) overtimeSectors.push(lastStep.sectorLabel);
  }

  // ── Gargalos ──
  const bottlenecks = Object.entries(sectorLoad)
    .filter(([, l]) => l.pct >= 80)
    .map(([s, l]) => ({
      sector: s,
      label:  (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[s]) || s,
      pct:    l.pct,
      kg:     l.kg,
      lots:   l.lots
    }))
    .sort((a, b) => b.pct - a.pct);

  // ── Previsão de conclusão ──
  const finishDate = new Date(finishTs);
  const pad = n => String(n).padStart(2,'0');
  const estimatedReadyLabel = `${pad(finishDate.getDate())}/${pad(finishDate.getMonth()+1)} às ${pad(finishDate.getHours())}:${pad(finishDate.getMinutes())}`;
  const estimatedReadyAt    = finishDate.toISOString();

  // ── DECISÃO ──
  let decision;
  let title, message;

  const isPrazoMinimo = desiredTs && finishTs > desiredTs; // sem tolerância: passou do horário, precisa ação
  const temImpossivel = desiredTs && (desiredTs - now < 60 * 60000); // menos de 1h
  const temGargaloFatal = bottlenecks.some(b => {
    const flow = ffGetProductFlowForSimulation(productType);
    return flow.includes(b.sector) && b.pct >= 95;
  });

  const delayedCriticalCount = delayedOrders.length;
  const cabeNoPrazo = !desiredTs || finishTs <= desiredTs;

  if (temImpossivel) {
    decision = 'impossible';
    title    = 'Impossível no Prazo';
    message  = `O prazo solicitado é em menos de 1 hora. Não há tempo útil para completar o fluxo produtivo.`;
  } else if (cabeNoPrazo) {
    // Regra principal: se fica pronto antes do horário solicitado, não deve ser
    // "não recomendado" apenas por existir gargalo ou pedido crítico futuro.
    if (canPassAheadOf.length > 0) {
      decision = 'recommended_with_reorder';
      title    = 'Recomendado com Reordenação';
      message  = `Fica pronto antes do horário solicitado (${estimatedReadyLabel}) e pode passar na frente de ${canPassAheadOf.length} lote(s) menos prioritário(s).`;
    } else {
      decision = 'recommended';
      title    = 'Recomendado';
      message  = `O pedido cabe no prazo solicitado. Previsão de conclusão: ${estimatedReadyLabel}.`;
    }
  } else if (delayedCriticalCount > 0) {
    decision = 'not_recommended';
    title    = 'Não Recomendado';
    message  = `Este pedido causaria atraso em ${delayedCriticalCount} pedido(s) crítico(s) ainda em processo produtivo.`;
  } else if (overtimeMinutes > FF_MAX_OVERTIME_MINUTES) {
    decision = 'impossible';
    title    = 'Impossível sem Grande Hora Extra';
    message  = `Seriam necessários ${Math.round(overtimeMinutes/60*10)/10}h de hora extra — acima do limite aceitável.`;
  } else if (overtimeMinutes > 0) {
    decision = 'overtime';
    title    = 'Possível com Hora Extra';
    message  = `Sem hora extra a previsão passa do horário solicitado. Hora extra estimada: ${Math.floor(overtimeMinutes/60)}h${overtimeMinutes%60>0?` ${overtimeMinutes%60}min`:''}.`;
  } else {
    decision = 'not_recommended';
    title    = 'Não Recomendado';
    message  = `Não há folga suficiente na fila produtiva para garantir o prazo solicitado.`;
  }

  const warnings = [];
  if (temGargaloFatal) warnings.push(`⚠️ Gargalo crítico em ${bottlenecks[0]?.label}: ${bottlenecks[0]?.pct}% da capacidade`);
  if (isPrazoMinimo && decision !== 'impossible') warnings.push(`⚡ A previsão (${estimatedReadyLabel}) ultrapassa a data/hora desejada.`);
  if (lots.length === 0) warnings.push('ℹ️ Nenhum lote ativo encontrado — resultado baseado em fila vazia.');

  const recommendation = `${ffFormatSimulationDecision(decision).label}. ${message}${sectorPlan.length ? ` Previsão de pronto: ${estimatedReadyLabel}.` : ''}`;

  return {
    ok: true,
    decision,
    title,
    message,
    estimatedReadyAt,
    estimatedReadyLabel,
    overtimeMinutes,
    overtimeSectors: [...new Set(overtimeSectors)],
    bottlenecks,
    sectorPlan,
    currentLoad: sectorLoad,
    forecast,
    queueBefore:       currentQueue,
    queueAfter:        simulatedQueue,
    canPassAheadOf,
    cannotPassAheadOf,
    delayedOrders,
    warnings,
    recommendation,
    newOrderScore:        newScore,
    newOrderScoreReasons: newScoreReasons,
    totalActiveLots:      lots.length
  };
}

// ─────────────────────────────────────────────────────────────────
// PROMPT PARA IA FUTURA (não integra OpenAI nesta versão)
// ─────────────────────────────────────────────────────────────────

function buildSimulationExplanationPrompt(result) {
  if (!result) return '';
  return `
Simulação de entrega - FactoryFlow:
Decisão: ${result.decision} - ${result.title}
Mensagem: ${result.message}
Previsão de conclusão: ${result.estimatedReadyLabel}
Hora extra: ${result.overtimeMinutes} minutos em ${(result.overtimeSectors||[]).join(', ')||'–'}
Pedidos que pode passar na frente: ${result.canPassAheadOf?.length || 0}
Pedidos que NÃO pode passar na frente: ${result.cannotPassAheadOf?.length || 0}
Pedidos impactados: ${result.delayedOrders?.length || 0}
Gargalos: ${result.bottlenecks?.map(b => `${b.label} (${b.pct}%)`).join(', ')||'–'}
Score do novo pedido: ${result.newOrderScore} (${result.newOrderScoreReasons?.join('; ')})
Avisos: ${result.warnings?.join('; ')||'–'}
Total de lotes ativos: ${result.totalActiveLots}
  `.trim();
}

// ─────────────────────────────────────────────────────────────────
// RENDER PRINCIPAL
// ─────────────────────────────────────────────────────────────────

async function renderSimuladorEntrega() {
  const page = document.getElementById('pageSimuladorEntrega');
  if (!page) return;

  // Carrega contexto
  _simContext = await ffLoadSimulationContext();

  const sectorLoad = ffCalculateSectorLoad(_simContext);
  const forecast   = ffGetDeliveryForecast(_simContext);

  const ptOptions = [
    ['tinta','Tinta'],['base','Base'],['amostra','Amostra'],
    ['diluente','Diluente'],['endurecedor','Endurecedor'],['epoxi','Epoxi'],
    ['poliuretano','Poliuretano'],['esmalte','Esmalte'],['verniz','Verniz'],['outro','Outro']
  ];

  const todayISO = new Date().toISOString().split('T')[0];

  page.innerHTML = `
    <div class="sim-page">
      <div class="sim-page-header">
        <div>
          <h2 class="sim-title"><i class="fas fa-route"></i> Simulador Inteligente de Entrega</h2>
          <p class="sim-subtitle">Analise se um pedido urgente pode ser encaixado sem comprometer a fila da produção.</p>
        </div>
        <div class="sim-live-badge">
          <i class="fas fa-circle" style="color:#22c55e;font-size:.55rem"></i>
          ${_simContext.length} lote(s) ativo(s)
        </div>
      </div>

      <div class="sim-grid-main">
        <!-- COLUNA ESQUERDA: Formulário -->
        <div class="sim-left-col">

          <!-- Formulário -->
          <div class="sim-card sim-form-card">
            <div class="sim-card-header"><i class="fas fa-plus-circle"></i> Pedido para Simular</div>
            <div class="sim-form-grid">
              <div class="sim-form-group">
                <label>Código do Produto</label>
                <input type="text" id="simProductCode" placeholder="Ex: 127.001" class="sim-input" />
              </div>
              <div class="sim-form-group">
                <label>Nome do Produto</label>
                <input type="text" id="simProductName" placeholder="Ex: Tinta Solvente Cinza" class="sim-input" />
              </div>
              <div class="sim-form-group">
                <label>Linha / Tipo</label>
                <select id="simProductType" class="sim-input">
                  ${ptOptions.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
                </select>
              </div>
              <div class="sim-form-group">
                <label>Quantidade (kg)</label>
                <input type="number" id="simQty" placeholder="Ex: 200" min="1" class="sim-input" />
              </div>
              <div class="sim-form-group">
                <label>Cliente</label>
                <input type="text" id="simClient" placeholder="Nome do cliente" class="sim-input" />
              </div>
              <div class="sim-form-group">
                <label>Data desejada de entrega</label>
                <input type="date" id="simDeliveryDate" min="${todayISO}" class="sim-input" />
              </div>
              <div class="sim-form-group">
                <label>Hora desejada</label>
                <input type="time" id="simDeliveryTime" value="17:00" class="sim-input" />
              </div>
              <div class="sim-form-group">
                <label>Prioridade</label>
                <select id="simPriority" class="sim-input">
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgente</option>
                  <option value="sameday">Mesmo Dia</option>
                </select>
              </div>
              <div class="sim-form-group sim-form-full">
                <label>Observações</label>
                <textarea id="simNotes" rows="2" placeholder="Informações adicionais..." class="sim-input sim-textarea"></textarea>
              </div>
            </div>
            <div class="sim-form-actions">
              <button class="sim-btn sim-btn-primary" onclick="runDeliverySimulation()">
                <i class="fas fa-play"></i> Simular Encaixe
              </button>
              <button class="sim-btn sim-btn-secondary" onclick="clearDeliverySimulation()">
                <i class="fas fa-undo"></i> Limpar Simulação
              </button>
            </div>
          </div>

          <!-- Carga por Setor -->
          <div class="sim-card">
            <div class="sim-card-header"><i class="fas fa-industry"></i> Carga Atual por Setor</div>
            <div class="sim-load-list">
              ${_renderSectorLoad(sectorLoad)}
            </div>
          </div>

        </div>

        <!-- COLUNA DIREITA: Resultado + Forecast -->
        <div class="sim-right-col">

          <!-- Resultado (vazio inicialmente) -->
          <div id="simResultArea">
            ${_renderSimResultEmpty()}
          </div>

          <!-- Entregas Futuras -->
          <div class="sim-card">
            <div class="sim-card-header"><i class="fas fa-calendar-alt"></i> Previsão de Entregas</div>
            <div class="sim-forecast-grid">
              ${_renderForecast(forecast)}
            </div>
          </div>

        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────
// SUB-RENDERS
// ─────────────────────────────────────────────────────────────────

function _renderSectorLoad(load) {
  const sectors = Object.entries(load)
    .filter(([s]) => !FF_DONE_SECTORS.has(s))
    .sort((a, b) => b[1].pct - a[1].pct);

  if (sectors.length === 0) {
    return '<div class="sim-empty">Nenhum lote ativo no momento.</div>';
  }

  return sectors.map(([s, d]) => {
    const lbl   = (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[s]) || s;
    const color = d.pct >= 90 ? '#ef4444' : d.pct >= 70 ? '#f59e0b' : d.pct >= 40 ? '#8b5cf6' : '#22c55e';
    return `
      <div class="sim-load-row">
        <div class="sim-load-label">
          <span>${lbl}</span>
          <span class="sim-load-meta">${d.lots} lote(s) · ${Math.round(d.kg)}kg</span>
        </div>
        <div class="sim-load-bar-wrap">
          <div class="sim-load-bar" style="width:${d.pct}%;background:${color}"></div>
        </div>
        <span class="sim-load-pct" style="color:${color}">${d.pct}%</span>
      </div>`;
  }).join('');
}

function _renderForecast(forecast) {
  return Object.values(forecast).map(bk => {
    const isLate = bk.label === 'Atrasados';
    const color  = isLate ? '#ef4444' : bk.label === 'Hoje' ? '#f59e0b' : bk.label === 'Amanhã' ? '#8b5cf6' : '#64748b';
    return `
      <div class="sim-forecast-card" style="border-color:${color}30">
        <div class="sim-forecast-label" style="color:${color}">${bk.label}</div>
        <div class="sim-forecast-num" style="color:${color}">${bk.lots.length}</div>
        <div class="sim-forecast-sub">${Math.round(bk.totalKg)} kg</div>
      </div>`;
  }).join('');
}

function _renderSimResultEmpty() {
  return `
    <div class="sim-card sim-result-empty">
      <div class="sim-empty-icon"><i class="fas fa-route"></i></div>
      <div class="sim-empty-title">Preencha o formulário e clique em <strong>Simular Encaixe</strong></div>
      <div class="sim-empty-sub">O sistema analisará a fila atual e retornará uma recomendação detalhada.</div>
    </div>`;
}

function _renderSimResult(result) {
  if (!result || !result.ok) return _renderSimResultEmpty();

  const dec    = ffFormatSimulationDecision(result.decision);
  const klass  = `sim-decision-${result.decision.replace(/_/g,'-')}`;

  // KPI cards
  const kpis = [
    { icon:'fas fa-clock',  label:'Previsão de Pronto',   val: result.estimatedReadyLabel || '–',           color:'#60a5fa' },
    { icon:'fas fa-bolt',   label:'Hora Extra',            val: result.overtimeMinutes > 0 ? `${Math.floor(result.overtimeMinutes/60)}h${result.overtimeMinutes%60>0?` ${result.overtimeMinutes%60}min`:''}` : 'Não necessária', color: result.overtimeMinutes > 0 ? '#f59e0b' : '#22c55e' },
    { icon:'fas fa-exclamation-triangle', label:'Gargalo Principal', val: result.bottlenecks?.length > 0 ? result.bottlenecks[0].label + ` (${result.bottlenecks[0].pct}%)` : 'Nenhum', color: result.bottlenecks?.length > 0 ? '#f87171' : '#22c55e' },
    { icon:'fas fa-boxes',  label:'Pedidos Impactados',   val: result.delayedOrders?.length > 0 ? `${result.delayedOrders.length} pedido(s)` : 'Nenhum', color: result.delayedOrders?.length > 0 ? '#f87171' : '#22c55e' },
    { icon:'fas fa-star',   label:'Score do Pedido',       val: result.newOrderScore,                        color:'#a78bfa' }
  ];

  // Plano por setor
  const planRows = (result.sectorPlan || []).map(s => `
    <tr class="sim-table-row">
      <td>${s.sectorLabel}</td>
      <td class="sim-td-center">${s.timeMin}min</td>
      <td class="sim-td-center sim-td-mono">${s.startLabel}</td>
      <td class="sim-td-center sim-td-mono">${s.endLabel}</td>
      <td>${s.obs || (s.load >= 70 ? `<span style="color:#f59e0b">${s.load}% ocupado</span>` : '<span style="color:#64748b">Normal</span>')}</td>
    </tr>`).join('');

  // Lotes que pode passar
  const canPassRows = (result.canPassAheadOf || []).slice(0, 8).map(e => _renderQueueEntryCard(e, 'pass')).join('');
  const cantPassRows = (result.cannotPassAheadOf || []).slice(0, 8).map(e => _renderQueueEntryCard(e, 'block')).join('');
  const delayedRows = (result.delayedOrders || []).slice(0, 6).map(e => _renderQueueEntryCard(e, 'delay')).join('');

  return `
    <!-- Decisão Principal -->
    <div class="sim-card sim-decision-card ${klass}">
      <div class="sim-decision-icon"><i class="${dec.icon}"></i></div>
      <div class="sim-decision-body">
        <div class="sim-decision-title" style="color:${dec.color}">${dec.label}</div>
        <div class="sim-decision-msg">${result.message}</div>
        ${result.warnings?.length ? `<div class="sim-warnings">${result.warnings.map(w => `<div class="sim-warn-item">${w}</div>`).join('')}</div>` : ''}
      </div>
    </div>

    <!-- KPIs -->
    <div class="sim-kpi-grid">
      ${kpis.map(k => `
        <div class="sim-kpi-card">
          <div class="sim-kpi-icon" style="color:${k.color}"><i class="${k.icon}"></i></div>
          <div class="sim-kpi-val" style="color:${k.color}">${k.val}</div>
          <div class="sim-kpi-lbl">${k.label}</div>
        </div>`).join('')}
    </div>

    <!-- Score do pedido -->
    <div class="sim-card" style="margin-top:0">
      <div class="sim-card-header"><i class="fas fa-star"></i> Score do Pedido Simulado: <strong style="color:#a78bfa">${result.newOrderScore}</strong></div>
      <div class="sim-score-reasons">
        ${(result.newOrderScoreReasons||[]).map(r => `<span class="sim-reason-tag">${r}</span>`).join('')}
      </div>
    </div>

    <!-- Plano por Setor -->
    ${planRows ? `
    <div class="sim-card">
      <div class="sim-card-header"><i class="fas fa-sitemap"></i> Plano Previsto por Setor</div>
      <div class="sim-table-wrap">
        <table class="sim-table">
          <thead><tr>
            <th>Setor</th><th class="sim-td-center">Tempo Est.</th>
            <th class="sim-td-center">Início</th><th class="sim-td-center">Fim</th><th>Obs.</th>
          </tr></thead>
          <tbody>${planRows}</tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Pode passar na frente -->
    ${canPassRows ? `
    <div class="sim-card">
      <div class="sim-card-header" style="color:#22c55e"><i class="fas fa-arrow-up"></i> Pode Passar na Frente (${result.canPassAheadOf?.length})</div>
      <div class="sim-queue-grid">${canPassRows}</div>
    </div>` : ''}

    <!-- Não pode passar na frente -->
    ${cantPassRows ? `
    <div class="sim-card">
      <div class="sim-card-header" style="color:#ef4444"><i class="fas fa-ban"></i> Não Deve Passar na Frente (${result.cannotPassAheadOf?.length})</div>
      <div class="sim-queue-grid">${cantPassRows}</div>
    </div>` : ''}

    <!-- Pedidos impactados -->
    ${delayedRows ? `
    <div class="sim-card">
      <div class="sim-card-header" style="color:#f87171"><i class="fas fa-exclamation-circle"></i> Pedidos que Ficariam Atrasados (${result.delayedOrders?.length})</div>
      <div class="sim-queue-grid">${delayedRows}</div>
    </div>` : ''}

    <!-- Gargalos -->
    ${result.bottlenecks?.length > 0 ? `
    <div class="sim-card">
      <div class="sim-card-header" style="color:#f59e0b"><i class="fas fa-compress-arrows-alt"></i> Gargalos Identificados</div>
      ${result.bottlenecks.map(b => `
        <div class="sim-bottleneck-row">
          <span>${b.label}</span>
          <span class="sim-bottleneck-meta">${b.lots} lote(s) · ${Math.round(b.kg)}kg</span>
          <div class="sim-load-bar-wrap" style="flex:1">
            <div class="sim-load-bar" style="width:${b.pct}%;background:#ef4444"></div>
          </div>
          <span style="color:#ef4444;font-weight:700">${b.pct}%</span>
        </div>`).join('')}
    </div>` : ''}
  `;
}

function _renderQueueEntryCard(entry, type) {
  if (!entry?.lot) return '';
  const lot       = entry.lot;
  const op        = ffGetLotOP(lot);
  const client    = ffGetLotClient(lot);
  const product   = ffGetLotProductName(lot);
  const rawDate   = ffGetLotDeliveryDate(lot);
  const priority  = ffGetLotPriority(lot);
  const sector    = ffGetLotSector(lot);
  const sectorLbl = (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[sector]) || sector || '–';
  const fmtDate   = rawDate ? new Date(rawDate.includes('T') ? rawDate : rawDate + 'T00:00:00').toLocaleDateString('pt-BR') : '–';

  const typeStyles = {
    pass:  { border: '#22c55e', badge: 'background:#22c55e22;color:#22c55e', icon: 'fas fa-arrow-up', txt: 'Pode passar' },
    block: { border: '#ef4444', badge: 'background:#ef444422;color:#f87171', icon: 'fas fa-ban',      txt: 'Bloqueia' },
    delay: { border: '#f59e0b', badge: 'background:#f59e0b22;color:#fbbf24', icon: 'fas fa-clock',    txt: 'Atrasaria' }
  };
  const st = typeStyles[type] || typeStyles.pass;

  return `
    <div class="sim-queue-card" style="border-left:3px solid ${st.border}">
      <div class="sim-qc-header">
        <strong style="color:var(--blue)">#${escapeHtml(String(op))}</strong>
        <span class="sim-qc-badge" style="${st.badge}"><i class="${st.icon}"></i> ${st.txt}</span>
      </div>
      <div class="sim-qc-client">${escapeHtml(client)}</div>
      <div class="sim-qc-product">${escapeHtml(product)}</div>
      <div class="sim-qc-meta">
        <span><i class="fas fa-calendar" style="color:#64748b"></i> ${fmtDate}</span>
        <span><i class="fas fa-map-marker-alt" style="color:#64748b"></i> ${escapeHtml(sectorLbl)}</span>
        <span style="color:#a78bfa">⭐ ${entry.score}</span>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────
// AÇÕES DO USUÁRIO
// ─────────────────────────────────────────────────────────────────

async function runDeliverySimulation() {
  const btn = document.querySelector('.sim-btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Simulando...'; }

  try {
    // Recarrega contexto com dados mais recentes
    _simContext = await ffLoadSimulationContext();

    const input = {
      productCode:  document.getElementById('simProductCode')?.value?.trim() || '',
      productName:  document.getElementById('simProductName')?.value?.trim() || '',
      productType:  document.getElementById('simProductType')?.value || 'tinta',
      qty:          parseFloat(document.getElementById('simQty')?.value || '50') || 50,
      client:       document.getElementById('simClient')?.value?.trim() || '',
      deliveryDate: document.getElementById('simDeliveryDate')?.value || null,
      deliveryTime: document.getElementById('simDeliveryTime')?.value || '17:00',
      priority:     document.getElementById('simPriority')?.value || 'normal',
      notes:        document.getElementById('simNotes')?.value?.trim() || ''
    };

    // Valida campos mínimos
    if (!input.productName && !input.productCode) {
      showToast('Informe o produto ou código antes de simular.', 'info');
      return;
    }

    _simResult = simulateUrgentOrderWithQueue(input);
    _simLog('Resultado:', _simResult);

    const area = document.getElementById('simResultArea');
    if (area) {
      area.innerHTML = _renderSimResult(_simResult);
      area.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (typeof showToast === 'function') {
      const dec = ffFormatSimulationDecision(_simResult.decision);
      showToast(`Simulação concluída: ${dec.label}`, _simResult.decision === 'recommended' ? 'success' : 'info');
    }

  } catch (e) {
    console.error('[Simulador] Erro na simulação:', e);
    if (typeof showToast === 'function') showToast('Erro ao simular: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play"></i> Simular Encaixe'; }
  }
}

function clearDeliverySimulation() {
  // Limpa formulário
  ['simProductCode','simProductName','simQty','simClient','simDeliveryDate','simNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const pt = document.getElementById('simProductType');
  if (pt) pt.value = 'tinta';
  const pr = document.getElementById('simPriority');
  if (pr) pr.value = 'normal';
  const tm = document.getElementById('simDeliveryTime');
  if (tm) tm.value = '17:00';

  _simResult = null;

  const area = document.getElementById('simResultArea');
  if (area) area.innerHTML = _renderSimResultEmpty();

  if (typeof showToast === 'function') showToast('Simulação limpa.', 'info');
}
