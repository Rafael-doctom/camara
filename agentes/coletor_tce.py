"""Gastos da Câmara Municipal e da Prefeitura (e demais órgãos municipais) pela API do TCE-SP.

Fonte: Tribunal de Contas do Estado de São Paulo, transparência municipal
(https://transparencia.tce.sp.gov.br/api/json/despesas/{municipio}/{ano}/{mes}).
Cada linha é um evento de uma despesa (empenhado, liquidado, pago, anulação); aqui conta o
"Valor Pago", que é o dinheiro que de fato saiu.

Uso:
    python agentes/coletor_tce.py                       # todas as cidades, ano atual e anterior
    python agentes/coletor_tce.py --cidade tatui --ano 2025

Saídas por cidade: dados/<cidade>/processados/gastos.json e site/<cidade>/gastos.js (window.GASTOS,
lido por site/gastos.html). Cache dos meses fechados em dados/<cidade>/brutos/tce/ (fora do git).
Fornecedor pessoa física aparece pelo nome; o número do CPF não é gravado.
"""
import json
import os
import re
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://transparencia.tce.sp.gov.br/api/json"
USER_AGENT = "observatorio-politico-camaras/1.0 (pesquisa civica; dados publicos)"
AGENTE = "tce"


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] [{AGENTE}] {msg}", flush=True)


def baixar(url, tentativas=5):
    erro = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            erro = e
            time.sleep(3 + 3 * i)
    raise erro


def mes_despesas(slug, ano, mes, hoje):
    """Linhas do mês. Meses fechados (anteriores ao mês corrente) ficam em cache."""
    pasta = os.path.join(RAIZ, "dados", slug, "brutos", "tce")
    os.makedirs(pasta, exist_ok=True)
    arq = os.path.join(pasta, f"despesas_{ano}_{mes:02d}.json")
    fechado = (ano, mes) < (hoje.year, hoje.month)
    if fechado and os.path.exists(arq):
        return json.load(open(arq, encoding="utf-8"))
    time.sleep(1.0)
    linhas = baixar(f"{API}/despesas/{slug}/{ano}/{mes}")
    if fechado and linhas:
        with open(arq + ".tmp", "w", encoding="utf-8") as f:
            json.dump(linhas, f, ensure_ascii=False)
        os.replace(arq + ".tmp", arq)
    return linhas


def valor(v):
    return float(v.replace(".", "").replace(",", ".")) if v else 0.0


def tipo_orgao(nome):
    n = nome.upper()
    if "CÂMARA" in n or "CAMARA" in n:
        return "camara"
    if "PREFEITURA" in n:
        return "prefeitura"
    return "outros"


def main():
    args = sys.argv[1:]
    hoje = date.today()
    anos = [int(args[args.index("--ano") + 1])] if "--ano" in args else [hoje.year - 1, hoje.year]
    site_cfg = json.load(open(os.path.join(RAIZ, "cidades", "_site.json"), encoding="utf-8"))
    slugs = [args[args.index("--cidade") + 1]] if "--cidade" in args else [
        s for s in site_cfg["ordem"] if os.path.exists(os.path.join(RAIZ, "cidades", f"{s}.json"))]
    validos = {m["municipio"] for m in baixar(f"{API}/municipios")}

    for slug in slugs:
        if slug not in validos:
            log(f"AVISO: {slug} não existe na API do TCE-SP")
            continue
        cfg = json.load(open(os.path.join(RAIZ, "cidades", f"{slug}.json"), encoding="utf-8"))
        orgaos = defaultdict(lambda: {"nome": "", "anos": defaultdict(lambda: {"total": 0.0, "meses": Counter(),
                                                                                "fornecedores": Counter(), "pagamentos": 0})})
        meses_lidos = []
        for ano in anos:
            for mes in range(1, 13):
                if (ano, mes) > (hoje.year, hoje.month):
                    break
                linhas = mes_despesas(slug, ano, mes, hoje)
                if not linhas:
                    continue
                meses_lidos.append(f"{ano}-{mes:02d}")
                for l in linhas:
                    if l["evento"] != "Valor Pago":
                        continue
                    t = tipo_orgao(l["orgao"])
                    o = orgaos[t if t != "outros" else l["orgao"]]
                    o["nome"] = l["orgao"].title()
                    a = o["anos"][str(ano)]
                    v = valor(l["vl_despesa"])
                    a["total"] += v
                    a["meses"][mes] += v
                    a["pagamentos"] += 1
                    pf = "PESSOA FÍSICA" in l["id_fornecedor"].upper()
                    nome = re.sub(r"\s*\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", "", l["nm_fornecedor"]).strip().title()
                    a["fornecedores"][nome + (" (pessoa física)" if pf else "")] += v
            log(f"{slug} {ano}: lido")
        saida = {"cidade": cfg["nome"], "fonte": "TCE-SP, transparência municipal", "anos": [str(a) for a in anos],
                 "gerado_em": datetime.now().astimezone().isoformat(timespec="minutes"),
                 "meses_lidos": meses_lidos, "orgaos": {}}
        for chave, o in orgaos.items():
            saida["orgaos"][chave] = {"nome": o["nome"], "anos": {
                a: {"total": round(x["total"], 2), "pagamentos": x["pagamentos"],
                    "meses": {str(m): round(v, 2) for m, v in sorted(x["meses"].items())},
                    "fornecedores": [[n, round(v, 2)] for n, v in x["fornecedores"].most_common(60)]}
                for a, x in o["anos"].items()}}
        pasta = os.path.join(RAIZ, "dados", slug, "processados")
        with open(os.path.join(pasta, "gastos.json"), "w", encoding="utf-8") as f:
            json.dump(saida, f, ensure_ascii=False, indent=1)
        js = os.path.join(RAIZ, "site", slug, "gastos.js")
        os.makedirs(os.path.dirname(js), exist_ok=True)
        with open(js + ".tmp", "w", encoding="utf-8") as f:
            f.write("window.GASTOS=" + json.dumps(saida, ensure_ascii=False, separators=(",", ":")) + ";\n")
        os.replace(js + ".tmp", js)
        cam = saida["orgaos"].get("camara", {}).get("anos", {})
        log(f"{slug}: {len(meses_lidos)} meses; Câmara pagou " +
            ", ".join(f"{a}: R$ {x['total']:,.0f}" for a, x in cam.items()))


if __name__ == "__main__":
    main()
