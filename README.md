# Rebanho Kids — versão de teste

Site estático (HTML + JavaScript, sem build) para testar a gestão da turma Kids 2A antes de migrar para Supabase.

## Como funciona
- `data/dados.json`: dados importados da planilha (registros brutos; totais e TOPs são recalculados).
- `regras.js`: regras de frequência e desafios. `regras.test.mjs`: testes com os dados reais.
- `app.js`: telas (painel, encontros, crianças, desafios, backup).
- **As alterações feitas no site ficam só no navegador de quem usou** (localStorage). Use "Dados → Exportar backup".

## Regras
- Frequência no Kids = (P + A + FJ) ÷ encontros lançados. Falta justificada e atraso não contam como falta.
- Frequência no culto = (P + FJ) ÷ cultos lançados.
- Meditação completa = OK ou MI-OK.
- Desafio (3 ou 8 semanas): para ganhar o TOP, a criança precisa ir ao Kids e ao culto em todas as semanas,
  com no máximo 1 falta justificada (3 semanas) ou 2 (8 semanas) em cada um, fazer todas as meditações
  e somar os pontos de versículo do desafio. Quem entrou depois do início fica fora.
- Lançamento em branco não conta como falta: o desafio fica "em andamento" até tudo ser lançado.
- Premiação de fim de ano: 3 TOPs (configurável). TOP 3: 06/09 a 18/10 (7 semanas, 2 FJ, 21 pontos).
- Provas: 3 por ano, nota de 0 a 10, lançadas na página da criança. Média = média simples das provas lançadas.

## Comandos
```
python -I tools/importar_planilha.py "../CONTROLE KIDS 2A - REBANHO VERDE.xlsx"   # regenera data/dados.json
node --test                                                                       # testes das regras
python -m http.server 8765                                                        # abre em http://localhost:8765
```

## Próxima etapa
Trocar o localStorage por Supabase (login, permissões por turma, dados compartilhados e backup), conforme `../PLANO_FASE0_rebanho_kids.md`.
