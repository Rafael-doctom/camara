"""Alertas: o que mudou na última semana em cada cidade, a partir dos dados já coletados.

- votações dos últimos 7 dias (destaque para as divididas)
- proposituras protocoladas nos últimos 7 dias (projetos de lei e moções; requerimentos só contados)
- gastos fora do padrão no último mês fechado do TCE-SP: órgão que pagou mais de 50% acima da média
  dos 6 meses anteriores, e fornecedor que recebeu mais de R$ 50 mil e mais de 3 vezes a própria média
- casos documentados com data nos últimos 30 dias

Uso: python agentes/alertas.py   (o orquestrador roda ao fim de cada atualização)
Saída: site/alertas.js (window.ALERTAS), lido por site/alertas.html.
"""
import html
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


def caixa(t):
    """Texto todo em maiúsculas vira frase normal; abertura em maiúsculas ("MOÇÃO DE APLAUSOS E
    CONGRATULAÇÕES à ...") também."""
    t = re.sub(r"([A-ZÀ-Ý]{2,})(à|ao|aos|às)\b", r"\1 \2", t)  # "CONGRATULAÇÕESà FAESB" (espaço perdido no SisCam)
    letras = [c for c in t if c.isalpha()]
    if letras and sum(c.isupper() for c in letras) / len(letras) > .85:
        return re.sub(r"(^|[.!?]\s+)(\w)", lambda m: m.group(1) + m.group(2).upper(), t.lower())
    m = re.match(r"([A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]+)+)\b", t)
    if m and len(m.group(1).split()) >= 3:
        t = m.group(1).capitalize() + t[m.end(1):]
    return t


def nome(t):
    return " ".join(p if len(p) <= 3 and p.lower() in ("da", "de", "do", "das", "dos", "e") else p.capitalize()
                    for p in t.lower().split()) if t.isupper() else t


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
            alertas.append({"tipo": "gasto", "cidade": slug, "data": ultimo.replace("_", "-") + "-01",
                            "titulo": f"{org} pagou {v / media:.1f}x a média mensal em {ultimo[5:]}/{ultimo[:4]}",
                            "detalhe": f"R$ {v:,.0f} contra média de R$ {media:,.0f} nos 6 meses anteriores.".replace(",", "."),
                            "link": f"gastos.html#{slug}"})
        for f, vf in forn_u[org].most_common(40):
            media_f = sum(por_mes[m][1][org][f] for m in anteriores) / len(anteriores)
            if vf > 50_000 and vf > 3 * max(media_f, 1):
                alertas.append({"tipo": "gasto", "cidade": slug, "data": ultimo.replace("_", "-") + "-01",
                                "titulo": f"{f} recebeu R$ {vf:,.0f} de {org}".replace(",", "."),
                                "detalhe": (f"Média de R$ {media_f:,.0f} por mês nos 6 meses anteriores." if media_f else
                                            "Não tinha recebido nada nos 6 meses anteriores.").replace(",", "."),
                                "link": f"gastos.html#{slug}"})
    return alertas


def resumo_whatsapp(resumo, sessoes, itens, desde):
    """Texto curto da semana, pronto para colar no WhatsApp ou num e-mail."""
    br = lambda d: d[8:10] + "/" + d[5:7]
    linhas = [f"*De olho na Câmara: a semana desde {br(desde)}*", ""]
    for slug, r in resumo.items():
        partes = [f"{r['votacoes']} votações ({r['divididas']} divididas)" if r["votacoes"] else "",
                  f"{r['proposituras']} proposituras" if r["proposituras"] else "",
                  f"{r['gastos']} gastos fora do padrão" if r["gastos"] else ""]
        partes = [p for p in partes if p]
        if partes:
            linhas.append(f"• *{r['cidade']}*: " + ", ".join(partes))
    destaques = [x for x in itens if x["tipo"] in ("votacao", "caso")][:3] + [x for x in itens if x["tipo"] == "gasto"][:2]
    if destaques:
        linhas += ["", "*Destaques*"] + [f"• {x['titulo']}" for x in destaques]
    linhas += ["", "Veja tudo: rafaelpintodasilva.com/camara/alertas.html"]
    return "\n".join(linhas)


