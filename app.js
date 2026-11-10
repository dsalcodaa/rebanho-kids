import {
  SUPERIOR, aniversariantes, entregasPorMes, avaliarDesafio, descendentes, encontrosRealizados, frequenciaPorMes, mediaNotas, mediaTurma,
  motivosAtencao, parecerBI, rebanhosVisiveis, resumoGabaritos,
  resumoCrianca, semanasDoDesafio, topsDaCrianca, versiculosDoDesafio,
} from './regras.js';

// shortcut: dados ficam no localStorage de cada navegador e o login não tem senha;
// login e permissões de verdade vêm com o Supabase.
const CHAVE = 'rebanho-kids-v1';
const CHAVE_PERFIL = 'rebanho-kids-perfil';
const app = document.getElementById('app');
let db, base;

// ---------- Utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const nota = (x) => (x == null ? '—' : Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
const hoje = () => new Date().toLocaleDateString('sv-SE');
const idade = (n) => {
  if (!n) return '—';
  const [a, m, d] = n.split('-').map(Number), h = new Date();
  return h.getFullYear() - a - (h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d) ? 1 : 0);
};
const ordenados = () => [...db.encontros].sort((a, b) => a.data.localeCompare(b.data));
const nomeCurto = (c) => c.nome.split(' ').slice(0, 2).join(' ');
const rotulo = { top: 'TOP', nao: 'Não atingiu', andamento: 'Em andamento', fora: 'Fora' };
const tag = (s) => `<span class="tag ${s}">${rotulo[s]}</span>`;
const opcoes = (lista, sel, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(([v, t]) => `<option value="${esc(v)}" ${String(sel ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('');

function aviso(msg) {
  const el = document.getElementById('aviso');
  el.textContent = msg;
  el.classList.add('vis');
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => el.classList.remove('vis'), 2500);
}

function salvar(msg = 'Salvo') {
  localStorage.setItem(CHAVE, JSON.stringify(db));
  aviso(msg);
}

function dadosDoForm(form) {
  const o = Object.fromEntries(new FormData(form));
  form.querySelectorAll('input[type=checkbox]').forEach((c) => { if (!('lista' in c.dataset)) o[c.name] = c.checked; });
  return o;
}

// ---------- Organograma e acesso ----------
const PAPEIS = {
  pastor: 'Pastor',
  coord_geral: 'Coordenador geral',
  coord_rebanho: 'Coordenador de rebanho',
  professor: 'Professor de rebanho',
  lider_geral: 'Líder geral',
  lider_secao: 'Líder de setor', // chave antiga mantida para não perder cadastros salvos
  membro_setor: 'Membro de equipe', // sem login: não edita nada
};
const TURMAS = [1, 2, 3, 4].flatMap((n) => ['A', 'B', 'C'].map((l) => `${n}${l}`));
const ENSINO = ['admin', 'pastor', 'coord_geral', 'coord_rebanho', 'professor'];
const TODOS = [...ENSINO, 'lider_geral', 'lider_secao'];

// Quem cada perfil cadastra (organograma das telas).
const CADASTRA = {
  admin: Object.keys(PAPEIS),
  pastor: ['coord_geral', 'coord_rebanho', 'professor', 'lider_geral', 'lider_secao', 'membro_setor'],
  coord_geral: ['coord_rebanho'],
  coord_rebanho: ['professor'],
  professor: ['professor'],
  lider_geral: ['lider_secao', 'membro_setor'],
  lider_secao: ['membro_setor'],
};

const SETOR_PROFESSOR = 'Professores de Rebanho';
const SETOR_RECEPCAO = 'Recepção';
const SETOR_BI = 'Bíblia Intelecto';
const LIDERES = ['lider_geral', 'lider_secao'];
const EQUIPE_SETOR = [...LIDERES, 'membro_setor'];

// Sessão: 'admin' ou id da pessoa. shortcut: login sem senha (teste); senha de verdade vem com o Supabase.
const sessao = () => localStorage.getItem(CHAVE_PERFIL);
const eu = () => db.pessoas.find((p) => p.id === sessao() && PAPEIS[p.papel] && p.papel !== 'membro_setor') || null;
const logado = () => sessao() === 'admin' || !!eu();
const papel = () => eu()?.papel ?? 'admin';
const editaCronograma = () => ['admin', 'pastor'].includes(papel());
// Recepção: equipe de setor cujo setor é "Recepção". Cadastra crianças e marca presença.
const ehRecepcao = () => LIDERES.includes(papel()) && setoresDe(eu()).includes(SETOR_RECEPCAO);
const cadastraCrianca = () => papel() === 'admin' || ehRecepcao();
// Bíblia Intelecto: corrige os gabaritos dos 13 livros e aplica as provas.
const ehBI = () => LIDERES.includes(papel()) && setoresDe(eu()).includes(SETOR_BI);
const lancaBI = () => papel() === 'admin' || ehBI();
// Lançamentos completos (versículos, meditação, notas): só professores de rebanho.
const lancaTudo = () => papel() === 'professor';
const lancaPresenca = () => lancaTudo() || ehRecepcao();

// Abas do menu: lista de perfis ou função que decide.
const ABAS = [
  ['', 'Painel', ENSINO],
  ['setor', 'Meu setor', LIDERES],
  ['recepcao', 'Recepção', () => ehRecepcao()],
  ['cronograma', 'Cronograma', ENSINO],
  ['equipe', 'Equipes e Setores', TODOS],
  ['rebanhos', 'Rebanhos', ['admin', 'pastor', 'coord_geral', 'coord_rebanho']],
  ['encontros', 'Lançamentos', lancaTudo],
  ['intelecto', 'Bíblia Intelecto', () => ENSINO.includes(papel()) || ehBI()],
  ['provas', 'Provas', () => ENSINO.includes(papel()) || ehBI()],
  ['criancas', 'Crianças', () => ENSINO.includes(papel()) || ehRecepcao() || ehBI()],
  ['desafios', 'Desafios', ENSINO],
  ['dados', 'Dados', ['admin', 'pastor']],
];
const abasPermitidas = () => ABAS.filter(([, , quem]) => (typeof quem === 'function' ? quem() : quem.includes(papel())));
const pessoa = (id) => db.pessoas.find((p) => p.id === id);
const nomePessoa = (id) => pessoa(id)?.nome ?? '—';
const secao = (id) => db.secoes.find((s) => s.id === id);
// Onde a pessoa atua: uma linha por seção/setor (professor pode estar em mais de uma seção,
// membro pode estar em setores diferentes em cada seção). Cadastros antigos tinham um campo só.
const atuacoes = (p) => p?.atuacoes ?? (p?.secaoId || p?.setor
  ? [{ secaoId: p.secaoId || '', setor: p.setor || '', turma: p.turma || '', cor: p.cor || '' }] : []);
const setoresDe = (p) => [...new Set(atuacoes(p).map((a) => a.setor).filter(Boolean))];
const secoesDe = (p) => [...new Set(atuacoes(p).map((a) => a.secaoId).filter(Boolean))];
const textoAtuacao = (p) => atuacoes(p).map((a) => [secao(a.secaoId)?.nome, a.setor,
  [a.turma, CORES[a.cor]?.[0]].filter(Boolean).join(' ')].filter(Boolean).join(' · ')).join(' | ');
const CORES = { azul: ['Azul', '#2f6fd6'], verde: ['Verde', '#2f9d55'], amarelo: ['Amarelo', '#e0b000'], vermelho: ['Vermelho', '#d23c32'] };
const ORDEM_COR = Object.keys(CORES);
const ordemRebanho = (a, b) => (a.secaoId ?? 'z').localeCompare(b.secaoId ?? 'z')
  || TURMAS.indexOf(a.turma) - TURMAS.indexOf(b.turma) || ORDEM_COR.indexOf(a.cor) - ORDEM_COR.indexOf(b.cor);
// Recepção enxerga os rebanhos da sua seção (ou todos, se a seção não foi definida).
const secoesDoSetor = (...nomes) => atuacoes(eu()).filter((a) => nomes.includes(a.setor)).map((a) => a.secaoId);
const secoesRecepcao = () => secoesDoSetor(SETOR_RECEPCAO);
// Recepção e Bíblia Intelecto enxergam os rebanhos das seções em que atuam.
const meusRebanhos = () => (ehRecepcao() || ehBI()
  ? db.rebanhos.filter((r) => { const ss = secoesDoSetor(SETOR_RECEPCAO, SETOR_BI); return !ss.length || ss.includes('') || ss.includes(r.secaoId); })
  : [...rebanhosVisiveis(db, eu())]).sort(ordemRebanho);
const rebanho = (id) => db.rebanhos.find((r) => r.id === id);
const acharRebanho = (secaoId, turma, cor) => db.rebanhos.find((r) => r.secaoId === secaoId && r.turma === turma && r.cor === cor);
// Rebanho em uso: tem professor, coordenadora ou criança ativa (os demais existem só na estrutura).
const emUso = (r) => r.professores.length || r.coordenadorId || db.criancas.some((c) => c.ativa && c.rebanhoId === r.id);
const meusAtivos = () => meusRebanhos().filter(emUso);
const nomeRebanho = (r) => (r ? `${r.nome}${r.turma ? ` ${r.turma}` : ''} · ${secao(r.secaoId)?.nome ?? 'seção a definir'}` : 'Sem rebanho');
const bolinha = (r) => (CORES[r?.cor] ? `<span class="cor" style="background:${CORES[r.cor][1]}"></span>` : '');
// Rebanho da criança em uma linha: cor, turma e seção
const ondeEsta = (c) => {
  const r = rebanho(c.rebanhoId);
  return r ? `${bolinha(r)}${CORES[r.cor]?.[0] ?? esc(r.nome)} · ${esc(c.turma || r.turma || 'turma ?')} · ${esc(secao(r.secaoId)?.nome ?? '—')}` : '—';
};
const minhasCriancas = () => {
  const ids = new Set(meusRebanhos().map((r) => r.id));
  return db.criancas.filter((c) => ids.has(c.rebanhoId));
};
const ancestrais = (p) => {
  const out = [];
  let x = p && pessoa(p.superiorId);
  while (x && !out.includes(x)) { out.push(x); x = pessoa(x.superiorId); }
  return out;
};
// Pessoas que eu enxergo: admin e pastor veem todos; os demais, eles mesmos, sua equipe abaixo
// e, no caso do professor, os colegas dos mesmos rebanhos.
const equipeVisivel = () => {
  const membros = db.pessoas.filter((p) => PAPEIS[p.papel]); // fora: novos membros sem função definida
  if (['admin', 'pastor'].includes(papel())) return membros;
  const ids = descendentes(db, eu().id).add(eu().id);
  if (papel() === 'professor') meusRebanhos().forEach((r) => r.professores.forEach((x) => ids.add(x)));
  return membros.filter((p) => ids.has(p.id));
};

function montarTopo() {
  const area = document.getElementById('sessao');
  if (!logado()) {
    document.getElementById('menu').innerHTML = '';
    area.innerHTML = '';
    return;
  }
  area.innerHTML = `<span><strong>${esc(eu()?.nome ?? 'Pastor')}</strong><br>${eu() ? `${PAPEIS[eu().papel]}${setoresDe(eu()).length ? ` · ${esc(setoresDe(eu()).join(', '))}` : ''}` : 'acesso total (teste)'}</span>
    <button class="btn sec" id="sair">Sair</button>`;
  document.getElementById('sair').onclick = () => {
    localStorage.removeItem(CHAVE_PERFIL);
    sessionStorage.removeItem('rebanhoAtual');
    montarTopo();
    if (location.hash === '#/') rotear(); else location.hash = '#/';
  };
  document.getElementById('menu').innerHTML = abasPermitidas()
    .map(([h, t]) => `<a href="#/${h}">${t}</a>`).join('');
}

// ---------- Login ----------
function login() {
  // Recepção tem perfil próprio no login
  const doSetor = (nome) => (p) => LIDERES.includes(p.papel) && setoresDe(p).includes(nome);
  const proprio = (p) => doSetor(SETOR_RECEPCAO)(p) || doSetor(SETOR_BI)(p);
  const grupos = [...Object.entries(PAPEIS).filter(([k]) => k !== 'membro_setor').map(([k, t]) => [k, t, db.pessoas.filter((p) => p.papel === k && !proprio(p))]),
    ['recepcao', 'Recepção', db.pessoas.filter(doSetor(SETOR_RECEPCAO))],
    ['bi', 'Bíblia Intelecto', db.pessoas.filter(doSetor(SETOR_BI))]].filter(([, , ps]) => ps.length);
  app.innerHTML = `
    <div class="login card">
      <span class="logo grande">RK</span>
      <h1>Rebanho Kids</h1>
      <p class="sub">${esc(db.ministerio)} · Gestão e acompanhamento</p>
      <form id="entrar" class="pilha">
        <label>Perfil <select name="papel">${opcoes([['admin', 'Pastor (acesso total)'], ...grupos.map(([k, t]) => [k, t])], 'admin')}</select></label>
        <label id="quem" hidden>Nome <select name="pessoa"></select></label>
        <button class="btn">Entrar</button>
      </form>
      <p><a href="#/cadastro">Novo no ministério? Faça seu cadastro inicial</a></p>
      <p class="vazio pequeno">Versão de teste: entrada sem senha. O login com senha vem na versão com Supabase.</p>
    </div>`;
  const f = document.getElementById('entrar');
  const atualizar = () => {
    const ps = grupos.find(([k]) => k === f.papel.value)?.[2] ?? [];
    document.getElementById('quem').hidden = !ps.length;
    f.pessoa.innerHTML = opcoes(ps.map((x) => [x.id, x.nome]));
  };
  f.papel.onchange = atualizar;
  atualizar();
  f.onsubmit = (ev) => {
    ev.preventDefault();
    localStorage.setItem(CHAVE_PERFIL, f.papel.value === 'admin' ? 'admin' : f.pessoa.value);
    montarTopo();
    if (location.hash === '#/') rotear(); else location.hash = '#/';
  };
}

// Cadastro inicial: quem entra no ministério se cadastra; a liderança define depois função, setor e subordinação.
function cadastroInicial() {
  app.innerHTML = `
    <div class="login card">
      <span class="logo grande">RK</span>
      <h1>Cadastro inicial</h1>
      <p class="sub">Bem-vindo ao ${esc(db.ministerio)}! Depois do cadastro, a liderança define sua função e seu setor.</p>
      <form id="cad" class="pilha">
        <label>Nome completo <input name="nome" required></label>
        <label>Data de nascimento <input type="date" name="nascimento" required></label>
        <label>Telefone <input type="tel" name="telefone" required></label>
        <label>E-mail <input type="email" name="email"></label>
        <label>Setor de interesse <select name="interesse">${opcoes(db.setores.map((s) => [s.nome, s.nome]), '', 'Ainda não sei')}</select></label>
        <button class="btn">Enviar cadastro</button>
      </form>
      <p><a href="#/">Voltar ao login</a></p>
    </div>`;
  document.getElementById('cad').onsubmit = (ev) => {
    ev.preventDefault();
    db.pessoas.push({ id: `pe${Date.now()}`, ...dadosDoForm(ev.target), papel: 'novo', superiorId: null, cadastroEm: hoje() });
    salvar('Cadastro enviado');
    app.innerHTML = `<div class="login card"><h1>Cadastro enviado</h1>
      <p>Obrigado, ${esc(ev.target.nome.value)}! Assim que a liderança definir sua função, seu nome aparece no login.</p>
      <p><a class="btn" href="#/">Voltar ao login</a></p></div>`;
  };
}

// ---------- Painel ----------
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Barras simples de % por mês (rótulo do valor em cima, mês embaixo).
function graficoMeses(titulo, dados) {
  if (!dados.length) return `<div class="card"><strong>${titulo}</strong><p class="vazio">Sem lançamentos.</p></div>`;
  return `<div class="card"><strong>${titulo}</strong>
    <div class="barras" role="img" aria-label="${titulo}: ${dados.map((m) => `${MESES[+m.mes.slice(5) - 1]} ${pct(m.pct)}`).join(', ')}">
      ${dados.map((m) => `<div class="barra" title="${m.presencas} de ${m.total}">
        <span class="valor">${pct(m.pct)}</span><span class="trilho"><span class="col" style="height:${Math.min(100, Math.round(m.pct * 100))}%"></span></span>
        <span class="mes">${MESES[+m.mes.slice(5) - 1]}</span></div>`).join('')}
    </div></div>`;
}
// Kids ou Infantil: rebanhos sem o campo são do Kids.
const PROGRAMAS = [['kids', 'Kids'], ['infantil', 'Infantil']];
const programaDe = (r) => r.programa ?? 'kids';

function painel(rid) {
  const prog = sessionStorage.getItem('painelPrograma') || 'kids';
  const doProg = meusAtivos().filter((r) => programaDe(r) === prog);
  const sid = db.secoes.some((s) => s.id === sessionStorage.getItem('painelSecao')) ? sessionStorage.getItem('painelSecao') : '';
  const visiveis = doProg.filter((r) => !sid || r.secaoId === sid);
  const escopo = visiveis.some((r) => r.id === rid) ? visiveis.filter((r) => r.id === rid) : visiveis;
  const ids = new Set(escopo.map((r) => r.id));
  const todas = minhasCriancas().filter((c) => ids.has(c.rebanhoId));
  const ativas = todas.filter((c) => c.ativa);
  const inativas = todas.filter((c) => !c.ativa);
  const media = (lista, k) => {
    const v = lista.map((c) => resumoCrianca(db.registros[c.id] || {})[k].pct).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const linhas = [...ativas, ...inativas].map((c) => ({
    c, r: resumoCrianca(db.registros[c.id] || {}), tops: topsDaCrianca(db, c), notas: db.notas[c.id] || {},
  }));
  const premiados = linhas.filter((l) => l.tops.length >= db.topsPremiacao);
  const varios = escopo.length > 1;
  const lancados = (e) => ativas.some((c) => Object.keys(db.registros[c.id]?.[e.id] || {}).length);
  const semLanc = ordenados().filter((e) => e.tipo !== 'sem_aula' && e.data < hoje() && ativas.length && !lancados(e));

  app.innerHTML = `
    <div class="filtros">
      <label class="perfil">Programação <select id="fPrograma">${opcoes(PROGRAMAS, prog)}</select></label>
      <label class="perfil">Seção <select id="fSecao">${opcoes(db.secoes.map((s) => [s.id, `${s.nome} (${s.horario})`]), sid, 'Todas as seções')}</select></label>
      ${visiveis.length > 1 ? `<label class="perfil">Rebanho <select id="filtro">${opcoes(visiveis.map((r) => [r.id, nomeRebanho(r)]), escopo.length === 1 ? escopo[0].id : '', 'Todos os rebanhos')}</select></label>` : ''}
    </div>
    ${!escopo.length ? `<p class="info">${prog === 'infantil' && !doProg.length ? 'Nenhum rebanho do Infantil cadastrado ainda.' : sid ? 'Nenhum rebanho nesta seção.' : 'Nenhum rebanho vinculado a este perfil.'}</p>` : ''}
    <div class="cards">
      <div class="card"><div class="num">${ativas.length}</div><div class="rot">crianças ativas</div></div>
      <div class="card"><div class="num">${inativas.length}</div><div class="rot">crianças inativas</div></div>
      <div class="card"><div class="num">${pct(media(ativas, 'kids'))}</div><div class="rot">frequência média no Kids</div></div>
      <div class="card"><div class="num">${pct(media(ativas, 'culto'))}</div><div class="rot">frequência média no culto</div></div>
      <div class="card"><div class="num">${nota(mediaTurma(db, ativas))}</div><div class="rot">média das provas (0 a ${db.notaMaxima})</div></div>
      <div class="card"><div class="num">${premiados.length}</div><div class="rot">com ${db.topsPremiacao}+ TOPs (premiação)</div></div>
    </div>

    <h2>Frequência por mês</h2>
    <div class="duas">${graficoMeses(prog === 'infantil' ? 'Infantil' : 'Kids', frequenciaPorMes(db, ativas, 'k'))}${graficoMeses('Culto', frequenciaPorMes(db, ativas, 'c'))}</div>
    <h2>Entregas por mês</h2>
    <div class="duas">${graficoMeses('Meditações completas', entregasPorMes(db, ativas, 'm'))}${graficoMeses('Versículos decorados (do máximo)', entregasPorMes(db, ativas, 'v'))}</div>

    <div class="duas">
      <div><h2>Aniversariantes de ${MESES[new Date().getMonth()]}</h2>
        <div class="card">${(() => {
          const mes = new Date().getMonth() + 1;
          const lista = [...aniversariantes(ativas, mes), ...aniversariantes(equipeVisivel(), mes)];
          return lista.length ? `<ul class="lista">${lista.map((x) => `<li><strong>${x.nascimento.slice(8)}/${x.nascimento.slice(5, 7)}</strong>
            ${esc(x.nome)} <span class="vazio">· faz ${idade(x.nascimento) + (x.nascimento.slice(5) > hoje().slice(5) ? 1 : 0)} anos${x.papel ? ` · ${PAPEIS[x.papel]}` : ''}</span></li>`).join('')}</ul>`
            : '<p class="vazio">Ninguém faz aniversário este mês.</p>'; })()}</div></div>
      <div><h2>Precisam de atenção</h2>
        <div class="card">${(() => {
          const lista = ativas.map((c) => ({ c, m: motivosAtencao(db, c) })).filter((x) => x.m.length);
          return lista.length ? `<ul class="lista">${lista.map((x) => `<li><a href="#/crianca/${x.c.id}">${esc(x.c.nome)}</a>
            <span class="vazio">· ${esc(x.m.join('; '))}</span></li>`).join('')}</ul>`
            : '<p class="vazio">Nenhuma criança com frequência abaixo de 75% ou 3 faltas seguidas.</p>'; })()}</div></div>
    </div>

    <h2>Ranking de versículos</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>#</th><th>Criança</th><th>Versículos decorados</th><th>Meditações completas</th></tr>
      ${ativas.map((c) => ({ c, r: resumoCrianca(db.registros[c.id] || {}) })).sort((a, b) => b.r.versiculos - a.r.versiculos).slice(0, 10)
        .map((x, i) => `<tr><td>${i + 1}º</td><td><a href="#/crianca/${x.c.id}">${esc(x.c.nome)}</a></td><td>${x.r.versiculos}</td>
          <td>${x.r.meditacoes.completas}/${x.r.meditacoes.total}</td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Sem crianças.</td></tr>'}
    </table></div>

    ${varios ? `<h2>Rebanhos</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Rebanho</th><th>Seção</th><th>Professores</th><th>Ativas</th><th>Kids</th><th>Média provas</th><th>Premiadas</th></tr>
      ${escopo.map((r) => { const cs = ativas.filter((c) => c.rebanhoId === r.id);
        return `<tr><td>${bolinha(r)}<a href="#/painel/${r.id}">${esc(r.nome)}${r.turma ? ` ${esc(r.turma)}` : ''}</a></td><td>${esc(secao(r.secaoId)?.nome ?? '—')}</td>
          <td>${esc(r.professores.map(nomePessoa).join(', ') || '—')}</td><td>${cs.length}</td><td>${pct(media(cs, 'kids'))}</td>
          <td>${nota(mediaTurma(db, cs))}</td><td>${cs.filter((c) => topsDaCrianca(db, c).length >= db.topsPremiacao).length}</td></tr>`; }).join('')}
    </table></div>` : ''}

    <h2>Desafios</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Desafio</th><th>Período</th><th>TOPs</th><th>Em andamento</th></tr>
      ${db.desafios.map((d) => {
        const s = semanasDoDesafio(db, d), r = ativas.map((c) => avaliarDesafio(db, d, c).status);
        return `<tr><td><a href="#/desafio/${d.id}">${esc(d.nome)}</a></td>
          <td>${fmt(s[0]?.data)} a ${fmt(s.at(-1)?.data)} (${d.semanas} sem.)</td>
          <td>${r.filter((x) => x === 'top').length}</td><td>${r.filter((x) => x === 'andamento').length}</td></tr>`;
      }).join('')}
    </table></div>

    <h2>Todas as crianças</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Criança</th>${varios ? '<th>Rebanho</th>' : ''}<th>Kids</th><th>Culto</th>${db.provas.map((p) => `<th>${esc(p.nome)}</th>`).join('')}<th>Média</th><th>TOPs</th><th>Conquistados</th></tr>
      ${linhas.map((l) => `<tr><td><a href="#/crianca/${l.c.id}">${esc(l.c.nome)}</a> ${l.c.ativa ? '' : '<span class="tag fora">inativa</span>'}</td>
        ${varios ? `<td>${ondeEsta(l.c)}</td>` : ''}
        <td>${pct(l.r.kids.pct)}</td><td>${pct(l.r.culto.pct)}</td>
        ${db.provas.map((p) => `<td>${nota(l.notas[p.id])}</td>`).join('')}
        <td><strong>${nota(mediaNotas(l.notas))}</strong></td>
        <td>${l.tops.length >= db.topsPremiacao ? `<span class="tag top">${l.tops.length} — premiada</span>` : l.tops.length}</td>
        <td>${l.tops.map((d) => esc(d.nome)).join(', ') || '—'}</td></tr>`).join('')}
      <tr><td><strong>Média</strong></td>${varios ? '<td></td>' : ''}<td>${pct(media(ativas, 'kids'))}</td><td>${pct(media(ativas, 'culto'))}</td>
        ${db.provas.map((p) => `<td>${nota(mediaNotas(Object.fromEntries(ativas.map((c) => [c.id, db.notas[c.id]?.[p.id]]))))}</td>`).join('')}
        <td><strong>${nota(mediaTurma(db, ativas))}</strong></td><td></td><td></td></tr>
    </table></div>

    <h2>Para conferir</h2>
    <ul class="alertas">
      ${semLanc.map((e) => `<li>Encontro de ${lancaTudo() ? `<a href="#/encontro/${e.id}">${fmt(e.data)}</a>` : fmt(e.data)} sem lançamento</li>`).join('')}
      ${db.alertas.map((a) => `<li>${esc(a)}</li>`).join('')}
    </ul>`;
  const ir = (h) => (location.hash === h ? rotear() : (location.hash = h));
  const f = document.getElementById('filtro');
  if (f) f.onchange = () => ir(f.value ? `#/painel/${f.value}` : '#/');
  document.getElementById('fPrograma').onchange = (ev) => { sessionStorage.setItem('painelPrograma', ev.target.value); sessionStorage.removeItem('painelSecao'); ir('#/'); };
  document.getElementById('fSecao').onchange = (ev) => { sessionStorage.setItem('painelSecao', ev.target.value); ir('#/'); };
}

const vazioLinha = (n, txt) => `<tr><td colspan="${n}" class="vazio">${txt}</td></tr>`;


// ---------- Cronograma (pastores) ----------
const desafiosDaData = (e) => db.desafios.filter((d) => semanasDoDesafio(db, d).some((x) => x.id === e.id));

function formCronograma(e) {
  return `
    <label>Data <input type="date" name="data" required value="${esc(e.data)}"></label>
    <label>Tipo <select name="tipo">${opcoes([['aula', 'Programação do Kids'], ['sem_aula', 'Sem programação']], e.tipo ?? 'aula')}</select></label>
    <label>Tema da aula <input name="tema" value="${esc(e.tema)}"></label>
    <label>Versículo (referência) <input name="versiculo" value="${esc(e.versiculo)}" placeholder="Ex.: João 3:16"></label>
    <label>Versículos decorados (máximo) <input type="number" name="pontos" min="0" step="0.5" value="${e.id != null ? db.versiculoMax[e.id] ?? '' : ''}"></label>
    <label>Meditação <input name="meditacao" value="${esc(e.meditacao)}"></label>`;
}

// Salas do dia: setores pelos quais a criança passa (cada um cadastra sua programação em "Meu setor").
const setoresSala = () => db.setores.filter((st) => ![SETOR_RECEPCAO, SETOR_PROFESSOR].includes(st.nome));
const CAMPO_SETOR = { 'História Bíblica': 'Tema da história', 'Revisão e Retenção': 'Atividade', 'Momento Alegria': 'Atividade', [SETOR_BI]: 'Sala' };
const SALAS_BI = ['Sala normal', 'Sala crânio'];
// Programação do setor na data; sem seção escolhida, mostra a seção de cada item.
function programaDoSetor(st, e, sid) {
  const itens = (db.programacoes?.[st.id] || []).filter((x) => x.data === e.data && (!sid || !x.secaoId || x.secaoId === sid));
  if (!itens.length) return e.setores?.[st.id] ? esc(e.setores[st.id]) : ''; // cadastros antigos feitos pelo pastor
  return itens.map((x) => `${!sid && x.secaoId ? `<span class="vazio">${esc(secao(x.secaoId)?.nome)}:</span> ` : ''}${esc(x.tema)}`).join('<br>');
}
const programaDoDia = (e, sid) => setoresSala().map((st) => [st, programaDoSetor(st, e, sid)]).filter(([, t]) => t)
  .map(([st, t]) => `<strong>${esc(st.nome)}:</strong> ${t}`).join('<br>');

function lerCronograma(form, e) {
  const d = dadosDoForm(form);
  Object.assign(e, { data: d.data, tipo: d.tipo, tema: d.tema, versiculo: d.versiculo, meditacao: d.meditacao });
  if (d.pontos === '') delete db.versiculoMax[e.id]; else db.versiculoMax[e.id] = Number(d.pontos);
}

function cronograma(sid) {
  const pode = editaCronograma();
  const salas = setoresSala();
  let n = 0;
  app.innerHTML = `
    <h1>Cronograma do ano</h1>
    <p class="info">Datas, versículos, meditações e desafios são definidos pelos pastores e aparecem nos lançamentos dos professores.
      As colunas de cada sala (${esc(salas.map((st) => st.nome).join(', '))}) vêm do que cada setor cadastra em "Meu setor".</p>
    <h2>Seções</h2>
    <div class="cards">${db.secoes.map((s) => `<div class="card"><div class="num" style="font-size:1.1rem">${esc(s.nome)}</div><div class="rot">${esc(s.horario)}</div></div>`).join('')}</div>
    <h2>Programação</h2>
    <div class="acoes"><a class="btn ${sid ? 'sec' : ''}" href="#/cronograma">Todas as seções</a>
      ${db.secoes.map((s) => `<a class="btn ${s.id === sid ? '' : 'sec'}" href="#/cronograma/${s.id}">${esc(s.nome)}</a>`).join('')}</div>
    <div class="rolar"><table class="tabela cronograma">
      <tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Tema</th><th>Versículo</th><th>Versículos decorados</th><th>Meditação</th>
        ${salas.map((st) => `<th class="sala">${esc(st.nome)}<br><span class="vazio">${esc(CAMPO_SETOR[st.nome] ?? 'Programação')}</span></th>`).join('')}
        <th>Desafio</th>${pode ? '<th></th>' : ''}</tr>
      ${ordenados().map((e) => `<tr><td>${e.tipo === 'sem_aula' ? '' : ++n}</td><td>${fmt(e.data)}</td>
        <td>${e.tipo === 'sem_aula' ? '<span class="tag fora">Sem programação</span>' : 'Kids'}</td>
        <td>${esc(e.tema || '—')}</td><td>${esc(e.versiculo || '—')}</td><td>${db.versiculoMax[e.id] ?? '—'}</td>
        <td>${esc(e.meditacao || '—')}</td>${salas.map((st) => `<td class="sala">${e.tipo === 'sem_aula' ? '' : programaDoSetor(st, e, sid) || '—'}</td>`).join('')}<td>${esc(desafiosDaData(e).map((d) => d.nome).join(', ') || '—')}</td>
        ${pode ? `<td><a class="btn sec" href="#/data/${e.id}">Editar</a></td>` : ''}</tr>`).join('')}
    </table></div>
    ${pode ? `<h2>Nova data</h2>
    <form class="grade" id="nova">${formCronograma({})}<div style="align-self:end"><button class="btn">Adicionar ao cronograma</button></div></form>

    <h2>Desafios do ano</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Desafio</th><th>Início</th><th>Semanas</th><th>FJ permitidas</th><th>Versículos decorados</th><th>Meditação</th></tr>
      ${db.desafios.map((d) => `<tr><td><a href="#/desafio/${d.id}">${esc(d.nome)}</a></td><td>${fmt(semanasDoDesafio(db, d)[0]?.data)}</td>
        <td>${d.semanas}</td><td>${d.fj}</td><td>${d.versiculosMin}</td><td>${d.meditacao ? 'sim' : 'não'}</td></tr>`).join('')}
    </table></div>
    <h2>Novo desafio</h2>
    <form class="grade" id="novoDesafio">${formDesafio({})}<div style="align-self:end"><button class="btn">Criar desafio</button></div></form>
    <h2>Premiação de fim de ano</h2>
    <form class="grade" id="premio"><label>TOPs necessários <input type="number" name="tops" min="1" value="${db.topsPremiacao}"></label>
      <div style="align-self:end"><button class="btn sec">Salvar</button></div></form>` : ''}`;
  if (!pode) return;
  document.getElementById('nova').onsubmit = (ev) => {
    ev.preventDefault();
    if (db.encontros.some((e) => e.data === ev.target.data.value)) return aviso('Já existe essa data no cronograma');
    const e = { id: Math.max(0, ...db.encontros.map((x) => x.id)) + 1 };
    lerCronograma(ev.target, e);
    db.encontros.push(e);
    salvar('Data adicionada ao cronograma');
    cronograma();
  };
  const f = document.getElementById('novoDesafio');
  ligarSugestoes(f);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    db.desafios.push({ id: `d${Date.now()}`, ...lerDesafio(f) });
    salvar('Desafio criado');
    cronograma();
  };
  document.getElementById('premio').onsubmit = (ev) => {
    ev.preventDefault();
    db.topsPremiacao = Number(ev.target.tops.value);
    salvar('Premiação atualizada');
  };
}

function dataCronograma(id) {
  const e = db.encontros.find((x) => x.id === Number(id));
  if (!e || !editaCronograma()) return (app.innerHTML = '<p class="vazio">Data não encontrada ou sem permissão.</p>');
  const usada = Object.values(db.registros).some((r) => r[e.id]);
  app.innerHTML = `
    <h1>Cronograma — ${fmt(e.data)}</h1>
    <form class="grade" id="editar">${formCronograma(e)}<div style="align-self:end"><button class="btn">Salvar</button></div></form>
    <div class="acoes">${usada
      ? '<p class="vazio">Esta data já tem lançamentos de professores; para tirá-la do ano, marque "Sem programação".</p>'
      : '<button class="btn perigo" id="excluir">Excluir data</button>'}</div>`;
  document.getElementById('editar').onsubmit = (ev) => {
    ev.preventDefault();
    if (db.encontros.some((x) => x !== e && x.data === ev.target.data.value)) return aviso('Já existe essa data no cronograma');
    lerCronograma(ev.target, e);
    salvar('Cronograma atualizado');
    location.hash = '#/cronograma';
  };
  const x = document.getElementById('excluir');
  if (x) x.onclick = () => {
    if (!confirm(`Excluir ${fmt(e.data)} do cronograma?`)) return;
    db.encontros = db.encontros.filter((y) => y !== e);
    delete db.versiculoMax[e.id];
    salvar('Data excluída');
    location.hash = '#/cronograma';
  };
}

// ---------- Equipes e Setores ----------
const COM_ATUACAO = ['coord_geral', 'coord_rebanho', 'professor', ...EQUIPE_SETOR];
const RAMO_ENSINO = ['pastor', 'coord_geral', 'coord_rebanho', 'professor'];
const RAMO_SETORES = ['pastor', ...EQUIPE_SETOR];
// Caminho da criança na seção: começa na Recepção e passa pelos setores (Professores de Rebanho conduzem).
const setoresDoFluxo = () => [...db.setores.filter((st) => st.nome === SETOR_RECEPCAO),
  ...db.setores.filter((st) => ![SETOR_RECEPCAO, SETOR_PROFESSOR].includes(st.nome))];
const COR_SETOR = ['#6b7280', '#2f6fd6', '#2f9d55', '#e0b000', '#d23c32', '#8a4fd1', '#0f8b8d'];
const DICA_ATUACAO = {
  professor: 'Uma linha por seção. No setor Professores de Rebanho, escolha turma e cor: o nome entra direto na aba Rebanhos.',
  coord_rebanho: 'Uma linha por seção. Turma ou cor em branco = coordena todas da seção.',
  coord_geral: 'Seções que acompanha.',
};

const linhaAtuacao = (a = {}) => `<div class="atuacao">
    <label>Seção <select data-k="secaoId">${opcoes(db.secoes.map((x) => [x.id, `${x.nome} (${x.horario})`]), a.secaoId, '—')}</select></label>
    <label data-campo="setor">Setor <select data-k="setor">${opcoes(db.setores.map((x) => [x.nome, x.nome]), a.setor, '—')}</select></label>
    <label data-campo="turma">Turma <select data-k="turma">${opcoes(TURMAS.map((t) => [t, t]), a.turma, '—')}</select></label>
    <label data-campo="turma">Cor do rebanho <select data-k="cor">${opcoes(Object.entries(CORES).map(([k, [t]]) => [k, t]), a.cor, '—')}</select></label>
    <button type="button" class="btn sec remover" aria-label="Remover linha">Remover</button></div>`;

const lerAtuacoes = (form) => [...form.querySelectorAll('.atuacao')]
  .map((el) => Object.fromEntries([...el.querySelectorAll('[data-k]')].map((x) => [x.dataset.k, x.value])));

function formPessoa(p, papeisPermitidos) {
  const linhas = atuacoes(p).length ? atuacoes(p) : [{ setor: p.interesse }];
  return `
    <label>Nome completo <input name="nome" required value="${esc(p.nome)}"></label>
    <label>Função <select name="papel">${opcoes(papeisPermitidos.map((k) => [k, PAPEIS[k]]), PAPEIS[p.papel] ? p.papel : papeisPermitidos[0])}</select></label>
    <label>Subordinado a <select name="superiorId"></select></label>
    <label>Data de nascimento <input type="date" name="nascimento" value="${esc(p.nascimento)}"></label>
    <label>Telefone <input name="telefone" value="${esc(p.telefone)}"></label>
    <label>E-mail <input type="email" name="email" value="${esc(p.email)}"></label>
    <div class="atuacoes" data-so="${COM_ATUACAO.join(' ')}">
      <strong>Onde atua</strong> <span class="vazio pequeno" data-dica></span>
      <div class="linhas">${linhas.map(linhaAtuacao).join('')}</div>
      <button type="button" class="btn sec" data-mais>+ Adicionar seção ou setor</button>
    </div>`;
}

// Atualiza "Subordinado a" e os campos de atuação conforme a função escolhida.
function ligarPessoa(form, p) {
  const caixa = form.querySelector('.linhas');
  const campos = () => {
    const f = form.papel.value;
    caixa.querySelectorAll('.atuacao').forEach((el) => {
      const setor = el.querySelector('[data-k=setor]').value;
      el.querySelector('[data-campo=setor]').hidden = f.startsWith('coord');
      el.querySelectorAll('[data-campo=turma]').forEach((x) => { x.hidden = !(f === 'coord_rebanho' || (f === 'professor' && setor === SETOR_PROFESSOR)); });
    });
    form.querySelector('[data-dica]').textContent = DICA_ATUACAO[f] ?? 'Uma linha por seção e setor em que atua.';
  };
  // Professor: sugere como superior a coordenadora do rebanho escolhido.
  const sugerirCoord = () => {
    if (form.papel.value !== 'professor' || form.superiorId.value) return;
    const a = lerAtuacoes(form).find((x) => x.setor === SETOR_PROFESSOR);
    const r = a && acharRebanho(a.secaoId, a.turma, a.cor);
    if (r?.coordenadorId && [...form.superiorId.options].some((o) => o.value === r.coordenadorId)) form.superiorId.value = r.coordenadorId;
  };
  const atualizar = () => {
    const sup = SUPERIOR[form.papel.value];
    const candidatos = [...new Set([...equipeVisivel(), ...(eu() ? [eu(), ...ancestrais(eu())] : [])])].filter((x) => x.papel === sup && x.id !== p.id);
    let padrao = p.superiorId ?? (eu()?.papel === sup ? eu().id : eu()?.papel === form.papel.value ? eu().superiorId ?? '' : '');
    // Coordenadores gerais e líderes gerais respondem aos pastores
    if (!padrao && sup === 'pastor' && candidatos.length) padrao = candidatos[0].id;
    form.superiorId.innerHTML = sup
      ? opcoes(candidatos.map((x) => [x.id, x.nome]), padrao, `— escolher ${PAPEIS[sup].toLowerCase()} —`)
      : '<option value="">Topo do organograma</option>';
    form.querySelectorAll('[data-so]').forEach((el) => { el.hidden = !el.dataset.so.split(' ').includes(form.papel.value); });
    if (form.papel.value === 'professor') caixa.querySelectorAll('[data-k=setor]').forEach((x) => { if (!x.value) x.value = SETOR_PROFESSOR; });
    campos();
    sugerirCoord();
  };
  form.papel.onchange = atualizar;
  caixa.onchange = () => { campos(); sugerirCoord(); };
  caixa.onclick = (ev) => { if (ev.target.closest('.remover')) ev.target.closest('.atuacao').remove(); };
  form.querySelector('[data-mais]').onclick = () => {
    caixa.insertAdjacentHTML('beforeend', linhaAtuacao({ setor: form.papel.value === 'professor' ? SETOR_PROFESSOR : '' }));
    campos();
  };
  atualizar();
}

function lerPessoa(form) {
  const d = dadosDoForm(form);
  const lista = (COM_ATUACAO.includes(d.papel) ? lerAtuacoes(form) : []).map((a) => {
    if (d.papel.startsWith('coord')) a.setor = '';
    if (!(d.papel === 'coord_rebanho' || (d.papel === 'professor' && a.setor === SETOR_PROFESSOR))) { a.turma = ''; a.cor = ''; }
    return a;
  }).filter((a) => a.secaoId || a.setor);
  if (d.papel === 'professor') {
    const prof = lista.filter((a) => a.setor === SETOR_PROFESSOR);
    if (!prof.length || prof.some((a) => !(a.secaoId && a.turma && a.cor))) {
      return { erro: 'Professor precisa de seção, turma e cor em cada linha de Professores de Rebanho' };
    }
  }
  // Atuações substituem os campos antigos de seção/setor/turma/cor
  return { ...d, atuacoes: lista, secaoId: undefined, setor: undefined, turma: undefined, cor: undefined, superiorId: d.superiorId || null };
}

// Coloca a pessoa nos rebanhos das suas atuações (aparece direto na aba Rebanhos).
function vincular(p) {
  const as = atuacoes(p);
  const refazCoord = p.papel !== 'coord_rebanho' || as.some((a) => a.secaoId);
  for (const r of db.rebanhos) {
    r.professores = r.professores.filter((x) => x !== p.id);
    if (refazCoord && r.coordenadorId === p.id) r.coordenadorId = null;
  }
  if (p.papel === 'professor') {
    as.filter((a) => a.setor === SETOR_PROFESSOR).forEach((a) => {
      const r = acharRebanho(a.secaoId, a.turma, a.cor);
      if (!r) return;
      if (!r.professores.includes(p.id)) r.professores.push(p.id);
      if (!p.superiorId && r.coordenadorId) p.superiorId = r.coordenadorId;
    });
  }
  if (p.papel === 'coord_rebanho') {
    as.filter((a) => a.secaoId).forEach((a) => db.rebanhos
      .filter((r) => r.secaoId === a.secaoId && (!a.turma || r.turma === a.turma) && (!a.cor || r.cor === a.cor))
      .forEach((r) => { r.coordenadorId = p.id; }));
  }
}

function equipe() {
  const visiveis = equipeVisivel();
  const todos = db.pessoas.filter((p) => PAPEIS[p.papel]);
  const ids = new Set(visiveis.map((p) => p.id));
  const pode = CADASTRA[papel()];
  const editavel = (p) => p.id !== eu()?.id && pode.includes(p.papel);
  const novos = pode.length ? db.pessoas.filter((p) => p.papel === 'novo') : [];
  // Coordenadores e professores cuidam só do ensino; líderes veem só os próprios setores.
  const verEnsino = !LIDERES.includes(papel());
  const verSetores = !['coord_geral', 'coord_rebanho', 'professor'].includes(papel());
  const setoresVis = db.setores.filter((st) => st.nome !== SETOR_PROFESSOR && (!LIDERES.includes(papel()) || setoresDe(eu()).includes(st.nome)));
  const nome = (p) => (editavel(p) ? `<a href="#/pessoa/${p.id}">${esc(p.nome)}</a>` : `<strong>${esc(p.nome)}</strong>`);
  const no = (p, ramo) => {
    const filhos = visiveis.filter((x) => x.superiorId === p.id && ramo.includes(x.papel));
    const n = db.rebanhos.filter((r) => r.coordenadorId === p.id).length;
    const extra = [textoAtuacao(p), n && `coordena ${n} rebanho(s)`].filter(Boolean).join(' · ');
    return `<li>${nome(p)} <span class="papel">${PAPEIS[p.papel]}${extra ? ` · ${esc(extra)}` : ''}</span>
      ${filhos.length ? `<ul>${filhos.map((f) => no(f, ramo)).join('')}</ul>` : ''}</li>`;
  };
  const arvore = (ramo) => {
    const raizes = visiveis.filter((p) => ramo.includes(p.papel) && (!p.superiorId || !ids.has(p.superiorId)))
      .filter((p) => p.papel !== 'pastor' || visiveis.some((x) => x.superiorId === p.id && ramo.includes(x.papel)) || ramo === RAMO_ENSINO);
    return raizes.length ? `<ul class="arvore">${raizes.map((p) => no(p, ramo)).join('')}</ul>` : '<p class="vazio">Ninguém cadastrado.</p>';
  };
  const ondeNoSetor = (p, st) => atuacoes(p).filter((a) => a.setor === st.nome).map((a) => secao(a.secaoId)?.nome).filter(Boolean).join(', ');
  const cartaoSetor = (st, i) => {
    const gente = (k) => todos.filter((p) => p.papel === k && setoresDe(p).includes(st.nome));
    const lista = (k) => gente(k).map((p) => `${nome(p)}${ondeNoSetor(p, st) ? ` <span class="vazio">(${esc(ondeNoSetor(p, st))})</span>` : ''}`).join('<br>');
    return `<div class="card setor" style="border-top-color:${COR_SETOR[i % COR_SETOR.length]}"><h3>${esc(st.nome)}</h3>
      ${[...EQUIPE_SETOR, 'professor'].map((k) => gente(k).length ? `<p><span class="papel">${PAPEIS[k]}</span><br>${lista(k)}</p>` : '').join('') || '<p class="vazio">ninguém cadastrado</p>'}</div>`;
  };
  const fluxo = (s) => {
    const etapas = setoresDoFluxo().filter((st) => setoresVis.includes(st));
    const gente = (st) => todos.filter((p) => atuacoes(p).some((a) => a.setor === st.nome && a.secaoId === s.id));
    const prox = (st) => (db.programacoes?.[st.id] || []).filter((x) => (!x.secaoId || x.secaoId === s.id) && x.data >= hoje())
      .sort((a, b) => a.data.localeCompare(b.data))[0];
    const profs = todos.filter((p) => p.papel === 'professor' && atuacoes(p).some((a) => a.setor === SETOR_PROFESSOR && a.secaoId === s.id));
    const nCriancas = db.criancas.filter((c) => c.ativa && rebanho(c.rebanhoId)?.secaoId === s.id).length;
    return `<div class="card secao-fluxo"><h3>${esc(s.nome)} <span class="vazio">· ${esc(s.horario)} · ${nCriancas} criança(s)</span></h3>
      <div class="fluxo">${etapas.map((st, i) => { const px = prox(st);
        return `${i ? '<span class="seta" aria-hidden="true">→</span>' : ''}
        <div class="etapa" style="border-top-color:${COR_SETOR[db.setores.indexOf(st) % COR_SETOR.length]}">
          <span class="passo">${i + 1}</span> <strong>${esc(st.nome)}</strong>
          <small>${gente(st).map((p) => `${esc(p.nome)}${p.papel === 'lider_geral' ? ' <em>(líder geral)</em>' : ''}`).join('<br>') || 'ninguém escalado'}</small>
          ${px ? `<small class="prox">Próximo: ${fmt(px.data)} · ${esc(px.tema)}</small>` : ''}</div>`; }).join('')}</div>
      <p class="conduz">Professores de rebanho conduzem as crianças entre os setores: ${profs.length ? esc(profs.map((p) => p.nome).join(', ')) : 'nenhum nesta seção'}</p></div>`;
  };
  const ordem = Object.keys(PAPEIS);
  const pessoas = [...visiveis].sort((a, b) => ordem.indexOf(a.papel) - ordem.indexOf(b.papel) || a.nome.localeCompare(b.nome));
  const orfaos = visiveis.filter((p) => SUPERIOR[p.papel] && !p.superiorId);
  const novoForm = ['professor', 'coord_rebanho'].includes(papel())
    ? { atuacoes: atuacoes(eu()).filter((a) => a.secaoId).map((a) => ({ ...a, setor: SETOR_PROFESSOR })) } : {};

  // Dashboard do pastor: quantidade da equipe por função, setor e seção.
  const dash = () => {
    const conta = (ps) => ps.length;
    const PAP = ['lider_geral', 'lider_secao', 'membro_setor', 'professor'];
    const noSetor = (st) => todos.filter((p) => setoresDe(p).includes(st.nome));
    const naSecao = (st, s) => todos.filter((p) => atuacoes(p).some((a) => a.setor === st.nome && a.secaoId === s.id));
    return `<div class="cards">${Object.entries(PAPEIS).map(([k, t]) => `<div class="card"><div class="num">${conta(todos.filter((p) => p.papel === k))}</div><div class="rot">${t}</div></div>`).join('')}
      <div class="card"><div class="num">${todos.length}</div><div class="rot">equipe total</div></div></div>
    <h2>Equipe por setor</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Setor</th>${PAP.map((k) => `<th>${PAPEIS[k]}</th>`).join('')}<th>Total</th>${db.secoes.map((s) => `<th>${esc(s.nome)}</th>`).join('')}</tr>
      ${db.setores.map((st) => `<tr><td><strong>${esc(st.nome)}</strong></td>
        ${PAP.map((k) => `<td>${conta(noSetor(st).filter((p) => p.papel === k))}</td>`).join('')}
        <td><strong>${conta(noSetor(st))}</strong></td>${db.secoes.map((s) => `<td>${conta(naSecao(st, s))}</td>`).join('')}</tr>`).join('')}
      <tr><td><strong>Sem setor</strong></td>${PAP.map((k) => `<td>${conta(todos.filter((p) => p.papel === k && !setoresDe(p).length))}</td>`).join('')}
        <td><strong>${conta(todos.filter((p) => !setoresDe(p).length))}</strong></td>${db.secoes.map(() => '<td></td>').join('')}</tr>
    </table></div>
    <p class="vazio pequeno">Quem atua em mais de um setor ou seção conta em cada um.</p>`;
  };

  app.innerHTML = `
    <h1>Equipes e Setores</h1>
    <p class="sub">${esc(db.ministerio)}</p>
    ${['admin', 'pastor'].includes(papel()) ? `<h2>Dashboard da equipe</h2>${dash()}` : ''}
    ${novos.length ? `<h2>Novos membros aguardando definição</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Nome</th><th>Idade</th><th>Telefone</th><th>E-mail</th><th>Setor de interesse</th><th>Cadastro em</th><th></th></tr>
      ${novos.map((p) => `<tr><td><strong>${esc(p.nome)}</strong></td><td>${idade(p.nascimento)}</td><td>${esc(p.telefone || '—')}</td>
        <td>${esc(p.email || '—')}</td><td>${esc(p.interesse || '—')}</td><td>${fmt(p.cadastroEm)}</td>
        <td><a class="btn" href="#/pessoa/${p.id}">Definir função</a></td></tr>`).join('')}
    </table></div>` : ''}

    <h2>Organograma</h2>
    <div class="duas">
      ${verEnsino ? `<div class="card"><h3>Ensino: coordenadoras e professores</h3>
        <p class="vazio pequeno">Pastores → Coordenadores gerais → Coordenadoras de rebanho → Professores de rebanho</p>${arvore(RAMO_ENSINO)}</div>` : ''}
      ${verSetores ? `<div class="card"><h3>Setores: líderes gerais</h3>
        <p class="vazio pequeno">Pastores → Líderes gerais → Líderes de setor → Membros de equipe</p>${arvore(RAMO_SETORES)}</div>` : ''}
    </div>

    ${verSetores ? `<h2>Setores</h2>
    <div class="setores">${setoresVis.map((st) => cartaoSetor(st, db.setores.indexOf(st))).join('') || '<p class="vazio">Seu setor ainda não foi definido.</p>'}</div>
    ${editaCronograma() ? `<form class="grade" id="novoSetor" style="margin-top:.75rem"><label>Novo setor <input name="nome" required></label>
      <div style="align-self:end"><button class="btn sec">Adicionar setor</button></div></form>` : ''}
    <h2>Seções</h2>
    <p class="sub">Em cada seção as crianças começam na Recepção e passam por todos os setores, levadas pelos professores de rebanho.</p>
    ${db.secoes.map(fluxo).join('')}` : ''}

    <h2>Pessoas cadastradas</h2>
    ${orfaos.length ? `<p class="info">Sem superior definido: ${orfaos.map((p) => esc(p.nome)).join(', ')}.</p>` : ''}
    <div class="rolar"><table class="tabela">
      <tr><th>Nome</th><th>Função</th><th>Onde atua</th><th>Subordinado a</th><th>Telefone</th><th></th></tr>
      ${pessoas.map((p) => `<tr><td>${esc(p.nome)}</td><td>${PAPEIS[p.papel]}</td><td>${esc(textoAtuacao(p) || '—')}</td>
        <td>${esc(nomePessoa(p.superiorId))}</td><td>${esc(p.telefone || '—')}</td>
        <td>${editavel(p) ? `<a class="btn sec" href="#/pessoa/${p.id}">Editar</a>` : ''}</td></tr>`).join('') || vazioLinha(6, 'Ninguém cadastrado.')}
    </table></div>

    ${pode.length ? `<h2>Cadastrar pessoa</h2>
    <form class="grade" id="nova">${formPessoa(novoForm, pode)}<div style="align-self:end"><button class="btn">Cadastrar</button></div></form>` : ''}`;
  const fs = document.getElementById('novoSetor');
  if (fs) fs.onsubmit = (ev) => {
    ev.preventDefault();
    const nomeSetor = ev.target.nome.value.trim();
    if (db.setores.some((x) => x.nome.toLowerCase() === nomeSetor.toLowerCase())) return aviso('Setor já existe');
    db.setores.push({ id: `st${Date.now()}`, nome: nomeSetor });
    salvar('Setor adicionado');
    equipe();
  };
  const f = document.getElementById('nova');
  if (!f) return;
  ligarPessoa(f, {});
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const d = lerPessoa(f);
    if (d.erro) return aviso(d.erro);
    const p = { id: `pe${Date.now()}`, ...d };
    db.pessoas.push(p);
    vincular(p);
    salvar(`${PAPEIS[p.papel]} cadastrado`);
    montarTopo();
    equipe();
  };
}

function pessoaPagina(id) {
  const p = pessoa(id);
  const pode = CADASTRA[papel()];
  const novo = p?.papel === 'novo';
  if (!p || !(novo ? pode.length : pode.includes(p.papel) && equipeVisivel().includes(p))) {
    return (app.innerHTML = '<p class="vazio">Pessoa não encontrada ou sem permissão.</p>');
  }
  const subs = db.pessoas.filter((x) => x.superiorId === p.id);
  app.innerHTML = `
    <p><a href="#/equipe">← Equipes e Setores</a></p>
    <h1>${novo ? '' : 'Editar: '}${esc(p.nome)}</h1>
    <p class="sub">${novo ? `Novo membro · cadastro inicial em ${fmt(p.cadastroEm)}${p.interesse ? ` · interesse: ${esc(p.interesse)}` : ''}<br>Defina função, setor e subordinação.`
      : `${PAPEIS[p.papel]} · subordinado a ${esc(nomePessoa(p.superiorId))}`}</p>
    <form class="grade" id="editar">${formPessoa(p, pode)}<div style="align-self:end"><button class="btn">Salvar</button></div></form>
    <div class="acoes">${subs.length ? `<p class="vazio">Para excluir, primeiro transfira ${subs.length} subordinado(s).</p>`
      : '<button class="btn perigo" id="excluir">Excluir pessoa</button>'}</div>`;
  const f = document.getElementById('editar');
  ligarPessoa(f, p);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const d = lerPessoa(f);
    if (d.erro) return aviso(d.erro);
    if (d.papel !== p.papel && subs.length) return aviso('Transfira os subordinados antes de mudar a função');
    Object.assign(p, d);
    vincular(p);
    salvar(novo ? `${p.nome} agora é ${PAPEIS[p.papel]}` : 'Cadastro atualizado');
    montarTopo();
    location.hash = '#/equipe';
  };
  const x = document.getElementById('excluir');
  if (x) x.onclick = () => {
    if (!confirm(`Excluir ${p.nome} da equipe?`)) return;
    db.rebanhos.forEach((r) => {
      r.professores = r.professores.filter((y) => y !== p.id);
      if (r.coordenadorId === p.id) r.coordenadorId = null;
    });
    db.pessoas = db.pessoas.filter((y) => y !== p);
    salvar('Pessoa excluída');
    montarTopo();
    location.hash = '#/equipe';
  };
}

