'use strict';

// =========================================================
// IMERSÃO NA FÁBRICA — SETOR DE COLORAÇÃO (MVP)
// Arquitetura em camadas:
//   CAMADA 1 — imagem real do cenário (frontend/images/imersao/coloracao-cenario.png),
//              usada como está, sem redesenho.
//   CAMADA 2 — elementos HTML (pranchetas) posicionados sobre a imagem,
//              nos locais físicos correspondentes.
//   CAMADA 3 — dados reais das OPs, vindos de STATE.lots (mesmos dados
//              do Kanban/Lotes) via ffGetLotCurrentSector. Nada mockado.
//
// A imagem original é um mockup completo (barra superior + painel lateral
// + 3 tabelas já com números fixos desenhados nela). Como a regra do
// projeto é "a imagem não é dado" e os números daquele mockup são fixos/
// fictícios, usamos apenas a REGIÃO DA SALA da imagem (IM_CROP abaixo),
// recortada via CSS (o arquivo original não é editado/tocado) — a barra
// superior, o painel lateral e as tabelas de baixo (que tinham dado falso
// embutido no próprio desenho) ficam fora da janela visível, e nosso
// overlay HTML dinâmico assume o lugar delas com dados reais.
// =========================================================

const IM_IMAGE_SRC = 'images/imersao/coloracao-cenario.png';
const IM_IMAGE_NATIVE = { w: 1536, h: 1024 };

// Janela de recorte (em pixels da imagem original) — mostra só a sala
// física (estufa, bancada, capela, armário, computador, paredes de
// pranchetas), excluindo a barra superior, o painel lateral direito e
// as tabelas inferiores do mockup original.
// Ajustar aqui se o enquadramento precisar de retoque fino.
const IM_CROP = { left: 0, top: 76, width: 1350, height: 530 };

// --------- MAPA DE POSIÇÕES ---------
// Coordenadas em % relativas à JANELA DE RECORTE acima (0-100), não à
// tela. Cada `wall` é um local físico real onde ficam as pranchetas de
// um dos 3 grupos, ligado ao setor real usado em STATE
// (ffGetLotCurrentSector) para filtrar os lotes que aparecem ali.
const IMERSAO_SECTOR_MAP = {
  coloracao: {
    walls: {
      coloracao: {
        // Segunda parte da bancada, logo abaixo da Estufa/Capela —
        // caixa mais baixa e rasa para colar na borda da prateleira
        // onde as pranchetas realmente se apoiam.
        x: 16, y: 74, w: 29, h: 10,
        sector: 'coloracao',
        label: 'Coloração',
        color: 'cyan'
      },
      coloracao_revisao: {
        // Parede de pranchetas à direita, canto superior.
        x: 76, y: 7, w: 18, h: 30,
        sector: 'coloracao_revisao',
        label: 'Coloração Revisão',
        color: 'amber'
      },
      coloracao_amostras: {
        // Parede de pranchetas à direita, abaixo da Revisão.
        x: 76, y: 39, w: 16, h: 31,
        sector: 'coloracao_amostras',
        label: 'Coloração Amostras',
        color: 'magenta'
      }
    }
  }
};

const IM_MAX_PRANCHETA_ICONS = 40;

let _imState = {
  activeZone: null,
  refreshTimer: null,
  tickTimer: null
};

function renderImersaoColoracao() {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page) return;

  const map = IMERSAO_SECTOR_MAP.coloracao;
  _imState.activeZone = null;

  const cropAspect = (IM_CROP.width / IM_CROP.height).toFixed(4);
  const imgWidthPct = ((IM_IMAGE_NATIVE.w / IM_CROP.width) * 100).toFixed(3);
  const imgLeftPct = (-(IM_CROP.left / IM_CROP.width) * 100).toFixed(3);
  const imgTopPct = (-(IM_CROP.top / IM_CROP.height) * 100).toFixed(3);

  page.innerHTML = `
    <div class="im-toolbar">
      <div>
        <h2><i class="fas fa-vr-cardboard"></i> Imersão na Fábrica — Coloração</h2>
        <p class="im-subtitle">Visualização em tempo real do setor. Clique num grupo de pranchetas para aproximar.</p>
      </div>
    </div>

    <div class="im-stage" id="imStage" style="aspect-ratio:${cropAspect};">
      <button class="im-back-btn" id="imBackBtn" onclick="closeImersaoZoom()" hidden>
        <i class="fas fa-arrow-left"></i> Voltar
      </button>
      <div class="im-scene" id="imScene">
        <img class="im-bg-img" src="${IM_IMAGE_SRC}" alt="Cenário do setor de Coloração"
             style="left:${imgLeftPct}%; top:${imgTopPct}%; width:${imgWidthPct}%;">
        ${_imRenderWalls(map.walls)}
      </div>
    </div>
  `;

  _imStartTimers();
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
  if (!lots.length) return '';
  const visible = lots.slice(0, IM_MAX_PRANCHETA_ICONS);
  const icons = visible.map(l => `
    <div class="im-prancheta" onclick="event.stopPropagation(); openImersaoOp('${l.id}')" title="OP ${escapeHtml(l.number || l.op || '')}">
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

// --------- ZOOM NA PRÓPRIA IMAGEM (sem painel lateral) ---------
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
      <tr><td>Cliente</td><td>${escapeHtml(lot.client || '–')}</td></tr>
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
