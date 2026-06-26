// ===================================================
// AUTH.JS – Autenticação via Backend Central, navegação, alertas e tema
// ===================================================

const AUTH_API_BASE = 'https://paintlab-backend-production.up.railway.app';
const FACTORYFLOW_APP_NAME = 'factoryflow';

// Evita corrida entre checkSession() automático e login manual.
// Esse conflito era o que deixava o botão preso em "Entrando..." no primeiro login.
let _authBusy = false;
let _sessionCheckFinished = false;
let _showAppBusy = false;

function normalizeApps(apps) {
  if (Array.isArray(apps)) {
    return apps.map(a => String(a).trim().toLowerCase()).filter(Boolean);
  }

  if (apps && typeof apps === 'object') {
    return Object.values(apps).map(a => String(a).trim().toLowerCase()).filter(Boolean);
  }

  const raw = String(apps || '').trim();

  if (!raw) return [];

  // Alguns backends podem devolver apps como JSON string: ["factoryflow", "cqvision"]
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(a => String(a).trim().toLowerCase()).filter(Boolean);
    }
  } catch (_) {}

  return raw
    .split(/[,;|\s]+/)
    .map(a => a.trim().toLowerCase())
    .filter(Boolean);
}

function hasFactoryFlowAccessValue(value) {
  const v = normalizeText(value);

  if (!v) return false;

  // Valores explícitos de acesso geral ao app
  if ([
    'factoryflow',
    'factory flow',
    'ff',
    'sim',
    's',
    'yes',
    'true',
    '1',
    'ativo',
    'liberado',
    'acesso',
    'todos',
    'all'
  ].includes(v)) {
    return true;
  }

  // Valores que representam papéis/setores válidos dentro do FactoryFlow
  if ([
    'admin',
    'administrador',
    'diretoria',
    'gerente',
    'manager',
    'pcp',
    'pcp lib',
    'pcp_lib',
    'liberacao',
    'liberacao pcp',
    'operador',
    'setor',
    'sector',
    'laboratorio',
    'lab',
    'coloracao',
    'colorimetria',
    'envase',
    'pesagem',
    'producao',
    'motorista',
    'driver',
    'tv',
    'painel',
    'viewer',
    'visualizador'
  ].includes(v)) {
    return true;
  }

  return false;
}

