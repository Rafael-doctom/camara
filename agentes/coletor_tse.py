"""Eleição municipal (TSE): candidatos a prefeito e vereador, votos, quociente eleitoral e votos por
local de votação, para cada cidade configurada em cidades/.

Fonte: Portal de Dados Abertos do TSE (https://dadosabertos.tse.jus.br), arquivos em
https://cdn.tse.jus.br/estatistica/sead/odsele/. Os arquivos ficam em dados/_tse/brutos/ (fora do git).

Uso:
    python agentes/coletor_tse.py                 # 2024, todas as cidades
    python agentes/coletor_tse.py --ano 2024 --cidade tatui

Saídas por cidade:
- dados/<cidade>/processados/eleicao_<ano>.json
- site/<cidade>/eleicao.js   (window.ELEICAO, lido por site/eleicao.html)

Os arquivos do TSE trazem CPF, título de eleitor e data de nascimento dos candidatos: nenhum desses
campos é gravado. Do candidato ficam nome, nome de urna, número, partido, resultado, gênero, idade
na data da eleição, grau de instrução e ocupação declarada.
"""
import csv
import io
import json
import os
import sys
import time
import unicodedata
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRUTOS = os.path.join(RAIZ, "dados", "_tse", "brutos")
CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele"
USER_AGENT = "observatorio-politico-camaras/1.0 (pesquisa civica; dados publicos)"
AGENTE = "tse"
CARGOS = {"11": "prefeito", "12": "vice", "13": "vereador"}


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] [{AGENTE}] {msg}", flush=True)