// ---------- Rebanhos ----------
// Estrutura fixa: em cada seção, cada turma (1A a 4C) tem os rebanhos Azul, Verde, Amarelo e Vermelho.
function rebanhos(sid) {
  const lista = meusRebanhos();
  const secoes = db.secoes.filter((x) => lista.some((r) => r.secaoId === x.id));
  const s = secoes.find((x) => x.id === (sid || sessionStorage.getItem('secaoRebanhos')))
    || secoes.find((x) => lista.some((r) => r.secaoId === x.id && emUso(r))) || secoes[0];
  if (!s) return (app.innerHTML = '<h1>Rebanhos</h1><p class="info">Nenhum rebanho vinculado a este perfil.</p>');
  sessionStorage.setItem('secaoRebanhos', s.id);
  const daSecao = lista.filter((r) => r.secaoId === s.id);
  const ativas = (r) => db.criancas.filter((c) => c.ativa && c.rebanhoId === r.id).length;
  const soma = (rs) => rs.reduce((a, r) => a + ativas(r), 0);
  const cards = [[daSecao.filter(emUso).length, 'rebanhos em uso'], [new Set(daSecao.flatMap((r) => r.professores)).size, 'professores'],
    [new Set(daSecao.map((r) => r.coordenadorId).filter(Boolean)).size, 'coordenadoras'], [soma(daSecao), 'crianças ativas']];
  app.innerHTML = `
    <h1>Rebanhos</h1>
    <p class="sub">Cada turma tem os rebanhos Azul, Verde, Amarelo e Vermelho. Professores e coordenadoras aparecem aqui assim que são cadastrados.</p>
    <div class="acoes">${secoes.map((x) => `<a class="btn ${x.id === s.id ? '' : 'sec'}" href="#/rebanhos/${x.id}">${esc(x.nome)} · ${esc(x.horario)}</a>`).join('')}</div>
    <div class="cards">${cards.map(([n, t]) => `<div class="card"><div class="num">${n}</div><div class="rot">${t}</div></div>`).join('')}</div>
    <div class="turmas">${[...TURMAS, ''].map((t) => { const rs = daSecao.filter((r) => (r.turma || '') === t);
      if (!rs.length) return '';
      const coords = [...new Set(rs.map((r) => r.coordenadorId).filter(Boolean))].map(nomePessoa);
      return `<div class="card"><h3>${t ? `Turma ${t}` : 'Sem turma'} <span class="vazio pequeno">· ${soma(rs)} criança(s)</span></h3>
        <p class="coord">Coordenadora: <strong>${esc(coords.join(', ') || 'a definir')}</strong></p>
        ${rs.map((r) => `<a class="linha${emUso(r) ? '' : ' livre'}" href="#/rebanho/${r.id}">${bolinha(r)}<span><strong>${CORES[r.cor]?.[0] ?? esc(r.nome)}</strong>
          <br>Professor: ${esc(r.professores.map(nomePessoa).join(', ') || '—')}
          <br>Crianças ativas: ${ativas(r)}</span></a>`).join('')}</div>`; }).join('')}</div>`;
}

