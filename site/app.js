/* De olho na Câmara — site estático, sem build, o mesmo código para todas as cidades.
   Cada cidade tem a pasta site/<slug>/ com o próprio index.html, que carrega este arquivo de ../.
   Dados gerados por agentes/analista.py em window.DADOS (formato em docs/FORMATO-DADOS.md):
   dados-base.js vem no index.html; votacoes.js e proposituras.js são carregados sob demanda.
   Nome da cidade, Câmara e links oficiais vêm de D.cidade (cidades/<slug>.json). */
(function () {
  "use strict";

  const D = window.DADOS;
  const app = document.getElementById("app");
  const POR_PAGINA = 40;
  const CARREGANDO = `<p class="carregando" role="status">Carregando dados da Câmara…</p>`;

  if (!D || !D.vereadores) {
    app.innerHTML = `<p class="vazio">Não foi possível carregar os dados. Gere-os com <code>python agentes/orquestrador.py --so-site</code>.</p>`;
    return;
  }

  // Cidade desta página (D.cidade). Sem o campo (dados antigos), vale Tatuí.
  const C = D.cidade || { slug: "tatui", nome: "Tatuí", camara: "Câmara Municipal de Tatuí", links: [] };
  const SITE = `De olho na Câmara de ${C.nome}`;

  // Índices da lista compacta de proposituras (mesma ordem de lista_props em analista.py).
  // sit = situação normalizada (APROVADA vira APROVADO); sitOrig = texto original do SisCam, "" se igual.
  const P = { tipo: 0, num: 1, ano: 2, data: 3, ementa: 4, autores: 5, sit: 6, cat: 7, origem: 8, sens: 9, sitOrig: 10 };

  // ------------------------------------------------------------ utilidades
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (n ?? 0).toLocaleString("pt-BR");
  // Percentual sempre com vírgula e %: 98.5 -> "98,5%". null -> "—".
  const pct = (n) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%");
  const dataBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const iniciais = (nome) => nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("");
  const soma = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);
  const decodificar = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

  // Nomes chegam em caixa alta ("BOSSOLAN DA RÁDIO"); na tela, formato título ("Bossolan da Rádio").
  // Só para exibir: chaves, filtros e links continuam com o texto original.
  const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "ao", "em", "na", "no"]);
  function titulo(s) {
    return String(s ?? "").toLocaleLowerCase("pt-BR").replace(/[^\s,;()/-]+/g, (p, i) => {
      if (i > 0 && MINUSCULAS.has(p)) return p;
      if (!/[aeiouáéíóúâêôãõàü]/.test(p)) return p.toLocaleUpperCase("pt-BR"); // "JJ", siglas sem vogal
      return p[0].toLocaleUpperCase("pt-BR") + p.slice(1);
    });
  }
  const nomeV = (v) => titulo(v.nome);

  // Data e hora da coleta no fuso de Brasília (gerado_em vem com fuso, ex.: 2026-10-28T19:30-03:00).
  function quando(iso) {
    const d = new Date(iso);
    return isNaN(d) ? String(iso ?? "") : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  }

  // Todo href que vem de dados passa por aqui: só http/https, já escapado para atributo.
  function url(u) {
    try {
      const x = new URL(String(u));
      return x.protocol === "http:" || x.protocol === "https:" ? esc(x.href) : "#";
    } catch (e) {
      return "#";
    }
  }

  // Link externo: abre em nova aba, com ↗ visível e aviso para leitor de tela.
  const ext = (href, html, cls, rotulo) =>
    `<a${cls ? ` class="${cls}"` : ""} href="${url(href)}" target="_blank" rel="noopener" aria-label="${esc(rotulo || html.replace(/<[^>]+>/g, ""))} (abre em nova aba)">${html}<span aria-hidden="true"> ↗</span></a>`;

  // Links oficiais montados a partir de IDs (os arquivos de dados não guardam URLs).
  const SIS = D.siscam.base;
  const urlDocumento = (id) => `${SIS}/Documentos/Documento/${encodeURIComponent(id)}`;
  const urlSessao = (id) => `${SIS}/Sessoes/Sessao/${encodeURIComponent(id)}`;
  const urlPerfil = (id) => `${SIS}/Vereadores/Vereador/${encodeURIComponent(id)}`;
  function urlProposicao(p) {
    const q = new URLSearchParams({ Pesquisa: "Avancada", id: String(D.siscam.modulo_documentos || 80), pagina: "1",
      Modulo: String(D.siscam.modulo || 8), Documento: D.siscam.tipos[p[P.tipo]] || 0,
      Numeracao: "Documento", NumeroInicial: p[P.num], AnoInicial: p[P.ano], NumeroFinal: p[P.num], AnoFinal: p[P.ano],
      Situacao: "0", Classificacao: "0", TipoAutor: "Todos", AutoriaId: "0", NoTexto: "false" });
    return `${SIS}/Documentos/Pesquisa?${q}`;
  }

  // Compartilhar: endereço público montado a partir de onde o site está aberto.
  const PAGINA = location.href.split("#")[0].split("?")[0];          // .../index.html (ou .../)
  const PASTA = PAGINA.replace(/[^/]*$/, "");                           // .../
  function botaoZap(texto, link) {
    return ext("https://wa.me/?text=" + encodeURIComponent(`${texto}\n${link}`), "Compartilhar no WhatsApp", "botao botao-zap");
  }

  // Nomes: votos trazem a chave do vereador; proposituras trazem o texto do SisCam, que às vezes
  // usa o nome civil ("MAURICIO COUTO"). D.apelidos leva o nome alternativo à chave parlamentar.
  const porChave = Object.fromEntries(D.vereadores.map((v) => [v.chave, v]));
  const quem = (nome) => { const k = norm(nome).replace(/\s+/g, " ").trim(); return D.apelidos[k] || k; };

  // Legislaturas anteriores (D.legislaturas, da mais recente para a mais antiga). A mesma pessoa tem a
  // mesma chave em todas; quem não está na legislatura atual tem perfil reduzido ("ex-vereador").
  const LEGS = D.legislaturas || [];
  const periodoLeg = (l) => `${l.inicio.slice(0, 4)}–${l.fim.slice(0, 4)}`;
  const legDe = (ano) => LEGS.find((l) => String(l.ano) === String(ano));
  const antigos = {}; // chave -> {chave, nome, id, slug, mandatos: [{...números, leg}]}
  LEGS.forEach((l) => l.vereadores.forEach((v) => {
    (antigos[v.chave] ||= { chave: v.chave, nome: v.nome, id: v.id, slug: v.slug, mandatos: [] }).mandatos.push({ ...v, leg: l });
  }));

  const nomeDe = (chave) => (porChave[chave] ? nomeV(porChave[chave]) : titulo(antigos[chave] ? antigos[chave].nome : chave));
  const hrefPerfil = (v) => `#vereador/${encodeURIComponent(v.chave)}`;
  const linkPerfil = (v, texto) => `<a href="${hrefPerfil(v)}">${esc(titulo(texto ?? v.nome))}</a>`;

  // "Meu vereador": escolha do morador, guardada só no navegador dele.
  const CHAVE_MEU = `olho-${C.slug}-meu-vereador`;
  const meuVereador = () => { try { return porChave[localStorage.getItem(CHAVE_MEU)] || null; } catch (e) { return null; } };
  const guardarMeu = (chave) => { try { chave ? localStorage.setItem(CHAVE_MEU, chave) : localStorage.removeItem(CHAVE_MEU); return true; } catch (e) { return false; } };

  // ------------------------------------------------------------ carregador de dados
  // Por <script> (e não fetch) para funcionar também abrindo o index.html direto do disco (file://).
  const pendentes = {};
  function carregar(nome) {
    if (D[nome]) return Promise.resolve(D[nome]);
    pendentes[nome] = pendentes[nome] || new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = `${nome}.js?v=${encodeURIComponent((D.versoes || {})[nome] || "")}`;
      s.onload = () => (D[nome] ? ok(D[nome]) : falha(new Error(nome)));
      s.onerror = () => { delete pendentes[nome]; s.remove(); falha(new Error(nome)); };
      document.head.appendChild(s);
    });
    return pendentes[nome];
  }
  const ERRO_CARGA = `<p class="vazio">Não foi possível carregar os dados. Recarregue a página.</p>`;

  // Preenche `alvo` quando os dados chegarem, se o usuário ainda estiver na mesma página.
  function depois(nomes, alvo, preencher) {
    alvo.innerHTML = CARREGANDO;
    Promise.all(nomes.map(carregar)).then(() => { if (alvo.isConnected) preencher(); },
      () => { if (alvo.isConnected) alvo.innerHTML = ERRO_CARGA; });
  }

  // Grava os filtros no hash sem criar entrada no histórico (o link copiado abre a mesma lista).
  function gravarHash(pagina, valores) {
    const q = new URLSearchParams();
    Object.entries(valores).forEach(([k, x]) => { if (x) q.set(k, x); });
    const s = q.toString();
    history.replaceState(null, "", `#${pagina}${s ? "/" + s : ""}`);
  }

  // ------------------------------------------------------------ componentes
  function foto(v, grande) {
    const cls = "foto" + (grande ? " foto-g" : "");
    if (!/^fotos\/\d+\.jpg$/.test(v.foto || "")) return `<span class="${cls}">${esc(iniciais(v.nome))}</span>`;
    return `<span class="${cls}"><img src="${esc(v.foto)}" alt="" loading="lazy" data-iniciais="${esc(iniciais(v.nome))}"></span>`;
  }
  // Foto que não carrega vira as iniciais (listener em vez de onerror inline; erro não borbulha, por isso captura).
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.dataset.iniciais != null) img.replaceWith(document.createTextNode(img.dataset.iniciais));
  }, true);

  function cartaoVereador(v) {
    return `<a class="cartao ver-card" href="${hrefPerfil(v)}" data-busca="${esc(norm(v.nome + " " + v.nome_civil + " " + v.partido))}">${foto(v)}
      <div><div class="nome">${esc(nomeV(v))}</div>
      <div class="mini">${esc(v.partido || "partido não informado")}${v.em_exercicio ? "" : " · fora do exercício"}</div>
      <div class="mini">${fmt(soma(v.proposituras))} proposituras · presença ${pct(v.presenca.pct)}</div></div></a>`;
  }

  // opts.fmt formata o número; opts.am usa a barra amarela.
  function barras(obj, opts = {}) {
    const ent = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, opts.max || 12);
    if (!ent.length) return `<p class="suave">Sem dados.</p>`;
    const maior = Math.max(...ent.map((e) => e[1]));
    return `<div class="barras">${ent.map(([k, n]) => `
      <div class="barra"><span class="barra-rot">${esc(k)}</span>
        <span class="barra-trilho"><span class="barra-cheia ${opts.am ? "am" : ""}" style="width:${(100 * n) / maior}%"></span></span>
        <span class="n">${opts.fmt ? opts.fmt(n) : fmt(n)}</span></div>`).join("")}</div>`;
  }

  function kpis(lista) {
    return `<div class="grade grade-kpi">${lista.map(([r, n, s]) => `<div class="cartao kpi">
      <div class="valor">${typeof n === "number" ? fmt(n) : esc(n)}</div><div class="rotulo">${esc(r)}</div>
      ${s ? `<div class="kpi-exp">${esc(s)}</div>` : ""}</div>`).join("")}</div>`;
  }

  // Nome como escrito no documento, com link para o perfil se for vereador.
  function linkVereador(nome) {
    const v = porChave[quem(nome)] || antigos[quem(nome)];
    return v ? linkPerfil(v, nome) : esc(titulo(nome));
  }
  const ROT_VOTO = { favor: "A favor", contra: "Contra", abstencao: "Abstenção", ausente: "Ausente", nao_vota: "Não vota" };
  const CLS_VOTO = { favor: "etq-favor", contra: "etq-contra" };
  const votou = (x, chave, opc) => !!(x.v && x.v[opc] && x.v[opc].includes(chave));
  // Opção em que o vereador aparece numa votação nominal ("favor", "contra"…) ou undefined.
  const ladoDe = (x, chave) => (x.v ? Object.keys(x.v).find((o) => x.v[o].includes(chave)) : undefined);
  // Etiqueta de voto: sempre com texto, a cor só reforça.
  const etqVoto = (o) => `<span class="etq etq-voto ${CLS_VOTO[o] || ""}">${esc(ROT_VOTO[o] || o || "sem registro")}</span>`;

  const aprovou = (r) => /aprov/i.test(r) && !/n[ãa]o/i.test(r);
  // "Negado" e equivalentes; adiado, prejudicado, retirado e sem quórum não são negados.
  const ehNegado = (r) => /negad|n[ãa]o aprov|contr[áa]ri|rejeit/i.test(r || "");
  const resultadoRot = (r) => (!r || /^\W*$/.test(r) ? "Sem resultado registrado" : titulo(r));
  const etqResultado = (r) => `<span class="etq ${aprovou(r || "") ? "etq-favor" : ehNegado(r) ? "etq-contra" : ""}">${esc(resultadoRot(r))}</span>`;

  // Linha compacta: o voto de um vereador numa votação (perfil, início, comparação).
  function linhaVoto(x, chave) {
    return `<li class="voto-linha">${etqVoto(ladoDe(x, chave))}
      <div><a href="#votacao/${encodeURIComponent(x.id)}">${esc(x.m)}</a>
        <span class="item-meta"> · ${dataBR(x.d)}${x.f ? " · " + esc(x.f) : ""} · resultado: ${esc(x.r || "—")}</span>
        <div class="suave voto-assunto">${esc(x.a)}</div></div></li>`;
  }

  // Cartão de uma votação com o voto de um vereador em destaque (grade do perfil).
  function cartaoVotoDele(x, chave) {
    return `<article class="vcard">
      <div class="vcard-topo">${etqVoto(ladoDe(x, chave))}<span class="vcard-data">${dataBR(x.d)}</span></div>
      <a class="vcard-titulo" href="#votacao/${encodeURIComponent(x.id)}">${esc(x.m)}</a>
      <p class="vcard-assunto">${esc(x.a)}</p>
      ${barraPlacar(x.n)}
      <div class="vcard-pe">${etqResultado(x.r)}<a href="#votacao/${encodeURIComponent(x.id)}" aria-label="Ver a votação ${esc(x.m)}">Ver votação →</a></div>
    </article>`;
  }
  const emGrade = (html) => `<div class="grade-vcards">${html}</div>`;

  // `render` recebe um item e devolve HTML; `envolver` embrulha a página (ex.: em <ul>).
  function paginar(lista, pagina, render, alvo, envolver, porPagina = POR_PAGINA) {
    const total = Math.max(1, Math.ceil(lista.length / porPagina));
    pagina = Math.min(Math.max(1, pagina), total);
    const html = lista.slice((pagina - 1) * porPagina, pagina * porPagina).map(render).join("");
    alvo.innerHTML = html ? (envolver ? envolver(html) : html) : `<p class="vazio">Nada encontrado com esses filtros.</p>`;
    alvo.insertAdjacentHTML("beforeend", lista.length > porPagina ? `
      <nav class="paginacao" aria-label="Páginas"><button data-pg="${pagina - 1}" ${pagina === 1 ? "disabled" : ""}>Anterior</button>
      <span>${pagina} de ${total}</span><button data-pg="${pagina + 1}" ${pagina === total ? "disabled" : ""}>Próxima</button></nav>` : "");
    alvo.querySelectorAll("[data-pg]").forEach((b) => b.addEventListener("click", () => { paginar(lista, +b.dataset.pg, render, alvo, envolver, porPagina); alvo.scrollIntoView(); }));
  }
  const emLista = (html) => `<ul class="votos-lista">${html}</ul>`;

  // valores: lista de textos ou de pares [valor, rótulo].
  function opcoes(valores, todos) {
    return `<option value="">${todos}</option>` + valores.map((x) => (Array.isArray(x)
      ? `<option value="${esc(x[0])}">${esc(x[1])}</option>` : `<option>${esc(x)}</option>`)).join("");
  }
  const opcoesVereadores = (lista) => lista.map((v) => [v.chave, nomeV(v)]);

  // Liga os campos de um bloco de filtros a `filtrar`, com pequena espera para a digitação.
  // Campos com data-recarrega (ex.: Período) trocam a página inteira e ficam de fora.
  function ligarFiltros(filtrar) {
    let espera;
    app.querySelectorAll(".filtros input, .filtros select:not([data-recarrega])").forEach((el) => el.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(filtrar, 200); }));
  }

  // ------------------------------------------------------------ páginas

  // Contadores grandes, como os do Raízes: [número, rótulo, explicação].
  function contadores(lista) {
    return `<div class="contadores">${lista.map(([n, r, s]) => `<div class="contador">
      <div class="contador-n">${typeof n === "number" ? fmt(n) : esc(n)}</div><div class="contador-r">${esc(r)}</div>
      ${s ? `<div class="contador-s">${esc(s)}</div>` : ""}</div>`).join("")}</div>`;
  }

  function inicio() {
    const g = D.geral;
    const emEx = D.vereadores.filter((v) => v.em_exercicio);
    const meu = meuVereador();
    const destaques = casosOrdem.slice(0, 3);
    app.innerHTML = `
      <section class="hero" data-selo="Dados oficiais · ${esc(C.camara)}">
        <h1>Quem faz o quê na <span>Câmara de ${esc(C.nome)}</span></h1>
        <p>O que cada vereador propõe, como vota e quanto comparece às sessões. Tudo vem de dados públicos oficiais, atualizados por agentes automáticos. Período: ${dataBR(g.periodo[0])} a ${dataBR(g.periodo[1])}.</p>
        <p class="hero-acoes"><a class="botao botao-pr" href="#vereadores">Ver os vereadores <span aria-hidden="true">→</span></a>
          <a class="botao" href="#quiz">Fazer o quiz</a></p>
        ${contadores([[emEx.length, "vereadores em exercício", `legislatura ${C.legislatura ? periodoLeg(C.legislatura) : ""}`],
                      [g.total_sessoes, "sessões", "reuniões do plenário com chamada e votos"],
                      [g.votacoes_divididas, "votações divididas", "com votos a favor e contra"],
                      [g.total_proposituras, "proposituras", "tudo o que foi protocolado"]])}
      </section>
      <section id="meu" aria-labelledby="t-meu"></section>
      <section aria-labelledby="t-encontre">
        <h2 id="t-encontre">Encontre seu vereador</h2>
        <div class="filtros"><label>Nome, apelido ou partido<input type="search" id="f-ver" placeholder="ex.: Cintia, PSD…" autocomplete="off"></label></div>
        <div class="grade grade-cards" id="cards-ver">${emEx.map(cartaoVereador).join("")}</div>
        <p class="vazio" id="ver-vazio" hidden>Nenhum vereador em exercício com esse nome. Veja também <a href="#vereadores">quem já saiu do cargo</a>.</p>
      </section>
      ${destaques.length ? `<section aria-labelledby="t-casos"><h2 id="t-casos">Casos em destaque</h2>
        <p class="suave">Episódios com o voto oficial de cada vereador, a linha do tempo e as fontes.</p>
        <div class="grade-casos">${destaques.map(cartaoCaso).join("")}</div>
        <p><a class="botao" href="#casos">Ver todos os ${D.casos.length} casos</a></p></section>` : ""}
      <section aria-labelledby="t-sessao"><h2 id="t-sessao">A última sessão</h2><div id="ini-sessao"></div></section>
      <section aria-labelledby="t-explore"><h2 id="t-explore">Explore</h2>
        <div class="grade-explore">
          ${[["#quiz", "Quiz", "Com qual vereador você vota igual?", "Responda votações reais e veja quem votou como você."],
             ["#temas", "Temas", "Impostos, salários, orçamento…", "Cada tema sensível com as votações e o placar por vereador."],
             ["#aliancas", "Alianças", "Quem vota com quem", "Mapa de quantas vezes cada par votou do mesmo lado."],
             ["#rankings", "Rankings", "Presença, projetos e votos", "Os números de cada vereador lado a lado."]]
            .map(([h, r, t, d]) => `<a class="explore" href="${h}">${rotulo(r)}<span class="explore-t">${esc(t)}</span><span class="explore-d">${esc(d)}</span><span class="caso-ler" aria-hidden="true">Abrir →</span></a>`).join("")}
        </div></section>
      <div class="duas">
        <div><h2>Proposituras por tipo</h2><div class="cartao">${barras(g.por_tipo)}</div></div>
        <div><h2>Situação das proposituras</h2><div class="cartao">${barras(g.por_situacao, { am: true, max: 10 })}</div></div>
      </div>
      <p style="margin-top:18px"><a class="botao botao-pr" href="#rankings">Ver rankings e a tabela com todos os números</a></p>`;

    const busca = app.querySelector("#f-ver"), cards = [...app.querySelectorAll("#cards-ver .ver-card")];
    busca.addEventListener("input", () => {
      const q = norm(busca.value).trim();
      let n = 0;
      cards.forEach((c) => { c.hidden = !!q && !c.dataset.busca.includes(q); n += !c.hidden; });
      app.querySelector("#ver-vazio").hidden = n > 0;
    });
    blocoMeu(app.querySelector("#meu"), meu, emEx);
    const alvoSessao = app.querySelector("#ini-sessao");
    depois(["votacoes"], alvoSessao, () => { alvoSessao.innerHTML = resumoSessaoCurto(); });
  }

  // Início: cartão do vereador que o morador acompanha, ou o convite para escolher um.
  function blocoMeu(alvo, meu, emEx) {
    if (!meu) {
      alvo.innerHTML = `<div class="cartao meu-vazio"><h2 id="t-meu">Acompanhe o seu vereador</h2>
        <p class="suave">Escolha um vereador para ver aqui, sempre que abrir o site, o resumo dele e como votou nas últimas votações divididas. A escolha fica salva só neste aparelho.</p>
        <div class="filtros"><label>Vereador<select id="f-meu">${opcoes(opcoesVereadores(emEx), "Escolha…")}</select></label></div></div>`;
      alvo.querySelector("#f-meu").addEventListener("change", (e) => {
        if (e.target.value && guardarMeu(e.target.value)) blocoMeu(alvo, porChave[e.target.value], emEx);
      });
      return;
    }
    alvo.innerHTML = `<div class="cartao meu">
      <div class="perfil-topo">${foto(meu, true)}<div>
        <p class="suave meu-sobre">Você acompanha</p><h2 id="t-meu">${esc(nomeV(meu))}</h2>
        <div>${meu.partido ? `<span class="etq etq-pr">${esc(meu.partido)}</span>` : ""}</div>
        <p class="meu-nums">Presença: <b>${pct(meu.presenca.pct)}</b> · Projetos de lei: <b>${fmt(meu.pl_total)}</b> · Votou com a maioria: <b>${pct(meu.alinhamento_maioria)}</b></p>
        <p class="acoes"><a class="botao botao-pr" href="${hrefPerfil(meu)}">Ver perfil completo</a> <button type="button" id="b-trocar">Trocar de vereador</button></p>
      </div></div>
      <h3>Últimas votações divididas</h3><div id="meu-votos"></div></div>`;
    alvo.querySelector("#b-trocar").addEventListener("click", () => { guardarMeu(""); blocoMeu(alvo, null, emEx); alvo.querySelector("select").focus(); });
    const lista = alvo.querySelector("#meu-votos");
    depois(["votacoes"], lista, () => {
      const vs = D.votacoes.filter((x) => x.div && ladoDe(x, meu.chave)).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 5);
      lista.innerHTML = vs.length ? emLista(vs.map((x) => linhaVoto(x, meu.chave)).join("")) +
        `<p><a href="#votacoes/vereador=${encodeURIComponent(meu.chave)}">Ver todas as votações de ${esc(nomeV(meu))}</a></p>`
        : `<p class="suave">Nenhuma votação dividida com voto registrado.</p>`;
    });
  }

  // Mínimo de sessões para entrar nos rankings (evita distorção de quem assumiu há pouco).
  const MIN_SESSOES = 20;

  // neutro: o 1º lugar não é mérito (faltas, ausências), então não ganha destaque amarelo.
  const RANKINGS = [
    { titulo: "Presença nas sessões", desc: "Percentual de sessões ordinárias e extraordinárias com presença registrada.", fmt: pct, valor: (v) => v.presenca.pct },
    { titulo: "Mais faltas", neutro: true, desc: "Sessões em que só aparece como ausente. A Câmara não informa se a falta foi justificada.", valor: (v) => v.presenca.ausente },
    { titulo: "Projetos de lei de política pública", desc: "Exclui nomes de rua, datas comemorativas, honrarias e utilidade pública.", valor: (v) => v.pl_categorias["Política pública/norma"] || 0 },
    { titulo: "Projetos de lei aprovados", desc: "Como autor ou coautor, qualquer categoria.", valor: (v) => v.pl_aprovados },
    { titulo: "Requerimentos de fiscalização", desc: "Pedem contratos, licitações, gastos, cópias de documentos ao Executivo.", valor: (v) => v.pedido_temas["Fiscalização/transparência"] || 0 },
    { titulo: "Total de requerimentos", desc: "Pedidos de informação ou providência ao Executivo.", valor: (v) => v.proposituras["Requerimento"] || 0 },
    { titulo: "Homenagens", desc: "Moções de aplauso, nomes de rua, honrarias e datas comemorativas.", valor: homenagens },
    { titulo: "Proporção de homenagens", neutro: true, desc: "Homenagens divididas pelo total de proposituras do vereador.", fmt: pct, valor: (v) => { const t = soma(v.proposituras); return t ? Math.round((1000 * homenagens(v)) / t) / 10 : null; } },
    { titulo: "Votos contra", desc: "Votações nominais em que votou contra. Indica atuação de oposição ou divergência.", valor: (v) => v.votos.contra || 0 },
    { titulo: "Votou com a maioria", desc: "Nas votações divididas, quantas vezes ficou do lado que venceu. Alto: alinhado à maioria (em geral a base do prefeito). Baixo: oposição frequente.", fmt: pct, valor: (v) => (v.divididas_total >= 10 ? v.alinhamento_maioria : null) },
    { titulo: "Ausências na hora do voto", neutro: true, desc: "Votações nominais em que estava registrado como ausente.", valor: (v) => v.votos.ausente || 0 },
  ];

  function homenagens(v) {
    return (v.mocao_categorias["Aplauso/congratulação"] || 0) + (v.pl_categorias["Nome de rua/prédio"] || 0) +
      (v.pl_categorias["Honraria"] || 0) + (v.pl_categorias["Data comemorativa/campanha"] || 0);
  }

  function rankings() {
    const base = D.vereadores.filter((v) => v.em_exercicio && v.presenca.presente + v.presenca.ausente >= MIN_SESSOES);
    const fora = D.vereadores.filter((v) => v.em_exercicio && !base.includes(v)).map(nomeV);
    app.innerHTML = `<h1>Rankings</h1>
      <p class="suave">Vereadores em exercício com pelo menos ${MIN_SESSOES} sessões no período${fora.length ? ` (fora por mandato curto: ${esc(fora.join(", "))})` : ""}. Use o botão de cada quadro para ver o outro extremo.</p>
      <div class="aviso">Ranking mede volume e comportamento registrado, não honestidade. Posição baixa em projetos pode significar foco em fiscalização; muitas homenagens não são ilegais. Confira os documentos antes de concluir.</div>
      <div class="grade grade-rank">${RANKINGS.map((r, i) => `<section class="cartao rank" data-i="${i}"></section>`).join("")}</div>
      <h2 id="tabela">Tabela com todos os números</h2>
      <p class="suave">Vereadores em exercício. Toque no título de uma coluna para ordenar. "PL de política pública" exclui nomes de rua, datas comemorativas, honrarias e utilidade pública.</p>
      <div class="tabela-wrap"><table id="ranking"><thead><tr>
        ${[["nome", "Vereador"], ["partido", "Partido"], ["pres", "Presença", 1], ["pl", "Projetos de lei", 1], ["plpp", "PL de política pública", 1],
           ["plap", "PL aprovados", 1], ["moc", "Moções", 1], ["req", "Requerimentos", 1], ["ind", "Indicações", 1], ["contra", "Votos contra", 1]]
          .map(([k, t, n]) => `<th${n ? ` class="num"` : ""} aria-sort="none"><button type="button" class="th-btn" data-ordem="${k}">${t}</button></th>`).join("")}
      </tr></thead><tbody></tbody></table></div>`;
    app.querySelectorAll(".rank").forEach((el) => {
      const r = RANKINGS[+el.dataset.i];
      let inverso = false;
      const desenhar = () => {
        const lista = base.map((v) => [v, r.valor(v)]).filter(([, n]) => n != null).sort((a, b) => (inverso ? a[1] - b[1] : b[1] - a[1]));
        const maior = Math.max(1, ...lista.map(([, n]) => n));
        el.innerHTML = `<div class="rank-topo"><h3>${esc(r.titulo)}</h3><button type="button" class="mini-btn">${inverso ? "Ver maiores primeiro" : "Ver menores primeiro"}</button></div>
          <p class="suave rank-desc">${esc(r.desc)}</p>
          <ol class="rank-lista">${lista.map(([v, n], pos) => `<li>
            <span class="pos ${pos < 3 && !inverso && !r.neutro ? "pos-top" : ""}">${pos + 1}</span>
            ${linkPerfil(v)}
            <span class="barra-trilho"><span class="barra-cheia" style="width:${(100 * n) / maior}%"></span></span>
            <span class="n">${r.fmt ? r.fmt(n) : fmt(n)}</span></li>`).join("")}</ol>`;
        el.querySelector(".mini-btn").addEventListener("click", () => { inverso = !inverso; desenhar(); el.querySelector(".mini-btn").focus(); });
      };
      desenhar();
    });
    tabelaRanking();
  }

  function tabelaRanking() {
    const linhas = D.vereadores.filter((v) => v.em_exercicio).map((v) => ({
      v, nome: nomeV(v), partido: v.partido, pres: v.presenca.pct ?? -1, pl: v.pl_total,
      plpp: v.pl_categorias["Política pública/norma"] || 0, plap: v.pl_aprovados,
      moc: v.proposituras["Moção"] || 0, req: v.proposituras["Requerimento"] || 0,
      ind: v.proposituras["Indicação"] || 0, contra: v.votos.contra || 0,
    }));
    let campo = "plpp", desc = true;
    const tbody = app.querySelector("#ranking tbody");
    function desenhar() {
      linhas.sort((a, b) => (typeof a[campo] === "string" ? a[campo].localeCompare(b[campo]) : a[campo] - b[campo]) * (desc ? -1 : 1));
      tbody.innerHTML = linhas.map((l) => `<tr>
        <td>${linkPerfil(l.v)}</td><td>${esc(l.partido)}</td>
        <td class="num">${l.pres < 0 ? "—" : pct(l.pres)}</td><td class="num">${l.pl}</td><td class="num">${l.plpp}</td>
        <td class="num">${l.plap}</td><td class="num">${fmt(l.moc)}</td><td class="num">${fmt(l.req)}</td>
        <td class="num">${fmt(l.ind)}</td><td class="num">${fmt(l.contra)}</td></tr>`).join("");
      app.querySelectorAll("#ranking th").forEach((th) => th.setAttribute("aria-sort",
        th.querySelector("button").dataset.ordem === campo ? (desc ? "descending" : "ascending") : "none"));
    }
    app.querySelectorAll("#ranking .th-btn").forEach((b) => b.addEventListener("click", () => {
      desc = campo === b.dataset.ordem ? !desc : b.dataset.ordem !== "nome" && b.dataset.ordem !== "partido";
      campo = b.dataset.ordem; desenhar();
    }));
    desenhar();
  }

  function vereadores() {
    const em = D.vereadores.filter((v) => v.em_exercicio), fora = D.vereadores.filter((v) => !v.em_exercicio);
    app.innerHTML = `<h1>Vereadores</h1>
      <p class="suave">Legislatura 2025–2028. Toque para ver o perfil completo: o que propôs, como votou e com quem mais vota junto.</p>
      <div class="grade grade-cards">${em.map(cartaoVereador).join("")}</div>
      <h2 id="comparar">Comparar dois vereadores</h2>
      ${formComparar()}
      ${fora.length ? `<h2>Exerceram mandato neste período</h2><div class="grade grade-cards">${fora.map(cartaoVereador).join("")}</div>` : ""}
      ${LEGS.length ? `<p style="margin-top:18px"><a class="botao" href="#legislaturas">Legislaturas anteriores (${LEGS.map(periodoLeg).join(" e ")})</a></p>` : ""}`;
    ligarComparar();
  }

  function formComparar() {
    const ops = opcoesVereadores(D.vereadores);
    return `<form class="filtros cartao form-comparar" id="form-comparar">
      <label>Primeiro vereador<select name="a" required>${opcoes(ops, "Escolha…")}</select></label>
      <label>Segundo vereador<select name="b" required>${opcoes(ops, "Escolha…")}</select></label>
      <button type="submit" class="botao-pr">Comparar</button></form>`;
  }
  // a, b: vereadores já escolhidos (ou undefined), para preencher os campos.
  function ligarComparar(a, b) {
    const f = app.querySelector("#form-comparar");
    f.a.value = a ? a.chave : "";
    f.b.value = b ? b.chave : "";
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      if (f.a.value && f.b.value) location.hash = `#comparar/${encodeURIComponent(f.a.value + "|" + f.b.value)}`;
    });
  }

  // Aceita a chave ("MAURICIO ENFERMEIRO") ou o slug ("mauricio-enfermeiro").
  const acharVereador = (arg) => arg && (porChave[arg] || porChave[quem(arg)] || D.vereadores.find((v) => v.slug === arg));
  const acharAntigo = (arg) => arg && (antigos[arg] || antigos[quem(arg)] || Object.values(antigos).find((v) => v.slug === arg));

  // Números de cada legislatura anterior em que a pessoa atuou, com link para as votações dela no período.
  function tabelaMandatos(a) {
    const linhas = a.mandatos.map((m) => {
      const vot = soma(m.votos);
      return `<tr><th scope="row">${esc(periodoLeg(m.leg))}<div class="suave mandato-cargo">${esc([m.partido, m.cargo].filter(Boolean).join(" · ") || "suplente que assumiu")}</div></th>
        <td class="num">${pct(m.presenca.pct)}<div class="suave">${fmt(m.presenca.presente)} de ${fmt(m.presenca.presente + m.presenca.ausente)}</div></td>
        <td class="num">${fmt(m.pl_total)}<div class="suave">${fmt(m.pl_pp)} de política pública</div></td>
        <td class="num">${fmt(m.pl_aprovados)}</td><td class="num">${fmt(m.mocoes)}</td><td class="num">${fmt(m.requerimentos)}</td>
        <td class="num">${fmt(m.votos.contra || 0)}</td>
        <td class="num">${pct(m.alinhamento_maioria)}<div class="suave">de ${fmt(m.divididas_total)} divididas</div></td>
        <td>${vot ? `<a href="#votacoes/periodo=${m.leg.ano}&vereador=${encodeURIComponent(a.chave)}">Ver votações</a>` : `<span class="suave">sem votos registrados</span>`}</td></tr>`;
    });
    return `<div class="tabela-wrap"><table class="mandatos"><thead><tr><th>Legislatura</th><th class="num">Presença</th><th class="num">Projetos de lei</th>
      <th class="num">PL aprovados</th><th class="num">Moções</th><th class="num">Requerimentos</th><th class="num">Votos contra</th><th class="num">Votou com a maioria</th><th><span class="sr">Votações</span></th></tr></thead>
      <tbody>${linhas.join("")}</tbody></table></div>
      <p class="suave">Mesmos critérios da legislatura atual.${C.nota_registro ? " " + esc(C.nota_registro) : ""} Veja <a href="#legislaturas">as legislaturas</a>.</p>`;
  }

  // Perfil de quem só exerceu mandato em legislaturas anteriores.
  function vereadorAntigo(a) {
    app.innerHTML = `<p><a href="#legislaturas">← Legislaturas anteriores</a></p>
      <div class="cartao perfil-topo"><span class="foto foto-g">${esc(iniciais(a.nome))}</span>
        <div><h1>${esc(titulo(a.nome))}</h1>
          <div><span class="etq">ex-vereador</span></div>
          ${a.id ? ext(urlPerfil(a.id), "Perfil oficial na Câmara") : ""}</div></div>
      <h2>Mandatos anteriores</h2>${tabelaMandatos(a)}`;
  }

  function afinidadesDe(v) {
    return Object.entries(D.afinidade).map(([par, p]) => {
      const [a, b] = par.split("|");
      return a === v.chave ? [b, p] : b === v.chave ? [a, p] : null;
    }).filter(Boolean).filter(([k]) => porChave[k]).sort((a, b) => b[1] - a[1]);
  }
  const afinidadePar = (a, b) => D.afinidade[[a.chave, b.chave].sort().join("|")];

  const GLOSSARIO = `<details class="cartao glossario"><summary>O que é cada tipo de propositura?</summary><dl>
      <dt>Projeto de lei (PL)</dt><dd>Proposta de lei nova ou de mudança numa lei da cidade. Só vale se for aprovada em votação e sancionada.</dd>
      <dt>Requerimento</dt><dd>Pedido formal de informação ou providência, em geral à Prefeitura (por exemplo, cópia de um contrato).</dd>
      <dt>Indicação</dt><dd>Sugestão ao prefeito de uma obra ou serviço, como tapar um buraco. O prefeito não é obrigado a atender.</dd>
      <dt>Moção</dt><dd>Manifestação da Câmara: aplauso, apoio, protesto ou repúdio. Não cria lei nem obriga ninguém.</dd>
    </dl></details>`;

  // Eixos do Painel ideológico (mesmos ids e polos de site/espectro.js).
  const EIXOS_ESP = [["economia", "Economia", "Estatista", "Liberal"], ["costumes", "Costumes", "Progressista", "Conservador"],
    ["seguranca", "Segurança", "Garantista", "Rigor penal"], ["ambiente", "Meio ambiente", "Ambientalista", "Desenvolvimentista"],
    ["religiao", "Religião", "Laico", "Religioso"], ["servicos", "Serviços públicos", "Gestão pública", "Concessão privada"],
    ["participacao", "Participação", "Participativo", "Autoridade"], ["impostos", "Impostos", "Mais serviços", "Menos impostos"]];

  // Posição do vereador nos eixos, pelos votos nas votações classificadas (casos/<cidade>/eixos.json).
  function eixosVereador(v) {
    const pos = D.espectro && D.espectro.pos[v.chave];
    if (!pos) return "";
    const linhas = EIXOS_ESP.filter(([id]) => pos[id]).map(([id, nome, a, b]) => {
      const [soma, n] = pos[id], val = soma / n, forca = Math.round(Math.abs(val) * 100);
      const txt = forca < 20 ? "Centro" : `${val < 0 ? a : b} ${forca}%`;
      return `<a class="eixo-v" href="../espectro.html#eixo/${id}">
        <span class="eixo-v-topo"><b>${esc(nome)}</b><span>${esc(txt)} · ${n} ${n === 1 ? "voto" : "votos"}</span></span>
        <span class="eixo-v-trilho"><i style="left:${50 + val * 50}%"></i></span>
        <span class="eixo-v-pontas"><span>${esc(a)}</span><span>${esc(b)}</span></span></a>`;
    });
    return `<h2>Posição nos eixos do Painel ideológico</h2>
      <p class="suave">Calculada só com votações nominais classificadas por tema (${D.espectro.votacoes.length} na legislatura). Poucos votos por eixo: é uma pista, não um retrato. <a href="../espectro.html">Faça o teste e veja com quem você mais se parece →</a></p>
      <div class="eixos-v">${linhas.join("")}</div>`;
  }

  // Selos do perfil: só destaques com critério objetivo, explicado no próprio selo. Comparação entre
  // os vereadores em exercício da mesma Câmara.
  function selos(v) {
    if (!v.em_exercicio) return "";
    const pares = D.vereadores.filter((x) => x.em_exercicio);
    const top3 = (f) => { const ord = pares.map(f).filter((n) => n > 0).sort((a, b) => b - a); return ord.length ? ord[Math.min(2, ord.length - 1)] : Infinity; };
    const lista = [];
    const pr = v.presenca || {};
    if (pr.pct >= 98 && pr.presente + pr.ausente >= 20) lista.push(["Presença exemplar", `Esteve em ${pct(pr.pct)} das sessões (98% ou mais).`]);
    const fisc = (x) => x.pedido_temas["Fiscalização/transparência"] || 0;
    if (fisc(v) && fisc(v) >= top3(fisc)) lista.push(["Fiscalizador", `Entre os 3 com mais requerimentos de fiscalização (${fisc(v)}): pedidos de contratos, gastos e documentos.`]);
    if (v.pl_aprovados && v.pl_aprovados >= top3((x) => x.pl_aprovados)) lista.push(["Legislador", `Entre os 3 com mais projetos de lei aprovados (${v.pl_aprovados}).`]);
    const pp = (x) => x.pl_categorias["Política pública/norma"] || 0;
    if (pp(v) && pp(v) >= top3(pp)) lista.push(["Propositivo", `Entre os 3 com mais projetos de política pública (${pp(v)}), sem contar nomes de rua e homenagens.`]);
    const contra = (x) => x.votos.contra || 0;
    if (contra(v) && contra(v) >= top3(contra)) lista.push(["Voz divergente", `Entre os 3 que mais votaram contra (${contra(v)}). Indica oposição ou divergência, não é bom nem ruim por si.`]);
    return lista.length ? `<div class="selos" aria-label="Selos">${lista.map(([n, t]) => `<span class="selo" title="${esc(t)}">★ ${esc(n)}<small>${esc(t)}</small></span>`).join("")}</div>` : "";
  }

  function vereador(arg) {
    const v = acharVereador(arg);
    if (!v && acharAntigo(arg)) { vereadorAntigo(acharAntigo(arg)); return; }
    if (!v) { app.innerHTML = `<p><a href="#vereadores">← Todos os vereadores</a></p><h1>Vereador não encontrado</h1><p class="vazio">Confira o endereço ou escolha na lista de vereadores.</p>`; return; }
    const afin = afinidadesDe(v);
    // Metade de cima e metade de baixo, até 6 cada, sem repetir nomes quando há poucos pares.
    const nMais = Math.min(6, Math.ceil(afin.length / 2));
    const maisAlinhados = afin.slice(0, nMais), menosAlinhados = afin.slice(nMais).slice(-6).reverse();
    const nPP = v.pl_categorias["Política pública/norma"] || 0;
    const pres = v.presenca;
    const civil = v.nome_civil && norm(v.nome_civil) !== norm(v.nome) ? titulo(v.nome_civil) : "";
    const ehMeu = meuVereador() === v;
    const textoZap = `${nomeV(v)}${v.partido ? ` (${v.partido})` : ""}, vereador(a) de ${C.nome}: presença em ${pct(pres.pct)} das sessões, ` +
      `${v.pl_total} projetos de lei (${v.pl_aprovados} aprovados) e votou com a maioria em ${pct(v.alinhamento_maioria)} das votações divididas. Dados oficiais da Câmara:`;

    app.innerHTML = `
      <p><a href="#vereadores">← Todos os vereadores</a></p>
      <div class="cartao perfil-topo">${foto(v, true)}
        <div><h1>${esc(nomeV(v))}</h1>
          <div>${v.partido ? `<span class="etq etq-pr">${esc(v.partido)}</span>` : ""}${v.em_exercicio ? `<span class="etq etq-am">em exercício</span>` : `<span class="etq">fora do exercício</span>`}</div>
          ${selos(v)}
          ${civil || v.email ? `<div class="suave">${civil ? "Nome civil: " + esc(civil) : ""}${civil && v.email ? " · " : ""}${esc(v.email || "")}</div>` : ""}
          ${v.id ? ext(urlPerfil(v.id), "Perfil oficial na Câmara") : ""}
          <p class="acoes">
            <button type="button" id="b-meu" aria-pressed="${ehMeu}">${ehMeu ? "Deixar de acompanhar" : "Acompanhar na página inicial"}</button>
            ${botaoZap(textoZap, `${PASTA}vereador/${encodeURIComponent(v.slug)}.html`)}
            <a class="botao" href="#comparar/${encodeURIComponent(v.chave + "|")}">Comparar com…</a>
            ${window.OlhoCartao ? `<button type="button" id="b-img">Imagem para compartilhar</button>` : ""}
          </p>
        </div></div>
      ${kpis([["Presença em sessões", pct(pres.pct), `${pres.presente} presente · ${pres.ausente} ausente`],
              ["Projetos de lei (PL)", v.pl_total, `${v.pl_aprovados} aprovados`],
              ["PL de política pública", nPP, "exclui nomes de rua e homenagens"],
              ["Moções", v.proposituras["Moção"] || 0, `${v.mocao_categorias["Aplauso/congratulação"] || 0} de aplauso`],
              ["Requerimentos", v.proposituras["Requerimento"] || 0, "pedidos de informação ou providência"],
              ["Votou com a maioria", pct(v.alinhamento_maioria), `em ${v.divididas_total} votações divididas`]])}
      ${GLOSSARIO}
      ${eixosVereador(v)}
      <h2 id="divididas">Como votou nas votações divididas</h2>
      <p class="suave">Votações em que houve votos a favor e contra, da mais recente para a mais antiga. É aqui que aparecem as diferenças entre os vereadores.</p>
      <div id="divididas-lista"></div>
      <div class="duas">
        <div><h2>Projetos de lei por categoria</h2><div class="cartao">${barras(v.pl_categorias)}</div></div>
        <div><h2>Moções por tipo</h2><div class="cartao">${barras(v.mocao_categorias, { am: true })}</div></div>
        <div><h2>Temas de requerimentos e indicações</h2><div class="cartao">${barras(v.pedido_temas)}</div></div>
        <div><h2>Todos os votos nominais</h2><div class="cartao">${barras(Object.fromEntries(Object.entries(v.votos).map(([k, n]) => [ROT_VOTO[k] || k, n])), { am: true })}</div></div>
      </div>
      <h2>Com quem mais vota igual</h2>
      <p class="suave">Percentual de votações divididas em que os dois votaram do mesmo lado.</p>
      <div class="duas"><div class="cartao"><h3>Mais alinhados</h3>${barras(Object.fromEntries(maisAlinhados.map(([k, p]) => [nomeDe(k), p])), { fmt: pct })}</div>
        <div class="cartao"><h3>Menos alinhados</h3>${barras(Object.fromEntries(menosAlinhados.map(([k, p]) => [nomeDe(k), p])), { am: true, fmt: pct })}</div></div>
      ${antigos[v.chave] ? `<h2 id="mandatos">Mandatos anteriores</h2>${tabelaMandatos(antigos[v.chave])}` : ""}
      <h2>Projetos de lei de política pública (${fmt(nPP)})</h2>
      <div id="pl-pp"></div>
      <p><a class="botao botao-pr" href="#proposituras/autor=${encodeURIComponent(v.chave)}">Ver todas as ${fmt(soma(v.proposituras))} proposituras</a></p>`;

    const bImg = app.querySelector("#b-img");
    if (bImg) bImg.addEventListener("click", () => window.OlhoCartao.compartilhar({
      rotulo: `Vereador(a) de ${C.nome}`, titulo: nomeV(v), subtitulo: `${v.partido || ""} · legislatura ${C.legislatura ? periodoLeg(C.legislatura) : ""}`,
      linhas: [[pct(pres.pct), "de presença nas sessões"], [fmt(v.pl_total), `projetos de lei (${v.pl_aprovados} aprovados)`],
        [fmt(v.proposituras["Requerimento"] || 0), "requerimentos ao Executivo"], [pct(v.alinhamento_maioria), "votou com a maioria nas divididas"]],
      arquivo: `vereador-${v.slug}`, texto: textoZap }));
    const bMeu = app.querySelector("#b-meu");
    bMeu.addEventListener("click", () => {
      const agora = bMeu.getAttribute("aria-pressed") !== "true";
      if (!guardarMeu(agora ? v.chave : "")) { bMeu.textContent = "Não foi possível salvar neste navegador"; return; }
      bMeu.setAttribute("aria-pressed", agora);
      bMeu.textContent = agora ? "Deixar de acompanhar" : "Acompanhar na página inicial";
    });
    const alvoPL = app.querySelector("#pl-pp"), alvoDiv = app.querySelector("#divididas-lista");
    depois(["proposituras"], alvoPL, () => paginar(D.proposituras.filter((p) => p[P.tipo] === "Projeto de Lei" &&
      p[P.cat] === "Política pública/norma" && p[P.autores].some((a) => quem(a) === v.chave)), 1, cartaoProp, alvoPL, emGrade, 12));
    depois(["votacoes"], alvoDiv, () => {
      const lista = D.votacoes.filter((x) => x.div && ladoDe(x, v.chave)).sort((a, b) => b.d.localeCompare(a.d));
      const cont = {};
      lista.forEach((x) => { const o = ladoDe(x, v.chave); cont[o] = (cont[o] || 0) + 1; });
      alvoDiv.innerHTML = `<p class="resumo-votos">${Object.keys(ROT_VOTO).filter((o) => cont[o]).map((o) => `${etqVoto(o)} ${fmt(cont[o])}`).join(" ")}
        <a href="#votacoes/vereador=${encodeURIComponent(v.chave)}">abrir na página de votações</a></p><div></div>`;
      paginar(lista, 1, (x) => cartaoVotoDele(x, v.chave), alvoDiv.lastElementChild, emGrade, 12);
    });
  }

  function comparar(arg) {
    const [ka, kb] = String(arg || "").split("|");
    const a = acharVereador(ka), b = acharVereador(kb);
    const cab = `<p><a href="#vereadores">← Todos os vereadores</a></p><h1>Comparar vereadores</h1>`;
    if (!a || !b || a === b) {
      app.innerHTML = `${cab}<p class="suave">Escolha dois vereadores diferentes para ver os números lado a lado e as votações em que discordaram.</p>${formComparar()}`;
      ligarComparar(a, b);
      return;
    }
    const linhas = [
      ["Partido", (v) => esc(v.partido || "—")],
      ["Situação", (v) => (v.em_exercicio ? "em exercício" : "fora do exercício")],
      ["Presença nas sessões", (v) => pct(v.presenca.pct)],
      ["Projetos de lei (PL)", (v) => fmt(v.pl_total)],
      ["PL de política pública", (v) => fmt(v.pl_categorias["Política pública/norma"] || 0)],
      ["PL aprovados", (v) => fmt(v.pl_aprovados)],
      ["Requerimentos", (v) => fmt(v.proposituras["Requerimento"] || 0)],
      ["Requerimentos de fiscalização", (v) => fmt(v.pedido_temas["Fiscalização/transparência"] || 0)],
      ["Indicações", (v) => fmt(v.proposituras["Indicação"] || 0)],
      ["Moções", (v) => fmt(v.proposituras["Moção"] || 0)],
      ["Homenagens", (v) => fmt(homenagens(v))],
      ["Votou com a maioria", (v) => `${pct(v.alinhamento_maioria)} <span class="suave">de ${v.divididas_total}</span>`],
      ["Votos contra", (v) => fmt(v.votos.contra || 0)],
      ["Ausências na hora do voto", (v) => fmt(v.votos.ausente || 0)],
    ];
    const af = afinidadePar(a, b);
    app.innerHTML = `${cab}
      <div class="tabela-wrap comparar-wrap"><table class="comparar"><thead><tr><th scope="col"><span class="sr">Indicador</span></th>
        ${[a, b].map((v) => `<th scope="col" class="num"><span class="comp-nome">${foto(v)}${linkPerfil(v)}</span></th>`).join("")}</tr></thead>
        <tbody>${linhas.map(([r, f]) => `<tr><th scope="row">${r}</th><td class="num">${f(a)}</td><td class="num">${f(b)}</td></tr>`).join("")}</tbody></table></div>
      <p class="aviso">${af == null ? "Os dois têm menos de 3 votações divididas em comum." :
        `Nas votações divididas que os dois votaram, ficaram do mesmo lado em <b>${pct(af)}</b> das vezes.`}
        Número diferente não quer dizer certo ou errado: compare com os documentos.</p>
      <h2>Votações divididas em que discordaram</h2>
      <p class="suave">Só votações em que os dois registraram voto (a favor, contra ou abstenção) e escolheram opções diferentes.</p>
      <div id="discordam" class="lista-cartao"></div>
      <h2>Comparar outros</h2>${formComparar()}`;
    ligarComparar(a, b);
    const alvo = app.querySelector("#discordam");
    const VALE = ["favor", "contra", "abstencao"];
    depois(["votacoes"], alvo, () => {
      const lista = D.votacoes.filter((x) => {
        if (!x.div) return false;
        const la = ladoDe(x, a.chave), lb = ladoDe(x, b.chave);
        return VALE.includes(la) && VALE.includes(lb) && la !== lb;
      }).sort((x, y) => y.d.localeCompare(x.d));
      paginar(lista, 1, (x) => `<li class="voto-linha voto-comp">
        <div><a href="#votacao/${encodeURIComponent(x.id)}">${esc(x.m)}</a><span class="item-meta"> · ${dataBR(x.d)}${x.f ? " · " + esc(x.f) : ""} · resultado: ${esc(x.r || "—")}</span>
          <div class="suave voto-assunto">${esc(x.a)}</div></div>
        <div class="comp-votos"><span>${esc(nomeV(a))}: ${etqVoto(ladoDe(x, a.chave))}</span><span>${esc(nomeV(b))}: ${etqVoto(ladoDe(x, b.chave))}</span></div></li>`,
      alvo, emLista, 15);
      if (!lista.length) alvo.innerHTML = `<p class="vazio">Os dois não discordaram em nenhuma votação dividida registrada.</p>`;
    });
  }

  function cartaoProp(p) {
    const sens = (p[P.sens] || []).map((t) => `<span class="etq etq-am">${esc(t)}</span>`).join("");
    const sit = p[P.sit];
    return `<article class="item">
      <div class="item-topo">${ext(urlProposicao(p), `${esc(p[P.tipo])} nº ${esc(p[P.num])}/${esc(p[P.ano])}`, "item-titulo")}
      <span class="etq ${/APROVAD|SAN[CÇ]/i.test(sit) && !/N[ÃA]O APROV/i.test(sit) ? "etq-favor" : /REJEIT|REPROV|N[ÃA]O APROV|VETAD|ARQUIV/i.test(sit) ? "etq-contra" : ""}"${p[P.sitOrig] ? ` title="No SisCam: ${esc(p[P.sitOrig])}"` : ""}>${esc(sit || "—")}</span></div>
      <div class="item-meta">${dataBR(p[P.data])} · ${p[P.autores].map(linkVereador).join(", ") || "autoria não informada"}${p[P.cat] ? ` · <span class="etq">${esc(p[P.cat])}</span>` : ""}</div>
      ${sens}<p>${esc(p[P.ementa])}</p></article>`;
  }

  // Bloco "Mais filtros", aberto se algum desses filtros já veio preenchido no endereço.
  const maisFiltros = (html, aberto) => `<details class="mais-filtros"${aberto ? " open" : ""}><summary>Mais filtros</summary><div class="filtros">${html}</div></details>`;

  function proposituras(params) {
    const tipos = Object.keys(D.geral.por_tipo);
    const autores = opcoesVereadores(D.vereadores);
    const sits = Object.keys(D.geral.por_situacao).filter(Boolean).sort();
    const cats = [...new Set(D.proposituras.map((p) => p[P.cat]).filter(Boolean))].sort();
    const anos = [...new Set(D.proposituras.map((p) => String(p[P.ano])))].sort().reverse();
    const extra = ["sit", "cat", "ano", "sens"].some((k) => params.get(k));
    app.innerHTML = `<h1>Proposituras</h1>
      <p class="suave">Tudo que foi protocolado: projetos de lei (PL), moções, requerimentos, indicações. Toque no número para abrir o documento oficial.</p>
      <div class="filtros">
        <label>Busca<input type="search" id="f-busca" placeholder="palavra na ementa…"></label>
        <label>Tipo<select id="f-tipo">${opcoes(tipos, "Todos")}</select></label>
        <label>Autor<select id="f-autor">${opcoes(autores, "Todos")}</select></label>
      </div>
      ${maisFiltros(`
        <label>Situação<select id="f-sit">${opcoes(sits, "Todas")}</select></label>
        <label>Categoria/tema<select id="f-cat">${opcoes(cats, "Todas")}</select></label>
        <label>Ano<select id="f-ano">${opcoes(anos, "Todos")}</select></label>
        <label class="check"><input type="checkbox" id="f-sens"> Só temas sensíveis (impostos, salários, comissões de investigação…)</label>`, extra)}
      <div class="contagem" id="contagem" role="status"></div><div id="lista"></div>`;
    const $ = (id) => app.querySelector(id);
    const autorInicial = acharVereador(params.get("autor"));
    if (autorInicial) $("#f-autor").value = autorInicial.chave;
    if (tipos.includes(params.get("tipo"))) $("#f-tipo").value = params.get("tipo");
    if (sits.includes(params.get("sit"))) $("#f-sit").value = params.get("sit");
    if (cats.includes(params.get("cat"))) $("#f-cat").value = params.get("cat");
    if (anos.includes(params.get("ano"))) $("#f-ano").value = params.get("ano");
    $("#f-busca").value = params.get("busca") || "";
    $("#f-sens").checked = params.get("sens") === "1";
    function filtrar() {
      const buscaTxt = $("#f-busca").value.trim(), busca = norm(buscaTxt), tipo = $("#f-tipo").value, autor = $("#f-autor").value;
      const sit = $("#f-sit").value, cat = $("#f-cat").value, ano = $("#f-ano").value, sens = $("#f-sens").checked;
      gravarHash("proposituras", { busca: buscaTxt, tipo, autor, sit, cat, ano, sens: sens ? "1" : "" });
      const lista = D.proposituras.filter((p) =>
        (!tipo || p[P.tipo] === tipo) && (!autor || p[P.autores].some((a) => quem(a) === autor)) && (!sit || p[P.sit] === sit) &&
        (!cat || p[P.cat] === cat) && (!ano || String(p[P.ano]) === ano) && (!sens || p[P.sens].length) &&
        (!busca || norm(p[P.ementa]).includes(busca)));
      lista.sort((a, b) => (b[P.data] || "").localeCompare(a[P.data] || ""));
      $("#contagem").textContent = `${fmt(lista.length)} proposituras encontradas`;
      paginar(lista, 1, cartaoProp, $("#lista"));
    }
    ligarFiltros(filtrar);
    filtrar();
  }

  // Período das votações: "" = legislatura atual (votacoes.js); ano de início = anterior (historico.js).
  const periodoValido = (p) => (legDe(p) ? String(legDe(p).ano) : "");

  // Página de votações: filtros numa coluna lateral (gaveta no celular) e, à direita, contadores,
  // a faixa "Votações que mais importam" e a grade de cartões com placar.
  // Hash: periodo, busca, vereador, voto, tema, mat (tipos separados por vírgula), ano, res, div, todas.
  // Endereços antigos continuam valendo: contra=<chave> (vereador + voto contra) e todas=1 (inclui rotina).
  function votacoes(params) {
    const periodo = periodoValido(params.get("periodo"));
    const leg = legDe(periodo);
    const fonte = (leg ? D.historico.votacoes.filter((v) => String(v.l) === periodo) : D.votacoes)
      .slice().sort((a, b) => b.d.localeCompare(a.d) || b.s - a.s);
    const pessoas = leg ? leg.vereadores.map((v) => v.chave).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b))) : D.vereadores.map((v) => v.chave);
    const temas = [...new Set(fonte.flatMap((v) => v.sens || []))].sort();
    const tipos = [...TIPOS_ORDEM.filter((t) => fonte.some((v) => tipoMat(v) === t)), ...[...new Set(fonte.map(tipoMat))].filter((t) => !TIPOS_MAT[t]).sort()];
    const anos = [...new Set(fonte.map((v) => v.d.slice(0, 4)))].sort().reverse();
    const antigo = params.get("contra");
    const pedido = params.get("vereador") || antigo;
    const f = {
      ver: pedido ? pessoas.find((k) => k === pedido || k === quem(pedido) || (porChave[k] && porChave[k].slug === pedido)) || "" : "",
      voto: antigo ? "contra" : ROT_VOTO[params.get("voto")] ? params.get("voto") : "",
      tema: temas.includes(params.get("tema")) ? params.get("tema") : "",
      mat: (params.get("mat") || "").split(",").filter((t) => tipos.includes(t)),
      ano: anos.includes(params.get("ano")) ? params.get("ano") : "",
      res: ["aprov", "neg"].includes(params.get("res")) ? params.get("res") : "",
      div: params.get("div") === "1",
      todas: params.get("todas") === "1",
    };
    const periodos = [["", `${dataBR(D.geral.periodo[0]).slice(-4)}–2028`], ...LEGS.map((l) => [String(l.ano), periodoLeg(l)])];
    const pchip = (k, r) => `<button type="button" class="chip" data-periodo="${esc(k)}" aria-pressed="${k === periodo}">${esc(r)}</button>`;
    const fotoBotao = (k) => `<button type="button" class="ver-b" data-ver="${esc(k)}" aria-pressed="false">${fotoDe(k)}<span>${esc(nomeDe(k))}</span></button>`;
    const interruptor = (id, txt, exp) => `<label class="interruptor"><span>${txt}<small>${exp}</small></span><input type="checkbox" id="${id}"></label>`;

    app.innerHTML = `<header class="cab-pagina">${rotulo(leg ? `Votações · legislatura ${periodoLeg(leg)}` : "Votações · legislatura atual")}
        <h1>Quem votou em quê</h1>
        <p class="lede">Cada cartão é uma votação no plenário: o placar, o resultado e quem ficou do lado menor. Escolha um vereador pela foto para ver o voto dele em cada uma.</p></header>
      ${leg ? `<div class="aviso">Legislatura ${esc(periodoLeg(leg))}. Aqui ficam só as votações relevantes: divididas, negadas, com abstenção, em temas sensíveis e de projetos de lei, de lei complementar e de emenda à Lei Orgânica.${C.nota_registro && leg.ano < 2019 ? " " + esc(C.nota_registro) : ""}</div>` : ""}
      <div class="painel">
        <aside class="lateral" id="lateral" aria-labelledby="t-filtros">
          <div class="lateral-topo"><h2 id="t-filtros">Filtros</h2><button type="button" class="lateral-fechar" aria-label="Fechar filtros">✕</button></div>
          ${LEGS.length ? `<fieldset class="grupo"><legend>Período</legend><div class="seg">${periodos.map(([k, r]) => pchip(k, r)).join("")}</div>
            ${anos.length > 1 ? `<div class="seg seg-ano">${chip("ano", "", "Todos")}${anos.map((a) => chip("ano", a, a)).join("")}</div>` : ""}</fieldset>` : ""}
          <fieldset class="grupo"><legend>Mostrar</legend><div class="seg">${chip("todas", "", "Principais")}${chip("todas", "1", "Todas")}</div>
            <p class="grupo-exp">"Todas" inclui a rotina: pareceres, nomes de rua e títulos aprovados por todos.</p></fieldset>
          <fieldset class="grupo"><legend>Resultado</legend><div class="seg">${chip("res", "", "Todos")}${chip("res", "aprov", "Aprovadas")}${chip("res", "neg", "Negadas")}</div></fieldset>
          <div class="grupo">${interruptor("f-div", "Só votações divididas", "Com votos a favor e contra")}</div>
          <fieldset class="grupo"><legend>Tipo de matéria</legend><div class="marca-lista">${tipos.map((t) => `<label><input type="checkbox" name="mat" value="${esc(t)}"${f.mat.includes(t) ? " checked" : ""}>${esc(TIPOS_MAT[t] ? TIPOS_MAT[t][0] : t)}<span class="n" data-n="${esc(t)}"></span></label>`).join("")}</div></fieldset>
          ${temas.length ? `<div class="grupo"><label class="grupo-rot" for="f-tema">Tema sensível</label><select id="f-tema">${opcoes(temas, "Todos os temas")}</select></div>` : ""}
          <fieldset class="grupo"><legend>Voto de um vereador</legend><div class="vers">${pessoas.map(fotoBotao).join("")}</div>
            <div class="seg seg-voto" id="seg-voto" hidden><span class="grupo-exp">Mostrar só quando votou:</span>${chip("voto", "", "Qualquer voto")}${Object.entries(ROT_VOTO).map(([k, r]) => chip("voto", k, r)).join("")}</div></fieldset>
          <button type="button" class="limpar" id="limpar">Limpar filtros</button>
          <div class="lateral-ver"><button type="button" class="botao-pr" id="ver-res">Ver votações</button></div>
        </aside>
        <div class="fundo-gaveta" id="fundo"></div>
        <div class="painel-main">
          <div class="lista-topo">
            <label class="busca-campo"><span>Buscar pelo assunto ou número</span><input type="search" id="f-busca" aria-label="Buscar pelo assunto ou número" placeholder="ex.: lixo, CEI, 604/2026"></label>
            <button type="button" class="filtros-btn" id="abrir-filtros" aria-controls="lateral" aria-expanded="false">Filtros <span class="filtros-n" id="filtros-n" hidden></span></button>
          </div>
          <div class="resumo-filtro" id="resumo" role="status"></div>
          <div id="ver-faixa"></div>
          <section id="destaques" aria-labelledby="t-dest"></section>
          <h2 class="t-lista" id="t-lista">Votações</h2>
          <p class="contagem" id="contagem"></p>
          <div id="lista"></div>
        </div>
      </div>
      <p class="aviso">"Dividida" quer dizer que houve votos a favor e contra. As fotos mostram quem ficou do lado menor só para facilitar a leitura: votar contra é parte normal do trabalho do vereador. "Não vota", em geral, é quem preside a sessão.</p>`;

    const $ = (s) => app.querySelector(s);
    $("#f-busca").value = params.get("busca") || "";
    $("#f-div").checked = f.div;
    if ($("#f-tema")) $("#f-tema").value = f.tema;

    const passa = (v, semTipo) => (f.todas || relevante(v)) && (!f.ano || v.d.startsWith(f.ano)) && (!f.div || v.div)
      && (!f.res || (f.res === "neg" ? negado(v) : aprovou(v.r || ""))) && (!f.tema || (v.sens || []).includes(f.tema))
      && (semTipo || !f.mat.length || f.mat.includes(tipoMat(v)))
      && (!f.ver || (f.voto ? votou(v, f.ver, f.voto) : ladoDe(v, f.ver)));
    const padrao = () => !f.ver && !f.tema && !f.mat.length && !f.ano && !f.res && !f.div && !f.todas && !$("#f-busca").value.trim();

    function desenhar() {
      const buscaTxt = $("#f-busca").value.trim(), busca = norm(buscaTxt);
      f.div = $("#f-div").checked; f.tema = $("#f-tema") ? $("#f-tema").value : "";
      f.mat = [...app.querySelectorAll('input[name="mat"]:checked')].map((i) => i.value);
      if (!f.ver) f.voto = "";
      gravarHash("votacoes", { periodo, busca: buscaTxt, vereador: f.ver, voto: f.voto, tema: f.tema, mat: f.mat.join(","), ano: f.ano, res: f.res, div: f.div ? "1" : "", todas: f.todas ? "1" : "" });
      app.querySelectorAll(".lateral .chip[data-f]").forEach((c) => c.setAttribute("aria-pressed", String(String(c.dataset.f === "todas" ? (f.todas ? "1" : "") : f[c.dataset.f]) === c.dataset.v)));
      app.querySelectorAll(".ver-b").forEach((b) => b.setAttribute("aria-pressed", String(f.ver === b.dataset.ver)));
      $("#seg-voto").hidden = !f.ver;
      const comBusca = fonte.filter((v) => !busca || norm(v.m + " " + v.a).includes(busca));
      const semTipo = comBusca.filter((v) => passa(v, true));
      app.querySelectorAll("[data-n]").forEach((s) => { s.textContent = fmt(semTipo.filter((v) => tipoMat(v) === s.dataset.n).length); });
      const lista = semTipo.filter((v) => !f.mat.length || f.mat.includes(tipoMat(v)));
      const neg = lista.filter(negado).length, div = lista.filter((v) => v.div).length;
      $("#resumo").innerHTML = `<div class="contador"><div class="contador-n">${fmt(lista.length)}</div><div class="contador-r">${lista.length === 1 ? "votação" : "votações"}</div><div class="contador-s">${padrao() ? "as principais; a rotina fica fora" : "neste filtro"}</div></div>
        <div class="contador"><div class="contador-n">${fmt(neg)}</div><div class="contador-r">${neg === 1 ? "negada" : "negadas"}</div><div class="contador-s">a maioria disse não</div></div>
        <div class="contador"><div class="contador-n">${fmt(div)}</div><div class="contador-r">${div === 1 ? "dividida" : "divididas"}</div><div class="contador-s">teve voto a favor e contra</div></div>`;
      if (f.ver) {
        const cont = {};
        lista.forEach((v) => { const o = ladoDe(v, f.ver); cont[o] = (cont[o] || 0) + 1; });
        const partes = Object.keys(ROT_VOTO).filter((k) => cont[k]).map((k) => `${fmt(cont[k])} ${ROT_VOTO[k].toLowerCase()}`);
        const v = porChave[f.ver] || antigos[f.ver];
        $("#ver-faixa").innerHTML = `<div class="ver-faixa">${fotoDe(f.ver)}<div class="ver-faixa-t"><strong>${esc(nomeDe(f.ver))}${v && v.partido ? ` <small>${esc(v.partido)}</small>` : ""}</strong>
          Nestas votações: ${esc(partes.join(", ") || "nenhum voto registrado")}. Só entram as votações com o nome de quem votou.${v ? ` <a href="${hrefPerfil(v)}">Ver o perfil</a>` : ""}</div>
          <button type="button" class="chip" id="tirar-ver">Tirar vereador</button></div>`;
        $("#tirar-ver").addEventListener("click", () => { f.ver = ""; desenhar(); });
      } else $("#ver-faixa").innerHTML = "";
      // Faixa de destaques: só na lista sem filtros (uma votação por matéria, as mais recentes).
      const vistas = new Set();
      const dest = padrao() ? fonte.filter(importante).filter((v) => { const k = materiaBase(v.m); if (vistas.has(k)) return false; vistas.add(k); return true; }).slice(0, 3) : [];
      $("#destaques").innerHTML = dest.length ? `<h2 id="t-dest">Votações que mais importam</h2>
        <p class="suave dest-exp">As mais recentes que mudam leis, tocam em temas sensíveis ou foram negadas, e em que houve divergência.</p>
        <div class="grade-vot destaques">${dest.map((v, i) => cartaoVotacao(v, "", i === 0)).join("")}</div>` : "";
      $("#t-lista").textContent = dest.length ? "Todas as votações principais" : "Votações";
      $("#contagem").textContent = `${fmt(lista.length)} ${lista.length === 1 ? "votação" : "votações"}, da mais recente para a mais antiga`;
      paginar(lista, 1, (v) => cartaoVotacao(v, f.ver), $("#lista"), emGradeVot, 20);
      const ativos = [f.ano, f.res, f.ver, f.voto, f.div, f.todas, f.tema].filter(Boolean).length + f.mat.length;
      $("#filtros-n").hidden = !ativos; $("#filtros-n").textContent = ativos;
      $("#ver-res").textContent = `Ver ${fmt(lista.length)} ${lista.length === 1 ? "votação" : "votações"}`;
    }

    app.querySelectorAll(".lateral .chip[data-f]").forEach((c) => c.addEventListener("click", () => {
      f[c.dataset.f] = c.dataset.f === "todas" ? c.dataset.v === "1" : c.dataset.v; desenhar();
    }));
    app.querySelectorAll(".ver-b").forEach((b) => b.addEventListener("click", () => { f.ver = f.ver === b.dataset.ver ? "" : b.dataset.ver; desenhar(); }));
    app.querySelectorAll(".lateral input, .lateral select").forEach((i) => i.addEventListener("change", desenhar));
    let espera;
    $("#f-busca").addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(desenhar, 200); });
    $("#limpar").addEventListener("click", () => {
      Object.assign(f, { ver: "", voto: "", tema: "", ano: "", res: "", todas: false });
      $("#f-div").checked = false; if ($("#f-tema")) $("#f-tema").value = "";
      app.querySelectorAll('input[name="mat"]').forEach((i) => { i.checked = false; });
      desenhar();
    });
    // Trocar o período recarrega a página (outra fonte de dados e outra lista de vereadores);
    // mantém a busca e o vereador, se ele também atuou no período escolhido.
    app.querySelectorAll("[data-periodo]").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.periodo === periodo) return;
      const q = new URLSearchParams();
      if (b.dataset.periodo) q.set("periodo", b.dataset.periodo);
      if ($("#f-busca").value.trim()) q.set("busca", $("#f-busca").value.trim());
      if (f.ver) q.set("vereador", f.ver);
      location.hash = "#votacoes" + (q.toString() ? "/" + q : "");
    }));
    // Gaveta de filtros no celular.
    const lateral = $("#lateral"), fundo = $("#fundo"), abrirBtn = $("#abrir-filtros");
    function gaveta(abrir) {
      lateral.classList.toggle("aberta", abrir); fundo.classList.toggle("aberta", abrir);
      abrirBtn.setAttribute("aria-expanded", String(abrir));
      document.body.classList.toggle("sem-rolagem", abrir);
      (abrir ? lateral.querySelector(".lateral-fechar") : abrirBtn).focus();
    }
    abrirBtn.addEventListener("click", () => gaveta(true));
    lateral.querySelector(".lateral-fechar").addEventListener("click", () => gaveta(false));
    $("#ver-res").addEventListener("click", () => gaveta(false));
    fundo.addEventListener("click", () => gaveta(false));
    lateral.addEventListener("keydown", (e) => { if (e.key === "Escape" && lateral.classList.contains("aberta")) { e.stopPropagation(); gaveta(false); } });
    desenhar();
  }

  // Siglas que aparecem nos textos dos casos, explicadas no próprio cartão.
  const SIGLAS = {
    CEI: "Comissão Especial de Inquérito: grupo de vereadores que investiga um fato.",
    CPI: "Comissão Parlamentar de Inquérito: o mesmo tipo de investigação, com outro nome.",
    ISS: "Imposto Sobre Serviços, cobrado pela Prefeitura.",
    LOA: "Lei Orçamentária Anual.", LDO: "Lei de Diretrizes Orçamentárias.", PPA: "Plano Plurianual.",
  };
  function siglasDe(texto) {
    const achadas = Object.keys(SIGLAS).filter((s) => new RegExp(`\\b${s}\\b`).test(texto));
    return achadas.length ? `<p class="siglas">${achadas.map((s) => `<b>${s}</b>: ${esc(SIGLAS[s])}`).join(" ")}</p>` : "";
  }

  // ------------------------------------------------------------ peças visuais (estilos em tema.css)
  // Rótulo pequeno em fonte mono, acima de títulos (como no Raízes).
  const rotulo = (t, cls) => `<span class="rotulo${cls ? " " + cls : ""}">${esc(t)}</span>`;
  const dominio = (u) => { try { return new URL(String(u)).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };

  // Foto a partir da chave do voto: vereador atual tem foto; quem só atuou antes fica com as iniciais.
  function fotoDe(chave) {
    if (porChave[chave]) return foto(porChave[chave]);
    return `<span class="foto">${esc(iniciais(titulo(antigos[chave] ? antigos[chave].nome : chave)))}</span>`;
  }
  // Foto + nome com link para o perfil (grade de votos, sessão, temas).
  function pessoaMini(chave, extra) {
    const v = porChave[chave] || antigos[chave];
    const dentro = `${fotoDe(chave)}<span class="pessoa-txt"><span class="pessoa-nome">${esc(nomeDe(chave))}</span>${extra ? `<span class="pessoa-extra">${extra}</span>` : ""}</span>`;
    return v ? `<a class="pessoa" href="${hrefPerfil(v)}">${dentro}</a>` : `<span class="pessoa">${dentro}</span>`;
  }

  // Placar em barra: a cor só reforça; a palavra e o número estão sempre escritos.
  // `grande` separa abstenção, ausência e "não vota"; o pequeno junta em "outros".
  function barraPlacar(n, grande) {
    n = n || {};
    if (!soma(n)) return `<p class="so-placar">O SisCam não registrou o placar desta votação.</p>`;
    const f = n.favor || 0, c = n.contra || 0, o = (n.abstencao || 0) + (n.ausente || 0) + (n.nao_vota || 0);
    const t = f + c + o || 1;
    const leg = [`<span class="lf"><b>${f}</b> a favor</span>`, `<span class="lc"><b>${c}</b> contra</span>`];
    if (grande) ["abstencao", "ausente", "nao_vota"].forEach((k) => { if (n[k]) leg.push(`<span class="lo"><b>${n[k]}</b> ${esc(ROT_VOTO[k].toLowerCase())}</span>`); });
    else if (o) leg.push(`<span class="lo"><b>${o}</b> ${o === 1 ? "outro" : "outros"}</span>`);
    return `<div class="placar-v${grande ? " placar-g" : ""}">
      <div class="placar-trilho" aria-hidden="true"><span class="pf" style="width:${(100 * f) / t}%"></span><span class="pc" style="width:${(100 * c) / t}%"></span><span class="po" style="width:${(100 * o) / t}%"></span></div>
      <div class="placar-leg">${leg.join("")}</div></div>`;
  }

  // Grade com foto de cada vereador, agrupada pelo voto.
  function gradeVotos(v) {
    const ordem = ["favor", "contra", "abstencao", "ausente", "nao_vota"];
    const grupos = ordem.filter((k) => v.v && v.v[k] && v.v[k].length);
    if (!grupos.length) return `<p class="suave">O SisCam registrou só o placar desta votação, sem o nome de quem votou.</p>`;
    return `<div class="votos-grade">${grupos.map((k) => `<section class="vg vg-${k}">
      <h3><span class="vg-marca" aria-hidden="true"></span>${ROT_VOTO[k]} <span class="vg-n">${v.v[k].length}</span></h3>
      ${k === "nao_vota" ? `<p class="vg-exp">Em geral, quem preside a sessão, que só vota nos casos previstos no Regimento (como desempate).</p>` : ""}
      <ul>${v.v[k].map((ch) => `<li>${pessoaMini(ch)}</li>`).join("")}</ul></section>`).join("")}</div>`;
  }

  // Compartilhar no WhatsApp + copiar o link (com retorno para leitor de tela).
  function compartilhar(texto, link) {
    return `<div class="compartilhar">${botaoZap(texto, link)}
      <button type="button" class="b-copiar" data-link="${esc(link)}">Copiar link</button>
      <span class="copiado" role="status"></span></div>`;
  }
  function ligarCopiar(raiz) {
    raiz.querySelectorAll(".b-copiar").forEach((b) => b.addEventListener("click", () => {
      const link = b.dataset.link, aviso = b.parentElement.querySelector(".copiado");
      const ok = () => { aviso.textContent = "Link copiado."; };
      const manual = () => {
        try {
          const t = document.createElement("textarea");
          t.value = link; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
          document.body.appendChild(t); t.select();
          const deu = document.execCommand("copy"); t.remove();
          if (deu) return ok();
        } catch (e) { /* segue para o texto */ }
        aviso.textContent = "Copie o endereço: " + link;
      };
      try { navigator.clipboard.writeText(link).then(ok, manual); } catch (e) { manual(); }
    }));
  }

  // Texto longo em parágrafos de duas frases (não quebra em "Req. 1710").
  function paragrafos(texto) {
    const frases = String(texto || "").split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“])/);
    const ps = [];
    for (let i = 0; i < frases.length; i += 2) ps.push(frases.slice(i, i + 2).join(" "));
    return ps.filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  }

  // ------------------------------------------------------------ votações: tipo, título curto e cartão com placar
  // Tipo da matéria ("Projeto de Lei", "Moção"…), com o nome e a explicação que o morador entende.
  const tipoMat = (v) => v.m.split(" Nº")[0].split(" N°")[0];
  const TIPOS_MAT = {
    "Projeto de Lei": ["Projeto de lei", "proposta de nova lei municipal"],
    "Projeto de Lei Complementar": ["Lei complementar", "PLC: projeto que muda leis básicas da cidade, como impostos e regras dos servidores"],
    "Projeto de Emenda à Lei Orgânica": ["Emenda à Lei Orgânica", "muda a Lei Orgânica, a \"constituição\" da cidade"],
    "Veto": ["Veto", "o prefeito recusou uma lei aprovada; a Câmara decide se mantém a recusa"],
    "Emenda": ["Emenda", "mudança no texto de um projeto"],
    "Moção": ["Moção", "manifestação da Câmara (aplauso, apoio ou repúdio); não vira lei"],
    "Requerimento": ["Requerimento", "pedido de informação ou de providência, inclusive de investigação (CEI)"],
    "Projeto de Decreto Legislativo": ["Decreto legislativo", "decisão da própria Câmara, como títulos de cidadão e contas"],
    "Projeto de Resolução": ["Resolução", "regra interna da Câmara"],
    "Parecer": ["Parecer", "opinião de uma comissão sobre um projeto, votada antes dele"],
  };
  const TIPOS_ORDEM = Object.keys(TIPOS_MAT);
  const tipoNome = (v) => (TIPOS_MAT[tipoMat(v)] || [tipoMat(v)])[0];
  const ehLei = (v) => /^(Projeto de Lei|Projeto de Lei Complementar|Projeto de Emenda à Lei Orgânica|Veto)$/.test(tipoMat(v));
  const negado = (v) => ehNegado(v.r);
  // Rotina: nome de rua, título de cidadão, utilidade pública (aprovados por todos, sem efeito na vida da cidade).
  const rotina = (v) => /denomina|t[íi]tulo de .{0,3}cidad|cidad[ãa][oã] \p{L}+(?:an[oa]|ense)|utilidade p[úu]blica|medalha|comenda/iu.test(v.a || "");
  // "Principais": tudo que teve divergência, foi negado ou é tema sensível, mais as leis que não são rotina.
  const relevante = (v) => v.div || negado(v) || (v.sens || []).length > 0 || ((ehLei(v) || tipoMat(v) === "Projeto de Resolução") && !rotina(v));
  // "Mais importam": leis, vetos, temas sensíveis, CEI e pedidos negados, quando houve divergência.
  const importante = (v) => (v.div || negado(v)) && !/^(Parecer|Emenda)/.test(v.m) &&
    (ehLei(v) || (v.sens || []).length > 0 || negado(v) || /CEI|inqu[ée]rito/i.test(v.a || ""));
  const SENS_CURTO = {
    "Impostos e taxas": "Impostos", "Investigação/fiscalização do Executivo": "Investigação", "Empréstimos e créditos": "Empréstimos",
    "Patrimônio público": "Patrimônio", "Orçamento": "Orçamento", "Salários e benefícios de agentes políticos": "Salários de políticos",
  };
  const sensCurto = (t) => SENS_CURTO[t] || t;
  const CLS_TIPO = { "Projeto de Lei": "t-lei", "Projeto de Lei Complementar": "t-lei", "Projeto de Emenda à Lei Orgânica": "t-lei", "Veto": "t-lei", "Moção": "t-mocao", "Requerimento": "t-req", "Parecer": "t-parecer" };
  const clsTipo = (v) => CLS_TIPO[tipoMat(v)] || "t-outro";
  const numeroMat = (v) => { const x = /N[º°]\s*([\d./]+)/.exec(v.m); return x ? x[1] : ""; };
  const primeiroNome = (k) => nomeDe(k).split(" ").slice(0, 2).join(" ");

  // Assunto como título curto: sem fórmulas ("REQUEIRO À MESA…", "e dá outras providências") e sem caixa alta.
  const ROMANOS = /(?<!\p{L})(?:I{1,3}|Iv|Vi{0,3}|Ix|Xi{0,3})(?!\p{L})/gu;
  function curto(v, max = 110) {
    let a = String(v.a || v.m).trim().replace(/\s+/g, " ");
    if (a === a.toUpperCase()) a = a.toLocaleLowerCase("pt-BR");
    a = a.replace(/[A-ZÀ-Ý]{2,}(?:[\s,]+[A-ZÀ-Ý]+)*[\s,]+[A-ZÀ-Ý]{2,}/g, (m) => titulo(m).replace(ROMANOS, (r) => r.toUpperCase()));
    a = a.replace(/^requeiro à mesa(?: desta augusta casa legislativa)?,?\s*(?:após\s+)?ouvido o egrégio plenário(?:,?\s*na forma regimental)?,?\s*/i, "")
      .replace(/^com fundamento .*?,\s*(?=digne-se)/i, "").replace(/^digne-se\s+/i, "").replace(/^de aprovar e encaminhar a presente\s+/i, "")
      .replace(/^oficiar (?:a|o|ao)\s+(?:Exmo\.?\s*Sr\.?|Excelentíssimo Senhor|Senhor)\s+/i, "Pedir ao ")
      .replace(/^Parecer ao .+? - /i, "").replace(/^Projeto de Lei (Complementar )?que /i, "")
      .replace(/[,;]?\s*e dá outras providências\.?$/i, "").replace(/[‘’“”]+/g, "\"").replace(/""/g, "\"")
      .replace(/"\s*([^"]*?)\s*"/g, "\"$1\"").replace(/\s+\./g, ".");
    a = a.charAt(0).toLocaleUpperCase("pt-BR") + a.slice(1);
    if (a.length > max) a = a.slice(0, a.lastIndexOf(" ", max - 1)).replace(/[,;:.\-–]+$/, "") + "…";
    return a;
  }
  function autoria(v) {
    const au = (v.au || []).map(titulo);
    return au.length > 2 ? `${au.slice(0, 2).join(", ")} e mais ${au.length - 2}` : au.join(" e ");
  }
  // Quem ficou do lado menor: em geral quem votou contra; se o "contra" venceu, quem votou a favor.
  function minoria(v) {
    if (!v.v) return null;
    const f = v.v.favor || [], c = v.v.contra || [];
    if (c.length && c.length <= f.length) return { rot: "Votaram contra", nomes: c };
    if (f.length && f.length < c.length) return { rot: "Votaram a favor", nomes: f };
    return null;
  }
  // Fileira de fotos pequenas de quem ficou do lado menor; o vereador escolhido no filtro fica realçado.
  function fileira(v, destaque) {
    const m = minoria(v);
    const n = v.n || {};
    if (!m) return soma(n) ? `<p class="so-placar">${n.contra ? "O SisCam registrou só o placar, sem os nomes." : "Ninguém votou contra."}</p>` : "";
    const nomes = destaque && m.nomes.includes(destaque) ? [destaque, ...m.nomes.filter((k) => k !== destaque)] : m.nomes;
    const mostra = nomes.slice(0, 6), resto = nomes.length - mostra.length;
    const fotos = mostra.map((k) => (k === destaque ? fotoDe(k).replace('class="foto"', 'class="foto eu"') : fotoDe(k))).join("");
    const txt = nomes.map((k) => (k === destaque ? `<mark>${esc(nomeDe(k))}</mark>` : esc(nomeDe(k))));
    return `<div class="fileira"><span class="fileira-fotos" aria-hidden="true">${fotos}${resto > 0 ? `<span class="mais-n">+${resto}</span>` : ""}</span>
      <span class="fileira-txt"><b>${m.rot}:</b> ${txt.length <= 3 ? txt.join(", ") : `${txt.slice(0, 2).join(", ")} e mais ${txt.length - 2}`}</span></div>`;
  }
  function porQue(v) {
    const r = [];
    if (ehLei(v)) r.push(tipoMat(v) === "Veto" ? "veto do prefeito" : "muda uma lei da cidade");
    if ((v.sens || []).length) r.push("tema sensível: " + v.sens.map((t) => sensCurto(t).toLowerCase()).join(", "));
    if (negado(v)) r.push("a Câmara negou");
    if (v.div) r.push("houve votos contra");
    return r.length ? `<p class="por-que"><b>Por que importa:</b> ${esc(r.join("; "))}.</p>` : "";
  }
  // Cartão de uma votação: tipo e data, assunto curto, placar com números grandes e fotos do lado menor.
  // `destaque`: chave do vereador escolhido (mostra "Voto de X"); `largo`: cartão grande da faixa de destaques.
  function cartaoVotacao(v, destaque, largo) {
    const meta = `${esc(tipoNome(v))}${numeroMat(v) ? " nº " + esc(numeroMat(v)) : ""}${v.f ? " · " + esc(v.f.toLowerCase()) : ""}${autoria(v) ? " · autoria: " + esc(autoria(v)) : ""}`;
    return `<a class="vot-card ${clsTipo(v)}${largo ? " vot-largo" : ""}" href="#votacao/${encodeURIComponent(v.id)}">
      <div class="vot-esq"><div class="vot-topo">${rotulo(tipoNome(v))}<span class="vot-data">${dataBR(v.d)}</span></div>
        <h3>${esc(curto(v, largo ? 160 : 110))}</h3><p class="vot-meta">${meta}</p>${largo ? porQue(v) : ""}</div>
      <div class="vot-dir">${destaque ? `<p class="vot-dele">Voto de ${esc(primeiroNome(destaque))}: ${etqVoto(ladoDe(v, destaque))}</p>` : ""}${barraPlacar(v.n)}${fileira(v, destaque)}</div>
      <div class="vot-pe">${etqResultado(v.r)}${(v.sens || []).map((t) => `<span class="etq etq-sens">${esc(sensCurto(t))}</span>`).join("")}${v.div ? `<span class="etq etq-div">dividida</span>` : ""}
        <span class="vot-ver">Ver os votos <span aria-hidden="true">→</span></span></div></a>`;
  }
  const emGradeVot = (html) => `<div class="grade-vot">${html}</div>`;

  // ------------------------------------------------------------ casos documentados
  const casoAno = (c) => String(c.data || "").slice(0, 4);
  const casoOk = (c) => /^verificado$/i.test(c.status || "");
  const etqStatus = (c) => `<span class="etq ${casoOk(c) ? "etq-ok" : "etq-parcial"}">${esc(c.status || "sem status")}</span>`;
  const casosOrdem = [...D.casos].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  // Cada tema ganha uma cor de faixa (decorativa; o nome do tema está sempre escrito).
  const TEMAS_CASO = [...new Set(D.casos.map((c) => c.tema).filter(Boolean))].sort();
  const clsTema = (t) => `tema-c${Math.max(0, TEMAS_CASO.indexOf(t)) % 5}`;
  // Votação que resume o caso: a primeira do projeto ou requerimento (não emenda nem parecer).
  const votPrincipal = (c) => { const vs = c.votacoes || []; return vs.find((x) => !/^(Emenda|Parecer)/.test(x.m)) || vs[0]; };
  const resultadoTxt = (r) => (r ? titulo(r) : "sem resultado");

  function cartaoCaso(c) {
    const v = votPrincipal(c);
    return `<a class="caso-card ${clsTema(c.tema)}" href="#caso/${encodeURIComponent(c.id)}">
      <div class="caso-card-topo">${rotulo(c.tema || "Caso")}<span class="caso-data">${dataBR(c.data)}</span></div>
      <h3>${esc(c.titulo)}</h3>
      ${c.curto ? `<p class="caso-curto">${esc(c.curto)}</p>` : ""}
      ${v ? `${barraPlacar(v.n)}<div class="caso-res">Resultado no plenário: <b>${esc(resultadoTxt(v.r))}</b></div>`
        : `<p class="caso-res">Sem votação nominal no plenário</p>`}
      <div class="caso-card-pe">${etqStatus(c)}<span class="caso-ler">Ler o caso <span aria-hidden="true">→</span></span></div></a>`;
  }

  // Uma votação do caso, com placar grande e a grade de votos com foto.
  function votacaoDoCaso(v) {
    return `<div class="cartao caso-vot">
      <div class="caso-vot-topo"><div>${rotulo(v.f || "Votação")}
        <h3><a href="#votacao/${encodeURIComponent(v.id)}">${esc(v.m)}</a></h3>
        <div class="item-meta">${dataBR(v.d)} · votação ${esc((v.t || "—").toLowerCase())} · ${ext(urlDocumento(v.doc), "documento oficial", "", "Documento oficial de " + v.m)}</div></div>
        ${etqResultado(v.r)}</div>
      ${barraPlacar(v.n, true)}
      ${gradeVotos(v)}</div>`;
  }

  // Página de uma votação, no padrão da página de caso: cabeçalho com faixa de cor, "o que foi votado",
  // placar grande com a grade de votos em foto, outras votações da mesma matéria, casos ligados e compartilhar.
  function votacao(id) {
    let v = D.votacoes.find((x) => x.id === id);
    if (!v && LEGS.length && !D.historico) {  // pode ser de uma legislatura anterior
      app.innerHTML = CARREGANDO;
      const n = geracao;
      carregar("historico").then(() => { if (n === geracao) { votacao(id); aoDesenhar("votacao", true); } },
        () => { if (n === geracao) app.innerHTML = ERRO_CARGA; });
      return;
    }
    v = v || (D.historico ? D.historico.votacoes.find((x) => x.id === id) : null);
    if (!v) {
      app.innerHTML = `<p class="voltar"><a href="#votacoes">← Todas as votações</a></p><h1>Votação não encontrada</h1>
        <p class="vazio">Só as votações listadas no site têm link próprio; aprovações unânimes de rotina ficam de fora.</p>`;
      return;
    }
    const leg = v.l ? legDe(v.l) : null;
    const fonte = leg ? D.historico.votacoes : D.votacoes;
    const s = [...(D.sessoes || []), ...(D.historico ? D.historico.sessoes : [])].find((x) => x[0] === v.s);
    const casosLigados = D.casos.filter((c) => (c.votacoes || []).some((x) => x.id === v.id));
    const mb = materiaBase(v.m);
    const mesma = fonte.filter((x) => x.id !== v.id && materiaBase(x.m) === mb).sort((a, b) => a.d.localeCompare(b.d));
    const mesmoPlacar = (x) => JSON.stringify(x.v || {}) === JSON.stringify(v.v || {}) && JSON.stringify(x.n) === JSON.stringify(v.n);
    const n = v.n || {}, fav = n.favor || 0, con = n.contra || 0;
    const res = resultadoRot(v.r);
    const frase = `${res}${con || fav ? (con ? ` por ${fav} a ${con}` : " sem votos contra") : ""}${s ? ` na ${s[1]}` : ""}, em ${dataBR(v.d)}.`;
    const placar = Object.entries(n).map(([k, x]) => `${(ROT_VOTO[k] || k).toLowerCase()}: ${x}`).join(", ");
    const link = `${PAGINA}#votacao/${encodeURIComponent(v.id)}`;
    const texto = `Câmara de ${C.nome}, ${dataBR(v.d)}: ${curto(v, 140)} (${v.m}). Resultado: ${res}${placar ? ` (${placar})` : ""}. Veja como cada vereador votou:`;
    const tipoExp = TIPOS_MAT[tipoMat(v)];
    app.innerHTML = `<p class="voltar"><a href="#votacoes${leg ? "/periodo=" + leg.ano : ""}">← Todas as votações${leg ? " de " + esc(periodoLeg(leg)) : ""}</a></p>
      <header class="caso-cab ${clsTipo(v)}">
        <div class="caso-cab-meta">${rotulo(tipoNome(v))}<span>${dataBR(v.d)}</span><span>${esc(v.m)}</span>${etqResultado(v.r)}${v.div ? `<span class="etq etq-div">dividida</span>` : ""}
          ${(v.sens || []).map((t) => `<span class="etq etq-sens">${esc(sensCurto(t))}</span>`).join("")}</div>
        <h1>${esc(curto(v, 220))}</h1>
        <p class="lede">${esc(frase)}</p>
      </header>
      <section class="em-jogo" aria-labelledby="t-votado">${rotulo("O que foi votado")}<p id="t-votado">${esc(v.a)}</p>
        <p class="siglas">${tipoExp ? `<b>${esc(tipoExp[0])}</b>: ${esc(tipoExp[1])}. ` : ""}${v.f ? `Fase: ${esc(v.f.toLowerCase())}. ` : ""}Votação ${esc((v.t || "—").toLowerCase())}.${autoria(v) ? ` Autoria: ${(v.au || []).map(linkVereador).join(", ")}.` : ""}${leg ? ` Legislatura ${esc(periodoLeg(leg))}.` : ""}</p>
        ${siglasDe(v.a)}</section>
      <section aria-labelledby="t-votos"><h2 id="t-votos">Como cada vereador votou</h2>
        <div class="cartao caso-vot">${barraPlacar(v.n, true)}${gradeVotos(v)}</div>
        ${mesma.length ? `<h3 class="sub">Outras votações da mesma matéria</h3><ul class="outras-vot">${mesma.map((x) => `<li class="cartao">
            <div><a href="#votacao/${encodeURIComponent(x.id)}">${esc(x.m)}</a><div class="item-meta">${dataBR(x.d)}${x.f ? " · " + esc(x.f) : ""} · resultado: ${esc(resultadoTxt(x.r))}${mesmoPlacar(x) ? " · mesmos votos desta votação" : ""}</div></div>
            ${barraPlacar(x.n)}</li>`).join("")}</ul>` : ""}
      </section>
      ${casosLigados.length ? `<section aria-labelledby="t-casos"><h2 id="t-casos">Casos documentados</h2><div class="grade-casos">${casosLigados.map(cartaoCaso).join("")}</div></section>` : ""}
      <section class="cartao caso-partilha" aria-labelledby="t-partilha"><h2 id="t-partilha">Compartilhe esta votação</h2>
        <p class="suave">O link abre direto nesta página, com o voto de cada vereador.</p>${compartilhar(texto, link)}
        <p class="item-meta fontes-vot">Fontes oficiais: ${ext(urlDocumento(v.doc), "documento no SisCam", "", "Documento oficial de " + v.m)} · ${ext(urlSessao(v.s), s ? s[1] + " no SisCam" : "sessão no SisCam")}</p></section>`;
    ligarCopiar(app);
  }

  // Botões de filtro (chips): data-f = nome do filtro, data-v = valor ("" = todos).
  const chip = (f, v, txt) => `<button type="button" class="chip" data-f="${esc(f)}" data-v="${esc(v)}" aria-pressed="false">${esc(txt)}</button>`;

  function casos(arg, params) {
    // Endereço antigo #casos/<id> abre a página do caso.
    if (arg && !arg.includes("=") && D.casos.some((c) => c.id === arg)) { location.replace("#caso/" + encodeURIComponent(arg)); return; }
    if (!D.casos.length) {
      app.innerHTML = `<header class="cab-pagina">${rotulo("Casos documentados")}
          <h1>Casos documentados</h1>
          <p class="lede">Episódios relevantes da Câmara de ${esc(C.nome)}, com o voto de cada vereador, a linha do tempo e as fontes.</p></header>
        <div class="cartao casos-vazio">
          <p class="casos-vazio-t">Nenhum caso documentado ainda.</p>
          <p class="suave">Um caso só entra aqui depois de conferido em documento público ou na imprensa identificada. Enquanto isso, os votos de cada vereador já estão em <a href="#votacoes">Votações</a> e em <a href="#temas">Temas</a>.</p>
        </div>`;
      return;
    }
    const temas = TEMAS_CASO, anos = [...new Set(D.casos.map(casoAno))].sort().reverse();
    const filtro = { tema: temas.includes(params.get("tema")) ? params.get("tema") : "", ano: anos.includes(params.get("ano")) ? params.get("ano") : "" };
    app.innerHTML = `<header class="cab-pagina">${rotulo("Casos documentados")}
        <h1>Casos documentados</h1>
        <p class="lede">Episódios relevantes da Câmara de ${esc(C.nome)}. Cada caso tem uma página com o voto de cada vereador, a linha do tempo e as fontes. Só entra aqui o que foi conferido em documento público ou na imprensa identificada.</p></header>
      <div class="chips-bloco">
        <div class="chips" role="group" aria-label="Filtrar por tema"><span class="chips-rot">Tema</span>${chip("tema", "", "Todos")}${temas.map((t) => chip("tema", t, t)).join("")}</div>
        <div class="chips" role="group" aria-label="Filtrar por ano"><span class="chips-rot">Ano</span>${chip("ano", "", "Todos")}${anos.map((a) => chip("ano", a, a)).join("")}</div>
      </div>
      <p class="contagem" id="contagem" role="status"></p>
      <div class="grade-casos" id="lista"></div>
      <p class="aviso">"Verificado" quer dizer que o fato e os votos foram conferidos nas fontes listadas em cada caso. Os casos mostram o que foi votado e decidido; não fazem juízo sobre as pessoas.</p>`;
    function desenhar() {
      app.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(filtro[b.dataset.f] === b.dataset.v)));
      const lista = casosOrdem.filter((c) => (!filtro.tema || c.tema === filtro.tema) && (!filtro.ano || casoAno(c) === filtro.ano));
      app.querySelector("#contagem").textContent = `${lista.length} ${lista.length === 1 ? "caso" : "casos"}`;
      app.querySelector("#lista").innerHTML = lista.map(cartaoCaso).join("") || `<p class="vazio">Nenhum caso com esses filtros. <button type="button" class="chip" data-f="limpar" data-v="">Limpar filtros</button></p>`;
      const limpar = app.querySelector('#lista [data-f="limpar"]');
      if (limpar) limpar.addEventListener("click", () => { filtro.tema = ""; filtro.ano = ""; gravarHash("casos", filtro); desenhar(); });
    }
    app.querySelectorAll(".chips .chip").forEach((b) => b.addEventListener("click", () => {
      filtro[b.dataset.f] = b.dataset.v; gravarHash("casos", filtro); desenhar();
    }));
    desenhar();
  }

  function caso(id) {
    const c = D.casos.find((x) => x.id === id);
    if (!c) {
      app.innerHTML = `<p class="voltar"><a href="#casos">← Casos documentados</a></p><h1>Caso não encontrado</h1>
        <p class="vazio">Confira o endereço ou veja a <a href="#casos">lista de casos</a>.</p>`;
      return;
    }
    const i = casosOrdem.indexOf(c);
    const maisNovo = casosOrdem[i - 1], maisAntigo = casosOrdem[i + 1];
    const vs = c.votacoes || [], v = votPrincipal(c);
    const outras = vs.filter((x) => x !== v);
    const link = `${PAGINA}#caso/${encodeURIComponent(c.id)}`;
    const texto = `${c.titulo} (${dataBR(c.data)}). ${c.curto || ""} Veja o voto de cada vereador e as fontes:`;
    const vizinhos = casosOrdem.filter((x) => x !== c).sort((a, b) => (b.tema === c.tema) - (a.tema === c.tema)).slice(0, 3);
    const mesmoPlacar = (x) => JSON.stringify(x.v || {}) === JSON.stringify(v.v || {});
    app.innerHTML = `<p class="voltar"><a href="#casos">← Casos documentados</a></p>
      <header class="caso-cab ${clsTema(c.tema)}">
        <div class="caso-cab-meta">${rotulo(c.tema || "Caso")}<span>${dataBR(c.data)}</span>${c.materia ? `<span>${esc(c.materia)}</span>` : ""}${etqStatus(c)}</div>
        <h1>${esc(c.titulo)}</h1>
        ${c.curto ? `<p class="lede">${esc(c.curto)}</p>` : ""}
      </header>
      ${c.em_jogo ? `<section class="em-jogo" aria-labelledby="t-jogo">${rotulo("O que estava em jogo")}<p id="t-jogo">${esc(c.em_jogo)}</p>
        ${siglasDe(c.titulo + " " + c.em_jogo + " " + c.resumo)}</section>` : ""}
      <section aria-labelledby="t-votos"><h2 id="t-votos">Como cada vereador votou</h2>
        ${v ? votacaoDoCaso(v) : `<p class="vazio cartao">Este caso não teve votação nominal no plenário. Os fatos estão na linha do tempo e nas fontes abaixo.</p>`}
        ${outras.length ? `<h3 class="sub">Outras votações da mesma matéria</h3><ul class="outras-vot">${outras.map((x) => `<li class="cartao">
            <div><a href="#votacao/${encodeURIComponent(x.id)}">${esc(x.m)}</a><div class="item-meta">${dataBR(x.d)}${x.f ? " · " + esc(x.f) : ""} · resultado: ${esc(resultadoTxt(x.r))}${mesmoPlacar(x) ? " · mesmos votos da votação acima" : ""}</div></div>
            ${barraPlacar(x.n)}</li>`).join("")}</ul>` : ""}
      </section>
      <div class="caso-duas">
        ${(c.linha_do_tempo || []).length ? `<section aria-labelledby="t-tempo"><h2 id="t-tempo">Linha do tempo</h2>
          <ol class="linha-tempo">${c.linha_do_tempo.map(([d, t]) => `<li><span class="lt-data">${esc(dataBR(d))}</span><span class="lt-txt">${esc(t)}</span></li>`).join("")}</ol></section>` : ""}
        <section aria-labelledby="t-resumo"><h2 id="t-resumo">O caso em detalhe</h2><div class="resumo">${paragrafos(c.resumo)}</div></section>
      </div>
      <section aria-labelledby="t-fontes"><h2 id="t-fontes">Fontes</h2>
        <ol class="fontes">${(c.fontes || []).map((f) => `<li><a href="${url(f.url)}" target="_blank" rel="noopener" aria-label="${esc(f.nome)} (abre em nova aba)">
          <span class="fonte-nome">${esc(f.nome)}</span><span class="fonte-dom">${esc(dominio(f.url))} <span aria-hidden="true">↗</span></span></a></li>`).join("")}</ol></section>
      <section class="cartao caso-partilha" aria-labelledby="t-partilha"><h2 id="t-partilha">Compartilhe este caso</h2>
        <p class="suave">O link abre direto nesta página, com os votos e as fontes.</p>${compartilhar(texto, link)}</section>
      <nav class="caso-nav" aria-label="Caso anterior e próximo">
        ${maisAntigo ? `<a class="caso-nav-a" href="#caso/${encodeURIComponent(maisAntigo.id)}"><span class="rotulo">← Caso anterior</span><span>${esc(maisAntigo.titulo)}</span></a>` : "<span></span>"}
        ${maisNovo ? `<a class="caso-nav-a caso-nav-p" href="#caso/${encodeURIComponent(maisNovo.id)}"><span class="rotulo">Próximo caso →</span><span>${esc(maisNovo.titulo)}</span></a>` : "<span></span>"}
      </nav>
      ${vizinhos.length ? `<h2>Outros casos</h2><div class="grade-casos">${vizinhos.map(cartaoCaso).join("")}</div>
        <p><a class="botao" href="#casos">Ver todos os casos</a></p>` : ""}`;
    ligarCopiar(app);
  }

  const LINKS_OFICIAIS = [
    ["DivulgaCandContas (TSE)", "https://divulgacandcontas.tse.jus.br/divulga/", "Bens declarados, propostas, doadores e gastos de campanha de cada candidato."],
    ...(C.links || []),
    [`SisCam da Câmara de ${C.nome}`, SIS, "Documentos originais: projetos, moções, requerimentos, sessões e votos."],
    ["Processos no TJSP (e-SAJ)", "https://esaj.tjsp.jus.br/cpopg/open.do", "Consulta pública de processos pelo nome da pessoa."],
    ["Cadastro de condenações por improbidade (CNJ)", "https://www.cnj.jus.br/improbidade_adm/consultar_requerido.php", "Condenações definitivas por improbidade administrativa."],
    ["Tribunal de Contas do Estado (TCE-SP)", "https://www.tce.sp.gov.br", "Pareceres sobre as contas da Prefeitura e da Câmara."],
  ];

  // Emendas e 2ª discussão do mesmo projeto ficam juntas:
  // "Emenda Nº 1/2026 ao Projeto de Lei Nº 4/2026 - Aditiva" e "Projeto de Lei Nº 4/2026 - Executivo" -> "Projeto de Lei Nº 4/2026".
  const semSufixo = (m) => m.replace(/ - [^-]+$/, "");
  const materiaBase = (m) => { const x = / ao (Projeto .+)$/.exec(m); return semSufixo(x ? x[1] : m); };

  function fichaVereador(v) {
    if (!v) return "";
    const pres = v.presenca, total = soma(v.proposituras);
    // Votos em matérias sensíveis (sem pareceres de comissão), agrupados por matéria; divididas primeiro.
    const sensiveis = D.votacoes.filter((x) => x.sens.length && !/^Parecer/.test(x.m) && ladoDe(x, v.chave));
    const grupos = {};
    sensiveis.forEach((x) => (grupos[materiaBase(x.m)] ||= []).push(x));
    const lista = Object.entries(grupos).map(([m, xs]) => ({ m: (xs.find((x) => semSufixo(x.m) === m) || { m }).m, xs: xs.sort((a, b) => a.d.localeCompare(b.d)), div: xs.some((x) => x.div), d: xs.reduce((a, x) => (x.d > a ? x.d : a), "") }))
      .sort((a, b) => b.div - a.div || b.d.localeCompare(a.d));
    const linhas = [
      ["Assiduidade", pres.pct == null ? "sem dados" : `${pct(pres.pct)} de presença (${pres.presente} sessões; ${pres.ausente} faltas)`],
      ["Fiscalização", `${fmt(v.pedido_temas["Fiscalização/transparência"] || 0)} requerimentos pedindo contratos, gastos ou documentos à Prefeitura`],
      ["Leis", `${v.pl_total} projetos de lei (${v.pl_categorias["Política pública/norma"] || 0} de política pública; ${v.pl_aprovados} aprovados)`],
      ["Homenagens", `${fmt(homenagens(v))} moções de aplauso, nomes de rua e datas (${pct(total ? Math.round((100 * homenagens(v)) / total) : 0)} do que propôs)`],
      ["Alinhamento", v.alinhamento_maioria == null ? "poucas votações divididas" : `votou com a maioria em ${pct(v.alinhamento_maioria)} das ${v.divididas_total} votações divididas; ${v.votos.contra || 0} votos contra`],
    ];
    const civil = v.nome_civil && norm(v.nome_civil) !== norm(v.nome) ? " · nome civil: " + esc(titulo(v.nome_civil)) : "";
    return `<div class="cartao" style="margin-top:12px">
      <div class="perfil-topo">${foto(v)}<div><h3 style="margin:0">${esc(nomeV(v))}</h3><div class="suave">${esc(v.partido || "partido não informado")}${civil}</div></div></div>
      <div class="tabela-wrap" style="margin-top:10px"><table><tbody>${linhas.map(([a, b]) => `<tr><th scope="row">${a}</th><td>${esc(b)}</td></tr>`).join("")}</tbody></table></div>
      <h3 style="margin-top:14px">Como votou em temas sensíveis (${lista.length} ${lista.length === 1 ? "matéria" : "matérias"})</h3>
      ${lista.length ? `<div class="grupos-sens">${lista.slice(0, 12).map((g) => `<div class="grupo-sens">
          <div><b>${esc(g.m)}</b> ${[...new Set(g.xs.flatMap((x) => x.sens))].map((t) => `<span class="etq etq-am">${esc(t)}</span>`).join("")}${g.div ? `<span class="etq etq-pr">dividida</span>` : ""}</div>
          <div class="suave voto-assunto">${esc(g.xs[0].a)}</div>
          <ul class="votos-lista">${g.xs.map((x) => `<li class="voto-linha">${etqVoto(ladoDe(x, v.chave))}<div>
            <a href="#votacao/${encodeURIComponent(x.id)}">${x.m === g.m ? esc(x.f || "votação") : esc(x.m) + (x.f ? " · " + esc(x.f) : "")}</a>
            <span class="item-meta"> · ${dataBR(x.d)} · resultado: ${esc(x.r || "—")}</span></div></li>`).join("")}</ul></div>`).join("")}</div>
        ${lista.length > 12 ? `<p class="suave">Mostrando as 12 matérias mais relevantes de ${lista.length}. <a href="#votacoes/vereador=${encodeURIComponent(v.chave)}">Ver todas as votações</a>.</p>` : ""}`
        : `<p class="suave">Nenhuma votação nominal com nomes registrados nesses temas.</p>`}
      <p class="acoes"><a class="botao botao-pr" href="${hrefPerfil(v)}">Perfil completo</a>
        ${ext("https://divulgacandcontas.tse.jus.br/divulga/", "Bens e doadores no TSE", "botao")}
        ${ext("https://esaj.tjsp.jus.br/cpopg/open.do", "Processos no TJSP", "botao")}</p>
      <p class="suave">Para processos, pesquise pelo nome civil completo. Ter um processo não significa condenação.</p>
    </div>`;
  }

  function guia(arg) {
    const emEx = D.vereadores.filter((v) => v.em_exercicio);
    const partidos = {};
    emEx.forEach((v) => (partidos[v.partido || "—"] ||= []).push(v));
    const linhasPartido = Object.entries(partidos).map(([p, vs]) => {
      const al = vs.filter((v) => v.alinhamento_maioria != null && v.divididas_total >= 10);
      return { p, vs, media: al.length ? Math.round(al.reduce((a, v) => a + v.alinhamento_maioria, 0) / al.length) : null, contra: vs.reduce((a, v) => a + (v.votos.contra || 0), 0) };
    }).sort((a, b) => b.vs.length - a.vs.length || a.p.localeCompare(b.p));
    const g = D.geral;
    const fiscal = emEx.reduce((a, v) => a + (v.pedido_temas["Fiscalização/transparência"] || 0), 0);
    const orc = D.votacoes.filter((x) => x.sens.includes("Orçamento") && /^Projeto/.test(x.m)).length;
    const hom = emEx.reduce((a, v) => a + homenagens(v), 0);

    app.innerHTML = `<h1>Guia do eleitor</h1>
      <p class="suave">Como avaliar um vereador antes de votar, com os dados reais da Câmara de ${esc(C.nome)}.</p>

      <h2>1. O que um vereador realmente faz</h2>
      <div class="duas">
        <div class="cartao"><h3>Faz parte do cargo</h3><ul>
          <li><b>Fiscalizar o prefeito e a Prefeitura:</b> acompanhar como o dinheiro público é gasto e cobrar obras, postos de saúde, escolas e transporte.</li>
          <li><b>Criar e alterar leis municipais:</b> uso do solo, plano diretor, transporte, tributos municipais (como o IPTU e o ISS) e zeladoria.</li>
          <li><b>Aprovar o orçamento:</b> votar a Lei Orçamentária Anual (LOA), a Lei de Diretrizes Orçamentárias (LDO) e o Plano Plurianual (PPA), que definem onde a Prefeitura investe.</li>
          <li><b>Investigar:</b> abrir uma Comissão Especial de Inquérito (CEI) para apurar um fato. Precisa da assinatura de um terço dos vereadores.</li>
        </ul></div>
        <div class="cartao"><h3>Não faz parte do cargo</h3><ul>
          <li>Construir hospital, asfaltar rua ou contratar médico. Isso é tarefa do prefeito (Poder Executivo). O vereador só pode <b>pedir</b>, por indicação ou requerimento.</li>
          <li>Mudar lei federal ou estadual.</li>
        </ul>
        <div class="aviso">Candidato a vereador que promete "fazer uma obra" está prometendo algo que depende do prefeito.</div></div>
      </div>
      <h3>Em ${esc(C.nome)}, desde ${dataBR(g.periodo[0])}</h3>
      ${kpis([["Requerimentos de fiscalização", fiscal, "pedidos de contratos, gastos e documentos"],
              ["Projetos de lei", g.por_tipo["Projeto de Lei"] || 0, "de vereadores e do prefeito"],
              ["Votações de orçamento", orc, "LOA, LDO e PPA, incluindo emendas e pareceres"],
              ["Homenagens", hom, "moções de aplauso, nomes de rua, datas"]])}

      <h2>2. O que pesquisar sobre o candidato</h2>
      <div class="cartao"><ul>
        <li><b>Histórico e ficha limpa:</b> trajetória pessoal e profissional; processos ou condenações por corrupção ou improbidade (links abaixo).</li>
        <li><b>Atuação anterior:</b> se já foi vereador, veja presença, como votou nos projetos importantes e como usou a verba do gabinete.</li>
        <li><b>Coerência das propostas:</b> se são viáveis, se cabem ao vereador e se tratam dos problemas reais do bairro e da cidade.</li>
        <li><b>Bandeiras:</b> que temas prioriza (transparência, educação, mobilidade, saúde, meio ambiente) e se a atuação confirma o discurso.</li>
      </ul></div>
      <h3>Ficha de pesquisa: escolha um vereador</h3>
      <div class="filtros"><label>Vereador em exercício<select id="f-ficha">${opcoes(opcoesVereadores(emEx), "Escolha…")}</select></label></div>
      <div id="ficha"></div>

      <h2>3. Voto proporcional: seu voto também vai para o partido</h2>
      <div class="cartao">
        <p>Na eleição para vereador, os votos de todos os candidatos de um partido ou federação são somados. Essa soma define quantas cadeiras o grupo ganha (o <b>quociente eleitoral</b>). Depois, as cadeiras vão para os mais votados do grupo.</p>
        <p><b>Exemplo simples:</b> uma cidade com 17 cadeiras e 85.000 votos válidos tem quociente de 5.000 votos (85.000 ÷ 17). Um partido que soma 15.000 votos fica com 3 cadeiras. Assim, votar em um candidato pode ajudar a eleger outro da mesma lista.</p>
        <p>Por isso, vale conhecer também a linha do partido. Veja como os partidos da Câmara atual se comportam:</p>
      </div>
      <div class="tabela-wrap" style="margin-top:10px"><table><thead><tr>
        <th>Partido</th><th class="num">Vereadores</th><th>Quem</th><th class="num">Votou com a maioria (média)</th><th class="num">Votos contra (soma)</th>
      </tr></thead><tbody>${linhasPartido.map((l) => `<tr><td><b>${esc(l.p)}</b></td><td class="num">${l.vs.length}</td>
        <td>${l.vs.map((v) => linkPerfil(v)).join(", ")}</td>
        <td class="num">${pct(l.media)}</td><td class="num">${fmt(l.contra)}</td></tr>`).join("")}</tbody></table></div>
      <p class="suave">Partido atual, segundo a Câmara. Vereadores podem ter trocado de partido depois da eleição.</p>

      <h2>4. Onde consultar informações oficiais</h2>
      <div class="grade grade-cards">${LINKS_OFICIAIS.map(([n, u, d]) => `<a class="cartao ver-card" href="${url(u)}" target="_blank" rel="noopener" aria-label="${esc(n)}: ${esc(d)} (abre em nova aba)"><div><div class="nome">${esc(n)} <span aria-hidden="true">↗</span></div><div class="mini">${esc(d)}</div></div></a>`).join("")}</div>
      <div class="aviso">Ainda não coletamos as verbas de gabinete nem os dados do TSE. Por enquanto, consulte esses números direto nos links acima.</div>`;

    const sel = app.querySelector("#f-ficha");
    const mostrar = () => {
      app.querySelector("#ficha").innerHTML = fichaVereador(porChave[sel.value]);
      history.replaceState(null, "", "#guia" + (sel.value ? "/" + encodeURIComponent(porChave[sel.value].slug) : ""));
    };
    sel.addEventListener("change", mostrar);
    const inicial = acharVereador(arg);  // #guia/<chave, slug ou nome>
    if (inicial) { sel.value = inicial.chave; mostrar(); }
  }

  // Resumo de cada legislatura e tabela dos vereadores das anteriores.
  function legislaturas() {
    const g = D.geral;
    const resumo = [{ titulo: `${periodoLeg(C.legislatura || { inicio: g.periodo[0] || "", fim: g.periodo[1] || "" })} (atual)`, ver: D.vereadores.length, sess: g.total_sessoes, vot: g.total_votacoes, div: g.votacoes_divididas, prop: g.total_proposituras, href: "#votacoes" },
      ...LEGS.map((l) => ({ titulo: `${periodoLeg(l)} (${l.nome})`, ver: l.vereadores.length, sess: l.total_sessoes, vot: l.total_votacoes, div: l.votacoes_divididas, prop: l.total_proposituras, href: `#votacoes/periodo=${l.ano}` }))];
    app.innerHTML = `<p><a href="#vereadores">← Vereadores</a></p><h1>Legislaturas</h1>
      <p class="suave">Cada legislatura dura quatro anos. Os rankings, a afinidade e os perfis do site usam só a atual${LEGS.length ? `; aqui ficam os números ${LEGS.length === 1 ? "da anterior" : `das ${LEGS.length} anteriores`}, com os mesmos critérios` : ""}. "Vereadores" inclui suplentes que assumiram.</p>
      <div class="grade grade-cards">${resumo.map((r) => `<div class="cartao"><h3>${esc(r.titulo)}</h3>
        <p class="leg-nums"><b>${fmt(r.ver)}</b> vereadores · <b>${fmt(r.sess)}</b> sessões · <b>${fmt(r.vot)}</b> votações · <b>${fmt(r.div)}</b> divididas · <b>${fmt(r.prop)}</b> proposituras</p>
        <a href="${r.href}">Ver votações</a></div>`).join("")}</div>
      ${LEGS.length ? `<div class="aviso">O SisCam não tem o mesmo nível de registro em todos os anos. ${LEGS.map((l) => `Em ${esc(periodoLeg(l))}, ${fmt(l.total_sessoes - l.sessoes_com_registro)} das ${fmt(l.total_sessoes)} sessões não têm chamada nem votos.`).join(" ")}${C.nota_registro ? " " + esc(C.nota_registro) : ""}</div>`
        : `<p class="vazio">As legislaturas anteriores da Câmara de ${esc(C.nome)} ainda não foram coletadas.</p>`}
      ${LEGS.map((l) => `<h2 id="leg-${l.ano}">${esc(periodoLeg(l))}</h2>
        <div class="tabela-wrap"><table><thead><tr><th>Vereador</th><th>Partido</th><th class="num">Presença</th><th class="num">Projetos de lei</th><th class="num">PL de política pública</th>
          <th class="num">Moções</th><th class="num">Requerimentos</th><th class="num">Votos contra</th><th class="num">Votou com a maioria</th></tr></thead>
        <tbody>${l.vereadores.map((v) => `<tr><td>${linkPerfil(v)}</td><td>${esc(v.partido || "—")}</td>
          <td class="num">${pct(v.presenca.pct)}</td><td class="num">${fmt(v.pl_total)}</td><td class="num">${fmt(v.pl_pp)}</td>
          <td class="num">${fmt(v.mocoes)}</td><td class="num">${fmt(v.requerimentos)}</td><td class="num">${fmt(v.votos.contra || 0)}</td>
          <td class="num">${pct(v.alinhamento_maioria)} <span class="suave">de ${fmt(v.divididas_total)}</span></td></tr>`).join("")}</tbody></table></div>
        <p class="suave">Partido na posse, segundo a página da legislatura no SisCam; vazio para suplentes que o SisCam não lista. Ordem: quem esteve em mais sessões primeiro.</p>`).join("")}`;
  }

  function sobre() {
    app.innerHTML = `<h1>Como funciona</h1>
      <div class="cartao">
        <h3>De onde vêm os dados</h3>
        <p>Do sistema oficial de consulta da ${esc(C.camara)} (SisCam, ${ext(SIS, SIS.replace(/^https?:\/\//, ""))}): exportação de proposituras, lista de vereadores e páginas de cada sessão, com frequência e votos nominais.</p>
        <h3>Quem coleta</h3>
        <p>Agentes automáticos (scripts) baixam os dados, um agente analista calcula os indicadores e gera este site. Os casos documentados passam por um agente verificador e por revisão humana.</p>
        <h3>Como ler os números</h3>
        <ul>
          <li><b>Presença</b>: sessões ordinárias e extraordinárias em que o vereador aparece como presente em alguma chamada.</li>
          <li><b>PL de política pública</b>: projetos de lei (PL) que não são nome de rua, data comemorativa, honraria ou utilidade pública. A classificação é automática, por palavras da ementa, e pode errar.</li>
          <li><b>Votou com a maioria</b>: nas votações divididas, quantas vezes o vereador ficou do lado que venceu.</li>
          <li><b>Temas sensíveis</b>: impostos e taxas, comissões de investigação (CEI, Comissão Especial de Inquérito, e CPI, Comissão Parlamentar de Inquérito), salários de agentes políticos, empréstimos, patrimônio público e orçamento.</li>
        </ul>
        ${LEGS.length ? `<h3>Legislaturas anteriores</h3>
        <p>Os números de ${esc(LEGS.map(periodoLeg).join(" e "))} ficam à parte, na página <a href="#legislaturas">Legislaturas</a>, e no perfil de quem atuou nelas. A mesma pessoa é ligada entre legislaturas pelo ID do SisCam, mesmo quando o nome parlamentar mudou.</p>` : ""}
        <div class="aviso">Número alto ou baixo não prova boa ou má conduta. Muitas moções de aplauso não são ilegais; poucas presenças podem ter justificativa (licença, saúde). Use os dados como ponto de partida e confira sempre o documento oficial pelo link.</div>
        <p class="suave">Última atualização dos dados: ${esc(quando(D.geral.gerado_em))} (horário de Brasília).</p>
      </div>`;
  }

  // ------------------------------------------------------------ a última sessão
  // D.sessoes: [id, título, data, presentes, ausentes, nº de votações]. Sessão solene sem chamada fica de fora.
  const SES = { id: 0, titulo: 1, data: 2, pres: 3, aus: 4, nvot: 5 };
  const sessoesOrdem = () => (D.sessoes || []).filter((s) => s[SES.pres] + s[SES.aus] > 0)
    .sort((a, b) => b[SES.data].localeCompare(a[SES.data]) || b[SES.id] - a[SES.id]);
  const diaSemana = (iso) => { const d = new Date(iso + "T12:00:00"); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { weekday: "long" }); };

  // Nomes de presentes e ausentes saem das votações nominais listadas da sessão (quando há alguma).
  function presencaDe(vs) {
    const pres = new Set(), aus = new Set();
    vs.forEach((x) => Object.entries(x.v || {}).forEach(([o, ks]) => ks.forEach((k) => (o === "ausente" ? aus : pres).add(k))));
    pres.forEach((k) => aus.delete(k)); // ausente numa votação mas presente em outra: estava na sessão
    return pres.size ? { pres: [...pres], aus: [...aus] } : null;
  }

  function resumoSessaoCurto() {
    const s = sessoesOrdem()[0];
    if (!s) return `<p class="vazio">Nenhuma sessão registrada ainda.</p>`;
    const vs = D.votacoes.filter((x) => x.s === s[SES.id]), div = vs.filter((x) => x.div).length;
    return `<a class="cartao sessao-curta" href="#semana">
      <div>${rotulo(`${diaSemana(s[SES.data])}, ${dataBR(s[SES.data])}`)}<h3>${esc(s[SES.titulo])}</h3>
        <p class="suave">${fmt(s[SES.pres])} presentes · ${fmt(s[SES.aus])} ${s[SES.aus] === 1 ? "ausente" : "ausentes"} · ${fmt(s[SES.nvot])} votações · ${div ? `${div} ${div === 1 ? "dividida" : "divididas"}` : "nenhuma dividida"}</p></div>
      <span class="caso-ler">Ver o resumo da sessão <span aria-hidden="true">→</span></span></a>`;
  }

  function semana(arg) {
    const todas = sessoesOrdem();
    const s = (arg && todas.find((x) => String(x[SES.id]) === arg)) || todas[0];
    if (!s) { app.innerHTML = `<h1>A última sessão</h1><p class="vazio">Nenhuma sessão registrada ainda.</p>`; return; }
    const ehUltima = s === todas[0];
    const vs = D.votacoes.filter((x) => x.s === s[SES.id]);
    const div = vs.filter((x) => x.div), outras = vs.filter((x) => !x.div);
    const pres = presencaDe(vs);
    const porTipo = {};
    vs.forEach((x) => { const t = x.m.split(" Nº")[0].split(" N°")[0]; porTipo[t] = (porTipo[t] || 0) + 1; });
    const ultimaDiv = ehUltima && !div.length ? todas.find((x) => D.votacoes.some((v) => v.s === x[SES.id] && v.div)) : null;
    const i = todas.indexOf(s);
    app.innerHTML = `<header class="cab-pagina">${rotulo(ehUltima ? "A última sessão" : "Sessão anterior")}
        <h1>${esc(s[SES.titulo])}</h1>
        <p class="lede">${esc(diaSemana(s[SES.data]))}, ${dataBR(s[SES.data])}. Resumo automático a partir do registro oficial da sessão no SisCam. ${ext(urlSessao(s[SES.id]), "Abrir a sessão no SisCam")}</p></header>
      ${contadores([[s[SES.pres], s[SES.pres] === 1 ? "presente" : "presentes", "na chamada da sessão"],
                    [s[SES.aus], s[SES.aus] === 1 ? "ausente" : "ausentes", "a Câmara não informa se a falta foi justificada"],
                    [s[SES.nvot], "votações", "inclui requerimentos, moções e atas"],
                    [div.length, div.length === 1 ? "votação dividida" : "votações divididas", "com votos a favor e contra"]])}
      <h2>Quem estava</h2>
      ${pres ? `<div class="sessao-pres">
          <div class="vg vg-favor"><h3><span class="vg-marca" aria-hidden="true"></span>Presentes <span class="vg-n">${pres.pres.length}</span></h3><ul class="pessoas-grade">${pres.pres.sort((a, b) => nomeDe(a).localeCompare(nomeDe(b))).map((k) => `<li>${pessoaMini(k)}</li>`).join("")}</ul></div>
          ${pres.aus.length ? `<div class="vg"><h3><span class="vg-marca" aria-hidden="true"></span>Ausentes nas votações <span class="vg-n">${pres.aus.length}</span></h3><ul class="pessoas-grade">${pres.aus.map((k) => `<li>${pessoaMini(k)}</li>`).join("")}</ul></div>` : ""}
        </div><p class="suave">Nomes tirados das votações nominais listadas nesta sessão.</p>`
        : `<p class="aviso">A chamada registrou ${fmt(s[SES.pres])} presentes e ${fmt(s[SES.aus])} ${s[SES.aus] === 1 ? "ausente" : "ausentes"}, mas o site ainda não guarda os nomes da chamada de cada sessão, e nesta sessão nenhuma votação nominal foi listada (só votações unânimes de rotina). Os nomes estão na ${ext(urlSessao(s[SES.id]), "página da sessão no SisCam")}.</p>`}
      <h2>Votações divididas</h2>
      ${div.length ? emGradeVot(div.map((x) => cartaoVotacao(x)).join(""))
        : `<p class="vazio cartao">Nenhuma votação dividida nesta sessão: o que foi votado teve resultado unânime ou sem voto nominal.${ultimaDiv ? ` A sessão mais recente com votação dividida foi a <a href="#semana/${ultimaDiv[SES.id]}">${esc(ultimaDiv[SES.titulo])}</a> (${dataBR(ultimaDiv[SES.data])}).` : ""}</p>`}
      <h2>O que mais foi votado</h2>
      <p class="suave">${vs.length ? `Das ${fmt(s[SES.nvot])} votações da sessão, o site lista ${fmt(vs.length)}: as divididas, as negadas, as de temas sensíveis e as que não são rotina.` : `As ${fmt(s[SES.nvot])} votações desta sessão foram de rotina e aprovadas por unanimidade, por isso nenhuma aparece em separado no site.`} Requerimentos, moções, indicações e atas aprovados por unanimidade entram só no total.</p>
      ${Object.keys(porTipo).length ? `<div class="cartao">${barras(porTipo)}</div>` : ""}
      ${outras.length ? `<div class="lista-cartao" style="margin-top:14px"><ul class="votos-lista">${outras.map((x) => `<li class="voto-linha">${etqResultado(x.r)}<div><a href="#votacao/${encodeURIComponent(x.id)}">${esc(x.m)}</a><span class="item-meta">${x.f ? " · " + esc(x.f) : ""}</span><div class="suave voto-assunto">${esc(x.a)}</div></div></li>`).join("")}</ul></div>` : ""}
      <h2>Sessões anteriores</h2>
      <ol class="sessoes-lista">${todas.slice(Math.max(0, i - 2), i + 7).filter((x) => x !== s).map((x) => `<li><a href="#semana/${x[SES.id]}">
        <span class="lt-data">${dataBR(x[SES.data])}</span><span class="ses-t">${esc(x[SES.titulo])}</span>
        <span class="ses-n">${fmt(x[SES.pres])} presentes · ${fmt(x[SES.nvot])} votações</span></a></li>`).join("")}</ol>`;
  }

  // ------------------------------------------------------------ quiz "Com qual vereador você vota igual?"
  // As perguntas saem sozinhas das votações divididas: casos e temas sensíveis primeiro, uma por matéria
  // e sem repetir votações em que todos votaram do mesmo jeito (muitos requerimentos têm o mesmo placar).
  const CHAVE_QUIZ = `olho-${C.slug}-quiz`;
  let quizResp = null;
  function respostasQuiz() {
    if (quizResp) return quizResp;
    try { quizResp = JSON.parse(localStorage.getItem(CHAVE_QUIZ) || "{}") || {}; } catch (e) { quizResp = {}; }
    if (typeof quizResp !== "object" || Array.isArray(quizResp)) quizResp = {};
    return quizResp;
  }
  function salvarQuiz() { try { localStorage.setItem(CHAVE_QUIZ, JSON.stringify(quizResp || {})); } catch (e) { /* fica só na memória */ } }

  let perguntasCache = null;
  function perguntasQuiz() {
    if (perguntasCache) return perguntasCache;
    const casoDe = {};
    D.casos.forEach((c) => (c.votacoes || []).forEach((x) => { casoDe[x.id] = c; }));
    const OPACO = /Anexo|Lei Municipal n|Lei Complementar n|Regimento Interno|artigo|reitera/i;
    const pontos = D.votacoes.filter((x) => x.div && x.v && (x.v.favor || []).length && (x.v.contra || []).length && !/^(Parecer|Veto)/.test(x.m))
      .map((x) => {
        const f = x.v.favor.length, c = x.v.contra.length, caso = casoDe[x.id];
        const p = (caso ? 6 : 0) + (x.sens.length ? 3 : 0) + (/^Projeto/.test(x.m) ? 2 : 0) + (3 * Math.min(f, c)) / Math.max(f, c)
          - (OPACO.test(x.a) && !caso ? 3 : 0) - (/^Emenda/.test(x.m) ? 2 : 0) - (Math.min(f, c) < 2 ? 4 : 0);
        return [p, x, caso];
      }).sort((a, b) => b[0] - a[0] || b[1].d.localeCompare(a[1].d));
    const mats = new Set(), assin = new Set(), sel = [];
    for (const [, x, caso] of pontos) {
      const mb = materiaBase(x.m), sig = [...x.v.favor].sort().join("|");
      if (mats.has(mb) || assin.has(sig)) continue;
      mats.add(mb); assin.add(sig); sel.push({ v: x, caso });
      if (sel.length === 12) break;
    }
    perguntasCache = sel.sort((a, b) => b.v.d.localeCompare(a.v.d));
    return perguntasCache;
  }

  // Assunto em linguagem mais simples: tira a fórmula regimental e as palavras em caixa alta.
  function textoSimples(q) {
    if (q.caso && q.caso.em_jogo) return q.caso.em_jogo;
    let t = String(q.v.a || "").replace(/\s+/g, " ").trim()
      .replace(/^.*?digne-se (?:de )?aprovar e encaminhar a presente /i, "")
      .replace(/^REQUEIRO À MESA,.*?digne-se (?:de )?oficiar (?:a|ao|o) /i, "Pedir ao ")
      .replace(/^Requer(?:em)? do /i, "Pedir ao ")
      .replace(/(?:Exmo\.|Excelentíssimo) (?:Sr\.|Senhor) /gi, "").replace(/Senhor Prefeito/g, "prefeito")
      .split(`Prefeito Municipal de ${C.nome}`).join("prefeito").replace(/o Poder Executivo(?: Municipal)?/g, "a Prefeitura")
      .replace(/,? e dá outras providências\.?/gi, ".").replace(/,? conforme especifica\.?/gi, ".");
    // Sequências de três ou mais palavras em CAIXA ALTA viram minúsculas ("MOÇÃO DE APELO" -> "moção de apelo");
    // nomes curtos como "DESENVOLVE SP" ficam como estão.
    const ps = t.split(" "), alta = (w) => /^[A-ZÀ-Ý]{2,}[,.:;]?$/.test(w) || /^(E|À|A|O)$/.test(w);
    for (let i = 0; i < ps.length; i++) {
      let j = i;
      while (j < ps.length && alta(ps[j])) j++;
      if (j - i >= 3) for (let k = i; k < j; k++) ps[k] = ps[k].toLocaleLowerCase("pt-BR");
      i = Math.max(i, j);
    }
    t = ps.join(" ").replace(/\.\./g, ".");
    t = t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
    if (t.length > 240) t = t.slice(0, 240).replace(/\s+\S*$/, "") + "…";
    return t;
  }
  function tipoPergunta(m) {
    const exe = / - Executivo/.test(m) ? " enviado pelo prefeito" : "";
    if (/^Projeto de Lei Complementar/.test(m)) return "Projeto de lei complementar (PLC)" + exe;
    if (/^Projeto de Lei/.test(m)) return "Projeto de lei (PL)" + exe;
    if (/^Projeto de Resolução/.test(m)) return "Projeto de resolução: regra interna da Câmara";
    if (/^Requerimento/.test(m)) return "Requerimento: pedido formal de informação ou providência";
    if (/^Moção/.test(m)) return "Moção: manifestação da Câmara, não cria lei";
    if (/^Emenda/.test(m)) return "Emenda: mudança num projeto";
    return m.split(" Nº")[0];
  }
  const AVISO_QUIZ = `<p class="aviso">O quiz compara votos registrados, não indica em quem votar. Cada votação tem contexto (debates, emendas, pareceres) que um resumo não mostra: abra a votação para ler o documento oficial.</p>`;

  function quiz(arg, params) {
    const qs = perguntasQuiz(), resp = respostasQuiz();
    if (qs.length < 3) { app.innerHTML = `<h1>Com qual vereador você vota igual?</h1><p class="vazio">Ainda não há votações divididas suficientes para montar o quiz.</p>`; return; }
    // #quiz/r=SNP…: respostas pela ordem das perguntas (S = a favor, N = contra, P = pular).
    const codigo = params.get("r");
    if (codigo) {
      quizResp = {};
      [...codigo.toUpperCase()].slice(0, qs.length).forEach((c, i) => { const o = { S: "favor", N: "contra", P: "pular" }[c]; if (o) quizResp[qs[i].v.id] = o; });
      salvarQuiz();
      history.replaceState(null, "", "#quiz/resultado");
      return resultadoQuiz(qs, quizResp);
    }
    if (arg === "resultado") return resultadoQuiz(qs, resp);
    const i = qs.findIndex((q) => !resp[q.v.id]);
    if (i < 0) return resultadoQuiz(qs, resp);
    perguntaQuiz(qs, resp, i);
  }

  function perguntaQuiz(qs, resp, i, anterior) {
    const q = qs[i], respondidas = qs.filter((x) => resp[x.v.id] === "favor" || resp[x.v.id] === "contra").length;
    const temas = [...new Set([...(q.caso && q.caso.tema ? [q.caso.tema] : []), ...q.v.sens])];
    app.innerHTML = `<header class="cab-pagina">${rotulo("Quiz")}
        <h1>Com qual vereador você vota igual?</h1>
        <p class="lede">Responda ${qs.length} votações reais e divididas da Câmara de ${esc(C.nome)}. No fim, veja quantas vezes cada vereador votou como você.</p></header>
      <section class="quiz-cartao" aria-labelledby="q-texto">
        <div class="quiz-prog"><span class="rotulo">Pergunta ${i + 1} de ${qs.length}</span>
          <span class="quiz-trilho" aria-hidden="true"><span style="width:${(100 * i) / qs.length}%"></span></span></div>
        ${anterior ? `<p class="quiz-antes" role="status">${anterior}</p>` : ""}
        <div class="quiz-meta">${temas.map((t) => `<span class="etq etq-am">${esc(t)}</span>`).join("")}<span class="item-meta">${esc(tipoPergunta(q.v.m))} · votado em ${dataBR(q.v.d)}</span></div>
        <p class="quiz-texto" id="q-texto">${esc(textoSimples(q))}</p>
        <p class="quiz-perg">Se você fosse vereador, votaria a favor?</p>
        <div class="quiz-botoes">
          <button type="button" class="botao-pr quiz-b" data-r="favor">Sim, a favor</button>
          <button type="button" class="quiz-b" data-r="contra">Não, contra</button>
          <button type="button" class="quiz-b quiz-pular" data-r="pular">Pular</button>
        </div>
        ${i > 0 || respondidas >= 3 ? `<div class="quiz-pe">
          ${i > 0 ? `<button type="button" class="mini-btn" id="q-voltar">← Pergunta anterior</button>` : "<span></span>"}
          ${respondidas >= 3 ? `<a class="mini-btn botao" href="#quiz/resultado">Ver resultado agora</a>` : ""}
        </div>` : ""}
      </section>
      ${AVISO_QUIZ}`;
    app.querySelectorAll(".quiz-b").forEach((b) => b.addEventListener("click", () => {
      resp[q.v.id] = b.dataset.r; salvarQuiz();
      const n = q.v.n || {};
      const fb = b.dataset.r === "pular" ? "Pergunta pulada." :
        `Você votaria ${b.dataset.r === "favor" ? "a favor" : "contra"}. Na Câmara: ${esc(resultadoTxt(q.v.r).toLowerCase())}, com ${n.favor || 0} a favor e ${n.contra || 0} contra. <a href="#votacao/${encodeURIComponent(q.v.id)}">Ver quem votou</a>`;
      const prox = qs.findIndex((x, k) => k > i && !resp[x.v.id]);
      const qualquer = prox >= 0 ? prox : qs.findIndex((x) => !resp[x.v.id]);
      if (qualquer < 0) { history.replaceState(null, "", "#quiz/resultado"); resultadoQuiz(qs, resp); aoDesenhar("quiz", true); return; }
      perguntaQuiz(qs, resp, qualquer, fb);
      app.querySelector(".quiz-b").focus();
    }));
    const voltar = app.querySelector("#q-voltar");
    if (voltar) voltar.addEventListener("click", () => { delete resp[qs[i - 1].v.id]; salvarQuiz(); perguntaQuiz(qs, resp, i - 1); app.querySelector(".quiz-b").focus(); });
  }

  function resultadoQuiz(qs, resp) {
    const validas = qs.filter((q) => resp[q.v.id] === "favor" || resp[q.v.id] === "contra");
    const recomeco = `<button type="button" id="q-refazer">Refazer o quiz</button>`;
    if (validas.length < 3) {
      app.innerHTML = `<header class="cab-pagina">${rotulo("Quiz")}<h1>Com qual vereador você vota igual?</h1>
        <p class="lede">Responda pelo menos 3 perguntas com Sim ou Não para ver o resultado.</p></header>
        <p class="acoes"><a class="botao botao-pr" href="#quiz">Continuar o quiz</a> ${recomeco}</p>`;
    } else {
      const linhas = D.vereadores.filter((v) => v.em_exercicio).map((v) => {
        let iguais = 0, comp = 0;
        validas.forEach((q) => { const l = ladoDe(q.v, v.chave); if (l === "favor" || l === "contra") { comp++; if (l === resp[q.v.id]) iguais++; } });
        return { v, iguais, comp, p: comp >= 3 ? (100 * iguais) / comp : null };
      }).sort((a, b) => (b.p ?? -1) - (a.p ?? -1) || b.comp - a.comp || nomeV(a.v).localeCompare(nomeV(b.v)));
      const comNota = linhas.filter((l) => l.p != null), semNota = linhas.filter((l) => l.p == null);
      const topo = comNota.slice(0, 3);
      const texto = `Fiz o quiz do ${SITE}: em ${validas.length} votações reais, votei igual a ${topo.map((l) => `${nomeV(l.v)} (${pct(Math.round(l.p))})`).join(", ")}. O quiz compara votos registrados, não indica em quem votar. Faça o seu:`;
      app.innerHTML = `<header class="cab-pagina">${rotulo("Quiz · resultado")}
          <h1>Com quem você votou igual</h1>
          <p class="lede">Você respondeu ${validas.length} de ${qs.length} votações com Sim ou Não. O percentual conta só as votações em que o vereador votou a favor ou contra.</p></header>
        ${AVISO_QUIZ}
        <ol class="quiz-rank">${comNota.map((l, k) => {
          const outro = (comNota[0].v === l.v ? comNota[1] : comNota[0]) || {};
          return `<li class="quiz-linha">
            <span class="pos">${k + 1}</span>
            ${pessoaMini(l.v.chave, esc(l.v.partido || ""))}
            <span class="quiz-barra"><span class="barra-trilho"><span class="barra-cheia am" style="width:${l.p}%"></span></span>
              <span class="quiz-pct"><b>${pct(Math.round(l.p))}</b> <span class="suave">igual em ${l.iguais} de ${l.comp}</span></span></span>
            <span class="quiz-links"><a href="${hrefPerfil(l.v)}" aria-label="Perfil de ${esc(nomeV(l.v))}">Perfil</a>
              ${outro.v ? `<a href="#comparar/${encodeURIComponent(l.v.chave + "|" + outro.v.chave)}" aria-label="Comparar ${esc(nomeV(l.v))} com ${esc(nomeV(outro.v))}">Comparar</a>` : ""}</span></li>`; }).join("")}</ol>
        ${semNota.length ? `<p class="suave">Com menos de 3 votações em comum com as suas respostas: ${semNota.map((l) => linkPerfil(l.v)).join(", ")}.</p>` : ""}
        <section class="cartao caso-partilha bloco-plano"><h2>Compartilhe</h2><p class="suave">A mensagem leva os três primeiros e o link do quiz. Suas respostas ficam só neste aparelho.</p>
          ${compartilhar(texto, `${PAGINA}#quiz`)}<p class="acoes">${recomeco}</p></section>
        <h2>Suas respostas e o resultado na Câmara</h2>
        <div class="lista-cartao"><ul class="votos-lista">${qs.map((q) => `<li class="voto-linha">
          ${resp[q.v.id] && resp[q.v.id] !== "pular" ? etqVoto(resp[q.v.id]) : `<span class="etq etq-voto">pulou</span>`}
          <div><a href="#votacao/${encodeURIComponent(q.v.id)}">${esc(q.v.m)}</a>
            <span class="item-meta"> · ${dataBR(q.v.d)} · na Câmara: ${esc(resultadoTxt(q.v.r).toLowerCase())}, ${q.v.n.favor || 0} a ${q.v.n.contra || 0}</span>
            <div class="suave voto-assunto">${esc(textoSimples(q))}</div></div></li>`).join("")}</ul></div>`;
      ligarCopiar(app);
    }
    app.querySelector("#q-refazer").addEventListener("click", () => { quizResp = {}; salvarQuiz(); if (location.hash === "#quiz") rota(); else location.hash = "#quiz"; });
  }

  // ------------------------------------------------------------ temas sensíveis
  // `sens`: nome do tema nas votações (v.sens); `casos`: valores de caso.tema que entram no tema.
  const TEMAS = [
    { slug: "impostos", nome: "Impostos e taxas", sens: "Impostos e taxas", casos: ["Impostos e taxas"],
      frase: "Criação ou mudança de impostos, taxas e tarifas cobrados pela Prefeitura, como IPTU, ISS (Imposto Sobre Serviços) e taxa de lixo." },
    { slug: "investigacao", nome: "Investigação do Executivo", sens: "Investigação/fiscalização do Executivo", casos: ["Investigação do Executivo"],
      frase: "Pedidos para investigar ou fiscalizar a Prefeitura, como a Comissão Especial de Inquérito (CEI) e a convocação de secretários." },
    { slug: "salarios", nome: "Salários e benefícios", sens: "Salários e benefícios de agentes políticos", casos: [],
      frase: "Salários e benefícios de quem ocupa cargo político: vereadores, prefeito, vice-prefeito e secretários." },
    { slug: "emprestimos", nome: "Empréstimos", sens: "Empréstimos e créditos", casos: [],
      frase: "Autorizações para a Prefeitura pegar dinheiro emprestado ou abrir crédito extra no orçamento." },
    { slug: "patrimonio", nome: "Patrimônio público", sens: "Patrimônio público", casos: [],
      frase: "Venda, doação, concessão ou uso de bens públicos, como terrenos, prédios e serviços entregues a empresas." },
    { slug: "orcamento", nome: "Orçamento", sens: "Orçamento", casos: [],
      frase: "As leis que dizem quanto a Prefeitura vai arrecadar e onde vai gastar: LOA (anual), LDO (diretrizes) e PPA (plano de quatro anos)." },
  ];
  const votacoesDoTema = (t) => D.votacoes.filter((x) => x.sens.includes(t.sens)).sort((a, b) => b.d.localeCompare(a.d));
  const casosDoTema = (t) => casosOrdem.filter((c) => t.casos.includes(c.tema) || (c.votacoes || []).some((x) => (x.sens || []).includes(t.sens)));

  function temas() {
    app.innerHTML = `<header class="cab-pagina">${rotulo("Temas sensíveis")}
        <h1>Temas</h1>
        <p class="lede">Os assuntos que mais pesam no bolso e no controle da Prefeitura. Em cada tema: o que é, as votações, os casos e quantas vezes cada vereador votou a favor ou contra.</p></header>
      <div class="grade-explore grade-temas">${TEMAS.map((t, i) => {
        const vs = votacoesDoTema(t), div = vs.filter((x) => x.div).length, cs = casosDoTema(t).length;
        return `<a class="explore tema-card tema-c${i % 5}" href="#tema/${t.slug}">${rotulo("Tema")}
          <span class="explore-t">${esc(t.nome)}</span><span class="explore-d">${esc(t.frase)}</span>
          <span class="tema-nums"><span><b>${fmt(vs.length)}</b> votações</span><span><b>${fmt(div)}</b> ${div === 1 ? "dividida" : "divididas"}</span>${cs ? `<span><b>${cs}</b> ${cs === 1 ? "caso" : "casos"}</span>` : ""}</span></a>`;
      }).join("")}</div>
      <p class="aviso">Os temas são marcados automaticamente por palavras do assunto de cada votação e podem errar. Valem só para a legislatura atual (desde ${dataBR(D.geral.periodo[0])}).</p>`;
  }

  function tema(slug) {
    const t = TEMAS.find((x) => x.slug === slug);
    if (!t) { app.innerHTML = `<p class="voltar"><a href="#temas">← Temas</a></p><h1>Tema não encontrado</h1><p class="vazio">Escolha um tema na <a href="#temas">lista de temas</a>.</p>`; return; }
    const vs = votacoesDoTema(t), div = vs.filter((x) => x.div), cs = casosDoTema(t);
    const nominais = vs.filter((x) => x.v && Object.keys(x.v).length);
    const aprov = vs.filter((x) => aprovou(x.r)).length;
    app.innerHTML = `<p class="voltar"><a href="#temas">← Temas</a></p>
      <header class="cab-pagina">${rotulo("Tema sensível")}<h1>${esc(t.nome)}</h1><p class="lede">${esc(t.frase)}</p></header>
      ${contadores([[vs.length, "votações", "listadas neste tema"], [div.length, div.length === 1 ? "dividida" : "divididas", "com votos a favor e contra"],
                    [aprov, aprov === 1 ? "aprovada" : "aprovadas", "incluindo pareceres e emendas"], [cs.length, cs.length === 1 ? "caso" : "casos", "documentados com fontes"]])}
      ${cs.length ? `<h2>Casos deste tema</h2><div class="grade-casos">${cs.map(cartaoCaso).join("")}</div>` : ""}
      <h2 id="placar">Placar por vereador</h2>
      <p class="suave">Quantas vezes cada vereador em exercício votou a favor ou contra nas votações nominais deste tema. Conta cada votação separadamente (1ª e 2ª discussão, emendas e pareceres).</p>
      <div class="chips" role="group" aria-label="Quais votações contar">${chip("conta", "todas", "Todas as nominais")}${chip("conta", "div", "Só as divididas")}</div>
      <div id="placar-lista"></div>
      <h2>Votações divididas</h2>
      <div id="tema-div"></div>
      <p><a class="botao" href="#votacoes/${new URLSearchParams({ tema: t.sens, todas: "1" })}">Ver todas as ${fmt(vs.length)} votações deste tema</a></p>
      <h2>Outros temas</h2>
      <div class="chips">${TEMAS.filter((x) => x !== t).map((x) => `<a class="chip" href="#tema/${x.slug}">${esc(x.nome)}</a>`).join("")}</div>`;
    const alvo = app.querySelector("#placar-lista");
    function placar(modo) {
      app.querySelectorAll('[data-f="conta"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === modo)));
      const base = modo === "div" ? nominais.filter((x) => x.div) : nominais;
      const linhas = D.vereadores.filter((v) => v.em_exercicio).map((v) => {
        const n = {};
        base.forEach((x) => { const o = ladoDe(x, v.chave); if (o) n[o] = (n[o] || 0) + 1; });
        return { v, n, tot: soma(n) };
      }).sort((a, b) => nomeV(a.v).localeCompare(nomeV(b.v)));
      alvo.innerHTML = base.length ? `<ul class="placar-ver">${linhas.map((l) => `<li>${pessoaMini(l.v.chave, esc(l.v.partido || ""))}
          ${l.tot ? barraPlacar(l.n) : `<p class="suave">sem voto nominal registrado</p>`}</li>`).join("")}</ul>`
        : `<p class="vazio">Nenhuma votação nominal com nomes registrados neste tema.</p>`;
    }
    app.querySelectorAll('[data-f="conta"]').forEach((b) => b.addEventListener("click", () => placar(b.dataset.v)));
    placar("todas");
    const alvoDiv = app.querySelector("#tema-div");
    if (div.length) paginar(div, 1, (x) => cartaoVotacao(x), alvoDiv, emGradeVot, 8);
    else alvoDiv.innerHTML = `<p class="vazio cartao">Nenhuma votação dividida neste tema na legislatura atual.</p>`;
  }

  // ------------------------------------------------------------ alianças: quem vota com quem
  // Ordena os vereadores por agrupamento hierárquico (média das distâncias, distância = 100 − afinidade),
  // para que quem vota junto fique lado a lado na matriz. Só usa D.afinidade, que já vem calculada.
  function ordemAfinidade(vs) {
    const d = (a, b) => { const x = afinidadePar(a, b); return x == null ? null : 100 - x; };
    const dist = (g1, g2) => { let s = 0, n = 0; g1.forEach((a) => g2.forEach((b) => { const x = d(a, b); if (x != null) { s += x; n++; } })); return n ? s / n : 100; };
    let grupos = vs.map((v) => [v]), blocos = null;
    while (grupos.length > 1) {
      let mi = 0, mj = 1, md = Infinity;
      for (let i = 0; i < grupos.length; i++) for (let j = i + 1; j < grupos.length; j++) {
        const x = dist(grupos[i], grupos[j]);
        if (x < md) { md = x; mi = i; mj = j; }
      }
      if (grupos.length === 2) blocos = [grupos[0], grupos[1]];
      // Junta virando as pontas para que os dois mais parecidos fiquem encostados.
      let a = grupos[mi], b = grupos[mj];
      const opcoes = [[a, b], [[...a].reverse(), b], [a, [...b].reverse()], [[...a].reverse(), [...b].reverse()]];
      const ponta = ([x, y]) => d(x[x.length - 1], y[0]) ?? 100;
      [a, b] = opcoes.sort((p, q) => ponta(p) - ponta(q))[0];
      grupos = grupos.filter((_, k) => k !== mi && k !== mj).concat([[...a, ...b]]);
    }
    return { ordem: grupos[0] || [], blocos };
  }
  const mediaDentro = (g) => { let s = 0, n = 0; g.forEach((a, i) => g.slice(i + 1).forEach((b) => { const x = afinidadePar(a, b); if (x != null) { s += x; n++; } })); return n ? s / n : null; };

  function aliancas() {
    // Quem votou em poucas divididas (ex.: quem preside e quase sempre "não vota") daria percentuais enganosos.
    const MIN_DIV = 10;
    const emEx = D.vereadores.filter((v) => v.em_exercicio);
    const vs = emEx.filter((v) => v.divididas_total >= MIN_DIV && afinidadesDe(v).length);
    const fora = emEx.filter((v) => !vs.includes(v));
    const { ordem, blocos } = ordemAfinidade(vs);
    const valores = Object.entries(D.afinidade).filter(([k]) => k.split("|").every((c) => vs.includes(porChave[c]))).map(([, p]) => p);
    const min = Math.floor(Math.min(...valores)), max = Math.ceil(Math.max(...valores));
    const nivel = (p) => (max > min ? (p - min) / (max - min) : 1);
    const pares = [];
    ordem.forEach((a, i) => ordem.slice(i + 1).forEach((b) => { const p = afinidadePar(a, b); if (p != null) pares.push([a, b, p]); }));
    pares.sort((x, y) => y[2] - x[2]);
    const linhaPar = ([a, b, p]) => `<li><span class="par-fotos">${foto(a)}${foto(b)}</span><span class="par-nomes">${linkPerfil(a)} e ${linkPerfil(b)}</span>
      <span class="par-p">${pct(p)}</span><a class="par-comp" href="#comparar/${encodeURIComponent(a.chave + "|" + b.chave)}" aria-label="Comparar ${esc(nomeV(a))} e ${esc(nomeV(b))}">Comparar</a></li>`;
    const bons = blocos && blocos.every((g) => g.length >= 3);
    app.innerHTML = `<header class="cab-pagina">${rotulo("Alianças")}
        <h1>Quem vota com quem</h1>
        <p class="lede">Cada quadrado mostra em quantas votações divididas dois vereadores votaram do mesmo lado. Quanto mais escuro, mais votam igual. A ordem junta quem costuma votar junto.</p></header>
      <p class="suave">"Votação dividida" é a que teve votos a favor e contra. Só entram pares com pelo menos 3 votações divididas em comum. Toque ou passe o mouse num quadrado para ver o par.</p>
      ${fora.length ? `<p class="suave">Fora da matriz por terem votado em menos de ${MIN_DIV} votações divididas: ${fora.map((v) => `${linkPerfil(v)} (${fmt(v.divididas_total)})`).join(", ")}.</p>` : ""}
      <div class="heat-info cartao" id="heat-info" role="status" aria-live="polite">Escolha um quadrado da matriz.</div>
      <div class="heat-wrap" tabindex="0" role="region" aria-label="Matriz de afinidade entre vereadores; role para os lados no celular">
        <div class="heat" style="--n:${ordem.length}">
          <span class="heat-canto"></span>
          ${ordem.map((v, j) => `<span class="heat-col" data-col="${j}" title="${esc(nomeV(v))}">${foto(v)}<span class="sr">${esc(nomeV(v))}</span></span>`).join("")}
          ${ordem.map((a, i) => `<a class="heat-lin" data-lin="${i}" href="${hrefPerfil(a)}">${esc(nomeV(a))}</a>
            ${ordem.map((b, j) => {
              if (a === b) return `<span class="heat-c heat-eu" aria-hidden="true"></span>`;
              const p = afinidadePar(a, b);
              const txt = p == null ? `${nomeV(a)} e ${nomeV(b)} têm menos de 3 votações divididas em comum.` : `${nomeV(a)} e ${nomeV(b)} votam igual em ${pct(p)} das votações divididas.`;
              return `<button type="button" class="heat-c${p == null ? " heat-sd" : nivel(p) > 0.55 ? " heat-forte" : ""}" data-i="${i}" data-j="${j}" data-txt="${esc(txt)}" style="--p:${p == null ? 0 : nivel(p).toFixed(3)}" aria-label="${esc(txt)}">${p == null ? "–" : Math.round(p)}</button>`;
            }).join("")}`).join("")}
        </div>
      </div>
      <div class="heat-legenda" aria-hidden="true"><span>${pct(min)}</span><span class="heat-grad"></span><span>${pct(max)}</span><span class="suave">votam igual</span></div>
      ${bons ? `<h2>Os dois blocos que mais votam juntos</h2>
        <p class="suave">Separação automática pelos votos: cada bloco reúne quem mais vota do mesmo lado. Não indica partido nem acordo político.</p>
        <div class="duas">${blocos.map((g, k) => `<div class="cartao bloco-plano">${rotulo(`Bloco ${k + 1} · ${g.length} vereadores`)}
          <p class="bloco-media">Dentro do bloco, votam igual em média em <b>${pct(Math.round(mediaDentro(g)))}</b> das divididas.</p>
          <ul class="pessoas-grade">${g.map((v) => `<li>${pessoaMini(v.chave, esc(v.partido || ""))}</li>`).join("")}</ul></div>`).join("")}</div>` : ""}
      <div class="duas">
        <div><h2>Pares que mais votam igual</h2><ol class="pares">${pares.slice(0, 6).map(linhaPar).join("")}</ol></div>
        <div><h2>Pares que menos votam igual</h2><ol class="pares">${pares.slice(-6).reverse().map(linhaPar).join("")}</ol></div>
      </div>
      <p class="aviso">Votar igual ou diferente não é certo nem errado. A afinidade mostra só a coincidência dos votos registrados; leia as votações para entender cada caso.</p>`;
    const info = app.querySelector("#heat-info");
    const marcar = (c) => {
      app.querySelectorAll(".heat .ativo").forEach((x) => x.classList.remove("ativo"));
      if (!c) return;
      info.textContent = c.dataset.txt;
      app.querySelectorAll(`[data-lin="${c.dataset.i}"], [data-col="${c.dataset.j}"]`).forEach((x) => x.classList.add("ativo"));
    };
    app.querySelectorAll("button.heat-c").forEach((c) => {
      c.addEventListener("mouseenter", () => marcar(c));
      c.addEventListener("focus", () => marcar(c));
      c.addEventListener("click", () => marcar(c));
    });
    // Teclado: um só quadrado entra na ordem do Tab; as setas andam pela matriz.
    const celulas = [...app.querySelectorAll("button.heat-c")];
    celulas.forEach((c, k) => { c.tabIndex = k === 0 ? 0 : -1; });
    app.querySelector(".heat").addEventListener("keydown", (e) => {
      const c = e.target.closest("button.heat-c");
      const passo = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
      if (!c || !passo) return;
      e.preventDefault();
      let i = +c.dataset.i, j = +c.dataset.j, alvo = null;
      for (let t = 0; t < ordem.length && !alvo; t++) {
        i += passo[0]; j += passo[1];
        if (i < 0 || j < 0 || i >= ordem.length || j >= ordem.length) break;
        alvo = app.querySelector(`button.heat-c[data-i="${i}"][data-j="${j}"]`);
      }
      if (alvo) { c.tabIndex = -1; alvo.tabIndex = 0; alvo.focus(); }
    });
  }

  // ------------------------------------------------------------ roteador
  // Rotas: #pagina, #pagina/<argumento> ou #pagina/chave=valor&chave=valor.
  // `dados`: arquivos que a página precisa antes de desenhar (carregados sob demanda).
  const PAGINAS = {
    inicio: { f: inicio },
    vereadores: { f: vereadores, menu: "vereadores" },
    vereador: { f: (arg) => vereador(arg), menu: "vereadores" },
    comparar: { f: (arg) => comparar(arg), menu: "vereadores" },
    rankings: { f: rankings },
    proposituras: { f: (arg, params) => proposituras(params), dados: ["proposituras"] },
    votacoes: { f: (arg, params) => votacoes(params), dados: (params) => [periodoValido(params.get("periodo")) ? "historico" : "votacoes"] },
    legislaturas: { f: legislaturas, menu: "vereadores" },
    votacao: { f: (arg) => votacao(arg), dados: ["votacoes"], menu: "votacoes" },
    casos: { f: (arg, params) => casos(arg, params) },
    caso: { f: (arg) => caso(arg), menu: "casos" },
    guia: { f: (arg) => guia(arg), dados: ["votacoes"] },
    sobre: { f: sobre },
    semana: { f: (arg) => semana(arg), dados: ["votacoes"] },
    quiz: { f: (arg, params) => quiz(arg, params), dados: ["votacoes"] },
    temas: { f: temas, dados: ["votacoes"] },
    aliancas: { f: aliancas, menu: "aliancas" },
    tema: { f: (arg) => tema(arg), dados: ["votacoes"], menu: "temas" },
  };

  // Depois de desenhar: título da aba e foco no h1 (leitor de tela anuncia a página nova).
  function aoDesenhar(pagina, focar) {
    const h1 = app.querySelector("h1");
    const nome = h1 ? h1.textContent.replace(/\s+/g, " ").trim() : "";
    document.title = pagina === "inicio" || !nome ? SITE : `${nome} · ${SITE}`;
    if (h1 && focar) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
  }

  let geracao = 0; // descarta o resultado de uma navegação que já foi substituída por outra
  function rota() {
    const n = ++geracao;
    const focar = n > 1; // na primeira carga o foco fica no começo da página
    const bruto = location.hash.slice(1);
    const corte = bruto.indexOf("/");
    const pedida = decodificar(corte < 0 ? bruto : bruto.slice(0, corte));
    const resto = corte < 0 ? "" : bruto.slice(corte + 1);
    const pagina = Object.prototype.hasOwnProperty.call(PAGINAS, pedida) ? pedida : "inicio";
    const pg = PAGINAS[pagina];
    const arg = decodificar(resto);
    const params = new URLSearchParams(resto);
    document.querySelectorAll(".menu a").forEach((a) => {
      const ativo = a.getAttribute("href") === "#" + (pg.menu || pagina);
      a.classList.toggle("ativo", ativo);
      if (ativo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    maisBtn.classList.toggle("ativo", !!maisLista.querySelector("a.ativo"));
    fecharMenu();
    document.body.classList.remove("sem-rolagem"); // gaveta de filtros aberta ao sair da página
    window.scrollTo(0, 0);
    const desenhar = () => { if (n === geracao) { pg.f(arg, params); aoDesenhar(pagina, focar); } };
    const dados = typeof pg.dados === "function" ? pg.dados(params) : pg.dados || [];
    if (!dados.every((d) => D[d])) {
      app.innerHTML = CARREGANDO;
      Promise.all(dados.map(carregar)).then(desenhar, () => { if (n === geracao) app.innerHTML = ERRO_CARGA; });
    } else {
      desenhar();
    }
  }

  const menu = document.querySelector(".menu"), menuBtn = document.querySelector(".menu-btn");
  const maisBtn = document.querySelector(".mais-btn"), maisLista = document.getElementById("mais-lista");
  function fecharMais() { maisLista.hidden = true; maisBtn.setAttribute("aria-expanded", "false"); }
  function fecharMenu() {
    menu.classList.remove("aberto");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Abrir menu");
    fecharMais();
  }
  menuBtn.addEventListener("click", () => {
    const aberto = menu.classList.toggle("aberto");
    menuBtn.setAttribute("aria-expanded", aberto);
    menuBtn.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
    if (aberto) menu.querySelector("a").focus();
  });
  // "Mais": lista que abre e fecha (no celular ela aparece sempre aberta dentro do ☰).
  maisBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const abrir = maisLista.hidden;
    maisLista.hidden = !abrir;
    maisBtn.setAttribute("aria-expanded", String(abrir));
    if (abrir) maisLista.querySelector("a").focus();
  });
  document.addEventListener("click", (e) => { if (!maisLista.hidden && !e.target.closest(".mais")) fecharMais(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!maisLista.hidden) { fecharMais(); maisBtn.focus(); }
    else if (menu.classList.contains("aberto")) { fecharMenu(); menuBtn.focus(); }
  });

  // Modo escuro: escolha salva no navegador (o index.html aplica antes de desenhar, para não piscar).
  const CHAVE_TEMA = "olho-tatui-tema", temaBtn = document.querySelector(".tema-btn");
  function marcarTema() {
    const escuro = document.documentElement.getAttribute("data-tema") === "escuro";
    temaBtn.setAttribute("aria-pressed", String(escuro));
    temaBtn.setAttribute("aria-label", escuro ? "Voltar ao modo claro" : "Ativar modo escuro");
    temaBtn.title = escuro ? "Modo claro" : "Modo escuro";
  }
  temaBtn.addEventListener("click", () => {
    const escuro = document.documentElement.getAttribute("data-tema") !== "escuro";
    if (escuro) document.documentElement.setAttribute("data-tema", "escuro"); else document.documentElement.removeAttribute("data-tema");
    try { localStorage.setItem(CHAVE_TEMA, escuro ? "escuro" : "claro"); } catch (e) { /* só não lembra a escolha */ }
    marcarTema();
  });
  marcarTema();
  // "Pular para o conteúdo": foca o h1 sem mudar o hash (o hash é do roteador).
  document.querySelector(".pular").addEventListener("click", (e) => {
    e.preventDefault();
    const alvo = app.querySelector("h1") || app;
    alvo.tabIndex = -1; alvo.focus();
  });
  document.getElementById("atualizado").textContent = `Dados atualizados em ${quando(D.geral.gerado_em)} (horário de Brasília).`;
  window.addEventListener("hashchange", rota);
  rota();
})();
