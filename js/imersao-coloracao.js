'use strict';

// =========================================================
// IMERSÃO NA FÁBRICA — SETOR DE COLORAÇÃO (MVP)
// Representação visual (blueprint neon) do setor físico de
// Coloração da Induscolor. O mapa ocupa toda a área principal;
// as "pranchetas" que representam OPs são elementos HTML reais,
// posicionados sobre o mapa, nos locais físicos correspondentes
// (ex.: a segunda camada da bancada, abaixo da estufa, é onde
// ficam as pranchetas de Coloração). Quantidade e conteúdo vêm
// 100% de STATE.lots (mesmos dados do Kanban/Lotes) — nada é
// mockado ou fixo. Clicar numa OP abre o modal já existente de
// detalhe do lote (openLotDetail), sem duplicar lógica.
//
// Para adicionar outros setores no futuro (Laboratório, Produção
// etc.), basta criar uma nova entrada em IMERSAO_SECTOR_MAP e um
// novo módulo/página seguindo o mesmo padrão desta.
// =========================================================

// --------- MAPA DE POSIÇÕES (tudo em % da cena, 100x100) ---------
// Ajustar aqui a posição/tamanho de qualquer elemento sem tocar no
// resto do código. `furniture` é só decoração; `walls` são as 3
// áreas físicas reais onde ficam as pranchetas (cada uma ligada a
// um setor real usado em STATE via ffGetLotCurrentSector).
const IMERSAO_SECTOR_MAP = {
  coloracao: {
    label: 'Coloração',
    furniture: {
      entrada:        { x: 0,  y: 62, w: 6,  h: 30, label: 'Entrada',                 icon: 'fa-door-open' },
      janelaEnvase:   { x: 4,  y: 2,  w: 22, h: 20, label: 'Janela para o Envase',     icon: 'fa-window-maximize' },
      estufa:         { x: 6,  y: 24, w: 17, h: 26, label: 'Estufa',                   icon: 'fa-box' },
      capela:         { x: 25, y: 24, w: 14, h: 26, label: 'Capela',                   icon: 'fa-wind' },
      armario:        { x: 41, y: 24, w: 10, h: 26, label: 'Armário',                  icon: 'fa-archive' },
      arCondicionado: { x: 36, y: 0,  w: 18, h: 8,  label: 'Ar-Condicionado',          icon: 'fa-snowflake' },
      cartaCores:     { x: 40, y: 10, w: 12, h: 12, label: 'Carta de Cores',           icon: 'fa-palette' },
      computador:     { x: 68, y: 30, w: 17, h: 24, label: 'Computador — Liberação de OPs', icon: 'fa-desktop' }
    },
    // Cada wall representa um dos 3 grupos de pranchetas. `sector` é o
    // valor real usado em STATE (ffGetLotCurrentSector) para filtrar
    // os lotes que aparecem ali.
    walls: {
      coloracao: {
        // Segunda camada da bancada, logo abaixo da Estufa/Capela —
        // é aqui, fisicamente, que ficam as OPs em Coloração.
        x: 6, y: 54, w: 45, h: 20,
        sector: 'coloracao',
        label: 'Coloração',
        color: 'cyan'
      },
      coloracao_revisao: {
        x: 68, y: 2, w: 30, h: 24,
        sector: 'coloracao_revisao',
        label: 'Coloração Revisão',
        color: 'amber'
      },
      coloracao_amostras: {
        x: 68, y: 60, w: 30, h: 30,
        sector: 'coloracao_amostras',
        label: 'Coloração Amostras',
        color: 'magenta'
      }
    }
  }
};

const IM_MAX_PRANCHETA_ICONS = 40;

let _imState = {
  activeZone: null,      // key dentro de walls, ou null = visão geral
  refreshTimer: null,
  tickTimer: null
};

function renderImersaoColoracao() {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page) return;

  const map = IMERSAO_SECTOR_MAP.coloracao;
  _imState.activeZone = null;

  page.innerHTML = `
    <div class="im-toolbar">
      <div>
        <h2><i class="fas fa-vr-cardboard"></i> Imersão na Fábrica — Coloração</h2>
        <p class="im-subtitle">Visualização em tempo real do setor. Clique num grupo de pranchetas para aproximar.</p>
      </div>
    </div>

    <div class="im-stage" id="imStage">
      <button class="im-back-btn" id="imBackBtn" onclick="closeImersaoZoom()" hidden>
        <i class="fas fa-arrow-left"></i> Voltar
      </button>
      <div class="im-scene" id="imScene">
        ${_imRenderFurniture(map.furniture)}
        ${_imRenderWalls(map.walls)}
      </div>
    </div>
  `;

  _imStartTimers();
}

