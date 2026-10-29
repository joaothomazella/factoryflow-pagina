// ===================================================
// EXPEDIENTE-ALERTS.JS – Alertas de Expediente
// FactoryFlow v1.0
//
// Exibe modais grandes nos horários de abertura, almoço,
// reabertura e encerramento do expediente.
// Controla duplicatas via localStorage.
// Inclui botão admin "Encerrar expediente geral".
// ===================================================
'use strict';

// ─────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DOS ALERTAS
// ─────────────────────────────────────────────────────────────────

/**
 * Retorna a lista de alertas do dia, ajustando horários para sexta-feira
 * e última sexta-feira do mês.
 */
function ffGetExpedienteAlertsForToday() {
  const now    = new Date();
  const dow    = now.getDay(); // 0=dom, 5=sex
  const isFri  = dow === 5;
  const isLastFri = isFri && ffIsLastFridayOfMonth(now);

  // Horário de encerramento depende do dia
  let encerramentoHHMM;
  if (isLastFri)    encerramentoHHMM = '1520'; // Última sexta: 15:20
  else if (isFri)   encerramentoHHMM = '1625'; // Sexta normal: 16:25
  else              encerramentoHHMM = '1725'; // Demais dias: 17:25

  const encerrarTime   = encerramentoHHMM.slice(0,2) + ':' + encerramentoHHMM.slice(2);
  const encerrarLabel  = `${encerrarTime}`;

  return [
    {
      id:          '0710',
      hora:        '07:10',
      titulo:      '🏭 ABRIR EXPEDIENTE',
      mensagem:    'Favor abrir o expediente do seu setor para registrar o início das atividades.',
      cor:         '#22c55e',
      icone:       'fas fa-door-open',
      // Sem condição: sempre exibe às 07:10
      condicao:    null
    },
    {
      id:          '1125',
      hora:        '11:25',
      titulo:      '🍽️ HORÁRIO DE ALMOÇO EM BREVE',
      mensagem:    'Favor fechar o expediente do seu setor antes de sair para o almoço.',
      cor:         '#f59e0b',
      icone:       'fas fa-utensils',
      // Só exibe se expediente estiver ABERTO
      condicao:    'expediente_aberto'
    },
    {
      id:          '1305',
      hora:        '13:05',
      titulo:      '🔄 REABRIR EXPEDIENTE',
      mensagem:    'Favor reabrir o expediente do seu setor. O horário de almoço encerrou.',
      cor:         '#144196',
      icone:       'fas fa-redo',
      // Só exibe se expediente estiver FECHADO
      condicao:    'expediente_fechado'
    },
    {
      id:          encerramentoHHMM,
      hora:        encerrarLabel,
      titulo:      '🔒 ENCERRAR EXPEDIENTE',
      mensagem:    'Favor fechar o expediente do seu setor antes de sair. Boa tarde!',
      cor:         '#ef4444',
      icone:       'fas fa-door-closed',
      // Sem condição: sempre exibe no horário de encerramento
      condicao:    null
    }
  ];
}

/** Verifica se uma data cai na última sexta-feira do mês */
function ffIsLastFridayOfMonth(date) {
  const d = new Date(date);
  // Avança para ver se há outra sexta no mês
  const nextFri = new Date(d);
  nextFri.setDate(d.getDate() + 7);
  return nextFri.getMonth() !== d.getMonth();
}

// ─────────────────────────────────────────────────────────────────
// CONTROLE DE DUPLICATAS (localStorage)
// ─────────────────────────────────────────────────────────────────

function ffGetAlertKey(alertId) {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return `ff_alerta_expediente_${dateStr}_${alertId}`;
}

function ffAlertWasShownToday(alertId) {
  return localStorage.getItem(ffGetAlertKey(alertId)) === '1';
}

function ffMarkAlertShown(alertId) {
  localStorage.setItem(ffGetAlertKey(alertId), '1');
}

// ─────────────────────────────────────────────────────────────────
// VERIFICAÇÃO DE CONDIÇÃO DO EXPEDIENTE
// ─────────────────────────────────────────────────────────────────

/**
 * Verifica se o expediente do usuário atual está aberto.
 * Usa isExpedienteAbertoForSector se disponível, caso contrário
 * verifica STATE.currentUser.sector ou fallback true.
 */
