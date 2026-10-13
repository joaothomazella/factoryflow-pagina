// ===================================================
// AJUSTES - painel de personalizacao do aplicativo
// ---------------------------------------------------
// Um lugar so para a pessoa deixar o app com a cara dela: tema, cor de
// destaque, tamanho dos cards, tamanho da letra, densidade da tela,
// cantos, animacoes, menu e qual pagina abre no login.
//
// Tres regras que valem para TODAS as opcoes daqui:
//
// 1) No valor padrao, NADA e escrito no <html>. O atributo e removido,
//    nao colocado com o valor padrao. Assim o css/ajustes.css nao gera
//    uma unica regra para quem nunca mexer, e o app continua pixel por
//    pixel como estava.
//
// 2) A preferencia fica no localStorage, por aparelho, e nao no banco.
//    De proposito: a letra boa no notebook nao e a boa na TV da
//    producao, e a mesma pessoa usa os dois.
//
// 3) Nada aqui muda dado de producao. E tudo aparencia. O unico ajuste
//    que mexe em comportamento e a pagina inicial, e ela e validada
//    contra as permissoes do perfil antes de abrir.
//
// O tema e o tamanho dos cards NAO sao reimplementados aqui: o painel
// chama applyTheme() e ffCardSizeStep(), que ja existiam no js/app.js.
// Duas copias disso divergiriam.
// ===================================================

const FF_AJ_DEFS = {
  destaque:  { chave: 'ff_aj_destaque',  padrao: '',        attr: 'data-destaque'  },
  fonte:     { chave: 'ff_aj_fonte',     padrao: 'm',       attr: 'data-fonte'     },
  densidade: { chave: 'ff_aj_densidade', padrao: 'normal',  attr: 'data-densidade' },
  cantos:    { chave: 'ff_aj_cantos',    padrao: 'normal',  attr: 'data-cantos'    },
  animacoes: { chave: 'ff_aj_animacoes', padrao: 'on',      attr: 'data-anim'      },
  menu:      { chave: 'ff_aj_menu',      padrao: 'aberto',  attr: null             },
  inicial:   { chave: 'ff_aj_inicial',   padrao: 'dashboard', attr: null           },
};

// Valores aceitos. Qualquer coisa fora disso (storage corrompido, mao
// de alguem no console) cai no padrao em vez de escrever lixo no <html>.
const FF_AJ_VALORES = {
  fonte:     ['p', 'm', 'g', 'gg'],
  densidade: ['compacta', 'normal', 'folgada'],
  cantos:    ['reto', 'suave', 'normal', 'redondo'],
  animacoes: ['on', 'off'],
  menu:      ['aberto', 'recolhido'],
};

const FF_AJ_ROTULOS = {
  fonte:     { p: 'Pequena', m: 'Normal', g: 'Grande', gg: 'Maior' },
  densidade: { compacta: 'Compacta', normal: 'Normal', folgada: 'Folgada' },
  cantos:    { reto: 'Reto', suave: 'Pouco', normal: 'Normal', redondo: 'Bem redondo' },
};

// Cor de destaque. O app usa --blue como cor de acao em 69 lugares do
// style.css, entao e essa que a escolha troca. "Cor do tema" ('') devolve
// o controle para o tema escolhido.
const FF_AJ_CORES = [
  { chave: '',        nome: 'Cor do tema', cor: '' },
  { chave: 'azul',    nome: 'Azul',        cor: '#144196' },
  { chave: 'indigo',  nome: 'Indigo',      cor: '#4f46e5' },
  { chave: 'roxo',    nome: 'Roxo',        cor: '#7c3aed' },
  { chave: 'violeta', nome: 'Violeta',     cor: '#a855f7' },
  { chave: 'ciano',   nome: 'Ciano',       cor: '#0891b2' },
  { chave: 'verde',   nome: 'Verde',       cor: '#15803d' },
  { chave: 'esmeral', nome: 'Esmeralda',   cor: '#059669' },
  { chave: 'ambar',   nome: 'Ambar',       cor: '#b45309' },
  { chave: 'laranja', nome: 'Laranja',     cor: '#c2410c' },
  { chave: 'vermelho',nome: 'Vermelho',    cor: '#b91c1c' },
  { chave: 'rosa',    nome: 'Rosa',        cor: '#be185d' },
  { chave: 'grafite', nome: 'Grafite',     cor: '#334155' },
];