def norm(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper().strip()


def arquivo(pasta, nome):
    """Zip do TSE em cache (baixa se não existir)."""
    os.makedirs(BRUTOS, exist_ok=True)
    caminho = os.path.join(BRUTOS, nome)
    if not os.path.exists(caminho):
        log(f"baixando {nome}...")
        req = urllib.request.Request(f"{CDN}/{pasta}/{nome}", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=3000) as r, open(caminho + ".tmp", "wb") as f:
            while bloco := r.read(1 << 20):
                f.write(bloco)
        os.replace(caminho + ".tmp", caminho)
    return caminho


def linhas(zip_caminho, membro_sufixo):
    """Linhas (dict) do CSV do zip cujo nome termina em `membro_sufixo` (latin-1, separador ;)."""
    z = zipfile.ZipFile(zip_caminho)
    membro = next(n for n in z.namelist() if n.endswith(membro_sufixo))
    with z.open(membro) as bruto:
        yield from csv.DictReader(io.TextIOWrapper(bruto, encoding="latin-1"), delimiter=";")


def inteiro(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def idade(nasc, eleicao):
    try:
        n = datetime.strptime(nasc, "%d/%m/%Y").date()
        e = datetime.strptime(eleicao, "%d/%m/%Y").date()
    except ValueError:
        return None
    return e.year - n.year - ((e.month, e.day) < (n.month, n.day))


def agremiacao(r):
    """Federação conta como um partido só na distribuição das vagas (desde 2022)."""
    return r["SG_FEDERACAO"] if r.get("NR_FEDERACAO", "-1") not in ("-1", "") else r["SG_PARTIDO"]


def main():
    args = sys.argv[1:]
    ano = int(args[args.index("--ano") + 1]) if "--ano" in args else 2024
    so = args[args.index("--cidade") + 1] if "--cidade" in args else None
    site_cfg = json.load(open(os.path.join(RAIZ, "cidades", "_site.json"), encoding="utf-8"))
    slugs = [so] if so else [s for s in site_cfg["ordem"] if os.path.exists(os.path.join(RAIZ, "cidades", f"{s}.json"))]
    cidades = {s: json.load(open(os.path.join(RAIZ, "cidades", f"{s}.json"), encoding="utf-8")) for s in slugs}
    por_nome = {norm(c["nome"]): s for s, c in cidades.items()}
    uf = "SP"

    # ---- candidatos
    cand, cod = defaultdict(dict), {}
    for r in linhas(arquivo("consulta_cand", f"consulta_cand_{ano}.zip"), f"_{uf}.csv"):
        s = por_nome.get(norm(r["NM_UE"]))
        if not s or r["CD_CARGO"] not in CARGOS or r["NR_TURNO"] != "1":
            continue
        cod[s] = r["SG_UE"]
        cand[s][r["SQ_CANDIDATO"]] = {
            "sq": r["SQ_CANDIDATO"], "cargo": CARGOS[r["CD_CARGO"]], "numero": r["NR_CANDIDATO"],
            "urna": r["NM_URNA_CANDIDATO"], "nome": r["NM_CANDIDATO"], "partido": r["SG_PARTIDO"],
            "agremiacao": agremiacao(r), "coligacao": r["DS_COMPOSICAO_COLIGACAO"] if r["TP_AGREMIACAO"] == "COLIGAÇÃO" else "",
            "situacao": r["DS_SIT_TOT_TURNO"].capitalize(), "genero": r["DS_GENERO"].capitalize(),
            "idade": idade(r["DT_NASCIMENTO"], r["DT_ELEICAO"]), "instrucao": r["DS_GRAU_INSTRUCAO"].capitalize(),
            "ocupacao": r["DS_OCUPACAO"].capitalize(), "votos": 0, "votos_urna": 0, "anulados": False, "zonas": {}}
    log("candidatos: " + ", ".join(f"{s} {len(c)}" for s, c in cand.items()))
    sem = [s for s in slugs if s not in cod]
    if sem:
        log(f"AVISO: sem candidatos no TSE para {sem}")

    # ---- votos por candidato e zona
    for r in linhas(arquivo("votacao_candidato_munzona", f"votacao_candidato_munzona_{ano}.zip"), f"_{uf}.csv"):
        s = por_nome.get(norm(r["NM_UE"]))
        if not s or r["NR_TURNO"] != "1" or r["SQ_CANDIDATO"] not in cand[s]:
            continue
        c = cand[s][r["SQ_CANDIDATO"]]
        v = inteiro(r["QT_VOTOS_NOMINAIS_VALIDOS"])
        c["votos"] += v
        # Votos dados na urna; quando a Justiça Eleitoral anula (ex.: chapa cassada), não entram nos válidos.
        c["votos_urna"] += inteiro(r["QT_VOTOS_NOMINAIS"])
        c["anulados"] = c["anulados"] or r["NM_TIPO_DESTINACAO_VOTOS"].startswith("Anulado")
        c["zonas"][r["NR_ZONA"]] = c["zonas"].get(r["NR_ZONA"], 0) + v
        if r["DS_SIT_TOT_TURNO"] and r["DS_SIT_TOT_TURNO"] != "#NULO":
            c["situacao"] = r["DS_SIT_TOT_TURNO"].capitalize()

    # ---- votos de legenda por agremiação (vereador)
    partidos = defaultdict(lambda: defaultdict(lambda: {"nominais": 0, "legenda": 0, "partidos": set()}))
    for r in linhas(arquivo("votacao_partido_munzona", f"votacao_partido_munzona_{ano}.zip"), f"_{uf}.csv"):
        s = por_nome.get(norm(r["NM_UE"]))
        if not s or r["NR_TURNO"] != "1" or r["CD_CARGO"] != "13":
            continue
        p = partidos[s][agremiacao(r)]
        p["nominais"] += inteiro(r["QT_VOTOS_NOMINAIS_VALIDOS"])
        p["legenda"] += inteiro(r["QT_TOTAL_VOTOS_LEG_VALIDOS"])
        p["partidos"].add(r["SG_PARTIDO"])

    # ---- comparecimento, brancos e nulos (se o arquivo já foi baixado)
    detalhe = defaultdict(lambda: defaultdict(Counter))
    det_zip = os.path.join(BRUTOS, f"detalhe_votacao_munzona_{ano}.zip")
    if os.path.exists(det_zip):
        for r in linhas(det_zip, f"_{uf}.csv"):
            s = por_nome.get(norm(r["NM_UE"]))
            if not s or r["NR_TURNO"] != "1" or r["CD_CARGO"] not in ("11", "13"):
                continue
            d = detalhe[s][CARGOS[r["CD_CARGO"]]]
            for campo, chave in (("QT_APTOS", "aptos"), ("QT_COMPARECIMENTO", "comparecimento"), ("QT_ABSTENCOES", "abstencoes"),
                                 ("QT_VOTOS_BRANCOS", "brancos"), ("QT_TOTAL_VOTOS_NULOS", "nulos"), ("QT_VOTOS_NULOS", "nulos_simples")):
                d[chave] += inteiro(r.get(campo))

    # ---- votos por local de votação (mapa), se o arquivo por seção já foi baixado
    locais, votos_local = defaultdict(dict), defaultdict(lambda: defaultdict(Counter))
    sec_zip = os.path.join(BRUTOS, f"votacao_secao_{ano}_{uf}.zip")
    loc_zip = os.path.join(BRUTOS, f"eleitorado_local_votacao_{ano}.zip")
    if os.path.exists(sec_zip) and os.path.exists(loc_zip):
        secao_local = {}
        for r in linhas(loc_zip, f"eleitorado_local_votacao_{ano}.csv"):
            if r["SG_UF"] != uf or r["NR_TURNO"] != "1":
                continue
            s = por_nome.get(norm(r["NM_MUNICIPIO"]))
            if not s:
                continue
            lid = f"{r['NR_ZONA']}-{r['NR_LOCAL_VOTACAO']}"
            secao_local[(s, r["NR_ZONA"], r["NR_SECAO"])] = lid
            l = locais[s].setdefault(lid, {"id": lid, "nome": r["NM_LOCAL_VOTACAO"].title(), "bairro": r["NM_BAIRRO"].title(),
                                           "endereco": r["DS_ENDERECO"].title(), "lat": float(r["NR_LATITUDE"] or 0),
                                           "lng": float(r["NR_LONGITUDE"] or 0), "eleitores": 0, "secoes": 0})
            l["eleitores"] += inteiro(r["QT_ELEITOR_SECAO"])
            l["secoes"] += 1
        # Dois candidatos podem ter o mesmo número (substituição): fica o que recebeu votos.
        numero_sq = defaultdict(dict)
        for s, cs in cand.items():
            for sq, c in sorted(cs.items(), key=lambda x: x[1]["votos_urna"]):
                numero_sq[s][(c["cargo"], c["numero"])] = sq
        for r in linhas(sec_zip, f"_{uf}.csv"):
            s = por_nome.get(norm(r["NM_MUNICIPIO"]))
            if not s or r["NR_TURNO"] != "1" or r["CD_CARGO"] not in ("11", "13"):
                continue
            lid = secao_local.get((s, r["NR_ZONA"], r["NR_SECAO"]))
            sq = numero_sq[s].get((CARGOS[r["CD_CARGO"]], r["NR_VOTAVEL"]))
            if lid and sq:
                votos_local[s][sq][lid] += inteiro(r["QT_VOTOS"])
        log("locais de votação: " + ", ".join(f"{s} {len(l)}" for s, l in locais.items()))

    for s in slugs:
        if s not in cod:
            continue
        cfg = cidades[s]
        cs = sorted(cand[s].values(), key=lambda c: -c["votos"])
        vereadores = [c for c in cs if c["cargo"] == "vereador"]
        validos = sum(p["nominais"] + p["legenda"] for p in partidos[s].values())
        cadeiras = cfg["cadeiras"]
        qe = int(validos / cadeiras + 0.5) if cadeiras else 0  # fração maior que meio arredonda para cima
        eleitos = Counter(c["agremiacao"] for c in vereadores if c["situacao"].startswith("Eleito"))
        tabela = sorted(({"agremiacao": a, "partidos": sorted(p["partidos"]), "nominais": p["nominais"], "legenda": p["legenda"],
                          "total": p["nominais"] + p["legenda"], "qp": (p["nominais"] + p["legenda"]) // qe if qe else 0,
                          "cadeiras": eleitos.get(a, 0)} for a, p in partidos[s].items()), key=lambda x: -x["total"])
        saida = {
            "ano": ano, "turno": 1, "cidade": cfg["nome"], "tse_municipio": cod[s],
            "gerado_em": datetime.now().astimezone().isoformat(timespec="minutes"),
            "fonte": "TSE, Portal de Dados Abertos",
            "comparecimento": {k: dict(v) for k, v in detalhe[s].items()},
            "prefeito": [c for c in cs if c["cargo"] == "prefeito"],
            "vice": [c for c in cs if c["cargo"] == "vice"],
            "vereador": vereadores,
            "quociente": {"cadeiras": cadeiras, "validos": validos, "qe": qe, "partidos": tabela},
            "locais": sorted(locais[s].values(), key=lambda l: l["nome"]),
            "votos_local": {sq: dict(v) for sq, v in votos_local[s].items()},
        }
        pasta = os.path.join(RAIZ, "dados", s, "processados")
        os.makedirs(pasta, exist_ok=True)
        with open(os.path.join(pasta, f"eleicao_{ano}.json"), "w", encoding="utf-8") as f:
            json.dump(saida, f, ensure_ascii=False, indent=1)
        js = os.path.join(RAIZ, "site", s, "eleicao.js")
        os.makedirs(os.path.dirname(js), exist_ok=True)
        with open(js + ".tmp", "w", encoding="utf-8") as f:
            f.write("window.ELEICAO=" + json.dumps(saida, ensure_ascii=False, separators=(",", ":")) + ";\n")
        os.replace(js + ".tmp", js)
        eleitos_n = sum(1 for c in vereadores if c["situacao"].startswith("Eleito"))
        log(f"{s}: {len(saida['prefeito'])} a prefeito, {len(vereadores)} a vereador ({eleitos_n} eleitos), "
            f"QE {qe}, {len(saida['locais'])} locais")
        if eleitos_n != cadeiras:
            log(f"AVISO: {s}: {eleitos_n} vereadores eleitos para {cadeiras} cadeiras na configuração")


if __name__ == "__main__":
    main()
