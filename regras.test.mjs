// Executar: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aniversariantes, avaliarDesafio, descendentes, frequenciaPorMes, motivosAtencao, mediaNotas, mediaTurma, rebanhosVisiveis, resumoCrianca, semanasDoDesafio, topsDaCrianca, versiculosDoDesafio } from './regras.js';

const db = JSON.parse(readFileSync(new URL('./data/dados.json', import.meta.url), 'utf-8'));
const porNome = (n) => db.criancas.find((c) => c.nome.startsWith(n));
const ganhadores = (id) => {
  const d = db.desafios.find((x) => x.id === id);
  return db.criancas.filter((c) => avaliarDesafio(db, d, c).status === 'top').map((c) => c.nome.split(' ')[0]);
};

test('totais batem com o RESUMO da planilha', () => {
  const ana = resumoCrianca(db.registros[porNome('ANA').id]);
  assert.equal(ana.kids.presencas, 29);
  assert.equal(ana.versiculos, 99);
  assert.equal(ana.meditacoes.completas, 27); // 26 OK + 1 MI-OK
  const arao = resumoCrianca(db.registros[porNome('AR').id]);
  assert.equal(arao.atrasos, 5);
  assert.equal(arao.kids.presencas, 22); // 17 P + 5 A
});

test('falta justificada conta como presença', () => {
  const m = resumoCrianca(db.registros[porNome('MANUELA').id]);
  assert.equal(m.kids.presencas, 28); // 26 P + 2 FJ
  assert.equal(m.kids.total, 29);
});

test('versículos exigidos = soma dos máximos das semanas', () => {
  assert.equal(versiculosDoDesafio(db, db.desafios[0]), 9);
  assert.equal(versiculosDoDesafio(db, db.desafios[1]), 27);
  assert.equal(versiculosDoDesafio(db, db.desafios[2]), 24);
});

test('TOP 3 vai de 06/09 a 18/10 e segue em andamento sem os lançamentos de outubro', () => {
  const d = db.desafios.find((x) => x.nome === 'TOP 3');
  assert.equal(d.semanas, 7);
  assert.equal(db.encontros.find((e) => e.id === d.inicio).data, '2026-09-06');
  assert.equal(avaliarDesafio(db, d, porNome('HÉLIO')).status, 'andamento');
});

test('médias de provas ignoram notas não lançadas', () => {
  assert.equal(mediaNotas({ p1: 8, p2: 10 }), 9);
  assert.equal(mediaNotas({}), null);
  const t = { ...db, notas: { a: { p1: 6 }, b: { p1: 10, p2: 8 } } };
  assert.equal(mediaTurma(t, [{ id: 'a' }, { id: 'b' }]), 8);
});

test('ganhadores dos desafios 2026', () => {
  assert.deepEqual(ganhadores('d1'), ['ANA', 'GABRIEL', 'HÉLIO', 'MANUELA', 'PEDRO']);
  assert.deepEqual(ganhadores('d2'), ['ANA', 'EVELYN', 'GABRIEL', 'HÉLIO', 'MANUELA', 'PEDRO']);
  assert.deepEqual(ganhadores('d3'), ['ANA', 'GABRIEL', 'HÉLIO', 'MANUELA', 'PEDRO']);
});

test('limite de faltas justificadas', () => {
  const d = { inicio: 11, semanas: 8, fj: 0, versiculosMin: 24, meditacao: true };
  const r = avaliarDesafio(db, d, porNome('MANUELA')); // FJ no culto em 10/05 e 17/05
  assert.equal(r.status, 'nao');
  assert.match(r.motivos.join(), /Culto: 2 faltas justificadas/);
});

test('criança que entrou depois fica fora', () => {
  assert.equal(avaliarDesafio(db, db.desafios[0], porNome('JULIANA')).status, 'fora');
});

test('3 TOPs = premiação', () => {
  const premiados = db.criancas.filter((c) => topsDaCrianca(db, c).length >= db.topsPremiacao);
  assert.equal(premiados.length, 5);
});

