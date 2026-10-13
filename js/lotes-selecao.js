// ===================================================
// SELECAO EM MASSA NA PAGINA DE LOTES
// ---------------------------------------------------
// Fluxo pedido: a pessoa busca (ex.: "Soler"), clica em "Selecionar",
// clica nos cards que quer (ou em "Marcar todos") e escolhe uma acao:
// "Cliente retirou" ou "Enviar para o proximo setor". A acao vale para
// todos os lotes marcados.
//
// O que este arquivo NAO faz, de proposito:
//  - nao reimplementa as regras de negocio. O avanco de setor e a
//    retirada pelo cliente chamam ffAplicarEnvioDeSetor() e
//    ffAplicarRetiradaCliente(), que sao o MESMO codigo que a acao de
//    um lote so usa (extraido em js/lots.js). Duas copias dessas
//    regras divergiriam na primeira correcao de verniz ou base.
//  - nao decide destino por conta propria: usa
//    getSafeNextSectorOptions(lot), o mesmo que desenha o botao
//    "Avancar" no card.
// ===================================================

// So estes perfis. Foi o que o usuario pediu: administradores, PCP e
// gerente. 'gerente' e 'manager' sao o mesmo papel gravado de duas
// formas no banco, por isso os dois entram.
// ATENCAO: 'diretoria' e 'pcp_lib' ficaram FORA, mesmo tendo as outras
// permissoes de lote no sistema. Se tiverem que entrar, e so acrescentar
// aqui - nao ha nada mais a mudar.
const FF_SEL_PERFIS = ['admin', 'pcp', 'manager', 'gerente'];

const FF_SEL = {
  ativo: false,
  marcados: new Set(),
  visiveis: [],
  gravando: false
};

function ffPodeSelecaoEmMassa() {
  const u = (typeof STATE !== 'undefined' && STATE) ? STATE.currentUser : null;
  if (!u) return false;
  return FF_SEL_PERFIS.includes(String(u.role || '').trim().toLowerCase());
}

function ffSelModoAtivo() {
  return !!FF_SEL.ativo && ffPodeSelecaoEmMassa();
}

function ffSelEstaMarcado(id) {
  return FF_SEL.marcados.has(String(id));
}

// renderLotsGrid() avisa aqui o que esta na tela agora. "Marcar todos"
// marca o resultado da busca, nao os lotes do sistema inteiro.
// Lote que saiu da tela (porque a busca mudou) perde a marca: agir sobre
// um lote que a pessoa nao esta vendo e o tipo de surpresa que estraga
// dado de producao.
function ffSelRegistrarVisiveis(lots) {
  const lista = Array.isArray(lots) ? lots : [];
  FF_SEL.visiveis = lista.filter(l => l && !l.rejected).map(l => String(l.id));
  if (FF_SEL.marcados.size) {
    const naTela = new Set(FF_SEL.visiveis);
    Array.from(FF_SEL.marcados).forEach(id => {
      if (!naTela.has(id)) FF_SEL.marcados.delete(id);
    });
  }
}

function ffSelAlternarModo() {
  if (!ffPodeSelecaoEmMassa()) return;
  FF_SEL.ativo = !FF_SEL.ativo;
  FF_SEL.marcados.clear();
  ffSelRedesenharGrade();
  ffSelAtualizarBotaoDoCabecalho();
}

function ffSelSair() {
  FF_SEL.ativo = false;
  FF_SEL.marcados.clear();
  ffSelRedesenharGrade();
  ffSelAtualizarBotaoDoCabecalho();
}

// Redesenha so a grade, via filterLots(): ele le o campo de busca e a
// aba de filtro ativa, entao o texto que a pessoa digitou fica de pe.
function ffSelRedesenharGrade() {
  if (typeof filterLots === 'function') filterLots();
  else if (typeof renderLots === 'function') renderLots();
}

