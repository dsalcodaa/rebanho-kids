import {
  SUPERIOR, avaliarDesafio, descendentes, encontrosRealizados, mediaNotas, mediaTurma, rebanhosVisiveis,
  resumoCrianca, semanasDoDesafio, topsDaCrianca, versiculosDoDesafio,
} from './regras.js';

// shortcut: dados ficam no localStorage de cada navegador e o "Entrar como" só simula o acesso;
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
  lider_turma: 'Líder de turma',
  membro_setor: 'Membro de setor',
};
const TURMAS = [1, 2, 3, 4].flatMap((n) => ['A', 'B', 'C'].map((l) => `${n}${l}`));
const ENSINO = ['admin', 'pastor', 'coord_geral', 'coord_rebanho', 'professor'];
const TODOS = [...ENSINO, 'lider_geral', 'lider_turma', 'membro_setor'];

// Quem cada nível pode cadastrar (sempre abaixo dele no mesmo ramo).
const CADASTRA = {
  admin: Object.keys(PAPEIS),
  pastor: ['coord_geral', 'coord_rebanho', 'professor', 'lider_geral', 'lider_turma', 'membro_setor'],
  coord_geral: ['coord_rebanho', 'professor'],
  coord_rebanho: ['professor'],
  lider_geral: ['lider_turma', 'membro_setor'],
  lider_turma: ['membro_setor'],
  professor: [],
  membro_setor: [],
};

const ABAS = [
  ['', 'Painel', ENSINO],
  ['cronograma', 'Cronograma', TODOS],
  ['equipe', 'Equipe', TODOS],
  ['rebanhos', 'Rebanhos', ['admin', 'pastor', 'coord_geral', 'coord_rebanho']],
  ['encontros', 'Lançamentos', ENSINO],
  ['criancas', 'Crianças', ENSINO],
  ['desafios', 'Desafios', ENSINO],
  ['dados', 'Dados', ['admin', 'pastor']],
];

const eu = () => db.pessoas.find((p) => p.id === localStorage.getItem(CHAVE_PERFIL)) || null;
const papel = () => eu()?.papel ?? 'admin';
const editaCronograma = () => ['admin', 'pastor'].includes(papel());
const pessoa = (id) => db.pessoas.find((p) => p.id === id);
const nomePessoa = (id) => pessoa(id)?.nome ?? '—';
const secao = (id) => db.secoes.find((s) => s.id === id);
const meusRebanhos = () => rebanhosVisiveis(db, eu());
const rebanho = (id) => db.rebanhos.find((r) => r.id === id);
const nomeRebanho = (r) => (r ? `${r.turma} — ${r.nome}` : 'Sem rebanho');
const minhasCriancas = () => {
  const ids = new Set(meusRebanhos().map((r) => r.id));
  return db.criancas.filter((c) => ids.has(c.rebanhoId));
};
// Pessoas que eu enxergo: admin e pastor veem todos; os demais, eles mesmos e sua equipe abaixo.
const equipeVisivel = () => {
  if (['admin', 'pastor'].includes(papel())) return db.pessoas;
  const ids = descendentes(db, eu().id).add(eu().id);
  return db.pessoas.filter((p) => ids.has(p.id));
};

function montarTopo() {
  const sel = document.getElementById('perfil');
  sel.innerHTML = '<option value="">Administrador (vê tudo)</option>'
    + Object.entries(PAPEIS).map(([k, t]) => {
      const ps = db.pessoas.filter((p) => p.papel === k);
      return ps.length ? `<optgroup label="${t}">${ps.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</optgroup>` : '';
    }).join('');
  sel.value = eu()?.id ?? '';
  sel.onchange = () => {
    localStorage.setItem(CHAVE_PERFIL, sel.value);
    sessionStorage.removeItem('rebanhoAtual');
    montarTopo();
    if (location.hash === '#/') rotear(); else location.hash = '#/';
  };
  document.getElementById('menu').innerHTML = ABAS.filter(([, , quem]) => quem.includes(papel()))
    .map(([h, t]) => `<a href="#/${h}">${t}</a>`).join('');
}

