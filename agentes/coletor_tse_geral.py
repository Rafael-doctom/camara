"""Eleição geral (TSE): como cada cidade votou para presidente, governador, senador e deputados.

Fonte: Portal de Dados Abertos do TSE, arquivos votacao_candidato_munzona_<ano>.zip (presidente no
arquivo _BR, os demais cargos no arquivo da UF), consulta_cand_<ano>.zip e detalhe_votacao_munzona.

Uso:
    python agentes/coletor_tse_geral.py               # 2026, todas as cidades configuradas
    python agentes/coletor_tse_geral.py --ano 2022

Saídas por cidade: dados/<cidade>/processados/eleicao_<ano>.json e site/<cidade>/eleicao<ano>.js
(window.ELEICAO_GERAL, lido por site/eleicao-geral.html). Do candidato ficam nome de urna, número,
partido, votos na cidade, votos no estado (ou no país, para presidente) e resultado; sem CPF.
"""
import json
import os
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime

from coletor_tse import arquivo, inteiro, linhas, log, norm

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARGOS = {"1": "presidente", "3": "governador", "5": "senador", "6": "deputado_federal", "7": "deputado_estadual"}


def main():
    args = sys.argv[1:]
    ano = int(args[args.index("--ano") + 1]) if "--ano" in args else 2026
    uf = "SP"
    site_cfg = json.load(open(os.path.join(RAIZ, "cidades", "_site.json"), encoding="utf-8"))
    cidades = {s: json.load(open(os.path.join(RAIZ, "cidades", f"{s}.json"), encoding="utf-8"))
               for s in site_cfg["ordem"] if os.path.exists(os.path.join(RAIZ, "cidades", f"{s}.json"))}
    por_nome = {norm(c["nome"]): s for s, c in cidades.items()}

    # Situação final de cada candidato (eleito, suplente, 2º turno...).
    situacao = {}
    for sufixo in ("_BR.csv", f"_{uf}.csv"):
        for r in linhas(arquivo("consulta_cand", f"consulta_cand_{ano}.zip"), sufixo):
            if r["CD_CARGO"] in CARGOS:
                situacao[(r["SQ_CANDIDATO"], r["NR_TURNO"])] = r["DS_SIT_TOT_TURNO"].capitalize()

    cidade_votos = defaultdict(lambda: defaultdict(Counter))  # slug -> (cargo, turno) -> sq -> votos
    total = defaultdict(Counter)                              # (cargo, turno) -> sq -> votos (UF ou país)
    info = {}
    zip_votos = arquivo("votacao_candidato_munzona", f"votacao_candidato_munzona_{ano}.zip")
    for sufixo in ("_BR.csv", f"_{uf}.csv"):
        for r in linhas(zip_votos, sufixo):
            cargo = CARGOS.get(r["CD_CARGO"])
            if not cargo or (sufixo == "_BR.csv") != (cargo == "presidente"):
                continue
            k, sq, v = (cargo, r["NR_TURNO"]), r["SQ_CANDIDATO"], inteiro(r["QT_VOTOS_NOMINAIS_VALIDOS"])
            total[k][sq] += v
            info.setdefault(sq, {"sq": sq, "urna": r["NM_URNA_CANDIDATO"], "numero": r["NR_CANDIDATO"],
                                 "partido": r["SG_PARTIDO"]})
            s = por_nome.get(norm(r["NM_MUNICIPIO"])) if r["SG_UF"] == uf else None
            if s:
                cidade_votos[s][k][sq] += v
        log(f"votos {sufixo} lidos")

    comp = defaultdict(dict)
    det = arquivo("detalhe_votacao_munzona", f"detalhe_votacao_munzona_{ano}.zip")
    for sufixo in ("_BR.csv", f"_{uf}.csv"):
        for r in linhas(det, sufixo):
            s = por_nome.get(norm(r["NM_MUNICIPIO"])) if r["SG_UF"] == uf else None
            cargo = CARGOS.get(r["CD_CARGO"])
            if not s or not cargo:
                continue
            d = comp[s].setdefault(f"{cargo}-{r['NR_TURNO']}", Counter())
            for campo, chave in (("QT_APTOS", "aptos"), ("QT_COMPARECIMENTO", "comparecimento"),
                                 ("QT_VOTOS_BRANCOS", "brancos"), ("QT_TOTAL_VOTOS_NULOS", "nulos")):
                d[chave] += inteiro(r.get(campo))

    # ---- votos por local de votação (mapa), se os arquivos por seção e de locais já foram baixados
    locais, por_local = defaultdict(dict), defaultdict(lambda: defaultdict(Counter))  # slug -> chave -> local -> votos
    sec_zip = os.path.join(RAIZ, "dados", "_tse", "brutos", f"votacao_secao_{ano}_{uf}.zip")
    loc_zip = os.path.join(RAIZ, "dados", "_tse", "brutos", f"eleitorado_local_votacao_{ano}.zip")
    if os.path.exists(sec_zip) and os.path.exists(loc_zip):
        for r in linhas(loc_zip, f"_{uf}.csv"):
            s = por_nome.get(norm(r["NM_MUNICIPIO"]))
            if not s or r["NR_TURNO"] != "1":
                continue
            lid = f"{r['NR_ZONA']}-{r['NR_LOCAL_VOTACAO']}"
            l = locais[s].setdefault(lid, {"id": lid, "nome": r["NM_LOCAL_VOTACAO"].title(), "bairro": r["NM_BAIRRO"].title(),
                                           "lat": float((r["NR_LATITUDE"] or "0").replace(",", ".")),
                                           "lng": float((r["NR_LONGITUDE"] or "0").replace(",", ".")), "eleitores": 0})
            l["eleitores"] += inteiro(r["QT_ELEITOR_SECAO"])
        # Presidente fica num arquivo nacional à parte (votacao_secao_<ano>_BR.zip), se existir.
        sec_br = os.path.join(RAIZ, "dados", "_tse", "brutos", f"votacao_secao_{ano}_BR.zip")
        fontes = [(sec_zip, f"_{uf}.csv")] + ([(sec_br, "_BR.csv")] if os.path.exists(sec_br) else [])
        for zip_sec, sufixo in fontes:
            for r in linhas(zip_sec, sufixo):
                if r["SG_UF"] != uf:
                    continue
                s = por_nome.get(norm(r["NM_MUNICIPIO"]))
                cargo = CARGOS.get(r["CD_CARGO"])
                if not s or not cargo or r["SQ_CANDIDATO"] in ("", "-1"):
                    continue
                por_local[s][f"{cargo}-{r['NR_TURNO']}-{r['SQ_CANDIDATO']}"][f"{r['NR_ZONA']}-{r['NR_LOCAL_VOTACAO']}"] += inteiro(r["QT_VOTOS"])
        log("votos por local de votação lidos")

    for s, por_cargo in cidade_votos.items():
        disputas = []
        for (cargo, turno), votos in sorted(por_cargo.items(), key=lambda x: (list(CARGOS.values()).index(x[0][0]), x[0][1])):
            validos = sum(votos.values())
            cands = [{**info[sq], "votos": v, "pct": round(100 * v / validos, 2) if validos else 0,
                      "total": total[(cargo, turno)][sq], "situacao": situacao.get((sq, turno), situacao.get((sq, "1"), ""))}
                     for sq, v in votos.most_common() if v > 0]
            disputas.append({"cargo": cargo, "turno": int(turno), "validos": validos,
                             "abrangencia": "Brasil" if cargo == "presidente" else uf, "candidatos": cands,
                             "comparecimento": dict(comp[s].get(f"{cargo}-{turno}", {}))})
        saida = {"ano": ano, "cidade": cidades[s]["nome"], "fonte": "TSE, Portal de Dados Abertos",
                 "gerado_em": datetime.now().astimezone().isoformat(timespec="minutes"), "disputas": disputas}
        pasta = os.path.join(RAIZ, "dados", s, "processados")
        with open(os.path.join(pasta, f"eleicao_{ano}.json"), "w", encoding="utf-8") as f:
            json.dump(saida, f, ensure_ascii=False, indent=1)
        js = os.path.join(RAIZ, "site", s, f"eleicao{ano}.js")
        with open(js + ".tmp", "w", encoding="utf-8") as f:
            f.write("window.ELEICAO_GERAL=" + json.dumps(saida, ensure_ascii=False, separators=(",", ":")) + ";\n")
        os.replace(js + ".tmp", js)
        if locais.get(s):
            mapa = {"locais": sorted(locais[s].values(), key=lambda l: l["nome"]),
                    "votos": {k: dict(v) for k, v in por_local[s].items()}}
            js = os.path.join(RAIZ, "site", s, f"eleicao{ano}_mapa.js")
            with open(js + ".tmp", "w", encoding="utf-8") as f:
                f.write("window.ELEICAO_MAPA=" + json.dumps(mapa, ensure_ascii=False, separators=(",", ":")) + ";\n")
            os.replace(js + ".tmp", js)
            soma = sum(sum(v.values()) for k, v in por_local[s].items() if k.startswith("presidente-2-"))
            log(f"{s}: mapa com {len(locais[s])} locais; votos de presidente 2º turno nos locais: {soma}")
        pres = next((d for d in disputas if d["cargo"] == "presidente" and d["turno"] == max(x["turno"] for x in disputas if x["cargo"] == "presidente")), None)
        log(f"{s}: {len(disputas)} disputas" + (f"; presidente {pres['turno']}º turno: " + ", ".join(
            f"{c['urna']} {c['pct']}%" for c in pres["candidatos"][:2]) if pres else ""))


if __name__ == "__main__":
    main()
