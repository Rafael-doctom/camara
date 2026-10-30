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
    ctx.fillStyle = "#14110f"; ctx.font = "600 44px Georgia, 'Times New Roman', serif"; ctx.fillText("De olho na Câmara", 166, 136);
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
    quebrar(ctx, o.rodape || "Dados públicos oficiais · rafaelpintodasilva.com/de-olho-na-camara", W - 160).slice(0, 2)
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

  /* ---------- "Eu apoio": cartão de apoio com a posição ideológica, em 1080x1920 (Stories) e 1080x1350 (feed) ---------- */
  const EIXOS = [["economia", "Economia", "Estatista", "Liberal"], ["costumes", "Costumes", "Progressista", "Conservador"],
    ["seguranca", "Segurança", "Garantista", "Rigor penal"], ["ambiente", "Meio ambiente", "Ambientalista", "Desenvolvimentista"],
    ["religiao", "Religião", "Laico", "Religioso"], ["servicos", "Serviços públicos", "Gestão pública", "Concessão privada"],
    ["participacao", "Participação", "Participativo", "Autoridade"], ["impostos", "Impostos", "Mais serviços", "Menos impostos"]];
  const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif", SANS = "'Poppins', Arial, Helvetica, sans-serif", MONO = "'JetBrains Mono', 'Courier New', monospace";
  const COR = { fundo: "#faf8f3", fundo2: "#f1ece3", texto: "#14110f", texto2: "#4a4540", suave: "#8a8279", acento: "#b5532d", amarelo: "#ffd400" };
  const iniciais = (n) => String(n || "").split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ý]/.test(p)).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  // Foto do próprio site entra no cartão; foto de outro domínio (Câmara, Senado, sem CORS) bloquearia o
  // PNG, então vira um círculo com as iniciais.
  function carregarFoto(url) {
    return new Promise((ok) => {
      if (!url) return ok(null);
      let mesmo = false;
      try { mesmo = new URL(url, location.href).origin === location.origin; } catch (e) { /* url inválida */ }
      if (!mesmo) return ok(null);  // Câmara e Senado não mandam CORS: tentar só gera erro no console
      const img = new Image();
      img.onload = () => {
        try { const t = document.createElement("canvas"); t.width = t.height = 2; const c = t.getContext("2d"); c.drawImage(img, 0, 0, 2, 2); c.getImageData(0, 0, 1, 1); ok(img); }
        catch (e) { ok(null); }
      };
      img.onerror = () => ok(null);
      img.src = url;
    });
  }

  function linhasEixos(eixos) {
    return EIXOS.filter(([id]) => eixos && eixos[id] && eixos[id][1]).map(([id, nome, a, b]) => {
      const [soma, n] = eixos[id], val = Math.max(-1, Math.min(1, soma / n)), forca = Math.round(Math.abs(val) * 100);
      return { nome, a, b, val, n, txt: forca < 20 ? "Centro" : `${val < 0 ? a : b} ${forca}%` };
    }).sort((x, y) => y.n - x.n);
  }

  function desenharApoio(o, W, H, foto) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d"), alto = H >= 1800, M = 84, L = W - 2 * M;
    ctx.fillStyle = COR.fundo; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COR.acento; ctx.fillRect(0, 0, W, 16);
    // marca
    ctx.fillStyle = COR.texto; ctx.beginPath(); ctx.arc(M + 22, 78, 22, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = COR.amarelo; ctx.beginPath(); ctx.arc(M + 22, 78, 7, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = COR.texto; ctx.font = `600 34px ${SERIF}`; ctx.textBaseline = "middle"; ctx.fillText("De olho na Câmara", M + 60, 80);
    ctx.textBaseline = "alphabetic";
    let y = alto ? 170 : 140;
    // foto ou iniciais
    const R = alto ? 150 : 100, cx = W / 2;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, y + R, R, 0, 2 * Math.PI); ctx.closePath(); ctx.clip();
    if (foto) {
      const lado = Math.min(foto.width, foto.height * 0.8), sx = (foto.width - lado) / 2;
      ctx.drawImage(foto, sx, 0, lado, lado, cx - R, y, 2 * R, 2 * R);
    } else {
      ctx.fillStyle = COR.fundo2; ctx.fillRect(cx - R, y, 2 * R, 2 * R);
      ctx.fillStyle = COR.acento; ctx.font = `600 ${Math.round(R * 0.8)}px ${SERIF}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(iniciais(o.nome), cx, y + R + 4); ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    ctx.strokeStyle = COR.acento; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, y + R, R + 3, 0, 2 * Math.PI); ctx.stroke();
    y += 2 * R + (alto ? 96 : 74);
    ctx.textAlign = "center";
    ctx.fillStyle = COR.acento; ctx.font = `700 ${alto ? 40 : 32}px ${MONO}`; ctx.fillText("EU APOIO", cx, y); y += alto ? 92 : 72;
    ctx.fillStyle = COR.texto;
    let tam = alto ? 92 : 76;
    ctx.font = `700 ${tam}px ${SERIF}`;
    let nomeL = quebrar(ctx, o.nome, L);
    if (nomeL.length > 2) { tam = Math.round(tam * 0.78); ctx.font = `700 ${tam}px ${SERIF}`; nomeL = quebrar(ctx, o.nome, L); }
    nomeL.slice(0, 3).forEach((l) => { ctx.fillText(l, cx, y); y += tam * 1.08; });
    ctx.fillStyle = COR.texto2; ctx.font = `500 ${alto ? 32 : 28}px ${SANS}`;
    ctx.fillText([o.cargo, o.partido].filter(Boolean).join(" · "), cx, y + 4); y += alto ? 84 : 66;
    // motivo
    if (o.motivo) {
      ctx.fillStyle = COR.suave; ctx.font = `600 ${alto ? 30 : 26}px ${MONO}`; ctx.fillText("PORQUE É", cx, y); y += alto ? 64 : 52;
      ctx.fillStyle = COR.texto; const tm = alto ? 54 : 44; ctx.font = `italic 500 ${tm}px ${SERIF}`;
      quebrar(ctx, "“" + o.motivo + "”", L - 40).slice(0, alto ? 4 : 3).forEach((l) => { ctx.fillText(l, cx, y); y += tm * 1.22; });
      y += alto ? 40 : 22;
    }
    ctx.textAlign = "left";
    // posição ideológica
    const eixos = linhasEixos(o.eixos), rod = alto ? 150 : 120;
    ctx.strokeStyle = "#ddd5c8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); y += alto ? 62 : 52;
    ctx.fillStyle = COR.texto; ctx.font = `700 ${alto ? 40 : 34}px ${SERIF}`; ctx.fillText("Posição ideológica", M, y);
    ctx.fillStyle = COR.suave; ctx.font = `400 ${alto ? 24 : 21}px ${SANS}`; ctx.textAlign = "right";
    const nv = eixos.reduce((s, e) => s + e.n, 0);
    ctx.fillText(nv ? `pelos ${nv} voto${nv > 1 ? "s" : ""} em temas classificados` : "", W - M, y); ctx.textAlign = "left";
    y += alto ? 34 : 26;
    const alt = alto ? 132 : 108, cabem = Math.max(0, Math.floor((H - rod - y) / alt));
    if (!eixos.length) {
      ctx.fillStyle = COR.texto2; ctx.font = `400 ${alto ? 32 : 28}px ${SANS}`;
      quebrar(ctx, "Ainda sem votos nos temas classificados do Painel ideológico para calcular a posição.", L).forEach((l) => { y += 46; ctx.fillText(l, M, y); });
    }
    eixos.slice(0, cabem).forEach((e) => {
      const ty = y + (alto ? 50 : 40);
      ctx.fillStyle = COR.texto; ctx.font = `600 ${alto ? 30 : 26}px ${SANS}`; ctx.fillText(e.nome, M, ty);
      ctx.fillStyle = COR.acento; ctx.font = `600 ${alto ? 26 : 23}px ${MONO}`; ctx.textAlign = "right"; ctx.fillText(e.txt, W - M, ty); ctx.textAlign = "left";
      const ry = ty + (alto ? 34 : 28);
      ctx.fillStyle = "#e6dfd3"; ctx.fillRect(M, ry - 4, L, 8);
      ctx.fillStyle = "#cfc6b8"; ctx.fillRect(W / 2 - 1, ry - 12, 2, 24);
      const px = M + (e.val + 1) / 2 * L;
      ctx.fillStyle = COR.acento; ctx.beginPath(); ctx.arc(px, ry, alto ? 15 : 13, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = COR.suave; ctx.font = `400 ${alto ? 22 : 19}px ${SANS}`;
      ctx.fillText(e.a, M, ry + (alto ? 40 : 34)); ctx.textAlign = "right"; ctx.fillText(e.b, W - M, ry + (alto ? 40 : 34)); ctx.textAlign = "left";
      y += alt;
    });
    // rodapé
    ctx.fillStyle = COR.suave; ctx.font = `400 ${alto ? 24 : 21}px ${SANS}`;
    ["Posição pelos votos em temas classificados: uma pista, não um retrato.", "Dados oficiais · rafaelpintodasilva.com/de-olho-na-camara"]
      .forEach((l, i) => ctx.fillText(l, M, H - rod + 64 + i * (alto ? 36 : 30)));
    return c;
  }

  function baixar(c, nome) {
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  }

  const SUGESTOES = ["presente e trabalha pela cidade", "fiscaliza o dinheiro público", "defende o que eu acredito", "ouve a população", "honesto e transparente"];
  let estilo = false;
  function css() {
    if (estilo) return; estilo = true;
    const st = document.createElement("style");
    st.textContent = `.apoio-dlg{border:0;border-radius:16px;padding:0;width:min(960px,calc(100vw - 24px));max-height:calc(100vh - 24px);background:var(--cartao,#fff);color:var(--texto,#14110f);box-shadow:0 20px 60px rgba(0,0,0,.3)}
.apoio-dlg::backdrop{background:rgba(20,17,15,.55)}.apoio-in{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;padding:22px}
.apoio-in h2{margin:0 0 6px;font-size:1.4rem}.apoio-in label{display:grid;gap:6px;font-size:.88rem;color:var(--texto-2,#4a4540);margin:12px 0}
.apoio-in textarea{font:inherit;font-size:1rem;min-height:84px;padding:10px 12px;border-radius:10px;border:1px solid var(--linha,#ddd);background:var(--fundo,#faf8f3);color:var(--texto,#14110f);resize:vertical}
.apoio-sug{display:flex;flex-wrap:wrap;gap:6px}.apoio-sug button{min-height:36px;padding:4px 12px;font-size:.82rem;border-radius:99px}
.apoio-acoes{display:grid;gap:8px;margin-top:16px}.apoio-acoes .botao-pr,.apoio-acoes button.pr{background:var(--texto,#14110f);color:var(--fundo,#fff);border-color:var(--texto,#14110f)}
.apoio-prev{display:grid;gap:8px;align-content:start;justify-items:center}.apoio-prev canvas{width:100%;height:auto;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.15);background:#faf8f3}
.apoio-fmt{display:flex;gap:6px}.apoio-fmt button[aria-pressed=true]{background:var(--texto,#14110f);color:var(--fundo,#fff)}
.apoio-fechar{position:absolute;top:10px;right:10px;width:40px;height:40px;min-height:0;padding:0;border-radius:50%}
.apoio-nota{font-size:.8rem;color:var(--suave,#8a8279);margin:8px 0 0}
@media(max-width:720px){.apoio-in{grid-template-columns:1fr;padding:18px}.apoio-prev{order:-1}.apoio-prev canvas{width:min(220px,60vw)}}`;
    document.head.appendChild(st);
  }

  // Abre a janela do cartão de apoio. o = { nome, cargo, partido, foto, eixos: {eixo: [soma, n]}, arquivo }
  function apoio(o) {
    css();
    const dlg = document.createElement("dialog");
    dlg.className = "apoio-dlg";
    dlg.setAttribute("aria-label", "Cartão de apoio");
    dlg.innerHTML = `<button type="button" class="apoio-fechar" aria-label="Fechar">✕</button><div class="apoio-in">
      <div><h2>Eu apoio ${o.nome.replace(/[<>&]/g, "")}</h2>
        <p class="apoio-nota" style="margin:0">Monte uma imagem para os Stories ou o feed, com o motivo do seu apoio e a posição ideológica pelos votos.</p>
        <label>Porque é…<textarea maxlength="110" placeholder="Escreva o motivo"></textarea></label>
        <div class="apoio-sug" aria-label="Sugestões">${SUGESTOES.map((t) => `<button type="button">${t}</button>`).join("")}</div>
        <div class="apoio-acoes">
          <button type="button" class="pr" data-baixar="1920">Baixar PNG 1080 × 1920 (Stories)</button>
          <button type="button" data-baixar="1350">Baixar PNG 1080 × 1350 (feed)</button>
          <button type="button" data-partilhar hidden>Compartilhar no celular</button>
        </div>
        <p class="apoio-nota" id="apoio-foto-nota" hidden>A foto oficial não pode entrar na imagem (o site da Câmara ou do Senado não permite); usamos as iniciais.</p>
      </div>
      <div class="apoio-prev"><div class="apoio-fmt" role="group" aria-label="Prévia"><button type="button" aria-pressed="true" data-fmt="1920">Stories</button><button type="button" aria-pressed="false" data-fmt="1350">Feed</button></div><div id="apoio-tela"></div></div>
    </div>`;
    document.body.appendChild(dlg);
    const ta = dlg.querySelector("textarea"), tela = dlg.querySelector("#apoio-tela");
    let fmt = 1920, foto = null, t = 0;
    const dados = () => ({ ...o, motivo: ta.value.trim() });
    const prev = () => { tela.innerHTML = ""; tela.appendChild(desenharApoio(dados(), 1080, fmt, foto)); };
    const agendar = () => { clearTimeout(t); t = setTimeout(prev, 150); };
    ta.addEventListener("input", agendar);
    dlg.querySelectorAll(".apoio-sug button").forEach((b) => b.addEventListener("click", () => { ta.value = b.textContent; prev(); }));
    dlg.querySelectorAll("[data-fmt]").forEach((b) => b.addEventListener("click", () => {
      fmt = +b.dataset.fmt; dlg.querySelectorAll("[data-fmt]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); prev(); }));
    const nome = (h) => `${o.arquivo || "apoio"}-${h === 1920 ? "stories" : "feed"}.png`;
    dlg.querySelectorAll("[data-baixar]").forEach((b) => b.addEventListener("click", () => { const h = +b.dataset.baixar; baixar(desenharApoio(dados(), 1080, h, foto), nome(h)); }));
    const bp = dlg.querySelector("[data-partilhar]");
    if (navigator.canShare && typeof File === "function") {
      bp.hidden = false;
      bp.addEventListener("click", () => desenharApoio(dados(), 1080, fmt, foto).toBlob((blob) => {
        const arq = new File([blob], nome(fmt), { type: "image/png" });
        if (navigator.canShare({ files: [arq] })) navigator.share({ files: [arq], title: "Eu apoio " + o.nome }).catch(() => {});
        else baixar(desenharApoio(dados(), 1080, fmt, foto), nome(fmt));
      }, "image/png"));
    }
    const fechar = () => { dlg.close(); dlg.remove(); };
    dlg.querySelector(".apoio-fechar").addEventListener("click", fechar);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) fechar(); });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    prev();
    const pronto = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.all([carregarFoto(o.foto), pronto]).then(([img]) => {
      foto = img;
      if (o.foto && !img) dlg.querySelector("#apoio-foto-nota").hidden = false;
      prev();
    });
    ta.focus();
  }

  window.OlhoCartao = { compartilhar, desenhar, apoio, desenharApoio };
})();