// Clicar num card nao redesenha nada: so troca a classe do card e
// atualiza a barra. Redesenhar a cada clique perderia o scroll.
function ffSelAlternarLote(id) {
  if (!ffSelModoAtivo() || FF_SEL.gravando) return;
  const chave = String(id);
  if (FF_SEL.marcados.has(chave)) FF_SEL.marcados.delete(chave);
  else FF_SEL.marcados.add(chave);

  const card = document.querySelector(`[data-lot-sel-id="${chave}"]`);
  if (card) card.classList.toggle('lot-sel-marcado', FF_SEL.marcados.has(chave));
  ffSelAtualizarBarra();
}

function ffSelMarcarTodos() {
  if (!ffSelModoAtivo()) return;
  FF_SEL.visiveis.forEach(id => FF_SEL.marcados.add(id));
  ffSelRedesenharGrade();
}

function ffSelLimpar() {
  if (!ffSelModoAtivo()) return;
  FF_SEL.marcados.clear();
  ffSelRedesenharGrade();
}

function ffSelLotesMarcados() {
  if (typeof STATE === 'undefined' || !STATE || !Array.isArray(STATE.lots)) return [];
  return Array.from(FF_SEL.marcados)
    .map(id => STATE.lots.find(l => String(l.id) === id))
    .filter(Boolean);
}

// ---------------------------------------------------
// BARRA FLUTUANTE
// ---------------------------------------------------
function ffSelGarantirBarra() {
  let barra = document.getElementById('ffSelBarra');
  if (barra) return barra;
  barra = document.createElement('div');
  barra.id = 'ffSelBarra';
  barra.className = 'ff-sel-barra';
  barra.innerHTML = `
    <span class="ff-sel-conta" id="ffSelConta">0 selecionados</span>
    <div class="ff-sel-botoes">
      <button type="button" class="btn btn-sm btn-outline" onclick="ffSelMarcarTodos()">
        <i class="fas fa-check-double"></i> Marcar todos
      </button>
      <button type="button" class="btn btn-sm btn-outline" onclick="ffSelLimpar()">
        <i class="fas fa-eraser"></i> Limpar
      </button>
      <button type="button" class="btn btn-sm btn-success" id="ffSelBtnRetirada" onclick="ffSelAbrirRetirada()">
        <i class="fas fa-hand-holding-box"></i> Cliente retirou
      </button>
      <button type="button" class="btn btn-sm btn-primary" id="ffSelBtnAvancar" onclick="ffSelAbrirAvanco()">
        <i class="fas fa-arrow-right"></i> Enviar para o proximo setor
      </button>
      <button type="button" class="btn btn-sm btn-outline" onclick="ffSelSair()">
        <i class="fas fa-times"></i> Sair da selecao
      </button>
    </div>`;
  document.body.appendChild(barra);
  return barra;
}

function ffSelAtualizarBarra() {
  const barra = document.getElementById('ffSelBarra');
  if (!ffSelModoAtivo()) {
    if (barra) barra.classList.remove('visivel');
    return;
  }
  const b = ffSelGarantirBarra();
  b.classList.add('visivel');
  const n = FF_SEL.marcados.size;
  const conta = document.getElementById('ffSelConta');
  if (conta) {
    conta.textContent = n === 1
      ? '1 lote selecionado'
      : `${n} lotes selecionados de ${FF_SEL.visiveis.length} na tela`;
  }
  ['ffSelBtnRetirada', 'ffSelBtnAvancar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = (n === 0) || FF_SEL.gravando;
  });
}

// renderLots() refaz o innerHTML da pagina inteira, o que apaga o
// destaque do botao "Selecionar". Isto repoe o estado.
function ffSelAposRenderDaPagina() {
  ffSelAtualizarBotaoDoCabecalho();
  ffSelAtualizarBarra();
}

function ffSelAtualizarBotaoDoCabecalho() {
  const btn = document.getElementById('btnLotSelecionar');
  if (!btn) return;
  const ativo = ffSelModoAtivo();
  btn.classList.toggle('btn-primary', ativo);
  btn.classList.toggle('btn-outline', !ativo);
  btn.innerHTML = ativo
    ? '<i class="fas fa-times"></i> Cancelar selecao'
    : '<i class="fas fa-check-square"></i> Selecionar';
}

