// ===================================================
// RELATORIO-TEMPOS.JS – Relatório de Tempos por Setor
// FactoryFlow v7.0 – Fix timestamps, totais gerais, Excel/PDF limpos
//
// Backend: GET /api/producao/relatorio-tempos
// Fallback: STATE.lots local se backend offline.
// Não altera reloadData, Kanban, login ou fluxos existentes.
// ===================================================
'use strict';


// ─────────────────────────────────────────────────────────────────
// FIX VISUAL v6.0 – barra horizontal real no relatório
// ─────────────────────────────────────────────────────────────────
function injectRelatorioTemposHorizontalScrollFix() {
  const styleId = 'rt-horizontal-scroll-fix-v60';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* =====================================================
       Relatório de Tempos v6.0
       Força uma área interna larga e deixa a página rolar para o lado.
       ===================================================== */

    #pageRelatorioTempos {
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: auto !important;
      overflow-y: visible !important;
      padding: 28px 24px 28px 24px !important;
      box-sizing: border-box !important;
      scrollbar-gutter: stable both-edges !important;
    }

    #pageRelatorioTempos,
    #pageRelatorioTempos * {
      box-sizing: border-box !important;
    }

    #pageRelatorioTempos .rt-page-shell {
      min-width: 1280px !important;
      width: max(1280px, 100%) !important;
      max-width: none !important;
      padding-right: 18px !important;
    }

    #pageRelatorioTempos .page-header {
      width: 100% !important;
      min-width: 1280px !important;
      max-width: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 18px !important;
      flex-wrap: nowrap !important;
      margin: 0 0 28px 0 !important;
    }

    #pageRelatorioTempos .page-header h2 {
      margin: 0 !important;
      flex: 1 1 auto !important;
      white-space: nowrap !important;
    }

    #pageRelatorioTempos .header-actions {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 12px !important;
      flex: 0 0 auto !important;
      margin-left: auto !important;
      white-space: nowrap !important;
    }

    #pageRelatorioTempos .header-actions .btn {
      flex: 0 0 auto !important;
      white-space: nowrap !important;
    }

    #pageRelatorioTempos .rt-backend-notice,
    #pageRelatorioTempos .rt-filters-card,
    #pageRelatorioTempos #rtSummaryArea,
    #pageRelatorioTempos #rtTableArea {
      width: 100% !important;
      min-width: 1280px !important;
      max-width: none !important;
    }

    #pageRelatorioTempos .rt-filters-card {
      overflow: visible !important;
    }

    #pageRelatorioTempos .rt-filters-grid {
      display: grid !important;
      grid-template-columns: repeat(5, minmax(180px, 1fr)) !important;
      gap: 16px !important;
      align-items: end !important;
      width: 100% !important;
    }

    #pageRelatorioTempos .rt-filter-group,
    #pageRelatorioTempos .rt-filter-input,
    #pageRelatorioTempos .rt-filter-group input,
    #pageRelatorioTempos .rt-filter-group select {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }

    #pageRelatorioTempos .rt-filter-actions {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      margin-top: 16px !important;
      flex-wrap: nowrap !important;
    }

    #pageRelatorioTempos .rt-summary-grid {
      display: grid !important;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)) !important;
      gap: 16px !important;
      width: 100% !important;
      min-width: 1280px !important;
      max-width: none !important;
    }

    #pageRelatorioTempos .rt-summary-card {
      min-width: 0 !important;
    }

    #pageRelatorioTempos .rt-table-wrap {
      width: 100% !important;
      min-width: 1280px !important;
      max-width: none !important;
      overflow: hidden !important;
    }

    #pageRelatorioTempos .rt-table-scroll {
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: auto !important;
      overflow-y: visible !important;
      -webkit-overflow-scrolling: touch !important;
      padding-bottom: 12px !important;
    }

    #pageRelatorioTempos .rt-table {
      min-width: 1500px !important;
      width: max-content !important;
      table-layout: auto !important;
    }

    #pageRelatorioTempos::-webkit-scrollbar,
    #pageRelatorioTempos .rt-table-scroll::-webkit-scrollbar {
      height: 11px !important;
    }

    #pageRelatorioTempos::-webkit-scrollbar-track,
    #pageRelatorioTempos .rt-table-scroll::-webkit-scrollbar-track {
      background: rgba(15, 23, 42, 0.9) !important;
      border-radius: 999px !important;
    }

    #pageRelatorioTempos::-webkit-scrollbar-thumb,
    #pageRelatorioTempos .rt-table-scroll::-webkit-scrollbar-thumb {
      background: rgba(59, 130, 246, 0.85) !important;
      border-radius: 999px !important;
    }

    #pageRelatorioTempos::-webkit-scrollbar-thumb:hover,
    #pageRelatorioTempos .rt-table-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(96, 165, 250, 1) !important;
    }
  `;

  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────
// ESTADO INTERNO
// ─────────────────────────────────────────────────────────────────

/** Dados carregados pelo relatório (array de linhas normalizado) */
let _rtData = [];

/** Resumo retornado pelo backend (ou calculado localmente) */
let _rtResumo = null;

/** Total de registros (pode ser maior que _rtData.length quando há paginação) */
let _rtTotal = 0;

/** true quando os dados vieram do backend real (não do fallback local) */
let _rtFromBackend = false;

/** Filtros atuais */
let _rtFilters = {
  codigoProduto: '',
  nomeProduto: '',
  opLote: '',
  pedido: '',
  cliente: '',
  dataInicial: '',
  dataFinal: '',
  setor: ''
};

/**
 * Modo de visualização do relatório:
 * - auto: consolida por setor quando o filtro não é de uma OP/lote específica
 * - grouped: sempre consolida por setor
 * - detailed: sempre mostra linha a linha
 */
let _rtViewMode = 'auto';

/** Ordenação atual do relatório */
let _rtSortMode = 'default';

/** OPs/lotes expandidos no modo detalhado por lote */
let _rtExpandedLots = new Set();

// ─────────────────────────────────────────────────────────────────
// FUNÇÕES UTILITÁRIAS SEGURAS
// Documentadas para reuso em outros módulos futuros
// ─────────────────────────────────────────────────────────────────

/**
 * Parse JSON seguro – retorna fallback se inválido ou vazio.
 * Aceita string, array ou objeto.
 */
function safeParseJson(value, fallback = []) {
  if (value == null) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed ?? fallback;
  } catch (_) {
    return fallback;
  }
}

/**
 * Formata ms em "Xh Ymin" ou "Zm" ou "–" se zero/inválido.
 * Reutilizável; não sobrescreve a formatMs() do data.js se já existir.
 */
function rtFormatMs(ms) {
  if (typeof ms !== 'number' || isNaN(ms) || ms <= 0) return '–';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return '< 1min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/**
 * Formata timestamp (number|string) em DD/MM/AAAA HH:MM.
 * Reexportado como formatDateTime para uso nos outros módulos se necessário.
 */
function rtFormatDateTime(ts) {
  if (!ts) return '–';
  try {
    const d = new Date(typeof ts === 'string' ? ts : Number(ts));
    if (isNaN(d.getTime())) return '–';
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (_) {
    return '–';
  }
}

/**
 * Retorna os sectorMetrics do lote de forma segura.
 * Campo: lot.sectorMetrics ou lot.ff_sectorMetrics.
 */
function getLotSectorMetrics(lot) {
  if (!lot) return [];
  const raw = lot.sectorMetrics ?? lot.ff_sectorMetrics ?? null;
  const parsed = safeParseJson(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Retorna os motivos de pausa extraídos das workSessions do lote.
 * Filtra apenas sessões com pauseReason definido.
 */
function getLotPauseReasons(lot) {
  if (!lot) return [];
  try {
    const sessions = safeParseJson(lot.workSessions, []);
    if (!Array.isArray(sessions)) return [];
    return sessions
      .filter(s => s && s.pauseReason && String(s.pauseReason).trim())
      .map(s => ({
        sector:  s.sector || '',
        start:   s.start  || null,
        end:     s.end    || null,
        reason:  String(s.pauseReason).trim()
      }));
  } catch (_) {
    return [];
  }
}


function rtLocalNormalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_');
}

function rtLocalSessionMatchesSector(session, targetSector) {
  const target = rtLocalNormalizeText(targetSector);
  const sessionSector = rtLocalNormalizeText(session?.sector || session?.setor || session?.sectorKey || session?.setorAtual || session?.setor_atual || '');
  if (!target || !sessionSector) return true;
  if (target === sessionSector) return true;
  const groups = [
    ['laboratorio', 'laboratorio_revisao', 'laboratorio_amostras', 'lab'],
    ['coloracao', 'coloracao_revisao', 'coloracao_amostras'],
    ['envase', 'envase_produzir', 'envase_enlatamento']
  ];
  return groups.some(g => g.includes(target) && g.includes(sessionSector));
}

function rtLocalMergeIntervals(intervals) {
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

function rtLocalIntervalsTotalMs(intervals) {
  return rtLocalMergeIntervals(intervals).reduce((sum, i) => sum + Math.max(0, i.end - i.start), 0);
}

function rtLocalSubtractIntervals(baseIntervals, subtractIntervals) {
  let result = rtLocalMergeIntervals(baseIntervals);
  const subtracts = rtLocalMergeIntervals(subtractIntervals);
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
  return rtLocalMergeIntervals(result);
}

function rtLocalSessionType(session) {
  if (session?.pauseReason && String(session.pauseReason).trim()) return 'pause';
  if (session?.motivoPausa && String(session.motivoPausa).trim()) return 'pause';
  const raw = rtLocalNormalizeText(session?.type || session?.tipo || session?.status || session?.action || session?.acao || session?.mode || '');
  if (raw.includes('pause') || raw.includes('pausa') || raw.includes('paused') || raw.includes('pausado')) return 'pause';
  return 'work';
}

function rtLocalPickTs(tsNum, ...values) {
  for (const value of values) {
    const ts = tsNum(value);
    if (ts > 0) return ts;
  }
  return 0;
}

function rtLocalSumSessionsBySector(sessions, sector, entered, exited, tsNum) {
  const workIntervals = [];
  const pauseIntervals = [];
  const now = Date.now();

  const startLimit = Number(entered || 0);
  const endLimit = Number(exited || now);

  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || typeof s !== 'object') continue;
    if (!rtLocalSessionMatchesSector(s, sector)) continue;

    const type = rtLocalSessionType(s);

    if (type === 'pause') {
      const pStart = rtLocalPickTs(tsNum, s.pauseStart, s.pausaInicio, s.pausadoEm, s.pausedAt, s.paused_at, s.startPause, s.start_pause, s.start, s.inicio, s.startedAt, s.started_at);
      const pEnd = rtLocalPickTs(tsNum, s.pauseEnd, s.pausaFim, s.retomadoEm, s.retomado_em, s.resumedAt, s.resumed_at, s.endPause, s.end_pause, s.end, s.fim, s.endedAt, s.ended_at) || endLimit || now;
      if (pStart && pEnd > pStart) {
        const clippedStart = Math.max(pStart, startLimit || pStart);
        const clippedEnd = Math.min(pEnd, endLimit || pEnd);
        if (clippedEnd > clippedStart) pauseIntervals.push({ start: clippedStart, end: clippedEnd });
      }
      continue;
    }

    const wStart = rtLocalPickTs(tsNum, s.startedAt, s.started_at, s.startAt, s.start_at, s.start, s.inicio, s.iniciadoEm, s.iniciado_em, s.createdAt, s.created_at, s.timestamp);
    const wEnd = rtLocalPickTs(tsNum, s.endedAt, s.ended_at, s.endAt, s.end_at, s.end, s.fim, s.finalizadoEm, s.finalizado_em, s.stoppedAt, s.updatedAt, s.updated_at) || endLimit || now;
    if (wStart && wEnd > wStart) {
      const clippedStart = Math.max(wStart, startLimit || wStart);
      const clippedEnd = Math.min(wEnd, endLimit || wEnd);
      if (clippedEnd > clippedStart) workIntervals.push({ start: clippedStart, end: clippedEnd });
    }
  }

  const pauses = rtLocalMergeIntervals(pauseIntervals);
  const works = rtLocalSubtractIntervals(workIntervals, pauses);
  return {
    workedMs: rtLocalIntervalsTotalMs(works),
    pausedMs: rtLocalIntervalsTotalMs(pauses),
    pauses
  };
}

/**
 * Calcula tempos por setor a partir do histórico e workSessions do lote.
 * Retorna array de objetos:
 * {
 *   sector, sectorLabel,
 *   enteredAt, exitAt,
 *   totalMs, workedMs, pausedMs, idleMs,
 *   efficiency, // 0–100
 *   status,     // 'done' | 'active'
 *   pauses []   // {start, end, reason}
 * }
 */
function calculateSectorTimesFromLot(lot) {
  if (!lot) return [];

  try {
    const normalizeSector = (value) => {
      if (typeof ffNormalizeSectorForMetrics === 'function') return ffNormalizeSectorForMetrics(value);
      if (typeof ffNormalizeSectorName === 'function') return ffNormalizeSectorName(value);
      if (typeof normalizeKanbanSector === 'function') return normalizeKanbanSector(value);
      return String(value || '').trim().toLowerCase();
    };

    const toTs = (v) => {
      if (!v) return 0;
      const n = typeof v === 'string'
        ? (isNaN(Number(v)) ? new Date(v).getTime() : Number(v))
        : Number(v);
      return isFinite(n) && n > 0 ? n : 0;
    };

    const parseArr = (v) => {
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') return Object.values(v).filter(Boolean);
      if (typeof safeParseJson === 'function') {
        const parsed = safeParseJson(v, []);
        return Array.isArray(parsed) ? parsed : [];
      }
      try {
        const parsed = JSON.parse(String(v || '[]'));
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    };

    const getEventSector = (ev) => {
      const direct = String(
        ev?.sector || ev?.setor || ev?.toSector || ev?.to_sector || ev?.novoSetor || ev?.setorDestino || ev?.destinationSector || ''
      ).trim();
      if (direct) return normalizeSector(direct);

      const text = String(ev?.action || ev?.acao || ev?.message || ev?.description || ev?.descricao || ev?.title || '').trim();
      const normText = String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_\-\s]/g, ' ')
        .replace(/\s+/g, ' ');

      const known = [
        ['laboratorio_revisao', ['laboratorio revisao', 'laboratorio_revisao']],
        ['laboratorio_amostras', ['laboratorio amostras', 'laboratorio_amostras']],
        ['coloracao_revisao', ['coloracao revisao', 'coloracao_revisao']],
        ['coloracao_amostras', ['coloracao amostras', 'coloracao_amostras']],
        ['pcp_liberacao', ['pcp liberacao', 'pcp_liberacao']],
        ['envase_enlatamento', ['envase enlatamento', 'envase_enlatamento', 'enlatamento']],
        ['envase_produzir', ['envase produzir', 'envase_produzir']],
        ['pesagem', ['pesagem']],
        ['producao', ['producao', 'produção']],
        ['coloracao', ['coloracao', 'coloração']],
        ['laboratorio', ['laboratorio', 'laboratório', ' lab ']],
        ['pronto', ['pronto']],
        ['entrega', ['entrega']],
        ['entregue', ['entregue', 'finalizado']]
      ];

      for (const [sector, needles] of known) {
        if (needles.some(n => normText.includes(String(n).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
          return normalizeSector(sector);
        }
      }
      return '';
    };

    const currentSector = normalizeSector(
      lot.sector || lot.stage || lot.status || lot.currentSector || lot.setor_atual || lot.raw_mysql?.setor_atual || ''
    );
    const finalSectors = new Set(['pronto', 'entrega', 'entregue', 'finalizado', 'concluido', 'concluído']);
    const isFinalLot = finalSectors.has(currentSector) || String(lot.lotStatus || lot.raw_mysql?.ff_lotStatus || '').toLowerCase().includes('final');

    const history = parseArr(lot.history || lot.ff_history || lot.raw_mysql?.ff_history)
      .map((ev, idx) => ({
        event: ev,
        sector: getEventSector(ev),
        at: toTs(ev?.timestamp || ev?.time || ev?.date || ev?.data || ev?.createdAt || ev?.created_at || ev?.updatedAt || ev?.updated_at),
        idx
      }))
      .filter(item => item.sector && item.at)
      .sort((a, b) => a.at - b.at || a.idx - b.idx);

    const rows = [];

    if (history.length > 0) {
      for (let i = 0; i < history.length; i++) {
        const current = history[i];
        const next = history[i + 1];

        // Eventos finais não viram cartão de tempo de setor produtivo.
        if (finalSectors.has(current.sector)) continue;

        const enteredAt = current.at;
        let exitAt = next?.at || null;

        const isCurrentTimelineSector = currentSector && normalizeSector(current.sector) === currentSector;
        let status = 'done';

        // Último evento só fica em andamento se ele representa realmente o setor atual do lote.
        if (!exitAt) {
          if (!isFinalLot && isCurrentTimelineSector) {
            status = 'active';
          } else {
            exitAt = toTs(lot.deliveredAt || lot.finalizadoEm || lot.updatedAt || lot.updated_at || lot.raw_mysql?.updated_at) || enteredAt;
            status = 'done';
          }
        }

        // Proteção: nunca deixa saída antes da entrada.
        if (exitAt && exitAt < enteredAt) {
          console.warn('[relatorio-tempos] ignorando passagem com saída menor que entrada', { lote: lot.number || lot.id, setor: current.sector, entrada: enteredAt, saida: exitAt });
          continue;
        }

        let ts;
        if (status === 'active' && typeof window !== 'undefined' && typeof window.ffCalculateLotTimeSummary === 'function') {
          ts = window.ffCalculateLotTimeSummary(lot, { sector: current.sector, enteredAt });
        } else if (typeof window !== 'undefined' && typeof window.ffCalculateLotTimeSummary === 'function') {
          ts = window.ffCalculateLotTimeSummary(lot, { sector: current.sector, enteredAt, exitAt });
        } else if (typeof getLotTimeSummary === 'function' && status === 'active') {
          ts = getLotTimeSummary(lot);
        } else {
          const total = exitAt ? Math.max(0, exitAt - enteredAt) : 0;
          ts = { total, worked: 0, paused: 0, idle: total, efficiency: 0 };
        }

        const totalMs = Math.max(0, Number(ts.total || 0));
        const workedMs = Math.min(Math.max(0, Number(ts.worked || 0)), totalMs);
        const pausedMs = Math.min(Math.max(0, Number(ts.paused || 0)), Math.max(0, totalMs - workedMs));
        const idleMs = Math.max(0, totalMs - workedMs - pausedMs);
        const efficiency = totalMs > 0 ? Math.min(100, Math.round((workedMs / totalMs) * 100)) : 0;

        rows.push({
          sector: current.sector,
          sectorLabel: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[current.sector]) ? SECTOR_LABELS[current.sector] : current.sector,
          enteredAt,
          exitAt: status === 'active' ? null : exitAt,
          totalMs,
          workedMs,
          pausedMs,
          idleMs,
          efficiency,
          status,
          pauses: [],
          _source: 'historyTimeline'
        });
      }
    }

    // Fallback apenas se não houver histórico confiável.
    if (rows.length === 0 && currentSector && !finalSectors.has(currentSector)) {
      const ts = (typeof window !== 'undefined' && typeof window.ffCalculateLotTimeSummary === 'function')
        ? window.ffCalculateLotTimeSummary(lot, { sector: currentSector })
        : (typeof getLotTimeSummary === 'function' ? getLotTimeSummary(lot) : { total: 0, worked: 0, paused: 0, idle: 0, efficiency: 0 });
      rows.push({
        sector: currentSector,
        sectorLabel: (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[currentSector]) ? SECTOR_LABELS[currentSector] : currentSector,
        enteredAt: Number(ts.enteredAt || lot.sectorEnteredAt || lot.createdAt || 0) || null,
        exitAt: null,
        totalMs: Number(ts.total || 0),
        workedMs: Number(ts.worked || 0),
        pausedMs: Number(ts.paused || 0),
        idleMs: Number(ts.idle || 0),
        efficiency: Number(ts.efficiency || 0),
        status: 'active',
        pauses: [],
        _source: 'fallbackCurrent'
      });
    }

    return rows;
  } catch (e) {
    console.warn('[relatorio-tempos] calculateSectorTimesFromLot falhou:', e.message);
    return [];
  }
}

/**
 * Retorna o tempo decorrido do lote no setor atual em ms.
 * Seguro – retorna 0 se não houver informação suficiente.
 */
function getCurrentSectorElapsedTime(lot) {
  if (!lot) return 0;
  try {
    const enteredAt = lot.sectorEnteredAt || lot.createdAt || 0;
    if (!enteredAt) return 0;
    return Math.max(0, Date.now() - Number(enteredAt));
  } catch (_) {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO "TEMPOS POR SETOR" NO MODAL DE DETALHES DO LOTE
// ─────────────────────────────────────────────────────────────────

/**
 * Gera o HTML da seção "Tempos por Setor" para o modal openLotDetail.
 * Chamada em lots.js após o histórico de eventos.
 */
function renderLotSectorTimesHistory(lot) {
  if (!lot) return '';

  try {
    const metrics = calculateSectorTimesFromLot(lot);

    if (!metrics || metrics.length === 0) {
      return `
        <div class="rt-sector-times-section">
          <h4 class="rt-section-title">
            <i class="fas fa-stopwatch"></i> Tempos por Setor
          </h4>
          <div class="rt-empty-mini">
            <i class="fas fa-info-circle"></i>
            Sem dados de tempo suficientes para este lote.
          </div>
        </div>`;
    }

    const rows = metrics.map(m => {
      const statusBadge = m.status === 'active'
        ? `<span class="rt-badge rt-badge-active">Em andamento</span>`
        : `<span class="rt-badge rt-badge-done">Finalizado</span>`;

      const effColor = m.efficiency >= 70 ? '#4ade80'
        : m.efficiency >= 40 ? '#fbbf24'
        : '#f87171';

      const pauseList = m.pauses.length > 0
        ? `<div class="rt-pause-list">
             <span class="rt-pause-list-title"><i class="fas fa-pause-circle"></i> Pausas:</span>
             ${m.pauses.map(p => `
               <div class="rt-pause-item">
                 <span class="rt-pause-time">${rtFormatDateTime(p.start)} → ${p.end ? rtFormatDateTime(p.end) : '<em>Em pausa</em>'}</span>
                 <span class="rt-pause-reason">— ${escapeHtml(p.reason)}</span>
               </div>`).join('')}
           </div>`
        : '';

      return `
        <div class="rt-sector-block ${m.status === 'active' ? 'rt-sector-active' : ''}">
          <div class="rt-sector-block-header">
            <div class="rt-sector-block-name">
              <span class="rt-sector-dot" style="background:${(typeof SECTOR_COLORS !== 'undefined' ? SECTOR_COLORS[m.sector] : '') || '#6b7280'}"></span>
              <strong>${escapeHtml(m.sectorLabel || m.sector || '–')}</strong>
            </div>
            ${statusBadge}
          </div>
          <div class="rt-sector-block-times">
            <div class="rt-time-item">
              <span class="rt-time-lbl">Entrada</span>
              <span class="rt-time-val">${rtFormatDateTime(m.enteredAt)}</span>
            </div>
            <div class="rt-time-item">
              <span class="rt-time-lbl">Saída</span>
              <span class="rt-time-val">${m.status === 'active' ? '<em style="color:var(--green)">Em andamento</em>' : rtFormatDateTime(m.exitAt)}</span>
            </div>
            <div class="rt-time-item">
              <span class="rt-time-lbl">Tempo total</span>
              <span class="rt-time-val">${rtFormatMs(m.totalMs)}</span>
            </div>
            <div class="rt-time-item">
              <span class="rt-time-lbl" style="color:#4ade80">Trabalhado</span>
              <span class="rt-time-val" style="color:#4ade80">${rtFormatMs(m.workedMs)}</span>
            </div>
            <div class="rt-time-item">
              <span class="rt-time-lbl" style="color:#fbbf24">Pausado</span>
              <span class="rt-time-val" style="color:#fbbf24">${rtFormatMs(m.pausedMs)}</span>
            </div>
            <div class="rt-time-item">
              <span class="rt-time-lbl" style="color:#94a3b8">Ocioso</span>
              <span class="rt-time-val" style="color:#94a3b8">${rtFormatMs(m.idleMs)}</span>
            </div>
            <div class="rt-time-item">
              <span class="rt-time-lbl">Eficiência</span>
              <span class="rt-time-val" style="color:${effColor};font-weight:700">${m.totalMs > 0 ? m.efficiency + '%' : '–'}</span>
            </div>
          </div>
          ${m.totalMs > 0 ? `
          <div class="rt-mini-bar">
            <div class="rt-mini-bar-worked" style="width:${Math.min(100,Math.round(m.workedMs/Math.max(m.totalMs,1)*100))}%"></div>
            <div class="rt-mini-bar-paused" style="width:${Math.min(100,Math.round(m.pausedMs/Math.max(m.totalMs,1)*100))}%"></div>
            <div class="rt-mini-bar-idle"   style="flex:1"></div>
          </div>` : ''}
          ${pauseList}
        </div>`;
    }).join('');

    return `
      <div class="rt-sector-times-section">
        <h4 class="rt-section-title">
          <i class="fas fa-stopwatch"></i> Tempos por Setor
        </h4>
        ${rows}
      </div>`;

  } catch (e) {
    console.warn('[relatorio-tempos] renderLotSectorTimesHistory falhou:', e.message);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────
// RENDER PRINCIPAL DA PÁGINA
// ─────────────────────────────────────────────────────────────────

function renderRelatorioTempos() {
  injectRelatorioTemposHorizontalScrollFix();
  const page = document.getElementById('pageRelatorioTempos');
  if (!page) return;

  const user = STATE.currentUser;
  if (!user) return;

  page.innerHTML = `
    <div class="rt-page-shell">
    <!-- HEADER -->
    <div class="page-header">
      <h2><i class="fas fa-clock"></i> Relatório de Tempos</h2>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="exportRelatorioTemposExcel()" title="Exportar Excel">
          <i class="fas fa-file-excel"></i> Excel
        </button>
        <button class="btn btn-secondary" onclick="exportRelatorioTemposPDF()" title="Exportar PDF">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
      </div>
    </div>

    <!-- AVISO FONTE DE DADOS -->
    <div class="rt-backend-notice" id="rtBackendNotice" style="display:none">
      <i class="fas fa-database"></i>
      <div>
        <strong>Dados locais (fallback).</strong>
        O endpoint <code>GET /api/producao/relatorio-tempos</code> não respondeu.
        Os dados abaixo são calculados a partir dos lotes em memória.
      </div>
    </div>

    <!-- FILTROS -->
    <div class="rt-filters-card">
      <div class="rt-filters-title">
        <i class="fas fa-filter"></i> Filtros
      </div>
      <div class="rt-filters-grid">
        <div class="rt-filter-group">
          <label class="rt-filter-label">Código do Produto</label>
          <input type="text" id="rtFilterCodigo" class="rt-filter-input"
            placeholder="Ex: 127.101 ou 127, 034.007"
            title="Informe um ou vários códigos separados por vírgula. Busca por prefixo."
            value="${escapeHtml(_rtFilters.codigoProduto)}"
            oninput="_rtSyncFilters()" />
          <span class="rt-filter-hint">Separe por vírgula para múltiplos. Ex: 127, 034</span>
        </div>
        <div class="rt-filter-group">
          <label class="rt-filter-label">Nome do Produto</label>
          <input type="text" id="rtFilterNome" class="rt-filter-input"
            placeholder="Ex: Esmalte Branco"
            value="${escapeHtml(_rtFilters.nomeProduto)}"
            oninput="_rtSyncFilters()" />
        </div>
        <div class="rt-filter-group">
          <label class="rt-filter-label">OP / Lote</label>
          <input type="text" id="rtFilterOpLote" class="rt-filter-input"
            placeholder="Ex: 087153 ou L-001"
            value="${escapeHtml(_rtFilters.opLote)}"
            oninput="_rtSyncFilters()" />
        </div>
        <div class="rt-filter-group">
          <label class="rt-filter-label">Pedido</label>
          <input type="text" id="rtFilterPedido" class="rt-filter-input"
            placeholder="Ex: PED-2026-001"
            value="${escapeHtml(_rtFilters.pedido)}"
            oninput="_rtSyncFilters()" />
        </div>
        <div class="rt-filter-group">
          <label class="rt-filter-label">Cliente</label>
          <input type="text" id="rtFilterCliente" class="rt-filter-input"
            placeholder="Ex: Carbofibras"
            value="${escapeHtml(_rtFilters.cliente)}"
            oninput="_rtSyncFilters()" />
        </div>
        <div class="rt-filter-group">
          <label class="rt-filter-label">Data Inicial</label>
          <input type="date" id="rtFilterDataIni" class="rt-filter-input"
            value="${escapeHtml(_rtFilters.dataInicial)}"
            onchange="_rtSyncFilters()" />
        </div>
        <div class="rt-filter-group">
          <label class="rt-filter-label">Data Final</label>
          <input type="date" id="rtFilterDataFim" class="rt-filter-input"
            value="${escapeHtml(_rtFilters.dataFinal)}"
            onchange="_rtSyncFilters()" />
        </div>
        <div class="rt-filter-group">
          <label class="rt-filter-label">Setor</label>
          <select id="rtFilterSetor" class="rt-filter-input" onchange="_rtSyncFilters()">
            <option value="">Todos os setores</option>
            ${_rtBuildSetorOptions()}
          </select>
        </div>
        <div class="rt-filter-group">
          <label class="rt-filter-label">Visualização</label>
          <select id="rtViewMode" class="rt-filter-input" onchange="_rtSyncFilters(); if (_rtData.length) renderRelatorioTemposTable(_rtFromBackend ? _rtData : _rtApplyFilters(_rtData));">
            <option value="auto" ${_rtViewMode === 'auto' ? 'selected' : ''}>Automática</option>
            <option value="grouped" ${_rtViewMode === 'grouped' ? 'selected' : ''}>Consolidado por setor</option>
            <option value="detailed" ${_rtViewMode === 'detailed' ? 'selected' : ''}>Detalhado linha a linha</option>
          </select>
          <span class="rt-filter-hint">Pedido/código/cliente consolidam por setor; OP específica mostra detalhe.</span>
        </div>
        <div class="rt-filter-group">
          <label class="rt-filter-label">Ordenar por</label>
          <select id="rtSortMode" class="rt-filter-input" onchange="_rtSyncFilters(); if (_rtData.length) renderRelatorioTemposTable(_rtFromBackend ? _rtData : _rtApplyFilters(_rtData));">
            <option value="default" ${_rtSortMode === 'default' ? 'selected' : ''}>Padrão do fluxo</option>
            <option value="qty_desc" ${_rtSortMode === 'qty_desc' ? 'selected' : ''}>Maior quantidade</option>
            <option value="qty_asc" ${_rtSortMode === 'qty_asc' ? 'selected' : ''}>Menor quantidade</option>
            <option value="total_desc" ${_rtSortMode === 'total_desc' ? 'selected' : ''}>Maior tempo total</option>
            <option value="total_asc" ${_rtSortMode === 'total_asc' ? 'selected' : ''}>Menor tempo total</option>
            <option value="worked_desc" ${_rtSortMode === 'worked_desc' ? 'selected' : ''}>Maior trabalhado</option>
            <option value="idle_desc" ${_rtSortMode === 'idle_desc' ? 'selected' : ''}>Maior ociosidade</option>
            <option value="eff_desc" ${_rtSortMode === 'eff_desc' ? 'selected' : ''}>Maior eficiência</option>
            <option value="eff_asc" ${_rtSortMode === 'eff_asc' ? 'selected' : ''}>Menor eficiência</option>
            <option value="entrada_asc" ${_rtSortMode === 'entrada_asc' ? 'selected' : ''}>Entrada mais antiga</option>
            <option value="entrada_desc" ${_rtSortMode === 'entrada_desc' ? 'selected' : ''}>Entrada mais recente</option>
            <option value="op_asc" ${_rtSortMode === 'op_asc' ? 'selected' : ''}>OP crescente</option>
            <option value="pedido_asc" ${_rtSortMode === 'pedido_asc' ? 'selected' : ''}>Pedido crescente</option>
            <option value="cliente_asc" ${_rtSortMode === 'cliente_asc' ? 'selected' : ''}>Cliente A-Z</option>
          </select>
          <span class="rt-filter-hint">Funciona no consolidado por setor e no detalhado por OP.</span>
        </div>
      </div>
      <div class="rt-filter-actions">
        <button class="btn btn-primary" onclick="loadRelatorioTempos()">
          <i class="fas fa-search"></i> Buscar
        </button>
        <button class="btn btn-secondary" onclick="rtClearFilters()">
          <i class="fas fa-times"></i> Limpar filtros
        </button>
      </div>
    </div>

    <!-- CARDS DE RESUMO -->
    <div id="rtSummaryArea"></div>

    <!-- TABELA -->
    <div id="rtTableArea">
      <div class="rt-empty-state">
        <i class="fas fa-clock"></i>
        <p>Use os filtros acima e clique em <strong>Buscar</strong> para carregar o relatório.</p>
      </div>
    </div>
    </div>
  `;

  // Se já tinha dados, re-renderiza resumo e tabela imediatamente
  if (_rtData.length > 0) {
    renderRelatorioTemposSummary(_rtData);
    renderRelatorioTemposTable(_rtData);
  }
}

// ─────────────────────────────────────────────────────────────────
// CARGA DOS DADOS (frontend local + backend futuro)
// ─────────────────────────────────────────────────────────────────

/**
 * Carrega dados do relatório.
 * 1. Tenta buscar no backend (GET /api/producao/relatorio-tempos).
 * 2. Se backend não disponível, usa dados locais do STATE.lots.
 * 3. Aplica filtros em ambos os casos.
 */
async function loadRelatorioTempos() {
  const buscarBtn = document.querySelector('#pageRelatorioTempos .btn-primary');
  if (buscarBtn) {
    buscarBtn.disabled = true;
    buscarBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando…';
  }

  const tableArea   = document.getElementById('rtTableArea');
  const summaryArea = document.getElementById('rtSummaryArea');
  const notice      = document.getElementById('rtBackendNotice');

  if (tableArea) {
    tableArea.innerHTML = `
      <div class="rt-loading">
        <i class="fas fa-spinner fa-spin"></i>
        Carregando relatório…
      </div>`;
  }
  if (summaryArea) summaryArea.innerHTML = '';

  try {
    // ── Backend como fonte principal ──
    // O endpoint já está respondendo corretamente; então primeiro buscamos no Railway.
    // Só caímos no fallback local se a chamada realmente falhar.
    _rtSyncFilters();
    const backendResult = await _rtFetchBackend();

    if (backendResult !== null) {
      // Backend respondeu com sucesso
      _rtFromBackend = true;
      _rtData   = backendResult.rows;
      _rtResumo = backendResult.resumo || null;
      _rtTotal  = backendResult.total  || _rtData.length;

      console.log('[Relatório de Tempos] resposta backend OK — total:', _rtTotal, '| linhas:', _rtData.length);
      console.log('[Relatório de Tempos] primeira linha:', _rtData[0] || '(vazio)');

      // Oculta aviso de fallback
      if (notice) notice.style.display = 'none';

      // Dados do backend já vêm filtrados — não re-filtrar
      renderRelatorioTemposSummary(_rtData);
      renderRelatorioTemposTable(_rtData);

    } else {
      // ── Fallback: dados locais ──
      _rtFromBackend = false;
      _rtData   = _rtBuildFromLocalLots();
      _rtResumo = null;
      _rtTotal  = _rtData.length;

      console.log('[Relatório de Tempos] backend offline — usando fallback local, lotes:', _rtData.length);

      // Exibe aviso de fallback
      if (notice) notice.style.display = 'flex';

      // Fallback: aplica filtros locais
      const filtered = _rtApplyFilters(_rtData);
      console.log('[Relatório de Tempos] linhas após filtro local:', filtered.length);

      renderRelatorioTemposSummary(filtered);
      renderRelatorioTemposTable(filtered);
    }

    if (_rtData.length === 0) {
      showToast('Nenhum dado encontrado para os filtros informados.', 'info');
    }

  } catch (e) {
    console.error('[Relatório de Tempos] Erro em loadRelatorioTempos:', e);
    if (tableArea) {
      tableArea.innerHTML = `
        <div class="rt-error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Erro ao carregar o relatório. Tente novamente.<br>
          <small style="color:var(--text3)">${escapeHtml(e.message || '')}</small></p>
        </div>`;
    }
  } finally {
    if (buscarBtn) {
      buscarBtn.disabled = false;
      buscarBtn.innerHTML = '<i class="fas fa-search"></i> Buscar';
    }
  }
}

/**
 * Tenta buscar no backend real.
 * Retorna { rows, resumo, total } se sucesso, null se endpoint offline/erro.
 *
 * Campos de query suportados pelo backend:
 *   codigo, produto, op, pedido, cliente, inicio, fim, setor, limit
 */
async function _rtFetchBackend() {
  try {
    // Resolve a base de API do FactoryFlow de forma mais segura.
    // Motivo: em alguns ambientes o API_BASE pode estar vazio/antigo,
    // enquanto o resolveFactoryFlowApiBase/PEDIDOS_API aponta para o Railway correto.
    const baseCandidates = [
      (typeof resolveFactoryFlowApiBase === 'function' ? resolveFactoryFlowApiBase() : ''),
      (typeof PEDIDOS_API !== 'undefined' ? PEDIDOS_API : ''),
      (window.PEDIDOS_API || ''),
      (typeof API_BASE !== 'undefined' ? API_BASE : ''),
      (window.API_BASE || ''),
      (typeof API_URL !== 'undefined' ? API_URL : ''),
      (window.API_URL || ''),
      (typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : ''),
      (window.BACKEND_URL || ''),
      'https://app-producao-backend-production.up.railway.app'
    ];

    let base = baseCandidates
      .map(v => String(v || '').trim().replace(/\/$/, ''))
      .find(Boolean);

    if (!base) {
      console.warn('[Relatório de Tempos] Nenhuma base de API definida.');
      return null;
    }

    // Evita duplicar /api caso alguma variável venha como .../api
    base = base.replace(/\/api$/i, '');

    // Monta parâmetros de filtro com os nomes que o backend espera.
    const params = new URLSearchParams();
    if (_rtFilters.codigoProduto) params.set('codigo',  _rtFilters.codigoProduto);
    if (_rtFilters.nomeProduto)   params.set('produto', _rtFilters.nomeProduto);
    if (_rtFilters.opLote)        params.set('op',      _rtFilters.opLote);
    if (_rtFilters.pedido)        params.set('pedido',  _rtFilters.pedido);
    if (_rtFilters.cliente)       params.set('cliente', _rtFilters.cliente);
    if (_rtFilters.dataInicial)   params.set('inicio',  _rtFilters.dataInicial);
    if (_rtFilters.dataFinal)     params.set('fim',     _rtFilters.dataFinal);
    if (_rtFilters.setor)         params.set('setor',   _rtFilters.setor);
    params.set('limit', '5000');

    const url = `${base}/api/producao/relatorio-tempos?${params.toString()}`;
    console.log('[Relatório de Tempos] Buscando backend:', url);

    // Autenticação: somente o JWT salvo no login. Sem token fixo, sem X-API-Key.
    const sessionToken =
      (typeof resolveFactoryFlowSessionToken === 'function' ? resolveFactoryFlowSessionToken() : '') ||
      sessionStorage.getItem('ff_token') ||
      localStorage.getItem('ff_token') ||
      localStorage.getItem('factoryflow_token') ||
      localStorage.getItem('token') ||
      '';

    const headers = { 'Accept': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

    // Content-Type em GET não é necessário e pode atrapalhar preflight em alguns ambientes.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store'
    }).finally(() => clearTimeout(timer));

    console.log('[Relatório de Tempos] status HTTP:', res.status);

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('[Relatório de Tempos] Backend respondeu erro', res.status, txt);
      return null;
    }

    const json = await res.json().catch(err => {
      console.warn('[Relatório de Tempos] Backend respondeu, mas JSON inválido:', err.message);
      return null;
    });

    if (!json || json.ok === false) {
      console.warn('[Relatório de Tempos] Backend retornou ok=false ou payload vazio:', json);
      return null;
    }

    const rows = Array.isArray(json.data) ? json.data
               : Array.isArray(json.rows) ? json.rows
               : Array.isArray(json.result) ? json.result
               : Array.isArray(json) ? json
               : [];

    console.log('[Relatório de Tempos] Backend OK. Linhas:', rows.length, 'Total:', json.total || rows.length);

    return {
      rows,
      resumo: json.resumo || null,
      total: Number(json.total || rows.length || 0)
    };

  } catch (e) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      console.warn('[Relatório de Tempos] Timeout ao chamar backend. Usando fallback local.');
    } else {
      console.warn('[Relatório de Tempos] Erro ao chamar backend:', e.message || e);
    }
    return null;
  }
}
/**
 * Constrói linhas do relatório a partir dos lotes em STATE.lots.
 * Usa calculateSectorTimesFromLot para extrair tempos.
 */
function _rtBuildFromLocalLots() {
  if (!STATE || !Array.isArray(STATE.lots)) return [];

  const rows = [];

  STATE.lots.forEach(lot => {
    if (!lot || lot.rejected) return;

    try {
      const metrics = (typeof calculateSectorTimesFromLot === 'function')
        ? calculateSectorTimesFromLot(lot)
        : [];

      metrics.forEach((m, idx) => {
        rows.push({
          id:           `${lot.id || lot.number || 'lote'}_${m.sector || idx}_${idx}`,
          lotId:        lot.id,
          lotNumber:    lot.number || lot.op || lot.raw_mysql?.op || '–',
          op:           lot.op || lot.number || lot.raw_mysql?.op || '',
          orderNumber:  lot.orderNumber || lot.numero_pedido || lot.raw_mysql?.numero_pedido || '–',
          productCode:  lot.productCode || lot.produto_codigo || lot.raw_mysql?.produto_codigo || '–',
          productName:  lot.paint || lot.productName || lot.produto_nome || lot.raw_mysql?.produto_nome || '–',
          client:       lot.client || lot.cliente || lot.raw_mysql?.cliente || '–',
          qty:          lot.qty != null ? `${lot.qty} ${lot.unit || 'Kg'}` : (lot.quantidade ? `${lot.quantidade} Kg` : '–'),
          productLine:  lot.productType || lot.tipo || lot.tipo_lote || '–',
          sector:       m.sector || lot.sector || '–',
          sectorLabel:  m.sectorLabel || ((typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[m.sector]) ? SECTOR_LABELS[m.sector] : (m.sector || '–')),
          enteredAt:    m.enteredAt || null,
          exitAt:       m.exitAt || null,
          totalMs:      Number(m.totalMs || 0),
          workedMs:     Number(m.workedMs || 0),
          pausedMs:     Number(m.pausedMs || 0),
          idleMs:       Number(m.idleMs || 0),
          efficiency:   Number.isFinite(Number(m.efficiency)) ? Number(m.efficiency) : 0,
          lotStatus:    m.status === 'active' ? (lot.lotStatus || 'idle') : 'finalizado',
          status:       m.status || 'done',
          _lot:         lot,
          _metric:      m
        });
      });

    } catch (e) {
      console.warn('[relatorio-tempos] Erro ao processar lote', lot?.id, e.message);
    }
  });

  return rows;
}

// ─────────────────────────────────────────────────────────────────
// FILTROS
// ─────────────────────────────────────────────────────────────────

/** Sincroniza _rtFilters com os inputs da tela */
function _rtSyncFilters() {
  _rtFilters.codigoProduto = document.getElementById('rtFilterCodigo')?.value?.trim()  || '';
  _rtFilters.nomeProduto   = document.getElementById('rtFilterNome')?.value?.trim()    || '';
  _rtFilters.opLote        = document.getElementById('rtFilterOpLote')?.value?.trim()  || '';
  _rtFilters.pedido        = document.getElementById('rtFilterPedido')?.value?.trim()  || '';
  _rtFilters.cliente       = document.getElementById('rtFilterCliente')?.value?.trim() || '';
  _rtFilters.dataInicial   = document.getElementById('rtFilterDataIni')?.value         || '';
  _rtFilters.dataFinal     = document.getElementById('rtFilterDataFim')?.value         || '';
  _rtFilters.setor         = document.getElementById('rtFilterSetor')?.value           || '';
  _rtViewMode              = document.getElementById('rtViewMode')?.value              || _rtViewMode || 'auto';
  _rtSortMode              = document.getElementById('rtSortMode')?.value              || _rtSortMode || 'default';
}

/** Limpa todos os filtros e re-renderiza tela */
function rtClearFilters() {
  _rtFilters = { codigoProduto:'', nomeProduto:'', opLote:'', pedido:'', cliente:'', dataInicial:'', dataFinal:'', setor:'' };
  _rtViewMode = 'auto';
  _rtSortMode = 'default';
  _rtData = [];
  renderRelatorioTempos();
}

/**
 * Aplica filtros sobre um array de linhas.
 * Código do produto: suporta prefixos múltiplos separados por vírgula.
 */
function _rtApplyFilters(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.filter(r => {
    // ── Código do produto (prefixos múltiplos) ──
    if (_rtFilters.codigoProduto) {
      const prefixes = _rtFilters.codigoProduto
        .split(',')
        .map(p => p.trim().toLowerCase())
        .filter(Boolean);
      const code = String(r.productCode || '').toLowerCase();
      const matches = prefixes.some(p => code.startsWith(p) || code.includes(p));
      if (!matches) return false;
    }

    // ── Nome do produto ──
    if (_rtFilters.nomeProduto) {
      const q = _rtFilters.nomeProduto.toLowerCase();
      if (!String(r.productName || '').toLowerCase().includes(q)) return false;
    }

    // ── OP/Lote ──
    if (_rtFilters.opLote) {
      const q = _rtFilters.opLote.toLowerCase();
      const hay = `${r.lotNumber} ${r.op || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    // ── Pedido ──
    if (_rtFilters.pedido) {
      if (!String(r.orderNumber || '').toLowerCase().includes(_rtFilters.pedido.toLowerCase())) return false;
    }

    // ── Cliente ──
    if (_rtFilters.cliente) {
      if (!String(r.client || '').toLowerCase().includes(_rtFilters.cliente.toLowerCase())) return false;
    }

    // ── Setor ──
    if (_rtFilters.setor) {
      if (String(r.sector || '').toLowerCase() !== _rtFilters.setor.toLowerCase()) return false;
    }

    // ── Data inicial/final (por enteredAt) ──
    if (_rtFilters.dataInicial && r.enteredAt) {
      const ini = new Date(_rtFilters.dataInicial).getTime();
      if (Number(r.enteredAt) < ini) return false;
    }
    if (_rtFilters.dataFinal && r.enteredAt) {
      const fim = new Date(_rtFilters.dataFinal + 'T23:59:59').getTime();
      if (Number(r.enteredAt) > fim) return false;
    }

    return true;
  });
}

