"""Converte a planilha CONTROLE KIDS 2A em data/dados.json.

Uso: python -I tools/importar_planilha.py "<caminho da planilha.xlsx>"
Importa só os registros brutos; totais e TOPs são recalculados no site.
"""
import json
import sys
from pathlib import Path

import openpyxl

ANO = 2026  # datas da planilha caem no domingo em 2026
VAZIO = {None, "-", "--"}


def main(caminho):
    wb = openpyxl.load_workbook(caminho, data_only=True)
    resumo, pres, vers, med, culto = wb.worksheets

    # Cabeçalho "22/02 - 1" -> 2026-02-22; colunas C em diante
    encontros = []
    for col in range(3, pres.max_column + 1):
        cab = pres.cell(1, col).value
        if not cab:
            continue
        dia, mes = str(cab).split("-")[0].strip().split("/")
        encontros.append({"id": len(encontros) + 1, "data": f"{ANO}-{int(mes):02d}-{int(dia):02d}", "col": col})

    criancas, registros, alertas = [], {}, []
    for lin in range(2, resumo.max_row + 1):
        nome = resumo.cell(lin, 2).value
        if not nome:
            continue
        cid = f"c{len(criancas) + 1}"
        nasc = resumo.cell(lin, 3).value
        regs = {}
        for e in encontros:
            c = e["col"]
            r = {
                "k": pres.cell(lin, c).value,
                "c": culto.cell(lin, c).value,
                "v": vers.cell(lin, c).value,
                "m": med.cell(lin, c).value,
            }
            regs[e["id"]] = r

        # Entrada = primeiro encontro com versículo, meditação ou culto lançado.
        # O encontro 1 tem "-" para todos, então quem aparece no 2 entrou no 1.
        inicio = min(
            (e for e, r in regs.items() if any(r[x] not in VAZIO for x in "vmc")),
            default=1,
        )
        entrada = 1 if inicio <= 2 else inicio

        limpo = {}
        ignoradas = sum(1 for e, r in regs.items() if e < entrada and r["k"] == "F")
        if ignoradas:
            alertas.append(f"{nome}: {ignoradas} faltas antes da entrada (encontro {entrada}) ignoradas")
        for e, r in regs.items():
            if e < entrada:
                continue
            d = {}
            if r["k"] in ("P", "A", "F", "FJ"):
                d["k"] = r["k"]
            if r["c"] in ("P", "F", "FJ"):
                d["c"] = r["c"]
            if isinstance(r["v"], (int, float)):
                d["v"] = r["v"]
            if r["m"] in ("OK", "MI", "MI-OK", "X"):
                d["m"] = r["m"]
            if d:
                limpo[str(e)] = d

        criancas.append({
            "id": cid,
            "nome": nome.strip(),
            "nascimento": nasc.strftime("%Y-%m-%d") if nasc else None,
            "responsavel": resumo.cell(lin, 4).value,
            "entrada": next(x["data"] for x in encontros if x["id"] == entrada),
            "ativa": True,
            "rebanhoId": "r1",
            "turma": "2A",
        })
        registros[cid] = limpo
        if not nasc:
            alertas.append(f"{nome}: sem data de nascimento")

    # Pontuação máxima de versículos por encontro = valor positivo mais comum (3 ou 9)
    vmax = {}
    for e in encontros:
        vals = [r[str(e["id"])]["v"] for r in registros.values() if r.get(str(e["id"]), {}).get("v", 0) > 0]
        if vals:
            vmax[str(e["id"])] = max(set(vals), key=vals.count)
            for cid, r in registros.items():
                v = r.get(str(e["id"]), {}).get("v")
                if v is not None and v > vmax[str(e["id"])]:
                    nome = next(c["nome"] for c in criancas if c["id"] == cid)
                    alertas.append(f"{nome}: {v} versículos decorados em {e['data']} (máximo {vmax[str(e['id'])]})")

    dados = {
        "versao": 7,
        "ministerio": "Nova Kids e Infantil",
        "secoes": [
            {"id": "s1", "nome": "1ª seção", "horario": "08:00 às 10:00"},
            {"id": "s2", "nome": "2ª seção", "horario": "10:30 às 12:30"},
            {"id": "s3", "nome": "3ª seção", "horario": "15:30 às 17:30"},
            {"id": "s4", "nome": "4ª seção", "horario": "18:30 às 20:30"},
        ],
        "pessoas": [
            {"id": "pe1", "nome": "Pedro Henrique Andrade e Paiva", "nascimento": "2001-03-20",
             "papel": "professor", "superiorId": None, "setor": "Professores de Rebanho",
             "secaoId": "s2", "turma": "2A", "cor": "verde"},
        ],
        "setores": [
            {"id": "st1", "nome": "História Bíblica"},
            {"id": "st2", "nome": "Revisão e Retenção"},
            {"id": "st3", "nome": "Momento Alegria"},
            {"id": "st4", "nome": "Bíblia Intelecto"},
            {"id": "st5", "nome": "Professores de Rebanho"},
            {"id": "st6", "nome": "Recepção"},
        ],
        # Em cada seção, cada turma (1A a 4C) tem os rebanhos Azul, Verde, Amarelo e Vermelho.
        # O 2A Verde da planilha é o da 2ª seção (id r1, mantido por compatibilidade).
        "rebanhos": [
            {"id": "r1", "nome": "Rebanho Verde", "cor": "verde", "turma": "2A", "secaoId": "s2",
             "coordenadorId": None, "professores": ["pe1"]},
        ] + [
            {"id": f"r-{sec}-{turma}-{cor}", "nome": f"Rebanho {cor.capitalize()}", "cor": cor, "turma": turma,
             "secaoId": sec, "coordenadorId": None, "professores": []}
            for sec in ("s1", "s2", "s3", "s4")
            for turma in [f"{n}{l}" for n in range(1, 5) for l in "ABC"]
            for cor in ("azul", "verde", "amarelo", "vermelho")
            if (sec, turma, cor) != ("s2", "2A", "verde")
        ],
                "criancas": criancas,
        "encontros": [{"id": e["id"], "data": e["data"], "tipo": "aula"} for e in encontros],
        "versiculoMax": vmax,
        "registros": registros,
        "desafios": [
            {"id": "d1", "nome": "TOP 1", "inicio": 3, "semanas": 3, "fj": 1, "versiculosMin": 9, "meditacao": True},
            {"id": "d2", "nome": "PALAVRA FEST", "inicio": 8, "semanas": 3, "fj": 1, "versiculosMin": 27, "meditacao": True},
            {"id": "d3", "nome": "TOP 2", "inicio": 11, "semanas": 8, "fj": 2, "versiculosMin": 24, "meditacao": True},
            # TOP 3: 06/09 a 18/10 (7 encontros); 2 FJ e 3 pontos de versículo por semana a confirmar
            {"id": "d4", "nome": "TOP 3", "inicio": 26, "semanas": 7, "fj": 2, "versiculosMin": 21, "meditacao": True},
        ],
        "topsPremiacao": 3,
        "provas": [{"id": "p1", "nome": "1ª prova"}, {"id": "p2", "nome": "2ª prova"}, {"id": "p3", "nome": "3ª prova"}],
        "notaMaxima": 10,
        "notas": {},
        "programacoes": {},
        "alertas": alertas,
    }
    destino = Path(__file__).resolve().parent.parent / "data" / "dados.json"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(criancas)} crianças, {len(encontros)} encontros, {len(alertas)} alertas -> {destino}")
    for a in alertas:
        print(" -", a)


if __name__ == "__main__":
    main(sys.argv[1])
