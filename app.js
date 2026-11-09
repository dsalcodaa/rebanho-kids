import {
  avaliarDesafio, encontrosRealizados, mediaNotas, mediaTurma, resumoCrianca, semanasDoDesafio, topsDaCrianca, versiculosDoDesafio,
} from './regras.js';

// shortcut: dados ficam no localStorage de cada navegador; trocar por Supabase na próxima etapa.
const CHAVE = 'rebanho-kids-v1';
const app = document.getElementById('app');
let db;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
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
  form.querySelectorAll('input[type=checkbox]').forEach((c) => { o[c.name] = c.checked; });
  return o;
}

// ---------- Painel ----------
const nota = (x) => (x == null ? '—' : Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

function painel() {
  const ativas = db.criancas.filter((c) => c.ativa);
  const inativas = db.criancas.filter((c) => !c.ativa);
  const feitos = encontrosRealizados(db);
  const semLanc = ordenados().filter((e) => e.data < hoje() && !feitos.has(e.id));
  const resumos = ativas.map((c) => resumoCrianca(db.registros[c.id] || {}));
  const media = (k) => {
    const v = resumos.map((r) => r[k].pct).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  // Todas as crianças (ativas primeiro), com frequência, provas e TOPs
  const linhas = [...ativas, ...inativas].map((c) => ({
    c, r: resumoCrianca(db.registros[c.id] || {}), tops: topsDaCrianca(db, c), notas: db.notas[c.id] || {},
  }));
  const premiados = linhas.filter((l) => l.tops.length >= db.topsPremiacao);
  const prof = db.professor;

  app.innerHTML = `
    <h1>${esc(db.turma)}</h1>
    ${prof ? `<p class="sub">Professor: <strong>${esc(prof.nome)}</strong> · ${idade(prof.nascimento)} anos · nascido em ${fmt(prof.nascimento)}</p>` : ''}
    <div class="cards">
      <div class="card"><div class="num">${ativas.length}</div><div class="rot">crianças ativas</div></div>
      <div class="card"><div class="num">${inativas.length}</div><div class="rot">crianças inativas</div></div>
      <div class="card"><div class="num">${pct(media('kids'))}</div><div class="rot">frequência média no Kids</div></div>
      <div class="card"><div class="num">${pct(media('culto'))}</div><div class="rot">frequência média no culto</div></div>
      <div class="card"><div class="num">${nota(mediaTurma(db, ativas))}</div><div class="rot">média das provas (0 a ${db.notaMaxima})</div></div>
      <div class="card"><div class="num">${premiados.length}</div><div class="rot">com ${db.topsPremiacao}+ TOPs (premiação)</div></div>
    </div>

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
      <tr><th>Criança</th><th>Kids</th><th>Culto</th>${db.provas.map((p) => `<th>${esc(p.nome)}</th>`).join('')}<th>Média</th><th>TOPs</th><th>Conquistados</th></tr>
      ${linhas.map((l) => `<tr><td><a href="#/crianca/${l.c.id}">${esc(l.c.nome)}</a> ${l.c.ativa ? '' : '<span class="tag fora">inativa</span>'}</td>
        <td>${pct(l.r.kids.pct)}</td><td>${pct(l.r.culto.pct)}</td>
        ${db.provas.map((p) => `<td>${nota(l.notas[p.id])}</td>`).join('')}
        <td><strong>${nota(mediaNotas(l.notas))}</strong></td>
        <td>${l.tops.length >= db.topsPremiacao ? `<span class="tag top">${l.tops.length} — premiada</span>` : l.tops.length}</td>
        <td>${l.tops.map((d) => esc(d.nome)).join(', ') || '—'}</td></tr>`).join('')}
      <tr><td><strong>Média da turma</strong></td><td>${pct(media('kids'))}</td><td>${pct(media('culto'))}</td>
        ${db.provas.map((p) => `<td>${nota(mediaNotas(Object.fromEntries(ativas.map((c) => [c.id, db.notas[c.id]?.[p.id]]))))}</td>`).join('')}
        <td><strong>${nota(mediaTurma(db, ativas))}</strong></td><td></td><td></td></tr>
    </table></div>

    <h2>Para conferir</h2>
    <ul class="alertas">
      ${semLanc.map((e) => `<li>Encontro de <a href="#/encontro/${e.id}">${fmt(e.data)}</a> sem lançamento</li>`).join('')}
      ${db.alertas.map((a) => `<li>${esc(a)}</li>`).join('')}
    </ul>`;
}

// ---------- Encontros ----------
function encontros() {
  const feitos = encontrosRealizados(db);
  app.innerHTML = `
    <h1>Encontros</h1>
    <form class="grade" id="novo">
      <label>Data do novo encontro <input type="date" name="data" required></label>
      <div style="align-self:end"><button class="btn">Criar encontro</button></div>
    </form>
    <h2>Calendário</h2>
    <div class="rolar"><table class="tabela">
      <tr><th>Nº</th><th>Data</th><th>Situação</th><th>Versículo (máx.)</th><th></th></tr>
      ${ordenados().map((e, i) => `<tr><td>${i + 1}</td><td>${fmt(e.data)}</td>
        <td>${feitos.has(e.id) ? '<span class="tag top">Lançado</span>' : e.data < hoje() ? '<span class="tag nao">Sem lançamento</span>' : '<span class="tag fora">Previsto</span>'}</td>
        <td>${db.versiculoMax[e.id] ?? '—'}</td>
        <td><a class="btn sec" href="#/encontro/${e.id}">Lançar</a></td></tr>`).join('')}
    </table></div>`;
  document.getElementById('novo').onsubmit = (ev) => {
    ev.preventDefault();
    const { data } = dadosDoForm(ev.target);
    if (db.encontros.some((e) => e.data === data)) return aviso('Já existe encontro nessa data');
    const id = Math.max(0, ...db.encontros.map((e) => e.id)) + 1;
    db.encontros.push({ id, data });
    salvar('Encontro criado');
    location.hash = `#/encontro/${id}`;
  };
}

const OPCOES = {
  k: ['P', 'A', 'F', 'FJ'],
  c: ['P', 'F', 'FJ'],
  m: ['OK', 'MI', 'MI-OK', 'X'],
};

function encontro(id) {
  const e = db.encontros.find((x) => x.id === Number(id));
  if (!e) return (app.innerHTML = '<p class="vazio">Encontro não encontrado.</p>');
  const criancas = db.criancas.filter((c) => (c.ativa && c.entrada <= e.data) || db.registros[c.id]?.[e.id]);
  const rascunho = Object.fromEntries(criancas.map((c) => [c.id, { ...(db.registros[c.id]?.[e.id] || {}) }]));
  const seg = (cid, campo) => `<div class="seg">${OPCOES[campo].map((v) =>
    `<button type="button" data-c="${cid}" data-f="${campo}" data-v="${v}" class="${rascunho[cid][campo] === v ? 'on' : ''}">${v}</button>`).join('')}</div>`;

  app.innerHTML = `
    <h1>Encontro de ${fmt(e.data)}</h1>
    <p class="sub">Kids: P presente · A atraso · F falta · FJ falta justificada. Meditação: OK completa · MI incompleta · MI-OK complementada · X não fez.</p>
    <form class="grade" onsubmit="return false">
      <label>Pontos máximos do versículo <input type="number" id="vmax" min="0" step="0.5" value="${db.versiculoMax[e.id] ?? ''}"></label>
      <div style="align-self:end"><button type="button" class="btn sec" id="todos">Marcar todos presentes</button></div>
    </form>
    <div class="lanc" style="margin-top:1rem">
      ${criancas.length ? criancas.map((c) => `<div class="aluno">
        <div class="nome">${esc(c.nome)}</div>
        <div class="campo"><span>Kids</span>${seg(c.id, 'k')}</div>
        <div class="campo"><span>Culto</span>${seg(c.id, 'c')}</div>
        <div class="campo"><span>Versículo</span><input class="pts" type="number" min="0" step="0.5" data-c="${c.id}" value="${rascunho[c.id].v ?? ''}"></div>
        <div class="campo"><span>Meditação</span>${seg(c.id, 'm')}</div>
      </div>`).join('') : '<p class="vazio">Nenhuma criança ativa nessa data.</p>'}
    </div>
    <div class="barra-salvar"><button class="btn" id="salvar">Salvar lançamentos</button></div>`;

  app.querySelectorAll('.seg button').forEach((b) => {
    b.onclick = () => {
      const r = rascunho[b.dataset.c];
      r[b.dataset.f] = r[b.dataset.f] === b.dataset.v ? undefined : b.dataset.v;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', r[b.dataset.f] === x.dataset.v));
    };
  });
  document.getElementById('todos').onclick = () => {
    app.querySelectorAll('.seg button[data-f="k"][data-v="P"]').forEach((b) => { if (!rascunho[b.dataset.c].k) b.click(); });
  };
  document.getElementById('salvar').onclick = () => {
    const vmax = document.getElementById('vmax').value;
    for (const inp of app.querySelectorAll('.pts')) {
      const v = inp.value === '' ? undefined : Number(inp.value);
      if (v != null && vmax !== '' && v > Number(vmax)) {
        inp.focus();
        return aviso(`${nomeCurto(db.criancas.find((c) => c.id === inp.dataset.c))}: ${v} passa do máximo ${vmax}`);
      }
      rascunho[inp.dataset.c].v = v;
    }
    if (vmax === '') delete db.versiculoMax[e.id]; else db.versiculoMax[e.id] = Number(vmax);
    for (const [cid, r] of Object.entries(rascunho)) {
      const limpo = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined));
      db.registros[cid] ??= {};
      if (Object.keys(limpo).length) db.registros[cid][e.id] = limpo; else delete db.registros[cid][e.id];
    }
    salvar(`Lançamentos de ${fmt(e.data)} salvos`);
  };
}