/** Gera options de <select> de setor dinamicamente */
function _rtBuildSetorOptions() {
  if (typeof SECTOR_LABELS === 'undefined') return '';
  return Object.entries(SECTOR_LABELS)
    .filter(([k]) => k !== 'entrega' && k !== 'entregue' && !_rtIsExcludedReportSector(k))
    .map(([k, v]) => `<option value="${k}" ${_rtFilters.setor === k ? 'selected' : ''}>${escapeHtml(v)}</option>`)
    .join('');
}

// ─────────────────────────────────────────────────────────────────
// CARDS DE RESUMO
// ─────────────────────────────────────────────────────────────────

function renderRelatorioTemposSummary(rows) {
  const area = document.getElementById('rtSummaryArea');
  if (!area) return;

  if (!rows || rows.length === 0) {
    area.innerHTML = '';
    return;
  }

  const summaryRows = _rtFilterReportRows(rows.map(_rtNormalizeRow).filter(Boolean));
  if (summaryRows.length === 0) {
    area.innerHTML = '';
    return;
  }

  // Suporta tanto campos do backend (totalMs, workedMs, pausedMs, idleMs, efficiency)
  // quanto campos locais (mesmos nomes — já normalizados por _rtNormalizeRow)
  const totalLinhas  = summaryRows.length;

  // Se houve remoção de setores do relatório, recalcula o resumo no frontend para bater com a tabela.
  const resumo = null;
  const totalWorked  = summaryRows.reduce((a, r) => a + (Number(r.workedMs)  || 0), 0);
  const totalPaused  = summaryRows.reduce((a, r) => a + (Number(r.pausedMs)  || 0), 0);
  const totalIdle    = summaryRows.reduce((a, r) => a + (Number(r.idleMs)    || 0), 0);
  const eficRows     = summaryRows.filter(r => (Number(r.totalMs) || 0) > 0);
  const avgEff       = eficRows.length > 0
      ? Math.round(eficRows.reduce((a, r) => a + (Number(r.efficiency) || 0), 0) / eficRows.length)
      : 0;

  // Soma de Kg uma vez por lote (um lote pode ter várias linhas, uma por setor/passagem).
  const kgByLot = new Map();
  summaryRows.forEach(r => {
    const lotKey = String(r.lotNumber || r.op || r.id || '').trim();
    const kg = _rtParseKgFromQty(r.qty);
    if (lotKey && kg > 0 && !kgByLot.has(lotKey)) kgByLot.set(lotKey, kg);
  });
  const totalKg = Array.from(kgByLot.values()).reduce((a, b) => a + b, 0);

  const effColor = avgEff >= 70 ? '#4ade80' : avgEff >= 40 ? '#fbbf24' : '#f87171';

  area.innerHTML = `
    <div class="rt-summary-grid">
      <div class="rt-summary-card">
        <div class="rt-sum-icon" style="background:rgba(59,130,246,.15);color:#60a5fa">
          <i class="fas fa-list-ol"></i>
        </div>
        <div class="rt-sum-body">
          <div class="rt-sum-val">${totalLinhas}</div>
          <div class="rt-sum-lbl">Total de linhas</div>
        </div>
      </div>
      <div class="rt-summary-card">
        <div class="rt-sum-icon" style="background:rgba(139,92,246,.12);color:#c4b5fd">
          <i class="fas fa-weight-hanging"></i>
        </div>
        <div class="rt-sum-body">
          <div class="rt-sum-val" style="color:#c4b5fd">${totalKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Kg</div>
          <div class="rt-sum-lbl">Quantidade</div>
        </div>
      </div>
      <div class="rt-summary-card">
        <div class="rt-sum-icon" style="background:rgba(34,197,94,.12);color:#4ade80">
          <i class="fas fa-play-circle"></i>
        </div>
        <div class="rt-sum-body">
          <div class="rt-sum-val" style="color:#4ade80">${rtFormatMs(totalWorked)}</div>
          <div class="rt-sum-lbl">Total trabalhado</div>
        </div>
      </div>
      <div class="rt-summary-card">
        <div class="rt-sum-icon" style="background:rgba(245,158,11,.12);color:#fbbf24">
          <i class="fas fa-pause-circle"></i>
        </div>
        <div class="rt-sum-body">
          <div class="rt-sum-val" style="color:#fbbf24">${rtFormatMs(totalPaused)}</div>
          <div class="rt-sum-lbl">Total pausado</div>
        </div>
      </div>
      <div class="rt-summary-card">
        <div class="rt-sum-icon" style="background:rgba(100,116,139,.12);color:#94a3b8">
          <i class="fas fa-moon"></i>
        </div>
        <div class="rt-sum-body">
          <div class="rt-sum-val" style="color:#94a3b8">${rtFormatMs(totalIdle)}</div>
          <div class="rt-sum-lbl">Total ocioso</div>
        </div>
      </div>
      <div class="rt-summary-card">
        <div class="rt-sum-icon" style="background:rgba(34,197,94,.1);color:${effColor}">
          <i class="fas fa-chart-line"></i>
        </div>
        <div class="rt-sum-body">
          <div class="rt-sum-val" style="color:${effColor}">${eficRows.length > 0 ? avgEff + '%' : '–'}</div>
          <div class="rt-sum-lbl">Eficiência média</div>
        </div>
      </div>
    </div>`;
}