// ---------------------------------------------------
// ACAO 1: CLIENTE RETIROU
// ---------------------------------------------------
// Mesma regra do card de um lote so: so vale para lote em "Pronto para
// Entrega". Finalizar como "cliente retirou" um lote que ainda esta na
// Producao gravaria tempo de setor e historico errados.
function ffSelAbrirRetirada() {
  if (!ffSelModoAtivo() || FF_SEL.gravando) return;
  const todos = ffSelLotesMarcados();
  if (!todos.length) return;

  const elegiveis = todos.filter(l => String(l.sector || '') === 'pronto');
  const fora = todos.filter(l => String(l.sector || '') !== 'pronto');

  if (!elegiveis.length) {
    alert(
      'Nenhum dos lotes marcados esta em "Pronto para Entrega".\n\n' +
      'A retirada pelo cliente so finaliza lote que ja chegou ao Pronto - ' +
      'igual ao botao do card de um lote so.'
    );
    return;
  }

  let msg = `Confirmar que o cliente retirou ${elegiveis.length} lote(s)?\n\n`;
  msg += elegiveis.slice(0, 15).map(l => `  #${l.number} - ${l.client || ''}`).join('\n');
  if (elegiveis.length > 15) msg += `\n  ... e mais ${elegiveis.length - 15}`;
  msg += '\n\nEles ficam finalizados, sem rota de motorista.';
  if (fora.length) {
    msg += `\n\n${fora.length} lote(s) marcado(s) serao IGNORADOS por nao estarem em Pronto:\n`;
    msg += fora.slice(0, 10).map(l => `  #${l.number} (${ffSelNomeSetor(l.sector)})`).join('\n');
    if (fora.length > 10) msg += `\n  ... e mais ${fora.length - 10}`;
  }

  if (!confirm(msg)) return;

  ffSelGravarLotes(
    elegiveis,
    (lot, user) => (typeof ffAplicarRetiradaCliente === 'function')
      ? ffAplicarRetiradaCliente(lot, user)
      : null,
    'retirada pelo cliente'
  );
}

function ffSelNomeSetor(setor) {
  if (typeof SECTOR_LABELS !== 'undefined' && SECTOR_LABELS[setor]) return SECTOR_LABELS[setor];
  return String(setor || 'sem setor');
}

// ---------------------------------------------------
// ACAO 2: ENVIAR PARA O PROXIMO SETOR
// ---------------------------------------------------
// Lotes marcados podem estar em setores diferentes, e dois lotes no
// MESMO setor podem ter destinos diferentes (base nao vai para
// Coloracao, verniz nao sai do Laboratorio como pronto). Entao os lotes
// sao agrupados por conjunto de destinos possiveis e a pessoa escolhe
// um destino por grupo.
function ffSelAgruparPorDestino(lotes) {
  const grupos = new Map();
  const semDestino = [];

  lotes.forEach(lot => {
    let opcoes = [];
    try {
      if (typeof getSafeNextSectorOptions === 'function') {
        opcoes = getSafeNextSectorOptions(lot) || [];
      }
    } catch (_) {
      opcoes = [];
    }
    if (!Array.isArray(opcoes) || !opcoes.length) { semDestino.push(lot); return; }

    const chave = opcoes.map(o => o.value).join('|');
    if (!grupos.has(chave)) grupos.set(chave, { chave, opcoes, lotes: [] });
    grupos.get(chave).lotes.push(lot);
  });

  return { grupos: Array.from(grupos.values()), semDestino };
}

