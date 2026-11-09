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
  const ordem = [...db.encontros].sort((a, b) => a.data.localeCompare(b.data));
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
  const pendentes = semanas.filter((e) => !feitos.has(e.id)).length;
  const r = semanas.map((e) => regs[e.id] || {});
  const motivos = [];

  for (const [campo, nome] of [['k', 'Kids'], ['c', 'Culto']]) {
    const fj = r.filter((x) => x[campo] === 'FJ').length;
    const faltas = r.filter((x, i) => feitos.has(semanas[i].id) && !PRESENTE[campo].includes(x[campo])).length;
    if (faltas) motivos.push(`${nome}: ${faltas} falta(s)`);
    if (fj > Number(d.fj)) motivos.push(`${nome}: ${fj} faltas justificadas (máximo ${d.fj})`);
  }
  if (d.meditacao) {
    const inc = r.filter((x, i) => feitos.has(semanas[i].id) && !MEDITACAO_COMPLETA.includes(x.m)).length;
    if (inc) motivos.push(`Meditação: ${inc} não completa(s)`);
  }
  const pontos = r.reduce((s, x) => s + (x.v || 0), 0);
  if (!pendentes && pontos < Number(d.versiculosMin)) motivos.push(`Versículos: ${pontos} de ${d.versiculosMin}`);

  if (motivos.length) return { status: 'nao', motivos, pontos };
  if (pendentes) return { status: 'andamento', motivos: [`faltam ${pendentes} semana(s)`], pontos };
  return { status: 'top', motivos: [], pontos };
}

export function topsDaCrianca(db, crianca) {
  return db.desafios.filter((d) => avaliarDesafio(db, d, crianca).status === 'top');
}