// ─────────────────────────────────────────────────────────────────
// EXPEDIENTE ÚTIL NO FRONTEND
// O frontend NÃO usa mais expediente fixo.
// A regra correta vem do backend por eventos reais de abrir/fechar expediente.
// ─────────────────────────────────────────────────────────────────
const RT_FRONT_WORKDAY_START_MINUTES = 7 * 60 + 10;  // 07:10
const RT_FRONT_WORKDAY_END_MINUTES   = 17 * 60 + 25; // 17:25

function _rtStartOfLocalDayMs(ms) {
  const d = new Date(Number(ms || 0));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

function _rtIsWeekendLocalDayMs(dayStartMs) {
  const d = new Date(Number(dayStartMs || 0));
  const day = d.getDay();
  return day === 0 || day === 6; // domingo ou sábado
}

function _rtEffectiveOpenDurationMs(startMs, endMs) {
  const start = Number(startMs || 0);
  const end = Number(endMs || Date.now());

  if (!start || !end || end <= start) return 0;

  let total = 0;
  let dayStart = _rtStartOfLocalDayMs(start);
  const lastDay = _rtStartOfLocalDayMs(end);

  // trava de segurança para evitar loop infinito em dados antigos/corrompidos
  for (let guard = 0; guard < 3700 && dayStart <= lastDay; guard++) {
    // Fim de semana não conta como expediente aberto.
    // Antes a função somava 07:10–17:25 também no sábado/domingo,
    // por isso lotes parados no setor durante o fim de semana ganhavam cerca de 20h a mais.
    if (!_rtIsWeekendLocalDayMs(dayStart)) {
      const openAt = dayStart + RT_FRONT_WORKDAY_START_MINUTES * 60000;
      const closeAt = dayStart + RT_FRONT_WORKDAY_END_MINUTES * 60000;

      const from = Math.max(start, openAt);
      const to = Math.min(end, closeAt);

      if (to > from) total += (to - from);
    }

    dayStart += 24 * 60 * 60000;
  }

  return Math.max(0, Math.round(total));
}

function _rtApplyExpedienteToTimeRow(row) {
  // IMPORTANTE:
  // Não recalcular por expediente fixo no frontend.
  // O tempo correto deve vir do backend, calculado pelos eventos reais de
  // abrir/fechar expediente. Assim, se tiver hora extra com expediente aberto,
  // o tempo continua contando normalmente; se estiver fechado, congela.
  if (!row) return row;

  const totalMs = Math.max(0, Number(row.totalMs || 0));
  let workedMs = Math.max(0, Number(row.workedMs || 0));
  let pausedMs = Math.max(0, Number(row.pausedMs || 0));

  workedMs = Math.min(workedMs, totalMs);
  pausedMs = Math.min(pausedMs, Math.max(0, totalMs - workedMs));

  row.totalMs = totalMs;
  row.workedMs = workedMs;
  row.pausedMs = pausedMs;
  row.idleMs = Math.max(0, totalMs - workedMs - pausedMs);
  row.efficiency = totalMs > 0 ? Math.min(100, Math.round((workedMs / totalMs) * 100)) : 0;

  return row;
}



// ─────────────────────────────────────────────────────────────────
// TABELA DO RELATÓRIO
// ─────────────────────────────────────────────────────────────────

/**
 * Normaliza uma linha vinda do backend para o formato interno.
 * Os campos do backend usam snake_case; internamente usamos camelCase.
 * Suporta ambos os formatos para compatibilidade com fallback local.
 */

function _rtNormalizeRow(r) {
  if (!r) return null;

  // Converte timestamp para número válido ou null.
  const toTs = (v) => {
    if (!v) return null;
    const n = typeof v === 'string'
      ? (isNaN(Number(v)) ? new Date(v).getTime() : Number(v))
      : Number(v);
    return isFinite(n) && n > 0 ? n : null;
  };

  const parseMs = (...values) => {
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue;
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    return 0;
  };

  const statusRaw = String(r.status || r.situacao || r.metricStatus || '').toLowerCase();
  const isFinalizado = statusRaw.includes('final') || statusRaw.includes('done') || statusRaw.includes('conclu');

  const rawEntered = r.enteredAt || r.entered_at || r.entrada || null;
  const rawExit = r.leftAt || r.left_at || r.exitAt || r.exit_at || r.saida || null;

  const enteredAtTs = toTs(rawEntered);
  let exitAtTs = toTs(rawExit);

  let totalMs = parseMs(r.totalMs, r.total_ms, r.tempoTotalMs, r.tempo_total_ms);
  let workedMs = parseMs(r.workedMs, r.worked_ms, r.tempoTrabalhadoMs, r.tempo_trabalhado_ms);
  let pausedMs = parseMs(r.pausedMs, r.paused_ms, r.tempoPausadoMs, r.tempo_pausado_ms);
  let idleMs = parseMs(r.idleMs, r.idle_ms, r.tempoOciosoMs, r.tempo_ocioso_ms);

  // Se o backend marcou o setor como finalizado mas não mandou saída,
  // infere saída por entrada + total para não aparecer "Em andamento" errado.
  if (!exitAtTs && isFinalizado && enteredAtTs && totalMs > 0) {
    exitAtTs = enteredAtTs + totalMs;
  }

  const tsOk = enteredAtTs && exitAtTs ? exitAtTs >= enteredAtTs : true;
  const enteredAt = tsOk ? enteredAtTs : null;
  const exitAt = (tsOk && exitAtTs) ? exitAtTs : null;

  if (!tsOk) {
    totalMs = workedMs = pausedMs = idleMs = 0;
  } else if (!_rtFromBackend && enteredAt && exitAt && totalMs === 0) {
    // Fallback SOMENTE local/offline.
    // Quando os dados vêm do backend, totalMs = 0 pode ser correto:
    // significa que não houve expediente aberto naquele intervalo.
    // Não transformar 0 em diferença corrida de data.
    totalMs = Math.max(0, exitAt - enteredAt);
  } else if (!_rtFromBackend && enteredAt && !exitAt && totalMs === 0 && !isFinalizado) {
    // Fallback SOMENTE local/offline.
    // Quando vem do backend, o backend já manda o total útil e congela
    // quando o expediente está fechado.
    totalMs = Math.max(0, Date.now() - enteredAt);
  }

  // IMPORTANTE:
  // Ocioso é o saldo real do setor: total - trabalhado - pausado.
  // Quando o backend/banco já traz idleMs correto, mas workedMs veio 0/vazio,
  // reconstruímos o trabalhado por diferença: worked = total - paused - idle.
  if (totalMs > 0 && (!workedMs || workedMs <= 0) && idleMs > 0) {
    const derivedWorked = Math.max(0, totalMs - pausedMs - idleMs);
    if (derivedWorked > 0) workedMs = derivedWorked;
  }

  // Nunca deixa trabalhado + pausado + ocioso passar do total útil.
  if (totalMs > 0) {
    workedMs = Math.min(workedMs, totalMs);
    pausedMs = Math.min(pausedMs, Math.max(0, totalMs - workedMs));
    idleMs = Math.max(0, totalMs - workedMs - pausedMs);
  } else {
    workedMs = 0;
    pausedMs = 0;
    idleMs = 0;
  }

  const efficiency = (totalMs > 0 && workedMs > 0)
    ? Math.min(100, Math.round(workedMs / totalMs * 100))
    : 0;

  return {
    id:           r.id_lote || r.id || '',
    lotNumber:    r.op || r.lotNumber || '–',
    orderNumber:  r.numero_pedido || r.orderNumber || '–',
    productCode:  r.produto_codigo || r.productCode || '–',
    productName:  r.produto_nome || r.productName || '–',
    client:       r.cliente_nome || r.client || '–',
    qty:          r.quantidade != null
                    ? `${r.quantidade} ${r.unidade || r.unit || 'Kg'}`
                    : (r.qty || '–'),
    productLine:  r.linha_produto || r.productLine || '–',
    sector:       r.setor || r.sector || '–',
    sectorLabel:  r.setor_nome || r.sectorLabel || r.setor || r.sector || '–',
    enteredAt,
    exitAt,
    totalMs,
    workedMs,
    pausedMs,
    idleMs,
    efficiency,
    _tsValid:     tsOk,
    // Mantém o status do lote para badge, mas preserva status da linha para saída.
    // Prioridade: ff_lot_status (FactoryFlow) > lotStatus (já vem do ff_lotStatus no
    // fallback local) > status_atual_lote/status (coluna legada, usada só como fallback).
    lotStatus:    r.ff_lot_status || r.lotStatus || r.status_atual_lote || r.status || 'idle',
    rowStatus:    r.status || '',
    setor_atual:  r.setor_atual_lote || r.setor_atual || r.setor || '',
    observations: _rtUniqueTextJoin([
      _rtFirstTextValue(r, _rtObservationKeys()),
      _rtFirstTextValue(r.raw_mysql || {}, _rtObservationKeys()),
      _rtFirstTextValue(r._metric || {}, _rtObservationKeys())
    ]),
    pauseReason: _rtUniqueTextJoin([
      _rtFirstTextValue(r, _rtPauseReasonKeys()),
      _rtFirstTextValue(r.raw_mysql || {}, _rtPauseReasonKeys()),
      _rtFirstTextValue(r._metric || {}, _rtPauseReasonKeys())
    ]),
    _lot:         r._lot || null
  };
}


function _rtHasAnyFilterExceptOp() {
  return Boolean(
    _rtFilters.codigoProduto ||
    _rtFilters.nomeProduto ||
    _rtFilters.pedido ||
    _rtFilters.cliente ||
    _rtFilters.dataInicial ||
    _rtFilters.dataFinal ||
    _rtFilters.setor
  );
}

function _rtShouldRenderGroupedBySector(normalizedRows) {
  if (!Array.isArray(normalizedRows) || normalizedRows.length === 0) return false;
  if (_rtViewMode === 'detailed') return false;
  if (_rtViewMode === 'grouped') return true;

  // Modo automático:
  // - OP/lote específico continua detalhado, mostrando o fluxo linha a linha.
  // - Pedido, código, produto, cliente, data ou setor ficam consolidados por setor.
  if (_rtFilters.opLote) return false;
  return _rtHasAnyFilterExceptOp();
}

function _rtParseKgFromQty(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value || '').replace(/\./g, '').replace(',', '.');
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  const n = match ? Number(match[0]) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}


