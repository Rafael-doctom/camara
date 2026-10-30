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
    """(id, Modulo) da pesquisa de documentos, a partir de qualquer página com o menu do SisCam.
    A página inicial tem o menu com links /index/{id}/{Modulo}; o de "Proposituras" é o que interessa."""
    for lid, mod, rotulo in re.findall(r'href="/index/(\d+)/(\d+)"[^>]*>(.*?)</a>', texto, re.S):
        if limpar(rotulo).lower() == "proposituras":
            return int(lid), int(mod)
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
    elif primeira.endswith(("res", "zes")):  # Pareceres -> Parecer
        primeira = primeira[:-2]
    elif primeira.endswith("s"):
        primeira = primeira[:-1]
    return f"{primeira} {resto}".strip()


def nome_camara(texto):
    m = re.search(r"<title>(.*?)</title>", texto, re.S)
    return limpar(m.group(1)).split(" - ")[0] if m else ""


def legislaturas(texto):
    """[(id, ano_inicio, ano_fim, nome)] da página /Legislaturas, da mais recente para a mais antiga.
    Cada item tem o link da legislatura seguido de "Posse: dd/mm/aaaa" e "Encerramento: dd/mm/aaaa"."""
    links = list(re.finditer(r'href="/Legislaturas/Legislatura/(\d+)"[^>]*>(.*?)</a>', texto, re.S))
    saida = {}
    for n, m in enumerate(links):
        bloco = limpar(texto[m.end():links[n + 1].start() if n + 1 < len(links) else m.end() + 2000])
        posse = re.search(r"Posse:\s*\d{2}/\d{2}/(\d{4})", bloco)
        fim = re.search(r"Encerramento:\s*\d{2}/\d{2}/(\d{4})", bloco)
        if posse and fim and int(m.group(1)) not in saida:
            saida[int(m.group(1))] = (int(m.group(1)), int(posse.group(1)), int(fim.group(1)), limpar(m.group(2)).lower())
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

    # Mandatos municipais começam em 2001, 2005, ..., 2025. Se o SisCam ainda não cadastrou a
    # legislatura em curso (aconteceu em Cerquilho), ela fica sem página (id None).
    ano = time.localtime().tm_year
    ini_atual = ano - (ano - 2001) % 4
    por_ano = {}
    for l in legs:  # mais de uma página para o mesmo período (Iperó): fica a que tem mais vereadores
        if l[1] in por_ano:
            n_l = lambda lid: len(set(re.findall(r"/Vereadores/Vereador/(\d+)", baixar(f"{base}/Legislaturas/Legislatura/{lid}"))))
            if n_l(l[0]) > n_l(por_ano[l[1]][0]):
                por_ano[l[1]] = l
        else:
            por_ano[l[1]] = l
    atual = por_ano.get(ini_atual)
    if not atual:
        print(f"AVISO: o SisCam não tem a página da legislatura {ini_atual}-{ini_atual + 3}; a coleta usa só /Vereadores.")
        atual = (None, ini_atual, ini_atual + 3, "")
    anteriores = [por_ano[a] for a in (ini_atual - 4, ini_atual - 8) if a in por_ano and a >= 2017]
    # /Vereadores pode listar, além dos titulares, suplentes ou afastados (Itapetininga: 21 para 19
    # cadeiras). A página da legislatura atual tem um nome por cadeira ocupada: vira o número de cadeiras.
    folga = 0
    if atual[0] is not None:
        n_leg = len(set(re.findall(r'<a href="/Vereadores/Vereador/(\d+)">', baixar(f"{base}/Legislaturas/Legislatura/{atual[0]}"))))
        if 0 < n_leg < n:
            n, folga = n_leg, n - n_leg
    cfg = {
        "slug": slug, "nome": nome, "camara": camara, "site_camara": "", "siscam": base,
        "modulo_documentos": mid, "modulo": modulo, "cadeiras": n, "folga_lista_exercicio": folga,
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
          f"legislatura atual {atual[1]}-{atual[2]} (página {atual[0]}), anteriores {[l[1] for l in anteriores]}.")
    if n == 0 or not tipos:
        print("AVISO: algo não foi encontrado (cadeiras ou tipos). Confira o arquivo antes de coletar.")
    print(f"Próximo passo: python agentes/orquestrador.py --cidade {slug}")


if __name__ == "__main__":
    main()