test('organograma: cada um vê só os rebanhos da sua equipe', () => {
  const org = {
    pessoas: [
      { id: 'pa', papel: 'pastor' },
      { id: 'cg', papel: 'coord_geral', superiorId: 'pa' },
      { id: 'cr', papel: 'coord_rebanho', superiorId: 'cg' },
      { id: 'pr', papel: 'professor', superiorId: 'cr' },
      { id: 'pr2', papel: 'professor', superiorId: 'cr' },
      { id: 'lg', papel: 'lider_geral', superiorId: 'pa' },
    ],
    rebanhos: [
      { id: 'r1', coordenadorId: 'cr', professores: ['pr'] },
      { id: 'r2', coordenadorId: null, professores: ['pr2'] },
      { id: 'r3', coordenadorId: null, professores: [] },
    ],
  };
  const ver = (id) => rebanhosVisiveis(org, org.pessoas.find((p) => p.id === id)).map((r) => r.id);
  assert.deepEqual([...descendentes(org, 'cg')].sort(), ['cr', 'pr', 'pr2']);
  assert.deepEqual(ver('pa'), ['r1', 'r2', 'r3']);
  assert.deepEqual(ver('cg'), ['r1', 'r2']);
  assert.deepEqual(ver('cr'), ['r1', 'r2']);
  assert.deepEqual(ver('pr'), ['r1']);
  assert.deepEqual(ver('lg'), []);
});

test('data sem programação no cronograma sai da janela do desafio', () => {
  const enc = db.encontros.map((e) => (e.id === 4 ? { ...e, tipo: 'sem_aula' } : e));
  const s = semanasDoDesafio({ ...db, encontros: enc }, { inicio: 3, semanas: 3 }).map((e) => e.id);
  assert.deepEqual(s, [3, 5, 6]);
});

test('frequência por mês soma as crianças', () => {
  const ana = [porNome('ANA')];
  const meses = frequenciaPorMes(db, ana, 'k');
  assert.equal(meses[0].mes, '2026-02');
  assert.ok(meses.every((m) => m.pct === 1)); // Ana não faltou
  const fev = frequenciaPorMes(db, db.criancas.filter((c) => c.entrada < '2026-03-01'), 'k')[0];
  assert.equal(fev.total, 8); // 22/02, 8 crianças inscritas
});

test('crianças que precisam de atenção', () => {
  assert.deepEqual(motivosAtencao(db, porNome('ANA')), []);
  assert.match(motivosAtencao(db, porNome('LORENZO')).join(), /frequência no Kids de 27%/);
  assert.match(motivosAtencao(db, porNome('JULIANA')).join(), /3 últimas faltas seguidas/);
});

test('aniversariantes do mês', () => {
  assert.deepEqual(aniversariantes(db.criancas, 4).map((c) => c.nome.split(' ')[0]), ['ANA', 'ARÃO', 'EVELYN']);
});

test('Bíblia & Intelecto: acertos, erros corrigidos, pendentes e questão mais errada', async () => {
  const { resumoGabaritos, parecerBI } = await import('./regras.js');
  const g = [{ livro: 'x', linhas: { 1: 'crrrcrcc', 2: 'cccccccc', 3: 'recccccc', 4: 'c-------', 5: '--------' } }];
  const r = resumoGabaritos(g);
  assert.equal(r.exercicios, 4);
  assert.equal(r.respondidas, 25);
  assert.equal(r.acertos, 19);
  assert.equal(r.corrigidos, 5);
  assert.equal(r.pendentes, 1);
  assert.equal(r.erros, 6);
  assert.equal(r.nota, 7.6);
  assert.deepEqual(r.porQuestao, [1, 2, 1, 1, 0, 1, 0, 0]);
  assert.equal(r.completos, 2);
  assert.match(parecerBI(r), /Desempenho regular: acertou de primeira 76%.*Mais erra a questão 2 \(2 vezes\)/);
  assert.equal(parecerBI(resumoGabaritos([])), 'Sem gabarito lançado.');
});