// ─────────────────────────────────────────────────────────────────
// SETORES REMOVIDOS DO RELATÓRIO
// Estes setores são etapas de revisão/liberação inicial e não devem aparecer
// nos relatórios/exportações de tempo produtivo.
// ─────────────────────────────────────────────────────────────────
const RT_EXCLUDED_REPORT_SECTORS = new Set([
  'coloracao_revisao',
  'laboratorio_revisao',
  'pcp_liberacao'
]);

function _rtNormalizeSectorKeyForReport(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—-]+/g, '_')
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9_\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

function _rtIsExcludedReportSector(rowOrSector) {
  const sector = typeof rowOrSector === 'string'
    ? rowOrSector
    : (rowOrSector?.sector || rowOrSector?.sectorLabel || rowOrSector?.setor || rowOrSector?.setor_nome || '');
  const key = _rtNormalizeSectorKeyForReport(sector);
  return RT_EXCLUDED_REPORT_SECTORS.has(key);
}

function _rtFilterReportRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(row => row && !_rtIsExcludedReportSector(row));
}

function _rtFirstTextValue(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of keys) {
    const value = obj?.[key];
    if (value == null) continue;
    if (Array.isArray(value)) {
      const txt = value.map(v => typeof v === 'object' ? _rtFirstTextValue(v, keys) : String(v || '').trim()).filter(Boolean).join(' | ');
      if (txt) return txt;
      continue;
    }
    if (typeof value === 'object') {
      const nested = _rtFirstTextValue(value, keys);
      if (nested) return nested;
      continue;
    }
    const txt = String(value).trim();
    if (txt && txt !== '–' && txt !== '-') return txt;
  }
  return '';
}

function _rtUniqueTextJoin(values) {
  const seen = new Set();
  const out = [];
  (values || []).forEach(value => {
    const txt = String(value || '').trim();
    if (!txt || txt === '-' || txt === '–') return;
    const key = txt.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(txt);
  });
  return out.join(' | ');
}

function _rtObservationKeys() {
  return [
    'observacoes', 'observacao', 'observação', 'obs', 'observation', 'observations',
    'note', 'notes', 'comentario', 'comentário', 'comentarios', 'comentários',
    'descricao', 'descrição', 'description', 'motivo', 'message'
  ];
}

function _rtPauseReasonKeys() {
  return [
    'pauseReason', 'pause_reason', 'motivoPausa', 'motivo_pausa', 'motivo_pausado',
    'motivoPausado', 'reason', 'pausaMotivo', 'pausa_motivo'
  ];
}

function _rtCollectLocalLotTextsForRow(localLot, metric, type = 'obs') {
  if (!localLot) return '';
  const keys = type === 'pause' ? _rtPauseReasonKeys() : _rtObservationKeys();
  const values = [];
  const sectorKey = _rtNormalizeSectorKeyForReport(metric?.sector || metric?.sectorLabel || '');
  const start = Number(metric?.enteredAt || 0);
  const end = Number(metric?.exitAt || Date.now());

  const arrFrom = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return Object.values(value).filter(Boolean);
    try {
      const parsed = JSON.parse(String(value));
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return Object.values(parsed).filter(Boolean);
    } catch (_) {}
    return [];
  };

  const eventTs = (ev) => {
    const raw = ev?.timestamp || ev?.time || ev?.date || ev?.data || ev?.createdAt || ev?.created_at || ev?.updatedAt || ev?.updated_at || ev?.start || ev?.inicio;
    const n = raw ? (isNaN(Number(raw)) ? new Date(raw).getTime() : Number(raw)) : 0;
    return Number.isFinite(n) ? n : 0;
  };

  const eventSector = (ev) => _rtNormalizeSectorKeyForReport(ev?.sector || ev?.setor || ev?.toSector || ev?.to_sector || ev?.novoSetor || ev?.setorDestino || ev?.destinationSector || '');

  const history = arrFrom(localLot.history || localLot.ff_history || localLot.raw_mysql?.ff_history);
  history.forEach(ev => {
    if (!ev || typeof ev !== 'object') return;
    const evSector = eventSector(ev);
    const ts = eventTs(ev);
    const sameSector = !sectorKey || !evSector || evSector === sectorKey;
    const sameWindow = !start || !ts || (ts >= start - 60000 && (!end || ts <= end + 60000));
    if (sameSector && sameWindow) values.push(_rtFirstTextValue(ev, keys));
  });

  const sessions = arrFrom(localLot.workSessions || localLot.ff_workSessions || localLot.raw_mysql?.ff_workSessions);
  sessions.forEach(session => {
    if (!session || typeof session !== 'object') return;
    const sSector = _rtNormalizeSectorKeyForReport(session.sector || session.setor || session.sectorKey || '');
    const sameSector = !sectorKey || !sSector || sSector === sectorKey;
    if (sameSector) values.push(_rtFirstTextValue(session, keys));
  });

  return _rtUniqueTextJoin(values);
}


function _rtBuildSectorAggregationSourceRows(rows) {
  // Fonte única para o consolidado por setor:
  // usa exatamente as mesmas linhas que aparecem no modo "Detalhado linha a linha".
  // Isso evita divergência entre a tela detalhada e o consolidado quando:
  // - há substituição por dados locais do modal/card;
  // - há cálculo de expediente/tempo aplicado no detalhado;
  // - há múltiplas passagens no mesmo setor dentro da mesma OP.
  const normalized = _rtFilterReportRows(Array.isArray(rows) ? rows.filter(Boolean) : []);

  try {
    if (typeof _rtBuildRowsByLot === 'function') {
      const lotGroups = _rtBuildRowsByLot(normalized);
      const flattened = [];

      (lotGroups || []).forEach(group => {
        (group.rows || []).forEach(row => {
          if (!row) return;
          const cloned = { ...row };

          // Garante que a linha usada para consolidar passe pela mesma normalização
          // de saldo do detalhado/exportação, sem alterar o objeto original.
          if (typeof _rtApplyExpedienteToTimeRow === 'function') {
            _rtApplyExpedienteToTimeRow(cloned);
          }

          flattened.push(cloned);
        });
      });

      if (flattened.length > 0) return flattened;
    }
  } catch (err) {
    console.warn('[Relatório de Tempos] Falha ao montar base detalhada para consolidado:', err?.message || err);
  }

  return normalized.map(row => {
    const cloned = { ...row };
    if (typeof _rtApplyExpedienteToTimeRow === 'function') {
      _rtApplyExpedienteToTimeRow(cloned);
    }
    return cloned;
  });
}


function _rtFirstTimeFromRows(rows, field = 'enteredAt') {
  const values = (rows || [])
    .map(r => Number(r?.[field] || 0))
    .filter(v => Number.isFinite(v) && v > 0);
  return values.length ? Math.min(...values) : 0;
}

function _rtSortNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function _rtSortText(value) {
  return String(value || '').trim().toLowerCase();
}

function _rtCompareByMode(a, b, mode, context = 'lot') {
  const fallbackByFlow = () => {
    if (context === 'sector') {
      const order = (typeof _RT_SETORES_PIVOT !== 'undefined' ? _RT_SETORES_PIVOT : []).map(([k]) => String(k || '').toLowerCase());
      const ia = order.indexOf(String(a.sector || '').toLowerCase());
      const ib = order.indexOf(String(b.sector || '').toLowerCase());
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return String(a.sectorLabel || a.sector || '').localeCompare(String(b.sectorLabel || b.sector || ''), 'pt-BR');
    }

    const ea = _rtFirstTimeFromRows(a.rows, 'enteredAt');
    const eb = _rtFirstTimeFromRows(b.rows, 'enteredAt');
    if (ea && eb && ea !== eb) return ea - eb;
    return String(a.lotNumber || '').localeCompare(String(b.lotNumber || ''), 'pt-BR', { numeric: true });
  };

  switch (mode || 'default') {
    case 'qty_desc':
      return (_rtSortNumber(context === 'sector' ? b.kgTotal : _rtParseKgFromQty(b.qty)) - _rtSortNumber(context === 'sector' ? a.kgTotal : _rtParseKgFromQty(a.qty))) || fallbackByFlow();
    case 'qty_asc':
      return (_rtSortNumber(context === 'sector' ? a.kgTotal : _rtParseKgFromQty(a.qty)) - _rtSortNumber(context === 'sector' ? b.kgTotal : _rtParseKgFromQty(b.qty))) || fallbackByFlow();
    case 'total_desc':
      return (_rtSortNumber(b.totalMs) - _rtSortNumber(a.totalMs)) || fallbackByFlow();
    case 'total_asc':
      return (_rtSortNumber(a.totalMs) - _rtSortNumber(b.totalMs)) || fallbackByFlow();
    case 'worked_desc':
      return (_rtSortNumber(b.workedMs) - _rtSortNumber(a.workedMs)) || fallbackByFlow();
    case 'idle_desc':
      return (_rtSortNumber(b.idleMs) - _rtSortNumber(a.idleMs)) || fallbackByFlow();
    case 'eff_desc':
      return (_rtSortNumber(b.efficiency) - _rtSortNumber(a.efficiency)) || fallbackByFlow();
    case 'eff_asc':
      return (_rtSortNumber(a.efficiency) - _rtSortNumber(b.efficiency)) || fallbackByFlow();
    case 'entrada_asc':
      return ((_rtFirstTimeFromRows(a.rows, 'enteredAt') || Number.MAX_SAFE_INTEGER) - (_rtFirstTimeFromRows(b.rows, 'enteredAt') || Number.MAX_SAFE_INTEGER)) || fallbackByFlow();
    case 'entrada_desc':
      return ((_rtFirstTimeFromRows(b.rows, 'enteredAt') || 0) - (_rtFirstTimeFromRows(a.rows, 'enteredAt') || 0)) || fallbackByFlow();
    case 'op_asc':
      return _rtSortText(a.lotNumber).localeCompare(_rtSortText(b.lotNumber), 'pt-BR', { numeric: true }) || fallbackByFlow();
    case 'pedido_asc':
      return _rtSortText(a.orderNumber).localeCompare(_rtSortText(b.orderNumber), 'pt-BR', { numeric: true }) || fallbackByFlow();
    case 'cliente_asc':
      return _rtSortText(a.client).localeCompare(_rtSortText(b.client), 'pt-BR') || fallbackByFlow();
    default:
      return fallbackByFlow();
  }
}