function ffIsExpedienteAberto() {
  try {
    const user   = (typeof STATE !== 'undefined') ? STATE.currentUser : null;
    const sector = user?.sector || user?.setor || null;
    if (sector && typeof isExpedienteAbertoForSector === 'function') {
      return isExpedienteAbertoForSector(sector);
    }
    // Fallback: verifica via sectorShifts global se existir
    if (typeof sectorShifts !== 'undefined' && sector) {
      const shift = sectorShifts[sector];
      return !!(shift && shift.expediente_aberto);
    }
    return false;
  } catch (_) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// MODAL DE ALERTA
// ─────────────────────────────────────────────────────────────────

let _ffAlertActive = false;

function ffShowExpedienteAlertModal(alerta) {
  if (_ffAlertActive) return; // já tem um modal ativo

  // Injeta o CSS do modal se ainda não existir
  ffInjectAlertStyles();

  _ffAlertActive = true;
  ffMarkAlertShown(alerta.id);

  const overlay = document.createElement('div');
  overlay.id        = 'ffExpedienteAlertOverlay';
  overlay.className = 'ff-alert-overlay';
  overlay.innerHTML = `
    <div class="ff-alert-modal" role="alertdialog" aria-modal="true" aria-labelledby="ffAlertTitle">
      <div class="ff-alert-icon-wrap" style="background:${alerta.cor}22;border:3px solid ${alerta.cor}">
        <i class="${alerta.icone}" style="color:${alerta.cor}"></i>
      </div>
      <div id="ffAlertTitle" class="ff-alert-title" style="color:${alerta.cor}">${alerta.titulo}</div>
      <div class="ff-alert-message">${alerta.mensagem}</div>
      <div class="ff-alert-time">
        <i class="fas fa-clock"></i> ${new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
      </div>
      <button class="ff-alert-btn" style="background:${alerta.cor}" onclick="ffCloseExpedienteAlert()">
        <i class="fas fa-check"></i> Entendi — Fechar aviso
      </button>
    </div>`;

  document.body.appendChild(overlay);

  // Animação de entrada
  requestAnimationFrame(() => {
    overlay.classList.add('ff-alert-visible');
  });
}

function ffCloseExpedienteAlert() {
  const overlay = document.getElementById('ffExpedienteAlertOverlay');
  if (overlay) {
    overlay.classList.remove('ff-alert-visible');
    overlay.classList.add('ff-alert-closing');
    setTimeout(() => {
      overlay.remove();
      _ffAlertActive = false;
    }, 300);
  } else {
    _ffAlertActive = false;
  }
}

// ─────────────────────────────────────────────────────────────────
// ENGINE PRINCIPAL: checar hora atual vs alertas configurados
// ─────────────────────────────────────────────────────────────────

let _ffAlertCheckInterval = null;

function ffStartExpedienteAlerts() {
  if (_ffAlertCheckInterval) return; // já iniciado
  // Checa a cada 30 segundos
  _ffAlertCheckInterval = setInterval(ffCheckExpedienteAlerts, 30000);
  // Checa também imediatamente (pode já ter passado o horário hoje)
  ffCheckExpedienteAlerts();
}

function ffStopExpedienteAlerts() {
  if (_ffAlertCheckInterval) {
    clearInterval(_ffAlertCheckInterval);
    _ffAlertCheckInterval = null;
  }
}

function ffCheckExpedienteAlerts() {
  try {
    // Não exibe se usuário não está logado
    if (typeof STATE === 'undefined' || !STATE.currentUser) return;

    const now  = new Date();
    const hhmm = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');

    const alertas = ffGetExpedienteAlertsForToday();

    for (const alerta of alertas) {
      const alertaHHMM = alerta.hora.replace(':', '');

      // Janela de disparo: ±5 minutos do horário configurado
      const diffMin = (parseInt(hhmm,10) - parseInt(alertaHHMM,10));
      const dentroJanela = diffMin >= 0 && diffMin <= 5;

      if (!dentroJanela) continue;
      if (ffAlertWasShownToday(alerta.id)) continue;
      if (_ffAlertActive) continue; // aguarda o usuário fechar o atual

      // Verifica condição
      if (alerta.condicao === 'expediente_aberto'  && !ffIsExpedienteAberto()) continue;
      if (alerta.condicao === 'expediente_fechado' &&  ffIsExpedienteAberto()) continue;

      // Dispara o modal!
      ffShowExpedienteAlertModal(alerta);
      break; // um alerta por vez
    }
  } catch (e) {
    console.warn('[expediente-alerts] Erro ao checar alertas:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// BOTÃO ADMIN: ENCERRAR EXPEDIENTE GERAL
// ─────────────────────────────────────────────────────────────────

/**
 * Exibe o botão "Encerrar expediente geral" na sidebar ou no cabeçalho
 * SOMENTE para admin/manager. Chamado após login bem-sucedido.
 */
function ffInjectEncerrarExpedienteButton() {
  // Remove instâncias anteriores para evitar duplicação
  document.getElementById('ffEncerrarExpBtn')?.remove();

  const user = (typeof STATE !== 'undefined') ? STATE.currentUser : null;
  if (!user) return;

  const adminRoles = ['admin', 'manager', 'gerente', 'diretoria'];
  if (!adminRoles.includes(String(user.role || '').toLowerCase())) return;

  // Cria o botão e adiciona dentro do sidebar-footer, logo após o botão de logout
  // (precisa ficar dentro do footer para não vazar/cortar no fim da tela em telas
  // pequenas — ver .sidebar-footer com overflow-y:auto).
  const btn = document.createElement('button');
  btn.id        = 'ffEncerrarExpBtn';
  btn.className = 'btn-logout';
  btn.innerHTML = '<i class="fas fa-power-off"></i> Encerrar Exp. Geral';
  btn.title     = 'Encerrar expediente de todos os setores';
  btn.style.cssText = 'margin-top:.5rem;';
  btn.onclick = ffOpenEncerrarExpedienteGeral;

  // Tenta inserir na sidebar após o último nav-item ou antes do logout
  const sidebar  = document.querySelector('.sidebar-footer') || document.querySelector('.sidebar, #sidebar, nav.side-nav');
  const logoutEl = document.getElementById('logoutBtn') || document.querySelector('.btn-logout, [onclick*="Logout"], [onclick*="logout"]');

  if (logoutEl && logoutEl.parentNode) {
    logoutEl.insertAdjacentElement('afterend', btn);
  } else if (sidebar) {
    sidebar.appendChild(btn);
  }
}

function ffOpenEncerrarExpedienteGeral() {
  ffInjectAlertStyles();

  const overlay = document.createElement('div');
  overlay.id        = 'ffEncerrarExpOverlay';
  overlay.className = 'ff-alert-overlay';
  overlay.innerHTML = `
    <div class="ff-alert-modal ff-confirm-modal" role="dialog" aria-modal="true">
      <div class="ff-alert-icon-wrap" style="background:rgba(239,68,68,.15);border:3px solid #ef4444">
        <i class="fas fa-power-off" style="color:#ef4444"></i>
      </div>
      <div class="ff-alert-title" style="color:#ef4444">ENCERRAR EXPEDIENTE GERAL</div>
      <div class="ff-alert-message">
        Encerrar o expediente de <strong>todos os setores que estiverem abertos</strong>, agora?<br>
        <span style="font-size:.85rem">O fechamento é registrado com o horário atual e o tempo dos lotes desses setores para de contar.</span><br>
        <span style="color:#f87171;font-size:.85rem">Setor que já está fechado não é alterado.</span>
      </div>
      <div style="display:flex;gap:12px;margin-top:1.5rem;justify-content:center">
        <button class="ff-alert-btn ff-alert-btn-cancel" onclick="document.getElementById('ffEncerrarExpOverlay').remove()">
          <i class="fas fa-times"></i> Cancelar
        </button>
        <button class="ff-alert-btn" style="background:#ef4444" onclick="ffConfirmarEncerrarExpedienteGeral(this)">
          <i class="fas fa-power-off"></i> Sim, encerrar todos
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('ff-alert-visible'));
}

// Envia o encerramento para o backend.
//
// Usa o expedienteApiPost do js/data.js, que e o MESMO caminho que o botao
// de expediente de setor usa (mesma base de URL, mesmo cabecalho de
// autenticacao). A versao anterior montava o fetch na mao, com outra base e
// outra procura de token, e por isso nao chegava no servidor.
async function ffPostEncerrarExpedienteGeral() {
  const user = (typeof STATE !== 'undefined' && STATE) ? STATE.currentUser : null;
  const corpo = { encerradoPor: user?.name || user?.login || 'admin', timestamp: Date.now() };

  if (typeof expedienteApiPost === 'function') {
    return expedienteApiPost('/api/expediente/encerrar-geral', corpo);
  }

  // Caminho reserva, caso este arquivo carregue sem o data.js.
  const base = (typeof BRIDGE_CONFIG !== 'undefined' && BRIDGE_CONFIG.baseUrl)
    ? BRIDGE_CONFIG.baseUrl
    : (typeof resolveFactoryFlowApiBase === 'function' ? resolveFactoryFlowApiBase() : '');
  const headers = (typeof bridgeAuthHeaders === 'function')
    ? bridgeAuthHeaders(true)
    : (typeof factoryFlowAuthHeaders === 'function' ? factoryFlowAuthHeaders(true) : { 'Content-Type': 'application/json' });

  const res  = await fetch(`${base}/api/expediente/encerrar-geral`, {
    method: 'POST', headers, body: JSON.stringify(corpo)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || json.detail || `O servidor respondeu ${res.status}`);
  }
  return json;
}

async function ffConfirmarEncerrarExpedienteGeral(btn) {
  if (!btn || btn.disabled) return;

  const rotuloBotao = '<i class="fas fa-power-off"></i> Sim, encerrar todos';
  const msgEl = document.querySelector('#ffEncerrarExpOverlay .ff-alert-message');
  const diga  = html => { if (msgEl) msgEl.innerHTML = html; };

  btn.disabled  = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encerrando...';

  try {
    diga('Fechando o expediente dos setores...');

    const json = await ffPostEncerrarExpedienteGeral();
    const fechados = Array.isArray(json.fechados) ? json.fechados : [];
    const ignorados = Array.isArray(json.ignorados) ? json.ignorados : [];

    // Nenhum setor estava aberto: isso NAO e sucesso nem erro, e so nao ter
    // o que fazer. Dizer "encerrado com sucesso" aqui seria mentir.
    if (!fechados.length) {
      document.getElementById('ffEncerrarExpOverlay')?.remove();
      if (typeof showToast === 'function') {
        showToast('Nenhum setor estava com o expediente aberto.', 'error');
      }
      return;
    }

    // O expediente ja esta fechado no banco. O que vem agora e consequencia:
    // congelar o tempo dos lotes de cada setor, exatamente como o botao de
    // setor faz quando alguem fecha o proprio expediente.
    diga(`Expediente fechado em <strong>${fechados.length} setor(es)</strong>.<br>Congelando o tempo dos lotes...`);

    const normaliza = (typeof normalizeShiftGroup === 'function')
      ? normalizeShiftGroup
      : (s => String(s || ''));

    // Atualiza o estado local com o que o servidor realmente gravou, antes de
    // congelar - freezeLotsForShiftClose le STATE.sectorShifts.
    if (typeof STATE !== 'undefined' && STATE) {
      STATE.sectorShifts = STATE.sectorShifts || {};
      fechados.forEach(row => {
        const grupo = normaliza(row.setor);
        if (grupo) STATE.sectorShifts[grupo] = { ...row, setor: grupo };
      });
    }
    if (typeof updateExpedienteButton === 'function') updateExpedienteButton();

    // Cada lote salvo dispara um redesenho da pagina; com varios setores isso
    // seria a tela inteira sendo reconstruida dezenas de vezes. O freio e o
    // mesmo usado pela acao em massa de lotes.
    let lotesCongelados = 0;
    if (typeof ffSuspenderRedesenhoDeLote === 'function') ffSuspenderRedesenhoDeLote(true);
    try {
      for (let i = 0; i < fechados.length; i++) {
        const row   = fechados[i];
        const grupo = normaliza(row.setor);
        if (!grupo) continue;

        const fechadoMs = (typeof parseFactoryFlowDateMs === 'function')
          ? parseFactoryFlowDateMs(row.finalizado_em || row.finalizadoEm)
          : Date.parse(row.finalizado_em || '');
        const closeMs = Number.isFinite(fechadoMs) ? fechadoMs : Date.now();

        diga(`Expediente fechado em <strong>${fechados.length} setor(es)</strong>.<br>Congelando o tempo dos lotes (${i + 1}/${fechados.length})...`);

        if (typeof getLotsByShiftGroup === 'function') {
          lotesCongelados += (getLotsByShiftGroup(grupo) || []).length;
        }
        if (typeof freezeLotsForShiftClose === 'function') {
          try { await freezeLotsForShiftClose(grupo, closeMs); }
          catch (e) { console.warn(`[expediente] falha ao congelar lotes de ${grupo}:`, e.message); }
        }
      }
    } finally {
      if (typeof ffSuspenderRedesenhoDeLote === 'function') ffSuspenderRedesenhoDeLote(false);
    }

    // Reler do servidor: dai em diante a tela mostra a verdade gravada, nao o
    // que este navegador acha que gravou.
    if (typeof loadSectorShifts === 'function') {
      await loadSectorShifts().catch(() => {});
    }
    if (typeof reloadData === 'function') {
      await reloadData().catch(() => {});
    }
    if (typeof updateExpedienteButton === 'function') updateExpedienteButton();
    if (typeof refreshActiveFactoryFlowPage === 'function') {
      try { await refreshActiveFactoryFlowPage(); } catch (_) {}
    }

    document.getElementById('ffEncerrarExpOverlay')?.remove();

    if (typeof showToast === 'function') {
      const quantos = `${fechados.length} setor${fechados.length > 1 ? 'es' : ''}`;
      const lotes   = lotesCongelados ? `, ${lotesCongelados} lote(s) congelado(s)` : '';
      showToast(`✅ Expediente encerrado em ${quantos}${lotes}.`, 'success');
    }

    // Setor que estava com outra alteracao em andamento nao foi tocado. Isso
    // precisa ser dito, senao a pessoa vai embora achando que fechou tudo.
    if (ignorados.length) {
      const nomes = ignorados.map(s => {
        if (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[s]) return SECTOR_LABELS[s];
        return s;
      }).join(', ');
      alert(
        'Atencao: estes setores NAO foram encerrados porque tinham uma alteracao de expediente em andamento no momento:\n\n' +
        nomes +
        '\n\nEspere alguns segundos e clique em "Encerrar Exp. Geral" de novo para fechar esses.'
      );
    }

  } catch (e) {
    console.error('[expediente-alerts] Erro ao encerrar expediente geral:', e);
    // O modal FICA ABERTO no erro, com o motivo na tela: fechar o modal e
    // mostrar um toast que desaparece faria o encerramento parecer feito.
    diga(
      '<span style="color:#f87171"><strong>Nao foi possivel encerrar o expediente.</strong></span><br>' +
      '<span style="font-size:.85rem">' + String(e.message || e).replace(/</g, '&lt;') + '</span><br>' +
      '<span style="font-size:.8rem;color:#94a3b8">Nada foi alterado. Confira a conexao e tente de novo.</span>'
    );
    if (typeof showToast === 'function') {
      showToast('Erro ao encerrar o expediente geral: ' + (e.message || e), 'error');
    }
  } finally {
    if (btn && document.body.contains(btn)) {
      btn.disabled  = false;
      btn.innerHTML = rotuloBotao;
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// INJEÇÃO DE CSS
// ─────────────────────────────────────────────────────────────────

function ffInjectAlertStyles() {
  if (document.getElementById('ff-alert-styles')) return;

  const style = document.createElement('style');
  style.id = 'ff-alert-styles';
  style.textContent = `
    /* ======================================================
       FactoryFlow – Alertas de Expediente
       ====================================================== */
    .ff-alert-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0,0,0,.75);
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
      opacity: 0;
      transition: opacity .25s ease;
      pointer-events: none;
    }
    .ff-alert-overlay.ff-alert-visible {
      opacity: 1;
      pointer-events: all;
    }
    .ff-alert-overlay.ff-alert-closing {
      opacity: 0;
      pointer-events: none;
    }
    .ff-alert-modal {
      background: #0f172a;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 20px;
      padding: 2.5rem 2.8rem;
      max-width: 520px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0,0,0,.7);
      transform: scale(.92);
      transition: transform .25s cubic-bezier(.34,1.56,.64,1);
    }
    .ff-alert-overlay.ff-alert-visible .ff-alert-modal {
      transform: scale(1);
    }
    .ff-alert-icon-wrap {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.4rem;
    }
    .ff-alert-icon-wrap i {
      font-size: 2.5rem;
    }
    .ff-alert-title {
      font-size: 1.55rem;
      font-weight: 800;
      letter-spacing: .02em;
      margin-bottom: .8rem;
      line-height: 1.2;
    }
    .ff-alert-message {
      font-size: 1.05rem;
      color: #cbd5e1;
      line-height: 1.6;
      margin-bottom: 1.2rem;
    }
    .ff-alert-time {
      font-size: .85rem;
      color: #64748b;
      margin-bottom: 1.8rem;
    }
    .ff-alert-btn {
      display: inline-flex;
      align-items: center;
      gap: .55rem;
      padding: .85rem 2.2rem;
      border: none;
      border-radius: 10px;
      color: #fff;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity .15s, transform .1s;
      letter-spacing: .02em;
    }
    .ff-alert-btn:hover { opacity: .88; transform: translateY(-1px); }
    .ff-alert-btn:active { transform: translateY(0); }
    .ff-alert-btn-cancel {
      background: #334155 !important;
      color: #94a3b8;
    }
    .ff-confirm-modal .ff-alert-message strong { color: #f1f5f9; }
  `;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────
// AUTO-START: inicia quando o usuário faz login
// ─────────────────────────────────────────────────────────────────

/**
 * Chamado após login bem-sucedido (hookado em auth.js / app.js).
 * Inicia o sistema de alertas e injeta o botão admin se necessário.
 */
function ffInitExpedienteAlerts() {
  ffInjectAlertStyles();
  ffStartExpedienteAlerts();
  // Injeta botão admin após pequeno delay para garantir DOM pronto
  setTimeout(ffInjectEncerrarExpedienteButton, 500);
}
