"""Funções compartilhadas pelos agentes: HTTP com cache, gravação segura, sanidade, caminhos e normalização."""
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import date, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA_CIDADES = os.path.join(RAIZ, "cidades")
CIDADE_PADRAO = "tatui"  # sem --cidade, para compatibilidade com os comandos antigos


def ler_arquivo_json(caminho, padrao=None):
    if padrao is not None and not os.path.exists(caminho):
        return padrao
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def config_site():
    """cidades/_site.json: nome do site, endereço público e ordem das cidades."""
    return ler_arquivo_json(os.path.join(PASTA_CIDADES, "_site.json"), {})


def listar_cidades():
    """Slugs das cidades configuradas (cidades/<slug>.json), na ordem de _site.json."""
    slugs = sorted(f[:-5] for f in os.listdir(PASTA_CIDADES) if f.endswith(".json") and not f.startswith("_"))
    ordem = [s for s in config_site().get("ordem", []) if s in slugs]
    return ordem + [s for s in slugs if s not in ordem]


def carregar_cidade(slug_cidade):
    """Configuração de uma cidade (formato em docs/AGENTES.md, seção "Adicionar uma cidade")."""
    caminho = os.path.join(PASTA_CIDADES, f"{slug_cidade}.json")
    if not re.fullmatch(r"[a-z0-9-]+", slug_cidade or "") or not os.path.exists(caminho):
        print(f"ERRO: cidade '{slug_cidade}' sem configuração em {caminho}. Cidades: {listar_cidades()}")
        sys.exit(1)
    return ler_arquivo_json(caminho)


def ler_slug_cidade(argv):
    """`--cidade itapetininga` na linha de comando; sem a opção, a cidade padrão."""
    if "--cidade" not in argv:
        return CIDADE_PADRAO
    i = argv.index("--cidade")
    return argv[i + 1] if i + 1 < len(argv) else ""


def _data(iso):
    return date.fromisoformat(iso)


# ---------------------------------------------------------------- cidade desta execução
# Cada agente roda para uma cidade só (escolhida por --cidade). Tudo que é específico da Câmara
# (endereço do SisCam, IDs, número de cadeiras, legislaturas) vem de cidades/<slug>.json.
CIDADE = carregar_cidade(ler_slug_cidade(sys.argv))
SLUG_CIDADE = CIDADE["slug"]
BASE = CIDADE["siscam"].rstrip("/")
MODULO_DOCUMENTOS = CIDADE["modulo_documentos"]  # parâmetro id= da pesquisa de documentos no SisCam
MODULO = CIDADE.get("modulo", 8)                  # parâmetro Modulo= da mesma pesquisa

DADOS_CIDADE = os.path.join(RAIZ, "dados", SLUG_CIDADE)
BRUTOS = os.path.join(DADOS_CIDADE, "brutos")
PROCESSADOS = os.path.join(DADOS_CIDADE, "processados")
HISTORICO = os.path.join(DADOS_CIDADE, "historico")
CASOS = os.path.join(RAIZ, "casos", SLUG_CIDADE)
SITE_RAIZ = os.path.join(RAIZ, "site")             # código compartilhado (app.js, CSS)
SITE = os.path.join(SITE_RAIZ, SLUG_CIDADE)         # dados, fotos e páginas desta cidade
FOTOS = os.path.join(SITE, "fotos")

# Legislatura atual. Em 2029: atualizar legislatura_atual e mover a de 2025 para legislaturas_anteriores.
_atual = CIDADE["legislatura_atual"]
INICIO_LEGISLATURA = _data(_atual["inicio"])
LEGISLATURA_ID = _atual.get("id")  # /Legislaturas/Legislatura/{id}; None se o SisCam não tem a página
NOME_LEGISLATURA = _atual.get("nome", "")

# Legislaturas anteriores, identificadas pelo ano de início. Estão encerradas: os dados não mudam,
# então são coletadas uma vez só (ver orquestrador) e gravadas em arquivos com o ano no nome.
LEGISLATURAS_FECHADAS = {
    l["ano"]: {"id": l["id"], "nome": l["nome"], "inicio": _data(l["inicio"]), "fim": _data(l["fim"])}
    for l in CIDADE.get("legislaturas_anteriores", [])
}
COLETAR_ANTERIORES = CIDADE.get("coletar_anteriores", False)


