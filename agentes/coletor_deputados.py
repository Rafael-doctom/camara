"""Deputados federais de um estado: perfil, gastos da cota parlamentar e votos nas votações
classificadas por eixo (casos/_federal/eixos.json). Fontes oficiais da Câmara dos Deputados:
- API de dados abertos: https://dadosabertos.camara.leg.br/api/v2 (deputados e votos)
- Arquivo anual da cota parlamentar: https://www.camara.leg.br/cotas/Ano-{ano}.csv.zip

Uso:
    python agentes/coletor_deputados.py            # SP, ano atual e anterior
    python agentes/coletor_deputados.py --uf SP

Saídas:
- dados/_politicos/deputados_federais_<uf>.json  posição nos eixos, no formato que o analista junta
                                                 em site/politicos.js (Painel ideológico)
- site/deputados.js                              perfis e gastos para site/deputados.html
- dados/_federal/brutos/                          cache dos arquivos da cota (fora do git)

A cota tem CPF do deputado e de fornecedores pessoa física: nenhum número de CPF vai para o site.
Fornecedores pessoa física aparecem pelo nome (dado público), sem o CPF.
"""
import csv
import io
import json
import os
import re
import sys
import time
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://dadosabertos.camara.leg.br/api/v2/"
USER_AGENT = "observatorio-politico-camaras/1.0 (pesquisa civica; dados publicos)"
BRUTOS = os.path.join(RAIZ, "dados", "_federal", "brutos")
AGENTE = "deputados"


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] [{AGENTE}] {msg}", flush=True)


def baixar(url, tentativas=12):
    """GET com novas tentativas: a API da Câmara devolve 504 com frequência e volta logo depois."""
    erro = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - qualquer falha de rede vira nova tentativa
            erro = e
            time.sleep(3 + 3 * i)
    raise erro


def api(caminho):
    time.sleep(0.5)
    return json.loads(baixar(API + caminho))


def gravar(caminho, texto):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(tmp, caminho)


def cota(ano, ids):
    """Gastos da cota parlamentar no ano para os deputados de `ids` (ideCadastro = id da API)."""
    os.makedirs(BRUTOS, exist_ok=True)
    arq = os.path.join(BRUTOS, f"cota-{ano}.csv.zip")
    velho = not os.path.exists(arq) or (time.time() - os.path.getmtime(arq)) > 86400
    if velho:
        log(f"baixando cota {ano}...")
        conteudo = baixar(f"https://www.camara.leg.br/cotas/Ano-{ano}.csv.zip", tentativas=4)
        with open(arq + ".tmp", "wb") as f:
            f.write(conteudo)
        os.replace(arq + ".tmp", arq)
    z = zipfile.ZipFile(arq)
    gastos = defaultdict(lambda: {"total": 0.0, "categorias": Counter(), "meses": Counter(), "fornecedores": Counter(),
                                  "nomes": {}, "n": 0})
    with z.open(z.namelist()[0]) as bruto:
        for linha in csv.DictReader(io.TextIOWrapper(bruto, encoding="utf-8-sig"), delimiter=";"):
            dep = int(linha["ideCadastro"] or 0)
            if dep not in ids:
                continue
            valor = float((linha["vlrLiquido"] or "0").replace(",", "."))
            g = gastos[dep]
            g["total"] += valor
            g["n"] += 1
            g["categorias"][linha["txtDescricao"].strip().capitalize()] += valor
            g["meses"][int(linha["numMes"] or 0)] += valor
            doc = "".join(c for c in linha["txtCNPJCPF"] if c.isdigit())
            # Nome de MEI costuma levar o CPF do dono: tira qualquer sequência de 11 dígitos.
            nome = re.sub(r"\s*\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", "", linha["txtFornecedor"]).strip()
            chave = doc if len(doc) == 14 else "pf:" + nome  # pessoa física: pelo nome, sem o CPF
            g["fornecedores"][chave] += valor
            g["nomes"].setdefault(chave, nome)
    saida = {}
    for dep, g in gastos.items():
        saida[dep] = {
            "total": round(g["total"], 2), "notas": g["n"],
            "categorias": {k: round(v, 2) for k, v in g["categorias"].most_common()},
            "meses": {str(m): round(v, 2) for m, v in sorted(g["meses"].items()) if m},
            "fornecedores": [{"nome": g["nomes"][d], "cnpj": "" if d.startswith("pf:") else d, "valor": round(v, 2)}
                             for d, v in g["fornecedores"].most_common(8)],
        }
    return saida