function ffSelAbrirAvanco() {
  if (!ffSelModoAtivo() || FF_SEL.gravando) return;
  const todos = ffSelLotesMarcados();
  if (!todos.length) return;

  const { grupos, semDestino } = ffSelAgruparPorDestino(todos);

  if (!grupos.length) {
    alert(
      'Nenhum dos lotes marcados tem proximo setor disponivel.\n\n' +
      'Sao os mesmos destinos que o botao "Avancar" do card oferece.'
    );
    return;
  }

  // Lote que entrou no setor agora pode ser apontamento errado. A acao
  // de um lote so avisa; aqui o aviso vem contado, uma vez.
  const guarda = (typeof ADVANCE_GUARD_MS === 'number') ? ADVANCE_GUARD_MS : 120000;
  const recentes = todos.filter(l => {
    const entrou = Number(l.sectorEnteredAt || (l.raw_mysql && l.raw_mysql.ff_sectorEnteredAt) || 0);
    return entrou && (Date.now() - entrou) < guarda;
  }).length;

  const corpo = document.getElementById('modalSelMassaBody');
  if (!corpo) { alert('Nao encontrei o modal da acao em massa.'); return; }

  corpo.innerHTML = `
    <p class="ff-sel-modal-intro">
      ${todos.length} lote(s) marcado(s).
      ${grupos.length > 1 ? 'Eles estao em situacoes diferentes, entao escolha o destino de cada grupo:' : 'Escolha o destino:'}
    </p>
    ${grupos.map((g, i) => `
      <div class="ff-sel-grupo">
        <div class="ff-sel-grupo-topo">
          <strong>${g.lotes.length} lote(s)</strong>
          <span class="text-muted">em ${Array.from(new Set(g.lotes.map(l => ffSelNomeSetor(
            (typeof ffGetLotCurrentSector === 'function') ? ffGetLotCurrentSector(l) : l.sector
          )))).join(', ')}</span>
        </div>
        <div class="ff-sel-grupo-lotes">
          ${g.lotes.slice(0, 8).map(l => `#${escapeHtml(String(l.number || ''))}`).join(' · ')}
          ${g.lotes.length > 8 ? ` · e mais ${g.lotes.length - 8}` : ''}
        </div>
        <select class="ff-sel-destino" data-sel-grupo="${i}">
          ${g.opcoes.map(o => `<option value="${escapeHtml(String(o.value))}">${escapeHtml(String(o.label || o.value))}</option>`).join('')}
        </select>
      </div>`).join('')}

    <label class="ff-sel-nota-lbl">Observacao (opcional, vai no historico de todos)</label>
    <textarea id="ffSelNota" rows="2" placeholder="Ex.: liberado pelo PCP em lote"></textarea>

    ${recentes ? `<div class="ff-sel-aviso">
      <i class="fas fa-exclamation-triangle"></i>
      ${recentes} lote(s) entrou(aram) no setor atual ha menos de 2 minutos.
      Confira se nao foi apontamento errado.
    </div>` : ''}

    ${semDestino.length ? `<div class="ff-sel-aviso">
      <i class="fas fa-info-circle"></i>
      ${semDestino.length} lote(s) serao IGNORADOS por nao ter proximo setor:
      ${semDestino.slice(0, 8).map(l => `#${escapeHtml(String(l.number || ''))}`).join(', ')}${semDestino.length > 8 ? '…' : ''}
    </div>` : ''}
  `;

  // Guarda os grupos para o confirmar ler. Em memoria, nao no DOM: o
  // select devolve so o destino, e precisamos da lista de lotes.
  FF_SEL._grupos = grupos;
  if (typeof openModal === 'function') openModal('modalSelecaoMassa');
}

function ffSelConfirmarAvanco() {
  const grupos = FF_SEL._grupos || [];
  if (!grupos.length) return;

  const nota = (document.getElementById('ffSelNota')?.value || '').trim();

  // Cada lote vai com o destino do grupo dele.
  const plano = [];
  grupos.forEach((g, i) => {
    const sel = document.querySelector(`.ff-sel-destino[data-sel-grupo="${i}"]`);
    const destino = sel ? sel.value : (g.opcoes[0] && g.opcoes[0].value);
    if (!destino) return;
    g.lotes.forEach(lot => plano.push({ lot, destino }));
  });

  if (!plano.length) return;
  // closeModal() sem argumento ja fecha: a guarda dele e contra
  // clique que veio de dentro do modal.
  if (typeof closeModal === 'function') closeModal();

  const destinoPorLote = new Map(plano.map(p => [String(p.lot.id), p.destino]));

  ffSelGravarLotes(
    plano.map(p => p.lot),
    (lot, user) => (typeof ffAplicarEnvioDeSetor === 'function')
      ? ffAplicarEnvioDeSetor(lot, destinoPorLote.get(String(lot.id)), user, nota)
      : null,
    'envio para o proximo setor'
  );
}