const FF_AJ_TEMAS = [
  { chave: 'dark',       nome: 'Escuro',     dica: 'O padrao da fabrica',        amostra: ['#0f172a', '#1e293b', '#144196'] },
  { chave: 'light',      nome: 'Claro',      dica: 'Bom em sala com janela',     amostra: ['#f1f5f9', '#ffffff', '#144196'] },
  { chave: 'induscolor', nome: 'Induscolor', dica: 'Azul e amarelo da marca',    amostra: ['#0f2a52', '#144196', '#fff000'] },
  { chave: 'suave',      nome: 'Suave',      dica: 'Claro, cantos arredondados', amostra: ['#f6f4fb', '#ffffff', '#a855f7'] },
];

// ---------------------------------------------------
// LEITURA E GRAVACAO
// ---------------------------------------------------
function ffAjValido(id, v) {
  if (id === 'destaque') return FF_AJ_CORES.some(c => c.chave === v) || /^#[0-9a-fA-F]{6}$/.test(String(v || ''));
  if (id === 'inicial')  return typeof v === 'string' && v.length > 0 && v.length < 60;
  const lista = FF_AJ_VALORES[id];
  return !lista || lista.includes(v);
}

function ffAjLer(id) {
  const def = FF_AJ_DEFS[id];
  if (!def) return null;
  let v = null;
  try { v = localStorage.getItem(def.chave); } catch (_) { v = null; }
  if (v === null || !ffAjValido(id, v)) return def.padrao;
  return v;
}

function ffAjGravar(id, v) {
  const def = FF_AJ_DEFS[id];
  if (!def) return;
  try {
    if (v === def.padrao) localStorage.removeItem(def.chave);
    else localStorage.setItem(def.chave, v);
  } catch (_) { /* navegador com storage bloqueado: vale so nesta sessao */ }
}

// ---------------------------------------------------
// APLICACAO
// ---------------------------------------------------
function ffAjCorEscolhida() {
  const v = ffAjLer('destaque');
  if (!v) return '';
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;          // cor livre
  const p = FF_AJ_CORES.find(c => c.chave === v);
  return p ? p.cor : '';
}

// A cor entra como estilo direto no <html>, porque assim ela ganha de
// qualquer bloco de tema - inclusive do induscolor e do suave, que
// redefinem --blue. Efeito colateral honesto: escolher cor fixa a cor
// mesmo trocando de tema. "Cor do tema" desfaz.
function ffAjAplicarCor(cor) {
  const raiz = document.documentElement;
  if (!cor) {
    raiz.style.removeProperty('--blue');
    raiz.style.removeProperty('--ff-destaque');
    raiz.removeAttribute('data-destaque');
    return;
  }
  raiz.style.setProperty('--blue', cor);
  raiz.style.setProperty('--ff-destaque', cor);
  raiz.setAttribute('data-destaque', '');
}

function ffAjAplicar(id, valor, salvar = true) {
  const def = FF_AJ_DEFS[id];
  if (!def) return;
  if (!ffAjValido(id, valor)) valor = def.padrao;

  if (salvar) ffAjGravar(id, valor);

  if (id === 'destaque') { ffAjAplicarCor(ffAjCorEscolhida()); return; }

  if (id === 'menu') { ffAjAplicarMenu(valor); return; }
  if (id === 'inicial') return;          // so vale no proximo login

  if (def.attr) {
    if (valor === def.padrao) document.documentElement.removeAttribute(def.attr);
    else document.documentElement.setAttribute(def.attr, valor);
  }
}

function ffAjAplicarMenu(valor) {
  const sidebar = document.getElementById('sidebar');
  // No celular a barra lateral e uma gaveta ('open'), nao tem estado
  // recolhido - mexer nela aqui quebraria o menu do celular.
  if (!sidebar || window.innerWidth <= 768) return;
  sidebar.classList.toggle('collapsed', valor === 'recolhido');
}

