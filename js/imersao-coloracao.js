'use strict';

// =========================================================
// IMERSÃO NA FÁBRICA — SETOR DE COLORAÇÃO (MVP)
// Representação visual (blueprint neon) do setor físico de
// Coloração da Induscolor. Os elementos de fábrica (estufa,
// bancada, capela etc.) são decorativos; as "pranchetas" que
// representam OPs são elementos HTML reais, posicionados sobre
// a cena, cuja quantidade e conteúdo vêm 100% de STATE.lots
// (os mesmos dados já usados pelo Kanban/Lotes). Nada aqui é
// mockado ou fixo — clicar em uma OP abre o modal já existente
// de detalhe do lote (openLotDetail), sem duplicar lógica.
//
// Para adicionar outros setores no futuro (Laboratório, Produção
// etc.), basta criar uma nova entrada em IMERSAO_SECTOR_MAP e um
// novo módulo/página seguindo o mesmo padrão desta.
// =========================================================

// --------- MAPA DE POSIÇÕES (tudo em % da cena, 100x100) ---------
// Ajustar aqui a posição/tamanho de qualquer elemento sem tocar no
// resto do código. `furniture` é só decoração; `walls` são as 3
// áreas clicáveis de pranchetas (cada uma ligada a um setor real).
const IMERSAO_SECTOR_MAP = {
  coloracao: {
    label: 'Coloração',
    furniture: {
      entrada:         { x: 1,  y: 58, w: 8,  h: 28, label: 'Entrada',            icon: 'fa-door-open' },
      estufa:          { x: 10, y: 46, w: 12, h: 24, label: 'Estufa',             icon: 'fa-box' },
      bancadaMovel:    { x: 10, y: 74, w: 30, h: 14, label: 'Bancada',            icon: 'fa-flask' },
      capela:          { x: 23, y: 38, w: 12, h: 26, label: 'Capela',             icon: 'fa-wind' },
      armario:         { x: 36, y: 16, w: 9,  h: 20, label: 'Armário',            icon: 'fa-archive' },
      arCondicionado:  { x: 38, y: 2,  w: 16, h: 8,  label: 'Ar-Condicionado',    icon: 'fa-snowflake' },
      cartaCores:      { x: 41, y: 14, w: 11, h: 14, label: 'Carta de Cores',     icon: 'fa-palette' },
      computador:      { x: 56, y: 44, w: 16, h: 26, label: 'Computador — Liberação de OPs', icon: 'fa-desktop' },
      janelaEnvase:    { x: 8,  y: 6,  w: 20, h: 22, label: 'Janela para o Envase', icon: 'fa-window-maximize' }
    },
    // Cada wall representa uma das 3 áreas pedidas. `sector` é o valor
    // real usado em STATE (ffGetLotCurrentSector) para filtrar os lotes.
    walls: {
      coloracao: {
        x: 10, y: 74, w: 30, h: 14,
        sector: 'coloracao',
        label: 'Coloração',
        color: 'cyan',
        counterPos: { x: 4, y: 90 }
      },
      coloracao_revisao: {
        x: 75, y: 10, w: 24, h: 28,
        sector: 'coloracao_revisao',
        label: 'Coloração Revisão',
        color: 'amber',
        counterPos: { x: 75, y: 4 }
      },
      coloracao_amostras: {
        x: 75, y: 42, w: 24, h: 28,
        sector: 'coloracao_amostras',
        label: 'Coloração Amostras',
        color: 'magenta',
        counterPos: { x: 75, y: 74 }
      }
    }
  }
};

