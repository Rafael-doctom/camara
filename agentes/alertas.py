"""Alertas: o que mudou na última semana em cada cidade, a partir dos dados já coletados.

- votações dos últimos 7 dias (destaque para as divididas)
- proposituras protocoladas nos últimos 7 dias (projetos de lei e moções; requerimentos só contados)
- gastos fora do padrão no último mês fechado do TCE-SP: órgão que pagou mais de 50% acima da média
  dos 6 meses anteriores, e fornecedor que recebeu mais de R$ 50 mil e mais de 3 vezes a própria média
- casos documentados com data nos últimos 30 dias

Uso: python agentes/alertas.py   (o orquestrador roda ao fim de cada atualização)
Saída: site/alertas.js (window.ALERTAS), lido por site/alertas.html.
"""
import json
import os
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIAS = 7


def ler(caminho, padrao=None):
    return json.load(open(caminho, encoding="utf-8")) if os.path.exists(caminho) else padrao


def ler_js(caminho, chave):
    if not os.path.exists(caminho):
        return []
    m = re.search(rf"window\.DADOS\.{chave}=(.*?);\n", open(caminho, encoding="utf-8").read())
    return json.loads(m.group(1)) if m else []


def valor(v):
    return float(v.replace(".", "").replace(",", ".")) if v else 0.0


def gastos_anormais(slug, hoje):
    """Compara o último mês fechado em cache com a média dos 6 anteriores."""
    pasta = os.path.join(RAIZ, "dados", slug, "brutos", "tce")
    meses = sorted(f[9:16] for f in os.listdir(pasta) if f.startswith("despesas_")) if os.path.isdir(pasta) else []
    if len(meses) < 4:
        return []
    por_mes = {}
    for m in meses[-7:]:
        orgao, forn = Counter(), defaultdict(Counter)
        for l in ler(os.path.join(pasta, f"despesas_{m}.json"), []):
            if l["evento"] != "Valor Pago":
                continue
            v = valor(l["vl_despesa"])
            orgao[l["orgao"].title()] += v
            forn[l["orgao"].title()][l["nm_fornecedor"].strip().title()] += v
        por_mes[m] = (orgao, forn)
    ultimo, anteriores = meses[-1], meses[-7:-1]
    alertas = []
    org_u, forn_u = por_mes[ultimo]
    for org, v in org_u.items():
        media = sum(por_mes[m][0][org] for m in anteriores) / len(anteriores)
        if media > 0 and v > 1.5 * media and v - media > 100_000:
            alertas.append({"tipo": "gasto", "cidade": slug, "data": ultimo + "-01",
                            "titulo": f"{org} pagou {v / media:.1f}x a média mensal em {ultimo[5:]}/{ultimo[:4]}",
                            "detalhe": f"R$ {v:,.0f} contra média de R$ {media:,.0f} nos 6 meses anteriores.".replace(",", "."),
                            "link": f"gastos.html#{slug}"})
        for f, vf in forn_u[org].most_common(40):
            media_f = sum(por_mes[m][1][org][f] for m in anteriores) / len(anteriores)
            if vf > 50_000 and vf > 3 * max(media_f, 1):
                alertas.append({"tipo": "gasto", "cidade": slug, "data": ultimo + "-01",
                                "titulo": f"{f} recebeu R$ {vf:,.0f} de {org}".replace(",", "."),
                                "detalhe": (f"Média de R$ {media_f:,.0f} por mês nos 6 meses anteriores." if media_f else
                                            "Não tinha recebido nada nos 6 meses anteriores.").replace(",", "."),
                                "link": f"gastos.html#{slug}"})
    return alertas


def main():
    hoje = date.today()
    desde = (hoje - timedelta(days=DIAS)).isoformat()
    desde_casos = (hoje - timedelta(days=30)).isoformat()
    site_cfg = ler(os.path.join(RAIZ, "cidades", "_site.json"), {})
    itens, resumo = [], {}
    for slug in site_cfg.get("ordem", []):
        cfg = ler(os.path.join(RAIZ, "cidades", f"{slug}.json"))
        if not cfg:
            continue
        r = {"cidade": cfg["nome"], "votacoes": 0, "divididas": 0, "proposituras": 0, "gastos": 0, "casos": 0}
        for v in ler_js(os.path.join(RAIZ, "site", slug, "votacoes.js"), "votacoes"):
            if v["d"] >= desde:
                r["votacoes"] += 1
                if v["div"]:
                    r["divididas"] += 1
                    n = v["n"]
                    itens.append({"tipo": "votacao", "cidade": slug, "data": v["d"],
                                  "titulo": f"{v['m']}: {v['r'].lower()} por {n.get('favor', 0)} a {n.get('contra', 0)}",
                                  "detalhe": v["a"][:220], "link": f"{slug}/index.html#votacao/{v['id']}"})
        for p in ler(os.path.join(RAIZ, "dados", slug, "processados", "proposituras.json"), []):
            if p["data"] >= desde:
                r["proposituras"] += 1
                if p["tipo"] in ("Projeto de Lei", "Projeto de Lei Complementar", "Projeto de Emenda à Lei Orgânica", "Moção"):
                    itens.append({"tipo": "propositura", "cidade": slug, "data": p["data"],
                                  "titulo": f"{p['tipo']} nº {p['numero']}/{p['ano']} · {', '.join(p['autores'][:2])}",
                                  "detalhe": p["ementa"][:220],
                                  "link": f"{slug}/index.html#proposituras/autor={p['autores'][0] if p['autores'] else ''}"})
        for c in ler(os.path.join(RAIZ, "casos", slug, "casos.json"), []):
            if c.get("data", "") >= desde_casos:
                r["casos"] += 1
                itens.append({"tipo": "caso", "cidade": slug, "data": c["data"], "titulo": c["titulo"],
                              "detalhe": c.get("curto", "")[:220], "link": f"{slug}/index.html#caso/{c['id']}"})
        g = gastos_anormais(slug, hoje)
        r["gastos"] = len(g)
        itens += g
        resumo[slug] = r
    itens.sort(key=lambda x: x["data"], reverse=True)
    saida = {"gerado_em": datetime.now().astimezone().isoformat(timespec="minutes"), "desde": desde,
             "resumo": resumo, "itens": itens[:400]}
    with open(os.path.join(RAIZ, "site", "alertas.js.tmp"), "w", encoding="utf-8") as f:
        f.write("window.ALERTAS=" + json.dumps(saida, ensure_ascii=False, separators=(",", ":")) + ";\n")
    os.replace(os.path.join(RAIZ, "site", "alertas.js.tmp"), os.path.join(RAIZ, "site", "alertas.js"))
    print(f"[alertas] {len(itens)} itens desde {desde}: " + ", ".join(
        f"{s} {x['votacoes']}v/{x['proposituras']}p/{x['gastos']}g/{x['casos']}c" for s, x in resumo.items()))


if __name__ == "__main__":
    main()