function mapFactoryRole(role) {
  const r = String(role || '').toLowerCase().trim();
  const map = {
    admin: 'admin',
    diretoria: 'diretoria',
    pcp: 'pcp',
    pcp_lib: 'pcp_lib',
    manager: 'manager',
    gerente: 'manager',
    sector: 'sector',
    setor: 'sector',
    operador: 'sector',
    driver: 'driver',
    motorista: 'driver',
    tv: 'tv',
    viewer: 'viewer',
    visualizador: 'viewer'
  };
  return map[r] || r || 'viewer';
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mapFactorySector(value) {
  const v = normalizeText(value);

  const map = {
    laboratorio: 'laboratorio',
    lab: 'laboratorio',

    coloracao: 'coloracao',
    colorimetria: 'coloracao',

    envase: 'envase',
    pesagem: 'pesagem',
    producao: 'producao',
    expedicao: 'expedicao'
  };

  return map[v] || '';
}

function mapFactoryAccess(user) {
  const acessoFactory = normalizeText(
    user.acesso_factoryflow ||
    user.factoryflow_access ||
    user.acessoFactoryFlow ||
    user.acesso_factory ||
    ''
  );

  const roleOriginal = normalizeText(user.role);

  // Se vier do banco como acesso_factoryflow = Laboratorio / Coloração / Envase,
  // transforma para o formato que o Kanban já entende: role='sector' e sector='...'
  const sectorFromAccess = mapFactorySector(acessoFactory);
  const sectorFromRole = mapFactorySector(roleOriginal);
  const sector = sectorFromAccess || sectorFromRole || mapFactorySector(user.sector || user.setor);

  if (sector) {
    user.role = 'sector';
    user.sector = sector;
    return user;
  }

  // Acessos administrativos do FactoryFlow
  if (['admin', 'administrador'].includes(acessoFactory) || ['admin', 'administrador'].includes(roleOriginal)) {
    user.role = 'admin';
    user.sector = '';
    return user;
  }

  if (['gerente', 'manager'].includes(acessoFactory) || ['gerente', 'manager'].includes(roleOriginal)) {
    user.role = 'manager';
    user.sector = '';
    return user;
  }

  if (['pcp'].includes(acessoFactory) || ['pcp'].includes(roleOriginal)) {
    user.role = 'pcp';
    // Mantém role='pcp' para continuar vendo tudo, mas identifica o expediente como PCP (Liberação).
    user.sector = 'pcp_liberacao';
    return user;
  }

  if (['pcp_lib', 'pcplib', 'liberacao', 'liberacao pcp'].includes(acessoFactory) || ['pcp_lib', 'pcplib'].includes(roleOriginal)) {
    user.role = 'pcp_lib';
    user.sector = 'pcp_liberacao';
    return user;
  }

  if (['tv', 'painel', 'modo tv'].includes(acessoFactory) || ['tv'].includes(roleOriginal)) {
    user.role = 'tv';
    user.sector = '';
    return user;
  }

  if (['motorista', 'driver'].includes(acessoFactory) || ['motorista', 'driver'].includes(roleOriginal)) {
    user.role = 'driver';
    user.sector = '';
    return user;
  }

  user.role = mapFactoryRole(user.role);
  user.sector = user.sector || user.setor || '';
  return user;
}


function normalizeBackendUser(rawUser, token) {
  const apps = normalizeApps(rawUser.apps);
  const role = mapFactoryRole(rawUser.role);

  return {
    ...rawUser,
    id: rawUser.id,
    login: rawUser.login || rawUser.username || rawUser.usuario || '',
    username: rawUser.username || rawUser.usuario || rawUser.login || '',
    name: rawUser.name || rawUser.full_name || rawUser.nome || rawUser.username || rawUser.usuario || rawUser.login || 'Usuário',
    role,
    acesso_factoryflow: rawUser.acesso_factoryflow || rawUser.factoryflow_access || rawUser.acessoFactoryFlow || rawUser.acesso_factory || '',
    acesso_paintlab: rawUser.acesso_paintlab || rawUser.paintlab_access || rawUser.acessoPaintLab || '',
    acesso_cqvision: rawUser.acesso_cqvision || rawUser.cqvision_access || rawUser.acessoCqVision || '',
    sector: rawUser.sector || rawUser.setor || '',
    theme: rawUser.theme || rawUser.tema || localStorage.getItem('ff_theme') || 'dark',
    apps,
    token
  };
}

function userHasFactoryFlowAccess(user) {
  if (!user) return false;

  const apps = normalizeApps(user.apps);

  if (apps.includes(FACTORYFLOW_APP_NAME)) return true;

  // Compatibilidade com retornos diferentes do backend:
  // às vezes o usuário não vem com apps=['factoryflow'], mas vem com acesso_factoryflow ou role válido.
  if (hasFactoryFlowAccessValue(user.acesso_factoryflow)) return true;
  if (hasFactoryFlowAccessValue(user.factoryflow_access)) return true;
  if (hasFactoryFlowAccessValue(user.acessoFactoryFlow)) return true;
  if (hasFactoryFlowAccessValue(user.acesso_factory)) return true;

  // Último fallback: se o backend validou login e devolveu uma role reconhecida do FactoryFlow,
  // permite entrar para não bloquear usuários antigos que não têm o campo apps preenchido.
  if (hasFactoryFlowAccessValue(user.role)) return true;

  return false;
}

function showLoginError(message = 'Credenciais inválidas – acesso negado') {
  const el = document.getElementById('loginError');
  if (!el) return;
  el.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escapeHtml(message)}`;
  el.style.display = 'block';
}

function hideLoginError() {
  const el = document.getElementById('loginError');
  if (el) el.style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();

  if (_authBusy) return;
  _authBusy = true;

  // Espera o checkSession() terminar antes de tentar login manual.
  // Sem isso, os dois fluxos podem tentar abrir o app ao mesmo tempo.
  while (!_sessionCheckFinished) {
    await new Promise(r => setTimeout(r, 100));
  }

  const login = document.getElementById('loginUsername').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPassword').value;
  const btn = e.target.querySelector('button[type=submit]');
  const btnText = btn?.querySelector('.btn-login-text');

  if (!login || !pass) {
    _authBusy = false;
    showLoginError('Preencha usuário e senha.');
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
  hideLoginError();

  try {
    const res = await fetch(`${AUTH_API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: login, senha: pass })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok || !data.user) {
      showLoginError(data.error || data.message || 'Usuário ou senha incorretos.');
      return;
    }

    const user = mapFactoryAccess(normalizeBackendUser(data.user, data.token));

    if (!userHasFactoryFlowAccess(user)) {
      showLoginError('Você não tem acesso ao FactoryFlow.');
      return;
    }

    STATE.currentUser = user;
    STATE.users = [];

    sessionStorage.setItem('ff_user', JSON.stringify(user));
    if (data.token) sessionStorage.setItem('ff_token', data.token);

    if (user.theme) applyTheme(user.theme, false);

    // Motorista → tela separada
    if (user.role === 'driver') {
      sessionStorage.setItem('ff_driver', JSON.stringify(user));
      window.location.href = 'driver.html';
      return;
    }

    // TV → tela de painel
    if (user.role === 'tv') {
      sessionStorage.setItem('ff_tv', JSON.stringify(user));
      window.location.href = 'tv.html';
      return;
    }

    await showApp();

  } catch (err) {
    console.error('Erro no login:', err);
    showLoginError('Erro ao conectar ao servidor. Tente novamente.');
  } finally {
    _authBusy = false;
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
  }
}

