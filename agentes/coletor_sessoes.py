"""Agente coletor de sessões plenárias.

Lista todas as sessões da legislatura e, para cada uma, extrai:
- frequência (chamadas: presentes/ausentes)
- votações (matéria, autoria, tipo de votação, voto nominal de cada vereador, resultado)
Saída: dados/<cidade>/processados/sessoes.json (legislatura atual; cidade em --cidade, padrão tatui)

Legislatura encerrada: `python coletor_sessoes.py --legislatura 2021` grava sessoes_2021.json.
Nesse modo a lista de sessões e as páginas ficam em cache permanente (não mudam mais).

Códigos de saída: 0 ok; 1 alguma sessão falhou (usa a versão anterior dela); 2 sanidade.
"""
import os
import re
import sys
from datetime import date, datetime

from comum import (BASE, BRUTOS, INICIO_LEGISLATURA, LEGISLATURAS_FECHADAS, PROCESSADOS, abortar, baixar,
                   checar_sanidade, data_br, juntar_comissoes, ler_json, ler_legislatura, limpar_html, log,
                   salvar_json)

AGENTE = "sessoes"
PASTA = os.path.join(BRUTOS, "sessoes")
DIAS_RECENTES = 30  # sessões mais novas que isso são baixadas de novo (a Câmara corrige votos depois)

# "<strong>A favor (12)</strong> - NOME, NOME"
RE_GRUPO = re.compile(r"<strong>\s*([^<(]+?)\s*\((\d+)\)\s*</strong>\s*-\s*([^<]*)", re.S)


def pagina_sessao(texto):
    """Página de sessão completa: cabeçalho, data e fim do HTML (descarta download cortado)."""
    return ('<h3 class="page-header"><strong>Sess' in texto and "<strong>Data:</strong>" in texto
            and "</html>" in texto)


def pagina_pesquisa(texto):
    return "Sessões - Pesquisa" in texto or "Sess&#245;es - Pesquisa" in texto


def listar_ids(inicio, fim, pasta_cache=None):
    """IDs das sessões entre as datas. Com `pasta_cache`, guarda as páginas da lista para sempre
    (só para legislatura encerrada)."""
    ids, pagina = [], 1
    inicio, fim = inicio.strftime("%d/%m/%Y"), fim.strftime("%d/%m/%Y")
    while True:
        url = (f"{BASE}/Sessoes/Pesquisa?Classe=0&tipo=0&dataInicial={inicio}"
               f"&dataFinal={fim}&pagina={pagina}")
        destino = os.path.join(pasta_cache, f"{pagina}.html") if pasta_cache else None
        texto = baixar(url, destino, validar=pagina_pesquisa)
        novos = [int(i) for i in dict.fromkeys(re.findall(r"/Sessoes/Sessao/(\d+)", texto))]
        novos = [i for i in novos if i not in ids]
        if not novos:
            break
        ids.extend(novos)
        log(AGENTE, f"página {pagina}: {len(novos)} sessões (total {len(ids)})")
        pagina += 1
    return ids


def nomes(lista):
    """Nomes separados por vírgula. O SisCam às vezes lista no lugar de um vereador uma comissão
    cujo nome tem vírgula ("COMISSÃO DE CONSTITUIÇÃO, JUSTIÇA E REDAÇÃO 2021 - 2022")."""
    return juntar_comissoes([n.strip() for n in limpar_html(lista).split(",") if n.strip()])


def grupos(bloco):
    """{'A favor': [...], 'Contra': [...], ...} de um trecho HTML."""
    return {limpar_html(rot): nomes(lst) for rot, _, lst in RE_GRUPO.findall(bloco)}


def campo(bloco, rotulo):
    m = re.search(rf"<strong>{rotulo}:?</strong>(.*?)</p>", bloco, re.S)
    return limpar_html(m.group(1)) if m else ""