function rebanhoPagina(id) {
  const r = meusRebanhos().find((x) => x.id === id);
  if (!r) return (app.innerHTML = '<p class="vazio">Rebanho não encontrado ou sem permissão.</p>');
  const visiveis = equipeVisivel();
  const coords = visiveis.filter((p) => p.papel === 'coord_rebanho');
  const profs = visiveis.filter((p) => p.papel === 'professor');
  const cs = db.criancas.filter((c) => c.ativa && c.rebanhoId === r.id);
  app.innerHTML = `
    <h1>${bolinha(r)}${esc(nomeRebanho(r))}</h1>
    <p class="sub">${cs.length} criança(s) ativa(s)${emUso(r) ? ` · <a href="#/painel/${r.id}">abrir painel</a>` : ''}</p>
    <form class="grade" id="editar">
      <label>Coordenadora de rebanho <select name="coordenadorId">${opcoes(coords.map((p) => [p.id, p.nome]), r.coordenadorId, '—')}</select></label>
      <div class="checks"><span class="vazio">Professores:</span>${profs.length ? profs.map((p) => `<label class="check">
        <input type="checkbox" name="professores" data-lista value="${p.id}" ${r.professores.includes(p.id) ? 'checked' : ''}> ${esc(p.nome)}</label>`).join('')
        : '<span class="vazio">nenhum professor cadastrado</span>'}</div>
      <div style="align-self:end"><button class="btn">Salvar</button></div></form>
    ${cs.length ? `<h2>Crianças</h2><ul class="lista">${cs.map((c) => `<li><a href="#/crianca/${c.id}">${esc(c.nome)}</a></li>`).join('')}</ul>` : ''}`;
  document.getElementById('editar').onsubmit = (ev) => {
    ev.preventDefault();
    r.coordenadorId = ev.target.coordenadorId.value || null;
    r.professores = [...ev.target.querySelectorAll('input[name=professores]:checked')].map((c) => c.value);
    // O cadastro de cada professor ganha (ou perde) a linha deste rebanho
    const deste = (a) => a.setor === SETOR_PROFESSOR && a.secaoId === r.secaoId && a.turma === r.turma && a.cor === r.cor;
    for (const p of profs) {
      const as = atuacoes(p).filter((a) => !deste(a));
      if (r.professores.includes(p.id)) as.push({ secaoId: r.secaoId, setor: SETOR_PROFESSOR, turma: r.turma, cor: r.cor });
      Object.assign(p, { atuacoes: as, secaoId: undefined, setor: undefined, turma: undefined, cor: undefined });
    }
    salvar('Rebanho atualizado');
    location.hash = `#/rebanhos/${r.secaoId}`;
  };
}

