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
      cor:         '#3b82f6',
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

  // Cria o botão e adiciona após o botão de logout ou no fim da sidebar
  const btn = document.createElement('button');
  btn.id        = 'ffEncerrarExpBtn';
  btn.className = 'btn btn-danger btn-sm';
  btn.innerHTML = '<i class="fas fa-power-off"></i> Encerrar Exp. Geral';
  btn.title     = 'Encerrar expediente de todos os setores';
  btn.style.cssText = 'margin:8px 12px;width:calc(100% - 24px);font-size:.78rem;';
  btn.onclick = ffOpenEncerrarExpedienteGeral;

  // Tenta inserir na sidebar após o último nav-item ou antes do logout
  const sidebar  = document.querySelector('.sidebar, #sidebar, nav.side-nav');
  const logoutEl = document.getElementById('logoutBtn') || document.querySelector('[onclick*="logout"]');

  if (logoutEl && logoutEl.parentNode) {
    logoutEl.parentNode.insertBefore(btn, logoutEl);
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
        Tem certeza que deseja encerrar o expediente de <strong>todos os setores</strong>?<br>
        <span style="color:#f87171;font-size:.85rem">Esta ação será registrada no sistema com o horário atual.</span>
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

async function ffConfirmarEncerrarExpedienteGeral(btn) {
  if (!btn) return;
  btn.disabled  = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encerrando...';

  try {
    const user = (typeof STATE !== 'undefined') ? STATE.currentUser : null;
    const now  = Date.now();

    // Tenta endpoint dedicado primeiro
    const base = (typeof API_BASE !== 'undefined' ? API_BASE : '')
               || (typeof resolveFactoryFlowApiBase === 'function' ? resolveFactoryFlowApiBase() : '');

    let sucesso = false;

    if (base) {
      const headers = { 'Content-Type': 'application/json' };
      const jwt = user?.token || sessionStorage.getItem('ff_token') || localStorage.getItem('ff_token') || '';
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

      const res = await fetch(`${base}/api/expediente/encerrar-geral`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ encerradoPor: user?.name || 'admin', timestamp: now })
      });
      if (res.ok) sucesso = true;
    }

    // Fallback: encerra expediente localmente via sectorShifts se disponível
    if (!sucesso && typeof sectorShifts !== 'undefined') {
      Object.keys(sectorShifts).forEach(setor => {
        if (sectorShifts[setor] && sectorShifts[setor].expediente_aberto) {
          sectorShifts[setor].expediente_aberto  = 0;
          sectorShifts[setor].finalizado_em       = new Date(now).toISOString();
        }
      });
      sucesso = true;
    }

    // Fecha o modal de confirmação
    document.getElementById('ffEncerrarExpOverlay')?.remove();

    if (sucesso) {
      if (typeof showToast === 'function') {
        showToast('✅ Expediente geral encerrado com sucesso.', 'success');
      }
      // Atualiza a tela
      if (typeof reloadData === 'function') {
        await reloadData().catch(() => {});
      }
      const activePage = document.querySelector('.nav-item.active')?.dataset.page;
      if (activePage && typeof _silentRefresh === 'function') {
        _silentRefresh(activePage);
      }
      if (typeof updateExpedienteButton === 'function') {
        updateExpedienteButton();
      }
    } else {
      if (typeof showToast === 'function') {
        showToast('Não foi possível encerrar o expediente geral. Verifique a conexão.', 'error');
      }
    }

  } catch (e) {
    console.error('[expediente-alerts] Erro ao encerrar expediente geral:', e);
    if (typeof showToast === 'function') {
      showToast('Erro ao encerrar expediente geral: ' + e.message, 'error');
    }
  } finally {
    if (btn) {
      btn.disabled  = false;
      btn.innerHTML = '<i class="fas fa-power-off"></i> Sim, encerrar todos';
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