// Chamada no carregamento, antes de qualquer tela aparecer.
function ffAjAplicarTudo() {
  Object.keys(FF_AJ_DEFS).forEach(id => {
    if (id === 'menu' || id === 'inicial') return;     // dependem do app ja montado
    ffAjAplicar(id, ffAjLer(id), false);
  });
}

// Chamada depois que a sidebar existe (fim do login).
function ffAjAplicarDepoisDoLogin() {
  ffAjAplicarMenu(ffAjLer('menu'));
}

// Usada pelo js/auth.js para decidir que pagina abrir. Devolve a
// preferencia SO se ela existir no PAGE_MAP e o perfil puder ver -
// senao cai no dashboard, como era antes.
function ffAjPaginaInicial(user) {
  const padrao = 'dashboard';
  const escolhida = ffAjLer('inicial');
  if (!escolhida || escolhida === padrao) return padrao;
  if (typeof PAGE_MAP === 'undefined' || !PAGE_MAP[escolhida]) return padrao;
  const cfg = PAGE_MAP[escolhida];
  const papel = String((user && user.role) || '').trim();
  if (!Array.isArray(cfg.roles) || !cfg.roles.includes(papel)) return padrao;
  return escolhida;
}

// Paginas que podem ser escolhidas como inicial: as que o perfil ve no
// menu. Pagina escondida (hidden) fica fora - abrir no login uma tela
// que nao esta no menu deixaria a pessoa sem saber onde esta.
function ffAjPaginasPossiveis() {
  if (typeof PAGE_MAP === 'undefined') return [];
  const u = (typeof STATE === 'object' && STATE) ? STATE.currentUser : null;
  const papel = String((u && u.role) || '').trim();
  return Object.keys(PAGE_MAP)
    .filter(k => {
      const cfg = PAGE_MAP[k];
      return cfg && !cfg.hidden && Array.isArray(cfg.roles) && cfg.roles.includes(papel);
    })
    .map(k => ({ chave: k, nome: PAGE_MAP[k].label, icone: PAGE_MAP[k].icon }));
}

// ---------------------------------------------------
// PAINEL
// ---------------------------------------------------
function ffAjAbrir() {
  ffAjRenderizar();
  if (typeof openModal === 'function') openModal('modalAjustes');
}

function ffAjTemaAtual() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function ffAjTemasDisponiveis() {
  // O tema suave ainda e liberado por login (ver FF_TEMA_SUAVE_LOGINS no
  // js/app.js). Quem nao tem acesso nao ve o cartao, em vez de clicar e
  // cair no claro sem entender.
  const podeSuave = (typeof ffPodeTemaSuave === 'function') ? ffPodeTemaSuave() : false;
  return FF_AJ_TEMAS.filter(t => t.chave !== 'suave' || podeSuave);
}

function ffAjEscolherTema(chave) {
  if (typeof applyTheme === 'function') applyTheme(chave);
  ffAjRenderizar();
}

function ffAjEscolherCor(chave) {
  ffAjAplicar('destaque', chave);
  ffAjRenderizar();
}

function ffAjCorLivre(valor) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(valor || ''))) return;
  ffAjAplicar('destaque', valor);
  ffAjRenderizar();
}

function ffAjEscolher(id, valor) {
  ffAjAplicar(id, valor);
  ffAjRenderizar();
}

function ffAjLinhaOpcoes(id, titulo, dica, extra = '') {
  const atual = ffAjLer(id);
  const lista = FF_AJ_VALORES[id] || [];
  const rot = FF_AJ_ROTULOS[id] || {};
  return `
    <div class="ff-aj-linha${extra ? ' ' + extra : ''}">
      <div class="ff-aj-linha-txt">
        <strong>${titulo}</strong>
        ${dica ? `<span>${dica}</span>` : ''}
      </div>
      <div class="ff-aj-pills" role="group" aria-label="${titulo}">
        ${lista.map(v => `
          <button type="button"
                  class="ff-aj-pill${v === atual ? ' ativo' : ''}"
                  aria-pressed="${v === atual}"
                  onclick="ffAjEscolher('${id}','${v}')">${rot[v] || v}</button>`).join('')}
      </div>
    </div>`;
}