def senado(senadores, anos, uf):
    """Votos dos senadores nas votações de casos/_federal/eixos_senado.json e gastos da CEAPS
    (cota do Senado). Preenche cada senador e devolve (votações, políticos para o painel)."""
    curadas = json.load(open(os.path.join(RAIZ, "casos", "_federal", "eixos_senado.json"), encoding="utf-8"))["votacoes"]
    por_cod = {c["votacao"]: c for c in curadas}
    votacoes, politicos, info = [], [], {}
    for s in senadores:
        pos = defaultdict(lambda: [0, 0])
        s["votos"] = {}
        try:
            lista = json.loads(baixar(f"https://legis.senado.leg.br/dadosabertos/senador/{s['id']}/votacoes.json"))
            vs = lista["VotacaoParlamentar"]["Parlamentar"]["Votacoes"]["Votacao"]
        except Exception as e:  # noqa: BLE001
            log(f"AVISO: votos de {s['nome']} não lidos ({e})")
            continue
        for v in vs:
            c = por_cod.get(str(v.get("CodigoSessaoVotacao")))
            if not c:
                continue
            voto = v.get("SiglaDescricaoVoto", "")
            s["votos"][c["votacao"]] = voto
            info[c["votacao"]] = v
            if voto in ("Sim", "Não"):
                sinal = 1 if c["favor"] == "b" else -1
                pos[c["eixo"]][0] += sinal if voto == "Sim" else -sinal
                pos[c["eixo"]][1] += 1
        if pos:
            politicos.append({"chave": f"sen-{s['id']}", "nome": s["nome"], "partido": s["partido"], "cargo": f"Senador(a) ({uf})",
                              "cidade": "", "foto": s["foto"], "perfil": f"deputados.html#sen-{s['id']}",
                              "eixos": {e: sn for e, sn in pos.items()}})
    for c in curadas:
        v = info.get(c["votacao"], {})
        votacoes.append({"id": c["votacao"], "fonte": "Senado Federal", "eixo": c["eixo"], "favor": c["favor"], "nota": c["nota"],
                         "m": c["titulo"], "d": v.get("SessaoPlenaria", {}).get("DataSessao", ""), "r": v.get("DescricaoResultado", "") or "",
                         "n": {}, "url": f"https://www25.senado.leg.br/web/atividade/materias/-/materia/{v.get('Materia', {}).get('Codigo', '')}"})
    ids = {int(s["id"]) for s in senadores}
    for s in senadores:
        s["gastos"] = {}
    for ano in anos:
        try:
            linhas = json.loads(baixar(f"https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/{ano}"))
        except Exception as e:  # noqa: BLE001
            log(f"AVISO: CEAPS {ano} não lida ({e})")
            continue
        g = defaultdict(lambda: {"total": 0.0, "notas": 0, "categorias": Counter(), "meses": Counter(), "forn": Counter()})
        for l in linhas:
            if l["codSenador"] not in ids:
                continue
            x = g[l["codSenador"]]
            v = float(l["valorReembolsado"] or 0)
            x["total"] += v
            x["notas"] += 1
            x["categorias"][(l["tipoDespesa"] or "Não informado").strip().capitalize()] += v
            x["meses"][l["mes"]] += v
            doc = "".join(ch for ch in (l["cpfCnpj"] or "") if ch.isdigit())
            nome = re.sub(r"\s*\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", "", l["fornecedor"] or "").strip()
            x["forn"][(nome, doc if len(doc) == 14 else "")] += v
        for s in senadores:
            x = g.get(int(s["id"]))
            if x:
                s["gastos"][str(ano)] = {"total": round(x["total"], 2), "notas": x["notas"],
                                         "categorias": {k: round(v, 2) for k, v in x["categorias"].most_common()},
                                         "meses": {str(m): round(v, 2) for m, v in sorted(x["meses"].items())},
                                         "fornecedores": [{"nome": n, "cnpj": d, "valor": round(v, 2)} for (n, d), v in x["forn"].most_common(8)]}
    log(f"senado: {len(politicos)} senadores com posição em {len(votacoes)} votações")
    return votacoes, politicos


