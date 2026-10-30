"""Agente coletor de vereadores.

Lê a página oficial de vereadores em exercício (nome, partido, e-mail, foto), a página da
legislatura (todos que exerceram mandato, com início, término e cargo) e o cadastro de autores
do SisCam (nome -> ID). Baixa as fotos para site/<cidade>/fotos/<id>.jpg.
Saída: dados/<cidade>/processados/vereadores.json (cidade em --cidade; padrão tatui)

Legislatura encerrada: `python coletor_vereadores.py --legislatura 2021` grava vereadores_2021.json
com a página daquela legislatura e a lista /Vereadores/Anteriores (ID -> nome parlamentar), usada
pelo analista para ligar a mesma pessoa entre legislaturas.
"""
import os
import re
import shutil
import subprocess
import sys

from comum import (BASE, BRUTOS, FOLGA_LISTA_EXERCICIO, FOTOS, LEGISLATURA_ID, LEGISLATURAS_FECHADAS, MODULO,
                   MODULO_DOCUMENTOS, VEREADORES_EM_EXERCICIO, abortar, baixar, baixar_imagem, chave, checar_sanidade, data_br, ler_legislatura,
                   limpar_html, log, pagina_siscam, salvar_json)

AGENTE = "vereadores"


def em_exercicio():
    texto = baixar(f"{BASE}/Vereadores", os.path.join(BRUTOS, "vereadores.html"), max_idade_dias=1,
                   validar=lambda t: pagina_siscam(t) and "/Vereadores/Vereador/" in t)
    lista = []
    for bloco in texto.split("data-list-item")[1:]:
        m = re.search(r'<h4><a href="/Vereadores/Vereador/(\d+)">(.*?)</a></h4>', bloco, re.S)
        if not m:
            continue
        vid, nome = int(m.group(1)), limpar_html(m.group(2))
        civil = re.search(r'title="([^"]+)"', bloco)
        partido = re.search(r"<strong>Partido:</strong>(.*?)</p>", bloco, re.S)
        email = re.search(r"<strong>E-mail:</strong>(.*?)</p>", bloco, re.S)
        lista.append({
            "id": vid,
            "nome": nome,
            "nome_civil": limpar_html(civil.group(1)) if civil else "",
            "partido": limpar_html(partido.group(1)) if partido else "",
            "email": limpar_html(email.group(1)) if email else "",
            "em_exercicio": True,
        })
    return lista


