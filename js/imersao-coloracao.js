'use strict';

// =========================================================
// IMERSÃO NA FÁBRICA — SETOR DE COLORAÇÃO (MVP)
// Arquitetura em camadas:
//   CAMADA 1 — imagem real do cenário (frontend/images/imersao/coloracao-cenario.png),
//              usada como está, sem redesenho, apenas escurecida por um véu
//              para servir de pano de fundo ambiente.
//   CAMADA 2 — cartões HTML das OPs, centralizados sobre a imagem.
//   CAMADA 3 — dados reais das OPs, vindos de STATE.lots (mesmos dados
//              do Kanban/Lotes) via ffGetLotCurrentSector. Nada mockado.
//
// A imagem original é um mockup completo (barra superior + painel lateral
// + 3 tabelas já com números fixos desenhados nela). Como a regra do
// projeto é "a imagem não é dado" e os números daquele mockup são fixos/
// fictícios, usamos apenas a REGIÃO DA SALA da imagem (IM_CROP abaixo),
// recortada via CSS (o arquivo original não é editado/tocado).
// =========================================================

const IM_IMAGE_SRC = 'images/imersao/coloracao-cenario.png';
const IM_IMAGE_NATIVE = { w: 1536, h: 1024 };

// Janela de recorte (em pixels da imagem original) — mostra só a sala
// física, excluindo a barra superior, o painel lateral direito e as
// tabelas inferiores do mockup original.
const IM_CROP = { left: 0, top: 76, width: 1350, height: 530 };

// --------- GRUPOS DE OPs ---------
// Cada grupo é ligado ao setor real usado em STATE (ffGetLotCurrentSector)
// para filtrar os lotes que aparecem no seu cartão. Sem coordenadas
// físicas — os cartões ficam centralizados na tela, sobre o cenário
// escurecido.
const IMERSAO_SECTOR_MAP = {
  coloracao: {
    groups: {
      coloracao: {
        sector: 'coloracao',
        label: 'Coloração',
        color: '#22d3ee',
        glow: 'rgba(34,211,238,.5)'
      },
      coloracao_revisao: {
        sector: 'coloracao_revisao',
        label: 'Coloração Revisão',
        color: '#f59e0b',
        glow: 'rgba(245,158,11,.5)'
      },
      coloracao_amostras: {
        sector: 'coloracao_amostras',
        label: 'Coloração Amostras',
        color: '#e879f9',
        glow: 'rgba(232,121,249,.5)'
      }
    }
  }
};

const IM_MAX_PRANCHETA_ICONS = 40;

let _imState = {
  refreshTimer: null,
  tickTimer: null
};

function renderImersaoColoracao() {
  const page = document.getElementById('pageImersaoColoracao');
  if (!page) return;

  const map = IMERSAO_SECTOR_MAP.coloracao;

  const cropAspect = (IM_CROP.width / IM_CROP.height).toFixed(4);
  const imgWidthPct = ((IM_IMAGE_NATIVE.w / IM_CROP.width) * 100).toFixed(3);
  const imgLeftPct = (-(IM_CROP.left / IM_CROP.width) * 100).toFixed(3);
  const imgTopPct = (-(IM_CROP.top / IM_CROP.height) * 100).toFixed(3);

  page.innerHTML = `
    <div class="im-toolbar">
      <div>
        <h2><i class="fas fa-vr-cardboard"></i> Imersão na Fábrica — Coloração</h2>
        <p class="im-subtitle">Visualização em tempo real do setor. Clique numa prancheta para ver os detalhes da OP.</p>
      </div>
    </div>

    <div class="im-stage" id="imStage" style="aspect-ratio:${cropAspect};">
      <div class="im-scene" id="imScene">
        <img class="im-bg-img" src="${IM_IMAGE_SRC}" alt="Cenário do setor de Coloração"
             style="left:${imgLeftPct}%; top:${imgTopPct}%; width:${imgWidthPct}%;">
        <div class="im-dim"></div>
        <div class="im-center-wrap">${_imRenderGroupCards(map.groups)}</div>
      </div>
    </div>
  `;

  _imStartTimers();
}

function _imRenderGroupCards(groups) {
  return Object.entries(groups).map(([key, g]) => {
    const lots = _imLotsForSector(g.sector);
    return `
      <div class="im-group-card" id="imWall_${key}" style="--im-color:${g.color}; --im-glow:${g.glow};">
        <div class="im-group-title">${escapeHtml(g.label)} <span class="im-wall-count" id="imCount_${key}">${lots.length}</span></div>
        <div class="im-card-pranchetas" id="imPranchetas_${key}">${_imRenderPranchetas(lots)}</div>
      </div>
    `;
  }).join('');
}

function _imRenderPranchetas(lots) {
  if (!lots.length) return '<div class="im-card-empty">Nenhuma OP neste grupo agora.</div>';
  const visible = lots.slice(0, IM_MAX_PRANCHETA_ICONS);
  const icons = visible.map(l => {
    const op = l.number || l.op || '?';
    const client = l.client || '';
    const tooltip = client ? `OP ${op} · ${client}` : `OP ${op}`;
    return `
    <div class="im-prancheta" onclick="event.stopPropagation(); openImersaoOp('${l.id}')" title="${escapeHtml(tooltip)}">
      <span class="im-prancheta-label">OP ${escapeHtml(op)}</span>
      ${client ? `<span class="im-prancheta-client">${escapeHtml(client)}</span>` : ''}
    </div>
  `;
  }).join('');
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
  Object.entries(map.groups).forEach(([key, g]) => {
    const lots = _imLotsForSector(g.sector);
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
window.openImersaoOp = openImersaoOp;