// ---------- Recepção ----------
// Recepção da seção: cadastro das crianças e presença no Kids/culto.
function recepcao(eid) {
  const ss = secoesRecepcao().map(secao).filter(Boolean);
  const rs = meusAtivos();
  const datas = ordenados().filter((e) => e.tipo !== 'sem_aula');
  const e = datas.find((x) => x.id === Number(eid)) || [...datas].reverse().find((x) => x.data <= hoje()) || datas[0];
  const cs = (r) => db.criancas.filter((c) => c.ativa && c.rebanhoId === r.id);
  const marcadas = (r) => cs(r).filter((c) => db.registros[c.id]?.[e.id]?.k).length;
  app.innerHTML = `
    <h1>Recepção${ss.length ? ` — ${esc(ss.map((x) => `${x.nome} (${x.horario})`).join(', '))}` : ''}</h1>
    <p class="sub">A recepção cadastra as crianças e marca presença e faltas. Versículos e meditações ficam com os professores.</p>
    <div class="acoes"><a class="btn" href="#/criancas">Cadastrar ou editar criança</a></div>
    ${e ? `<label class="perfil" style="margin-bottom:.5rem">Data <select id="data">${opcoes(datas.map((x) => [x.id, `${fmt(x.data)}${x.tema ? ` · ${x.tema}` : ''}`]), e.id)}</select></label>` : ''}
    <div class="rolar"><table class="tabela">
      <tr><th>Rebanho</th><th>Professor</th><th>Crianças ativas</th><th>Presença marcada</th><th></th></tr>
      ${e ? rs.map((r) => `<tr><td>${bolinha(r)}${esc(nomeRebanho(r))}</td><td>${esc(r.professores.map(nomePessoa).join(', ') || '—')}</td>
        <td>${cs(r).length}</td><td>${marcadas(r)}/${cs(r).length}</td>
        <td><a class="btn sec" href="#/presenca/${e.id}/${r.id}">Marcar presença</a></td></tr>`).join('') || vazioLinha(5, 'Nenhum rebanho com crianças nesta seção.')
        : vazioLinha(5, 'Cronograma sem datas.')}
    </table></div>`;
  const sel = document.getElementById('data');
  if (sel) sel.onchange = () => { location.hash = `#/recepcao/${sel.value}`; };
}

