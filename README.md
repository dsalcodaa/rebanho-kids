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

## Organograma e abas
- Ensino: Pastores → Coordenadores gerais → Coordenadores de rebanho → Professores → Crianças.
- Setores: Pastores → Líderes gerais → Líderes de seção → Membros da equipe.
- Turmas 1 a 4 (A, B, C); seções 08:00–10:00, 10:30–12:30, 15:30–17:30, 18:30–20:30.
- Cada seção tem os rebanhos Azul, Verde, Amarelo e Vermelho (o 2A Verde da planilha está na 2ª seção).
- Setores: História Bíblica, Revisão e Retenção, Momento Alegria, Bíblia Intelecto (novos setores na aba Equipe).
- Painel: frequência por mês, aniversariantes, crianças que precisam de atenção (Kids < 75% ou 3 faltas seguidas), ranking de versículos.
- **Cronograma** (pastores): datas do ano, tema, versículo e pontos, meditação, desafios e premiação.
  Tudo aparece direto nos lançamentos dos professores; data "sem programação" sai dos lançamentos e dos desafios.
- **Equipe**: organograma e cadastro; cada nível cadastra quem está abaixo dele no mesmo ramo.
- **Rebanhos**: turma, seção, coordenador e professores.
- **Lançamentos**: presença, culto, versículo e meditação por rebanho.
- **Login** por perfil (sem senha nesta versão de teste; senha e segurança reais vêm com o Supabase).
- **Panorama**: pastor (coordenadores gerais, líderes gerais, coordenadoras de rebanho, líderes de seção),
  coordenador geral (coordenadoras, rebanhos e crianças), líder geral (líderes de seção e equipe).
- Cadastros: coordenador geral → coordenadoras de rebanho; professor → professores (entram no mesmo rebanho) e crianças;
  líder geral → líderes de seção e membros.
- Cadastro de alunos: nome, aniversário (idade calculada), responsável, seção, cor do rebanho e turma.
- "Pontos" agora se chamam "versículos decorados".

## Comandos
```
python -I tools/importar_planilha.py "../CONTROLE KIDS 2A - REBANHO VERDE.xlsx"   # regenera data/dados.json
node --test                                                                       # testes das regras
python -m http.server 8765                                                        # abre em http://localhost:8765
```

## Próxima etapa
Trocar o localStorage por Supabase (login, permissões por turma, dados compartilhados e backup), conforme `../PLANO_FASE0_rebanho_kids.md`.