let _imState = {
  activeZone: null,      // key dentro de walls, ou null = visão geral
  activeLotId: null,
  tickTimer: null,
  refreshTimer: null
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
        <p class="im-subtitle">Visualização em tempo real do setor. Clique em uma área para aproximar e ver as OPs.</p>
      </div>
    </div>

    <div class="im-stage" id="imStage">
      <div class="im-scene" id="imScene">
        ${_imRenderFurniture(map.furniture)}
        ${_imRenderWalls(map.walls)}
      </div>
    </div>

    <div class="im-drawer" id="imDrawer" hidden>
      <div class="im-drawer-header">
        <h3 id="imDrawerTitle"></h3>
        <button class="im-drawer-close" onclick="closeImersaoZoom()"><i class="fas fa-times"></i></button>
      </div>
      <div class="im-drawer-body" id="imDrawerBody"></div>
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
    const count = _imCountForSector(w.sector);
    return `
      <div class="im-wall im-wall-${w.color}" data-zone="${key}"
           style="left:${w.x}%; top:${w.y}%; width:${w.w}%; height:${w.h}%;"
           onclick="openImersaoZoom('${key}')" role="button" tabindex="0">
        <div class="im-wall-label">${escapeHtml(w.label)}</div>
        <div class="im-wall-pranchetas" id="imPranchetas_${key}">${_imRenderPranchetas(count)}</div>
      </div>
      <div class="im-counter im-counter-${w.color}" id="imCounter_${key}"
           style="left:${w.counterPos.x}%; top:${w.counterPos.y}%;"
           onclick="openImersaoZoom('${key}')" role="button" tabindex="0">
        <i class="fas fa-long-arrow-alt-right im-counter-arrow"></i>
        <span class="im-counter-label">${escapeHtml(w.label)}</span>
        <span class="im-counter-value" id="imCounterValue_${key}">${String(count).padStart(2, '0')}</span>
        <span class="im-counter-suffix">OPs</span>
      </div>
    `;
  }).join('');
}

// Máximo de ícones de prancheta desenhados por área (evita poluir a cena
// quando há muitas OPs); o contador numérico ao lado sempre mostra o real.
const IM_MAX_PRANCHETA_ICONS = 10;

function _imRenderPranchetas(count) {
  if (count <= 0) return '<div class="im-wall-empty">Sem OPs</div>';
  const visible = Math.min(count, IM_MAX_PRANCHETA_ICONS);
  const icons = Array.from({ length: visible }, () => `<div class="im-prancheta"><i class="fas fa-clipboard"></i></div>`).join('');
  const overflow = count > IM_MAX_PRANCHETA_ICONS ? `<div class="im-prancheta im-prancheta-more">+${count - IM_MAX_PRANCHETA_ICONS}</div>` : '';
  return icons + overflow;
}

// --------- DADOS (100% de STATE.lots, sem mock) ---------
function _imLotsForSector(sector) {
  const lots = Array.isArray(STATE.lots) ? STATE.lots : [];
  return lots
    .filter(l => !l.rejected && ffGetLotCurrentSector(l) === sector)
    .sort((a, b) => (a.sectorEnteredAt || 0) - (b.sectorEnteredAt || 0));
}

function _imCountForSector(sector) {
  return _imLotsForSector(sector).length;
}

// --------- ZOOM / DRAWER ---------
function openImersaoZoom(zoneKey) {
  const map = IMERSAO_SECTOR_MAP.coloracao;
  const wall = map.walls[zoneKey];
  if (!wall) return;

  _imState.activeZone = zoneKey;

  const scene = document.getElementById('imScene');
  const stage = document.getElementById('imStage');
  if (scene && stage) {
    const cx = wall.x + wall.w / 2;
    const cy = wall.y + wall.h / 2;
    scene.style.transformOrigin = `${cx}% ${cy}%`;
    stage.classList.add('im-zoomed');
    scene.classList.add('im-zoomed-scene');
  }

  document.querySelectorAll('.im-wall').forEach(el => el.classList.toggle('im-wall-focused', el.dataset.zone === zoneKey));

  _imRenderDrawer(zoneKey);
}