def legislatura(leg_id=LEGISLATURA_ID, destino=None, max_idade_dias=1):
    """Todos que exerceram mandato na legislatura, inclusive suplentes e quem saiu.
    Nas legislaturas encerradas o SisCam lista os titulares, mas nem todos os suplentes que assumiram."""
    texto = baixar(f"{BASE}/Legislaturas/Legislatura/{leg_id}",
                   destino or os.path.join(BRUTOS, "legislatura.html"), max_idade_dias=max_idade_dias,
                   validar=lambda t: pagina_siscam(t) and "/Vereadores/Vereador/" in t)
    lista = []
    for linha in re.findall(r"<tr>(.*?)</tr>", texto, re.S):
        m = re.search(r'<a href="/Vereadores/Vereador/(\d+)">(.*?)</a>', linha, re.S)
        if not m:
            continue
        cel = [limpar_html(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", linha, re.S)]
        cel += [""] * (6 - len(cel))
        lista.append({
            "id": int(m.group(1)), "nome": limpar_html(m.group(2)),
            "inicio": data_br(cel[1]), "fim": data_br(cel[2]), "partido": cel[3],
            "votos": int(cel[4]) if cel[4].isdigit() else None, "cargo": cel[5],
        })
    return lista


def anteriores():
    """{id: nome parlamentar} de /Vereadores/Anteriores (todas as legislaturas, 15 por página).
    Não inclui quem está na legislatura atual. Cache de 30 dias."""
    mapa, pagina = {}, 1
    while pagina < 100:
        texto = baixar(f"{BASE}/Vereadores/Anteriores?Pagina={pagina}",
                       os.path.join(BRUTOS, "anteriores", f"{pagina}.html"), max_idade_dias=30,
                       validar=pagina_siscam)
        novos = {int(i): limpar_html(n) for i, n in
                 re.findall(r'<h4><a href="/Vereadores/Vereador/(\d+)">(.*?)</a></h4>', texto, re.S)}
        novos = {i: n for i, n in novos.items() if i not in mapa}
        if not novos:
            break
        mapa.update(novos)
        pagina += 1
    return mapa


def cadastro_autores():
    """Mapa nome -> ID de todos os autores do SisCam (inclui ex-vereadores)."""
    texto = baixar(f"{BASE}/Documentos/Pesquisa?Pesquisa=Avancada&id={MODULO_DOCUMENTOS}&Modulo={MODULO}",
                   os.path.join(BRUTOS, "pesquisa_form.html"), max_idade_dias=7,
                   validar=lambda t: 'name="AutoriaId"' in t)
    m = re.search(r'<select[^>]*name="AutoriaId"[^>]*>(.*?)</select>', texto, re.S)
    mapa = {}
    if m:
        for vid, nome in re.findall(r'<option value="(\d+)"[^>]*>([^<]+)', m.group(1)):
            if vid != "0":
                mapa.setdefault(chave(limpar_html(nome)), int(vid))
    return mapa


LARGURA_FOTO = 320  # px; o original do SisCam tem 800x1000 e ~400 KB

# Reduz JPEGs com o System.Drawing do Windows (sem dependências extras). Lê pares origem|destino.
REDUZIR_PS = r"""
Add-Type -AssemblyName System.Drawing
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$par = New-Object System.Drawing.Imaging.EncoderParameters 1
$par.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]82)
foreach ($linha in $input) {
  $o, $d = $linha -split '\|'
  $img = [System.Drawing.Image]::FromFile($o)
  $l = [Math]::Min(%d, $img.Width); $a = [int]($img.Height * $l / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap $l, $a
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, 0, 0, $l, $a)
  $bmp.Save($d, $codec, $par)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}
""" % LARGURA_FOTO


def reduzir_fotos(pares):
    """Gera as versões leves do site. Sem PowerShell, copia o original (funciona, só pesa mais)."""
    if not pares:
        return
    tmp = [(o, d + ".tmp") for o, d in pares]
    try:
        subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", REDUZIR_PS],
                       input="\n".join(f"{o}|{d}" for o, d in tmp), text=True, check=True,
                       capture_output=True, timeout=300)
        for (_, t), (_, d) in zip(tmp, pares):
            os.replace(t, d)
    except (OSError, subprocess.SubprocessError) as e:
        if reduzir_com_pillow(pares):  # Linux/Mac: Pillow, se estiver instalado (opcional)
            return
        log(AGENTE, f"AVISO: não reduziu as fotos ({e}); usando o original")
        for o, d in pares:
            shutil.copyfile(o, d + ".tmp")
            os.replace(d + ".tmp", d)


def reduzir_com_pillow(pares):
    try:
        from PIL import Image
    except ImportError:
        return False
    for o, d in pares:
        with Image.open(o) as img:
            img = img.convert("RGB")
            if img.width > LARGURA_FOTO:
                img = img.resize((LARGURA_FOTO, round(img.height * LARGURA_FOTO / img.width)), Image.LANCZOS)
            img.save(d + ".tmp", "JPEG", quality=82)
        os.replace(d + ".tmp", d)
    return True


def baixar_fotos(ids):
    """Foto oficial em dados/brutos/fotos (cache de 30 dias) e versão leve em site/fotos/<id>.jpg.
    Falha de foto não é fatal: o site mostra as iniciais."""
    os.makedirs(FOTOS, exist_ok=True)
    faltando, pares = [], []
    for vid in ids:
        origem, destino = os.path.join(BRUTOS, "fotos", f"{vid}.jpg"), os.path.join(FOTOS, f"{vid}.jpg")
        if not baixar_imagem(f"{BASE}/Vereadores/Foto/{vid}", origem):
            faltando.append(vid)
        elif not os.path.exists(destino) or os.path.getmtime(destino) < os.path.getmtime(origem):
            pares.append((origem, destino))
    reduzir_fotos(pares)
    if faltando:
        log(AGENTE, f"AVISO: sem foto para os IDs {faltando} (o site mostra as iniciais)")
    return len(ids) - len(faltando)


def contar(dados):
    return {"em exercício": len(dados["em_exercicio"]), "legislatura": len(dados.get("legislatura", [])),
            "autores": len(dados["autores"])}


def main_fechada(leg):
    """Legislatura encerrada: membros (página da legislatura) e mapa de ex-vereadores."""
    info = LEGISLATURAS_FECHADAS[leg]
    membros = legislatura(info["id"], os.path.join(BRUTOS, f"legislatura_{info['id']}.html"), None)
    antigos = anteriores()
    # Mínimos baixos de propósito: o número de cadeiras muda entre legislaturas (Iperó tinha 12 em
    # 2017) e SisCam de cidade pequena lista poucos ex-vereadores. 9 é o mínimo da Constituição.
    if len(membros) < 9:
        abortar(AGENTE, f"página da legislatura {leg} com {len(membros)} nomes: layout mudou?")
    if len(antigos) < VEREADORES_EM_EXERCICIO:
        abortar(AGENTE, f"/Vereadores/Anteriores com só {len(antigos)} nomes: layout mudou?")
    nome = f"vereadores_{leg}.json"
    dados = {"legislatura": membros, "anteriores": antigos}
    checar_sanidade(AGENTE, nome, dados, lambda d: {"legislatura": len(d["legislatura"]),
                                                     "anteriores": len(d["anteriores"])})
    salvar_json(nome, dados)
    log(AGENTE, f"OK: legislatura {leg}: {len(membros)} nomes; {len(antigos)} ex-vereadores no SisCam")


def main():
    leg = ler_legislatura(sys.argv, AGENTE)
    if leg:
        return main_fechada(leg)
    # Sem página da legislatura atual no SisCam (legislatura_atual.id nulo): segue só com a lista.
    lista, autores = em_exercicio(), cadastro_autores()
    membros = legislatura() if LEGISLATURA_ID else []
    maximo = VEREADORES_EM_EXERCICIO + FOLGA_LISTA_EXERCICIO
    if not VEREADORES_EM_EXERCICIO <= len(lista) <= maximo:
        abortar(AGENTE, f"sanidade: {len(lista)} vereadores em exercício (esperado {VEREADORES_EM_EXERCICIO}"
                        + (f" a {maximo}" if FOLGA_LISTA_EXERCICIO else "") + "). Arquivo anterior mantido.")
    if len(lista) != VEREADORES_EM_EXERCICIO:
        log(AGENTE, f"AVISO: o SisCam lista {len(lista)} em exercício para {VEREADORES_EM_EXERCICIO} cadeiras; "
                    "o analista confere com as chamadas recentes")
    if LEGISLATURA_ID and len(membros) < VEREADORES_EM_EXERCICIO:
        abortar(AGENTE, f"página da legislatura com {len(membros)} nomes: layout mudou?")
    dados = {"em_exercicio": lista, "legislatura": membros, "autores": autores}
    checar_sanidade(AGENTE, "vereadores.json", dados, contar)
    fotos = baixar_fotos(sorted({v["id"] for v in lista + membros}))
    salvar_json("vereadores.json", dados)
    log(AGENTE, f"OK: {len(lista)} em exercício, {len(membros)} na legislatura, "
                f"{len(autores)} autores, {fotos} fotos")


if __name__ == "__main__":
    main()
