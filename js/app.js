// ===================================================
// APP.JS – Inicialização, auto-update, tema
// ===================================================

document.addEventListener('DOMContentLoaded', async () => {
  applyThemeFromStorage();
  await checkSession();
});

// Libera o áudio de alerta depois do primeiro clique/toque do usuário.
// Isso ajuda o Chrome a permitir o beep quando uma ordem chegar para o PCP/setor.
(function setupFactoryFlowSoundUnlock(){
  const unlock = () => {
    try {
      if (typeof playUrgentSound === 'function') {
        // Som quase imperceptível para liberar o AudioContext sem incomodar.
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain();
        gain.gain.value = 0.001;
        gain.connect(ctx.destination);
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
      }
    } catch (_) {}
    document.removeEventListener('click', unlock);
    document.removeEventListener('touchstart', unlock);
  };
  document.addEventListener('click', unlock, { once:true });
  document.addEventListener('touchstart', unlock, { once:true });
})();


// ESC fecha modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const lm = document.getElementById('modalLoteManual');
    if (lm && lm.style.display !== 'none') {
      fecharModalLoteManual();
      return;
    }

    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.style.display = 'none';
    const dd = document.getElementById('alertDropdown');
    if (dd) dd.style.display = 'none';
  }
});

// Clique fora fecha dropdown de alertas
document.addEventListener('click', (e) => {
  const dd = document.getElementById('alertDropdown');
  if (!dd) return;
  if (!dd.contains(e.target) && !e.target.closest('.alert-bell')) {
    dd.style.display = 'none';
  }
});

// ===================================================
// AUTO-UPDATE – Polling a cada 8 segundos
// ===================================================
let _autoUpdateInterval = null;

function isModalOrEditingActive() {
  const loteManual = document.getElementById('modalLoteManual');
  const overlay = document.getElementById('modalOverlay');
  const pnOverlay = document.getElementById('pnModalOverlay');

  const isVisible = (el) => {
    if (!el) return false;
    const st = window.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  };

  const loteManualAberto = isVisible(loteManual);
  const overlayAberto = isVisible(overlay);
  const pnAberto = isVisible(pnOverlay);

  // Detecta qualquer modal/conteúdo de detalhe aberto dentro do overlay.
  // Isso impede o auto-update de re-renderizar a tela e apagar o histórico do lote.
  const modalDetalheAberto = !!document.querySelector(
    '#modalOverlay .modal, #modalOverlay .modal-content, #modalOverlay .detail-grid, #modalLotDetailBody .detail-grid'
  );

  const active = document.activeElement;
  const digitando = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);

  return loteManualAberto || overlayAberto || pnAberto || modalDetalheAberto || digitando;
}

function getAutoUpdateIntervalByPage() {
  const activePage = document.querySelector('.nav-item.active')?.dataset.page;

  // Kanban: 20 segundos
  if (activePage === 'kanban') return 20000;

  // Entregas: 20 segundos
  if (activePage === 'entregas') return 20000;

  // Programação de entrega: 1 minuto
  if (
    activePage === 'programacao-entregas' ||
    activePage === 'programacao' ||
    activePage === 'programacaoEntrega'
  ) {
    return 60000;
  }

  // Demais telas continuam rápidas
  return 5000;
}

async function runAutoUpdateCycle() {
  try {
    await reloadData();

    if (typeof updateExpedienteButton === 'function') {
      updateExpedienteButton();
    }

    if (typeof updateAlertBadge === 'function') {
      updateAlertBadge();
    }

    const activePage = document.querySelector('.nav-item.active')?.dataset.page;

    // Não bloqueia reload, só evita re-render se estiver editando.
    if (!isModalOrEditingActive()) {
      if (activePage) _silentRefresh(activePage);
    }

  } catch(e) {
    console.warn('Auto-update falhou:', e.message);
  }
}