function _imRenderFurniture(furniture) {
  return Object.entries(furniture).map(([key, f]) => `
    <div class="im-furniture" style="left:${f.x}%; top:${f.y}%; width:${f.w}%; height:${f.h}%;" title="${escapeHtml(f.label)}">
      <i class="fas ${f.icon}"></i>
      <span class="im-furniture-label">${escapeHtml(f.label)}</span>
    </div>
  `).join('');
}

function _imRenderWalls(walls) {
  return Object.entries(walls).map(([key, w]) => {
    const lots = _imLotsForSector(w.sector);
    return `
      <div class="im-wall im-wall-${w.color}" data-zone="${key}" id="imWall_${key}"
           style="left:${w.x}%; top:${w.y}%; width:${w.w}%; height:${w.h}%;"
           onclick="openImersaoZoom('${key}')" role="button" tabindex="0">
        <div class="im-wall-label">${escapeHtml(w.label)} <span class="im-wall-count" id="imCount_${key}">${lots.length}</span></div>
        <div class="im-wall-pranchetas" id="imPranchetas_${key}">${_imRenderPranchetas(lots)}</div>
      </div>
    `;
  }).join('');
}

function _imRenderPranchetas(lots) {
  if (!lots.length) return '<div class="im-wall-empty">Sem OPs</div>';
  const visible = lots.slice(0, IM_MAX_PRANCHETA_ICONS);
  const icons = visible.map(l => `
    <div class="im-prancheta" onclick="event.stopPropagation(); openImersaoOp('${l.id}')" title="OP ${escapeHtml(l.number || l.op || '')}">
      <i class="fas fa-clipboard"></i>
      <span class="im-prancheta-label">${escapeHtml(l.number || l.op || '?')}</span>
    </div>
  `).join('');
  const overflow = lots.length > IM_MAX_PRANCHETA_ICONS
    ? `<div class="im-prancheta im-prancheta-more">+${lots.length - IM_MAX_PRANCHETA_ICONS}</div>`
    : '';
  return icons + overflow;
}

// --------- DADOS (100% de STATE.lots, sem mock) ---------
function _imLotsForSector(sector) {
  const lots = Array.isArray(STATE.lots) ? STATE.lots : [];
  return lots
    .filter(l => !l.rejected && ffGetLotCurrentSector(l) === sector)
    .sort((a, b) => (a.sectorEnteredAt || 0) - (b.sectorEnteredAt || 0));
}

// --------- ZOOM NO PRÓPRIO MAPA (sem painel lateral) ---------
function openImersaoZoom(zoneKey) {
  const map = IMERSAO_SECTOR_MAP.coloracao;
  const wall = map.walls[zoneKey];
  if (!wall) return;

  _imState.activeZone = zoneKey;

  const scene = document.getElementById('imScene');
  const stage = document.getElementById('imStage');
  const backBtn = document.getElementById('imBackBtn');
  if (scene && stage) {
    const cx = wall.x + wall.w / 2;
    const cy = wall.y + wall.h / 2;
    scene.style.transformOrigin = `${cx}% ${cy}%`;
    stage.classList.add('im-zoomed');
    scene.classList.add('im-zoomed-scene');
  }
  if (backBtn) backBtn.hidden = false;

  document.querySelectorAll('.im-wall').forEach(el => el.classList.toggle('im-wall-focused', el.dataset.zone === zoneKey));
  document.querySelectorAll('.im-furniture').forEach(el => el.classList.add('im-dimmed'));
}

function closeImersaoZoom() {
  _imState.activeZone = null;
  const scene = document.getElementById('imScene');
  const stage = document.getElementById('imStage');
  const backBtn = document.getElementById('imBackBtn');
  if (scene && stage) {
    stage.classList.remove('im-zoomed');
    scene.classList.remove('im-zoomed-scene');
  }
  if (backBtn) backBtn.hidden = true;
  document.querySelectorAll('.im-wall').forEach(el => el.classList.remove('im-wall-focused'));
  document.querySelectorAll('.im-furniture').forEach(el => el.classList.remove('im-dimmed'));
}

