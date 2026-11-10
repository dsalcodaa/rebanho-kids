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
- Setores: Pastores → Líderes gerais → Líderes de setor → Membros de equipe.
  Errata: Membro de equipe voltou, mas sem login (não edita nada); líder geral e líder de setor cadastram membros.
- Turmas 1 a 4 (A, B, C); seções 08:00–10:00, 10:30–12:30, 15:30–17:30, 18:30–20:30.
- Em cada seção, cada turma (1A a 4C) tem os rebanhos Azul, Verde, Amarelo e Vermelho: 192 rebanhos (o 2A Verde da planilha está na 2ª seção).
- Setores: História Bíblica, Revisão e Retenção, Momento Alegria, Bíblia Intelecto, Professores de Rebanho e Recepção (novos setores na aba Equipe).
- Painel: seletores Kids/Infantil, seção e rebanho no topo, logo seguidos dos cards; gráficos por mês de frequência
  (Kids e culto) e de entregas (meditações completas e versículos decorados do máximo); aniversariantes, crianças que precisam de atenção (Kids < 75% ou 3 faltas seguidas), ranking de versículos.
- **Cronograma** (pastores): datas do ano, tema, versículo e pontos, meditação, desafios e premiação.
  Uma coluna por sala (História: tema; Revisão e Momento Alegria: atividade; Bíblia Intelecto: sala normal ou
  sala crânio), preenchida pelos líderes em "Meu setor", com filtro por seção. Pastor e coordenador geral
  veem o panorama do dia.
  Tudo aparece direto nos lançamentos dos professores; data "sem programação" sai dos lançamentos e dos desafios.
- **Equipes e Setores**: organograma separado (Ensino: coordenadoras e professores; Setores: líderes gerais),
  cards por setor, fluxo visual por seção (Recepção → setores, com os professores de rebanho conduzindo as crianças),
  lista de pessoas com botão Editar e cadastro. Coordenadores e professores não veem os setores; líderes veem só o próprio setor.
- **Onde atua**: cada pessoa pode ter várias linhas de seção/setor (ex.: professor em duas seções, ou em outro setor numa seção).
- Coordenadores gerais e líderes gerais já vêm subordinados ao pastor.
- **Rebanhos**: escolha a seção; cards por turma com as 4 cores, professor, coordenadora e crianças ativas.
- **Lançamentos**: só professores de rebanho (presença, culto, versículo, meditação e notas).
- **Recepção** (perfil próprio no login; quem está no setor Recepção): cadastra crianças e marca presença/faltas dos rebanhos da sua seção.
  Só a Recepção (e o administrador) cadastra e edita crianças.
- **Meu setor** (líderes): programação do setor (data do cronograma, seção e tema/atividade/sala) e equipe.
  Líderes não têm a aba Cronograma.
- Login: "Pastor (acesso total)" é o antigo Administrador.
- **Bíblia Intelecto** (perfil próprio no login; quem está no setor Bíblia Intelecto): 13 livros; cada exercício tem 8 questões.
  Gabarito por questão: ✓ acerto de primeira, ✗ errou, ↺ errou e corrigiu (bola vermelha com risco), · em branco.
  Calcula acertos, erros, corrigidos, pendentes, taxa de acerto de primeira, nota 0–10, questões que a criança mais erra
  e um parecer automático por aluno (o setor pode acrescentar uma observação). Resumo também na página da criança.
- **Provas**: lançadas pelo Bíblia Intelecto (3 por ano), ranking por seção e média por rebanho. Professores só consultam.
- Gabaritos iniciais transcritos das fotos de 09/11/2026 em `tools/gabaritos_fotos.json` (o importador os inclui em `dados.json`).
- **Cadastro inicial**: link no login para novos membros; a liderança define função, setor e subordinação na aba Equipe.
- **Login** por perfil (sem senha nesta versão de teste; senha e segurança reais vêm com o Supabase).
- Aba Panorama removida. O pastor tem em Equipes e Setores o dashboard da equipe (total por função e tabela por setor
  com funções e seções). Coordenador geral vê só rebanhos e crianças das coordenadoras subordinadas.
- Infantil: rebanho com `programa: 'infantil'` (sem o campo = Kids). Setores, atividades e alunos do Infantil serão cadastrados depois.
- Cadastros: coordenador geral → coordenadoras de rebanho (seção, turma e cor opcionais); professor → professores
  (seção, turma e cor obrigatórias: o nome aparece direto na aba Rebanhos);
  líder geral → líderes de setor.
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