function startAutoUpdate() {
  stopAutoUpdate();

  const dot = document.getElementById('liveDot');
  if (dot) dot.style.display = 'inline-flex';

  if (typeof loadSectorShifts === 'function') {
    loadSectorShifts().catch(() => {});
  } else if (typeof updateExpedienteButton === 'function') {
    updateExpedienteButton();
  }

  let lastInterval = getAutoUpdateIntervalByPage();

  _autoUpdateInterval = setInterval(async () => {
    const currentInterval = getAutoUpdateIntervalByPage();

    // Se mudou de tela e mudou o tempo ideal, reinicia o auto-update.
    if (currentInterval !== lastInterval) {
      startAutoUpdate();
      return;
    }

    await runAutoUpdateCycle();
  }, lastInterval);
}
function stopAutoUpdate() {
  if (_autoUpdateInterval) {
    clearInterval(_autoUpdateInterval);
    _autoUpdateInterval = null;
  }
  const dot = document.getElementById('liveDot');
  if (dot) dot.style.display = 'none';
}

function _silentRefresh(page) {
  if (isModalOrEditingActive()) return;

  try {
    switch(page) {
      case 'dashboard':  renderDashboard();     break;
      case 'kanban':     renderKanban();         break;
      case 'lots':       renderLots();           break;
      case 'orders':     renderOrdersPage();     break;
      case 'deliveries': renderDeliveries();     break;
      case 'drivers':    renderDriversPage();    break;
      case 'factory':    renderFactoryPanel();   break;
      case 'reports':    renderReports();        break;
      case 'import':     renderImportPage();     break;
      case 'programacao_entregas': renderProgramacaoEntregas(); break;
      case 'meu_setor':        renderMeuSetor();            break;
      case 'relatorio_tempos':  /* não auto-atualiza – dados são carregados sob demanda */ break;
      case 'simulador_entrega': /* carregado sob demanda – não auto-atualiza */ break;
      case 'pedidos_novos': if (typeof renderPedidosNovos === 'function') renderPedidosNovos(); break;
    }
  } catch(e) { /* silencioso */ }
}

// ===================================================
// TEMA – Claro / Escuro
// ===================================================

function applyThemeFromStorage() {
  const theme = localStorage.getItem('ff_theme') || 'dark';
  applyTheme(theme, false);
}