// ---------- Painel ----------
function painel(rid) {
  const visiveis = meusRebanhos();
  const escopo = rid ? visiveis.filter((r) => r.id === rid) : visiveis;
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
  const um = escopo.length === 1 ? escopo[0] : null;
  const lancados = (e) => ativas.some((c) => Object.keys(db.registros[c.id]?.[e.id] || {}).length);
  const semLanc = ordenados().filter((e) => e.tipo !== 'sem_aula' && e.data < hoje() && ativas.length && !lancados(e));
  const sec = um && secao(um.secaoId);

  app.innerHTML = `
    ${visiveis.length > 1 ? `<label class="perfil" style="margin-bottom:.5rem">Rebanho
      <select id="filtro">${opcoes(visiveis.map((r) => [r.id, nomeRebanho(r)]), rid, 'Todos os rebanhos')}</select></label>` : ''}
    <h1>${um ? `Kids ${esc(nomeRebanho(um))}` : esc(db.ministerio)}</h1>
    ${um ? `<p class="sub">${um.professores.map((id) => { const p = pessoa(id);
      return `Professor: <strong>${esc(p?.nome)}</strong>${p?.nascimento ? ` · ${idade(p.nascimento)} anos · nascido em ${fmt(p.nascimento)}` : ''}`; }).join('<br>') || 'Sem professor'}
      <br>${sec ? `${esc(sec.nome)} (${esc(sec.horario)})` : 'Seção a definir'} · Coordenador: ${esc(nomePessoa(um.coordenadorId))}</p>` : ''}
    ${!escopo.length ? '<p class="info">Nenhum rebanho vinculado a este perfil.</p>' : ''}
    <div class="cards">
      <div class="card"><div class="num">${ativas.length}</div><div class="rot">crianças ativas</div></div>
      <div class="card"><div class="num">${inativas.length}</div><div class="rot">crianças inativas</div></div>
      <div class="card"><div class="num">${pct(media(ativas, 'kids'))}</div><div class="rot">frequência média no Kids</div></div>
      <div class="card"><div class="num">${pct(media(ativas, 'culto'))}</div><div class="rot">frequência média no culto</div></div>
      <div class="card"><div class="num">${nota(mediaTurma(db, ativas))}</div><div class="rot">média das provas (0 a ${db.notaMaxima})</div></div>
      <div class="card"><div class="num">${premiados.length}</div><div class="rot">com ${db.topsPremiacao}+ TOPs (premiação)</div></div>
    </div>

    ${varios ? `<h2>Rebanhos</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Rebanho</th><th>Seção</th><th>Professores</th><th>Ativas</th><th>Kids</th><th>Média provas</th><th>Premiadas</th></tr>
      ${escopo.map((r) => { const cs = ativas.filter((c) => c.rebanhoId === r.id);
        return `<tr><td><a href="#/painel/${r.id}">${esc(nomeRebanho(r))}</a></td><td>${esc(secao(r.secaoId)?.nome ?? '—')}</td>
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
        ${varios ? `<td>${esc(rebanho(l.c.rebanhoId)?.turma ?? '—')}</td>` : ''}
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
      ${semLanc.map((e) => `<li>Encontro de <a href="#/encontro/${e.id}">${fmt(e.data)}</a> sem lançamento</li>`).join('')}
      ${db.alertas.map((a) => `<li>${esc(a)}</li>`).join('')}
    </ul>`;
  const f = document.getElementById('filtro');
  if (f) f.onchange = () => { location.hash = f.value ? `#/painel/${f.value}` : '#/'; };
}

// ---------- Cronograma (pastores) ----------
const desafiosDaData = (e) => db.desafios.filter((d) => semanasDoDesafio(db, d).some((x) => x.id === e.id));

function formCronograma(e) {
  return `
    <label>Data <input type="date" name="data" required value="${esc(e.data)}"></label>
    <label>Tipo <select name="tipo">${opcoes([['aula', 'Programação do Kids'], ['sem_aula', 'Sem programação']], e.tipo ?? 'aula')}</select></label>
    <label>Tema da aula <input name="tema" value="${esc(e.tema)}"></label>
    <label>Versículo (referência) <input name="versiculo" value="${esc(e.versiculo)}" placeholder="Ex.: João 3:16"></label>
    <label>Pontos do versículo <input type="number" name="pontos" min="0" step="0.5" value="${e.id != null ? db.versiculoMax[e.id] ?? '' : ''}"></label>
    <label>Meditação <input name="meditacao" value="${esc(e.meditacao)}"></label>`;
}

function lerCronograma(form, e) {
  const d = dadosDoForm(form);
  Object.assign(e, { data: d.data, tipo: d.tipo, tema: d.tema, versiculo: d.versiculo, meditacao: d.meditacao });
  if (d.pontos === '') delete db.versiculoMax[e.id]; else db.versiculoMax[e.id] = Number(d.pontos);
}

function cronograma() {
  const pode = editaCronograma();
  let n = 0;
  app.innerHTML = `
    <h1>Cronograma do ano</h1>
    <p class="info">Definido pelos pastores e válido para todos os rebanhos. Datas, versículos, meditações e desafios
      cadastrados aqui aparecem direto na tela de lançamentos dos professores.</p>
    <h2>Seções</h2>
    <div class="cards">${db.secoes.map((s) => `<div class="card"><div class="num" style="font-size:1.1rem">${esc(s.nome)}</div><div class="rot">${esc(s.horario)}</div></div>`).join('')}</div>
    <h2>Programação</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Tema</th><th>Versículo</th><th>Pontos</th><th>Meditação</th><th>Desafio</th>${pode ? '<th></th>' : ''}</tr>
      ${ordenados().map((e) => `<tr><td>${e.tipo === 'sem_aula' ? '' : ++n}</td><td>${fmt(e.data)}</td>
        <td>${e.tipo === 'sem_aula' ? '<span class="tag fora">Sem programação</span>' : 'Kids'}</td>
        <td>${esc(e.tema || '—')}</td><td>${esc(e.versiculo || '—')}</td><td>${db.versiculoMax[e.id] ?? '—'}</td>
        <td>${esc(e.meditacao || '—')}</td><td>${esc(desafiosDaData(e).map((d) => d.nome).join(', ') || '—')}</td>
        ${pode ? `<td><a class="btn sec" href="#/data/${e.id}">Editar</a></td>` : ''}</tr>`).join('')}
    </table></div>
    ${pode ? `<h2>Nova data</h2>
    <form class="grade" id="nova">${formCronograma({})}<div style="align-self:end"><button class="btn">Adicionar ao cronograma</button></div></form>

    <h2>Desafios do ano</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Desafio</th><th>Início</th><th>Semanas</th><th>FJ permitidas</th><th>Versículos</th><th>Meditação</th></tr>
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

// ---------- Equipe (organograma) ----------
function formPessoa(p, papeisPermitidos) {
  return `
    <label>Nome completo <input name="nome" required value="${esc(p.nome)}"></label>
    <label>Função <select name="papel">${opcoes(papeisPermitidos.map((k) => [k, PAPEIS[k]]), p.papel ?? papeisPermitidos[0])}</select></label>
    <label>Subordinado a <select name="superiorId"></select></label>
    <label>Data de nascimento <input type="date" name="nascimento" value="${esc(p.nascimento)}"></label>
    <label>Telefone <input name="telefone" value="${esc(p.telefone)}"></label>
    <label data-so="lider_turma">Turma <select name="turma">${opcoes(TURMAS.map((t) => [t, t]), p.turma, '—')}</select></label>
    <label data-so="lider_geral lider_turma membro_setor">Setor <input name="setor" value="${esc(p.setor)}" placeholder="Ex.: Recepção, Louvor"></label>`;
}

// Atualiza "Subordinado a" e os campos extras conforme a função escolhida.
function ligarPessoa(form, p) {
  const atualizar = () => {
    const sup = SUPERIOR[form.papel.value];
    const candidatos = [...new Set([...equipeVisivel(), ...(eu() ? [eu()] : [])])].filter((x) => x.papel === sup && x.id !== p.id);
    const padrao = p.superiorId ?? (eu()?.papel === sup ? eu().id : '');
    form.superiorId.innerHTML = sup
      ? opcoes(candidatos.map((x) => [x.id, x.nome]), padrao, `— escolher ${PAPEIS[sup].toLowerCase()} —`)
      : '<option value="">Topo do organograma</option>';
    form.querySelectorAll('[data-so]').forEach((el) => { el.hidden = !el.dataset.so.split(' ').includes(form.papel.value); });
  };
  form.papel.onchange = atualizar;
  atualizar();
}

function lerPessoa(form) {
  const d = dadosDoForm(form);
  if (d.papel !== 'lider_turma') d.turma = '';
  if (!['lider_geral', 'lider_turma', 'membro_setor'].includes(d.papel)) d.setor = '';
  d.superiorId ||= null;
  return d;
}

function equipe() {
  const visiveis = equipeVisivel();
  const ids = new Set(visiveis.map((p) => p.id));
  const pode = CADASTRA[papel()];
  const editavel = (p) => p.id !== eu()?.id && pode.includes(p.papel);
  const no = (p) => {
    const filhos = visiveis.filter((x) => x.superiorId === p.id);
    const extra = [p.turma && `turma ${p.turma}`, p.setor,
      ...db.rebanhos.filter((r) => r.professores.includes(p.id) || r.coordenadorId === p.id).map(nomeRebanho)].filter(Boolean).join(' · ');
    return `<li>${editavel(p) ? `<a href="#/pessoa/${p.id}">${esc(p.nome)}</a>` : `<strong>${esc(p.nome)}</strong>`}
      <span class="papel">${PAPEIS[p.papel]}${extra ? ` · ${esc(extra)}` : ''}</span>
      ${filhos.length ? `<ul>${filhos.map(no).join('')}</ul>` : ''}</li>`;
  };
  const raizes = visiveis.filter((p) => !p.superiorId || !ids.has(p.superiorId));
  const orfaos = visiveis.filter((p) => SUPERIOR[p.papel] && !p.superiorId);

  app.innerHTML = `
    <h1>Equipe</h1>
    <p class="sub">${esc(db.ministerio)}<br>Ensino: Pastores → Coordenadores gerais → Coordenadores de rebanho → Professores → Crianças
      <br>Setores: Pastores → Líderes gerais → Líderes de turma → Membros dos setores</p>
    <h2>Organograma</h2>
    ${raizes.length ? `<ul class="arvore">${raizes.map(no).join('')}</ul>` : '<p class="vazio">Ninguém cadastrado.</p>'}
    ${orfaos.length ? `<p class="info" style="margin-top:1rem">Sem superior definido: ${orfaos.map((p) => esc(p.nome)).join(', ')}. Cadastre o superior e depois edite a pessoa.</p>` : ''}
    ${pode.length ? `<h2>Cadastrar pessoa</h2>
    <form class="grade" id="nova">${formPessoa({}, pode)}<div style="align-self:end"><button class="btn">Cadastrar</button></div></form>` : ''}`;
  const f = document.getElementById('nova');
  if (!f) return;
  ligarPessoa(f, {});
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const p = { id: `pe${Date.now()}`, ...lerPessoa(f) };
    db.pessoas.push(p);
    salvar(`${PAPEIS[p.papel]} cadastrado`);
    montarTopo();
    equipe();
  };
}

function pessoaPagina(id) {
  const p = pessoa(id);
  const pode = CADASTRA[papel()];
  if (!p || !pode.includes(p.papel) || !equipeVisivel().includes(p)) return (app.innerHTML = '<p class="vazio">Pessoa não encontrada ou sem permissão.</p>');
  const subs = db.pessoas.filter((x) => x.superiorId === p.id);
  const vinculos = db.rebanhos.filter((r) => r.professores.includes(p.id) || r.coordenadorId === p.id);
  const bloqueio = [subs.length && `${subs.length} subordinado(s)`, vinculos.length && `o vínculo com ${vinculos.map(nomeRebanho).join(', ')}`].filter(Boolean);
  app.innerHTML = `
    <h1>${esc(p.nome)}</h1>
    <p class="sub">${PAPEIS[p.papel]} · subordinado a ${esc(nomePessoa(p.superiorId))}</p>
    <form class="grade" id="editar">${formPessoa(p, pode)}<div style="align-self:end"><button class="btn">Salvar</button></div></form>
    <div class="acoes">${bloqueio.length ? `<p class="vazio">Para excluir, primeiro transfira ${bloqueio.join(' e ')}.</p>`
      : '<button class="btn perigo" id="excluir">Excluir pessoa</button>'}</div>`;
  const f = document.getElementById('editar');
  ligarPessoa(f, p);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const d = lerPessoa(f);
    if (d.papel !== p.papel && bloqueio.length) return aviso('Transfira subordinados e rebanhos antes de mudar a função');
    Object.assign(p, d);
    salvar('Cadastro atualizado');
    montarTopo();
    location.hash = '#/equipe';
  };
  const x = document.getElementById('excluir');
  if (x) x.onclick = () => {
    if (!confirm(`Excluir ${p.nome} da equipe?`)) return;
    db.pessoas = db.pessoas.filter((y) => y !== p);
    salvar('Pessoa excluída');
    montarTopo();
    location.hash = '#/equipe';
  };
}

// ---------- Rebanhos ----------
function formRebanho(r) {
  const visiveis = equipeVisivel();
  const coords = visiveis.filter((p) => p.papel === 'coord_rebanho');
  const profs = visiveis.filter((p) => p.papel === 'professor');
  return `
    <label>Nome do rebanho <input name="nome" required value="${esc(r.nome)}" placeholder="Ex.: Rebanho Verde"></label>
    <label>Turma <select name="turma" required>${opcoes(TURMAS.map((t) => [t, t]), r.turma)}</select></label>
    <label>Seção <select name="secaoId">${opcoes(db.secoes.map((s) => [s.id, `${s.nome} (${s.horario})`]), r.secaoId, 'A definir')}</select></label>
    <label>Coordenador de rebanho <select name="coordenadorId">${opcoes(coords.map((p) => [p.id, p.nome]), r.coordenadorId, '—')}</select></label>
    <div class="checks"><span class="vazio">Professores:</span>${profs.length ? profs.map((p) => `<label class="check">
      <input type="checkbox" name="professores" data-lista value="${p.id}" ${r.professores?.includes(p.id) ? 'checked' : ''}> ${esc(p.nome)}</label>`).join('')
      : '<span class="vazio">nenhum professor cadastrado na Equipe</span>'}</div>`;
}

function lerRebanho(form) {
  const d = dadosDoForm(form);
  return {
    nome: d.nome, turma: d.turma, secaoId: d.secaoId || null, coordenadorId: d.coordenadorId || null,
    professores: [...form.querySelectorAll('input[name=professores]:checked')].map((c) => c.value),
  };
}

function rebanhos() {
  const lista = meusRebanhos();
  app.innerHTML = `
    <h1>Rebanhos e professores</h1>
    <div class="rolar"><table class="tabela">
      <tr><th>Rebanho</th><th>Seção</th><th>Coordenador</th><th>Professores</th><th>Crianças ativas</th><th></th></tr>
      ${lista.map((r) => `<tr><td><a href="#/painel/${r.id}">${esc(nomeRebanho(r))}</a></td>
        <td>${secao(r.secaoId) ? `${esc(secao(r.secaoId).nome)}<br><span class="vazio">${esc(secao(r.secaoId).horario)}</span>` : '—'}</td>
        <td>${esc(nomePessoa(r.coordenadorId))}</td><td>${esc(r.professores.map(nomePessoa).join(', ') || '—')}</td>
        <td>${db.criancas.filter((c) => c.rebanhoId === r.id && c.ativa).length}</td>
        <td><a class="btn sec" href="#/rebanho/${r.id}">Editar</a></td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum rebanho.</td></tr>'}
    </table></div>
    <h2>Novo rebanho</h2>
    <form class="grade" id="novo">${formRebanho({ coordenadorId: papel() === 'coord_rebanho' ? eu().id : null })}
      <div style="align-self:end"><button class="btn">Criar rebanho</button></div></form>`;
  document.getElementById('novo').onsubmit = (ev) => {
    ev.preventDefault();
    db.rebanhos.push({ id: `r${Date.now()}`, ...lerRebanho(ev.target) });
    salvar('Rebanho criado');
    rebanhos();
  };
}

function rebanhoPagina(id) {
  const r = meusRebanhos().find((x) => x.id === id);
  if (!r) return (app.innerHTML = '<p class="vazio">Rebanho não encontrado ou sem permissão.</p>');
  const n = db.criancas.filter((c) => c.rebanhoId === r.id).length;
  app.innerHTML = `
    <h1>${esc(nomeRebanho(r))}</h1>
    <form class="grade" id="editar">${formRebanho(r)}<div style="align-self:end"><button class="btn">Salvar</button></div></form>
    <div class="acoes">${n ? `<p class="vazio">${n} criança(s) neste rebanho: transfira-as antes de excluir.</p>`
      : '<button class="btn perigo" id="excluir">Excluir rebanho</button>'}</div>`;
  document.getElementById('editar').onsubmit = (ev) => {
    ev.preventDefault();
    Object.assign(r, lerRebanho(ev.target));
    salvar('Rebanho atualizado');
    location.hash = '#/rebanhos';
  };
  const x = document.getElementById('excluir');
  if (x) x.onclick = () => {
    if (!confirm(`Excluir ${nomeRebanho(r)}?`)) return;
    db.rebanhos = db.rebanhos.filter((y) => y !== r);
    salvar('Rebanho excluído');
    location.hash = '#/rebanhos';
  };
}

// ---------- Lançamentos (professores) ----------
function rebanhoAtual(rid) {
  const lista = meusRebanhos();
  return lista.find((r) => r.id === (rid || sessionStorage.getItem('rebanhoAtual'))) || lista[0];
}

const seletorRebanho = (r, destino) => (meusRebanhos().length > 1
  ? `<label class="perfil" style="margin-bottom:.5rem">Rebanho <select id="trocaRebanho" data-destino="${destino}">
      ${opcoes(meusRebanhos().map((x) => [x.id, nomeRebanho(x)]), r.id)}</select></label>` : '');

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
        <td>${esc(e.tema || '—')}</td><td>${esc(e.versiculo || '')} ${db.versiculoMax[e.id] != null ? `<span class="vazio">(${db.versiculoMax[e.id]} pts)</span>` : ''}</td>
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

function encontro(id, rid) {
  const e = db.encontros.find((x) => x.id === Number(id));
  const r = rebanhoAtual(rid);
  if (!e || !r) return (app.innerHTML = '<p class="vazio">Encontro ou rebanho não encontrado.</p>');
  const s = secao(r.secaoId);
  const vmax = db.versiculoMax[e.id];
  const cab = `
    ${seletorRebanho(r, `#/encontro/${e.id}`)}
    <h1>${fmt(e.data)} — ${esc(nomeRebanho(r))}</h1>
    <div class="info"><strong>Cronograma:</strong> ${esc(e.tema || 'sem tema')}
      · Versículo: ${esc(e.versiculo || '—')} ${vmax != null ? `(${vmax} pontos)` : '(pontos não definidos)'}
      · Meditação: ${esc(e.meditacao || '—')}${s ? ` · ${esc(s.nome)} ${esc(s.horario)}` : ''}</div>`;
  if (e.tipo === 'sem_aula') {
    app.innerHTML = `${cab}<p class="vazio">Data marcada no cronograma como sem programação.</p>`;
    return ligarSeletor();
  }
  const criancas = db.criancas.filter((c) => c.rebanhoId === r.id && ((c.ativa && c.entrada <= e.data) || db.registros[c.id]?.[e.id]));
  const rascunho = Object.fromEntries(criancas.map((c) => [c.id, { ...(db.registros[c.id]?.[e.id] || {}) }]));
  const seg = (cid, campo) => `<div class="seg">${OPCOES[campo].map((v) =>
    `<button type="button" data-c="${cid}" data-f="${campo}" data-v="${v}" class="${rascunho[cid][campo] === v ? 'on' : ''}">${v}</button>`).join('')}</div>`;

  app.innerHTML = `${cab}
    <p class="sub">Kids: P presente · A atraso · F falta · FJ falta justificada. Meditação: OK completa · MI incompleta · MI-OK complementada · X não fez.</p>
    <div class="acoes"><button type="button" class="btn sec" id="todos">Marcar todos presentes</button></div>
    <div class="lanc">
      ${criancas.length ? criancas.map((c) => `<div class="aluno">
        <div class="nome">${esc(c.nome)}</div>
        <div class="campo"><span>Kids</span>${seg(c.id, 'k')}</div>
        <div class="campo"><span>Culto</span>${seg(c.id, 'c')}</div>
        <div class="campo"><span>Versículo${vmax != null ? ` (máx. ${vmax})` : ''}</span><input class="pts" type="number" min="0" ${vmax != null ? `max="${vmax}"` : ''} step="0.5" data-c="${c.id}" value="${rascunho[c.id].v ?? ''}"></div>
        <div class="campo"><span>Meditação</span>${seg(c.id, 'm')}</div>
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

// ---------- Crianças ----------
function criancas() {
  const mostrar = sessionStorage.getItem('inativas') === '1';
  const lista = minhasCriancas().filter((c) => mostrar || c.ativa);
  app.innerHTML = `
    <h1>Crianças</h1>
    <label class="check"><input type="checkbox" id="inativas" ${mostrar ? 'checked' : ''}> Mostrar inativas</label>
    <div class="rolar" style="margin-top:.75rem"><table class="tabela">
      <tr><th>Nome</th><th>Rebanho</th><th>Idade</th><th>Kids</th><th>Culto</th><th>Versículos</th><th>Meditações</th><th>Média provas</th><th>TOPs</th></tr>
      ${lista.map((c) => {
        const r = resumoCrianca(db.registros[c.id] || {});
        return `<tr><td><a href="#/crianca/${c.id}">${esc(c.nome)}</a> ${c.ativa ? '' : '<span class="tag fora">inativa</span>'}</td>
          <td>${esc(rebanho(c.rebanhoId)?.turma ?? '—')}</td>
          <td>${idade(c.nascimento)}</td><td>${pct(r.kids.pct)}</td><td>${pct(r.culto.pct)}</td><td>${r.versiculos}</td>
          <td>${r.meditacoes.completas}/${r.meditacoes.total}</td><td>${nota(mediaNotas(db.notas[c.id]))}</td><td>${topsDaCrianca(db, c).length}</td></tr>`;
      }).join('') || '<tr><td colspan="9" class="vazio">Nenhuma criança.</td></tr>'}
    </table></div>
    ${meusRebanhos().length ? `<h2>Nova criança</h2>
    <form class="grade" id="nova">${camposCrianca({ entrada: hoje(), rebanhoId: rebanhoAtual()?.id })}
      <div style="align-self:end"><button class="btn">Cadastrar</button></div></form>` : ''}`;
  document.getElementById('inativas').onchange = (ev) => { sessionStorage.setItem('inativas', ev.target.checked ? '1' : '0'); criancas(); };
  const f = document.getElementById('nova');
  if (f) f.onsubmit = (ev) => {
    ev.preventDefault();
    const c = { id: `c${Date.now()}`, ...dadosDoForm(ev.target), ativa: true };
    c.nascimento ||= null;
    db.criancas.push(c);
    db.registros[c.id] = {};
    salvar('Criança cadastrada');
    criancas();
  };
}

function camposCrianca(c) {
  return `
    <label>Nome completo <input name="nome" required value="${esc(c.nome)}"></label>
    <label>Rebanho <select name="rebanhoId" required>${opcoes(meusRebanhos().map((r) => [r.id, nomeRebanho(r)]), c.rebanhoId)}</select></label>
    <label>Data de nascimento <input type="date" name="nascimento" value="${esc(c.nascimento)}"></label>
    <label>Responsável <input name="responsavel" value="${esc(c.responsavel)}"></label>
    <label>Data de entrada <input type="date" name="entrada" required value="${esc(c.entrada)}"></label>`;
}

function crianca(id) {
  const c = minhasCriancas().find((x) => x.id === id);
  if (!c) return (app.innerHTML = '<p class="vazio">Criança não encontrada ou sem permissão.</p>');
  const regs = db.registros[c.id] || {};
  const r = resumoCrianca(regs);
  const feitos = encontrosRealizados(db);
  app.innerHTML = `
    <h1>${esc(c.nome)} ${c.ativa ? '' : '<span class="tag fora">inativa</span>'}</h1>
    <p class="sub">${esc(nomeRebanho(rebanho(c.rebanhoId)))} · ${idade(c.nascimento)} anos · responsável: ${esc(c.responsavel || '—')} · entrada em ${fmt(c.entrada)}${c.ativa ? '' : ` · saída em ${fmt(c.saida)}: ${esc(c.motivoSaida)}`}</p>
    <div class="cards">
      <div class="card"><div class="num">${pct(r.kids.pct)}</div><div class="rot">Kids: ${r.kids.presencas} de ${r.kids.total} (${r.atrasos} atrasos, ${r.faltasJustificadas} FJ)</div></div>
      <div class="card"><div class="num">${pct(r.culto.pct)}</div><div class="rot">Culto: ${r.culto.presencas} de ${r.culto.total}</div></div>
      <div class="card"><div class="num">${r.versiculos}</div><div class="rot">pontos de versículo</div></div>
      <div class="card"><div class="num">${r.meditacoes.completas}/${r.meditacoes.total}</div><div class="rot">meditações completas</div></div>
      <div class="card"><div class="num">${topsDaCrianca(db, c).length}</div><div class="rot">TOPs</div></div>
      <div class="card"><div class="num">${nota(mediaNotas(db.notas[c.id]))}</div><div class="rot">média das provas</div></div>
    </div>

    <h2>Notas de prova</h2>
    <form class="grade" id="notas">
      ${db.provas.map((p) => `<label>${esc(p.nome)} (0 a ${db.notaMaxima})
        <input type="number" name="${p.id}" min="0" max="${db.notaMaxima}" step="0.1" value="${db.notas[c.id]?.[p.id] ?? ''}"></label>`).join('')}
      <div style="align-self:end"><button class="btn">Salvar notas</button></div>
    </form>

    <h2>Desafios</h2>
    <div class="rolar"><table class="tabela"><tr><th>Desafio</th><th>Resultado</th><th>Versículos</th><th>Motivo</th></tr>
      ${db.desafios.map((d) => { const a = avaliarDesafio(db, d, c);
        return `<tr><td><a href="#/desafio/${d.id}">${esc(d.nome)}</a></td><td>${tag(a.status)}</td><td>${a.pontos ?? '—'}/${d.versiculosMin}</td><td>${esc(a.motivos.join('; '))}</td></tr>`; }).join('')}
    </table></div>

    <h2>Histórico</h2>
    <div class="rolar"><table class="tabela"><tr><th>Data</th><th>Kids</th><th>Culto</th><th>Versículo</th><th>Meditação</th></tr>
      ${ordenados().filter((e) => e.data >= c.entrada && feitos.has(e.id)).reverse().map((e) => { const x = regs[e.id] || {};
        return `<tr><td><a href="#/encontro/${e.id}/${c.rebanhoId}">${fmt(e.data)}</a></td><td>${x.k ?? '—'}</td><td>${x.c ?? '—'}</td>
          <td>${x.v ?? '—'}${db.versiculoMax[e.id] ? `/${db.versiculoMax[e.id]}` : ''}</td><td>${x.m ?? '—'}</td></tr>`; }).join('')}
    </table></div>

    <h2>Cadastro</h2>
    <form class="grade" id="editar">${camposCrianca(c)}
      <div style="align-self:end"><button class="btn">Salvar cadastro</button></div></form>
    <div class="acoes">${c.ativa
      ? '<button class="btn perigo" id="inativar">Inativar criança</button>'
      : '<button class="btn sec" id="reativar">Reativar criança</button>'}</div>`;

  document.getElementById('notas').onsubmit = (ev) => {
    ev.preventDefault();
    // Campo vazio = prova ainda não lançada (diferente de nota zero)
    const n = Object.fromEntries(Object.entries(dadosDoForm(ev.target)).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    if (Object.values(n).some((v) => !(v >= 0 && v <= db.notaMaxima))) return aviso(`Notas devem ficar entre 0 e ${db.notaMaxima}`);
    db.notas[c.id] = n;
    salvar('Notas salvas');
    crianca(id);
  };
  document.getElementById('editar').onsubmit = (ev) => {
    ev.preventDefault();
    Object.assign(c, dadosDoForm(ev.target));
    c.nascimento ||= null;
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
    <label>Pontos mínimos de versículo <input type="number" name="versiculosMin" min="0" step="0.5" required value="${d.versiculosMin ?? ''}"></label>
    <label class="check"><input type="checkbox" name="meditacao" ${d.meditacao !== false ? 'checked' : ''}> Exigir meditação completa (OK ou MI-OK)</label>`;
}

// Sugestões: FJ = 1 em desafios curtos, 2 a partir de 7 semanas; versículos = soma dos pontos do cronograma.
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
    <p class="sub">A criança ganha o TOP se comparecer ao Kids e ao culto em todas as semanas (aceitando as faltas justificadas permitidas), fizer as meditações e decorar os versículos. ${db.topsPremiacao} TOPs no ano = premiação especial.</p>
    ${editaCronograma() ? '<p class="info">Para criar desafios, use a aba <a href="#/cronograma">Cronograma</a>.</p>' : ''}
    <div class="rolar"><table class="tabela">
      <tr><th>Desafio</th><th>Período</th><th>FJ permitidas</th><th>Versículos</th><th>TOPs</th><th>Em andamento</th></tr>
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
    <p class="sub">${fmt(s[0]?.data)} a ${fmt(s.at(-1)?.data)} · ${d.semanas} semanas · até ${d.fj} FJ · ${d.versiculosMin} pontos de versículo${d.meditacao ? ' · meditação obrigatória' : ''}</p>
    <div class="rolar"><table class="tabela">
      <tr><th>Criança</th><th>Rebanho</th><th>Resultado</th><th>Versículos</th><th>Motivo</th></tr>
      ${linhas.map(({ c, a }) => `<tr><td><a href="#/crianca/${c.id}">${esc(c.nome)}</a></td><td>${esc(rebanho(c.rebanhoId)?.turma ?? '—')}</td><td>${tag(a.status)}</td>
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
    localStorage.removeItem(CHAVE_PERFIL);
    db = structuredClone(base);
    montarTopo();
    aviso('Dados da planilha restaurados');
  };
}

// ---------- Rotas ----------
const rotas = {
  '': painel, painel, cronograma, data: dataCronograma, equipe, pessoa: pessoaPagina, rebanhos, rebanho: rebanhoPagina,
  encontros, encontro, criancas, crianca, desafios, desafio, dados,
};
// Aba do menu marcada em cada rota
const ABA_DA_ROTA = { painel: '', data: 'cronograma', pessoa: 'equipe', rebanho: 'rebanhos', encontro: 'encontros', crianca: 'criancas', desafio: 'desafios' };

function rotear() {
  const [nome = '', ...args] = location.hash.replace(/^#\/?/, '').split('/');
  const aba = ABA_DA_ROTA[nome] ?? nome;
  const permitidas = ABAS.filter(([, , quem]) => quem.includes(papel()));
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
  for (const c of local.criancas) c.rebanhoId ??= 'r1';
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
if (localStorage.getItem(CHAVE_PERFIL) && !eu()) localStorage.removeItem(CHAVE_PERFIL);
montarTopo();
window.addEventListener('hashchange', rotear);
rotear();