function handleLogout() {
  stopAutoUpdate();
  STATE.currentUser = null;
  STATE.lots   = [];
  STATE.routes = [];
  STATE.users  = [];
  STATE.orders = [];

  try {
    sessionStorage.removeItem('ff_user');
    sessionStorage.removeItem('ff_token');
    sessionStorage.removeItem('ff_driver');
    sessionStorage.removeItem('ff_tv');
  } catch(_){}

  document.getElementById('appPage').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';

  const u = document.getElementById('loginUsername');
  const p = document.getElementById('loginPassword');
  if (u) u.value = '';
  if (p) p.value = '';
}

async function checkSession() {
  try {
    const stored = sessionStorage.getItem('ff_user');
    if (stored) {
      const parsed = mapFactoryAccess(normalizeBackendUser(JSON.parse(stored), sessionStorage.getItem('ff_token')));
      if (userHasFactoryFlowAccess(parsed)) {
        STATE.currentUser = parsed;
        if (parsed.theme) applyTheme(parsed.theme, false);

        // Motorista logado tentando abrir o app principal → manda para a tela própria
        if (parsed.role === 'driver') {
          sessionStorage.setItem('ff_driver', JSON.stringify(parsed));
          _sessionCheckFinished = true;
          window.location.href = 'driver.html';
          return;
        }

        // TV logado tentando abrir o app principal → manda para a tela própria
        if (parsed.role === 'tv') {
          sessionStorage.setItem('ff_tv', JSON.stringify(parsed));
          _sessionCheckFinished = true;
          window.location.href = 'tv.html';
          return;
        }

        await showApp();
        _sessionCheckFinished = true;
        return;
      }
    }
  } catch (err) {
    console.warn('Sessão inválida:', err);
  }

  try {
    sessionStorage.removeItem('ff_user');
    sessionStorage.removeItem('ff_token');
    sessionStorage.removeItem('ff_driver');
    sessionStorage.removeItem('ff_tv');
  } catch(_){}

  document.getElementById('appPage').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  _sessionCheckFinished = true;
}

async function showApp() {
  if (_showAppBusy) return;
  _showAppBusy = true;

  if (!STATE.currentUser || !userHasFactoryFlowAccess(STATE.currentUser)) {
    _showAppBusy = false;
    handleLogout();
    showLoginError('Sessão inválida ou sem acesso ao FactoryFlow.');
    return;
  }

  // Entra na aplicação IMEDIATAMENTE.
  // Antes o sistema ficava preso esperando initData() terminar.
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display = 'flex';

  // PATCH: mantém loading curto no login/F5 para dar tempo de carregar os dados.
  // Se demorar demais, libera a tela e continua tentando em background.
  showLoadingOverlay(true);
  const _minLoadingStart = Date.now();

  // Render inicial rápida
  buildSidebar();
  navigateTo('dashboard');

  // Auto-update e alertas começam já
  startAlertTimer();

  // Restaura URL do bridge
  restoreBridgeUrl();

  // Carrega os dados antes de liberar a tela final. O initData() prioriza
  // /api/producao e trata rotas auxiliares de forma independente.
  try {
    await initData();

    // Garante pelo menos um pequeno tempo visual de carregamento,
    // evitando entrar com os cards zerados por milissegundos.
    const elapsed = Date.now() - _minLoadingStart;
    if (elapsed < 1200) {
      await new Promise(r => setTimeout(r, 1200 - elapsed));
    }

    showLoadingOverlay(false);

    // Re-render depois do carregamento real
    const activePage = document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
    if (typeof _silentRefresh === 'function') {
      _silentRefresh(activePage);
    }
    startAutoUpdate();
    // Inicia sistema de alertas de expediente
    if (typeof ffInitExpedienteAlerts === 'function') ffInitExpedienteAlerts();

  } catch (err) {
    console.warn('⚠️ initData demorou demais:', err.message);

    // NÃO trava mais o login por causa do backend.
    // O usuário entra mesmo se o MySQL estiver lento.
    showLoadingOverlay(false);
    startAutoUpdate();
    // Inicia alertas mesmo se backend demorar
    if (typeof ffInitExpedienteAlerts === 'function') ffInitExpedienteAlerts();

    setTimeout(async () => {
      try {
        await reloadData();
        const activePage = document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
        if (typeof _silentRefresh === 'function') _silentRefresh(activePage);
      } catch (_) {}
    }, 2000);
  } finally {
    _showAppBusy = false;
  }
}

// ===================================================
// NAVEGAÇÃO E SIDEBAR
// ===================================================

