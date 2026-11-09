// Regras de negócio. Funções puras: recebem os dados, não leem nem gravam nada.

// Kids: atraso e falta justificada contam como presença. Culto: FJ conta como presença.
export const PRESENTE = { k: ['P', 'A', 'FJ'], c: ['P', 'FJ'] };
export const MEDITACAO_COMPLETA = ['OK', 'MI-OK'];

// Encontro realizado = algum registro lançado para alguma criança.
export function encontrosRealizados(db) {
  const ids = new Set();
  for (const regs of Object.values(db.registros)) {
    for (const [id, r] of Object.entries(regs)) if (Object.keys(r).length) ids.add(Number(id));
  }
  return ids;
}

// Frequência = presenças ÷ encontros com lançamento para a criança naquele campo ('k' ou 'c').
export function frequencia(regs, campo) {
  const vals = Object.values(regs).map((r) => r[campo]).filter(Boolean);
  const pres = vals.filter((v) => PRESENTE[campo].includes(v)).length;
  return { presencas: pres, total: vals.length, pct: vals.length ? pres / vals.length : null };
}

export function resumoCrianca(regs) {
  const vals = Object.values(regs);
  const med = vals.map((r) => r.m).filter(Boolean);
  return {
    kids: frequencia(regs, 'k'),
    culto: frequencia(regs, 'c'),
    atrasos: vals.filter((r) => r.k === 'A').length,
    faltasJustificadas: vals.filter((r) => r.k === 'FJ').length,
    versiculos: vals.reduce((s, r) => s + (r.v || 0), 0),
    meditacoes: { completas: med.filter((m) => MEDITACAO_COMPLETA.includes(m)).length, total: med.length },
  };
}

export function semanasDoDesafio(db, d) {
  // Datas marcadas no cronograma como "sem programação" não contam como semana do desafio.
  const ordem = db.encontros.filter((e) => e.tipo !== 'sem_aula').sort((a, b) => a.data.localeCompare(b.data));
  const i = ordem.findIndex((e) => e.id === Number(d.inicio));
  return i < 0 ? [] : ordem.slice(i, i + Number(d.semanas));
}

export function versiculosDoDesafio(db, d) {
  return semanasDoDesafio(db, d).reduce((s, e) => s + (Number(db.versiculoMax[e.id]) || 0), 0);
}

// Resultado de uma criança num desafio: { status: 'top'|'nao'|'andamento'|'fora', motivos[] }
export function avaliarDesafio(db, d, crianca) {
  const semanas = semanasDoDesafio(db, d);
  if (!semanas.length) return { status: 'fora', motivos: ['desafio sem encontros'] };
  if (crianca.entrada > semanas[0].data) return { status: 'fora', motivos: ['entrou depois do início'] };

  const regs = db.registros[crianca.id] || {};
  const feitos = encontrosRealizados(db);
  const r = semanas.map((e) => regs[e.id] || {});
  const motivos = [];
  // Campo em branco = ainda não lançado: deixa o desafio em andamento, não conta como falta.
  const campos = d.meditacao ? ['k', 'c', 'm'] : ['k', 'c'];
  const semLancamento = r.reduce((s, x) => s + campos.filter((f) => x[f] === undefined).length, 0);

  for (const [campo, nome] of [['k', 'Kids'], ['c', 'Culto']]) {
    const fj = r.filter((x) => x[campo] === 'FJ').length;
    const faltas = r.filter((x) => x[campo] !== undefined && !PRESENTE[campo].includes(x[campo])).length;
    if (faltas) motivos.push(`${nome}: ${faltas} falta(s)`);
    if (fj > Number(d.fj)) motivos.push(`${nome}: ${fj} faltas justificadas (máximo ${d.fj})`);
  }
  if (d.meditacao) {
    const inc = r.filter((x) => x.m !== undefined && !MEDITACAO_COMPLETA.includes(x.m)).length;
    if (inc) motivos.push(`Meditação: ${inc} não completa(s)`);
  }
  // Versículo em branco conta 0; só cobra o total depois que todas as semanas aconteceram.
  const futuras = semanas.filter((e) => !feitos.has(e.id)).length;
  const pontos = r.reduce((s, x) => s + (x.v || 0), 0);
  if (!futuras && pontos < Number(d.versiculosMin)) motivos.push(`Versículos: ${pontos} de ${d.versiculosMin}`);

  if (motivos.length) return { status: 'nao', motivos, pontos };
  if (futuras || semLancamento) {
    return { status: 'andamento', motivos: [`faltam ${futuras} semana(s), ${semLancamento} lançamento(s) em branco`], pontos };
  }
  return { status: 'top', motivos: [], pontos };
}

export function topsDaCrianca(db, crianca) {
  return db.desafios.filter((d) => avaliarDesafio(db, d, crianca).status === 'top');
}

// Média simples das provas lançadas (campo vazio = ainda não lançada, fica fora da média).
export function mediaNotas(notas = {}) {
  const v = Object.values(notas).filter((x) => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// Média da turma = média de todas as notas lançadas das crianças informadas.
export function mediaTurma(db, criancas) {
  return mediaNotas(Object.fromEntries(criancas.flatMap((c) =>
    Object.entries(db.notas?.[c.id] || {}).map(([p, n]) => [`${c.id}-${p}`, n]))));
}

// ---------- Organograma ----------
// Superior obrigatório de cada papel (ramo do ensino e ramo dos setores).
export const SUPERIOR = {
  pastor: null,
  coord_geral: 'pastor',
  coord_rebanho: 'coord_geral',
  professor: 'coord_rebanho',
  lider_geral: 'pastor',
  lider_turma: 'lider_geral',
  membro_setor: 'lider_turma',
};

export function descendentes(db, id) {
  const out = new Set();
  const fila = [id];
  while (fila.length) {
    const x = fila.pop();
    for (const p of db.pessoas) if (p.superiorId === x && !out.has(p.id)) { out.add(p.id); fila.push(p.id); }
  }
  return out;
}

// Rebanhos que a pessoa enxerga. Sem pessoa (administrador) ou pastor: todos.
export function rebanhosVisiveis(db, pessoa) {
  if (!pessoa || pessoa.papel === 'pastor') return db.rebanhos;
  const sub = descendentes(db, pessoa.id);
  const daEquipe = (r) => sub.has(r.coordenadorId) || r.professores.some((x) => sub.has(x));
  switch (pessoa.papel) {
    case 'coord_geral': return db.rebanhos.filter(daEquipe);
    case 'coord_rebanho': return db.rebanhos.filter((r) => r.coordenadorId === pessoa.id || daEquipe(r));
    case 'professor': return db.rebanhos.filter((r) => r.professores.includes(pessoa.id));
    default: return [];
  }
}