// ---------- Meu setor (líderes) ----------
// Programação própria do setor: a liderança cadastra data e tema (sem depender do cronograma).
function meuSetor(sid) {
  const p = eu();
  const meus = db.setores.filter((st) => setoresDe(p).includes(st.nome));
  if (!meus.length) return (app.innerHTML = `<h1>Meu setor</h1><p class="info">Seu setor ainda não foi definido. Fale com ${esc(nomePessoa(p?.superiorId))}.</p>`);
  const st = meus.find((x) => x.id === sid) || meus[0];
  const edita = ['lider_geral', 'lider_secao'].includes(p.papel);
  const secoesNoSetor = (x) => atuacoes(x).filter((a) => a.setor === st.nome).map((a) => secao(a.secaoId)?.nome).filter(Boolean).join(', ');
  const minhas = atuacoes(p).filter((a) => a.setor === st.nome).map((a) => a.secaoId).filter(Boolean);
  const gente = db.pessoas.filter((x) => EQUIPE_SETOR.includes(x.papel) && setoresDe(x).includes(st.nome))
    .sort((a, b) => EQUIPE_SETOR.indexOf(a.papel) - EQUIPE_SETOR.indexOf(b.papel) || a.nome.localeCompare(b.nome));
  const prog = [...(db.programacoes?.[st.id] || [])].sort((a, b) => a.data.localeCompare(b.data));
  const campo = CAMPO_SETOR[st.nome] ?? 'Tema';
  const datas = ordenados().filter((e) => e.tipo !== 'sem_aula');
  const proxima = datas.find((e) => e.data >= hoje());
  app.innerHTML = `
    ${meus.length > 1 ? `<div class="acoes">${meus.map((x) => `<a class="btn ${x === st ? '' : 'sec'}" href="#/setor/${x.id}">${esc(x.nome)}</a>`).join('')}</div>` : ''}
    <h1>${esc(st.nome)}</h1>
    <p class="sub">${PAPEIS[p.papel]}${secoesNoSetor(p) ? ` · ${esc(secoesNoSetor(p))}` : ''}
      <br>Liderança: ${esc(ancestrais(p).map((x) => `${x.nome} (${PAPEIS[x.papel]})`).join(' → ') || '—')}</p>
    ${st.nome === SETOR_RECEPCAO ? '<p class="info">Use a aba <a href="#/recepcao">Recepção</a> para cadastrar crianças e marcar presença.</p>' : ''}
    <h2>Programação do setor</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Data</th><th>Seção</th><th>${esc(campo)}</th>${edita ? '<th></th>' : ''}</tr>
      ${prog.map((x) => `<tr><td>${fmt(x.data)}</td><td>${esc(secao(x.secaoId)?.nome ?? 'Todas')}</td><td>${esc(x.tema)}</td>
        ${edita ? `<td><button class="btn sec" data-excluir="${x.id}">Excluir</button></td>` : ''}</tr>`).join('') || vazioLinha(edita ? 4 : 3, 'Nada cadastrado ainda.')}
    </table></div>
    ${edita ? `<form class="grade" id="novoTema" style="margin-top:.75rem">
      <label>Data do cronograma <select name="data" required>${opcoes(datas.map((e) => [e.data, `${fmt(e.data)}${e.tema ? ` · ${e.tema}` : ''}`]), proxima?.data)}</select></label>
      <label>Seção <select name="secaoId">${opcoes(db.secoes.map((x) => [x.id, `${x.nome} (${x.horario})`]), minhas[0], 'Todas as seções')}</select></label>
      ${st.nome === SETOR_BI ? `<label>Sala <select name="tema">${opcoes(SALAS_BI.map((x) => [x, x]))}</select></label>`
        : `<label>${esc(campo)} <input name="tema" required></label>`}
      <div style="align-self:end"><button class="btn">Adicionar</button></div></form>` : ''}
    <h2>Equipe do setor</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Nome</th><th>Função</th><th>Seção</th><th>Telefone</th></tr>
      ${gente.map((x) => `<tr><td>${x.id === p.id ? `<strong>${esc(x.nome)}</strong> (você)` : esc(x.nome)}</td><td>${PAPEIS[x.papel]}</td>
        <td>${esc(secoesNoSetor(x) || '—')}</td><td>${esc(x.telefone || '—')}</td></tr>`).join('')}
    </table></div>`;
  if (!edita) return;
  document.getElementById('novoTema').onsubmit = (ev) => {
    ev.preventDefault();
    const d = dadosDoForm(ev.target);
    db.programacoes ??= {};
    (db.programacoes[st.id] ??= []).push({ id: `pg${Date.now()}`, data: d.data, secaoId: d.secaoId || null, tema: d.tema.trim() });
    salvar(`${campo} cadastrado(a)`);
    meuSetor(st.id);
  };
  app.querySelectorAll('[data-excluir]').forEach((b) => {
    b.onclick = () => {
      db.programacoes[st.id] = db.programacoes[st.id].filter((x) => x.id !== b.dataset.excluir);
      salvar('Tema excluído');
      meuSetor(st.id);
    };
  });
}

// ---------- Lançamentos (professores) ----------
function rebanhoAtual(rid) {
  const lista = meusAtivos();
  return lista.find((r) => r.id === (rid || sessionStorage.getItem('rebanhoAtual'))) || lista[0];
}

const seletorRebanho = (r, destino) => (meusAtivos().length > 1
  ? `<label class="perfil" style="margin-bottom:.5rem">Rebanho <select id="trocaRebanho" data-destino="${destino}">
      ${opcoes(meusAtivos().map((x) => [x.id, nomeRebanho(x)]), r.id)}</select></label>` : '');

function ligarSeletor() {
  const s = document.getElementById('trocaRebanho');
  if (s) s.onchange = () => { sessionStorage.setItem('rebanhoAtual', s.value); location.hash = `${s.dataset.destino}/${s.value}`; };
}

function encontros(rid) {
  const r = rebanhoAtual(rid);
  if (!r) return (app.innerHTML = '<h1>Lançamentos</h1><p class="info">Nenhum rebanho vinculado a este perfil.</p>');
  const cs = db.criancas.filter((c) => c.rebanhoId === r.id);
  const lancado = (e) => cs.some((c) => Object.keys(db.registros[c.id]?.[e.id] || {}).length);
  const s = secao(r.secaoId);
  let n = 0;
  app.innerHTML = `
    ${seletorRebanho(r, '#/encontros')}
    <h1>Lançamentos — ${esc(nomeRebanho(r))}</h1>
    <p class="sub">${s ? `${esc(s.nome)} · ${esc(s.horario)} · ` : ''}Datas, versículos e meditações vêm do cronograma definido pelos pastores.</p>
    <div class="rolar"><table class="tabela">
      <tr><th>Nº</th><th>Data</th><th>Tema</th><th>Versículo</th><th>Situação</th><th></th></tr>
      ${ordenados().filter((e) => e.tipo !== 'sem_aula').map((e) => `<tr><td>${++n}</td><td>${fmt(e.data)}</td>
        <td>${esc(e.tema || '—')}</td><td>${esc(e.versiculo || '')} ${db.versiculoMax[e.id] != null ? `<span class="vazio">(até ${db.versiculoMax[e.id]} decorados)</span>` : ''}</td>
        <td>${lancado(e) ? '<span class="tag top">Lançado</span>' : e.data < hoje() ? '<span class="tag nao">Sem lançamento</span>' : '<span class="tag fora">Previsto</span>'}</td>
        <td><a class="btn sec" href="#/encontro/${e.id}/${r.id}">Lançar</a></td></tr>`).join('')}
    </table></div>`;
  ligarSeletor();
}

const OPCOES = {
  k: ['P', 'A', 'F', 'FJ'],
  c: ['P', 'F', 'FJ'],
  m: ['OK', 'MI', 'MI-OK', 'X'],
};

// Recepção abre pela rota "presenca": só presença e faltas; versículos e meditação ficam com professores e coordenadoras.
const presenca = (id, rid) => encontro(id, rid, '#/presenca');

function encontro(id, rid, rota = '#/encontro') {
  const e = db.encontros.find((x) => x.id === Number(id));
  const r = rebanhoAtual(rid);
  if (!e || !r) return (app.innerHTML = '<p class="vazio">Encontro ou rebanho não encontrado.</p>');
  const soPresenca = rota === '#/presenca' || !lancaTudo();
  const s = secao(r.secaoId);
  const vmax = db.versiculoMax[e.id];
  const cab = `
    ${seletorRebanho(r, `${rota}/${e.id}`)}
    <h1>${fmt(e.data)} — ${esc(nomeRebanho(r))}</h1>
    <div class="info"><strong>Cronograma:</strong> ${esc(e.tema || 'sem tema')}
      · Versículo: ${esc(e.versiculo || '—')} ${vmax != null ? `(até ${vmax} decorados)` : '(quantidade não definida)'}
      · Meditação: ${esc(e.meditacao || '—')}${s ? ` · ${esc(s.nome)} ${esc(s.horario)}` : ''}
      ${programaDoDia(e, r.secaoId) ? `<div style="margin-top:.4rem">${programaDoDia(e, r.secaoId)}</div>` : ''}</div>`;
  if (e.tipo === 'sem_aula') {
    app.innerHTML = `${cab}<p class="vazio">Data marcada no cronograma como sem programação.</p>`;
    return ligarSeletor();
  }
  const criancas = db.criancas.filter((c) => c.rebanhoId === r.id && ((c.ativa && c.entrada <= e.data) || db.registros[c.id]?.[e.id]));
  const rascunho = Object.fromEntries(criancas.map((c) => [c.id, { ...(db.registros[c.id]?.[e.id] || {}) }]));
  const seg = (cid, campo) => `<div class="seg">${OPCOES[campo].map((v) =>
    `<button type="button" data-c="${cid}" data-f="${campo}" data-v="${v}" class="${rascunho[cid][campo] === v ? 'on' : ''}">${v}</button>`).join('')}</div>`;

  app.innerHTML = `${cab}
    <p class="sub">Kids: P presente · A atraso · F falta · FJ falta justificada.${soPresenca ? ' Versículos e meditações são lançados pelos professores.' : ' Meditação: OK completa · MI incompleta · MI-OK complementada · X não fez.'}</p>
    <div class="acoes"><button type="button" class="btn sec" id="todos">Marcar todos presentes</button></div>
    <div class="lanc">
      ${criancas.length ? criancas.map((c) => `<div class="aluno">
        <div class="nome">${esc(c.nome)}${c.alergias ? `<br><span class="tag nao">Alergia: ${esc(c.alergias)}</span>` : ''}</div>
        <div class="campo"><span>Kids</span>${seg(c.id, 'k')}</div>
        <div class="campo"><span>Culto</span>${seg(c.id, 'c')}</div>
        ${soPresenca ? '' : `<div class="campo"><span>Versículos decorados${vmax != null ? ` (máx. ${vmax})` : ''}</span><input class="pts" type="number" min="0" ${vmax != null ? `max="${vmax}"` : ''} step="0.5" data-c="${c.id}" value="${rascunho[c.id].v ?? ''}"></div>
        <div class="campo"><span>Meditação</span>${seg(c.id, 'm')}</div>`}
      </div>`).join('') : '<p class="vazio">Nenhuma criança ativa neste rebanho nessa data.</p>'}
    </div>
    <div class="barra-salvar"><button class="btn" id="salvar">Salvar lançamentos</button></div>`;
  ligarSeletor();

  app.querySelectorAll('.seg button').forEach((b) => {
    b.onclick = () => {
      const x = rascunho[b.dataset.c];
      x[b.dataset.f] = x[b.dataset.f] === b.dataset.v ? undefined : b.dataset.v;
      b.parentElement.querySelectorAll('button').forEach((y) => y.classList.toggle('on', x[b.dataset.f] === y.dataset.v));
    };
  });
  document.getElementById('todos').onclick = () => {
    app.querySelectorAll('.seg button[data-f="k"][data-v="P"]').forEach((b) => { if (!rascunho[b.dataset.c].k) b.click(); });
  };
  document.getElementById('salvar').onclick = () => {
    for (const inp of app.querySelectorAll('.pts')) {
      const v = inp.value === '' ? undefined : Number(inp.value);
      if (v != null && vmax != null && v > vmax) {
        inp.focus();
        return aviso(`${nomeCurto(db.criancas.find((c) => c.id === inp.dataset.c))}: ${v} passa do máximo ${vmax} do cronograma`);
      }
      rascunho[inp.dataset.c].v = v;
    }
    for (const [cid, x] of Object.entries(rascunho)) {
      const limpo = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined));
      db.registros[cid] ??= {};
      if (Object.keys(limpo).length) db.registros[cid][e.id] = limpo; else delete db.registros[cid][e.id];
    }
    salvar(`Lançamentos de ${fmt(e.data)} salvos`);
  };
}

