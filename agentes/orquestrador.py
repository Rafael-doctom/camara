"""Orquestrador: roda os agentes na ordem certa e registra o resultado.

Uso:
    python agentes/orquestrador.py              # coleta tudo e regenera o site
    python agentes/orquestrador.py --so-site    # só recalcula indicadores com os dados já baixados
    python agentes/orquestrador.py --historico  # coleta de novo as legislaturas encerradas

Legislaturas encerradas (2017-2020, 2021-2024) não mudam: os coletores delas só rodam quando o
arquivo processado (ex.: dados/processados/sessoes_2021.json) não existe, ou com --historico.

Se um coletor falha, o arquivo anterior dele fica intacto (gravação atômica e checagem de
sanidade), então o analista roda mesmo assim com os últimos dados bons. O código de saída
é o maior entre as etapas: 0 ok, 1 falha de coleta, 2 sanidade (queda suspeita nos totais).
"""
import os
import subprocess
import sys
from datetime import datetime

from comum import LEGISLATURAS_FECHADAS, PROCESSADOS, RAIZ, log

AQUI = os.path.dirname(os.path.abspath(__file__))
COLETORES = ["coletor_vereadores.py", "coletor_proposituras.py", "coletor_sessoes.py"]


def etapas_historico(forcar):
    """[(coletor, argumentos)] das legislaturas encerradas cujo arquivo ainda não existe."""
    saida = []
    for leg in LEGISLATURAS_FECHADAS:
        for coletor in COLETORES:
            arquivo = coletor.replace("coletor_", "").replace(".py", f"_{leg}.json")
            if forcar or not os.path.exists(os.path.join(PROCESSADOS, arquivo)):
                saida.append((coletor, ["--legislatura", str(leg)]))
    return saida


def main():
    if "--so-site" in sys.argv:
        etapas = [("analista.py", [])]
    else:
        etapas = ([(c, []) for c in COLETORES] + etapas_historico("--historico" in sys.argv)
                  + [("analista.py", [])])
    extras = [a for a in sys.argv[1:] if a == "--forcar"]
    os.makedirs(os.path.join(RAIZ, "dados", "logs"), exist_ok=True)
    arquivo_log = os.path.join(RAIZ, "dados", "logs", f"execucao_{datetime.now():%Y-%m-%d_%H%M}.log")
    falhas, codigo = [], 0
    with open(arquivo_log, "w", encoding="utf-8") as saida:
        for script, args in etapas:
            etapa = " ".join([script, *args])
            log("orquestrador", f"rodando {etapa}")
            r = subprocess.run([sys.executable, os.path.join(AQUI, script), *args, *extras], cwd=AQUI,
                               stdout=saida, stderr=subprocess.STDOUT,
                               env={**os.environ, "PYTHONIOENCODING": "utf-8"})
            if r.returncode != 0:
                falhas.append(f"{etapa} (código {r.returncode})")
                codigo = max(codigo, r.returncode)
                log("orquestrador", f"FALHOU: {etapa}, código {r.returncode} (ver {arquivo_log})")
    log("orquestrador", "concluído" + (f" com falhas: {falhas}" if falhas else " sem falhas") + f". Log: {arquivo_log}")
    sys.exit(codigo)


if __name__ == "__main__":
    main()
