"""Agente analista.

Cruza proposituras, vereadores, sessões e casos documentados e gera:
- site/dados-base.js, site/votacoes.js, site/proposituras.js  (dados do site, em window.DADOS)
- site/historico.js                     (votações relevantes das legislaturas 2017-2020 e 2021-2024)
- site/vereador/<slug>.html            (página de compartilhamento de cada vereador)
- site/index.html                      (só atualiza o ?v=<hash> dos scripts)
- dados/processados/indicadores.json   (indicadores para auditoria/outros agentes)
- dados/historico/AAAA-MM-DD.json      (instantâneo diário dos indicadores por vereador)

Regras de classificação em docs/METODOLOGIA.md; formato dos arquivos do site em docs/FORMATO-DADOS.md.
"""
import glob
import hashlib
import html
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime

from comum import (BASE, HISTORICO, LEGISLATURAS_FECHADAS, PROCESSADOS, RAIZ, SITE, TIPOS_DOCUMENTO,
                   URL_SITE, VEREADORES_EM_EXERCICIO, chave, gravar, juntar_comissoes, ler_json, log,
                   salvar_json, slug)

AGENTE = "analista"

# ---------------------------------------------------------------- classificação

def tem(texto, *padroes):
    return any(re.search(p, texto) for p in padroes)


def categoria_pl(ementa):
    e = chave(ementa)
    if tem(e, r"\bDENOMINA", r"\bDA DENOMINACAO", r"\bALTERA A DENOMINACAO"):
        return "Nome de rua/prédio"
    if tem(e, r"UTILIDADE PUBLICA"):
        return "Utilidade pública"
    if tem(e, r"INSTITUI (O|A) (DIA|SEMANA|MES|CAMPANHA)", r"CALENDARIO OFICIAL", r"DATA COMEMORATIVA",
           r"\bDIA MUNICIPAL\b", r"\bSEMANA MUNICIPAL\b"):
        return "Data comemorativa/campanha"
    if tem(e, r"TITULO DE CIDADA", r"\bMEDALHA\b", r"\bHONRA\b", r"COMENDA"):
        return "Honraria"
    return "Política pública/norma"


def categoria_mocao(ementa):
    e = chave(ementa)
    if tem(e, r"\bPESAR\b"):
        return "Pesar"
    if tem(e, r"REPUDIO"):
        return "Repúdio"
    if tem(e, r"APLAUSO", r"CONGRATULA", r"PARABENIZ", r"RECONHECIMENTO"):
        return "Aplauso/congratulação"
    if tem(e, r"\bAPOIO\b", r"\bAPELO\b"):
        return "Apoio/apelo"
    return "Outras"


TEMAS_PEDIDO = [  # requerimentos e indicações
    ("Fiscalização/transparência", r"CONTRATO|LICITA|PREGAO|DISPENSA|EMPENHO|GASTO|DESPESA|VALOR(ES)? PAGO|COPIA|PRESTACAO DE CONTAS|CONVENIO|ADITIVO"),
    ("Saúde", r"SAUDE|UBS|UPA|HOSPITAL|MEDIC|POSTO DE SAUDE|VACIN|EXAME|CONSULTA"),
    ("Educação", r"ESCOLA|EDUCA|CRECHE|EMEF|EMEI|ALUNO|MERENDA|PROFESSOR"),
    ("Iluminação", r"ILUMINA|LAMPADA|POSTE"),
    ("Asfalto/vias/trânsito", r"ASFALT|BURACO|TAPA|PAVIMENT|LOMBADA|SINALIZA|SEMAFORO|FAIXA|TRANSITO|RECAPE|CALCADA|VIA PUBLICA"),
    ("Limpeza/mato/lixo", r"LIMPEZA|MATO|ROCAGEM|LIXO|ENTULHO|CATA.?BAGULHO|CAPINA|TERRENO BALDIO"),
    ("Segurança", r"SEGURANCA|GUARDA CIVIL|GCM|POLICI|VIGILANCIA|CAMERA|MONITORAMENTO"),
    ("Água/esgoto/drenagem", r"\bAGUA\b|ESGOTO|SABESP|DRENAGEM|BUEIRO|GALERIA PLUVIAL|ENCHENTE|ALAGAMENTO"),
    ("Transporte público", r"ONIBUS|TRANSPORTE (PUBLICO|COLETIVO)|PONTO DE ONIBUS|ABRIGO"),
    ("Animais", r"ANIMA|CAES|CAO\b|GATO|CASTRA|ZOONOSE"),
]


def tema_pedido(ementa):
    e = chave(ementa)
    for nome, padrao in TEMAS_PEDIDO:
        if re.search(padrao, e):
            return nome
    return "Outros"