function _rtApplySortToLotGroups(groups) {
  return [...(groups || [])].sort((a, b) => _rtCompareByMode(a, b, _rtSortMode, 'lot'));
}

function _rtApplySortToSectorRows(rows) {
  return [...(rows || [])].sort((a, b) => _rtCompareByMode(a, b, _rtSortMode, 'sector'));
}

function _rtBuildGroupedBySectorRows(rows, alreadyDetailedSource = false) {
  const sourceRows = alreadyDetailedSource
    ? _rtFilterReportRows(Array.isArray(rows) ? rows.filter(Boolean) : [])
    : _rtBuildSectorAggregationSourceRows(rows);

  const map = new Map();

  sourceRows.forEach(r => {
    if (!r) return;
    const sectorKey = String(r.sector || r.sectorLabel || 'sem_setor').trim().toLowerCase();
    const sectorLabel = r.sectorLabel || r.sector || 'Sem setor';
    if (!map.has(sectorKey)) {
      map.set(sectorKey, {
        sector: sectorKey,
        sectorLabel,
        registros: 0,
        lotes: new Set(),
        pedidos: new Set(),
        clientes: new Set(),
        produtos: new Set(),
        kgByLot: new Map(),
        totalMs: 0,
        workedMs: 0,
        pausedMs: 0,
        idleMs: 0
      });
    }

    const item = map.get(sectorKey);
    item.registros += 1;

    const lotKey = String(r.lotNumber || r.op || r.id || '').trim();
    const pedidoKey = String(r.orderNumber || '').trim();
    const clienteKey = String(r.client || '').trim();
    const produtoKey = String(r.productCode || r.productName || '').trim();

    if (lotKey && lotKey !== '–') item.lotes.add(lotKey);
    if (pedidoKey && pedidoKey !== '–') item.pedidos.add(pedidoKey);
    if (clienteKey && clienteKey !== '–') item.clientes.add(clienteKey);
    if (produtoKey && produtoKey !== '–') item.produtos.add(produtoKey);

    // Soma kg uma vez por lote dentro do setor, para evitar duplicidade se houver linhas repetidas.
    const kg = _rtParseKgFromQty(r.qty);
    if (lotKey && kg > 0 && !item.kgByLot.has(lotKey)) {
      item.kgByLot.set(lotKey, kg);
    }

    item.totalMs += Number(r.totalMs || 0);
    item.workedMs += Number(r.workedMs || 0);
    item.pausedMs += Number(r.pausedMs || 0);
    item.idleMs += Number(r.idleMs || 0);
  });

  return Array.from(map.values()).map(item => {
    const kgTotal = Array.from(item.kgByLot.values()).reduce((a, b) => a + b, 0);
    const efficiency = item.totalMs > 0 ? Math.round((item.workedMs / item.totalMs) * 100) : 0;
    return {
      ...item,
      lotesCount: item.lotes.size,
      pedidosCount: item.pedidos.size,
      clientesCount: item.clientes.size,
      produtosCount: item.produtos.size,
      kgTotal,
      efficiency
    };
  }).sort((a, b) => {
    const order = _RT_SETORES_PIVOT.map(([k]) => k);
    const ia = order.indexOf(a.sector);
    const ib = order.indexOf(b.sector);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return String(a.sectorLabel).localeCompare(String(b.sectorLabel), 'pt-BR');
  });
}


function _rtGetSortLabel() {
  const labels = {
    default: 'Ordenação padrão',
    qty_desc: 'Maior quantidade',
    qty_asc: 'Menor quantidade',
    total_desc: 'Maior tempo total',
    total_asc: 'Menor tempo total',
    worked_desc: 'Maior trabalhado',
    idle_desc: 'Maior ociosidade',
    eff_desc: 'Maior eficiência',
    eff_asc: 'Menor eficiência',
    entrada_asc: 'Entrada mais antiga',
    entrada_desc: 'Entrada mais recente',
    op_asc: 'OP crescente',
    pedido_asc: 'Pedido crescente',
    cliente_asc: 'Cliente A-Z'
  };
  return labels[_rtSortMode] || labels.default;
}

function _rtDescribeActiveGrouping() {
  const parts = [];
  if (_rtFilters.pedido) parts.push(`pedido ${_rtFilters.pedido}`);
  if (_rtFilters.codigoProduto) parts.push(`código ${_rtFilters.codigoProduto}`);
  if (_rtFilters.nomeProduto) parts.push(`produto ${_rtFilters.nomeProduto}`);
  if (_rtFilters.cliente) parts.push(`cliente ${_rtFilters.cliente}`);
  if (_rtFilters.setor) parts.push(`setor ${_rtFilters.setor}`);
  if (_rtFilters.dataInicial || _rtFilters.dataFinal) parts.push(`período ${_rtFilters.dataInicial || 'início'} até ${_rtFilters.dataFinal || 'hoje'}`);
  return parts.length ? parts.join(' · ') : 'filtros atuais';
}

function _rtRenderRelatorioTemposGroupedBySector(area, normalized) {
  const sectorSourceRows = _rtBuildSectorAggregationSourceRows(normalized);
  const grouped = _rtApplySortToSectorRows(_rtBuildGroupedBySectorRows(sectorSourceRows, true));
  const totals = _rtCalculateTotals(grouped);
  const effTotal = totals.totalMs > 0 ? Math.round((totals.workedMs / totals.totalMs) * 100) : 0;
  const totalKg = grouped.reduce((sum, r) => sum + Number(r.kgTotal || 0), 0);
  const totalLotes = new Set(sectorSourceRows.map(r => String(r.lotNumber || '').trim()).filter(Boolean)).size;
  const totalPedidos = new Set(sectorSourceRows.map(r => String(r.orderNumber || '').trim()).filter(Boolean)).size;

  const rowsHtml = grouped.map(r => {
    const sectorColor = (typeof SECTOR_COLORS !== 'undefined' && SECTOR_COLORS[r.sector]) ? SECTOR_COLORS[r.sector] : '#60a5fa';
    const effColor = r.efficiency >= 70 ? '#4ade80' : r.efficiency >= 40 ? '#fbbf24' : r.totalMs > 0 ? '#f87171' : '#64748b';
    return `
      <tr class="rt-tr rt-tr-grouped">
        <td class="rt-td">
          <span class="rt-sector-chip" style="border-color:${sectorColor}40;color:${sectorColor}">${escapeHtml(r.sectorLabel)}</span>
        </td>
        <td class="rt-td rt-td-center">${r.pedidosCount}</td>
        <td class="rt-td rt-td-center">${r.lotesCount}</td>
        <td class="rt-td rt-td-center">${r.produtosCount}</td>
        <td class="rt-td rt-td-center">${r.kgTotal > 0 ? `${r.kgTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} Kg` : '–'}</td>
        <td class="rt-td rt-td-center" style="color:#60a5fa;font-weight:700">${rtFormatMs(r.totalMs)}</td>
        <td class="rt-td rt-td-center" style="color:#4ade80">${rtFormatMs(r.workedMs)}</td>
        <td class="rt-td rt-td-center" style="color:#fbbf24">${rtFormatMs(r.pausedMs)}</td>
        <td class="rt-td rt-td-center" style="color:#94a3b8">${rtFormatMs(r.idleMs)}</td>
        <td class="rt-td rt-td-center" style="color:${effColor};font-weight:700">${r.totalMs > 0 ? r.efficiency + '%' : '–'}</td>
      </tr>`;
  }).join('');

  const totalRow = `
    <tr class="rt-tr-totals" style="background:rgba(59,130,246,.08);font-weight:700;border-top:2px solid rgba(59,130,246,.3)">
      <td class="rt-td" style="color:var(--blue)"><i class="fas fa-sigma" style="margin-right:.4rem"></i>TOTAIS POR SETOR</td>
      <td class="rt-td rt-td-center">${totalPedidos}</td>
      <td class="rt-td rt-td-center">${totalLotes}</td>
      <td class="rt-td rt-td-center">–</td>
      <td class="rt-td rt-td-center">${totalKg > 0 ? `${totalKg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} Kg` : '–'}</td>
      <td class="rt-td rt-td-center" style="color:#60a5fa">${rtFormatMs(totals.totalMs)}</td>
      <td class="rt-td rt-td-center" style="color:#4ade80">${rtFormatMs(totals.workedMs)}</td>
      <td class="rt-td rt-td-center" style="color:#fbbf24">${rtFormatMs(totals.pausedMs)}</td>
      <td class="rt-td rt-td-center" style="color:#94a3b8">${rtFormatMs(totals.idleMs)}</td>
      <td class="rt-td rt-td-center" style="color:${effTotal >= 70 ? '#4ade80' : effTotal >= 40 ? '#fbbf24' : '#f87171'}">${totals.totalMs > 0 ? effTotal + '%' : '–'}</td>
    </tr>`;

  area.innerHTML = `
    <div class="rt-table-wrap rt-grouped-wrap">
      <div class="rt-table-meta" style="display:flex;justify-content:space-between;align-items:center;padding:.75rem 1rem;border-bottom:1px solid var(--border);font-size:.8rem;color:var(--text2);gap:1rem">
        <span><i class="fas fa-layer-group" style="color:var(--blue);margin-right:.35rem"></i>Consolidado por setor — ${escapeHtml(_rtDescribeActiveGrouping())}</span>
        <span style="color:var(--text3);font-size:.75rem">${normalized.length} linha(s) detalhada(s) agrupadas em ${grouped.length} setor(es) · ${_rtGetSortLabel()}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(160px,1fr));gap:12px;padding:1rem;border-bottom:1px solid var(--border)">
        <div class="rt-summary-card"><div class="rt-sum-body"><div class="rt-sum-val">${totalPedidos}</div><div class="rt-sum-lbl">Pedidos</div></div></div>
        <div class="rt-summary-card"><div class="rt-sum-body"><div class="rt-sum-val">${totalLotes}</div><div class="rt-sum-lbl">Lotes/OPs</div></div></div>
        <div class="rt-summary-card"><div class="rt-sum-body"><div class="rt-sum-val">${totalKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Kg</div><div class="rt-sum-lbl">Quantidade</div></div></div>
        <div class="rt-summary-card"><div class="rt-sum-body"><div class="rt-sum-val" style="color:#60a5fa">${rtFormatMs(totals.totalMs)}</div><div class="rt-sum-lbl">Tempo total</div></div></div>
        <div class="rt-summary-card"><div class="rt-sum-body"><div class="rt-sum-val" style="color:#4ade80">${rtFormatMs(totals.workedMs)}</div><div class="rt-sum-lbl">Trabalhado</div></div></div>
      </div>
      <div class="rt-table-scroll">
        <table class="rt-table">
          <thead>
            <tr>
              <th class="rt-th">Setor</th>
              <th class="rt-th rt-th-center">Pedidos</th>
              <th class="rt-th rt-th-center">Lotes/OPs</th>
              <th class="rt-th rt-th-center">Produtos</th>
              <th class="rt-th rt-th-center">Qtd</th>
              <th class="rt-th rt-th-center">Total no setor</th>
              <th class="rt-th rt-th-center">Trabalhado</th>
              <th class="rt-th rt-th-center">Pausado</th>
              <th class="rt-th rt-th-center">Ocioso</th>
              <th class="rt-th rt-th-center">Efic. %</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            ${totalRow}
          </tbody>
        </table>
      </div>
      <div style="padding:.75rem 1rem;color:var(--text3);font-size:.78rem;border-top:1px solid var(--border)">
        <i class="fas fa-info-circle"></i>
        Para ver cada lote/setor individualmente, altere a visualização para <strong>Detalhado linha a linha</strong>.
      </div>
    </div>`;
}

function _rtLotGroupKey(row) {
  return String(row?.lotNumber || row?.op || row?.id || 'sem_lote').trim() || 'sem_lote';
}