def ler_legislatura(argv, agente):
    """`--legislatura 2021` na linha de comando -> 2021 (ano de início). Sem a opção: None (atual)."""
    if "--legislatura" not in argv:
        return None
    i = argv.index("--legislatura")
    valor = argv[i + 1] if i + 1 < len(argv) else ""
    if not valor.isdigit() or int(valor) not in LEGISLATURAS_FECHADAS:
        abortar(agente, f"--legislatura deve ser um de {sorted(LEGISLATURAS_FECHADAS)} (recebido: {valor or 'nada'})", codigo=1)
    return int(valor)


VEREADORES_EM_EXERCICIO = CIDADE["cadeiras"]
# Alguns SisCam deixam na lista de vereadores em exercício titulares afastados (ex.: secretário
# municipal) junto com o suplente que assumiu. Folga = quantos nomes a mais a lista pode ter;
# o analista confere com as chamadas recentes quem de fato está na cadeira.
FOLGA_LISTA_EXERCICIO = CIDADE.get("folga_lista_exercicio", 0)
MINIMO_DO_ANTERIOR = 0.95     # nova coleta precisa ter pelo menos 95% do total anterior

# Endereço público do site, sem barra no fim. Padrão em cidades/_site.json (url_base); a variável
# de ambiente OLHO_URL_SITE substitui (vazia = links relativos). Cada cidade fica em <base>/<slug>.
URL_BASE = os.environ.get("OLHO_URL_SITE", config_site().get("url_base", "")).rstrip("/")
URL_SITE = f"{URL_BASE}/{SLUG_CIDADE}" if URL_BASE else ""

# IDs dos tipos de propositura no SisCam desta Câmara (nome no CSV -> ID do select "Documento").
TIPOS_DOCUMENTO = CIDADE.get("tipos_documento", {})

PAUSA_ENTRE_REQUISICOES = 1.0  # segundos; não sobrecarregar o servidor da Câmara. Não reduzir.
USER_AGENT = "observatorio-politico-camaras/1.0 (pesquisa civica; dados publicos)"

for pasta in (BRUTOS, PROCESSADOS, HISTORICO):
    os.makedirs(pasta, exist_ok=True)


def log(agente, msg):
    print(f"[{datetime.now():%H:%M:%S}] [{agente}] {msg}", flush=True)


def abortar(agente, msg, codigo=2):
    """Falha visível: registra e sai com código diferente de zero, sem gravar nada."""
    log(agente, f"ERRO: {msg}")
    sys.exit(codigo)


# ---------------------------------------------------------------- HTTP

def pagina_siscam(texto):
    """Validador padrão: página HTML do SisCam com conteúdo (não página de erro)."""
    return 'id="content"' in texto and "page-header" in texto


