"""Emendas parlamentares federais destinadas a cada cidade e quem recebeu o dinheiro.

Fonte: Portal da Transparência (CGU), arquivo aberto EmendasParlamentares.zip
(https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares), sem chave de API.
- EmendasParlamentares.csv: cada emenda com a localidade de aplicação, autor, área e valores.
- EmendasParlamentares_PorFavorecido.csv: pagamentos a cada favorecido (prefeitura, fundo, entidade).

Uso: python agentes/coletor_emendas.py
Saídas: dados/<cidade>/processados/emendas.json e site/<cidade>/emendas.js (window.EMENDAS).
"""
import csv
import io
import json
import os
import time
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime

from coletor_tse import norm

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/emendas-parlamentares/EmendasParlamentares.zip"
ARQ = os.path.join(RAIZ, "dados", "_federal", "brutos", "emendas.zip")
USER_AGENT = "observatorio-politico-camaras/1.0 (pesquisa civica; dados publicos)"


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] [emendas] {msg}", flush=True)


def valor(v):
    return float(v.replace(".", "").replace(",", ".")) if v and v[0].isdigit() else 0.0


def main():
    if not os.path.exists(ARQ) or time.time() - os.path.getmtime(ARQ) > 86400 * 7:
        log("baixando EmendasParlamentares.zip...")
        os.makedirs(os.path.dirname(ARQ), exist_ok=True)
        req = urllib.request.Request(URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=900) as r, open(ARQ + ".tmp", "wb") as f:
            f.write(r.read())
        os.replace(ARQ + ".tmp", ARQ)
    site_cfg = json.load(open(os.path.join(RAIZ, "cidades", "_site.json"), encoding="utf-8"))
    cidades = {s: json.load(open(os.path.join(RAIZ, "cidades", f"{s}.json"), encoding="utf-8"))
               for s in site_cfg["ordem"] if os.path.exists(os.path.join(RAIZ, "cidades", f"{s}.json"))}
    por_nome = {norm(c["nome"]): s for s, c in cidades.items()}
    z = zipfile.ZipFile(ARQ)
    ler = lambda nome: csv.DictReader(io.TextIOWrapper(z.open(nome), encoding="latin-1"), delimiter=";")

    emendas = defaultdict(list)
    for r in ler("EmendasParlamentares.csv"):
        s = por_nome.get(norm(r["Município"])) if r["UF"] == "SÃO PAULO" else None
        if not s:
            continue
        emendas[s].append({
            "codigo": r["Código da Emenda"], "ano": r["Ano da Emenda"], "tipo": r["Tipo de Emenda"],
            "autor": r["Nome do Autor da Emenda"].title(), "numero": r["Número da emenda"],
            "funcao": r["Nome Função"], "acao": r["Nome Ação"].capitalize(),
            "empenhado": valor(r["Valor Empenhado"]), "pago": valor(r["Valor Pago"]) + valor(r["Valor Restos A Pagar Pagos"])})
    log("emendas por localidade lidas")

    autores = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))  # cidade -> autor -> ano -> valor
    recebido = defaultdict(lambda: defaultdict(lambda: {"valor": 0.0, "autores": defaultdict(float), "tipo": "", "anos": set()}))
    for r in ler("EmendasParlamentares_PorFavorecido.csv"):
        s = por_nome.get(norm(r["Município Favorecido"])) if r["UF Favorecido"] == "SP" else None
        if not s:
            continue
        pf = r["Tipo Favorecido"].lower().startswith("pessoa f")
        nome = r["Favorecido"].title() + (" (pessoa física)" if pf else "")
        f = recebido[s][nome]
        v = valor(r["Valor Recebido"])
        f["valor"] += v
        f["autores"][r["Nome do Autor da Emenda"].title()] += v
        f["tipo"] = r["Natureza Jurídica"]
        f["anos"].add(r["Ano/Mês"][:4])
        autores[s][r["Nome do Autor da Emenda"].title()][r["Ano/Mês"][:4]] += v
    log("pagamentos por favorecido lidos")

    for s, cfg in cidades.items():
        lista = sorted(emendas.get(s, []), key=lambda e: (e["ano"], e["pago"]), reverse=True)
        favs = sorted(({"nome": n, "valor": round(f["valor"], 2), "natureza": f["tipo"],
                        "anos": sorted(f["anos"]), "autores": sorted(([a, round(v, 2)] for a, v in f["autores"].items()),
                                                                     key=lambda x: -x[1])[:6]}
                       for n, f in recebido.get(s, {}).items()), key=lambda x: -x["valor"])
        for e in lista:
            e["empenhado"], e["pago"] = round(e["empenhado"], 2), round(e["pago"], 2)
        saida = {"cidade": cfg["nome"], "fonte": "Portal da Transparência (CGU)",
                 "gerado_em": datetime.now().astimezone().isoformat(timespec="minutes"),
                 "emendas": lista, "favorecidos": favs[:80],
                 # Quanto chegou à cidade por autor (pagamentos a favorecidos sediados nela), por ano.
                 "autores": sorted(({"autor": a, "total": round(sum(an.values()), 2),
                                     "anos": {k: round(v, 2) for k, v in sorted(an.items())}}
                                    for a, an in autores.get(s, {}).items()), key=lambda x: -x["total"])}
        with open(os.path.join(RAIZ, "dados", s, "processados", "emendas.json"), "w", encoding="utf-8") as f:
            json.dump(saida, f, ensure_ascii=False, indent=1)
        js = os.path.join(RAIZ, "site", s, "emendas.js")
        with open(js + ".tmp", "w", encoding="utf-8") as f:
            f.write("window.EMENDAS=" + json.dumps(saida, ensure_ascii=False, separators=(",", ":")) + ";\n")
        os.replace(js + ".tmp", js)
        log(f"{s}: {len(lista)} emendas (pago R$ {sum(e['pago'] for e in lista):,.0f}), {len(favs)} favorecidos")


if __name__ == "__main__":
    main()