// ---------- Bíblia & Intelecto ----------
const livroBI = (id) => db.livrosBI.find((l) => l.id === id);
const nomeLivro = (id) => { const l = livroBI(id); return l ? `${l.nivel} – ${l.nome}` : id; };
const gabaritosDe = (cid) => db.gabaritos.filter((g) => g.criancaId === cid).sort((a, b) => (a.inicio ?? '').localeCompare(b.inicio ?? ''));
const resumoBI = (cid) => resumoGabaritos(gabaritosDe(cid));
const SIMBOLO = { c: ['✓', 'acerto de primeira', 'c'], e: ['✗', 'errou (sem correção)', 'e'], r: ['↺', 'errou e corrigiu', 'r'], '-': ['·', 'em branco', 'v'] };
const CICLO = ['c', 'e', 'r', '-'];
const maisErra = (r) => { const m = Math.max(0, ...r.porQuestao); return m ? r.porQuestao.map((n, i) => (n === m ? `Q${i + 1}` : '')).filter(Boolean).join(', ') : '—'; };

function barrasQuestoes(porQuestao) {
  const max = Math.max(1, ...porQuestao);
  return `<div class="barras" role="img" aria-label="Erros por questão: ${porQuestao.map((n, i) => `questão ${i + 1}, ${n}`).join('; ')}">
    ${porQuestao.map((n, i) => `<div class="barra"><span class="valor">${n}</span><span class="trilho"><span class="col erro" style="height:${Math.round((n / max) * 100)}%"></span></span>
      <span class="mes">Q${i + 1}</span></div>`).join('')}</div>`;
}

// Botões de seção (Todas + cada seção com crianças) para as telas do setor.
function filtroSecao(destino, sid, cs) {
  const secoes = db.secoes.filter((s) => cs.some((c) => rebanho(c.rebanhoId)?.secaoId === s.id));
  if (secoes.length < 2) return '';
  return `<div class="acoes"><a class="btn ${sid ? 'sec' : ''}" href="#/${destino}">Todas as seções</a>
    ${secoes.map((s) => `<a class="btn ${s.id === sid ? '' : 'sec'}" href="#/${destino}/${s.id}">${esc(s.nome)}</a>`).join('')}</div>`;
}

function intelecto(sid) {
  const todas = minhasCriancas().filter((c) => c.ativa);
  const cs = todas.filter((c) => !sid || rebanho(c.rebanhoId)?.secaoId === sid);
  const linhas = cs.map((c) => ({ c, g: gabaritosDe(c.id), r: resumoBI(c.id) }));
  const com = linhas.filter((x) => x.r.respondidas).sort((a, b) => b.r.taxa - a.r.taxa);
  const tot = resumoGabaritos(com.flatMap((x) => x.g));
  const notas = com.map((x) => x.r.nota);
  const porLivro = db.livrosBI.map((l) => [l, com.filter((x) => x.g.at(-1)?.livro === l.id).length]).filter(([, n]) => n);
  const card = (n, t) => `<div class="card"><div class="num">${n}</div><div class="rot">${t}</div></div>`;
  app.innerHTML = `
    <h1>Bíblia & Intelecto</h1>
    <p class="sub">Coleção de 13 livros. A criança preenche a folha de respostas e um membro do setor corrige pelo gabarito:
      marca vermelha = erro; bola com risco = erro corrigido pela criança.</p>
    ${filtroSecao('intelecto', sid, todas)}
    <div class="cards">
      ${card(`${com.length}/${cs.length}`, 'crianças com gabarito')}
      ${card(pct(tot.taxa), 'acerto de primeira')}
      ${card(nota(notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null), 'nota média (0 a 10)')}
      ${card(tot.exercicios, 'exercícios corrigidos')}
      ${card(tot.corrigidos, 'erros corrigidos')}
      ${card(tot.pendentes, 'erros aguardando correção')}
    </div>
    <div class="duas">
      <div class="card"><strong>Questões mais erradas (1 a 8)</strong>${barrasQuestoes(tot.porQuestao)}</div>
      <div class="card"><strong>Livro atual das crianças</strong>
        <ul class="lista">${porLivro.map(([l, n]) => `<li>${esc(`${l.nivel} – ${l.nome}`)}: <strong>${n}</strong></li>`).join('') || '<li class="vazio">Nenhum gabarito.</li>'}</ul></div>
    </div>
    <h2>Desempenho por criança</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>#</th><th>Criança</th><th>Rebanho</th><th>Livro atual</th><th>Exercícios</th><th>Acertos 1ª</th><th>Erros</th><th>Corrigidos</th><th>Pendentes</th><th>Taxa</th><th>Nota</th><th>Mais erra</th></tr>
      ${com.map((x, i) => `<tr><td>${i + 1}º</td><td><a href="#/gabarito/${x.c.id}">${esc(x.c.nome)}</a></td><td>${ondeEsta(x.c)}</td>
        <td>${esc(nomeLivro(x.g.at(-1).livro))}</td><td>${x.r.exercicios}</td><td>${x.r.acertos}/${x.r.respondidas}</td><td>${x.r.erros}</td>
        <td>${x.r.corrigidos}</td><td>${x.r.pendentes ? `<span class="tag nao">${x.r.pendentes}</span>` : 0}</td>
        <td>${pct(x.r.taxa)}</td><td><strong>${nota(x.r.nota)}</strong></td><td>${maisErra(x.r)}</td></tr>`).join('') || vazioLinha(12, 'Nenhum gabarito lançado.')}
      ${linhas.filter((x) => !x.r.respondidas).map((x) => `<tr><td></td><td><a href="#/gabarito/${x.c.id}">${esc(x.c.nome)}</a></td><td>${ondeEsta(x.c)}</td>
        <td colspan="9" class="vazio">sem gabarito lançado</td></tr>`).join('')}
    </table></div>
    <h2>Parecer por aluno</h2>
    <div class="pareceres">${com.map((x) => `<div class="card"><strong><a href="#/gabarito/${x.c.id}">${esc(x.c.nome)}</a></strong>
      <span class="vazio pequeno">· ${esc(x.g.map((g) => livroBI(g.livro)?.nome).join(', '))}</span>
      <p>${esc(parecerBI(x.r))}</p>${x.c.obsBI ? `<p><strong>Observação do setor:</strong> ${esc(x.c.obsBI)}</p>` : ''}</div>`).join('') || '<p class="vazio">Sem pareceres.</p>'}</div>
    ${db.gabaritosSemNome?.length && lancaBI() ? `<p class="info alerta" style="margin-top:1rem">Folhas sem nome para conferir: ${db.gabaritosSemNome.map(esc).join(' ')}</p>` : ''}`;
}

function gabaritoPagina(cid, gid) {
  const c = minhasCriancas().find((x) => x.id === cid);
  if (!c) return (app.innerHTML = '<p class="vazio">Criança não encontrada ou sem permissão.</p>');
  const gs = gabaritosDe(cid);
  const r = resumoGabaritos(gs);
  const pode = lancaBI();
  const g = gs.find((x) => x.id === gid);
  const rasc = g ? { ...g.linhas } : {};
  const errosLinha = (l) => [...l].filter((x) => x === 'r' || x === 'e').length;
  const card = (n, t) => `<div class="card"><div class="num">${n}</div><div class="rot">${t}</div></div>`;
  app.innerHTML = `
    <p><a href="#/intelecto">← Bíblia & Intelecto</a></p>
    <h1>${esc(c.nome)}</h1>
    <p class="sub">${ondeEsta(c)}</p>
    <div class="info"><strong>Parecer:</strong> ${esc(parecerBI(r))}${c.obsBI ? `<br><strong>Observação do setor:</strong> ${esc(c.obsBI)}` : ''}</div>
    <div class="cards">${card(nota(r.nota), 'nota (0 a 10)')}${card(pct(r.taxa), 'acerto de primeira')}${card(r.exercicios, 'exercícios')}
      ${card(r.erros, 'erros')}${card(r.corrigidos, 'corrigidos')}${card(r.pendentes, 'aguardando correção')}</div>
    <div class="duas">
      <div class="card"><strong>Erros por questão (1 a 8)</strong>${barrasQuestoes(r.porQuestao)}</div>
      <div class="card"><strong>Exercícios com mais erros</strong>
        <ul class="lista">${r.piores.map((x) => `<li>${esc(livroBI(x.livro)?.nome ?? x.livro)} · exercício ${x.ex}: <strong>${x.erros}</strong> erro(s)</li>`).join('') || '<li class="vazio">Nenhum erro.</li>'}</ul></div>
    </div>
    <h2>Livros</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Livro</th><th>Início</th><th>Exercícios</th><th>Acertos 1ª</th><th>Erros</th><th>Pendentes</th><th>Taxa</th><th></th></tr>
      ${gs.map((x) => { const q = resumoGabaritos([x]);
        return `<tr><td>${esc(nomeLivro(x.livro))}${x.confirmar ? ' <span class="tag fora">conferir</span>' : ''}</td><td>${fmt(x.inicio)}</td><td>${q.exercicios}</td>
          <td>${q.acertos}/${q.respondidas}</td><td>${q.erros}</td><td>${q.pendentes}</td><td>${pct(q.taxa)}</td>
          <td><a class="btn sec" href="#/gabarito/${c.id}/${x.id}">${pode ? 'Corrigir' : 'Ver'}</a></td></tr>`; }).join('') || vazioLinha(8, 'Nenhum gabarito.')}
    </table></div>
    ${pode ? `<form class="grade" id="novoGab" style="margin-top:.75rem">
      <label>Livro <select name="livro">${opcoes(db.livrosBI.map((l) => [l.id, `${l.nivel} – ${l.nome}`]))}</select></label>
      <label>Início <input type="date" name="inicio" required value="${hoje()}"></label>
      <div style="align-self:end"><button class="btn sec">Novo gabarito</button></div></form>
    <form class="grade" id="obs" style="margin-top:.5rem"><label>Observação do setor <input name="obsBI" value="${esc(c.obsBI)}"></label>
      <div style="align-self:end"><button class="btn sec">Salvar observação</button></div></form>` : ''}
    ${g ? `<h2 id="editor">${esc(nomeLivro(g.livro))} · início ${fmt(g.inicio)}</h2>
    ${g.confirmar ? `<p class="info alerta">${esc(g.confirmar)}</p>` : ''}
    ${g.origem ? `<p class="vazio pequeno">${esc(g.origem)}</p>` : ''}
    <p class="sub">${pode ? 'Clique na questão para trocar: ' : ''}✓ acerto de primeira · ✗ errou · ↺ errou e corrigiu · · em branco</p>
    <div class="rolar"><table class="tabela gabarito">
      <tr><th>Exercício</th>${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<th>${n}</th>`).join('')}<th>Erros</th></tr>
      ${Object.keys(rasc).sort((a, b) => a - b).map((ex) => `<tr><td>${ex})</td>${[...rasc[ex]].map((x, i) => `<td>
        <button type="button" class="q ${SIMBOLO[x][2]}" data-ex="${ex}" data-i="${i}" ${pode ? '' : 'disabled'} title="Questão ${i + 1}: ${SIMBOLO[x][1]}">${SIMBOLO[x][0]}</button></td>`).join('')}
        <td data-erros="${ex}">${errosLinha(rasc[ex])}</td></tr>`).join('')}
    </table></div>
    ${pode ? `<div class="acoes"><button type="button" class="btn sec" id="maisEx">+ Exercício</button>
      <button type="button" class="btn" id="salvarGab">Salvar gabarito</button>
      <button type="button" class="btn perigo" id="excluirGab">Excluir gabarito</button></div>` : ''}` : ''}`;
  if (g) document.getElementById('editor').scrollIntoView();
  if (!pode) return;
  document.getElementById('novoGab').onsubmit = (ev) => {
    ev.preventDefault();
    const d = dadosDoForm(ev.target);
    const novo = { id: `g${Date.now()}`, criancaId: c.id, livro: d.livro, inicio: d.inicio, linhas: { 1: 'cccccccc' } };
    db.gabaritos.push(novo);
    salvar('Gabarito criado');
    location.hash = `#/gabarito/${c.id}/${novo.id}`;
  };
  document.getElementById('obs').onsubmit = (ev) => {
    ev.preventDefault();
    c.obsBI = ev.target.obsBI.value.trim();
    salvar('Observação salva');
    gabaritoPagina(cid, gid);
  };
  if (!g) return;
  app.querySelectorAll('.q').forEach((b) => {
    b.onclick = () => {
      const l = [...rasc[b.dataset.ex]];
      const x = CICLO[(CICLO.indexOf(l[b.dataset.i]) + 1) % CICLO.length];
      l[b.dataset.i] = x;
      rasc[b.dataset.ex] = l.join('');
      b.className = `q ${SIMBOLO[x][2]}`;
      b.textContent = SIMBOLO[x][0];
      b.title = `Questão ${Number(b.dataset.i) + 1}: ${SIMBOLO[x][1]}`;
      app.querySelector(`[data-erros="${b.dataset.ex}"]`).textContent = errosLinha(rasc[b.dataset.ex]);
    };
  });
  document.getElementById('maisEx').onclick = () => {
    rasc[Math.max(0, ...Object.keys(rasc).map(Number)) + 1] = 'cccccccc';
    g.linhas = rasc;
    salvar('Exercício adicionado');
    gabaritoPagina(cid, gid);
  };
  document.getElementById('salvarGab').onclick = () => {
    g.linhas = rasc;
    salvar('Gabarito salvo');
    gabaritoPagina(cid, gid);
  };
  document.getElementById('excluirGab').onclick = () => {
    if (!confirm(`Excluir o gabarito de ${nomeLivro(g.livro)}?`)) return;
    db.gabaritos = db.gabaritos.filter((x) => x !== g);
    salvar('Gabarito excluído');
    location.hash = `#/gabarito/${c.id}`;
  };
}

