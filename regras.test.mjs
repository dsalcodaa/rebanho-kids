// Executar: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avaliarDesafio, resumoCrianca, topsDaCrianca, versiculosDoDesafio } from './regras.js';

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