# Pautas que costumam pesar no bolso ou no controle do poder público.
TEMAS_SENSIVEIS = [
    ("Impostos e taxas", r"\bISS\b|ISSQN|\bIPTU\b|\bITBI\b|IMPOSTO|\bTAXA\b|TRIBUT|ALIQUOTA|PLANTA GENERICA|CONTRIBUICAO (PARA|DE) (CUSTEIO|ILUMINACAO)|\bCOSIP\b|\bCIP\b|NFS-?E\b|NOTA FISCAL DE SERVICO"),
    ("Investigação/fiscalização do Executivo", r"COMISSAO ESPECIAL DE INQUERITO|\bCEI\b|\bCPI\b|COMISSAO PROCESSANTE|CASSACAO|SINDICANCIA|CONTAS DO (PREFEITO|EXECUTIVO|MUNICIPIO)|PARECER PREVIO|TRIBUNAL DE CONTAS"),
    ("Salários e benefícios de agentes políticos", r"SUBSIDIO|REMUNERACAO DOS (VEREADORES|AGENTES|SECRETARIOS)|VERBA DE GABINETE|REAJUSTE.*(VEREADOR|PREFEITO|SECRETARI)|AMBITO DA CAMARA MUNICIPAL|SERVIDORES E EM COMISSAO DA CAMARA"),
    ("Empréstimos e créditos", r"OPERACAO DE CREDITO|EMPRESTIMO|FINANCIAMENTO|CREDITO (ADICIONAL|SUPLEMENTAR|ESPECIAL)|ABRIR CREDITO|ABERTURA DE CREDITO"),
    ("Patrimônio público", r"CONCESSAO|PRIVATIZ|ALIENA|DOACAO DE (AREA|IMOVEL)|DESAFETA|PERMUTA|PPP|PARCERIA PUBLICO"),
    ("Orçamento", r"\bLOA\b|\bLDO\b|\bPPA\b|LEI ORCAMENTARIA|DIRETRIZES ORCAMENTARIAS|DIRETRIZES PARA A ELABORACAO|PLANO PLURIANUAL|ESTIMA A RECEITA|FIXA A DESPESA"),
]


def temas_sensiveis(texto):
    t = chave(texto)
    return [nome for nome, padrao in TEMAS_SENSIVEIS if re.search(padrao, t)]


def aprovado(situacao):
    s = chave(situacao)
    return ("APROVAD" in s and "NAO APROVAD" not in s) or "SANCAO" in s or "VETO REJEITADO" in s


# O SisCam grava a mesma situação no masculino ou no feminino conforme o tipo do documento.
SITUACAO_EQUIVALENTE = {
    "APROVADA": "APROVADO",
    "PREJUDICADA": "PREJUDICADO",
    "RETIRADA PELO AUTOR": "RETIRADO PELO AUTOR",
}


def situacao_normal(situacao):
    return SITUACAO_EQUIVALENTE.get(situacao.strip().upper(), situacao.strip())


# ---------------------------------------------------------------- nomes

def eh_pessoa(nome):
    """O SisCam às vezes lista uma comissão no lugar de um vereador (chamadas e votos de fev/2025)."""
    return not re.search(r"\d|COMISS", chave(nome))


def montar_perfis(ver, curados):
    """Perfis por chave do nome parlamentar e mapa de nomes alternativos -> chave.

    Junta, pelo ID do SisCam, a página de vereadores em exercício (nome parlamentar atual,
    nome civil, partido) e a página da legislatura (todos que exerceram mandato)."""
    por_id = {}
    for m in ver.get("legislatura", []):
        por_id[m["id"]] = {
            "id": m["id"], "nome": m["nome"], "nome_civil": "", "partido": m["partido"], "email": "",
            "em_exercicio": False,
            "mandato": {k: m[k] for k in ("inicio", "fim", "cargo", "votos")} | {"partido_eleicao": m["partido"]},
        }
    apelidos = {}
    for v in ver["em_exercicio"]:
        antigo = por_id.get(v["id"], {})
        if antigo and chave(antigo["nome"]) != chave(v["nome"]):
            apelidos[chave(antigo["nome"])] = chave(v["nome"])  # ex.: MAURICIO COUTO -> MAURICIO ENFERMEIRO
        por_id[v["id"]] = {**antigo, **v}
        if v.get("nome_civil"):
            apelidos[chave(v["nome_civil"])] = chave(v["nome"])
    for alternativo, parlamentar in curados.items():
        apelidos[chave(alternativo)] = chave(parlamentar)
    apelidos = {a: k for a, k in apelidos.items() if a != k}
    perfis = {chave(p["nome"]): p for p in por_id.values()}
    for alternativo in [a for a in apelidos if a in perfis]:  # nome antigo não vira perfil separado
        del perfis[alternativo]
    return perfis, apelidos


# ---------------------------------------------------------------- votos