// "group" só controla agrupamento visual na sidebar (buildSidebar). "hidden" esconde o item
// do menu sem remover a rota/o código por trás — usado para Usuários e Motoristas, que hoje
// não têm render function implementada (renderUsers/renderDriversPage não existem) e por isso
// ficam fora do menu até serem implementadas ou removidas de verdade.
const PAGE_MAP = {
  dashboard:  { el:'pageDashboard',  label:'Dashboard',        icon:'fas fa-tachometer-alt', roles:['admin','diretoria','pcp','pcp_lib','manager','sector','viewer'], group:'principal' },
  kanban:     { el:'pageKanban',     label:'Kanban',            icon:'fas fa-columns',        roles:['admin','diretoria','pcp','pcp_lib','manager','sector'], group:'principal' },
  meu_setor:        { el:'pageMeuSetor',          label:'Meu Setor',             icon:'fas fa-hard-hat',       roles:['sector'], group:'principal' },

  pedidos_novos: { el:'pagePedidosNovos', label:'Pedidos Novos',     icon:'fas fa-inbox',          roles:['admin','diretoria','pcp','pcp_lib','manager'], group:'pedidos' },
  lots:       { el:'pageLots',       label:'Lotes',             icon:'fas fa-boxes',          roles:['admin','diretoria','pcp','pcp_lib','manager','sector'], group:'pedidos' },
  orders:     { el:'pageOrders',     label:'Pedidos',           icon:'fas fa-clipboard-list', roles:['admin','diretoria','pcp','pcp_lib','manager'], group:'pedidos' },

  programacao_entregas: { el:'pageProgramacaoEntregas', label:'Programação de Entregas', icon:'fas fa-calendar-alt', roles:['admin','diretoria','pcp','pcp_lib','manager','sector','viewer'], group:'entregas' },
  deliveries: { el:'pageDeliveries', label:'Entregas',          icon:'fas fa-truck',          roles:['admin','diretoria','pcp','manager'], group:'entregas' },

  relatorio_tempos:    { el:'pageRelatorioTempos',   label:'Relatório de Tempos',   icon:'fas fa-clock',          roles:['admin','diretoria','pcp','pcp_lib','manager'], group:'relatorios' },
  reports:    { el:'pageReports',    label:'Relatórios',        icon:'fas fa-chart-bar',      roles:['admin','diretoria','pcp','pcp_lib','manager','viewer'], group:'relatorios' },
  factory:    { el:'pageFactory',    label:'Painel Geral',      icon:'fas fa-industry',       roles:['admin','diretoria','pcp','manager'], group:'relatorios' },

  simulador_entrega:   { el:'pageSimuladorEntrega',  label:'Simulador',             icon:'fas fa-route',          roles:['admin','diretoria','pcp','pcp_lib','manager'], group:'ferramentas' },
  import:        { el:'pageImport',        label:'Importar Pedidos',  icon:'fas fa-file-import',    roles:['admin','pcp'], group:'ferramentas' },

  drivers:    { el:'pageDrivers',    label:'Motoristas',        icon:'fas fa-id-card',        roles:['admin','diretoria','pcp','manager'], group:'administracao', hidden:true },
  users:               { el:'pageUsers',             label:'Usuários',              icon:'fas fa-users-cog',      roles:['admin'], group:'administracao', hidden:true },
};

// Ordem e rótulo dos grupos na sidebar. "principal" não tem cabeçalho (fica no topo, solto).
const SIDEBAR_GROUPS = [
  { key:'principal',      label:null },
  { key:'pedidos',        label:'Pedidos e Produção' },
  { key:'entregas',       label:'Entregas' },
  { key:'relatorios',     label:'Relatórios' },
  { key:'ferramentas',    label:'Ferramentas' },
  { key:'administracao',  label:'Administração' },
];

