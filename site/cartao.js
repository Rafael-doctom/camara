/* Cartão de imagem para compartilhar (WhatsApp, Instagram): desenha um PNG 1080x1350 num canvas e
   abre o compartilhamento do celular com a imagem; sem suporte, baixa o arquivo.
   Uso: OlhoCartao.compartilhar({ rotulo, titulo, subtitulo, linhas: [[valor, legenda], ...], rodape, arquivo }) */
(function () {
  "use strict";
  const W = 1080, H = 1350;

  // Quebra o texto em linhas que caibam na largura.
  function quebrar(ctx, texto, largura) {
    const linhas = [];
    let atual = "";
    String(texto || "").split(/\s+/).forEach((p) => {
      const t = atual ? atual + " " + p : p;
      if (ctx.measureText(t).width > largura && atual) { linhas.push(atual); atual = p; } else atual = t;
    });
    if (atual) linhas.push(atual);
    return linhas;
  }

  function desenhar(o) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#faf8f3"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#b5532d"; ctx.fillRect(0, 0, W, 18);
    // marca
    ctx.fillStyle = "#14110f"; ctx.beginPath(); ctx.arc(110, 120, 34, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "#ffd400"; ctx.beginPath(); ctx.arc(110, 120, 11, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "#14110f"; ctx.font = "600 44px Georgia, 'Times New Roman', serif"; ctx.fillText("Olho na Câmara", 166, 136);
    let y = 270;
    if (o.rotulo) { ctx.fillStyle = "#b5532d"; ctx.font = "700 30px 'Courier New', monospace"; ctx.fillText(String(o.rotulo).toUpperCase(), 80, y); y += 70; }
    ctx.fillStyle = "#14110f"; ctx.font = "700 84px Georgia, 'Times New Roman', serif";
    quebrar(ctx, o.titulo, W - 160).slice(0, 3).forEach((l) => { ctx.fillText(l, 80, y); y += 96; });
    if (o.subtitulo) {
      ctx.fillStyle = "#4a4540"; ctx.font = "400 38px Arial, Helvetica, sans-serif"; y += 6;
      quebrar(ctx, o.subtitulo, W - 160).slice(0, 4).forEach((l) => { ctx.fillText(l, 80, y); y += 52; });
    }
    y += 40;
    (o.linhas || []).slice(0, 4).forEach(([valor, legenda]) => {
      ctx.fillStyle = "#f1ece3"; ctx.fillRect(80, y, W - 160, 150);
      ctx.fillStyle = "#14110f"; ctx.font = "700 64px Georgia, 'Times New Roman', serif"; ctx.fillText(String(valor), 120, y + 88);
      ctx.fillStyle = "#4a4540"; ctx.font = "400 30px Arial, Helvetica, sans-serif";
      quebrar(ctx, legenda, W - 240).slice(0, 1).forEach((l) => ctx.fillText(l, 120, y + 128));
      y += 172;
    });
    ctx.fillStyle = "#8a8279"; ctx.font = "400 28px Arial, Helvetica, sans-serif";
    quebrar(ctx, o.rodape || "Dados públicos oficiais · rafaelpintodasilva.com/camara", W - 160).slice(0, 2)
      .forEach((l, i) => ctx.fillText(l, 80, H - 90 + i * 36));
    return c;
  }

  function compartilhar(o) {
    const c = desenhar(o), nome = (o.arquivo || "olho-na-camara") + ".png";
    c.toBlob((blob) => {
      if (!blob) return;
      const arq = typeof File === "function" ? new File([blob], nome, { type: "image/png" }) : null;
      if (arq && navigator.canShare && navigator.canShare({ files: [arq] })) {
        navigator.share({ files: [arq], title: o.titulo, text: o.texto || "" }).catch(() => {});
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  }

  window.OlhoCartao = { compartilhar, desenhar };
})();