function applyTheme(theme, save = true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (save) {
    localStorage.setItem('ff_theme', theme);
    if (STATE.currentUser) {
      STATE.currentUser.theme = theme;
      const u = STATE.users.find(x => x.id === STATE.currentUser.id);
      if (u) {
        u.theme = theme;
        apiPatch('ff_users', u.id, { theme }).catch(() => {});
      }
    }
  }
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = theme === 'dark'
      ? '<i class="fas fa-sun"></i> Tema Claro'
      : '<i class="fas fa-moon"></i> Tema Escuro';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ===================================================
// LOTE MANUAL – FactoryFlow -> MySQL -> CQVision
// Permite múltiplos lotes no mesmo lançamento e busca cliente no MySQL
// ===================================================

const FF_MANUAL_ALLOWED_ROLES = ['admin', 'pcp', 'manager', 'gerente', 'diretoria'];
let _lmSeq = 0;
let _lmClienteCache = null;

function ffResolveApiBase() {
  if (typeof PEDIDOS_API !== 'undefined' && PEDIDOS_API) return String(PEDIDOS_API).replace(/\/$/, '');
  if (typeof API_BASE !== 'undefined' && API_BASE) return String(API_BASE).replace(/\/$/, '');
  if (typeof API_URL !== 'undefined' && API_URL) return String(API_URL).replace(/\/$/, '');
  if (typeof BACKEND_URL !== 'undefined' && BACKEND_URL) return String(BACKEND_URL).replace(/\/$/, '');
  if (window.PEDIDOS_API) return String(window.PEDIDOS_API).replace(/\/$/, '');
  if (window.API_BASE) return String(window.API_BASE).replace(/\/$/, '');
  if (window.API_URL) return String(window.API_URL).replace(/\/$/, '');
  return 'https://app-producao-backend-production.up.railway.app';
}

function ffResolveApiToken() {
  return sessionStorage.getItem('ff_token')
    || localStorage.getItem('ff_token')
    || localStorage.getItem('factoryflow_token')
    || localStorage.getItem('ff_api_token')
    || localStorage.getItem('api_token')
    || localStorage.getItem('token')
    || '';
}

function ffAuthHeaders(json = true) {
  const token = ffResolveApiToken();
  const headers = json ? { 'Content-Type': 'application/json' } : {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function usuarioPodeCriarLoteManual(user = STATE.currentUser) {
  const role = String(user?.role || '').toLowerCase();
  const acesso = String(user?.acesso_factoryflow || user?.factoryflow || '').toLowerCase();
  return FF_MANUAL_ALLOWED_ROLES.includes(role) || FF_MANUAL_ALLOWED_ROLES.includes(acesso);
}

function atualizarVisibilidadeBotaoLoteManual() {
  const btn = document.getElementById('btnCriarLoteManual');
  if (!btn) return;
  btn.style.display = usuarioPodeCriarLoteManual() ? 'inline-flex' : 'none';
}

function abrirModalLoteManual() {
  if (!usuarioPodeCriarLoteManual()) {
    alert('Acesso negado. Apenas Admin, PCP e Gerente podem criar lote manual.');
    return;
  }

  const modal = document.getElementById('modalLoteManual');
  if (!modal) {
    alert('Modal de lote manual não encontrado no index.html. Substitua o index pelo arquivo novo.');
    return;
  }

  stopAutoUpdate();
  limparStatusLoteManual();
  limparFormularioLoteManual();
  garantirLinhasLoteManual(1);
  modal.style.display = 'flex';

  setTimeout(() => document.getElementById('lm_pedido')?.focus(), 50);
}

function fecharModalLoteManual() {
  const modal = document.getElementById('modalLoteManual');
  if (modal) modal.style.display = 'none';
  limparStatusLoteManual();
  startAutoUpdate();
}

function _loteManualOverlayClick(event) {
  if (event.target && event.target.id === 'modalLoteManual') fecharModalLoteManual();
}

function setStatusLoteManual(message, type = 'ok') {
  const el = document.getElementById('lm_status');
  if (!el) return;
  el.style.display = 'block';
  el.className = `ff-manual-status ${type}`;
  el.innerHTML = message;
}

function limparStatusLoteManual() {
  const el = document.getElementById('lm_status');
  if (!el) return;
  el.style.display = 'none';
  el.className = 'ff-manual-status';
  el.innerHTML = '';
}

function limparFormularioLoteManual() {
  const form = document.getElementById('formLoteManual');
  if (form) form.reset();
  _lmClienteCache = null;
  const hint = document.getElementById('lm_cliente_hint');
  if (hint) hint.innerHTML = 'Se o código existir no MySQL, o nome/endereço serão preenchidos automaticamente.';
  const container = document.getElementById('lm_lotes_container');
  if (container) container.innerHTML = '';
  _lmSeq = 0;
}

function garantirLinhasLoteManual(qtd = 1) {
  const container = document.getElementById('lm_lotes_container');
  if (!container) return;
  while (container.querySelectorAll('.ff-manual-lote-row').length < qtd) adicionarLinhaLoteManual();
  atualizarNumeracaoLotesManual();
}

function adicionarLinhaLoteManual(dados = {}) {
  const container = document.getElementById('lm_lotes_container');
  if (!container) return;

  _lmSeq += 1;
  const id = `lm_lote_${_lmSeq}`;
  const row = document.createElement('div');
  row.className = 'ff-manual-lote-row';
  row.dataset.id = id;
  row.innerHTML = `
    <div class="ff-manual-lote-top">
      <div class="ff-manual-lote-title">Lote</div>
      <button type="button" class="ff-manual-remove" onclick="removerLinhaLoteManual('${id}')"><i class="fas fa-trash"></i> Remover</button>
    </div>
    <div class="ff-manual-lote-grid">
      <div class="form-group"><label>OP / Lote *</label><input type="text" class="lm-op" placeholder="Ex: 087999" required autocomplete="off" value="${escapeHtml(String(dados.op || ''))}" /></div>
      <div class="form-group"><label>Produto *</label><input type="text" class="lm-produto-nome" placeholder="Nome do produto" required autocomplete="off" value="${escapeHtml(String(dados.produto_nome || ''))}" /></div>
      <div class="form-group"><label>Cód. Produto</label><input type="text" class="lm-produto-codigo" placeholder="Opcional" autocomplete="off" value="${escapeHtml(String(dados.produto_codigo || ''))}" /></div>
      <div class="form-group"><label>Quantidade *</label><input type="number" class="lm-quantidade" min="0" step="0.0001" placeholder="Ex: 20" required value="${escapeHtml(String(dados.quantidade || ''))}" /></div>
      <div class="form-group">
        <label>Tipo *</label>
        <select class="lm-tipo-lote" required onchange="ajustarLinhaProdutoPorTipo(this)">
          <option value="tinta">Tinta</option>
          <option value="diluente">Diluente</option>
          <option value="endurecedor">Endurecedor</option>
          <option value="base">Base</option>
          <option value="amostra">Amostra</option>
          <option value="saida_manual">Saída manual</option>
        </select>
      </div>
      <div class="form-group">
        <label>Linha do Produto</label>
        <select class="lm-linha-produto">
          <option value="">Selecionar depois</option>
          <option value="Esmalte Sintético">Esmalte Sintético</option>
          <option value="Epóxi">Epóxi</option>
          <option value="Poliuretano">Poliuretano</option>
          <option value="PU Acrílico">PU Acrílico</option>
          <option value="Base Água">Base Água</option>
          <option value="Verniz">Verniz</option>
          <option value="Endurecedor">Endurecedor</option>
          <option value="Diluente">Diluente</option>
          <option value="Alumínio">Alumínio</option>
        </select>
      </div>
    </div>`;

  container.appendChild(row);
  const tipo = row.querySelector('.lm-tipo-lote');
  const linha = row.querySelector('.lm-linha-produto');
  if (tipo && dados.tipo_lote) tipo.value = dados.tipo_lote;
  if (linha && dados.linha_produto) linha.value = dados.linha_produto;
  atualizarNumeracaoLotesManual();
  row.querySelector('.lm-op')?.focus();
}

function removerLinhaLoteManual(id) {
  const container = document.getElementById('lm_lotes_container');
  const rows = container ? [...container.querySelectorAll('.ff-manual-lote-row')] : [];
  if (rows.length <= 1) {
    setStatusLoteManual('<i class="fas fa-exclamation-triangle"></i> Precisa ter pelo menos 1 lote.', 'warn');
    return;
  }
  container.querySelector(`[data-id="${id}"]`)?.remove();
  atualizarNumeracaoLotesManual();
}

function atualizarNumeracaoLotesManual() {
  document.querySelectorAll('#lm_lotes_container .ff-manual-lote-row').forEach((row, i) => {
    const title = row.querySelector('.ff-manual-lote-title');
    if (title) title.textContent = `Lote ${i + 1}`;
    const btn = row.querySelector('.ff-manual-remove');
    if (btn) btn.style.display = document.querySelectorAll('#lm_lotes_container .ff-manual-lote-row').length <= 1 ? 'none' : 'inline-flex';
  });
}

function ajustarLinhaProdutoPorTipo(select) {
  const row = select.closest('.ff-manual-lote-row');
  const linha = row?.querySelector('.lm-linha-produto');
  if (!linha || linha.value) return;
  if (select.value === 'diluente') linha.value = 'Diluente';
  if (select.value === 'endurecedor') linha.value = 'Endurecedor';
}

async function buscarClienteLoteManual() {
  const codigoEl = document.getElementById('lm_cliente_codigo');
  const nomeEl = document.getElementById('lm_cliente_nome');
  const hint = document.getElementById('lm_cliente_hint');
  const codigo = String(codigoEl?.value || '').trim();
  if (!codigo) return;

  try {
    if (hint) hint.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando cliente no MySQL...';
    const apiBase = ffResolveApiBase();
    const url = `${apiBase}/api/clientes?search=${encodeURIComponent(codigo)}&limit=10`;
    const res = await fetch(url, { headers: ffAuthHeaders(false) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || `Erro HTTP ${res.status}`);

    const lista = Array.isArray(json.data) ? json.data : [];
    const codigoNorm = codigo.replace(/^0+/, '');
    const cliente = lista.find(c => String(c.cli_codigo || '').trim() === codigo)
      || lista.find(c => String(c.cli_codigo || '').trim().replace(/^0+/, '') === codigoNorm)
      || lista[0];

    if (!cliente) {
      _lmClienteCache = null;
      if (hint) hint.innerHTML = '<span style="color:#fcd34d">Cliente não encontrado. Você pode preencher o nome manualmente.</span>';
      return;
    }

    _lmClienteCache = cliente;
    if (nomeEl) nomeEl.value = cliente.cli_nome || '';
    document.getElementById('lm_cliente_endereco').value = cliente.cli_endereco || '';
    document.getElementById('lm_cliente_bairro').value = cliente.cli_bairro || '';
    document.getElementById('lm_cliente_cidade').value = cliente.cli_cidade || '';
    document.getElementById('lm_cliente_cep').value = cliente.cli_cep || '';
    document.getElementById('lm_cliente_estado').value = cliente.cli_estado || '';
    if (hint) hint.innerHTML = `<span style="color:#86efac"><i class="fas fa-check-circle"></i> Cliente encontrado: ${escapeHtml(cliente.cli_nome || '')}</span>`;
  } catch (err) {
    console.warn('Buscar cliente manual falhou:', err);
    if (hint) hint.innerHTML = `<span style="color:#fca5a5">Não consegui buscar o cliente: ${escapeHtml(err.message)}</span>`;
  }
}

function setorInicialLoteManual(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t === 'amostra') return 'laboratorio_amostras';
  if (t === 'diluente') return 'envase_produzir';
  if (t === 'saida_manual') return 'envase_produzir';
  return 'coloracao_revisao';
}

function montarPayloadsLoteManual() {
  const numeroPedido = document.getElementById('lm_pedido')?.value.trim() || `MANUAL-${Date.now()}`;
  const prioridade = document.getElementById('lm_prioridade')?.value || 'normal';
  const clienteCodigo = document.getElementById('lm_cliente_codigo')?.value.trim() || '';
  const clienteNome = document.getElementById('lm_cliente_nome')?.value.trim() || '';

  const clienteDados = {
    cliente_endereco: document.getElementById('lm_cliente_endereco')?.value || '',
    cliente_bairro: document.getElementById('lm_cliente_bairro')?.value || '',
    cliente_cidade: document.getElementById('lm_cliente_cidade')?.value || '',
    cliente_cep: document.getElementById('lm_cliente_cep')?.value || '',
    cliente_estado: document.getElementById('lm_cliente_estado')?.value || '',
  };

  const rows = [...document.querySelectorAll('#lm_lotes_container .ff-manual-lote-row')];
  return rows.map(row => {
    const quantidadeRaw = row.querySelector('.lm-quantidade')?.value || '0';
    const quantidade = Number(String(quantidadeRaw).replace(',', '.'));
    const tipo = row.querySelector('.lm-tipo-lote')?.value || 'tinta';

    return {
      numero_pedido: numeroPedido,
      op: row.querySelector('.lm-op')?.value.trim() || '',
      cliente_codigo: clienteCodigo,
      cliente_nome: clienteNome,
      ...clienteDados,
      produto_codigo: row.querySelector('.lm-produto-codigo')?.value.trim() || '',
      produto_nome: row.querySelector('.lm-produto-nome')?.value.trim() || '',
      quantidade: Number.isFinite(quantidade) ? quantidade : 0,
      tipo_lote: tipo,
      linha_produto: row.querySelector('.lm-linha-produto')?.value || '',
      prioridade,
      setor_atual: setorInicialLoteManual(tipo),
      status: 'aguardando',
      origem: 'MANUAL'
    };
  });
}

function validarPayloadsLoteManual(payloads) {
  if (!document.getElementById('lm_cliente_nome')?.value.trim()) return 'Informe o cliente.';
  if (!payloads.length) return 'Adicione pelo menos 1 lote.';

  const ops = new Set();
  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i];
    const n = i + 1;
    if (!p.op) return `Informe a OP/Lote do lote ${n}.`;
    if (ops.has(p.op)) return `A OP ${p.op} foi repetida na tela.`;
    ops.add(p.op);
    if (!p.produto_nome && !p.produto_codigo) return `Informe o produto do lote ${n}.`;
    if (!p.quantidade || p.quantidade <= 0) return `Informe uma quantidade maior que zero no lote ${n}.`;
  }
  return null;
}

async function criarLoteManual(payload) {
  const apiBase = ffResolveApiBase();
  const res = await fetch(`${apiBase}/api/producao/manual`, {
    method: 'POST',
    headers: ffAuthHeaders(true),
    body: JSON.stringify(payload)
  });

  let json = null;
  try { json = await res.json(); } catch (_) { json = { ok: false, error: 'Resposta inválida do servidor' }; }
  if (!res.ok || !json.ok) throw new Error(json.error || json.detail || `Erro HTTP ${res.status}`);
  return json.data || json;
}

async function salvarLoteManual(event) {
  if (event) event.preventDefault();

  const btn = document.getElementById('btnSalvarLoteManual');
  const original = btn ? btn.innerHTML : '';

  try {
    limparStatusLoteManual();
    const payloads = montarPayloadsLoteManual();
    const erro = validarPayloadsLoteManual(payloads);
    if (erro) {
      setStatusLoteManual(`<i class="fas fa-exclamation-triangle"></i> ${erro}`, 'err');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando ${payloads.length} lote(s)...`;
    }

    const criados = [];
    for (const payload of payloads) {
      const lote = await criarLoteManual(payload);
      criados.push(lote);
    }

    setStatusLoteManual(
      `<i class="fas fa-check-circle"></i> ${criados.length} lote(s) criado(s) com sucesso. ${criados.map(l => `OP ${escapeHtml(String(l.op || ''))}`).join(' · ')}`,
      'ok'
    );

    if (typeof reloadData === 'function') await reloadData().catch(() => {});
    if (typeof loadBridgeLots === 'function') await loadBridgeLots().catch(() => {});
    if (typeof renderKanban === 'function') renderKanban();
    if (typeof renderLots === 'function') renderLots();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof updateAlertBadge === 'function') updateAlertBadge();

    setTimeout(() => fecharModalLoteManual(), 1100);
    return criados;
  } catch (err) {
    console.error('Erro ao criar lote manual:', err);
    setStatusLoteManual(`<i class="fas fa-times-circle"></i> ${escapeHtml(err.message)}`, 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original || '<i class="fas fa-save"></i> Salvar lote(s)';
    }
  }
}

// Garante que o botão fica escondido/visível depois do login, mesmo que o HTML carregue antes.
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(atualizarVisibilidadeBotaoLoteManual, 300);
  setTimeout(atualizarVisibilidadeBotaoLoteManual, 1200);
});



// ===================================================
// DRAG SCROLL HORIZONTAL DO KANBAN
// Permite arrastar o quadro Kanban para os lados com o mouse.
// Funciona mesmo quando o Kanban é re-renderizado.
// ===================================================
(function setupKanbanHorizontalDragScroll() {
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let board = null;

  function getBoardFromEvent(e) {
    return e.target && e.target.closest ? e.target.closest('#kanbanBoard') : null;
  }

  document.addEventListener('mousedown', (e) => {
    const b = getBoardFromEvent(e);
    if (!b) return;

    if (e.target.closest('button, input, textarea, select, .modal, .modal-overlay')) return;

    board = b;
    isDown = true;
    startX = e.pageX - board.offsetLeft;
    scrollLeft = board.scrollLeft;
    board.classList.add('dragging');
  });

  document.addEventListener('mouseup', () => {
    if (board) board.classList.remove('dragging');
    isDown = false;
    board = null;
  });

  document.addEventListener('mouseleave', () => {
    if (board) board.classList.remove('dragging');
    isDown = false;
    board = null;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDown || !board) return;

    e.preventDefault();

    const x = e.pageX - board.offsetLeft;
    const walk = (x - startX) * 1.5;

    board.scrollLeft = scrollLeft - walk;
  });
})();