function buildSidebar() {
  const user = STATE.currentUser;
  const nav  = document.getElementById('sidebarNav');
  nav.innerHTML = '';

  SIDEBAR_GROUPS.forEach(group => {
    const entries = Object.entries(PAGE_MAP).filter(([, cfg]) =>
      (cfg.group || 'principal') === group.key && !cfg.hidden && cfg.roles.includes(user.role)
    );
    if (!entries.length) return;

    if (group.label) {
      const heading = document.createElement('div');
      heading.className = 'nav-group-label';
      heading.textContent = group.label;
      nav.appendChild(heading);
    }

    entries.forEach(([key, cfg]) => {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'nav-item';
      a.dataset.page = key;
      a.innerHTML = `<i class="${cfg.icon}"></i><span>${cfg.label}</span>`;
      a.onclick = (e) => { e.preventDefault(); navigateTo(key); };
      nav.appendChild(a);
    });
  });

  const info = document.getElementById('sidebarUserInfo');
  info.innerHTML = `
    <div class="user-avatar"><i class="fas fa-user-circle"></i></div>
    <div>
      <div class="user-name">${escapeHtml(user.name)}</div>
      <div class="user-role">${ROLE_LABELS[user.role] || user.role}${user.sector ? ' – ' + (SECTOR_LABELS[user.sector] || user.sector) : ''}</div>
    </div>`;

  // Botão de tema
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    themeBtn.innerHTML = current === 'dark'
      ? '<i class="fas fa-sun"></i> Tema Claro'
      : '<i class="fas fa-moon"></i> Tema Escuro';
  }

  // Botão Modo TV – visível para admin, diretoria, pcp, manager
  const tvBtn = document.getElementById('btnTVMode');
  if (tvBtn) {
    tvBtn.style.display = ['admin','diretoria','pcp','pcp_lib','manager'].includes(user.role) ? 'flex' : 'none';
  }

  // Botão TV Stats
  const tvStatsBtn = document.getElementById('btnTVStats');
  if (tvStatsBtn) {
    tvStatsBtn.style.display = ['admin','diretoria','pcp','pcp_lib','manager'].includes(user.role) ? 'flex' : 'none';
  }

  // Botão reset – EXCLUSIVO do admin (diretoria não tem acesso)
  const resetBtn = document.getElementById('btnResetLots');
  if (resetBtn) resetBtn.style.display = user.role === 'admin' ? 'flex' : 'none';

  // Bridge status chip (apenas para admin, pcp, diretoria, manager)
  if (['admin','diretoria','pcp','pcp_lib','manager'].includes(user.role)) {
    renderBridgeStatusChip();
  }
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));

  const cfg = PAGE_MAP[page];
  if (!cfg) return;
  document.getElementById(cfg.el).classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('topbarTitle').textContent = cfg.label;

  // Fecha sidebar no mobile
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.classList.remove('visible');
  }

  switch(page) {
    case 'dashboard':  renderDashboard();     break;
    case 'kanban':     renderKanban();         break;
    case 'lots':       renderLots();           break;
    case 'orders':     renderOrdersPage();     break;
    case 'deliveries': renderDeliveries();     break;
    case 'drivers':
      if (typeof renderDriversPage === 'function') {
        renderDriversPage();
      } else {
        console.warn('renderDriversPage não definido');
      }
      break;
    case 'factory':    renderFactoryPanel();   break;
    case 'reports':    renderReports();        break;
    case 'import':        renderImportPage();      break;
    case 'pedidos_novos': renderPedidosNovos();    break;
    case 'programacao_entregas': renderProgramacaoEntregas(); break;
    case 'meu_setor':        renderMeuSetor();            break;
    case 'relatorio_tempos':  renderRelatorioTempos();     break;
    case 'simulador_entrega':
      if (typeof renderSimuladorEntrega === 'function') renderSimuladorEntrega();
      break;
    case 'users':
      if (typeof renderUsers === 'function') {
        renderUsers();
      } else {
        console.warn('renderUsers não definido');
      }
      break;
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    sidebar.classList.toggle('open');
    let overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebarOverlay';
      overlay.className = 'sidebar-overlay';
      overlay.onclick = () => { sidebar.classList.remove('open'); overlay.classList.remove('visible'); };
      document.body.appendChild(overlay);
    }
    overlay.classList.toggle('visible', sidebar.classList.contains('open'));
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

function openTVMode() {
  window.open('tv.html', '_blank');
}

function openTVStats() {
  window.open('tv2.html', '_blank');
}

// ===================================================
// MODAIS
// ===================================================

function openModal(id) {
  document.getElementById('modalOverlay').style.display = 'flex';
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  const modal = document.getElementById(id);
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').style.display = 'none';
}

// ===================================================
// ALERTAS
// ===================================================

let alertTimer;
function startAlertTimer() {
  updateAlertBadge();
  alertTimer = setInterval(updateAlertBadge, 30000);
}

function updateAlertBadge() {
  const alerts = getAlerts();
  const badge  = document.getElementById('alertBadge');
  if (!badge) return;
  if (alerts.length > 0) {
    badge.style.display = 'inline-block';
    badge.textContent   = alerts.length;
  } else {
    badge.style.display = 'none';
  }
}

function toggleAlerts() {
  const dd = document.getElementById('alertDropdown');
  if (dd.style.display === 'none' || !dd.style.display) {
    renderAlerts();
    dd.style.display = 'block';
    STATE.alertsOpen = true;
  } else {
    dd.style.display = 'none';
    STATE.alertsOpen = false;
  }
}

function renderAlerts() {
  const alerts = getAlerts();
  const list   = document.getElementById('alertList');
  if (alerts.length === 0) {
    list.innerHTML = '<div class="alert-item">Nenhum alerta no momento</div>';
    return;
  }
  list.innerHTML = alerts.map(lot => `
    <div class="alert-item alert-warning" onclick="openLotDetail('${lot.id}')">
      <strong>Lote ${escapeHtml(lot.number)}</strong> – ${escapeHtml(lot.client)}<br>
      <span>Setor: ${SECTOR_LABELS[lot.sector]}</span><br>
      <span class="text-muted">Tempo no setor: ${timeAgo((lot.history||[])[lot.history.length-1]?.timestamp || lot.createdAt)}</span>
    </div>
  `).join('');
}