function closeImersaoZoom() {
  _imState.activeZone = null;
  const scene = document.getElementById('imScene');
  const stage = document.getElementById('imStage');
  if (scene && stage) {
    stage.classList.remove('im-zoomed');
    scene.classList.remove('im-zoomed-scene');
  }
  document.querySelectorAll('.im-wall').forEach(el => el.classList.remove('im-wall-focused'));
  const drawer = document.getElementById('imDrawer');
  if (drawer) drawer.hidden = true;
}

function _imRenderDrawer(zoneKey) {
  const map = IMERSAO_SECTOR_MAP.coloracao;
  const wall = map.walls[zoneKey];
  const drawer = document.getElementById('imDrawer');
  const title = document.getElementById('imDrawerTitle');
  const body = document.getElementById('imDrawerBody');
  if (!wall || !drawer || !title || !body) return;

  const lots = _imLotsForSector(wall.sector);

  title.innerHTML = `<span class="im-drawer-dot im-dot-${wall.color}"></span> ${escapeHtml(wall.label)} <span class="im-drawer-count">${lots.length} OP${lots.length === 1 ? '' : 's'}</span>`;

  if (lots.length === 0) {
    body.innerHTML = `<div class="im-empty"><i class="fas fa-inbox"></i> Nenhuma OP neste momento em ${escapeHtml(wall.label)}.</div>`;
  } else {
    body.innerHTML = `
      <table class="im-op-table">
        <thead>
          <tr>
            <th>OP</th>
            <th>Produto/Cor</th>
            <th>Qtd.</th>
            <th>Prazo</th>
            <th>Tempo no setor</th>
          </tr>
        </thead>
        <tbody>
          ${lots.map(l => `
            <tr class="im-op-row" onclick="openImersaoOp('${l.id}')">
              <td>${escapeHtml(l.number || l.op || '–')}</td>
              <td>${escapeHtml(l.productName || '–')}</td>
              <td>${escapeHtml(String(l.qty || '–'))} ${escapeHtml(l.unit || '')}</td>
              <td>${formatDate(l.deliveryDate)}</td>
              <td class="im-op-time" data-entered-at="${Number(l.sectorEnteredAt) || 0}">${formatMs(Date.now() - (Number(l.sectorEnteredAt) || Date.now()))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  drawer.hidden = false;
}

// --------- MODAL RÁPIDO DE UMA OP ---------
function openImersaoOp(lotId) {
  const lot = (STATE.lots || []).find(l => l.id === lotId);
  if (!lot) return;
  _imState.activeLotId = lotId;

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
// app (app.js). Aqui só recalculamos contadores/pranchetas periodicamente
// e atualizamos os relógios de "tempo no setor" a cada segundo.
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
  const page = document.getElementById('pageImersaoColoracao');
  if (!page || !page.classList.contains('active')) return;

  document.querySelectorAll('.im-op-time[data-entered-at]').forEach(el => {
    const enteredAt = Number(el.dataset.enteredAt) || Date.now();
    el.textContent = formatMs(Date.now() - enteredAt);
  });
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
    const count = _imCountForSector(w.sector);
    const valueEl = document.getElementById(`imCounterValue_${key}`);
    const pranchetasEl = document.getElementById(`imPranchetas_${key}`);
    if (valueEl && valueEl.textContent !== String(count).padStart(2, '0')) {
      valueEl.textContent = String(count).padStart(2, '0');
      valueEl.classList.remove('im-pulse');
      void valueEl.offsetWidth; // reinicia a animação
      valueEl.classList.add('im-pulse');
    }
    if (pranchetasEl) pranchetasEl.innerHTML = _imRenderPranchetas(count);
  });

  // Mantém o drawer aberto sincronizado se uma OP entrar/sair do setor focado.
  if (_imState.activeZone) _imRenderDrawer(_imState.activeZone);
}

window.renderImersaoColoracao = renderImersaoColoracao;
window.openImersaoZoom = openImersaoZoom;
window.closeImersaoZoom = closeImersaoZoom;
window.openImersaoOp = openImersaoOp;