ROTULO_VOTO = {  # normaliza rótulos do SisCam
    "A FAVOR": "favor", "SIM": "favor", "FAVORAVEL": "favor",
    "CONTRA": "contra", "NAO": "contra", "CONTRARIO": "contra",
    "ABSTENCAO": "abstencao", "ABSTENCOES": "abstencao",
    "AUSENTE": "ausente", "AUSENTES": "ausente",
    "NAO VOTA": "nao_vota", "NAO VOTOU": "nao_vota",
}


def resultado_aprovou(resultado):
    r = chave(resultado)
    return "APROVAD" in r and "NAO" not in r


def casa_materia(prefixo, materia):
    """'REQUERIMENTO NO 1544/2026' casa com 'Requerimento Nº 1544/2026 - ...', não com 15440/2026."""
    return bool(prefixo) and re.match(re.escape(prefixo) + r"(?!\d)", chave(materia)) is not None


# ---------------------------------------------------------------- saída

def hash_curto(texto):
    return hashlib.sha1(texto.encode("utf-8")).hexdigest()[:10]


def js(atribuicoes):
    """Script que preenche window.DADOS. `atribuicoes`: [(chave, valor), ...]."""
    corpo = "".join(f"window.DADOS.{k}={json.dumps(v, ensure_ascii=False, separators=(',', ':'))};\n"
                    for k, v in atribuicoes)
    return "window.DADOS=window.DADOS||{};\n" + corpo


def versionar_index(arquivos):
    """Grava ?v=<hash> em index.html para os navegadores não usarem cópia velha do cache."""
    caminho = os.path.join(SITE, "index.html")
    with open(caminho, encoding="utf-8") as f:
        texto = f.read()
    novo = texto
    for nome, versao in arquivos.items():
        novo = re.sub(rf'((?:src|href)="{re.escape(nome)})(\?v=[^"]*)?"', rf'\1?v={versao}"', novo)
    if novo != texto:
        gravar(caminho, novo)