// ===================================================
// SECTOR VISIBILITY (modal usuário)
// ===================================================

// ===================================================
// MYSQL BRIDGE – Status chip & config modal
// ===================================================

/**
 * Renderiza (ou atualiza) o chip de status do bridge na sidebar.
 * Cria o elemento se ainda não existir; atualiza classe e texto.
 */
async function renderBridgeStatusChip() {
  // Container: rodapé da sidebar (antes do botão de logout)
  let container = document.getElementById('bridgeStatusContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'bridgeStatusContainer';
    container.style.cssText = 'padding:.6rem 1rem .4rem; border-top:1px solid rgba(255,255,255,.06); margin-top:.5rem;';
    // Insere antes do último filho do sidebar-footer
    const footer = document.querySelector('.sidebar-footer');
    if (footer) footer.insertBefore(container, footer.firstChild);
  }

  const enabled = BRIDGE_CONFIG.enabled;
  const url     = BRIDGE_CONFIG.baseUrl;

  if (!enabled || !url) {
    container.innerHTML = `
      <div class="bridge-status-chip offline" onclick="openBridgeConfigModal()" title="Clique para configurar o MySQL Bridge" style="cursor:pointer;width:100%;justify-content:center;">
        <span class="bridge-status-dot"></span>
        <i class="fas fa-database" style="font-size:.6rem;opacity:.6"></i>
        ERP <span style="opacity:.6">Desconectado</span>
      </div>`;
    return;
  }

  // Testa conexão
  const health = await checkBridgeHealth();
  const total  = STATE._bridgeTotal || 0;

  if (health.ok) {
    container.innerHTML = `
      <div class="bridge-status-chip online" onclick="openBridgeConfigModal()" title="MySQL Bridge ativo · ${health.latency}ms · Clique para configurar" style="cursor:pointer;width:100%;justify-content:center;">
        <span class="bridge-status-dot"></span>
        <i class="fas fa-database" style="font-size:.6rem"></i>
        ERP · ${total} lotes
      </div>`;
  } else {
    container.innerHTML = `
      <div class="bridge-status-chip error" onclick="openBridgeConfigModal()" title="Bridge com erro: ${escapeHtml(health.error)} · Clique para configurar" style="cursor:pointer;width:100%;justify-content:center;">
        <span class="bridge-status-dot"></span>
        <i class="fas fa-database" style="font-size:.6rem"></i>
        ERP <span style="opacity:.8">Erro</span>
      </div>`;
  }
}

/**
 * Abre o modal de configuração do MySQL Bridge.
 */