// ---------- Provas (aplicadas pelo Bíblia Intelecto) ----------
function provas(sid) {
  const todas = minhasCriancas().filter((c) => c.ativa);
  const cs = todas.filter((c) => !sid || rebanho(c.rebanhoId)?.secaoId === sid);
  const pode = lancaBI();
  const media = (c) => mediaNotas(db.notas[c.id]);
  const porNota = (a, b) => (media(b) ?? -1) - (media(a) ?? -1) || a.nome.localeCompare(b.nome);
  const secoes = db.secoes.filter((s) => cs.some((c) => rebanho(c.rebanhoId)?.secaoId === s.id));
  const daSecao = (s) => cs.filter((c) => rebanho(c.rebanhoId)?.secaoId === s.id).sort(porNota);
  const rebs = [...new Set(cs.map((c) => c.rebanhoId))].map(rebanho).filter(Boolean).sort(ordemRebanho);
  const mediaProva = (lista, pid) => mediaNotas(Object.fromEntries(lista.map((c) => [c.id, db.notas[c.id]?.[pid]])));
  app.innerHTML = `
    <h1>Provas</h1>
    <p class="sub">Aplicadas pelo setor Bíblia Intelecto: ${db.provas.length} provas no ano, nota de 0 a ${db.notaMaxima}.</p>
    ${filtroSecao('provas', sid, todas)}
    ${pode ? `<h2>Lançar notas</h2>
    <form id="notasBI"><div class="rolar"><table class="tabela">
      <tr><th>Criança</th><th>Rebanho</th>${db.provas.map((x) => `<th>${esc(x.nome)}</th>`).join('')}</tr>
      ${[...cs].sort((a, b) => ordemRebanho(rebanho(a.rebanhoId), rebanho(b.rebanhoId)) || a.nome.localeCompare(b.nome)).map((c) => `<tr><td>${esc(c.nome)}</td><td>${ondeEsta(c)}</td>
        ${db.provas.map((x) => `<td><input class="nota" type="number" min="0" max="${db.notaMaxima}" step="0.1" name="${c.id}|${x.id}"
          aria-label="${esc(`${x.nome} de ${c.nome}`)}" value="${db.notas[c.id]?.[x.id] ?? ''}"></td>`).join('')}</tr>`).join('') || vazioLinha(2 + db.provas.length, 'Nenhuma criança.')}
    </table></div>
    <div class="acoes"><button class="btn">Salvar notas</button></div></form>` : ''}
    <h2>Ranking por seção</h2>
    ${secoes.map((s) => { const lista = daSecao(s);
      return `<h3>${esc(s.nome)} <span class="vazio pequeno">${esc(s.horario)}</span></h3>
      <div class="rolar"><table class="tabela">
        <tr><th>#</th><th>Criança</th><th>Rebanho</th>${db.provas.map((x) => `<th>${esc(x.nome)}</th>`).join('')}<th>Média</th></tr>
        ${lista.map((c, i) => `<tr><td>${media(c) != null ? `${i + 1}º` : '—'}</td><td><a href="#/crianca/${c.id}">${esc(c.nome)}</a></td><td>${ondeEsta(c)}</td>
          ${db.provas.map((x) => `<td>${nota(db.notas[c.id]?.[x.id])}</td>`).join('')}<td><strong>${nota(media(c))}</strong></td></tr>`).join('')}
        <tr><td></td><td><strong>Média da seção</strong></td><td></td>${db.provas.map((x) => `<td>${nota(mediaProva(lista, x.id))}</td>`).join('')}
          <td><strong>${nota(mediaTurma(db, lista))}</strong></td></tr>
      </table></div>`; }).join('') || '<p class="vazio">Nenhuma criança.</p>'}
    <h2>Média por turma e rebanho</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Rebanho</th><th>Crianças</th>${db.provas.map((x) => `<th>${esc(x.nome)}</th>`).join('')}<th>Média</th></tr>
      ${rebs.map((r) => { const lista = cs.filter((c) => c.rebanhoId === r.id);
        return `<tr><td>${bolinha(r)}${esc(nomeRebanho(r))}</td><td>${lista.length}</td>${db.provas.map((x) => `<td>${nota(mediaProva(lista, x.id))}</td>`).join('')}
          <td><strong>${nota(mediaTurma(db, lista))}</strong></td></tr>`; }).join('')}
    </table></div>`;
  const f = document.getElementById('notasBI');
  if (f) f.onsubmit = (ev) => {
    ev.preventDefault();
    const campos = [...f.querySelectorAll('input.nota')];
    const ruim = campos.find((x) => x.value !== '' && !(Number(x.value) >= 0 && Number(x.value) <= db.notaMaxima));
    if (ruim) { ruim.focus(); return aviso(`Notas devem ficar entre 0 e ${db.notaMaxima}`); }
    for (const x of campos) {
      const [cid, pid] = x.name.split('|');
      db.notas[cid] ??= {};
      // Campo vazio = prova ainda não aplicada (diferente de nota zero)
      if (x.value === '') delete db.notas[cid][pid]; else db.notas[cid][pid] = Number(x.value);
    }
    salvar('Notas salvas');
    provas(sid);
  };
}

// ---------- Crianças ----------
// Cabeçalho que só aparece no papel, e botão que abre a impressão do navegador.
const topoImpressao = () => `<p class="so-impressao">${esc(db.ministerio)} · impresso em ${fmt(hoje())}</p>`;
const botaoImprimir = '<button class="btn sec nao-imprime" onclick="window.print()">Imprimir</button>';

function criancas() {
  const mostrar = sessionStorage.getItem('inativas') === '1';
  const lista = minhasCriancas().filter((c) => mostrar || c.ativa);
  // Perfil Bíblia Intelecto vê só as notas das provas, sem frequência, versículos e meditação.
  const soProvas = ehBI();
  app.innerHTML = `
    ${topoImpressao()}
    <div class="titulo-acoes"><h1>Crianças</h1>${botaoImprimir}</div>
    <label class="check nao-imprime"><input type="checkbox" id="inativas" ${mostrar ? 'checked' : ''}> Mostrar inativas</label>
    <div class="rolar" style="margin-top:.75rem"><table class="tabela">
      <tr><th>Nome</th><th>Rebanho</th><th>Idade</th>${soProvas ? db.provas.map((p) => `<th>${esc(p.nome)}</th>`).join('')
        : '<th>Kids</th><th>Culto</th><th>Versículos</th><th>Meditações</th>'}<th>Média provas</th>${soProvas ? '' : '<th>TOPs</th>'}</tr>
      ${lista.map((c) => {
        const r = resumoCrianca(db.registros[c.id] || {});
        return `<tr><td><a href="#/crianca/${c.id}">${esc(c.nome)}</a> ${c.ativa ? '' : '<span class="tag fora">inativa</span>'}</td>
          <td>${ondeEsta(c)}</td>
          <td>${idade(c.nascimento)}</td>${soProvas ? db.provas.map((p) => `<td>${nota(db.notas[c.id]?.[p.id])}</td>`).join('')
            : `<td>${pct(r.kids.pct)}</td><td>${pct(r.culto.pct)}</td><td>${r.versiculos}</td><td>${r.meditacoes.completas}/${r.meditacoes.total}</td>`}
          <td>${nota(mediaNotas(db.notas[c.id]))}</td>${soProvas ? '' : `<td>${topsDaCrianca(db, c).length}</td>`}</tr>`;
      }).join('') || '<tr><td colspan="12" class="vazio">Nenhuma criança.</td></tr>'}
    </table></div>
    ${!cadastraCrianca() ? '<p class="vazio pequeno nao-imprime" style="margin-top:.75rem">O cadastro de crianças é feito pela Recepção.</p>' : ''}
    ${cadastraCrianca() && meusRebanhos().length ? `<h2 class="nao-imprime">Nova criança</h2>
    <form class="grade" id="nova">${camposCrianca({ entrada: hoje(), rebanhoId: rebanhoAtual()?.id })}
      <div style="align-self:end"><button class="btn">Cadastrar</button></div></form>` : ''}`;
  document.getElementById('inativas').onchange = (ev) => { sessionStorage.setItem('inativas', ev.target.checked ? '1' : '0'); criancas(); };
  const f = document.getElementById('nova');
  if (f) ligarCrianca(f, { rebanhoId: rebanhoAtual()?.id });
  if (f) f.onsubmit = (ev) => {
    ev.preventDefault();
    const c = { id: `c${Date.now()}`, ...lerCrianca(f), ativa: true };
    if (!c.rebanhoId) return aviso('Escolha seção, turma e cor do rebanho');
    db.criancas.push(c);
    db.registros[c.id] = {};
    salvar('Criança cadastrada');
    criancas();
  };
}

function camposCrianca(c) {
  const r = rebanho(c.rebanhoId);
  const secoes = [...new Set(meusRebanhos().map((x) => x.secaoId))].map(secao).filter(Boolean);
  return `
    <label>Nome completo <input name="nome" required value="${esc(c.nome)}"></label>
    <label>Aniversário (data de nascimento) <input type="date" name="nascimento" value="${esc(c.nascimento)}"></label>
    <label>Idade <input name="idadeVer" readonly tabindex="-1" value="${c.nascimento ? `${idade(c.nascimento)} anos` : '—'}"></label>
    <label>Responsável <input name="responsavel" value="${esc(c.responsavel)}"></label>
    <label>Seção <select name="secaoId" required>${opcoes(secoes.map((x) => [x.id, `${x.nome} (${x.horario})`]), r?.secaoId)}</select></label>
    <label>Turma <select name="turma" required>${opcoes(TURMAS.map((t) => [t, t]), c.turma || r?.turma, '—')}</select></label>
    <label>Cor do rebanho <select name="cor" required>${opcoes(Object.entries(CORES).map(([k, [t]]) => [k, t]), r?.cor, '—')}</select></label>
    <label>Sexo <select name="sexo">${opcoes([['F', 'Feminino'], ['M', 'Masculino']], c.sexo, '—')}</select></label>
    <label>Data de entrada <input type="date" name="entrada" required value="${esc(c.entrada)}"></label>
    <label>Parentesco <input name="parentesco" value="${esc(c.parentesco)}" placeholder="Ex.: mãe, pai, avó"></label>
    <label>Telefone do responsável <input type="tel" name="telefone" value="${esc(c.telefone)}"></label>
    <label>Contato de emergência <input name="emergencia" value="${esc(c.emergencia)}" placeholder="Nome e telefone"></label>
    <label>Escola <input name="escola" value="${esc(c.escola)}"></label>
    <label>Alergias e restrições <input name="alergias" value="${esc(c.alergias)}" placeholder="Ex.: amendoim, lactose"></label>
    <label>Observações <input name="observacoes" value="${esc(c.observacoes)}"></label>
    <label class="check"><input type="checkbox" name="autorizaImagem" ${c.autorizaImagem ? 'checked' : ''}> Autoriza uso de imagem</label>`;
}

// Aniversário recalcula a idade na hora.
function ligarCrianca(form) {
  form.nascimento.oninput = () => { form.idadeVer.value = form.nascimento.value ? `${idade(form.nascimento.value)} anos` : '—'; };
}

// Seção + turma + cor = rebanho da criança.
function lerCrianca(form) {
  const { secaoId, cor, idadeVer, ...d } = dadosDoForm(form);
  const r = meusRebanhos().find((x) => x.secaoId === secaoId && x.turma === d.turma && x.cor === cor);
  return { ...d, rebanhoId: r?.id, nascimento: d.nascimento || null };
}