function ffAjRenderizar() {
  const alvo = document.getElementById('modalAjustesBody');
  if (!alvo) return;

  const temaAtual = ffAjTemaAtual();
  const corAtual  = ffAjLer('destaque');
  const paginas   = ffAjPaginasPossiveis();
  const inicial   = ffAjLer('inicial');
  const anim      = ffAjLer('animacoes');
  const menu      = ffAjLer('menu');

  alvo.innerHTML = `
    <!-- TEMA -->
    <div class="ff-aj-secao">
      <h4><i class="fas fa-palette"></i> Tema</h4>
      <div class="ff-aj-temas">
        ${ffAjTemasDisponiveis().map(t => `
          <button type="button" class="ff-aj-tema${t.chave === temaAtual ? ' ativo' : ''}"
                  onclick="ffAjEscolherTema('${t.chave}')" aria-pressed="${t.chave === temaAtual}">
            <span class="ff-aj-tema-amostra">
              ${t.amostra.map(c => `<i style="background:${c}"></i>`).join('')}
            </span>
            <span class="ff-aj-tema-nome">${t.nome}</span>
            <span class="ff-aj-tema-dica">${t.dica}</span>
          </button>`).join('')}
      </div>
    </div>

    <!-- COR DE DESTAQUE -->
    <div class="ff-aj-secao">
      <h4><i class="fas fa-fill-drip"></i> Cor de destaque</h4>
      <p class="ff-aj-nota">
        Pega nos botoes de acao, abas, links e barras do app.
        Escolher uma cor aqui vale tambem nos outros temas, ate voltar em "Cor do tema".
      </p>
      <div class="ff-aj-cores">
        ${FF_AJ_CORES.map(c => `
          <button type="button" class="ff-aj-cor${c.chave === corAtual ? ' ativo' : ''}"
                  title="${c.nome}" aria-label="${c.nome}" aria-pressed="${c.chave === corAtual}"
                  onclick="ffAjEscolherCor('${c.chave}')">
            <span class="ff-aj-cor-bola${c.cor ? '' : ' automatica'}" ${c.cor ? `style="background:${c.cor}"` : ''}>
              ${c.cor ? '' : '<i class="fas fa-ban"></i>'}
            </span>
            <span class="ff-aj-cor-nome">${c.nome}</span>
          </button>`).join('')}
      </div>
      <div class="ff-aj-cor-livre">
        <label for="ffAjCorLivre"><i class="fas fa-eye-dropper"></i> Outra cor</label>
        <input type="color" id="ffAjCorLivre"
               value="${/^#[0-9a-fA-F]{6}$/.test(corAtual) ? corAtual : (ffAjCorEscolhida() || '#144196')}"
               onchange="ffAjCorLivre(this.value)" />
        ${/^#[0-9a-fA-F]{6}$/.test(corAtual) ? `<code>${corAtual}</code>` : ''}
      </div>
    </div>

    <!-- APRESENTACAO -->
    <div class="ff-aj-secao">
      <h4><i class="fas fa-sliders-h"></i> Jeito de apresentar</h4>

      <!-- O controle de tamanho dos cards e o MESMO do js/app.js: mesmos
           ids, mesmas funcoes. Ele morava no rodape do menu e foi movido
           para ca, para a personalizacao ficar num lugar so. -->
      <div class="ff-aj-linha ff-aj-desktop">
        <div class="ff-aj-linha-txt">
          <strong>Tamanho dos cards</strong>
          <span>Lotes, Kanban, metricas e pedidos</span>
        </div>
        <div class="ff-card-size-ctl">
          <button type="button" id="ffCardSizeMenos" onclick="ffCardSizeStep(-1)" title="Cards menores" aria-label="Diminuir os cards">&minus;</button>
          <span class="ff-card-size-val" id="ffCardSizeVal" ondblclick="ffCardSizeRestaurar()" title="Clique duas vezes para voltar ao padrao">Normal</span>
          <button type="button" id="ffCardSizeMais" onclick="ffCardSizeStep(1)" title="Cards maiores" aria-label="Aumentar os cards">+</button>
        </div>
      </div>

      ${ffAjLinhaOpcoes('fonte', 'Tamanho da letra', 'Vale para o app todo', 'ff-aj-desktop')}
      ${ffAjLinhaOpcoes('densidade', 'Espaco da tela', 'Respiro em volta do conteudo e do menu', 'ff-aj-desktop')}
      ${ffAjLinhaOpcoes('cantos', 'Cantos', 'Cartoes, botoes e campos')}

      <div class="ff-aj-so-celular">
        <i class="fas fa-mobile-alt"></i>
        No celular o tamanho dos cards, a letra e o espaco ficam como estao:
        ali os cartoes ja ocupam a largura inteira e o layout foi ajustado fino.
        Estes tres valem no computador.
      </div>
    </div>

    <!-- COMPORTAMENTO -->
    <div class="ff-aj-secao">
      <h4><i class="fas fa-toggle-on"></i> Ao abrir o app</h4>

      <div class="ff-aj-linha">
        <div class="ff-aj-linha-txt">
          <strong>Pagina inicial</strong>
          <span>Vale no proximo login</span>
        </div>
        <select class="ff-aj-select" onchange="ffAjEscolher('inicial', this.value)">
          ${paginas.length
            ? paginas.map(p => `<option value="${p.chave}"${p.chave === inicial ? ' selected' : ''}>${p.nome}</option>`).join('')
            : '<option value="dashboard" selected>Dashboard</option>'}
        </select>
      </div>

      <div class="ff-aj-linha">
        <div class="ff-aj-linha-txt">
          <strong>Menu lateral</strong>
          <span>Comecar aberto ou so com os icones</span>
        </div>
        <div class="ff-aj-pills">
          <button type="button" class="ff-aj-pill${menu === 'aberto' ? ' ativo' : ''}" onclick="ffAjEscolher('menu','aberto')">Aberto</button>
          <button type="button" class="ff-aj-pill${menu === 'recolhido' ? ' ativo' : ''}" onclick="ffAjEscolher('menu','recolhido')">Recolhido</button>
        </div>
      </div>

      <div class="ff-aj-linha">
        <div class="ff-aj-linha-txt">
          <strong>Animacoes</strong>
          <span>Desligue se a tela parecer lenta</span>
        </div>
        <div class="ff-aj-pills">
          <button type="button" class="ff-aj-pill${anim === 'on' ? ' ativo' : ''}" onclick="ffAjEscolher('animacoes','on')">Ligadas</button>
          <button type="button" class="ff-aj-pill${anim === 'off' ? ' ativo' : ''}" onclick="ffAjEscolher('animacoes','off')">Desligadas</button>
        </div>
      </div>
    </div>

    <div class="ff-aj-rodape">
      <span><i class="fas fa-info-circle"></i> Vale neste aparelho e neste navegador. Em outro computador, escolha de novo.</span>
      <button type="button" class="btn btn-sm btn-outline" onclick="ffAjRestaurarPadroes()">
        <i class="fas fa-undo"></i> Voltar tudo ao padrao
      </button>
    </div>`;

  // O rotulo do tamanho dos cards e dono do js/app.js: o painel so pede
  // para ele se redesenhar depois que o markup existe.
  if (typeof ffCardSizeAtualizarControle === 'function' && typeof ffCardSizeAtual === 'function') {
    ffCardSizeAtualizarControle(ffCardSizeAtual());
  }
}

function ffAjRestaurarPadroes() {
  if (!confirm('Voltar todos os ajustes de aparencia ao padrao?\n\nTema, cor, tamanhos, cantos, menu e pagina inicial.')) return;

  Object.keys(FF_AJ_DEFS).forEach(id => ffAjAplicar(id, FF_AJ_DEFS[id].padrao, true));
  if (typeof ffCardSizeRestaurar === 'function') ffCardSizeRestaurar();
  if (typeof applyTheme === 'function') applyTheme('dark');
  ffAjRenderizar();
  if (typeof showToast === 'function') showToast('Aparencia voltou ao padrao', 'success');
}

// O tema e a cor precisam valer antes da primeira pintura, senao a tela
// pisca na cor errada. applyThemeFromStorage() ja roda no app.js; aqui
// so entram os ajustes deste painel.
ffAjAplicarTudo();