def gravar_rss(itens):
    """site/alertas.xml: feed RSS dos alertas, para assinar num leitor de RSS ou num serviço que manda
    o feed por e-mail. Os links ficam relativos ao endereço público (OLHO_URL_SITE ou cidades/_site.json)."""
    base = os.environ.get("OLHO_URL_SITE", ler(os.path.join(RAIZ, "cidades", "_site.json"), {}).get("url_base", "")).rstrip("/")
    e = lambda t: html.escape(str(t), quote=True)
    agora = datetime.now().astimezone().strftime("%a, %d %b %Y %H:%M:%S %z")
    corpo = "".join(
        f"<item><title>{e(x['titulo'])}</title><link>{e(base + '/' + x['link'])}</link>"
        f"<guid isPermaLink=\"false\">{e(x['tipo'] + ':' + x['cidade'] + ':' + x['link'] + ':' + x['data'])}</guid>"
        f"<pubDate>{e(datetime.fromisoformat(x['data'][:10]).strftime('%a, %d %b %Y 00:00:00 -0300'))}</pubDate>"
        f"<description>{e(x['detalhe'])}</description></item>" for x in itens)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>De olho na Câmara: alertas</title>'
           f"<link>{e(base + '/alertas.html')}</link><description>Votações divididas, projetos novos, gastos fora do padrão e casos.</description>"
           f"<language>pt-br</language><lastBuildDate>{e(agora)}</lastBuildDate>{corpo}</channel></rss>\n")
    with open(os.path.join(RAIZ, "site", "alertas.xml.tmp"), "w", encoding="utf-8") as f:
        f.write(xml)
    os.replace(os.path.join(RAIZ, "site", "alertas.xml.tmp"), os.path.join(RAIZ, "site", "alertas.xml"))


def main():
    hoje = date.today()
    desde = (hoje - timedelta(days=DIAS)).isoformat()
    desde_casos = (hoje - timedelta(days=30)).isoformat()
    site_cfg = ler(os.path.join(RAIZ, "cidades", "_site.json"), {})
    itens, resumo, sessoes = [], {}, []
    for slug in site_cfg.get("ordem", []):
        cfg = ler(os.path.join(RAIZ, "cidades", f"{slug}.json"))
        if not cfg:
            continue
        r = {"cidade": cfg["nome"], "votacoes": 0, "divididas": 0, "proposituras": 0, "gastos": 0, "casos": 0}
        vots = ler_js(os.path.join(RAIZ, "site", slug, "votacoes.js"), "votacoes")
        div_sessao = Counter(v["s"] for v in vots if v["div"])
        # Cada sessão: [id, título, data, presentes, ausentes, votações] (analista.processar_sessoes).
        for sid, titulo, d, presentes, ausentes, n_vot in ler_js(os.path.join(RAIZ, "site", slug, "votacoes.js"), "sessoes"):
            if d >= desde:
                sessoes.append({"cidade": slug, "nome_cidade": cfg["nome"], "id": sid, "titulo": titulo, "data": d,
                                "presentes": presentes, "ausentes": ausentes, "votacoes": n_vot, "divididas": div_sessao[sid],
                                "link": f"{slug}/index.html#semana/{sid}"})
        r["votacoes"] = sum(x["votacoes"] for x in sessoes if x["cidade"] == slug)  # todas, inclusive as unânimes
        for v in vots:
            if v["d"] >= desde:
                if v["div"]:
                    r["divididas"] += 1
                    n = v["n"]
                    itens.append({"tipo": "votacao", "cidade": slug, "data": v["d"],
                                  "titulo": f"{v['m']}: {v['r'].lower()} por {n.get('favor', 0)} a {n.get('contra', 0)}",
                                  "detalhe": caixa(v["a"])[:220], "link": f"{slug}/index.html#votacao/{v['id']}"})
        for p in ler(os.path.join(RAIZ, "dados", slug, "processados", "proposituras.json"), []):
            if p["data"] >= desde:
                r["proposituras"] += 1
                if p["tipo"] in ("Projeto de Lei", "Projeto de Lei Complementar", "Projeto de Emenda à Lei Orgânica", "Moção"):
                    itens.append({"tipo": "propositura", "cidade": slug, "data": p["data"],
                                  "titulo": f"{p['tipo']} nº {p['numero']}/{p['ano']} · {', '.join(nome(a) for a in p['autores'][:2])}",
                                  "detalhe": caixa(p["ementa"])[:220],
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
    sessoes.sort(key=lambda x: x["data"])
    texto = resumo_whatsapp(resumo, sessoes, itens, desde)
    saida = {"gerado_em": datetime.now().astimezone().isoformat(timespec="minutes"), "desde": desde,
             "resumo": resumo, "itens": itens[:400], "sessoes": sessoes, "texto": texto}
    gravar_rss(itens[:60])
    with open(os.path.join(RAIZ, "site", "alertas.js.tmp"), "w", encoding="utf-8") as f:
        f.write("window.ALERTAS=" + json.dumps(saida, ensure_ascii=False, separators=(",", ":")) + ";\n")
    os.replace(os.path.join(RAIZ, "site", "alertas.js.tmp"), os.path.join(RAIZ, "site", "alertas.js"))
    print(f"[alertas] {len(itens)} itens desde {desde}: " + ", ".join(
        f"{s} {x['votacoes']}v/{x['proposituras']}p/{x['gastos']}g/{x['casos']}c" for s, x in resumo.items()))


if __name__ == "__main__":
    main()