def pagina_vereador(v, geral):
    """HTML estático com título, descrição e Open Graph próprios; abre o perfil no SPA."""
    e = lambda s: html.escape(str(s), quote=True)
    pres = v["presenca"]["pct"]
    partes = [f"presença em {str(pres).replace('.', ',')}% das sessões" if pres is not None else "",
              f"{v['pl_total']} projetos de lei ({v['pl_aprovados']} aprovados)",
              f"{v['proposituras'].get('Requerimento', 0)} requerimentos",
              f"{v['votos'].get('contra', 0)} votos contra em votações nominais"]
    partido = f" ({v['partido']})" if v.get("partido") else ""
    descricao = (f"{v['nome']}{partido} na Câmara de Tatuí, legislatura 2025-2028: "
                 + ", ".join(p for p in partes if p) + ". Dados oficiais do SisCam.")
    titulo = f"{v['nome']} - Olho na Câmara de Tatuí"
    destino = f"../index.html#vereador/{v['chave'].replace(' ', '%20')}"
    absoluto = lambda caminho: f"{URL_SITE}/{caminho}" if URL_SITE else f"../{caminho}"
    imagem = f'<meta property="og:image" content="{e(absoluto(v["foto"]))}">\n' if v.get("foto") else ""
    url = (f'<link rel="canonical" href="{e(URL_SITE)}/vereador/{v["slug"]}.html">\n'
           f'<meta property="og:url" content="{e(URL_SITE)}/vereador/{v["slug"]}.html">\n') if URL_SITE else ""
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title>
<meta name="description" content="{e(descricao)}">
<meta property="og:type" content="profile">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Olho na Câmara de Tatuí">
<meta property="og:title" content="{e(titulo)}">
<meta property="og:description" content="{e(descricao)}">
{imagem}{url}<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0; url={e(destino)}">
</head>
<body>
<p><a href="{e(destino)}">Abrir o perfil de {e(v['nome'])}</a></p>
<p>{e(descricao)}</p>
<p>Atualizado em {e(geral['gerado_em'][:10])}.</p>
</body>
</html>
"""


def gravar_paginas_vereadores(saida_ver, geral):
    pasta = os.path.join(SITE, "vereador")
    os.makedirs(pasta, exist_ok=True)
    feitas = set()
    for v in saida_ver:
        nome = f"{v['slug']}.html"
        gravar(os.path.join(pasta, nome), pagina_vereador(v, geral))
        feitas.add(nome)
    for antiga in glob.glob(os.path.join(pasta, "*.html")):  # quem saiu da lista
        if os.path.basename(antiga) not in feitas:
            os.remove(antiga)
    return len(feitas)


def gravar_historico(saida_ver, geral):
    """Instantâneo do dia (sobrescreve se rodar de novo no mesmo dia). Não é regenerável: versionar."""
    dia = geral["gerado_em"][:10]
    campos = ("presenca", "pl_total", "pl_aprovados", "votos", "alinhamento_maioria", "divididas_total")
    salvar_json(f"{dia}.json", {
        "data": dia,
        "gerado_em": geral["gerado_em"],
        "geral": {k: geral[k] for k in ("total_proposituras", "por_tipo", "total_sessoes", "total_votacoes",
                                         "votacoes_divididas")},
        "vereadores": {v["chave"]: {"nome": v["nome"], "em_exercicio": v["em_exercicio"],
                                    "proposituras": sum(v["proposituras"].values()),
                                    "por_tipo": v["proposituras"], **{k: v[k] for k in campos}}
                       for v in saida_ver},
    }, pasta=HISTORICO)


# ---------------------------------------------------------------- contagem

def novo_indicador():
    return {
        "proposituras": Counter(), "principal": Counter(), "pl_categorias": Counter(),
        "pl_aprovados": 0, "pl_total": 0, "mocao_categorias": Counter(), "pedido_temas": Counter(),
        "sessoes_presente": 0, "sessoes_ausente": 0,
        "votos": Counter(), "divididas_com_resultado": 0, "divididas_total": 0,
    }


def contar_proposituras(props, ind, resolver, perfis):
    """Credita autoria em `ind` e devolve a lista compacta do site (ordem dos índices `P` do app.js).
    `resolver(nome) -> chave` do vereador."""
    lista_props = []
    for p in props:
        chaves_aut = list(dict.fromkeys(resolver(a) for a in p["autores"]))
        origem = "Vereador(es)" if any(k in perfis for k in chaves_aut) else "Executivo/outros"
        cat = ""
        if p["tipo"] == "Projeto de Lei":
            cat = categoria_pl(p["ementa"])
        elif p["tipo"] == "Moção":
            cat = categoria_mocao(p["ementa"])
        elif p["tipo"] in ("Requerimento", "Indicação"):
            cat = tema_pedido(p["ementa"])
        sens = temas_sensiveis(p["ementa"]) if p["tipo"] not in ("Moção", "Indicação") else []
        for i, k in enumerate(chaves_aut):
            if k not in ind:
                continue
            d = ind[k]
            d["proposituras"][p["tipo"]] += 1
            if i == 0:
                d["principal"][p["tipo"]] += 1
            if p["tipo"] == "Projeto de Lei":
                d["pl_total"] += 1
                d["pl_categorias"][cat] += 1
                d["pl_aprovados"] += aprovado(p["situacao"])
            elif p["tipo"] == "Moção":
                d["mocao_categorias"][cat] += 1
            elif p["tipo"] in ("Requerimento", "Indicação"):
                d["pedido_temas"][cat] += 1
        sit = situacao_normal(p["situacao"])
        lista_props.append([p["tipo"], p["numero"], p["ano"], p["data"], p["ementa"][:450],
                            p["autores"], sit, cat, origem, sens, p["situacao"] if p["situacao"] != sit else ""])
    return lista_props


def listar_atual(v, info, prefixos_casos):
    """Legislatura atual: (entra na lista do site?, guarda os nomes por voto?)."""
    em_caso = any(casa_materia(p, v["materia"]) for p in prefixos_casos)
    relevante = info["dividida"] or info["negado"] or info["sens"] or em_caso
    rotineira = re.match(r"(Requerimento|Moção|Indicação|Ata de Reunião)", v["materia"])
    # Chaves dos vereadores só onde importam (divididas, negadas, temas sensíveis,
    # abstenções, casos); nas demais basta o placar. Mantém o arquivo leve.
    return (not rotineira or relevante), (relevante or info["abstencao"])


def processar_sessoes(sessoes, ind, perfis, pessoas, listar):
    """Presença e votos de cada vereador (acumula em `ind`) e lista de votações do site.

    `pessoas(nomes) -> chaves` (descarta comissões). `listar(votacao, info) -> (entra, com_nomes)`
    decide o que vai para o site. Devolve (lista_vot, pares, lista_sessoes, total, divididas);
    pares[(a, b)] = [votaram igual, votações divididas em comum]."""
    lista_vot, pares = [], defaultdict(lambda: [0, 0])
    total_votacoes = divididas = 0
    lista_sessoes = []
    for s in sessoes:
        deliberativa = tem(chave(s["titulo"]), "ORDINARIA", "EXTRAORDINARIA")
        presentes, ausentes = set(), set()
        for c in s["chamadas"]:
            for rot, nomes in c["grupos"].items():
                alvo = presentes if chave(rot).startswith("PRESENTE") else ausentes if chave(rot).startswith("AUSENTE") else None
                if alvo is not None:
                    alvo.update(pessoas(nomes))
        if deliberativa and (presentes or ausentes):
            for k in presentes:
                if k in ind:
                    ind[k]["sessoes_presente"] += 1
            for k in ausentes - presentes:
                if k in ind:
                    ind[k]["sessoes_ausente"] += 1
        lista_sessoes.append([s["id"], s["titulo"], s["data"], len(presentes), len(ausentes - presentes),
                              len(s["votacoes"])])

        repeticoes = Counter()
        ja_vistas = set()
        for v in s["votacoes"]:
            # O SisCam às vezes lista a mesma votação duas vezes na página da sessão
            # (mesmo documento, fase, votos e resultado). Conta uma vez só.
            assinatura = (v["documento_id"], v["fase"], v["resultado"], json.dumps(v["votos"], sort_keys=True))
            if assinatura in ja_vistas:
                continue
            ja_vistas.add(assinatura)
            repeticoes[v["documento_id"]] += 1
            n_rep = repeticoes[v["documento_id"]]
            vid = f"{s['id']}-{v['documento_id']}" + (f"-{n_rep}" if n_rep > 1 else "")
            votos = defaultdict(list)
            for rotulo, nomes in v["votos"].items():
                votos[ROTULO_VOTO.get(chave(rotulo), chave(rotulo).lower())].extend(pessoas(nomes))
            votos = {k: x for k, x in votos.items() if x}
            fav, con = votos.get("favor", []), votos.get("contra", [])
            dividida = bool(fav) and bool(con)
            aprovou = resultado_aprovou(v["resultado"])
            total_votacoes += 1
            divididas += dividida
            for opc, chaves in votos.items():
                for k in chaves:
                    if k in ind:
                        ind[k]["votos"][opc] += 1
            if dividida:
                lado_vencedor = set(fav if aprovou else con)
                for k in fav + con:
                    if k in ind:
                        ind[k]["divididas_total"] += 1
                        ind[k]["divididas_com_resultado"] += k in lado_vencedor
                pos = {k: "f" for k in fav if k in perfis} | {k: "c" for k in con if k in perfis}
                nomes_ord = sorted(pos)
                for i, a in enumerate(nomes_ord):
                    for b in nomes_ord[i + 1:]:
                        pares[(a, b)][1] += 1
                        pares[(a, b)][0] += pos[a] == pos[b]
            sens = temas_sensiveis(v["materia"] + " " + v["assunto"])
            info = {"dividida": dividida, "negado": not aprovou, "sens": bool(sens),
                    "abstencao": bool(votos.get("abstencao"))}
            entra, com_nomes = listar(v, info)
            if not entra:
                continue  # aprovação unânime de rotina: entra nos totais, mas não na lista do site
            lista_vot.append({
                "id": vid, "s": s["id"], "d": s["data"], "doc": v["documento_id"],
                "m": v["materia"], "a": v["assunto"][:400], "au": juntar_comissoes(v["autoria"]), "t": v["tipo_votacao"],
                "f": v["fase"], "r": v["resultado"], "div": dividida, "sens": sens,
                "v": votos if com_nomes else {},
                "n": {k: len(x) for k, x in votos.items()},
            })
    return lista_vot, pares, lista_sessoes, total_votacoes, divididas


def indicadores_vereador(d):
    """Campos numéricos do perfil a partir do acumulado de `novo_indicador()`."""
    sess = d["sessoes_presente"] + d["sessoes_ausente"]
    return {
        "proposituras": dict(d["proposituras"]),
        "principal": dict(d["principal"]),
        "pl_total": d["pl_total"], "pl_aprovados": d["pl_aprovados"],
        "pl_categorias": dict(d["pl_categorias"]),
        "mocao_categorias": dict(d["mocao_categorias"]),
        "pedido_temas": dict(d["pedido_temas"].most_common()),
        "presenca": {"presente": d["sessoes_presente"], "ausente": d["sessoes_ausente"],
                     "pct": round(100 * d["sessoes_presente"] / sess, 1) if sess else None},
        "votos": dict(d["votos"]),
        "alinhamento_maioria": round(100 * d["divididas_com_resultado"] / d["divididas_total"], 1) if d["divididas_total"] else None,
        "divididas_total": d["divididas_total"],
    }


# ---------------------------------------------------------------- legislaturas anteriores

# Projetos de lei, de lei complementar, de emenda à Lei Orgânica e emendas a projetos.
PROJETO = re.compile(r"(Projeto de Lei|Projeto de Emenda|Emenda)")


def listar_historico(v, info, prefixos_casos):
    """Legislaturas anteriores: só divididas, negadas, temas sensíveis, abstenções, casos e projetos;
    sempre com os nomes por voto. O resto entra só nos totais."""
    em_caso = any(casa_materia(p, v["materia"]) for p in prefixos_casos)
    relevante = (info["dividida"] or info["negado"] or info["sens"] or info["abstencao"] or em_caso
                 or PROJETO.match(v["materia"]))
    return bool(relevante), True


def ler_fechadas():
    """{ano: {"vereadores", "proposituras", "sessoes"}} das legislaturas encerradas já coletadas."""
    fechadas = {}
    for leg in sorted(LEGISLATURAS_FECHADAS):
        arquivos = {nome: f"{nome}_{leg}.json" for nome in ("vereadores", "proposituras", "sessoes")}
        faltando = [a for a in arquivos.values() if not os.path.exists(os.path.join(PROCESSADOS, a))]
        if faltando:
            log(AGENTE, f"AVISO: legislatura {leg} sem {faltando}; rode o orquestrador para coletar")
            continue
        fechadas[leg] = {nome: ler_json(a) for nome, a in arquivos.items()}
    return fechadas


def identidades(ver, perfis, fechadas, curados):
    """Liga cada nome que aparece no SisCam a uma pessoa, pelo ID do SisCam.

    Devolve (pessoa, nomes): pessoa[id] = (chave, nome parlamentar mais recente);
    nomes[ano][chave do nome] = id. Quem está na legislatura atual fica com a chave do perfil atual,
    para os links do site funcionarem. Ordem de confiança dos nomes: página da própria legislatura,
    vereadores atuais (nome e nome civil), páginas das outras legislaturas, `curados`
    (apelidos_anteriores), /Vereadores/Anteriores e, por fim, cadastro de autores com o mesmo ID."""
    pessoa = {p["id"]: (k, p["nome"]) for k, p in perfis.items() if p.get("id")}
    for d in fechadas.values():
        for vid, nome in d["vereadores"]["anteriores"].items():
            pessoa.setdefault(int(vid), (chave(nome), nome))
    for d in fechadas.values():
        for m in d["vereadores"]["legislatura"]:
            pessoa.setdefault(m["id"], (chave(m["nome"]), m["nome"]))

    atuais = ([(v["nome"], v["id"]) for v in ver["em_exercicio"]]
              + [(v["nome_civil"], v["id"]) for v in ver["em_exercicio"] if v.get("nome_civil")]
              + [(m["nome"], m["id"]) for m in ver.get("legislatura", [])])
    paginas = {leg: [(m["nome"], m["id"]) for m in d["vereadores"]["legislatura"]] for leg, d in fechadas.items()}
    antigos = [(n, int(i)) for d in fechadas.values() for i, n in d["vereadores"]["anteriores"].items()]
    autores = [(n, i) for n, i in ver.get("autores", {}).items() if i in pessoa]
    nomes = {}
    for leg in fechadas:
        mapa = {}
        outras = [par for l, pares in paginas.items() if l != leg for par in pares]
        for nome, vid in paginas[leg] + atuais + outras:
            mapa.setdefault(chave(nome), vid)
        todos = dict(mapa)
        for nome, vid in antigos + autores:
            todos.setdefault(chave(nome), vid)
        for alternativo, parlamentar in curados.items():
            if chave(parlamentar) in todos:
                mapa.setdefault(chave(alternativo), todos[chave(parlamentar)])
        for nome, vid in antigos + autores:
            mapa.setdefault(chave(nome), vid)
        nomes[leg] = mapa
    return pessoa, nomes


def analisar_legislatura(leg, dados, pessoa, nomes, prefixos_casos):
    """Indicadores por vereador e votações relevantes de uma legislatura encerrada.
    Devolve (resumo para dados-base.js, votações, sessões)."""
    info_leg = LEGISLATURAS_FECHADAS[leg]
    desconhecidos = Counter()

    def resolver(nome):
        vid = nomes.get(chave(nome))
        return pessoa[vid][0] if vid in pessoa else chave(nome)

    def pessoas(lista):
        saida = []
        for n in lista:
            if not eh_pessoa(n):
                continue
            k = resolver(n)
            if chave(n) not in nomes or nomes[chave(n)] not in pessoa:
                desconhecidos[k] += 1
            saida.append(k)
        return saida

    chaves = {k for k, _ in pessoa.values()}
    ind = {k: novo_indicador() for k in chaves}
    contar_proposituras(dados["proposituras"], ind, resolver, chaves)
    sessoes = dados["sessoes"]
    lista_vot, _, lista_sessoes, total, divididas = processar_sessoes(
        sessoes, ind, chaves, pessoas, lambda x, info: listar_historico(x, info, prefixos_casos))
    for v in lista_vot:
        v["l"] = leg

    por_chave = {}
    for vid, (k, nome) in pessoa.items():  # mesma chave com dois IDs: vale o primeiro (perfil atual)
        por_chave.setdefault(k, (vid, nome))
    na_pagina = {m["id"]: m for m in dados["vereadores"]["legislatura"]}
    lista_ver = []
    for k in chaves:
        d = ind[k]
        vid, nome = por_chave[k]
        m = na_pagina.get(vid)
        if not (m or d["sessoes_presente"] + d["sessoes_ausente"] or sum(d["votos"].values())):
            continue
        x = indicadores_vereador(d)
        lista_ver.append({
            "chave": k, "nome": nome, "id": vid, "slug": slug(nome),
            "partido": m["partido"] if m else "", "cargo": m["cargo"] if m else "",
            "presenca": x["presenca"], "pl_total": x["pl_total"],
            "pl_pp": x["pl_categorias"].get("Política pública/norma", 0), "pl_aprovados": x["pl_aprovados"],
            "mocoes": x["proposituras"].get("Moção", 0), "requerimentos": x["proposituras"].get("Requerimento", 0),
            "votos": x["votos"], "alinhamento_maioria": x["alinhamento_maioria"],
            "divididas_total": x["divididas_total"],
        })
    for k in desconhecidos:  # nome sem ID conhecido: entra com o nome como está no SisCam
        if k not in chaves:
            lista_ver.append({"chave": k, "nome": k, "id": None, "slug": slug(k), "partido": "", "cargo": "",
                              "presenca": {"presente": 0, "ausente": 0, "pct": None}, "pl_total": 0, "pl_pp": 0,
                              "pl_aprovados": 0, "mocoes": 0, "requerimentos": 0, "votos": {},
                              "alinhamento_maioria": None, "divididas_total": 0})
    lista_ver.sort(key=lambda v: (-(v["presenca"]["presente"] + v["presenca"]["ausente"]), v["nome"]))
    if desconhecidos:
        log(AGENTE, f"AVISO: legislatura {leg}, nomes sem ID do SisCam (conferir casos/apelidos.json): "
                    f"{dict(desconhecidos.most_common(15))}")
    props = dados["proposituras"]
    resumo = {
        "ano": leg, "nome": info_leg["nome"],
        "inicio": info_leg["inicio"].isoformat(), "fim": info_leg["fim"].isoformat(),
        "total_sessoes": len(sessoes),
        "sessoes_com_registro": sum(1 for s in sessoes if s["chamadas"] or s["votacoes"]),
        "total_votacoes": total, "votacoes_divididas": divididas, "votacoes_listadas": len(lista_vot),
        "total_proposituras": len(props),
        "por_tipo": dict(Counter(p["tipo"] for p in props).most_common()),
        "vereadores": lista_ver,
    }
    log(AGENTE, f"legislatura {leg}: {len(lista_ver)} vereadores, {len(sessoes)} sessões, {total} votações "
                f"({divididas} divididas, {len(lista_vot)} listadas), {len(props)} proposituras")
    return resumo, lista_vot, [[*x, leg] for x in lista_sessoes]


def historico(ver, perfis, casos, curados):
    """Analisa as legislaturas encerradas. Devolve (resumos, votações, sessões)."""
    fechadas = ler_fechadas()
    if not fechadas:
        return [], [], []
    pessoa, nomes = identidades(ver, perfis, fechadas, curados)
    prefixos_casos = [chave(c["materia"]) for c in casos if c.get("materia")]
    resumos, votacoes, sessoes = [], [], []
    for leg in sorted(fechadas, reverse=True):
        r, v, s = analisar_legislatura(leg, fechadas[leg], pessoa, nomes[leg], prefixos_casos)
        resumos.append(r)
        votacoes += v
        sessoes += s
    return resumos, votacoes, sessoes


# ---------------------------------------------------------------- análise

def main():
    props = ler_json("proposituras.json")
    ver = ler_json("vereadores.json")
    sessoes = ler_json("sessoes.json") if os.path.exists(os.path.join(RAIZ, "dados", "processados", "sessoes.json")) else []
    ler = lambda caminho, padrao: json.load(open(caminho, encoding="utf-8")) if os.path.exists(caminho) else padrao
    casos = ler(os.path.join(RAIZ, "casos", "casos.json"), [])
    arq_apelidos = ler(os.path.join(RAIZ, "casos", "apelidos.json"), {})
    curados = arq_apelidos.get("apelidos", {})

    perfis, apelidos = montar_perfis(ver, curados)
    desconhecidos, ignorados = Counter(), Counter()

    def quem(nome):
        k = chave(nome)
        k = apelidos.get(k, k)
        if k not in perfis:
            desconhecidos[k] += 1
        return k

    def pessoas(nomes):
        """Chaves dos nomes que são de gente (descarta comissões), na ordem do SisCam."""
        saida = []
        for n in nomes:
            if eh_pessoa(n):
                saida.append(quem(n))
            else:
                ignorados[n] += 1
        return saida

    ind = {k: novo_indicador() for k in perfis}
    lista_props = contar_proposituras(props, ind, lambda a: apelidos.get(chave(a), chave(a)), perfis)
    prefixos_casos = [chave(c["materia"]) for c in casos if c.get("materia")]
    lista_vot, pares, lista_sessoes, total_votacoes, divididas = processar_sessoes(
        sessoes, ind, perfis, pessoas, lambda x, info: listar_atual(x, info, prefixos_casos))

    # --- legislaturas anteriores (2017-2020, 2021-2024): fora dos indicadores e rankings atuais
    legislaturas, vot_hist, sess_hist = historico(ver, perfis, casos, arq_apelidos.get("apelidos_anteriores", {}))

    # --- casos documentados: anexa todas as votações oficiais da matéria (de qualquer legislatura)
    for caso in casos:
        alvo = chave(caso.get("materia", ""))
        caso["votacoes"] = sorted((v for v in vot_hist + lista_vot if casa_materia(alvo, v["m"])),
                                  key=lambda v: (v["d"], v["id"]))

    # --- monta perfis finais
    saida_ver = []
    for k, p in perfis.items():
        d = ind[k]
        sess = d["sessoes_presente"] + d["sessoes_ausente"]
        if not (sum(d["proposituras"].values()) or sess or sum(d["votos"].values())):
            continue
        foto = f"fotos/{p['id']}.jpg" if p.get("id") and os.path.exists(os.path.join(SITE, "fotos", f"{p['id']}.jpg")) else ""
        saida_ver.append({**p, "chave": k, "slug": slug(p["nome"]), "foto": foto, **indicadores_vereador(d)})
    saida_ver.sort(key=lambda v: (not v["em_exercicio"], v["nome"]))

    afinidade = {f"{a}|{b}": round(100 * c / t, 1) for (a, b), (c, t) in pares.items() if t >= 3}

    datas = [p["data"] for p in props if p["data"]]
    geral = {
        "gerado_em": datetime.now().astimezone().isoformat(timespec="minutes"),
        "total_proposituras": len(props),
        "por_tipo": dict(Counter(p["tipo"] for p in props).most_common()),
        "por_situacao": dict(Counter(situacao_normal(p["situacao"]) for p in props).most_common()),
        "por_situacao_original": dict(Counter(p["situacao"] for p in props).most_common()),
        "por_mes": dict(sorted(Counter(d[:7] for d in datas).items())),
        "total_sessoes": len(sessoes),
        "total_votacoes": total_votacoes,
        "votacoes_divididas": divididas,
        "votacoes_listadas": len(lista_vot),
        "periodo": [min(datas, default=""), max(datas, default="")],
    }

    # --- arquivos do site
    arq_vot = js([("votacoes", lista_vot), ("sessoes", lista_sessoes)])
    arq_props = js([("proposituras", lista_props)])
    arq_hist = js([("historico", {"votacoes": vot_hist, "sessoes": sess_hist})])
    base = {"geral": geral, "vereadores": saida_ver, "afinidade": afinidade, "casos": casos,
            "apelidos": apelidos, "legislaturas": legislaturas,
            "siscam": {"base": BASE, "tipos": TIPOS_DOCUMENTO},
            "versoes": {"votacoes": hash_curto(arq_vot), "proposituras": hash_curto(arq_props),
                        "historico": hash_curto(arq_hist)}}
    arq_base = js([(k, v) for k, v in base.items()])
    gravar(os.path.join(SITE, "votacoes.js"), arq_vot)
    gravar(os.path.join(SITE, "proposituras.js"), arq_props)
    gravar(os.path.join(SITE, "historico.js"), arq_hist)
    gravar(os.path.join(SITE, "dados-base.js"), arq_base)
    antigo = os.path.join(SITE, "dados.js")  # formato anterior (arquivo único)
    if os.path.exists(antigo):
        os.remove(antigo)
    estaticos = {}
    for nome in ("app.js", "style.css"):
        with open(os.path.join(SITE, nome), encoding="utf-8") as f:
            estaticos[nome] = hash_curto(f.read())
    versionar_index({"dados-base.js": hash_curto(arq_base), **estaticos})
    paginas = gravar_paginas_vereadores(saida_ver, geral)

    salvar_json("indicadores.json", {k: base[k] for k in ("geral", "vereadores", "afinidade", "casos", "apelidos")})
    gravar_historico(saida_ver, geral)

    # --- avisos visíveis no log
    em_ex = sum(v["em_exercicio"] for v in saida_ver)
    if em_ex != VEREADORES_EM_EXERCICIO:
        log(AGENTE, f"AVISO: {em_ex} vereadores em exercício (esperado {VEREADORES_EM_EXERCICIO})")
    if ignorados:
        log(AGENTE, f"ignorados (não são vereadores): {dict(ignorados)}")
    if desconhecidos:
        log(AGENTE, f"AVISO: nomes sem perfil (conferir casos/apelidos.json): {dict(desconhecidos.most_common(15))}")
    log(AGENTE, f"OK: {len(saida_ver)} vereadores ({em_ex} em exercício), {len(lista_props)} proposituras, "
                f"{total_votacoes} votações ({divididas} divididas, {len(lista_vot)} listadas no site), "
                f"{paginas} páginas de vereador; historico.js com {len(vot_hist)} votações "
                f"({len(arq_hist.encode('utf-8')) // 1024} KB)")


if __name__ == "__main__":
    main()
