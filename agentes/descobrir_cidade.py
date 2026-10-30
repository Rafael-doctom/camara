"""Descobre a configuração de uma Câmara no SisCam e grava cidades/<slug>.json.

Uso:
    python agentes/descobrir_cidade.py itapetininga             # usa https://itapetininga.siscam.com.br
    python agentes/descobrir_cidade.py ipero --nome "Iperó"     # nome com acento para o site
    python agentes/descobrir_cidade.py cerquilho --siscam https://outro.endereco

Lê a página de pesquisa de documentos (módulo, tipos de propositura), /Legislaturas (IDs e
períodos) e /Vereadores (cadeiras). Depois de gravar, confira o arquivo e rode a coleta:
    python agentes/orquestrador.py --cidade itapetininga

Não importa comum.py de propósito: comum.py exige que a cidade já esteja configurada.
"""
import html
import json
import os
import re
import sys
import time
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USER_AGENT = "observatorio-politico-camaras/1.0 (pesquisa civica; dados publicos)"


def baixar(url):
    time.sleep(1.0)  # mesma pausa dos coletores
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def limpar(texto):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", texto))).strip()


def modulo_documentos(texto):
    """(id, Modulo) da pesquisa de documentos, a partir de qualquer página com o menu do SisCam."""
    m = re.search(r"Documentos/Pesquisa\?[^\"']*?\bid=(\d+)[^\"']*?Modulo=(\d+)", html.unescape(texto))
    if m:
        return int(m.group(1)), int(m.group(2))
    i = re.search(r'id="pesquisa-menu" value="(\d+)"', texto)
    mod = re.search(r'name="Modulo" type="hidden" value="(\d+)"', texto)
    return (int(i.group(1)) if i else None), (int(mod.group(1)) if mod else 8)


def tipos_documento(texto):
    """Opções do select "Documento" da pesquisa avançada: nome -> ID."""
    m = re.search(r'<select id="Documento" name="Documento"[^>]*>(.*?)</select>', texto, re.S)
    if not m:
        return {}
    return {singular(limpar(nome)): int(vid)
            for vid, nome in re.findall(r'<option[^>]*\bvalue="(\d+)"[^>]*>(.*?)</option>', m.group(1), re.S)
            if vid != "0" and limpar(nome)}


def singular(nome):
    """O formulário lista no plural ("Moções", "Projetos de Lei"); o CSV exportado usa o singular,
    que é a chave de tipos_documento ("Moção", "Projeto de Lei")."""
    primeira, _, resto = nome.partition(" ")
    if primeira.endswith("ções"):
        primeira = primeira[:-4] + "ção"
    elif primeira.endswith("s"):
        primeira = primeira[:-1]
    return f"{primeira} {resto}".strip()


def nome_camara(texto):
    m = re.search(r"<title>(.*?)</title>", texto, re.S)
    return limpar(m.group(1)).split(" - ")[0] if m else ""


def legislaturas(texto):
    """[(id, ano_inicio, ano_fim, nome)] da página /Legislaturas, da mais recente para a mais antiga."""
    saida = {}
    for m in re.finditer(r'href="/Legislaturas/Legislatura/(\d+)"[^>]*>(.*?)</a>', texto, re.S):
        lid = int(m.group(1))
        trecho = limpar(texto[max(0, m.start() - 300):m.end() + 400])
        anos = [int(a) for a in re.findall(r"\b(19\d\d|20\d\d)\b", limpar(m.group(2)) + " " + trecho)]
        pares = [(a, b) for a, b in zip(anos, anos[1:]) if b - a == 3]
        nome = re.search(r"\d+\s*[ªº]\s*Legislatura", limpar(m.group(2)) + " " + trecho, re.I)
        if pares and lid not in saida:
            saida[lid] = (lid, pares[0][0], pares[0][1], nome.group(0) if nome else "")
    return sorted(saida.values(), key=lambda x: -x[1])


def cadeiras(texto):
    return len(set(re.findall(r'<h4><a href="/Vereadores/Vereador/(\d+)">', texto)))


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("-"):
        print(__doc__)
        sys.exit(1)
    slug = args[0].lower()
    opc = lambda nome: args[args.index(nome) + 1] if nome in args and args.index(nome) + 1 < len(args) else None
    base = (opc("--siscam") or f"https://{slug}.siscam.com.br").rstrip("/")
    destino = os.path.join(RAIZ, "cidades", f"{slug}.json")
    if os.path.exists(destino) and "--sobrescrever" not in args:
        print(f"{destino} já existe. Use --sobrescrever para refazer.")
        sys.exit(1)

    inicio = baixar(base + "/")
    mid, modulo = modulo_documentos(inicio)
    if mid is None:
        print("ERRO: não achei o link da pesquisa de documentos na página inicial. Abra o SisCam no navegador, "
              "entre em Documentos > Pesquisa avançada e use --siscam com o endereço certo.")
        sys.exit(1)
    form = baixar(f"{base}/Documentos/Pesquisa?Pesquisa=Avancada&id={mid}&Modulo={modulo}")
    tipos = tipos_documento(form)
    legs = legislaturas(baixar(base + "/Legislaturas"))
    n = cadeiras(baixar(base + "/Vereadores"))
    camara = nome_camara(inicio) or f"Câmara Municipal de {slug.title()}"
    nome = opc("--nome") or re.sub(r"^.*\bde\s+", "", camara) or slug.title()

    if not legs:
        print("AVISO: não achei as legislaturas em /Legislaturas; preencha legislatura_atual à mão.")
    atual = legs[0] if legs else (None, 2025, 2028, "")
    anteriores = [l for l in legs[1:] if l[1] >= 2017][:2]
    cfg = {
        "slug": slug, "nome": nome, "camara": camara, "site_camara": "", "siscam": base,
        "modulo_documentos": mid, "modulo": modulo, "cadeiras": n, "folga_lista_exercicio": 0,
        "legislatura_atual": {"id": atual[0], "nome": atual[3], "inicio": f"{atual[1]}-01-01", "fim": f"{atual[2]}-12-31"},
        "legislaturas_anteriores": [{"ano": a, "id": i, "nome": nm, "inicio": f"{a}-01-01", "fim": f"{b}-12-31"}
                                    for i, a, b, nm in anteriores],
        "coletar_anteriores": True,
        "tipos_documento": tipos,
        "links": [],
    }
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
        f.write("\n")
    pasta_casos = os.path.join(RAIZ, "casos", slug)
    os.makedirs(pasta_casos, exist_ok=True)
    for arq, vazio in (("casos.json", []), ("apelidos.json", {"apelidos": {}}), ("pautas_a_verificar.json", [])):
        caminho = os.path.join(pasta_casos, arq)
        if not os.path.exists(caminho):
            with open(caminho, "w", encoding="utf-8") as f:
                json.dump(vazio, f)
                f.write("\n")
    print(f"Gravado {destino}: {camara}, {n} vereadores em exercício, {len(tipos)} tipos de documento, "
          f"legislaturas {[l[1] for l in legs]}.")
    if n == 0 or not tipos:
        print("AVISO: algo não foi encontrado (cadeiras ou tipos). Confira o arquivo antes de coletar.")
    print(f"Próximo passo: python agentes/orquestrador.py --cidade {slug}")


if __name__ == "__main__":
    main()