// ---------------------------------------------------
// GRAVACAO
// ---------------------------------------------------
// Um PATCH por lote, em sequencia - o backend nao tem rota em lote e
// inventar uma seria mexer em endpoint compartilhado com outros
// modulos. Em sequencia, e nao em paralelo, de proposito: o servidor
// atende outros setores ao mesmo tempo.
//
// Durante o laco o redesenho fica suspenso (ffSuspenderRedesenhoDeLote),
// senao cada apiUpdateLot() reconstruiria a pagina e apagaria a busca.
// No fim, SEMPRE reloadData(): se algum PATCH falhar, o objeto em
// memoria ja foi alterado e so a releitura do servidor devolve a
// verdade para a tela.
async function ffSelGravarLotes(lista, aplicar, rotulo) {
  if (FF_SEL.gravando) return;
  if (!Array.isArray(lista) || !lista.length) return;

  const user = (typeof STATE !== 'undefined' && STATE) ? STATE.currentUser : null;
  if (!user) { alert('Sessao sem usuario. Entre de novo.'); return; }

  FF_SEL.gravando = true;
  ffSelAtualizarBarra();
  ffSelMostrarProgresso(0, lista.length);

  let gravados = 0;
  const falhas = [];

  if (typeof ffSuspenderRedesenhoDeLote === 'function') ffSuspenderRedesenhoDeLote(true);
  try {
    for (let i = 0; i < lista.length; i++) {
      const lot = lista[i];
      ffSelMostrarProgresso(i, lista.length);
      try {
        const r = aplicar(lot, user);
        if (!r) { falhas.push({ numero: lot.number, erro: 'as regras do lote nao aceitaram a acao' }); continue; }
        await apiUpdateLot(lot);
        gravados++;
      } catch (e) {
        falhas.push({ numero: lot.number, erro: (e && e.message) ? e.message : String(e) });
      }
    }
  } finally {
    if (typeof ffSuspenderRedesenhoDeLote === 'function') ffSuspenderRedesenhoDeLote(false);
    FF_SEL.gravando = false;
  }

  try {
    if (typeof reloadData === 'function') await reloadData();
  } catch (_) { /* a tela continua: o aviso abaixo diz o que gravou */ }

  FF_SEL.marcados.clear();
  FF_SEL.ativo = false;
  ffSelEsconderProgresso();
  ffSelRedesenharGrade();
  ffSelAposRenderDaPagina();

  if (!falhas.length) {
    if (typeof showToast === 'function') showToast(`${gravados} lote(s): ${rotulo} concluido`, 'success');
  } else {
    if (typeof showToast === 'function') showToast(`${gravados} gravado(s), ${falhas.length} com erro`, 'error');
    alert(
      `Acao: ${rotulo}\n\n` +
      `Gravados: ${gravados}\nCom erro: ${falhas.length}\n\n` +
      falhas.slice(0, 12).map(f => `  #${f.numero}: ${f.erro}`).join('\n') +
      (falhas.length > 12 ? `\n  ... e mais ${falhas.length - 12}` : '') +
      '\n\nOs lotes com erro continuam como estavam no servidor.'
    );
  }
}

function ffSelMostrarProgresso(feitos, total) {
  let el = document.getElementById('ffSelProgresso');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ffSelProgresso';
    el.className = 'ff-sel-progresso';
    document.body.appendChild(el);
  }
  el.classList.add('visivel');
  el.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Gravando ${feitos + 1} de ${total}…`;
}

function ffSelEsconderProgresso() {
  const el = document.getElementById('ffSelProgresso');
  if (el) el.classList.remove('visivel');
}