function crianca(id) {
  const c = minhasCriancas().find((x) => x.id === id);
  if (!c) return (app.innerHTML = '<p class="vazio">Criança não encontrada ou sem permissão.</p>');
  const regs = db.registros[c.id] || {};
  const r = resumoCrianca(regs);
  const feitos = encontrosRealizados(db);
  app.innerHTML = `
    ${topoImpressao()}
    <div class="titulo-acoes"><h1>${esc(c.nome)} ${c.ativa ? '' : '<span class="tag fora">inativa</span>'}</h1>${botaoImprimir}</div>
    <p class="sub">${ondeEsta(c)} · ${idade(c.nascimento)} anos${c.nascimento ? ` (${fmt(c.nascimento)})` : ''} · entrada em ${fmt(c.entrada)}${c.ativa ? '' : ` · saída em ${fmt(c.saida)}: ${esc(c.motivoSaida)}`}
      <br>Responsável: ${esc(c.responsavel || '—')}${c.parentesco ? ` (${esc(c.parentesco)})` : ''}${c.telefone ? ` · ${esc(c.telefone)}` : ''}${c.emergencia ? ` · emergência: ${esc(c.emergencia)}` : ''}
      ${c.escola ? `<br>Escola: ${esc(c.escola)}` : ''} · Imagem: ${c.autorizaImagem ? 'autorizada' : 'não autorizada'}</p>
    ${c.alergias ? `<p class="info alerta">Alergias e restrições: <strong>${esc(c.alergias)}</strong></p>` : ''}
    ${motivosAtencao(db, c).length ? `<p class="info alerta">Precisa de atenção: ${esc(motivosAtencao(db, c).join('; '))}</p>` : ''}
    <div class="cards">
      <div class="card"><div class="num">${pct(r.kids.pct)}</div><div class="rot">Kids: ${r.kids.presencas} de ${r.kids.total} (${r.atrasos} atrasos, ${r.faltasJustificadas} FJ)</div></div>
      <div class="card"><div class="num">${pct(r.culto.pct)}</div><div class="rot">Culto: ${r.culto.presencas} de ${r.culto.total}</div></div>
      <div class="card"><div class="num">${r.versiculos}</div><div class="rot">versículos decorados</div></div>
      <div class="card"><div class="num">${r.meditacoes.completas}/${r.meditacoes.total}</div><div class="rot">meditações completas</div></div>
      <div class="card"><div class="num">${topsDaCrianca(db, c).length}</div><div class="rot">TOPs</div></div>
      <div class="card"><div class="num">${nota(mediaNotas(db.notas[c.id]))}</div><div class="rot">média das provas</div></div>
    </div>

    ${lancaBI() ? `<h2 class="nao-imprime">Notas de prova</h2>
    <form class="grade" id="notas">
      ${db.provas.map((p) => `<label>${esc(p.nome)} (0 a ${db.notaMaxima})
        <input type="number" name="${p.id}" min="0" max="${db.notaMaxima}" step="0.1" value="${db.notas[c.id]?.[p.id] ?? ''}"></label>`).join('')}
      <div style="align-self:end"><button class="btn">Salvar notas</button></div>
    </form>` : ''}

    <h2>Desafios</h2>
    <div class="rolar"><table class="tabela"><tr><th>Desafio</th><th>Resultado</th><th>Versículos decorados</th><th>Motivo</th></tr>
      ${db.desafios.map((d) => { const a = avaliarDesafio(db, d, c);
        return `<tr><td><a href="#/desafio/${d.id}">${esc(d.nome)}</a></td><td>${tag(a.status)}</td><td>${a.pontos ?? '—'}/${d.versiculosMin}</td><td>${esc(a.motivos.join('; '))}</td></tr>`; }).join('')}
    </table></div>

    <h2>Bíblia & Intelecto</h2>
    ${(() => { const rb = resumoBI(c.id);
      return `<div class="info">${rb.respondidas ? `<strong>Nota ${nota(rb.nota)}</strong> · acerto de primeira ${pct(rb.taxa)} · ${rb.erros} erro(s), ${rb.corrigidos} corrigido(s), ${rb.pendentes} aguardando correção<br>` : ''}
        ${esc(parecerBI(rb))}${c.obsBI ? `<br><strong>Observação do setor:</strong> ${esc(c.obsBI)}` : ''}
        <br><a class="nao-imprime" href="#/gabarito/${c.id}">Ver gabaritos e questões mais erradas</a></div>`; })()}

    <h2>Histórico</h2>
    <div class="rolar"><table class="tabela"><tr><th>Data</th><th>Kids</th><th>Culto</th><th>Versículos decorados</th><th>Meditação</th></tr>
      ${ordenados().filter((e) => e.data >= c.entrada && feitos.has(e.id)).reverse().map((e) => { const x = regs[e.id] || {};
        return `<tr><td>${lancaPresenca() ? `<a href="#/${lancaTudo() ? 'encontro' : 'presenca'}/${e.id}/${c.rebanhoId}">${fmt(e.data)}</a>` : fmt(e.data)}</td><td>${x.k ?? '—'}</td><td>${x.c ?? '—'}</td>
          <td>${x.v ?? '—'}${db.versiculoMax[e.id] ? `/${db.versiculoMax[e.id]}` : ''}</td><td>${x.m ?? '—'}</td></tr>`; }).join('')}
    </table></div>

    ${cadastraCrianca() ? `<h2 class="nao-imprime">Cadastro</h2>
    <form class="grade" id="editar">${camposCrianca(c)}
      <div style="align-self:end"><button class="btn">Salvar cadastro</button></div></form>
    <div class="acoes nao-imprime">${c.ativa
      ? '<button class="btn perigo" id="inativar">Inativar criança</button>'
      : '<button class="btn sec" id="reativar">Reativar criança</button>'}</div>` : '<p class="vazio pequeno nao-imprime">Alterações no cadastro: fale com a Recepção.</p>'}`;

  const fn = document.getElementById('notas');
  if (fn) fn.onsubmit = (ev) => {
    ev.preventDefault();
    // Campo vazio = prova ainda não lançada (diferente de nota zero)
    const n = Object.fromEntries(Object.entries(dadosDoForm(ev.target)).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    if (Object.values(n).some((v) => !(v >= 0 && v <= db.notaMaxima))) return aviso(`Notas devem ficar entre 0 e ${db.notaMaxima}`);
    db.notas[c.id] = n;
    salvar('Notas salvas');
    crianca(id);
  };
  const fe = document.getElementById('editar');
  if (fe) ligarCrianca(fe);
  if (fe) fe.onsubmit = (ev) => {
    ev.preventDefault();
    const d = lerCrianca(ev.target);
    if (!d.rebanhoId) return aviso('Escolha seção, turma e cor do rebanho');
    Object.assign(c, d);
    salvar('Cadastro atualizado');
    crianca(id);
  };
  const inat = document.getElementById('inativar');
  if (inat) inat.onclick = () => {
    const motivo = prompt('Motivo da saída (o histórico será mantido):');
    if (!motivo) return;
    Object.assign(c, { ativa: false, saida: hoje(), motivoSaida: motivo });
    salvar('Criança inativada — histórico preservado');
    crianca(id);
  };
  const reat = document.getElementById('reativar');
  if (reat) reat.onclick = () => {
    Object.assign(c, { ativa: true, saida: null, motivoSaida: null });
    salvar('Criança reativada');
    crianca(id);
  };
}

// ---------- Desafios ----------
function formDesafio(d) {
  return `
    <label>Nome <input name="nome" required value="${esc(d.nome)}" placeholder="Ex.: TOP 4"></label>
    <label>Primeiro encontro <select name="inicio">${opcoes(ordenados().filter((e) => e.tipo !== 'sem_aula').map((e) => [e.id, fmt(e.data)]), d.inicio)}</select></label>
    <label>Semanas <input type="number" name="semanas" min="1" required value="${d.semanas ?? 3}"></label>
    <label>Faltas justificadas permitidas <input type="number" name="fj" min="0" required value="${d.fj ?? 1}"></label>
    <label>Versículos decorados exigidos <input type="number" name="versiculosMin" min="0" step="0.5" required value="${d.versiculosMin ?? ''}"></label>
    <label class="check"><input type="checkbox" name="meditacao" ${d.meditacao !== false ? 'checked' : ''}> Exigir meditação completa (OK ou MI-OK)</label>`;
}

// Sugestões: FJ = 1 em desafios curtos, 2 a partir de 7 semanas; versículos = soma dos máximos do cronograma.
function ligarSugestoes(form) {
  const sugerir = () => {
    const d = dadosDoForm(form);
    form.fj.value = Number(d.semanas) >= 7 ? 2 : 1;
    const v = versiculosDoDesafio(db, d);
    if (v) form.versiculosMin.value = v;
  };
  form.semanas.oninput = sugerir;
  form.inicio.onchange = sugerir;
}

function lerDesafio(form) {
  const d = dadosDoForm(form);
  return { ...d, inicio: Number(d.inicio), semanas: Number(d.semanas), fj: Number(d.fj), versiculosMin: Number(d.versiculosMin) };
}

function desafios() {
  const cs = minhasCriancas().filter((c) => c.ativa);
  app.innerHTML = `
    <h1>Desafios</h1>
    <p class="sub">A criança ganha o TOP se comparecer ao Kids e ao culto em todas as semanas (aceitando as faltas justificadas permitidas), fizer as meditações e decorar os versículos exigidos. ${db.topsPremiacao} TOPs no ano = premiação especial.</p>
    ${editaCronograma() ? '<p class="info">Para criar desafios, use a aba <a href="#/cronograma">Cronograma</a>.</p>' : ''}
    <div class="rolar"><table class="tabela">
      <tr><th>Desafio</th><th>Período</th><th>FJ permitidas</th><th>Versículos decorados</th><th>TOPs</th><th>Em andamento</th></tr>
      ${db.desafios.map((d) => { const s = semanasDoDesafio(db, d), r = cs.map((c) => avaliarDesafio(db, d, c).status);
        return `<tr><td><a href="#/desafio/${d.id}">${esc(d.nome)}</a></td>
        <td>${fmt(s[0]?.data)} a ${fmt(s.at(-1)?.data)} (${d.semanas} sem.)</td><td>${d.fj}</td><td>${d.versiculosMin}</td>
        <td>${r.filter((x) => x === 'top').length}</td><td>${r.filter((x) => x === 'andamento').length}</td></tr>`; }).join('')}
    </table></div>`;
}

function desafio(id) {
  const d = db.desafios.find((x) => x.id === id);
  if (!d) return (app.innerHTML = '<p class="vazio">Desafio não encontrado.</p>');
  const s = semanasDoDesafio(db, d);
  const linhas = minhasCriancas().filter((c) => c.ativa || topsDaCrianca(db, c).includes(d))
    .map((c) => ({ c, a: avaliarDesafio(db, d, c) }));
  const sim = (ok) => (ok ? '<span class="ok">✓</span>' : '<span class="x">✗</span>');
  const pode = editaCronograma();
  app.innerHTML = `
    <h1>${esc(d.nome)}</h1>
    <p class="sub">${fmt(s[0]?.data)} a ${fmt(s.at(-1)?.data)} · ${d.semanas} semanas · até ${d.fj} FJ · ${d.versiculosMin} versículos decorados${d.meditacao ? ' · meditação obrigatória' : ''}</p>
    <div class="rolar"><table class="tabela">
      <tr><th>Criança</th><th>Rebanho</th><th>Resultado</th><th>Versículos decorados</th><th>Motivo</th></tr>
      ${linhas.map(({ c, a }) => `<tr><td><a href="#/crianca/${c.id}">${esc(c.nome)}</a></td><td>${ondeEsta(c)}</td><td>${tag(a.status)}</td>
        <td>${a.pontos != null ? `${sim(a.pontos >= d.versiculosMin)} ${a.pontos}` : '—'}</td><td>${esc(a.motivos.join('; '))}</td></tr>`).join('')}
    </table></div>
    ${pode ? `<h2>Editar desafio</h2>
    <form class="grade" id="editar">${formDesafio(d)}<div style="align-self:end"><button class="btn">Salvar</button></div></form>
    <div class="acoes"><button class="btn perigo" id="excluir">Excluir desafio</button></div>` : ''}`;
  if (!pode) return;
  const f = document.getElementById('editar');
  ligarSugestoes(f);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    Object.assign(d, lerDesafio(f));
    salvar('Desafio atualizado');
    desafio(id);
  };
  document.getElementById('excluir').onclick = () => {
    if (!confirm(`Excluir o desafio ${d.nome}? Os registros das crianças não são apagados.`)) return;
    db.desafios = db.desafios.filter((x) => x !== d);
    salvar('Desafio excluído');
    location.hash = '#/cronograma';
  };
}

// ---------- Dados ----------
function dados() {
  app.innerHTML = `
    <h1>Dados</h1>
    <p class="sub">Versão de teste: as alterações ficam salvas só neste navegador. Exporte um backup com frequência.</p>
    <div class="acoes">
      <button class="btn" id="exportar">Exportar backup (JSON)</button>
      <label class="btn sec">Importar backup <input type="file" id="importar" accept=".json" hidden></label>
      <button class="btn perigo" id="restaurar">Voltar aos dados da planilha</button>
    </div>`;
  document.getElementById('exportar').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }));
    a.download = `rebanho-kids-backup-${hoje()}.json`;
    a.click();
  };
  document.getElementById('importar').onchange = async (ev) => {
    try {
      const novo = JSON.parse(await ev.target.files[0].text());
      if (!Array.isArray(novo.criancas) || !novo.registros) throw new Error('formato');
      db = atualizar(novo, base);
      salvar('Backup importado');
      montarTopo();
    } catch { aviso('Arquivo inválido'); }
  };
  document.getElementById('restaurar').onclick = () => {
    if (!confirm('Apagar as alterações deste navegador e voltar aos dados da planilha?')) return;
    localStorage.removeItem(CHAVE);
    db = structuredClone(base);
    salvar('Dados da planilha restaurados');
    montarTopo();
  };
}

// ---------- Rotas ----------
const rotas = {
  '': painel, painel, setor: meuSetor, recepcao, presenca, cronograma, data: dataCronograma, equipe, pessoa: pessoaPagina,
  rebanhos, rebanho: rebanhoPagina, encontros, encontro, intelecto, gabarito: gabaritoPagina, provas,
  criancas, crianca, desafios, desafio, dados,
};
// Aba do menu marcada em cada rota
const ABA_DA_ROTA = {
  painel: '', data: 'cronograma', pessoa: 'equipe', rebanho: 'rebanhos', encontro: 'encontros', presenca: 'recepcao',
  crianca: 'criancas', desafio: 'desafios', gabarito: 'intelecto',
};

function rotear() {
  const [nome = '', ...args] = location.hash.replace(/^#\/?/, '').split('/');
  if (!logado()) { if (nome === 'cadastro') cadastroInicial(); else login(); return; }
  const aba = ABA_DA_ROTA[nome] ?? nome;
  const permitidas = abasPermitidas();
  if (!permitidas.some(([h]) => h === aba)) {
    location.hash = `#/${permitidas[0][0]}`; // rota fora do perfil: vai para a primeira aba permitida
    return;
  }
  (rotas[nome] || painel)(...args);
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('ativo', a.getAttribute('href') === `#/${aba}`));
  window.scrollTo(0, 0);
}

// Dados salvos numa versão anterior: acrescenta o que é novo sem perder os lançamentos.
function atualizar(local, b) {
  for (const [k, v] of Object.entries(b)) if (!(k in local)) local[k] = structuredClone(v);
  for (const d of b.desafios) if (!local.desafios.some((x) => x.id === d.id)) local.desafios.push(structuredClone(d));
  for (const st of b.setores) if (!local.setores.some((x) => x.nome === st.nome)) local.setores.push(structuredClone(st));
  // Planilha reimportada, campo a campo: entra o que veio da planilha; o que foi editado neste navegador
  // (diferente da planilha da última visita, guardada em local.planilha) prevalece.
  for (const c of b.criancas) if (!local.criancas.some((x) => x.id === c.id)) local.criancas.push(structuredClone(c));
  const antes = local.planilha ?? { registros: {}, versiculoMax: {} };
  for (const [cid, regs] of Object.entries(b.registros)) {
    const meus = (local.registros[cid] ??= {});
    for (const [eid, r] of Object.entries(regs)) {
      const meu = (meus[eid] ??= {}), velho = antes.registros[cid]?.[eid] ?? {};
      for (const [k, v] of Object.entries(r)) if (meu[k] == null || meu[k] === velho[k]) meu[k] = v;
    }
  }
  for (const [eid, v] of Object.entries(b.versiculoMax)) {
    if (local.versiculoMax[eid] == null || local.versiculoMax[eid] === antes.versiculoMax[eid]) local.versiculoMax[eid] = v;
  }
  local.planilha = structuredClone({ registros: b.registros, versiculoMax: b.versiculoMax });
  // Versão 6: rebanhos por seção × turma × cor; os antigos por seção × cor saem se estiverem vazios.
  const antigo = /^r-s\d-(azul|verde|amarelo|vermelho)$/;
  local.rebanhos = local.rebanhos.filter((r) => !antigo.test(r.id) || r.professores.length || r.coordenadorId
    || local.criancas.some((c) => c.rebanhoId === r.id));
  for (const r of b.rebanhos) if (!local.rebanhos.some((x) => x.id === r.id)) local.rebanhos.push(structuredClone(r));
  const pe1 = local.pessoas.find((p) => p.id === 'pe1');
  if (pe1 && !pe1.setor && !pe1.atuacoes) Object.assign(pe1, { setor: 'Professores de Rebanho', secaoId: 's2', turma: '2A', cor: 'verde' });
  for (const r of local.rebanhos) {
    r.cor ??= ORDEM_COR.find((k) => r.nome?.toLowerCase().includes(k)) ?? 'verde';
    if (r.id === 'r1' && !r.secaoId) r.secaoId = 's2';
  }
  for (const c of local.criancas) { c.rebanhoId ??= 'r1'; c.turma ??= local.rebanhos.find((r) => r.id === c.rebanhoId)?.turma ?? ''; }
  for (const x of local.pessoas) if (x.papel === 'lider_turma') { x.papel = 'lider_secao'; delete x.turma; }
  for (const e of local.encontros) e.tipo ??= 'aula';
  if (local.professor) {
    const pe = local.pessoas.find((p) => p.id === 'pe1');
    if (pe) Object.assign(pe, local.professor);
    delete local.professor;
  }
  delete local.turma;
  local.versao = b.versao;
  return local;
}

base = await (await fetch('data/dados.json', { cache: 'no-store' })).json();
const salvo = localStorage.getItem(CHAVE);
db = salvo ? atualizar(JSON.parse(salvo), base) : structuredClone(base);
db.planilha ??= structuredClone({ registros: base.registros, versiculoMax: base.versiculoMax });
if (salvo) localStorage.setItem(CHAVE, JSON.stringify(db)); // guarda a planilha desta visita para a próxima mesclagem
if (sessao() && !logado()) localStorage.removeItem(CHAVE_PERFIL);
montarTopo();
window.addEventListener('hashchange', rotear);
rotear();
