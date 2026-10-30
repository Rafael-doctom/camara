"""Agente coletor de proposituras.

Baixa do SisCam (exportação CSV oficial) todas as proposituras de cada ano da
legislatura: projetos de lei, moções, requerimentos, indicações etc.
Saída: dados/<cidade>/processados/proposituras.json (cidade em --cidade; padrão tatui)

Legislatura encerrada: `python coletor_proposituras.py --legislatura 2021` grava
proposituras_2021.json com os anos daquela legislatura (CSV em cache permanente).

O link de cada propositura não é gravado: o site monta a partir de tipo, número e ano
(ver `url_consulta` aqui e `urlProposicao` em site/app.js).
"""
import csv
import io
import os
import sys
from datetime import date

from comum import (BASE, BRUTOS, INICIO_LEGISLATURA, LEGISLATURAS_FECHADAS, MODULO, MODULO_DOCUMENTOS,
                   TIPOS_DOCUMENTO, abortar, baixar, checar_sanidade, data_br, ler_legislatura, log, salvar_json)

AGENTE = "proposituras"
COLUNAS = {"Documento", "Numero", "Ano", "Data", "Ementa", "Autoria", "Situação"}


def url_exportacao(ano):
    return (f"{BASE}/Documentos/Exportar?tipo=2&Pesquisa=Avancada&id={MODULO_DOCUMENTOS}&pagina=1&Modulo={MODULO}"
            f"&Documento=0&Numeracao=Documento&AnoInicial={ano}&AnoFinal={ano}"
            "&Situacao=0&Classificacao=0&TipoAutor=Todos&AutoriaId=0&NoTexto=false")


def url_consulta(tipo, numero, ano):
    """Link para a ficha oficial da propositura (pesquisa exata por número/ano)."""
    tipo_id = TIPOS_DOCUMENTO.get(tipo, 0)
    return (f"{BASE}/Documentos/Pesquisa?Pesquisa=Avancada&id={MODULO_DOCUMENTOS}&pagina=1&Modulo={MODULO}"
            f"&Documento={tipo_id}&Numeracao=Documento&NumeroInicial={numero}&AnoInicial={ano}"
            f"&NumeroFinal={numero}&AnoFinal={ano}&Situacao=0&Classificacao=0&TipoAutor=Todos"
            "&AutoriaId=0&NoTexto=false")


def csv_valido(texto):
    """A primeira linha precisa ser o cabeçalho esperado (senão é página de erro ou o formato mudou)."""
    cabecalho = set(texto.lstrip("﻿").split("\n", 1)[0].strip().split(";"))
    return COLUNAS <= cabecalho


def coletar(anos, permanente=False):
    """`permanente`: anos de legislatura encerrada, o CSV em cache não expira."""
    itens = []
    hoje = date.today().year
    for ano in anos:
        destino = os.path.join(BRUTOS, f"proposituras_{ano}.csv")
        # Anos fechados quase não mudam: cache de 30 dias. Ano corrente: 12 horas.
        idade = None if permanente else 0.5 if ano >= hoje else 30
        log(AGENTE, f"baixando {ano}...")
        try:
            texto = baixar(url_exportacao(ano), destino, max_idade_dias=idade, validar=csv_valido)
        except RuntimeError as e:
            abortar(AGENTE, f"{e}. Arquivo anterior mantido.", codigo=1)
        linhas = list(csv.DictReader(io.StringIO(texto), delimiter=";"))
        log(AGENTE, f"{ano}: {len(linhas)} proposituras")
        for l in linhas:
            if not (l.get("Ano") or "").strip().isdigit():
                abortar(AGENTE, f"linha sem ano no CSV de {ano}: {l}")
            itens.append({
                "tipo": (l.get("Documento") or "").strip(),
                "numero": int(l["Numero"]) if l.get("Numero", "").isdigit() else l.get("Numero"),
                "ano": int(l["Ano"]),
                "data": data_br(l.get("Data", "")),
                "ementa": (l.get("Ementa") or "").strip(),
                "autores": [a.strip() for a in (l.get("Autoria") or "").split(",") if a.strip()],
                "situacao": (l.get("Situação") or "").strip(),
                "protocolo": (l.get("Protocolo") or "").strip(),
                "classificacao": (l.get("Classificacao") or "").strip(),
            })
    return itens


def contar(itens):
    return {"proposituras": len(itens)}


def main():
    leg = ler_legislatura(sys.argv, AGENTE)
    if leg:
        info = LEGISLATURAS_FECHADAS[leg]
        nome, anos = f"proposituras_{leg}.json", range(info["inicio"].year, info["fim"].year + 1)
    else:
        nome, anos = "proposituras.json", range(INICIO_LEGISLATURA.year, date.today().year + 1)
        pedidos = [a for a in sys.argv[1:] if a.isdigit()]
        if pedidos:  # ex.: python coletor_proposituras.py 2025 2026 --forcar
            anos = [int(a) for a in pedidos]
    itens = coletar(anos, permanente=bool(leg))
    if not itens:
        abortar(AGENTE, "nenhuma propositura nos CSVs: formato mudou? Arquivo anterior mantido.")
    checar_sanidade(AGENTE, nome, itens, contar)
    caminho = salvar_json(nome, itens)
    log(AGENTE, f"OK: {len(itens)} proposituras em {caminho}")


if __name__ == "__main__":
    main()