// ---------- Crianças ----------
function criancas() {
  const mostrar = sessionStorage.getItem('inativas') === '1';
  const lista = db.criancas.filter((c) => mostrar || c.ativa);
  app.innerHTML = `
    <h1>Crianças</h1>
    <label class="check"><input type="checkbox" id="inativas" ${mostrar ? 'checked' : ''}> Mostrar inativas</label>
    <div class="rolar" style="margin-top:.75rem"><table class="tabela">
      <tr><th>Nome</th><th>Idade</th><th>Kids</th><th>Culto</th><th>Versículos</th><th>Meditações</th><th>TOPs</th></tr>
      ${lista.map((c) => {
        const r = resumoCrianca(db.registros[c.id] || {});
        return `<tr><td><a href="#/crianca/${c.id}">${esc(c.nome)}</a> ${c.ativa ? '' : '<span class="tag fora">inativa</span>'}</td>
          <td>${idade(c.nascimento)}</td><td>${pct(r.kids.pct)}</td><td>${pct(r.culto.pct)}</td><td>${r.versiculos}</td>
          <td>${r.meditacoes.completas}/${r.meditacoes.total}</td><td>${topsDaCrianca(db, c).length}</td></tr>`;
      }).join('')}
    </table></div>
    <h2>Nova criança</h2>
    <form class="grade" id="nova">${camposCrianca({ entrada: hoje(), ativa: true })}
      <div style="align-self:end"><button class="btn">Cadastrar</button></div></form>`;
  document.getElementById('inativas').onchange = (ev) => { sessionStorage.setItem('inativas', ev.target.checked ? '1' : '0'); criancas(); };
  document.getElementById('nova').onsubmit = (ev) => {
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
    <label>Data de nascimento <input type="date" name="nascimento" value="${esc(c.nascimento)}"></label>
    <label>Responsável <input name="responsavel" value="${esc(c.responsavel)}"></label>
    <label>Data de entrada <input type="date" name="entrada" required value="${esc(c.entrada)}"></label>`;
}

function crianca(id) {
  const c = db.criancas.find((x) => x.id === id);
  if (!c) return (app.innerHTML = '<p class="vazio">Criança não encontrada.</p>');
  const regs = db.registros[c.id] || {};
  const r = resumoCrianca(regs);
  const feitos = encontrosRealizados(db);
  app.innerHTML = `
    <h1>${esc(c.nome)} ${c.ativa ? '' : '<span class="tag fora">inativa</span>'}</h1>
    <p class="sub">${idade(c.nascimento)} anos · responsável: ${esc(c.responsavel || '—')} · entrada em ${fmt(c.entrada)}${c.ativa ? '' : ` · saída em ${fmt(c.saida)}: ${esc(c.motivoSaida)}`}</p>
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
        return `<tr><td><a href="#/encontro/${e.id}">${fmt(e.data)}</a></td><td>${x.k ?? '—'}</td><td>${x.c ?? '—'}</td>
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
    <label>Nome <input name="nome" required value="${esc(d.nome)}" placeholder="Ex.: TOP 3"></label>
    <label>Primeiro encontro <select name="inicio">${ordenados().map((e) =>
      `<option value="${e.id}" ${Number(d.inicio) === e.id ? 'selected' : ''}>${fmt(e.data)}</option>`).join('')}</select></label>
    <label>Semanas <input type="number" name="semanas" min="1" required value="${d.semanas ?? 3}"></label>
    <label>Faltas justificadas permitidas <input type="number" name="fj" min="0" required value="${d.fj ?? 1}"></label>
    <label>Pontos mínimos de versículo <input type="number" name="versiculosMin" min="0" step="0.5" required value="${d.versiculosMin ?? ''}"></label>
    <label class="check"><input type="checkbox" name="meditacao" ${d.meditacao !== false ? 'checked' : ''}> Exigir meditação completa (OK ou MI-OK)</label>`;
}

// Sugestões: FJ = 1 até 3 semanas, 2 para 8; versículos = soma dos máximos já definidos.
function ligarSugestoes(form) {
  const sugerir = () => {
    const d = dadosDoForm(form);
    form.fj.value = Number(d.semanas) >= 8 ? 2 : 1;
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
  app.innerHTML = `
    <h1>Desafios</h1>
    <p class="sub">A criança ganha o TOP se comparecer ao Kids e ao culto em todas as semanas (aceitando as faltas justificadas permitidas), fizer as meditações e decorar os versículos.</p>
    <div class="rolar"><table class="tabela">
      <tr><th>Desafio</th><th>Início</th><th>Semanas</th><th>FJ permitidas</th><th>Versículos</th><th>Meditação</th><th>TOPs</th></tr>
      ${db.desafios.map((d) => `<tr><td><a href="#/desafio/${d.id}">${esc(d.nome)}</a></td>
        <td>${fmt(semanasDoDesafio(db, d)[0]?.data)}</td><td>${d.semanas}</td><td>${d.fj}</td><td>${d.versiculosMin}</td>
        <td>${d.meditacao ? 'sim' : 'não'}</td>
        <td>${db.criancas.filter((c) => avaliarDesafio(db, d, c).status === 'top').length}</td></tr>`).join('')}
    </table></div>
    <h2>Novo desafio</h2>
    <form class="grade" id="novo">${formDesafio({})}<div style="align-self:end"><button class="btn">Criar desafio</button></div></form>
    <h2>Premiação de fim de ano</h2>
    <form class="grade" id="premio"><label>TOPs necessários <input type="number" name="tops" min="1" value="${db.topsPremiacao}"></label>
      <div style="align-self:end"><button class="btn sec">Salvar</button></div></form>`;
  const f = document.getElementById('novo');
  ligarSugestoes(f);
  f.onsubmit = (ev) => {
    ev.preventDefault();
    db.desafios.push({ id: `d${Date.now()}`, ...lerDesafio(f) });
    salvar('Desafio criado');
    desafios();
  };
  document.getElementById('premio').onsubmit = (ev) => {
    ev.preventDefault();
    db.topsPremiacao = Number(ev.target.tops.value);
    salvar('Premiação atualizada');
  };
}

function desafio(id) {
  const d = db.desafios.find((x) => x.id === id);
  if (!d) return (app.innerHTML = '<p class="vazio">Desafio não encontrado.</p>');
  const s = semanasDoDesafio(db, d);
  const linhas = db.criancas.filter((c) => c.ativa || topsDaCrianca(db, c).includes(d))
    .map((c) => ({ c, a: avaliarDesafio(db, d, c) }));
  const sim = (ok) => (ok ? '<span class="ok">✓</span>' : '<span class="x">✗</span>');
  app.innerHTML = `
    <h1>${esc(d.nome)}</h1>
    <p class="sub">${fmt(s[0]?.data)} a ${fmt(s.at(-1)?.data)} · ${d.semanas} semanas · até ${d.fj} FJ · ${d.versiculosMin} pontos de versículo${d.meditacao ? ' · meditação obrigatória' : ''}</p>
    <div class="rolar"><table class="tabela">
      <tr><th>Criança</th><th>Resultado</th><th>Versículos</th><th>Motivo</th></tr>
      ${linhas.map(({ c, a }) => `<tr><td><a href="#/crianca/${c.id}">${esc(c.nome)}</a></td><td>${tag(a.status)}</td>
        <td>${a.pontos != null ? `${sim(a.pontos >= d.versiculosMin)} ${a.pontos}` : '—'}</td><td>${esc(a.motivos.join('; '))}</td></tr>`).join('')}
    </table></div>
    <h2>Editar desafio</h2>
    <form class="grade" id="editar">${formDesafio(d)}<div style="align-self:end"><button class="btn">Salvar</button></div></form>
    <div class="acoes"><button class="btn perigo" id="excluir">Excluir desafio</button></div>`;
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
    location.hash = '#/desafios';
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
    </div>
    <h2>Professor</h2>
    <form class="grade" id="professor">
      <label>Nome <input name="nome" required value="${esc(db.professor?.nome)}"></label>
      <label>Data de nascimento <input type="date" name="nascimento" value="${esc(db.professor?.nascimento)}"></label>
      <div style="align-self:end"><button class="btn">Salvar professor</button></div>
    </form>`;
  document.getElementById('professor').onsubmit = (ev) => {
    ev.preventDefault();
    db.professor = dadosDoForm(ev.target);
    salvar('Professor atualizado');
  };
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
    } catch { aviso('Arquivo inválido'); }
  };
  document.getElementById('restaurar').onclick = async () => {
    if (!confirm('Apagar as alterações deste navegador e voltar aos dados da planilha?')) return;
    localStorage.removeItem(CHAVE);
    db = await (await fetch('data/dados.json', { cache: 'no-store' })).json();
    aviso('Dados da planilha restaurados');
  };
}

// ---------- Rotas ----------
const rotas = { '': painel, encontros, encontro, criancas, crianca, desafios, desafio, dados };

function rotear() {
  const [nome = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
  (rotas[nome] || painel)(arg);
  const sec = { encontro: 'encontros', crianca: 'criancas', desafio: 'desafios' }[nome] ?? nome;
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('ativo', a.getAttribute('href') === `#/${sec}`));
  window.scrollTo(0, 0);
}

// Dados salvos numa versão anterior: acrescenta campos e desafios novos sem perder os lançamentos.
function atualizar(local, base) {
  for (const [k, v] of Object.entries(base)) if (!(k in local)) local[k] = v;
  for (const d of base.desafios) if (!local.desafios.some((x) => x.id === d.id)) local.desafios.push(d);
  local.versao = base.versao;
  return local;
}

const salvo = localStorage.getItem(CHAVE);
const base = await (await fetch('data/dados.json', { cache: 'no-store' })).json();
db = salvo ? atualizar(JSON.parse(salvo), base) : base;
window.addEventListener('hashchange', rotear);
rotear();