function _rtCleanLotKey(value) {
  return String(value || '')
    .trim()
    .replace(/^#/, '')
    .replace(/^OP\s*/i, '')
    .replace(/^Lote\s*/i, '')
    .trim();
}

function _rtGetLocalLotNumber(lot) {
  return _rtCleanLotKey(
    lot?.number ||
    lot?.op ||
    lot?.raw_mysql?.op ||
    lot?.raw_mysql?.pits_op ||
    lot?.numero_lote ||
    lot?.id ||
    ''
  );
}

function _rtFindLocalLotForGroup(group) {
  try {
    if (!window.STATE || !Array.isArray(STATE.lots)) return null;

    const wantedLot = _rtCleanLotKey(group?.lotNumber || group?.key || '');
    const wantedOrder = _rtCleanLotKey(group?.orderNumber || '');

    return STATE.lots.find(lot => {
      const lotNumber = _rtGetLocalLotNumber(lot);
      const orderNumber = _rtCleanLotKey(
        lot?.orderNumber ||
        lot?.numero_pedido ||
        lot?.pedido ||
        lot?.raw_mysql?.numero_pedido ||
        lot?.raw_mysql?.pits_numero ||
        ''
      );

      if (wantedLot && lotNumber && wantedLot === lotNumber) return true;
      if (wantedLot && String(lot?.id || '') === wantedLot) return true;
      if (wantedOrder && orderNumber && wantedOrder === orderNumber && lotNumber === wantedLot) return true;
      return false;
    }) || null;
  } catch (_) {
    return null;
  }
}

function _rtBuildDetailedRowsFromLocalLot(localLot, fallbackGroup) {
  if (!localLot || typeof calculateSectorTimesFromLot !== 'function') return [];

  const metrics = calculateSectorTimesFromLot(localLot) || [];
  if (!Array.isArray(metrics) || metrics.length === 0) return [];

  const lotNumber = _rtGetLocalLotNumber(localLot) || fallbackGroup?.lotNumber || fallbackGroup?.key || '–';
  const orderNumber = localLot.orderNumber || localLot.numero_pedido || localLot.pedido || localLot.raw_mysql?.numero_pedido || fallbackGroup?.orderNumber || '–';
  const productCode = localLot.productCode || localLot.produto_codigo || localLot.codigo_produto || localLot.raw_mysql?.produto_codigo || fallbackGroup?.productCode || '–';
  const productName = localLot.paint || localLot.productName || localLot.produto_nome || localLot.nome_produto || localLot.raw_mysql?.produto_nome || fallbackGroup?.productName || '–';
  const client = localLot.client || localLot.cliente || localLot.cliente_nome || localLot.raw_mysql?.cliente_nome || localLot.raw_mysql?.cliente || fallbackGroup?.client || '–';
  const rawQty = localLot.qty ?? localLot.quantidade ?? localLot.peso ?? localLot.raw_mysql?.quantidade ?? localLot.raw_mysql?.pits_peso ?? localLot.raw_mysql?.pits_qtde;
  const qty = rawQty != null && rawQty !== '' ? `${rawQty} ${localLot.unit || 'Kg'}` : (fallbackGroup?.qty || '–');
  const productLine = localLot.productType || localLot.tipo || localLot.tipo_lote || localLot.linha_produto || localLot.raw_mysql?.linha_produto || fallbackGroup?.productLine || '–';
  const lotId = localLot.id || localLot.raw_mysql?.id || lotNumber;

  return metrics.map((m, idx) => {
    const baseRow = {
      id: String(lotId || '') || `${lotNumber}_${m.sector || idx}_${idx}`,
      lotNumber,
      orderNumber,
      productCode,
      productName,
      client,
      qty,
      productLine,
      sector: m.sector || '–',
      sectorLabel: m.sectorLabel || ((typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[m.sector]) ? SECTOR_LABELS[m.sector] : (m.sector || '–')),
      enteredAt: m.enteredAt || null,
      exitAt: m.exitAt || null,
      totalMs: Math.max(0, Number(m.totalMs || 0)),
      workedMs: Math.max(0, Number(m.workedMs || 0)),
      pausedMs: Math.max(0, Number(m.pausedMs || 0)),
      idleMs: Math.max(0, Number(m.idleMs || 0)),
      efficiency: Number(m.efficiency || 0),
      _tsValid: true,
      lotStatus: m.status === 'active' ? (localLot.lotStatus || localLot.ff_lotStatus || 'working') : 'done',
      rowStatus: m.status || '',
      setor_atual: localLot.sector || localLot.stage || localLot.status || localLot.currentSector || localLot.setor_atual || localLot.raw_mysql?.setor_atual || '',
      observations: _rtUniqueTextJoin([
        _rtFirstTextValue(m, _rtObservationKeys()),
        _rtCollectLocalLotTextsForRow(localLot, m, 'obs')
      ]),
      pauseReason: _rtUniqueTextJoin([
        _rtFirstTextValue(m, _rtPauseReasonKeys()),
        _rtCollectLocalLotTextsForRow(localLot, m, 'pause')
      ]),
      _lot: localLot,
      _metric: m,
      _source: 'localModalTimeline'
    };

    return _rtApplyExpedienteToTimeRow(baseRow);
  });
}

function _rtRecalculateLotGroupTotals(group) {
  group.totalMs = 0;
  group.workedMs = 0;
  group.pausedMs = 0;
  group.idleMs = 0;

  for (const row of group.rows || []) {
    group.totalMs += Number(row.totalMs || 0);
    group.workedMs += Number(row.workedMs || 0);
    group.pausedMs += Number(row.pausedMs || 0);
    group.idleMs += Number(row.idleMs || 0);
  }
  return group;
}

function _rtBuildRowsByLot(normalized) {
  const map = new Map();

  _rtFilterReportRows(normalized || []).forEach(r => {
    const key = _rtLotGroupKey(r);
    if (!map.has(key)) {
      map.set(key, {
        key,
        lotNumber: r.lotNumber || '–',
        orderNumber: r.orderNumber || '–',
        productCode: r.productCode || '–',
        productName: r.productName || '–',
        client: r.client || '–',
        qty: r.qty || '–',
        productLine: r.productLine || '–',
        rows: [],
        totalMs: 0,
        workedMs: 0,
        pausedMs: 0,
        idleMs: 0
      });
    }

    const group = map.get(key);
    group.rows.push(r);
    group.totalMs += Number(r.totalMs || 0);
    group.workedMs += Number(r.workedMs || 0);
    group.pausedMs += Number(r.pausedMs || 0);
    group.idleMs += Number(r.idleMs || 0);
  });

  return Array.from(map.values()).map(group => {
    // CORREÇÃO INDUSCOLOR – relatório deve preferir o backend quando ele respondeu.
    // Antes, mesmo com _rtFromBackend=true, o detalhado por lote procurava o lote no
    // STATE.lots e substituía as linhas do backend pela timeline local do modal/card.
    // Isso causava divergência: o dryRun/backend mostrava ~6h57, mas a tela somava
    // ~46h32 porque estava usando dados locais antigos/corridos.
    // Agora só usa fallback local quando o backend está offline, ou se for forçado
    // manualmente no F12 com: window.RT_FORCE_LOCAL_TIMELINE = true.
    const canUseLocalTimeline = !_rtFromBackend || window.RT_FORCE_LOCAL_TIMELINE === true;
    const localLot = canUseLocalTimeline ? _rtFindLocalLotForGroup(group) : null;
    const localRows = localLot ? _rtFilterReportRows(_rtBuildDetailedRowsFromLocalLot(localLot, group)) : [];
    if (localRows.length > 0) {
      group.rows = localRows;
      group.lotNumber = localRows[0].lotNumber || group.lotNumber;
      group.orderNumber = localRows[0].orderNumber || group.orderNumber;
      group.productCode = localRows[0].productCode || group.productCode;
      group.productName = localRows[0].productName || group.productName;
      group.client = localRows[0].client || group.client;
      group.qty = localRows[0].qty || group.qty;
      group.productLine = localRows[0].productLine || group.productLine;
      group._source = 'localModalTimeline';
      _rtRecalculateLotGroupTotals(group);
    } else {
      group._source = _rtFromBackend ? 'backendRelatorioTempos' : 'localFallback';
      _rtRecalculateLotGroupTotals(group);
    }
    return group;
  }).sort((a, b) => {
    const ea = Math.min(...a.rows.map(r => Number(r.enteredAt || Infinity)));
    const eb = Math.min(...b.rows.map(r => Number(r.enteredAt || Infinity)));
    if (Number.isFinite(ea) && Number.isFinite(eb) && ea !== eb) return ea - eb;
    return String(a.lotNumber).localeCompare(String(b.lotNumber), 'pt-BR');
  });
}

function _rtToggleLotDetails(encodedKey) {
  const key = decodeURIComponent(String(encodedKey || ''));
  if (!key) return;

  // Abre somente um lote por vez. Se clicar no mesmo, recolhe.
  if (_rtExpandedLots.has(key)) {
    _rtExpandedLots.clear();
  } else {
    _rtExpandedLots.clear();
    _rtExpandedLots.add(key);
  }

  const rows = _rtFromBackend ? _rtData : _rtApplyFilters(_rtData);
  renderRelatorioTemposTable(rows);
}

function _rtExpandAllLots() {
  const rows = (_rtFromBackend ? _rtData : _rtApplyFilters(_rtData)).map(_rtNormalizeRow).filter(Boolean);
  _rtExpandedLots = new Set(_rtBuildRowsByLot(rows).map(g => g.key));
  renderRelatorioTemposTable(_rtFromBackend ? _rtData : _rtApplyFilters(_rtData));
}

function _rtCollapseAllLots() {
  _rtExpandedLots.clear();
  renderRelatorioTemposTable(_rtFromBackend ? _rtData : _rtApplyFilters(_rtData));
}

function _rtRenderDetailedByLot(area, normalized) {
  const groups = _rtApplySortToLotGroups(_rtBuildRowsByLot(normalized));
  const totals = _rtCalculateTotals(normalized);
  const shownCount = normalized.length;
  const totalLabel = `${groups.length} lote${groups.length !== 1 ? 's' : ''} / ${shownCount} registro${shownCount !== 1 ? 's' : ''}`;

  const renderDetailRows = (group) => {
    const order = typeof _RT_SETORES_PIVOT !== 'undefined' ? _RT_SETORES_PIVOT.map(([k]) => k) : [];
    const sortedRows = [...group.rows].sort((a, b) => {
      const ia = order.indexOf(String(a.sector || '').toLowerCase());
      const ib = order.indexOf(String(b.sector || '').toLowerCase());
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return Number(a.enteredAt || 0) - Number(b.enteredAt || 0);
    });

    return sortedRows.map(r => {
      const eff = Number(r.efficiency) || 0;
      const total = Number(r.totalMs) || 0;
      const effColor = eff >= 70 ? '#4ade80' : eff >= 40 ? '#fbbf24' : total > 0 ? '#f87171' : '#64748b';
      const sectorColor = (typeof SECTOR_COLORS !== 'undefined' && SECTOR_COLORS[r.sector]) ? SECTOR_COLORS[r.sector] : '#6b7280';
      const entradaHtml = r.enteredAt ? escapeHtml(rtFormatDateTime(r.enteredAt)) : '<span style="color:var(--text3)">–</span>';
      const saidaHtml = r.exitAt ? escapeHtml(rtFormatDateTime(r.exitAt)) : '<em style="color:var(--green);font-size:.75rem">Em andamento</em>';

      return `
        <tr class="rt-lot-detail-row" onclick="event.stopPropagation(); _rtOpenLotFromRow('${escapeHtml(r.id)}')">
          <td class="rt-td"></td>
          <td class="rt-td" colspan="3">
            <span class="rt-sector-chip" style="border-color:${sectorColor}40;color:${sectorColor}">${escapeHtml(r.sectorLabel || r.sector || '–')}</span>
          </td>
          <td class="rt-td rt-td-mono rt-td-sm">${entradaHtml}</td>
          <td class="rt-td rt-td-mono rt-td-sm">${saidaHtml}</td>
          <td class="rt-td rt-td-center" style="color:#60a5fa;font-weight:700">${rtFormatMs(r.totalMs)}</td>
          <td class="rt-td rt-td-center" style="color:#4ade80">${rtFormatMs(r.workedMs)}</td>
          <td class="rt-td rt-td-center" style="color:#fbbf24">${rtFormatMs(r.pausedMs)}</td>
          <td class="rt-td rt-td-center" style="color:#94a3b8">${rtFormatMs(r.idleMs)}</td>
          <td class="rt-td rt-td-center" style="color:${effColor};font-weight:700">${total > 0 ? eff + '%' : '–'}</td>
        </tr>`;
    }).join('');
  };

  const groupsHtml = groups.map(group => {
    const keyEncoded = encodeURIComponent(group.key);
    const isOpen = _rtExpandedLots.has(group.key);
    const eff = group.totalMs > 0 ? Math.round((group.workedMs / group.totalMs) * 100) : 0;
    const effColor = eff >= 70 ? '#4ade80' : eff >= 40 ? '#fbbf24' : group.totalMs > 0 ? '#f87171' : '#64748b';
    const lineType = String(group.productLine || '').toLowerCase();
    const lineLabel = (typeof PRODUCT_TYPES !== 'undefined' ? PRODUCT_TYPES[lineType] : '') || group.productLine || '–';

    return `
      <tr class="rt-tr rt-lot-summary-row ${isOpen ? 'rt-lot-open' : ''}" onclick="_rtToggleLotDetails('${keyEncoded}')" style="cursor:pointer;background:${isOpen ? 'rgba(59,130,246,.12)' : 'transparent'}">
        <td class="rt-td rt-td-mono" style="font-weight:800;color:#e5efff">
          <i class="fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" style="color:var(--blue);margin-right:.45rem"></i>${escapeHtml(group.lotNumber)}
        </td>
        <td class="rt-td rt-td-mono">${escapeHtml(group.orderNumber)}</td>
        <td class="rt-td rt-td-mono">${escapeHtml(group.productCode)}</td>
        <td class="rt-td">${escapeHtml(group.productName)}</td>
        <td class="rt-td">${escapeHtml(group.client)}</td>
        <td class="rt-td rt-td-center">${escapeHtml(String(group.qty))}</td>
        <td class="rt-td"><span class="product-type-badge type-${escapeHtml(lineType)}">${escapeHtml(lineLabel)}</span></td>
        <td class="rt-td rt-td-center" style="color:#60a5fa;font-weight:700">${rtFormatMs(group.totalMs)}</td>
        <td class="rt-td rt-td-center" style="color:#4ade80">${rtFormatMs(group.workedMs)}</td>
        <td class="rt-td rt-td-center" style="color:#fbbf24">${rtFormatMs(group.pausedMs)}</td>
        <td class="rt-td rt-td-center" style="color:#94a3b8">${rtFormatMs(group.idleMs)}</td>
        <td class="rt-td rt-td-center" style="color:${effColor};font-weight:700">${group.totalMs > 0 ? eff + '%' : '–'}</td>
      </tr>
      ${isOpen ? renderDetailRows(group) : ''}`;
  }).join('');

  const totalEff = totals.totalMs > 0 && totals.workedMs > 0 ? Math.round((totals.workedMs / totals.totalMs) * 100) : 0;
  const totalEffColor = totalEff >= 70 ? '#4ade80' : totalEff >= 40 ? '#fbbf24' : totals.totalMs > 0 ? '#f87171' : '#64748b';

  const totalRow = `
    <tr class="rt-tr-totals" style="background:rgba(59,130,246,.08);font-weight:700;border-top:2px solid rgba(59,130,246,.3)">
      <td class="rt-td" colspan="7" style="color:var(--blue);letter-spacing:.03em">
        <i class="fas fa-sigma" style="margin-right:.4rem"></i>TOTAIS (${groups.length} lote${groups.length !== 1 ? 's' : ''})
      </td>
      <td class="rt-td rt-td-center" style="color:#60a5fa">${rtFormatMs(totals.totalMs)}</td>
      <td class="rt-td rt-td-center" style="color:#4ade80">${rtFormatMs(totals.workedMs)}</td>
      <td class="rt-td rt-td-center" style="color:#fbbf24">${rtFormatMs(totals.pausedMs)}</td>
      <td class="rt-td rt-td-center" style="color:#94a3b8">${rtFormatMs(totals.idleMs)}</td>
      <td class="rt-td rt-td-center" style="color:${totalEffColor}">${totals.totalMs > 0 ? totalEff + '%' : '–'}</td>
    </tr>`;

  area.innerHTML = `
    <div class="rt-table-wrap rt-lot-accordion-wrap">
      <div class="rt-table-meta" style="display:flex;justify-content:space-between;align-items:center;padding:.6rem 1rem;border-bottom:1px solid var(--border);font-size:.8rem;color:var(--text2);gap:1rem">
        <span><i class="fas fa-list" style="color:var(--blue);margin-right:.35rem"></i>${totalLabel} · ${_rtGetSortLabel()}</span>
        <span style="display:flex;gap:.5rem;align-items:center">
          <button class="btn btn-secondary" style="padding:.35rem .7rem;font-size:.75rem" onclick="_rtExpandAllLots()"><i class="fas fa-expand-alt"></i> Expandir todos</button>
          <button class="btn btn-secondary" style="padding:.35rem .7rem;font-size:.75rem" onclick="_rtCollapseAllLots()"><i class="fas fa-compress-alt"></i> Recolher</button>
        </span>
      </div>
      <div style="padding:.65rem 1rem;color:var(--text3);font-size:.78rem;border-bottom:1px solid var(--border)">
        <i class="fas fa-info-circle"></i>
        Clique em uma OP/lote para abrir somente os setores daquele lote. Clique novamente para recolher.
      </div>
      <div class="rt-table-scroll">
        <table class="rt-table">
          <thead>
            <tr>
              <th class="rt-th">OP / Lote</th>
              <th class="rt-th">Pedido</th>
              <th class="rt-th">Cód. Produto</th>
              <th class="rt-th">Nome do Produto</th>
              <th class="rt-th">Cliente</th>
              <th class="rt-th rt-th-center">Qtd</th>
              <th class="rt-th">Linha</th>
              <th class="rt-th rt-th-center">Total</th>
              <th class="rt-th rt-th-center">Trabalhado</th>
              <th class="rt-th rt-th-center">Pausado</th>
              <th class="rt-th rt-th-center">Ocioso</th>
              <th class="rt-th rt-th-center">Efic. %</th>
            </tr>
          </thead>
          <tbody>
            ${groupsHtml}
            ${totalRow}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderRelatorioTemposTable(rows) {
  const area = document.getElementById('rtTableArea');
  if (!area) return;

  if (!rows || rows.length === 0) {
    area.innerHTML = `
      <div class="rt-empty-state">
        <i class="fas fa-search"></i>
        <p>Nenhum registro encontrado para os filtros informados.</p>
      </div>`;
    return;
  }

  // Normaliza todas as linhas para o formato interno unificado
  const normalized = _rtFilterReportRows(rows.map(_rtNormalizeRow).filter(Boolean));

  if (_rtShouldRenderGroupedBySector(normalized)) {
    _rtRenderRelatorioTemposGroupedBySector(area, normalized);
    return;
  }

  _rtRenderDetailedByLot(area, normalized);
}

/**
 * Calcula totais gerais (total, worked, paused, idle) de um array de linhas normalizadas.
 * Ignora registros com dados quebrados (_tsValid === false e totalMs === 0).
 * Suporta tanto campos numéricos (ms) quanto strings formatadas ("3h", "2h 8min", "< 1min", "–").
 */
function _rtCalculateTotals(rows) {
  const parseFmtMs = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const s = String(val).trim();
    if (s === '–' || s === '-' || s === '') return 0;
    if (s === '< 1min') return 30000; // 30 segundos como estimativa conservadora
    // "Xh Ymin" ou "Xh" ou "Ymin"
    const hMatch = s.match(/(\d+)\s*h/);
    const mMatch = s.match(/(\d+)\s*min/);
    const h = hMatch ? parseInt(hMatch[1], 10) : 0;
    const m = mMatch ? parseInt(mMatch[1], 10) : 0;
    return (h * 60 + m) * 60000;
  };

  let totalMs = 0, workedMs = 0, pausedMs = 0, idleMs = 0;
  rows.forEach(r => {
    totalMs  += typeof r.totalMs  === 'number' ? (r.totalMs  || 0) : parseFmtMs(r.totalMs);
    workedMs += typeof r.workedMs === 'number' ? (r.workedMs || 0) : parseFmtMs(r.workedMs);
    pausedMs += typeof r.pausedMs === 'number' ? (r.pausedMs || 0) : parseFmtMs(r.pausedMs);
    idleMs   += typeof r.idleMs   === 'number' ? (r.idleMs   || 0) : parseFmtMs(r.idleMs);
  });
  return { totalMs, workedMs, pausedMs, idleMs };
}

/** Abre o detalhe do lote ao clicar em uma linha da tabela */
function _rtOpenLotFromRow(lotId) {
  if (!lotId) return;
  // Tenta abrir via id_lote (campo do backend) ou via STATE.lots
  if (typeof openLotDetail === 'function') {
    openLotDetail(lotId);
  }
}

// ─────────────────────────────────────────────────────────────────
// PIVOT: AGRUPA LINHAS POR OP/LOTE ABRINDO SETORES EM COLUNAS
// ─────────────────────────────────────────────────────────────────

/**
 * Lista canônica de setores para colunas do Excel/PDF.
 * Ordem fixa: PCP Liberação → ... → Entrega.
 */
const _RT_SETORES_PIVOT = [
  ['pcp_liberacao',        'PCP Liberação'],
  ['pesagem',              'Pesagem'],
  ['producao',             'Produção'],
  ['moagem',               'Moagem'],
  ['laboratorio_revisao',  'Laboratório Revisão'],
  ['coloracao_revisao',    'Coloração Revisão'],
  ['laboratorio_amostras', 'Laboratório Amostras'],
  ['coloracao_amostras',   'Coloração Amostras'],
  ['laboratorio',          'Laboratório'],
  ['coloracao',            'Coloração'],
  ['envase_produzir',      'Envase Produzir'],
  ['envase_enlatamento',   'Envase Enlatamento'],
  ['pronto',               'Pronto para Entrega'],
  ['entrega',              'Entrega']
];

/**
 * Recebe linhas já normalizadas (_rtNormalizeRow) e devolve um array
 * com UMA linha por OP/lote. Cada linha contém:
 *   – colunas gerais (lotNumber, client, totais…)
 *   – colunas por setor (enteredAt, exitAt, ms, eficiência…)
 *   – campo _resumoSetores (string multi-linha para o PDF)
 */
function buildRelatorioTemposPivotRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const map = new Map();

  rows.forEach(r => {
    if (!r) return;
    const key = String(r.lotNumber || r.op || '').trim();
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, {
        lotNumber:    r.lotNumber    || '–',
        orderNumber:  r.orderNumber  || '–',
        productCode:  r.productCode  || '–',
        productName:  r.productName  || '–',
        client:       r.client       || '–',
        qty:          r.qty          || '–',
        productLine:  r.productLine  || '–',
        lotStatus:    r.lotStatus    || '–',
        setorAtual:   r.setor_atual  || r.sectorLabel || r.sector || '–',
        totalGeralMs: 0,
        workedGeralMs:0,
        pausedGeralMs:0,
        idleGeralMs:  0,
        setores:      {}
      });
    }

    const item = map.get(key);
    item.totalGeralMs  += Number(r.totalMs)  || 0;
    item.workedGeralMs += Number(r.workedMs) || 0;
    item.pausedGeralMs += Number(r.pausedMs) || 0;
    item.idleGeralMs   += Number(r.idleMs)   || 0;

    // Chave do setor: normaliza para minúsculo sem acentos simples
    const setorKey = String(r.sector || '').trim().toLowerCase();
    if (setorKey) {
      item.setores[setorKey] = {
        label:      r.sectorLabel || r.sector || setorKey,
        enteredAt:  r.enteredAt,
        exitAt:     r.exitAt,
        totalMs:    Number(r.totalMs)    || 0,
        workedMs:   Number(r.workedMs)   || 0,
        pausedMs:   Number(r.pausedMs)   || 0,
        idleMs:     Number(r.idleMs)     || 0,
        efficiency: Number(r.efficiency) || 0
      };
    }
  });

  return Array.from(map.values()).map(item => {
    const effGeral = item.totalGeralMs > 0
      ? Math.round((item.workedGeralMs / item.totalGeralMs) * 100)
      : 0;

    const row = {
      'OP/Lote':            item.lotNumber,
      'Pedido':             item.orderNumber,
      'Código do Produto':  item.productCode,
      'Nome do Produto':    item.productName,
      'Cliente':            item.client,
      'Quantidade':         item.qty,
      'Linha do Produto':   item.productLine,
      'Status Atual':       item.lotStatus,
      'Setor Atual':        item.setorAtual,
      'Total Geral':        rtFormatMs(item.totalGeralMs),
      'Trabalhado Geral':   rtFormatMs(item.workedGeralMs),
      'Pausado Geral':      rtFormatMs(item.pausedGeralMs),
      'Ocioso Geral':       rtFormatMs(item.idleGeralMs),
      'Eficiência Geral %': item.totalGeralMs > 0 ? `${effGeral}%` : '–',
      _resumoSetores:       ''
    };

    const resumoPartes = [];

    _RT_SETORES_PIVOT.forEach(([sKey, sLabel]) => {
      const s = item.setores[sKey];
      // Para timestamps: só exibe se válido (sem saída < entrada)
      const entradaStr = s && s.enteredAt ? rtFormatDateTime(s.enteredAt) : '';
      const saidaStr   = s
        ? (s.exitAt ? rtFormatDateTime(s.exitAt) : (s.totalMs > 0 ? 'Em andamento' : ''))
        : '';
      row[`${sLabel} Entrada`]      = entradaStr;
      row[`${sLabel} Saída`]        = saidaStr;
      row[`${sLabel} Total`]        = s && s.totalMs  > 0 ? rtFormatMs(s.totalMs)            : '';
      row[`${sLabel} Trabalhado`]   = s && s.totalMs  > 0 ? rtFormatMs(s.workedMs)           : '';
      row[`${sLabel} Pausado`]      = s && s.totalMs  > 0 ? rtFormatMs(s.pausedMs)           : '';
      row[`${sLabel} Ocioso`]       = s && s.totalMs  > 0 ? rtFormatMs(s.idleMs)             : '';
      row[`${sLabel} Eficiência %`] = s && s.totalMs  > 0 ? `${s.efficiency}%`               : '';

      if (s && s.totalMs > 0) {
        resumoPartes.push(
          `${sLabel}: Total ${rtFormatMs(s.totalMs)} | Trab. ${rtFormatMs(s.workedMs)} | Paus. ${rtFormatMs(s.pausedMs)} | Ocioso ${rtFormatMs(s.idleMs)}`
        );
      }
    });

    row._resumoSetores = resumoPartes.join('\n');
    return row;
  });
}


// ─────────────────────────────────────────────────────────────────
// PDF: MÉDIA DE TEMPO TRABALHADO POR CÓDIGO/SETOR
// ─────────────────────────────────────────────────────────────────

/**
 * Normaliza chaves de setor para bater com a lista _RT_SETORES_PIVOT.
 * Mantém compatibilidade com variações de label vindas do backend/frontend.
 */
function _rtNormalizeSectorKeyForAverage(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const clean = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[–—-]+/g, '_')
    .replace(/[()]/g, '')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');

  const aliases = {
    pcp: 'pcp_liberacao',
    pcp_liberacao: 'pcp_liberacao',
    'pcp_lib': 'pcp_liberacao',
    pesagem: 'pesagem',
    producao: 'producao',
    produção: 'producao',
    moagem: 'moagem',
    laboratorio_revisao: 'laboratorio_revisao',
    lab_revisao: 'laboratorio_revisao',
    coloracao_revisao: 'coloracao_revisao',
    coloracao_rev: 'coloracao_revisao',
    laboratorio_amostras: 'laboratorio_amostras',
    laboratorio_amostra: 'laboratorio_amostras',
    coloracao_amostras: 'coloracao_amostras',
    coloracao_amostra: 'coloracao_amostras',
    laboratorio: 'laboratorio',
    lab: 'laboratorio',
    coloracao: 'coloracao',
    color: 'coloracao',
    envase: 'envase_enlatamento',
    envase_produzir: 'envase_produzir',
    envase_enlatamento: 'envase_enlatamento',
    enlatamento: 'envase_enlatamento',
    pronto: 'pronto',
    pronto_para_entrega: 'pronto',
    entrega: 'entrega',
    entregue: 'entrega'
  };

  return aliases[clean] || clean;
}

/**
 * Agrupa linhas por código do produto e calcula a média de TEMPO TRABALHADO
 * por setor. Usado somente no PDF analítico.
 *
 * Retorno:
 * [
 *   {
 *     productCode, productName, qtdLotes, registrosUsados,
 *     setores: { pesagem: { count, workedAvgMs, workedTotalMs } }
 *   }
 * ]
 */
function buildRelatorioTemposMediaPorCodigo(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const map = new Map();

  rows.forEach(raw => {
    const r = _rtNormalizeRow(raw);
    if (!r) return;

    const productCode = String(r.productCode || '').trim();
    if (!productCode || productCode === '–') return;

    const sectorKey = _rtNormalizeSectorKeyForAverage(r.sector || r.sectorLabel);
    if (!sectorKey) return;

    if (!map.has(productCode)) {
      map.set(productCode, {
        productCode,
        productName: r.productName || '–',
        lotes: new Set(),
        registrosUsados: 0,
        setores: {}
      });
    }

    const item = map.get(productCode);
    if ((!item.productName || item.productName === '–') && r.productName) {
      item.productName = r.productName;
    }

    const lotKey = String(r.lotNumber || r.op || '').trim();
    if (lotKey && lotKey !== '–') item.lotes.add(lotKey);

    if (!item.setores[sectorKey]) {
      item.setores[sectorKey] = {
        count: 0,
        workedTotalMs: 0,
        workedAvgMs: 0
      };
    }

    const workedMs = Math.max(0, Number(r.workedMs) || 0);
    item.setores[sectorKey].count += 1;
    item.setores[sectorKey].workedTotalMs += workedMs;
    item.registrosUsados += 1;
  });

  return Array.from(map.values())
    .map(item => {
      Object.keys(item.setores).forEach(sectorKey => {
        const s = item.setores[sectorKey];
        s.workedAvgMs = s.count > 0 ? Math.round(s.workedTotalMs / s.count) : 0;
      });

      return {
        productCode: item.productCode,
        productName: item.productName || '–',
        qtdLotes: item.lotes.size,
        registrosUsados: item.registrosUsados,
        setores: item.setores
      };
    })
    .sort((a, b) => String(a.productCode).localeCompare(String(b.productCode), 'pt-BR', { numeric: true }));
}

// ─────────────────────────────────────────────────────────────────
// EXPORTAÇÃO
// ─────────────────────────────────────────────────────────────────

/**
 * Exporta relatório para Excel (XLSX pivot por OP/lote).
 * Cada OP/lote = 1 linha; setores = colunas.
 * Formato de download: HTML reconhecido pelo Excel (.xls), sem fallback —
 * funciona em qualquer navegador, sem depender de biblioteca externa.
 * (O fallback CSV real do Relatório de Tempos existe para a exportação em PDF,
 * ver exportRelatorioTemposCSV/exportRelatorioTemposPDF mais abaixo.)
 */

function _rtExportEscape(value) {
  if (typeof escapeHtml === 'function') return escapeHtml(String(value ?? ''));
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function _rtSectorColorForExport(sector, label = '') {
  const raw = String(sector || label || '').trim();
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[–—-]+/g, '_')
    .replace(/[()]/g, '')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');

  const aliases = {
    pcp: 'pcp_liberacao',
    pcp_liberacao: 'pcp_liberacao',
    pesagem: 'pesagem',
    producao: 'producao',
    moagem: 'moagem',
    laboratorio_revisao: 'laboratorio_revisao',
    laboratorio_amostras: 'laboratorio_amostras',
    laboratorio: 'laboratorio',
    coloracao_revisao: 'coloracao_revisao',
    coloracao_amostras: 'coloracao_amostras',
    coloracao: 'coloracao',
    envase: 'envase_enlatamento',
    envase_produzir: 'envase_produzir',
    envase_enlatamento: 'envase_enlatamento',
    enlatamento: 'envase_enlatamento',
    pronto: 'pronto',
    pronto_para_entrega: 'pronto',
    entrega: 'entrega',
    entregue: 'entrega'
  };

  const normalized = aliases[key] || key;
  const fromMap = (typeof SECTOR_COLORS !== 'undefined' && SECTOR_COLORS)
    ? (SECTOR_COLORS[normalized] || SECTOR_COLORS[raw] || '')
    : '';

  const fallback = {
    pcp_liberacao: '#ff3b5c',
    pesagem: '#3b82f6',
    producao: '#8b5cf6',
    moagem: '#6366f1',
    laboratorio_revisao: '#14b8a6',
    laboratorio_amostras: '#14b8a6',
    laboratorio: '#00bfa6',
    coloracao_revisao: '#d946ef',
    coloracao_amostras: '#facc15',
    coloracao: '#f59e0b',
    envase_produzir: '#f97316',
    envase_enlatamento: '#0ea5e9',
    pronto: '#22c55e',
    entrega: '#64748b'
  };

  const color = String(fromMap || fallback[normalized] || '#3b82f6').trim();
  return color.startsWith('#') ? color : '#3b82f6';
}

function _rtExportFiltersTitle() {
  const parts = [];
  if (_rtFilters.opLote) parts.push(`OP/Lote: ${_rtFilters.opLote}`);
  if (_rtFilters.pedido) parts.push(`Pedido: ${_rtFilters.pedido}`);
  if (_rtFilters.codigoProduto) parts.push(`Código: ${_rtFilters.codigoProduto}`);
  if (_rtFilters.nomeProduto) parts.push(`Produto: ${_rtFilters.nomeProduto}`);
  if (_rtFilters.cliente) parts.push(`Cliente: ${_rtFilters.cliente}`);
  if (_rtFilters.setor) parts.push(`Setor: ${_rtFilters.setor}`);
  if (_rtFilters.dataInicial || _rtFilters.dataFinal) parts.push(`Período: ${_rtFilters.dataInicial || 'início'} até ${_rtFilters.dataFinal || 'hoje'}`);
  return parts.length ? parts.join(' | ') : 'Sem filtros específicos';
}

function _rtExportWorkbookHtml(title, subtitle, bodyHtml) {
  const generatedAt = new Date().toLocaleString('pt-BR');
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; color:#0f172a; }
  .title { font-size:20px; font-weight:800; color:#0f172a; margin-bottom:4px; }
  .subtitle { font-size:12px; color:#475569; margin-bottom:4px; }
  .generated { font-size:11px; color:#64748b; margin-bottom:14px; }
  table { border-collapse: collapse; margin-bottom:22px; width:100%; }
  th { background:#1d4ed8; color:#ffffff; font-weight:700; border:1px solid #bfdbfe; padding:8px; text-align:center; font-size:12px; }
  td { border:1px solid #dbeafe; padding:7px; font-size:12px; vertical-align:middle; }
  .text { mso-number-format:"\\@"; }
  .sector { color:#ffffff; font-weight:800; text-align:center; border-radius:4px; }
  .num { text-align:center; }
  .time-total { color:#2563eb; font-weight:800; text-align:center; }
  .time-work { color:#16a34a; font-weight:800; text-align:center; }
  .time-pause { color:#d97706; font-weight:800; text-align:center; }
  .time-idle { color:#64748b; font-weight:800; text-align:center; }
  .eff { font-weight:800; text-align:center; }
  .total-row td { background:#dbeafe; font-weight:800; border-top:2px solid #2563eb; }
  .lot-title { background:#0f172a; color:#ffffff; font-size:14px; font-weight:800; padding:9px; }
  .lot-info { background:#e0f2fe; color:#0f172a; font-size:12px; padding:7px; }
</style>
</head>
<body>
  <div class="title">${_rtExportEscape(title)}</div>
  <div class="subtitle">${_rtExportEscape(subtitle || '')}</div>
  <div class="generated">Gerado em: ${_rtExportEscape(generatedAt)}</div>
  ${bodyHtml}
</body>
</html>`;
}

function _rtDownloadHtmlExcel(html, filename) {
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _rtExportConsolidadoPorSetor(normalized) {
  const sectorSourceRows = _rtBuildSectorAggregationSourceRows(normalized);
  const grouped = _rtApplySortToSectorRows(_rtBuildGroupedBySectorRows(sectorSourceRows, true));
  if (!grouped.length) {
    showToast('Não há dados consolidados para exportar.', 'info');
    return;
  }

  const totals = _rtCalculateTotals(grouped);
  const totalKg = grouped.reduce((sum, r) => sum + Number(r.kgTotal || 0), 0);
  const totalPedidos = new Set(sectorSourceRows.map(r => String(r.orderNumber || '').trim()).filter(Boolean)).size;
  const totalLotes = new Set(sectorSourceRows.map(r => String(r.lotNumber || '').trim()).filter(Boolean)).size;
  const totalProdutos = new Set(sectorSourceRows.map(r => String(r.productCode || r.productName || '').trim()).filter(Boolean)).size;
  const effTotal = totals.totalMs > 0 ? Math.round((totals.workedMs / totals.totalMs) * 100) : 0;

  const rowsHtml = grouped.map(r => {
    const color = _rtSectorColorForExport(r.sector, r.sectorLabel);
    const effColor = r.efficiency >= 70 ? '#16a34a' : r.efficiency >= 40 ? '#d97706' : '#dc2626';
    return `
      <tr>
        <td class="sector" style="background:${color}">${_rtExportEscape(r.sectorLabel)}</td>
        <td class="num">${r.pedidosCount}</td>
        <td class="num">${r.lotesCount}</td>
        <td class="num">${r.produtosCount}</td>
        <td class="num">${r.kgTotal > 0 ? r.kgTotal.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' Kg' : '-'}</td>
        <td class="time-total">${_rtExportEscape(rtFormatMs(r.totalMs))}</td>
        <td class="time-work">${_rtExportEscape(rtFormatMs(r.workedMs))}</td>
        <td class="time-pause">${_rtExportEscape(rtFormatMs(r.pausedMs))}</td>
        <td class="time-idle">${_rtExportEscape(rtFormatMs(r.idleMs))}</td>
        <td class="eff" style="color:${effColor}">${r.totalMs > 0 ? r.efficiency + '%' : '-'}</td>
      </tr>`;
  }).join('');

  const bodyHtml = `
    <table>
      <thead>
        <tr>
          <th>Setor</th>
          <th>Pedidos</th>
          <th>Lotes/OPs</th>
          <th>Produtos</th>
          <th>Qtd</th>
          <th>Total no setor</th>
          <th>Trabalhado</th>
          <th>Pausado</th>
          <th>Ocioso</th>
          <th>Eficiência</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row">
          <td>TOTAIS POR SETOR</td>
          <td class="num">${totalPedidos}</td>
          <td class="num">${totalLotes}</td>
          <td class="num">${totalProdutos || '-'}</td>
          <td class="num">${totalKg > 0 ? totalKg.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' Kg' : '-'}</td>
          <td class="time-total">${_rtExportEscape(rtFormatMs(totals.totalMs))}</td>
          <td class="time-work">${_rtExportEscape(rtFormatMs(totals.workedMs))}</td>
          <td class="time-pause">${_rtExportEscape(rtFormatMs(totals.pausedMs))}</td>
          <td class="time-idle">${_rtExportEscape(rtFormatMs(totals.idleMs))}</td>
          <td class="eff">${totals.totalMs > 0 ? effTotal + '%' : '-'}</td>
        </tr>
      </tbody>
    </table>`;

  const html = _rtExportWorkbookHtml(
    'Relatório de Tempos — Consolidado por Setor',
    _rtExportFiltersTitle(),
    bodyHtml
  );

  _rtDownloadHtmlExcel(html, `relatorio-tempos-consolidado-setor-${_rtDateStr()}.xls`);
  showToast(`Excel exportado em tabela vertical por setor! ${grouped.length} setor(es).`, 'success');
}

function _rtBuildLotGroupsForExport(normalized) {
  // Usa a MESMA base do detalhado na tela (_rtBuildRowsByLot).
  // Correção: antes a exportação montava grupos novamente a partir das linhas cruas
  // e podia perder setores/usar ordem diferente do accordion. Agora o Excel exporta
  // exatamente os setores disponíveis para cada OP/lote, incluindo registros com
  // trabalhado zerado, revisões, PCP, pesagem, produção, laboratório e envase.
  const groups = (typeof _rtBuildRowsByLot === 'function')
    ? _rtBuildRowsByLot(normalized)
    : [];

  if (Array.isArray(groups) && groups.length > 0) {
    const exportGroups = groups.map(group => {
      const cloned = {
        lotNumber: group.lotNumber || group.key || '–',
        orderNumber: group.orderNumber || '–',
        productCode: group.productCode || '–',
        productName: group.productName || '–',
        client: group.client || '–',
        qty: group.qty || '–',
        productLine: group.productLine || '–',
        rows: _rtFilterReportRows(Array.isArray(group.rows) ? [...group.rows] : []),
        totalMs: 0,
        workedMs: 0,
        pausedMs: 0,
        idleMs: 0
      };

      cloned.rows.sort((a, b) => {
        const aIn = Number(a.enteredAt || 0);
        const bIn = Number(b.enteredAt || 0);
        if (aIn !== bIn) return aIn - bIn;
        const aOut = Number(a.exitAt || 0);
        const bOut = Number(b.exitAt || 0);
        if (aOut !== bOut) return aOut - bOut;
        const order = (typeof _RT_SETORES_PIVOT !== 'undefined' ? _RT_SETORES_PIVOT : []).map(([k]) => k);
        const ia = order.indexOf(String(a.sector || '').toLowerCase());
        const ib = order.indexOf(String(b.sector || '').toLowerCase());
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });

      for (const row of cloned.rows) {
        cloned.totalMs += Number(row.totalMs || 0);
        cloned.workedMs += Number(row.workedMs || 0);
        cloned.pausedMs += Number(row.pausedMs || 0);
        cloned.idleMs += Number(row.idleMs || 0);
      }

      cloned.efficiency = cloned.totalMs > 0 ? Math.round((cloned.workedMs / cloned.totalMs) * 100) : 0;
      return cloned;
    });

    return _rtApplySortToLotGroups(exportGroups);
  }

  // Fallback antigo, usado apenas se _rtBuildRowsByLot não existir por algum motivo.
  const map = new Map();

  _rtFilterReportRows(normalized).forEach(r => {
    if (!r) return;
    const key = String(r.lotNumber || r.op || r.id || '').trim() || `sem-lote-${map.size + 1}`;
    if (!map.has(key)) {
      map.set(key, {
        lotNumber: r.lotNumber || '–',
        orderNumber: r.orderNumber || '–',
        productCode: r.productCode || '–',
        productName: r.productName || '–',
        client: r.client || '–',
        qty: r.qty || '–',
        productLine: r.productLine || '–',
        rows: [],
        totalMs: 0,
        workedMs: 0,
        pausedMs: 0,
        idleMs: 0
      });
    }
    const item = map.get(key);
    item.rows.push(r);
    item.totalMs += Number(r.totalMs || 0);
    item.workedMs += Number(r.workedMs || 0);
    item.pausedMs += Number(r.pausedMs || 0);
    item.idleMs += Number(r.idleMs || 0);
  });

  const fallbackGroups = Array.from(map.values()).map(item => {
    item.rows.sort((a, b) => Number(a.enteredAt || 0) - Number(b.enteredAt || 0));
    item.efficiency = item.totalMs > 0 ? Math.round((item.workedMs / item.totalMs) * 100) : 0;
    return item;
  });

  return _rtApplySortToLotGroups(fallbackGroups);
}

function _rtExportDetalhadoPorLote(normalized) {
  const lots = _rtBuildLotGroupsForExport(normalized);
  if (!lots.length) {
    showToast('Não há lotes para exportar.', 'info');
    return;
  }

  const sections = lots.map(lot => {
    const effColor = lot.efficiency >= 70 ? '#16a34a' : lot.efficiency >= 40 ? '#d97706' : '#dc2626';
    const rowsHtml = lot.rows.map(r => {
      const color = _rtSectorColorForExport(r.sector, r.sectorLabel);
      const rowEff = Number(r.efficiency || 0);
      const rowEffColor = rowEff >= 70 ? '#16a34a' : rowEff >= 40 ? '#d97706' : '#dc2626';
      return `
        <tr>
          <td class="sector" style="background:${color}">${_rtExportEscape(r.sectorLabel || r.sector || '–')}</td>
          <td class="num text">${_rtExportEscape(r.enteredAt ? rtFormatDateTime(r.enteredAt) : '–')}</td>
          <td class="num text">${_rtExportEscape(r.exitAt ? rtFormatDateTime(r.exitAt) : 'Em andamento')}</td>
          <td class="time-total">${_rtExportEscape(rtFormatMs(r.totalMs))}</td>
          <td class="time-work">${_rtExportEscape(rtFormatMs(r.workedMs))}</td>
          <td class="time-pause">${_rtExportEscape(rtFormatMs(r.pausedMs))}</td>
          <td class="time-idle">${_rtExportEscape(rtFormatMs(r.idleMs))}</td>
          <td class="eff" style="color:${rowEffColor}">${r.totalMs > 0 ? rowEff + '%' : '-'}</td>
          <td class="text">${_rtExportEscape(r.observations || '–')}</td>
          <td class="text">${_rtExportEscape(r.pauseReason || '–')}</td>
        </tr>`;
    }).join('');

    return `
      <table>
        <tbody>
          <tr><td colspan="10" class="lot-title">LOTE ${_rtExportEscape(lot.lotNumber)} — Pedido ${_rtExportEscape(lot.orderNumber)}</td></tr>
          <tr><td colspan="10" class="lot-info">
            Código: <span class="text">${_rtExportEscape(lot.productCode)}</span> &nbsp; | &nbsp;
            Produto: ${_rtExportEscape(lot.productName)} &nbsp; | &nbsp;
            Cliente: ${_rtExportEscape(lot.client)} &nbsp; | &nbsp;
            Qtd: ${_rtExportEscape(lot.qty)} &nbsp; | &nbsp;
            Linha: ${_rtExportEscape(lot.productLine)}
          </td></tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>Setor</th>
            <th>Entrada</th>
            <th>Saída</th>
            <th>Total no setor</th>
            <th>Trabalhado</th>
            <th>Pausado</th>
            <th>Ocioso</th>
            <th>Eficiência</th>
            <th>Observações</th>
            <th>Motivo de pausa</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="total-row">
            <td>TOTAL DO LOTE</td>
            <td></td>
            <td></td>
            <td class="time-total">${_rtExportEscape(rtFormatMs(lot.totalMs))}</td>
            <td class="time-work">${_rtExportEscape(rtFormatMs(lot.workedMs))}</td>
            <td class="time-pause">${_rtExportEscape(rtFormatMs(lot.pausedMs))}</td>
            <td class="time-idle">${_rtExportEscape(rtFormatMs(lot.idleMs))}</td>
            <td class="eff" style="color:${effColor}">${lot.totalMs > 0 ? lot.efficiency + '%' : '-'}</td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>`;
  }).join('<br>');

  const html = _rtExportWorkbookHtml(
    lots.length === 1 ? `Relatório de Tempos — Lote ${lots[0].lotNumber}` : 'Relatório de Tempos — Detalhado por Lotes',
    _rtExportFiltersTitle(),
    sections
  );

  _rtDownloadHtmlExcel(html, `relatorio-tempos-detalhado-lotes-${_rtDateStr()}.xls`);
  showToast(`Excel detalhado exportado! ${lots.length} lote(s).`, 'success');
}

/**
 * Exporta relatório para Excel com o mesmo raciocínio da tela.
 * - Consolidado por setor: tabela vertical, setor na primeira coluna e cores por setor.
 * - Detalhado linha a linha: lista por lote, com título do lote e tabela vertical de setores.
 *
 * Observação: CSV não suporta cores/estilos. Por isso, para manter cores e título,
 * o download é feito em formato Excel HTML (.xls), que o Excel abre como planilha.
 */
function exportRelatorioTemposExcel() {
  const rawRows = _rtFromBackend ? _rtData : _rtApplyFilters(_rtData);
  const normalized = _rtFilterReportRows(rawRows.map(_rtNormalizeRow).filter(Boolean));

  if (normalized.length === 0) {
    showToast('Nenhum dado para exportar. Execute a busca primeiro.', 'info');
    return;
  }

  const shouldExportGrouped = _rtShouldRenderGroupedBySector(normalized) || _rtViewMode === 'grouped';

  if (shouldExportGrouped) {
    _rtExportConsolidadoPorSetor(normalized);
    return;
  }

  _rtExportDetalhadoPorLote(normalized);
}

/**
 * Exporta relatório para PDF (jsPDF + autoTable).
 * Formato: tabela por OP/lote com colunas essenciais + resumo geral no topo.
 * Faz download direto — nunca abre nova aba nem chama window.print().
 * Se jsPDF/autoTable não existirem, ou se a geração do PDF falhar por
 * qualquer motivo, aciona o fallback real em CSV (exportRelatorioTemposCSV).
 */
function exportRelatorioTemposPDF() {
  const rawRows    = _rtFromBackend ? _rtData : _rtApplyFilters(_rtData);
  const normalized = _rtFilterReportRows(rawRows.map(_rtNormalizeRow).filter(Boolean));

  if (normalized.length === 0) {
    showToast('Nenhum dado para exportar. Execute a busca primeiro.', 'info');
    return;
  }

  // ── Verifica se jsPDF + autoTable estão disponíveis ──
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF)
                 || (window.jsPDF)
                 || null;

  if (!jsPDFCtor) {
    showToast('Biblioteca de PDF não encontrada. Exportando em CSV no lugar.', 'error');
    exportRelatorioTemposCSV();
    return;
  }

  const testDoc = new jsPDFCtor();
  if (typeof testDoc.autoTable !== 'function') {
    showToast('Biblioteca de PDF não encontrada. Exportando em CSV no lugar.', 'error');
    exportRelatorioTemposCSV();
    return;
  }

  try {
    const doc        = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const filterText = _rtActiveFiltersText();
    const agora      = new Date().toLocaleString('pt-BR');

    // ── Totais gerais ──
    const totals = _rtCalculateTotals(normalized);
    const totEff = totals.totalMs > 0 && totals.workedMs > 0
      ? Math.round(totals.workedMs / totals.totalMs * 100) + '%' : '–';

    // ── Cabeçalho ──
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Relatório de Tempos por Setor – FactoryFlow', 14, 14);

    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text('Induscolor', 14, 19);

    let cursorY = 24;
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`Gerado em: ${agora}   |   Total de registros: ${normalized.length}`, 14, cursorY);
    cursorY += 4;

    if (filterText) {
      const linhas = doc.splitTextToSize(`Filtros aplicados: ${filterText}`, 265);
      doc.text(linhas, 14, cursorY);
      cursorY += linhas.length * 3.8;
    }
    cursorY += 2;

    // ── Caixa de resumo geral ──
    const sumBoxH = 12;
    doc.setFillColor(29, 78, 170);
    doc.roundedRect(14, cursorY, 269, sumBoxH, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    const sumItems = [
      `Total Geral: ${rtFormatMs(totals.totalMs)}`,
      `Trabalhado: ${rtFormatMs(totals.workedMs)}`,
      `Pausado: ${rtFormatMs(totals.pausedMs)}`,
      `Ocioso: ${rtFormatMs(totals.idleMs)}`,
      `Eficiência Média: ${totEff}`
    ];
    const sumW = 269 / sumItems.length;
    sumItems.forEach((txt, i) => {
      doc.text(txt, 14 + i * sumW + sumW / 2, cursorY + sumBoxH / 2 + 1, { align: 'center' });
    });
    cursorY += sumBoxH + 4;

    // ── Tabela principal: 1 linha por OP/lote, colunas essenciais ──
    // Agrupa por OP/lote (usa buildRelatorioTemposPivotRows internamente)
    const pivotRows = buildRelatorioTemposPivotRows(normalized);

    const head = [[
      'OP/Lote', 'Código', 'Produto', 'Cliente', 'Setor Atual',
      'Total', 'Trabalhado', 'Pausado', 'Ocioso', 'Efic. %'
    ]];

    const body = pivotRows.map(r => [
      r['OP/Lote']            || '–',
      _rtTrunc(r['Código do Produto'] || '–', 16),
      _rtTrunc(r['Nome do Produto']   || '–', 32),
      _rtTrunc(r['Cliente']           || '–', 22),
      _rtTrunc(r['Setor Atual']       || '–', 22),
      r['Total Geral']        || '–',
      r['Trabalhado Geral']   || '–',
      r['Pausado Geral']      || '–',
      r['Ocioso Geral']       || '–',
      r['Eficiência Geral %'] || '–'
    ]);

    doc.autoTable({
      startY: cursorY,
      head,
      body,
      styles: {
        fontSize: 7,
        cellPadding: 1.8,
        overflow: 'linebreak',
        valign: 'middle',
        lineColor: [220, 226, 235],
        lineWidth: 0.15
      },
      headStyles: {
        fillColor: [29, 78, 170],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center'
      },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: {
        0: { cellWidth: 20, fontStyle: 'bold', halign: 'center' },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 52 },
        3: { cellWidth: 40 },
        4: { cellWidth: 38 },
        5: { cellWidth: 22, halign: 'center' },
        6: { cellWidth: 22, halign: 'center', textColor: [34, 197, 94] },
        7: { cellWidth: 22, halign: 'center', textColor: [245, 158, 11] },
        8: { cellWidth: 22, halign: 'center', textColor: [148, 163, 184] },
        9: { cellWidth: 18, halign: 'center', fontStyle: 'bold' }
      },
      margin: { left: 8, right: 8 },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 9) {
          const v = String(data.cell.raw || '');
          const pct = parseInt(v, 10);
          if (!isNaN(pct)) {
            data.cell.styles.textColor = pct >= 70 ? [34, 197, 94] : pct >= 40 ? [245, 158, 11] : [248, 113, 113];
          }
        }
      }
    });

    // ── Rodapé ──
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `FactoryFlow – Relatório de Tempos por Setor  |  Página ${i} de ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: 'center' }
      );
    }

    doc.save(`relatorio-tempos-${_rtDateStr()}.pdf`);
    showToast(`PDF exportado! ${pivotRows.length} OP/lote(s).`, 'success');

  } catch (e) {
    console.error('[relatorio-tempos] exportRelatorioTemposPDF erro:', e);
    showToast(`Erro ao gerar PDF (${e.message}). Exportando em CSV no lugar.`, 'error');
    exportRelatorioTemposCSV();
  }
}

/** Trunca string com reticências se ultrapassar maxLen */
function _rtTrunc(str, maxLen) {
  const s = String(str || '');
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

/**
 * Escapa um valor para uma célula CSV (delimitador ';', padrão pt-BR/Excel).
 * Envolve em aspas e duplica aspas internas quando o valor contém
 * ';', '"' ou quebra de linha; quebras de linha internas são normalizadas para espaço.
 */
function _rtCsvEscape(value) {
  const s = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  if (/[;"]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Exporta o Relatório de Tempos atual (respeitando os filtros aplicados na tela)
 * em CSV simples — uma linha por OP/lote/setor, igual aos registros normalizados
 * usados na visão atual (mesma fonte de dados do Excel/PDF: _rtData + filtros).
 *
 * Fallback real para quando jsPDF/autoTable não estiverem disponíveis ou a
 * geração do PDF falhar (ver exportRelatorioTemposPDF). Não recalcula nenhum
 * tempo: usa os mesmos campos já calculados por _rtNormalizeRow (totalMs,
 * workedMs, pausedMs, idleMs, efficiency).
 */
function exportRelatorioTemposCSV() {
  const rawRows    = _rtFromBackend ? _rtData : _rtApplyFilters(_rtData);
  const normalized = _rtFilterReportRows(rawRows.map(_rtNormalizeRow).filter(Boolean));

  if (normalized.length === 0) {
    showToast('Nenhum dado para exportar. Execute a busca primeiro.', 'info');
    return false;
  }

  const headers = [
    'OP', 'Pedido', 'Cliente', 'Código do Produto', 'Produto', 'Setor', 'Status',
    'Entrada', 'Saída', 'Tempo Total', 'Trabalhado', 'Pausado', 'Ocioso',
    'Eficiência (%)', 'Observações / Motivo da Pausa'
  ];

  const lines = [headers.map(_rtCsvEscape).join(';')];

  normalized.forEach(r => {
    const entrada = r.enteredAt ? rtFormatDateTime(r.enteredAt) : '';
    const saida   = r.exitAt ? rtFormatDateTime(r.exitAt) : (r.totalMs > 0 ? 'Em andamento' : '');
    const obs     = [r.observations, r.pauseReason].filter(Boolean).join(' | ');

    lines.push([
      r.lotNumber,
      r.orderNumber,
      r.client,
      r.productCode,
      r.productName,
      r.sectorLabel || r.sector,
      r.lotStatus,
      entrada,
      saida,
      rtFormatMs(r.totalMs),
      rtFormatMs(r.workedMs),
      rtFormatMs(r.pausedMs),
      rtFormatMs(r.idleMs),
      r.totalMs > 0 ? `${r.efficiency}%` : '-',
      obs
    ].map(_rtCsvEscape).join(';'));
  });

  const csvContent = '﻿' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `relatorio-tempos-${_rtDateStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`CSV exportado! ${normalized.length} registro(s).`, 'success');
  return true;
}

// ─────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────

function _rtDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _rtActiveFiltersText() {
  const parts = [];
  if (_rtFilters.codigoProduto) parts.push(`Código: ${_rtFilters.codigoProduto}`);
  if (_rtFilters.nomeProduto)   parts.push(`Produto: ${_rtFilters.nomeProduto}`);
  if (_rtFilters.opLote)        parts.push(`OP/Lote: ${_rtFilters.opLote}`);
  if (_rtFilters.pedido)        parts.push(`Pedido: ${_rtFilters.pedido}`);
  if (_rtFilters.cliente)       parts.push(`Cliente: ${_rtFilters.cliente}`);
  if (_rtFilters.dataInicial)   parts.push(`De: ${_rtFilters.dataInicial}`);
  if (_rtFilters.dataFinal)     parts.push(`Até: ${_rtFilters.dataFinal}`);
  if (_rtFilters.setor)         parts.push(`Setor: ${_rtFilters.setor}`);
  if (_rtViewMode && _rtViewMode !== 'auto') parts.push(`Visualização: ${_rtViewMode === 'grouped' ? 'Consolidado por setor' : 'Detalhado'}`);
  return parts.join(' | ');
}