def main():
    uf = (sys.argv[sys.argv.index("--uf") + 1] if "--uf" in sys.argv else "SP").upper()
    hoje = date.today()
    anos = [hoje.year - 1, hoje.year]

    deps = api(f"deputados?siglaUf={uf}&itens=200&ordem=ASC&ordenarPor=nome")["dados"]
    if len(deps) < 10:
        log(f"ERRO: só {len(deps)} deputados de {uf} na API; nada gravado.")
        sys.exit(2)
    ids = {d["id"] for d in deps}
    log(f"{len(deps)} deputados de {uf} em exercício")

    curadas = json.load(open(os.path.join(RAIZ, "casos", "_federal", "eixos.json"), encoding="utf-8"))["votacoes"]
    votacoes, votos_dep, pos = [], defaultdict(dict), defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for c in curadas:
        info = api(f"votacoes/{c['votacao']}")["dados"]
        votos = api(f"votacoes/{c['votacao']}/votos")["dados"]
        sinal = 1 if c["favor"] == "b" else -1
        n = Counter()
        for v in votos:
            tipo = v["tipoVoto"]
            n[{"Sim": "favor", "Não": "contra"}.get(tipo, "outro")] += 1
            dep = v["deputado_"]["id"]
            if dep not in ids:
                continue
            votos_dep[dep][c["votacao"]] = tipo
            if tipo in ("Sim", "Não"):
                pos[dep][c["eixo"]][0] += sinal if tipo == "Sim" else -sinal
                pos[dep][c["eixo"]][1] += 1
        votacoes.append({"id": c["votacao"], "fonte": "Câmara dos Deputados", "eixo": c["eixo"], "favor": c["favor"],
                         "nota": c.get("nota", ""), "m": c["titulo"], "d": info["data"],
                         "r": "Aprovado" if info.get("aprovacao") else "Rejeitado",
                         "n": {"favor": n["favor"], "contra": n["contra"]},
                         "url": f"https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao={c['proposicao']}"})
        log(f"votação {c['votacao']}: {n['favor']} sim, {n['contra']} não")

    gastos = {ano: cota(ano, ids) for ano in anos}

    perfis, politicos = [], []
    for d in deps:
        perfil = f"deputados.html#{d['id']}"
        perfis.append({"id": d["id"], "nome": d["nome"], "partido": d["siglaPartido"], "uf": d["siglaUf"],
                       "foto": d["urlFoto"], "email": d.get("email") or "",
                       "pagina": f"https://www.camara.leg.br/deputados/{d['id']}",
                       "gastos": {str(a): gastos[a].get(d["id"]) for a in anos if gastos[a].get(d["id"])},
                       "votos": votos_dep.get(d["id"], {})})
        if pos.get(d["id"]):
            politicos.append({"chave": f"dep-{d['id']}", "nome": d["nome"], "partido": d["siglaPartido"],
                              "cargo": f"Deputado(a) federal ({uf})", "cidade": "", "foto": d["urlFoto"],
                              "perfil": perfil, "eixos": {e: sn for e, sn in pos[d["id"]].items()}})

    pasta = os.path.join(RAIZ, "dados", "_politicos")
    gravar(os.path.join(pasta, f"deputados_federais_{uf.lower()}.json"),
           json.dumps({"votacoes": votacoes, "politicos": politicos}, ensure_ascii=False, indent=1) + "\n")
    senadores = []
    try:  # API do Senado: senadores em exercício pela UF (foto e página oficiais, como a API devolve)
        lista = json.loads(baixar("https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json"))
        for p in lista["ListaParlamentarEmExercicio"]["Parlamentares"]["Parlamentar"]:
            i = p["IdentificacaoParlamentar"]
            if i.get("UfParlamentar") == uf:
                senadores.append({"id": i["CodigoParlamentar"], "nome": i["NomeParlamentar"], "partido": i.get("SiglaPartidoParlamentar", ""),
                                  "foto": i["UrlFotoParlamentar"].replace("http://", "https://"),
                                  "pagina": i["UrlPaginaParlamentar"].replace("http://", "https://"), "email": i.get("EmailParlamentar", "")})
    except Exception as e:  # noqa: BLE001
        log(f"AVISO: senadores não lidos ({e})")
    sen_vot, sen_pol = senado(senadores, anos, uf)
    gravar(os.path.join(pasta, f"senadores_{uf.lower()}.json"),
           json.dumps({"votacoes": sen_vot, "politicos": sen_pol}, ensure_ascii=False, indent=1) + "\n")
    site = {"gerado_em": datetime.now().astimezone().isoformat(timespec="minutes"), "uf": uf, "anos": anos,
            "votacoes": votacoes, "deputados": perfis, "senadores": senadores, "votacoes_senado": sen_vot}
    gravar(os.path.join(RAIZ, "site", "deputados.js"),
           "window.DEPUTADOS=" + json.dumps(site, ensure_ascii=False, separators=(",", ":")) + ";\n")
    log(f"OK: {len(perfis)} deputados e {len(senadores)} senadores, {len(politicos)} deputados com posição em {len(votacoes)} votações; "
        f"gastos de {', '.join(str(a) for a in anos)}")


if __name__ == "__main__":
    main()