def _requisitar(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read(), r.headers.get("Content-Type", "")


def _cache_valido(destino, max_idade_dias):
    if not (destino and os.path.exists(destino)):
        return False
    idade = (time.time() - os.path.getmtime(destino)) / 86400
    return max_idade_dias is None or idade < max_idade_dias


def baixar(url, destino=None, max_idade_dias=None, tentativas=3, validar=None):
    """Baixa a URL e devolve o texto (UTF-8).

    Se `destino` existir, for mais novo que `max_idade_dias` e passar em `validar`, usa o cache.
    max_idade_dias=None significa cache permanente. `validar(texto) -> bool` rejeita páginas de
    erro: o conteúdo inválido nunca é gravado no cache e gera RuntimeError depois das tentativas.
    """
    if _cache_valido(destino, max_idade_dias):
        with open(destino, encoding="utf-8") as f:
            texto = f.read()
        if not validar or validar(texto):
            return texto

    erro = None
    for n in range(tentativas):
        try:
            bruto, _ = _requisitar(url)
            texto = bruto.decode("utf-8-sig", errors="replace")
            time.sleep(PAUSA_ENTRE_REQUISICOES)
            if not texto.strip() or (validar and not validar(texto)):
                raise ValueError("conteúdo inesperado (página de erro ou layout mudou)")
            if destino:
                gravar(destino, texto)
            return texto
        except Exception as e:  # rede instável ou página de erro: espera e tenta de novo
            erro = e
            time.sleep(3 * (n + 1))
    raise RuntimeError(f"Falha ao baixar {url}: {erro}")


def baixar_imagem(url, destino, max_idade_dias=30):
    """Baixa uma imagem (JPEG/PNG/GIF/WebP) para `destino`. Devolve True se o arquivo existe no fim."""
    if _cache_valido(destino, max_idade_dias):
        return True
    try:
        bruto, tipo = _requisitar(url)
    except Exception:
        return os.path.exists(destino)  # mantém a foto antiga se houver
    finally:
        time.sleep(PAUSA_ENTRE_REQUISICOES)
    assinaturas = (b"\xff\xd8\xff", b"\x89PNG", b"GIF8", b"RIFF")
    if not (tipo.startswith("image/") and bruto.startswith(assinaturas) and len(bruto) > 500):
        return os.path.exists(destino)
    gravar(destino, bruto)
    return True


# ---------------------------------------------------------------- texto

def limpar_html(trecho):
    """Remove tags, decodifica entidades e colapsa espaços."""
    texto = re.sub(r"<[^>]+>", " ", trecho)
    return re.sub(r"\s+", " ", html.unescape(texto)).strip()


def chave(nome):
    """Chave estável para comparar nomes: sem acento, maiúsculo, espaços simples."""
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


def juntar_comissoes(nomes):
    """Desfaz a quebra por vírgula em nome de comissão: ["COMISSÃO DE CONSTITUIÇÃO",
    "JUSTIÇA E REDAÇÃO 2021 - 2022"] -> ["COMISSÃO DE CONSTITUIÇÃO, JUSTIÇA E REDAÇÃO 2021 - 2022"]."""
    saida = []
    for n in nomes:
        if saida and chave(saida[-1]).startswith("COMISS") and (re.search(r"\d", n) or chave(n).startswith("JUSTICA")):
            saida[-1] += ", " + n
        else:
            saida.append(n)
    return saida


def slug(nome):
    """'BOSSOLAN DA RÁDIO' -> 'bossolan-da-radio'."""
    return re.sub(r"[^a-z0-9]+", "-", chave(nome).lower()).strip("-")


def data_br(s):
    """'27/10/2026' -> '2026-10-27'. Devolve '' se inválida."""
    try:
        return datetime.strptime(s.strip(), "%d/%m/%Y").date().isoformat()
    except ValueError:
        return ""


# ---------------------------------------------------------------- arquivos

def gravar(caminho, conteudo):
    """Gravação atômica: escreve em .tmp e troca de uma vez. Nunca deixa arquivo pela metade."""
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    tmp = caminho + ".tmp"
    if isinstance(conteudo, bytes):
        with open(tmp, "wb") as f:
            f.write(conteudo)
    else:
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            f.write(conteudo)
    os.replace(tmp, caminho)
    return caminho


def salvar_json(nome, dados, pasta=PROCESSADOS):
    return gravar(os.path.join(pasta, nome), json.dumps(dados, ensure_ascii=False, indent=1))


def ler_json(nome, pasta=PROCESSADOS):
    with open(os.path.join(pasta, nome), encoding="utf-8") as f:
        return json.load(f)


def checar_sanidade(agente, nome, novo, contar):
    """Compara a coleta nova com o JSON anterior antes de sobrescrever.

    `contar(dados) -> {"rótulo": número}`. Se algum número cair abaixo de 95% do anterior,
    sai com código 2 e o arquivo anterior fica intacto. `--forcar` na linha de comando ignora a regra.
    """
    caminho = os.path.join(PROCESSADOS, nome)
    if not os.path.exists(caminho) or "--forcar" in sys.argv:
        return
    try:
        anterior = contar(ler_json(nome))
    except Exception:  # arquivo anterior em formato antigo: não há base de comparação
        return
    atual = contar(novo)
    quedas = [f"{k}: {atual.get(k, 0)} (antes {n})" for k, n in anterior.items()
              if atual.get(k, 0) < MINIMO_DO_ANTERIOR * n]
    if quedas:
        abortar(agente, f"sanidade: total caiu mais de 5% em {nome}: {'; '.join(quedas)}. "
                        "Arquivo anterior mantido. Use --forcar se a queda for real.")