def analisar_sessao(sid, max_idade_dias):
    destino = os.path.join(PASTA, f"{sid}.html")
    texto = baixar(f"{BASE}/Sessoes/Sessao/{sid}", destino, max_idade_dias=max_idade_dias,
                   validar=pagina_sessao)
    titulo = re.search(r'<h3 class="page-header">.*?<small><strong>-\s*(.*?)</strong>', texto, re.S)
    data = re.search(r"<strong>Data:</strong>\s*([\d/]+)", texto)
    sessao = {
        "id": sid,
        "titulo": limpar_html(titulo.group(1)) if titulo else "",
        "data": data_br(data.group(1)) if data else "",
        "chamadas": [],
        "votacoes": [],
    }

    m = re.search(r"<h3><strong>Frequ(?:ê|&#234;)ncias</strong></h3>", texto)
    freq = m.start() if m else -1
    m = re.search(r"<h3><strong>Vota(?:çõ|&#231;&#245;)es</strong></h3>", texto)
    vot = m.start() if m else -1

    if freq >= 0:
        trecho = texto[freq: vot if vot > freq else None]
        for bloco in trecho.split("data-list-item")[1:]:
            h = re.search(r"<h4>(.*?)</h4>", bloco, re.S)
            sessao["chamadas"].append({"nome": limpar_html(h.group(1)) if h else "",
                                       "grupos": grupos(bloco)})

    if vot >= 0:
        for bloco in texto[vot:].split("data-list-item")[1:]:
            link = re.search(r'<a href="/Documentos/Documento/(\d+)">(.*?)</a>', bloco, re.S)
            if not link:
                continue
            autoria = campo(bloco, "Autoria")
            coautoria = campo(bloco, "Coautoria")
            sessao["votacoes"].append({
                "documento_id": int(link.group(1)),
                "materia": limpar_html(link.group(2)),
                "autoria": nomes(autoria + ("," + coautoria if coautoria else "")),
                "assunto": campo(bloco, "Assunto"),
                "quorum": campo(bloco, "Qu(?:ó|&#243;)rum"),
                "tipo_votacao": campo(bloco, "Vota(?:çã|&#231;&#227;)o"),
                "fase": campo(bloco, "Fase"),
                "votos": grupos(bloco),
                "resultado": campo(bloco, "Resultado"),
            })
    return sessao


def recente(data_iso):
    return not data_iso or (date.today() - datetime.fromisoformat(data_iso).date()).days < DIAS_RECENTES


def contar(sessoes):
    return {"sessões": len(sessoes), "votações": sum(len(s["votacoes"]) for s in sessoes)}


def main():
    leg = ler_legislatura(sys.argv, AGENTE)
    if leg:
        info = LEGISLATURAS_FECHADAS[leg]
        nome, inicio, fim = f"sessoes_{leg}.json", info["inicio"], info["fim"]
        cache_lista = os.path.join(BRUTOS, "sessoes_lista", str(leg))
    else:
        nome, inicio, fim, cache_lista = "sessoes.json", INICIO_LEGISLATURA, date.today(), None
    anteriores = {}
    if os.path.exists(os.path.join(PROCESSADOS, nome)):
        anteriores = {s["id"]: s for s in ler_json(nome)}
    try:
        ids = listar_ids(inicio, fim, cache_lista)
    except RuntimeError as e:
        abortar(AGENTE, f"{e}. Arquivo anterior mantido.", codigo=1)
    if not ids:
        abortar(AGENTE, f"nenhuma sessão listada entre {inicio} e {fim}: layout mudou? Arquivo anterior mantido.")

    sessoes, falhas = [], []
    for n, sid in enumerate(ids, 1):
        # Cache permanente para sessões antigas e para toda legislatura encerrada;
        # recentes ou novas: no máximo 12 horas.
        antiga = leg or (sid in anteriores and not recente(anteriores[sid]["data"]))
        try:
            s = analisar_sessao(sid, None if antiga else 0.5)
        except RuntimeError as e:
            falhas.append(sid)
            log(AGENTE, f"ERRO sessão {sid}: {e}")
            if sid in anteriores:  # não perde o que já tinha
                sessoes.append(anteriores[sid])
            continue
        sessoes.append(s)
        if n % 20 == 0:
            log(AGENTE, f"{n}/{len(ids)} sessões processadas")

    com_dados = sum(1 for s in sessoes if s["chamadas"] or s["votacoes"])
    if sessoes and com_dados < len(sessoes) / 2:
        if leg is None:
            abortar(AGENTE, f"só {com_dados} de {len(sessoes)} sessões com chamadas ou votações: layout mudou?")
        # Legislatura encerrada: alguns SisCam não registraram chamada e votos nos anos antigos
        # (Cerquilho, 2017-2024). A legislatura atual já confirma que o layout é lido; grava o que há.
        log(AGENTE, f"AVISO: só {com_dados} de {len(sessoes)} sessões com chamadas ou votações; "
                    "registro incompleto no SisCam, gravando assim mesmo")
    fora = [s["id"] for s in sessoes if not (inicio.isoformat() <= s["data"] <= fim.isoformat())]
    if fora:
        abortar(AGENTE, f"sessões sem data ou fora do período {inicio} a {fim}: {fora}. Arquivo anterior mantido.")
    checar_sanidade(AGENTE, nome, sessoes, contar)
    sessoes.sort(key=lambda s: (s["data"], s["id"]), reverse=True)
    caminho = salvar_json(nome, sessoes)
    total_vot = sum(len(s["votacoes"]) for s in sessoes)
    log(AGENTE, f"OK: {len(sessoes)} sessões, {total_vot} votações em {caminho}")
    if falhas:
        log(AGENTE, f"ERRO: {len(falhas)} sessões falharam: {falhas}")
        sys.exit(1)


if __name__ == "__main__":
    main()