function openBridgeConfigModal() {
  // Cria modal dinâmico se não existir
  let modal = document.getElementById('modalBridgeConfig');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalBridgeConfig';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-header">
        <h3><i class="fas fa-database" style="color:#93c5fd"></i> Configuração MySQL Bridge</h3>
        <button onclick="document.getElementById('modalOverlay').style.display='none'" class="btn-icon"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <p style="color:#94a3b8;font-size:.82rem;margin-bottom:1rem">
          Conecte o FactoryFlow ao backend Node.js que sincroniza com o banco MySQL da empresa.<br>
          O backend deve estar rodando em um servidor com Node.js ≥ 18.
        </p>

        <div class="bridge-config-section">
          <h4><i class="fas fa-link"></i> URL do Backend</h4>
          <div class="bridge-url-row">
            <input type="url" id="bridgeUrlInput" class="form-control"
              placeholder="Ex: http://192.168.1.100:3001"
              value="${escapeHtml(BRIDGE_CONFIG.baseUrl || '')}">
            <button class="btn btn-primary" onclick="applyBridgeUrl()">
              <i class="fas fa-check"></i> Aplicar
            </button>
          </div>
          <div class="bridge-health-row" id="bridgeHealthRow">
            ${BRIDGE_CONFIG.baseUrl
              ? `Configurado: <code>${escapeHtml(BRIDGE_CONFIG.baseUrl)}</code>`
              : 'Nenhuma URL configurada. O sistema funciona normalmente sem o bridge.'}
          </div>
        </div>

        <div class="bridge-config-section" style="margin-top:.8rem">
          <h4><i class="fas fa-info-circle"></i> Status atual</h4>
          <div id="bridgeStatusDetail" style="font-size:.78rem;color:#94a3b8;line-height:1.6">
            Carregando…
          </div>
        </div>

        <div class="bridge-config-section" style="margin-top:.8rem">
          <h4><i class="fas fa-terminal"></i> Comandos rápidos</h4>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <button class="btn btn-sm" onclick="testBridgeConnection()" style="background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.3)">
              <i class="fas fa-heartbeat"></i> Testar conexão
            </button>
            <button class="btn btn-sm" onclick="triggerManualSync()" style="background:rgba(34,197,94,.1);color:#86efac;border:1px solid rgba(34,197,94,.25)">
              <i class="fas fa-sync-alt"></i> Sync manual
            </button>
            <button class="btn btn-sm" onclick="disableBridge()" style="background:rgba(100,116,139,.1);color:#94a3b8;border:1px solid rgba(100,116,139,.2)">
              <i class="fas fa-unlink"></i> Desconectar
            </button>
          </div>
        </div>

        <details style="margin-top:1rem">
          <summary style="cursor:pointer;font-size:.78rem;color:#64748b">Como configurar o backend →</summary>
          <div style="font-size:.75rem;color:#94a3b8;margin-top:.6rem;line-height:1.7;background:rgba(15,23,42,.5);padding:.8rem;border-radius:8px">
            1. Baixe a pasta <code>backend/</code> do projeto<br>
            2. Execute <code>npm install</code> dentro da pasta<br>
            3. Copie <code>.env.example</code> → <code>.env</code> e preencha as credenciais MySQL<br>
            4. Execute <code>node setup.js</code> para criar a tabela <code>producao_lotes</code><br>
            5. Execute <code>npm start</code> ou <code>pm2 start server.js</code><br>
            6. Cole a URL do servidor acima (ex: <code>http://192.168.1.100:3001</code>)<br>
            7. Clique em <strong>Aplicar</strong> e depois <strong>Testar conexão</strong>
          </div>
        </details>
      </div>
    `;
    document.getElementById('modalOverlay').appendChild(modal);
  }

  openModal('modalBridgeConfig');
  loadBridgeStatusDetail();
}

async function loadBridgeStatusDetail() {
  const el = document.getElementById('bridgeStatusDetail');
  if (!el) return;

  if (!BRIDGE_CONFIG.enabled || !BRIDGE_CONFIG.baseUrl) {
    el.innerHTML = `<span style="color:#f59e0b">⚠ Bridge não configurado.</span> Os lotes do ERP não serão exibidos.`;
    return;
  }

  el.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando…';

  const health = await checkBridgeHealth();
  if (health.ok) {
    const s = health.sync || {};
    el.className = 'ok';
    el.innerHTML = `
      <span style="color:#86efac">✅ Backend online</span> · Latência: ${health.latency}ms<br>
      Sincronizações: ${s.totalSyncs ?? '–'} · Lotes inseridos: ${s.totalInserted ?? '–'} · Intervalo: ${s.intervalMs ? s.intervalMs/1000 + 's' : '–'}<br>
      URL: <code>${escapeHtml(BRIDGE_CONFIG.baseUrl)}</code>
    `;
  } else {
    el.className = 'fail';
    el.innerHTML = `
      <span style="color:#fca5a5">❌ Backend inacessível</span><br>
      Erro: ${escapeHtml(health.error)}<br>
      Verifique se o servidor Node.js está rodando e a URL está correta.
    `;
  }
}

async function applyBridgeUrl() {
  const url  = (document.getElementById('bridgeUrlInput')?.value || '').trim();
  const row  = document.getElementById('bridgeHealthRow');

  if (!url) {
    if (row) row.innerHTML = '<span style="color:#fca5a5">Informe a URL do backend.</span>';
    return;
  }

  setBridgeUrl(url);
  // Salva em localStorage para persistir entre reloads
  try { localStorage.setItem('ff_bridge_url', url); } catch(_){}

  if (row) row.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando conexão…';

  const health = await checkBridgeHealth();
  if (health.ok) {
    if (row) row.innerHTML = `<span style="color:#86efac">✅ Conectado (${health.latency}ms)</span>`;
    showToast('✅ MySQL Bridge conectado! Carregando lotes do ERP…', 'success');
    await loadBridgeLots();
    await renderBridgeStatusChip();
    // Atualiza a tela atual
    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage) _silentRefresh(activePage);
    loadBridgeStatusDetail();
  } else {
    if (row) row.innerHTML = `<span style="color:#fca5a5">❌ Falha: ${escapeHtml(health.error)}</span>`;
    showToast('⚠️ Bridge inacessível. Verifique a URL e se o servidor está rodando.', 'warning');
  }
}

async function testBridgeConnection() {
  const row = document.getElementById('bridgeHealthRow');
  if (row) row.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando…';

  const health = await checkBridgeHealth();
  if (health.ok) {
    if (row) row.innerHTML = `<span style="color:#86efac">✅ Online (${health.latency}ms)</span>`;
    showToast('✅ Backend online!', 'success');
    loadBridgeStatusDetail();
  } else {
    if (row) row.innerHTML = `<span style="color:#fca5a5">❌ ${escapeHtml(health.error)}</span>`;
    showToast('❌ Backend inacessível: ' + health.error, 'error');
  }
}

async function triggerManualSync() {
  if (!BRIDGE_CONFIG.enabled || !BRIDGE_CONFIG.baseUrl) {
    showToast('Configure o bridge primeiro.', 'warning'); return;
  }
  try {
    const res = await fetch(`${BRIDGE_CONFIG.baseUrl}/api/sync/run`, { method: 'POST' });
    const data = await res.json();
    showToast(`🔄 Sync concluído: ${data.inserted || 0} novos lotes inseridos.`, 'success');
    await loadBridgeLots();
    await renderBridgeStatusChip();
    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage) _silentRefresh(activePage);
    loadBridgeStatusDetail();
  } catch(err) {
    showToast('Erro no sync manual: ' + err.message, 'error');
  }
}

function disableBridge() {
  BRIDGE_CONFIG.enabled  = false;
  BRIDGE_CONFIG.baseUrl  = null;
  BRIDGE_CONFIG._errorAt = 0;
  try { localStorage.removeItem('ff_bridge_url'); } catch(_){}
  // Remove lotes bridge do estado
  STATE.lots = STATE.lots.filter(l => l._source !== 'mysql');
  renderBridgeStatusChip();
  showToast('Bridge desconectado. Lotes do ERP removidos do Kanban.', 'info');
  document.getElementById('modalOverlay').style.display = 'none';
  const activePage = document.querySelector('.nav-item.active')?.dataset.page;
  if (activePage) _silentRefresh(activePage);
}

/**
 * Restaura URL do bridge salva no localStorage (chamado no startup).
 */
function restoreBridgeUrl() {
  try {
    const saved = localStorage.getItem('ff_bridge_url');
    if (saved) setBridgeUrl(saved);
  } catch(_){}
}

function updateSectorVisibility() {
  const role = document.getElementById('userRole').value;
  const sf   = document.getElementById('sectorField');
  sf.style.display = role === 'sector' ? 'block' : 'none';
}

// ===================================================
// IMPORT PAGE
// ===================================================

function renderImportPage() {
  const page = document.getElementById('pageImport');
  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-file-import"></i> Importar Pedidos Externos</h2>
      <button onclick="openModal('modalImport')" class="btn btn-primary">
        <i class="fas fa-plus"></i> Importar Pedido
      </button>
    </div>
    <div class="import-info">
      <div class="import-info-card">
        <h4><i class="fas fa-info-circle text-blue"></i> Como usar a importação</h4>
        <p>Cole um JSON com os dados do pedido e lotes do sistema externo.<br>
        Os lotes serão criados automaticamente com o <strong>fluxo correto por tipo de produto</strong>:</p>
        <ul>
          <li><strong>🎨 Tinta:</strong> Pesagem → Produção → Coloração → Laboratório → Envase → Pronto</li>
          <li><strong>💧 Diluente:</strong> Pesagem → Envase → Pronto</li>
          <li><strong>⚗️ Endurecedor:</strong> Pesagem → Produção → Laboratório → Envase → Pronto</li>
          <li><strong>🧪 Base:</strong> Pesagem → Produção → Laboratório → Envase → Pronto</li>
        </ul>
      </div>
    </div>
    <div class="page-header" style="margin-top:1.5rem">
      <h3><i class="fas fa-history"></i> Últimos Pedidos Importados</h3>
    </div>
    <div id="importedOrdersList">
      ${renderImportedOrdersList()}
    </div>`;
}

function renderImportedOrdersList() {
  const importedOrders = STATE.orders.filter(o => o.createdBy === 'import' || o.status);
  if (importedOrders.length === 0) {
    return '<div class="empty-state"><i class="fas fa-inbox"></i><p>Nenhum pedido importado ainda</p></div>';
  }
  return `<div class="lots-grid">${importedOrders.slice().reverse().slice(0,12).map(o => buildOrderCard(o)).join('')}</div>`;
}

async function executeImport() {
  const raw = document.getElementById('importJson').value.trim();
  if (!raw) { alert('Cole o JSON do pedido'); return; }

  let data;
  try { data = JSON.parse(raw); }
  catch(e) { alert('JSON inválido: ' + e.message); return; }

  const resultDiv = document.getElementById('importResult');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div style="color:var(--blue)"><i class="fas fa-spinner fa-spin"></i> Importando...</div>';

  try {
    const { order, lots } = await importExternalOrder(data);
    resultDiv.innerHTML = `
      <div class="alert-success">
        <i class="fas fa-check-circle"></i>
        <strong>Importado com sucesso!</strong><br>
        Pedido #${order.number} – ${lots.length} lote(s) criado(s).<br>
        Os lotes já aparecem no Kanban e na página de Lotes.
      </div>`;
    document.getElementById('importJson').value = '';
    setTimeout(() => {
      closeModal();
      navigateTo('lots');
    }, 2000);
  } catch(err) {
    resultDiv.innerHTML = `<div class="alert-error"><i class="fas fa-exclamation-triangle"></i> Erro: ${err.message}</div>`;
  }
}

// Failsafe: se por algum motivo checkSession não finalizar, libera login manual.
setTimeout(() => { _sessionCheckFinished = true; }, 3000);
