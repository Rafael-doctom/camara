/* modelos.js: peças comuns aos três modelos da página de Votações (protótipos para comparar).
   Não é usado pelo site principal. Lê window.DADOS de ../dados-base.js e ../votacoes.js.
   As funções repetem as do app.js (titulo, foto, barraPlacar, gradeVotos) para que cada
   modelo funcione sozinho, aberto direto do disco (file://). */
(function () {
  "use strict";
  const D = window.DADOS || {};
  const SITE = "../index.html";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (n ?? 0).toLocaleString("pt-BR");
  const dataBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const iniciais = (nome) => String(nome).split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("");

  const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "ao", "em", "na", "no"]);
  function titulo(s) {
    return String(s ?? "").toLocaleLowerCase("pt-BR").replace(/[^\s,;()/-]+/g, (p, i) => {
      if (i > 0 && MINUSCULAS.has(p)) return p;
      if (!/[aeiouáéíóúâêôãõàü]/.test(p)) return p.toLocaleUpperCase("pt-BR");
      return p[0].toLocaleUpperCase("pt-BR") + p.slice(1);
    });
  }

  const vereadores = D.vereadores || [];
  const porChave = Object.fromEntries(vereadores.map((v) => [v.chave, v]));
  const nomeDe = (k) => titulo(porChave[k] ? porChave[k].nome : k);
  const hrefPerfil = (k) => `${SITE}#vereador/${encodeURIComponent(k)}`;
  const hrefVotacao = (v) => `${SITE}#votacao/${encodeURIComponent(v.id)}`;

  function foto(k, cls) {
    const v = porChave[k], nome = v ? v.nome : k;
    const c = "foto" + (cls ? " " + cls : "");
    if (!v || !/^fotos\/\d+\.jpg$/.test(v.foto || "")) return `<span class="${c}" aria-hidden="true">${esc(iniciais(titulo(nome)))}</span>`;
    return `<span class="${c}" aria-hidden="true"><img src="../${esc(v.foto)}" alt="" loading="lazy" data-iniciais="${esc(iniciais(titulo(nome)))}"></span>`;
  }
  // Foto que não carrega vira as iniciais.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.dataset.iniciais != null) img.replaceWith(document.createTextNode(img.dataset.iniciais));
  }, true);

  function pessoa(k, extra) {
    return `<a class="pessoa" href="${hrefPerfil(k)}">${foto(k)}<span class="pessoa-txt"><span class="pessoa-nome">${esc(nomeDe(k))}</span>${extra ? `<span class="pessoa-extra">${extra}</span>` : ""}</span></a>`;
  }

  const ROT_VOTO = { favor: "A favor", contra: "Contra", abstencao: "Abstenção", ausente: "Ausente", nao_vota: "Não vota" };
  const aprovou = (r) => /aprov/i.test(r || "") && !/n[ãa]o/i.test(r || "");
  const resultado = (v) => (aprovou(v.r) ? "Aprovado" : v.r ? titulo(v.r) : "Sem resultado");
  const etqResultado = (v) => `<span class="etq ${aprovou(v.r) ? "etq-favor" : "etq-contra"}">${esc(resultado(v))}</span>`;
  const ladoDe = (v, k) => (v.v ? Object.keys(v.v).find((o) => v.v[o].includes(k)) : undefined);
  const temNomes = (v) => !!(v.v && Object.keys(v.v).length);

  // Placar em barra (a cor reforça; número e palavra estão sempre escritos).
  function placar(n, grande) {
    n = n || {};
    const f = n.favor || 0, c = n.contra || 0, o = (n.abstencao || 0) + (n.ausente || 0) + (n.nao_vota || 0);
    const t = f + c + o || 1;
    const leg = [`<span class="lf"><b>${f}</b> a favor</span>`, `<span class="lc"><b>${c}</b> contra</span>`];
    if (grande) ["abstencao", "ausente", "nao_vota"].forEach((k) => { if (n[k]) leg.push(`<span class="lo"><b>${n[k]}</b> ${ROT_VOTO[k].toLowerCase()}</span>`); });
    else if (o) leg.push(`<span class="lo"><b>${o}</b> ${o === 1 ? "outro" : "outros"}</span>`);
    return `<div class="placar-v${grande ? " placar-g" : ""}">
      <div class="placar-trilho" aria-hidden="true"><span class="pf" style="width:${(100 * f) / t}%"></span><span class="pc" style="width:${(100 * c) / t}%"></span><span class="po" style="width:${(100 * o) / t}%"></span></div>
      <div class="placar-leg">${leg.join("")}</div></div>`;
  }
  // Só a barra, sem legenda (para linhas compactas; o número vem escrito ao lado).
  function trilho(n) {
    n = n || {};
    const f = n.favor || 0, c = n.contra || 0, o = (n.abstencao || 0) + (n.ausente || 0) + (n.nao_vota || 0);
    const t = f + c + o || 1;
    return `<div class="placar-trilho" aria-hidden="true"><span class="pf" style="width:${(100 * f) / t}%"></span><span class="pc" style="width:${(100 * c) / t}%"></span><span class="po" style="width:${(100 * o) / t}%"></span></div>`;
  }

  function gradeVotos(v) {
    const ordem = ["favor", "contra", "abstencao", "ausente", "nao_vota"];
    const grupos = ordem.filter((k) => v.v && v.v[k] && v.v[k].length);
    if (!grupos.length) return `<p class="suave">O SisCam registrou só o placar desta votação, sem o nome de quem votou.</p>`;
    return `<div class="votos-grade">${grupos.map((k) => `<section class="vg vg-${k}">
      <h3><span class="vg-marca" aria-hidden="true"></span>${ROT_VOTO[k]} <span class="vg-n">${v.v[k].length}</span></h3>
      ${k === "nao_vota" ? `<p class="vg-exp">Em geral, quem preside a sessão, que só vota em caso de desempate.</p>` : ""}
      <ul>${v.v[k].map((ch) => `<li>${pessoa(ch)}</li>`).join("")}</ul></section>`).join("")}</div>`;
  }

  // Quem ficou do lado menor: em geral, quem votou contra; se o "contra" venceu, quem votou a favor.
  function minoria(v) {
    if (!temNomes(v)) return null;
    const f = (v.v.favor || []), c = (v.v.contra || []);
    if (!f.length && !c.length) return null;
    if (c.length && c.length <= f.length) return { lado: "contra", rot: "Votaram contra", nomes: c };
    if (f.length && f.length < c.length) return { lado: "favor", rot: "Votaram a favor", nomes: f };
    return null;
  }

  // Tipo da matéria, com o nome que o morador entende.
  const tipoMat = (v) => v.m.split(" Nº")[0].split(" N°")[0];
  const TIPOS = {
    "Projeto de Lei": ["Projeto de lei", "Proposta de nova lei municipal."],
    "Projeto de Lei Complementar": ["Lei complementar", "PLC: projeto que muda leis básicas da cidade, como impostos e servidores."],
    "Veto": ["Veto", "O prefeito recusou uma lei aprovada; a Câmara decide se mantém a recusa."],
    "Emenda": ["Emenda", "Mudança no texto de um projeto."],
    "Moção": ["Moção", "Manifestação da Câmara: aplauso, apoio ou repúdio. Não vira lei."],
    "Requerimento": ["Requerimento", "Pedido de informação ou de providência, inclusive de investigação (CEI)."],
    "Projeto de Decreto Legislativo": ["Decreto legislativo", "Decisão da própria Câmara, como títulos de cidadão e contas."],
    "Projeto de Resolução": ["Resolução", "Regra interna da Câmara."],
    "Parecer": ["Parecer", "Opinião de uma comissão sobre um projeto, votada antes dele."],
  };
  const tipoNome = (v) => (TIPOS[tipoMat(v)] || [tipoMat(v)])[0];
  const ehLei = (v) => /^(Projeto de Lei|Projeto de Lei Complementar|Veto)$/.test(tipoMat(v));
  const negado = (v) => !aprovou(v.r);
  // Votações que o morador mais procura: leis, vetos, temas sensíveis e pedidos negados, quando houve divergência.
  const importante = (v) => (v.div || negado(v)) && (ehLei(v) || v.sens.length > 0 || negado(v) || /CEI|inqu[ée]rito/i.test(v.a));
  // Rotina: nome de rua, título de cidadão, utilidade pública (aprovados por todos, não mudam a vida de ninguém).
  const rotina = (v) => /denomina|t[íi]tulo de .{0,3}cidad|cidad[ãa]o tatuiano|utilidade p[úu]blica|medalha|comenda/i.test(v.a);
  // Lista "Principais": tudo que teve divergência, foi negado ou é tema sensível, mais as leis que não são rotina.
  const relevante = (v) => v.div || negado(v) || v.sens.length > 0 || ((ehLei(v) || tipoMat(v) === "Projeto de Resolução") && !rotina(v));
  // Mesma matéria (projeto e seus pareceres e emendas) vira uma chave só, para não repetir nos destaques.
  const materiaBase = (v) => { const x = / ao (Projeto .+)$/.exec(v.m); return (x ? x[1] : v.m).replace(/ - [^-]+$/, ""); };

  // Assunto em forma de título curto (sem "e dá outras providências", sem caixa alta).
  function curto(v, max = 110) {
    let a = String(v.a || v.m).trim().replace(/\s+/g, " ");
    if (a === a.toUpperCase()) a = a.toLocaleLowerCase("pt-BR");
    // Trechos gritados ("MOÇÃO DE APLAUSOS", "RUBENS PASQUALOTTO") viram formato título; siglas soltas ficam.
    a = a.replace(/[A-ZÀ-Ý]{2,}(?:[\s,]+[A-ZÀ-Ý]+)*[\s,]+[A-ZÀ-Ý]{2,}/g, (m) => titulo(m).replace(/(?<!\p{L})(?:I{1,3}|Iv|Vi{0,3}|Ix|Xi{0,3})(?!\p{L})/gu, (r) => r.toUpperCase()));
    a = a.replace(/^requeiro à mesa,?\s*ouvido o egrégio plenário na forma regimental,?\s*/i, "")
      .replace(/^com fundamento .*?,\s*(?=digne-se)/i, "").replace(/^digne-se\s+/i, "")
      .replace(/^oficiar (?:a|o|ao)\s+(?:Exmo\.?\s*Sr\.?|Excelentíssimo Senhor|Senhor)\s+/i, "Pedir ao ")
      .replace(/^Parecer ao .+? - /i, "").replace(/^Projeto de Lei (Complementar )?que /i, "")
      .replace(/[,;]?\s*e dá outras providências\.?$/i, "").replace(/[‘’“”]+/g, "\"").replace(/""/g, "\"").replace(/"\s*([^"]*?)\s*"/g, "\"$1\"").replace(/\s+\./g, ".");
    a = a.charAt(0).toLocaleUpperCase("pt-BR") + a.slice(1);
    if (a.length > max) a = a.slice(0, a.lastIndexOf(" ", max - 1)).replace(/[,;:.\-–]+$/, "") + "…";
    return a;
  }
  const numero = (v) => { const x = /Nº\s*([\d./]+)/.exec(v.m); return x ? x[1] : ""; };
  function autoria(v) {
    const au = (v.au || []).map(titulo);
    if (!au.length) return "";
    return au.length > 2 ? `${au.slice(0, 2).join(", ")} e mais ${au.length - 2}` : au.join(" e ");
  }
  const SENS_CURTO = {
    "Impostos e taxas": "Impostos", "Investigação/fiscalização do Executivo": "Investigação", "Empréstimos e créditos": "Empréstimos",
    "Patrimônio público": "Patrimônio", "Orçamento": "Orçamento", "Salários e benefícios de agentes políticos": "Salários de políticos",
  };

  const sessoes = Object.fromEntries((D.sessoes || []).map((s) => [s[0], s]));
  const ordenadas = [...(D.votacoes || [])].sort((a, b) => b.d.localeCompare(a.d) || b.s - a.s);

  // ---------------------------------------------------------------- casca: topo, faixa do modelo, rodapé
  function casca(letra, nome) {
    document.body.insertAdjacentHTML("afterbegin", `<a class="pular" href="#app">Pular para o conteúdo</a>
<header class="topo"><div class="topo-in">
  <a class="marca" href="${SITE}#inicio"><span class="marca-olho">●</span> De olho na Câmara <small>Tatuí</small></a>
  <div class="topo-acoes">
    <button type="button" class="tema-btn" aria-label="Ativar modo escuro" aria-pressed="false"><span class="tema-ico" aria-hidden="true"></span></button>
    <button type="button" class="menu-btn" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu">☰</button>
  </div>
  <nav class="menu" id="menu" aria-label="Principal">
    <a href="${SITE}#inicio">Início</a><a href="${SITE}#vereadores">Vereadores</a><a class="ativo" href="${SITE}#votacoes" aria-current="page">Votações</a>
    <a href="${SITE}#casos">Casos</a><a href="${SITE}#quiz">Quiz</a>
  </nav></div></header>
<div class="modelo-faixa"><div><b>${letra ? "Modelo " + esc(letra) : "Votações"}</b> · ${esc(nome)} <span class="modelo-faixa-s">protótipo para comparação, com dados reais</span></div>
  <nav aria-label="Outros modelos"><a href="index.html"${letra ? "" : ' aria-current="page"'}>Comparar os 3</a>${["a", "b", "c"].map((l) => `<a href="votacoes-${l}.html"${l === String(letra).toLowerCase() ? ' aria-current="page"' : ""}>${l.toUpperCase()}</a>`).join("")}</nav></div>`);
    document.body.insertAdjacentHTML("beforeend", `<footer class="rodape"><p>Dados públicos da Câmara Municipal de Tatuí (sistema SisCam), coletados automaticamente. Projeto independente, sem vínculo com partidos ou com a Câmara.</p></footer>`);
    const temaBtn = document.querySelector(".tema-btn");
    const marcar = () => {
      const escuro = document.documentElement.getAttribute("data-tema") === "escuro";
      temaBtn.setAttribute("aria-pressed", String(escuro));
      temaBtn.setAttribute("aria-label", escuro ? "Voltar ao modo claro" : "Ativar modo escuro");
    };
    temaBtn.addEventListener("click", () => {
      const escuro = document.documentElement.getAttribute("data-tema") !== "escuro";
      if (escuro) document.documentElement.setAttribute("data-tema", "escuro"); else document.documentElement.removeAttribute("data-tema");
      try { localStorage.setItem("olho-tatui-tema", escuro ? "escuro" : "claro"); } catch (e) { /* ok */ }
      marcar();
    });
    marcar();
    const menu = document.getElementById("menu"), menuBtn = document.querySelector(".menu-btn");
    menuBtn.addEventListener("click", () => {
      const abrir = !menu.classList.contains("aberto");
      menu.classList.toggle("aberto", abrir);
      menuBtn.setAttribute("aria-expanded", String(abrir));
    });
  }

  window.M = {
    D, esc, fmt, dataBR, norm, titulo, porChave, nomeDe, hrefPerfil, hrefVotacao, foto, pessoa, ROT_VOTO, aprovou, resultado,
    etqResultado, ladoDe, temNomes, placar, trilho, gradeVotos, minoria, tipoMat, TIPOS, tipoNome, ehLei, negado, importante,
    relevante, rotina, materiaBase, curto, numero, autoria, SENS_CURTO, sessoes, ordenadas, casca, vereadores,
  };
})();