// --------- MODAL RÁPIDO DE UMA OP (reaproveita padrão de modal existente) ---------
function openImersaoOp(lotId) {
  const lot = (STATE.lots || []).find(l => l.id === lotId);
  if (!lot) return;

  const sector = ffGetLotCurrentSector(lot);
  const enteredAt = Number(lot.sectorEnteredAt) || Date.now();

  document.getElementById('modalImersaoOpTitle').textContent = `OP ${lot.number || lot.op || ''}`;
  document.getElementById('modalImersaoOpBody').innerHTML = `
    <table class="im-modal-table">
      <tr><td>Produto</td><td><strong>${escapeHtml(lot.productName || '–')}</strong></td></tr>
      <tr><td>Quantidade</td><td>${escapeHtml(String(lot.qty || '–'))} ${escapeHtml(lot.unit || '')}</td></tr>
      <tr><td>Prazo de entrega</td><td>${formatDate(lot.deliveryDate)}</td></tr>
      <tr><td>Setor atual</td><td><span class="sector-tag" style="background:${SECTOR_COLORS[sector] || '#334155'}">${escapeHtml(SECTOR_LABELS[sector] || sector)}</span></td></tr>
      <tr><td>Entrada no setor</td><td>${formatDateTime(enteredAt)}</td></tr>
      <tr><td>Tempo no setor</td><td id="imModalOpTime" data-entered-at="${enteredAt}">${formatMs(Date.now() - enteredAt)}</td></tr>
      <tr><td>Status</td><td>${escapeHtml(lot.rejected ? 'Reprovado' : 'Em ' + (SECTOR_LABELS[sector] || sector))}</td></tr>
    </table>
    <button class="btn btn-primary im-btn-full" onclick="closeModal(); openLotDetail('${lot.id}')">
      <i class="fas fa-external-link-alt"></i> Ver OP completa
    </button>
  `;

  openModal('modalImersaoOp');
}

// --------- ATUALIZAÇÃO CONTÍNUA (dados reais, sem mock) ---------
// STATE.lots já é mantido atualizado pelo ciclo global de auto-update do
// app (app.js). Aqui só recalculamos pranchetas/contadores periodicamente
// e atualizamos o relógio de "tempo no setor" do modal a cada segundo.
function _imStartTimers() {
  _imClearTimers();
  _imState.tickTimer = setInterval(_imTickClocks, 1000);
  _imState.refreshTimer = setInterval(_imRefreshCounts, 4000);
}

function _imClearTimers() {
  if (_imState.tickTimer) clearInterval(_imState.tickTimer);
  if (_imState.refreshTimer) clearInterval(_imState.refreshTimer);
  _imState.tickTimer = null;
  _imState.refreshTimer = null;
}

function _imTickClocks() {
  const modalTime = document.getElementById('imModalOpTime');
  if (modalTime) {
    const enteredAt = Number(modalTime.dataset.enteredAt) || Date.now();
    modalTime.textContent = formatMs(Date.now() - enteredAt);
  }
}

function _imRefreshCounts() {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page || !page.classList.contains('active')) return;

  const map = IMERSAO_SECTOR_MAP.coloracao;
  Object.entries(map.walls).forEach(([key, w]) => {
    const lots = _imLotsForSector(w.sector);
    const countEl = document.getElementById(`imCount_${key}`);
    const pranchetasEl = document.getElementById(`imPranchetas_${key}`);
    if (countEl && countEl.textContent !== String(lots.length)) {
      countEl.textContent = String(lots.length);
      countEl.classList.remove('im-pulse');
      void countEl.offsetWidth; // reinicia a animação
      countEl.classList.add('im-pulse');
    }
    if (pranchetasEl) pranchetasEl.innerHTML = _imRenderPranchetas(lots);
  });
}

window.renderImersaoColoracao = renderImersaoColoracao;
window.openImersaoZoom = openImersaoZoom;
window.closeImersaoZoom = closeImersaoZoom;
window.openImersaoOp = openImersaoOp;
