/* Painel ideológico: teste político em 8 eixos, com páginas próprias (rotas por hash).
   #inicio · #comecar · #teste/<curto|completo>/<n> · #resultado · #eixos · #eixo/<id> · #ideologias
   Cada eixo vai de -1 (polo A) a +1 (polo B). Em cada frase, `d` diz para qual polo o "concordo"
   empurra: +1 para B, -1 para A. As 3 primeiras frases de cada eixo formam o teste curto. */
(function () {
  "use strict";

  const EIXOS = [
    { id: "economia", nome: "Economia", a: "Estatista", b: "Liberal", cor: "#3d6e9e",
      txt: "Quanto o Estado deve participar da economia: de um lado, governo forte regulando preços, empregos e renda; do outro, mercado livre e menos interferência.",
      frases: [
        [+1, "Empresas privadas costumam administrar melhor do que o poder público."],
        [-1, "O governo deve intervir nos preços de itens essenciais quando ficam caros demais."],
        [+1, "Programas de transferência de renda deveriam ser reduzidos."],
        [-1, "Sindicatos são importantes para defender os direitos de quem trabalha."],
        [+1, "Abrir um negócio deveria exigir bem menos licenças, mesmo com menos fiscalização."]] },
    { id: "costumes", nome: "Costumes", a: "Progressista", b: "Conservador", cor: "#c2557a",
      txt: "Posição sobre família, sexualidade, drogas e escola: de um lado, ampliar direitos individuais e mudar costumes; do outro, preservar valores tradicionais.",
      frases: [
        [+1, "O aborto deve continuar sendo crime, salvo nos casos já previstos em lei."],
        [-1, "As escolas devem discutir diversidade, inclusive de gênero, com os alunos."],
        [-1, "O uso recreativo da maconha por adultos deveria ser permitido."],
        [-1, "Casais do mesmo sexo devem ter os mesmos direitos que os demais, inclusive o de adotar."],
        [+1, "A família tradicional deve ser protegida e incentivada pelo poder público."]] },
    { id: "seguranca", nome: "Segurança", a: "Garantista", b: "Rigor penal", cor: "#4a5568",
      txt: "Como enfrentar o crime: de um lado, prevenção, direitos e ressocialização; do outro, penas mais duras e mais poder para as forças de segurança.",
      frases: [
        [+1, "Penas mais duras são o melhor caminho para reduzir a criminalidade."],
        [-1, "Investir em educação e emprego reduz mais o crime do que aumentar penas."],
        [+1, "A Guarda Civil Municipal deveria andar armada."],
        [-1, "Presos devem ter acesso a estudo e trabalho para voltar ao convívio social."],
        [+1, "A polícia deve ter mais liberdade para agir, mesmo com risco de abusos."]] },
    { id: "ambiente", nome: "Meio ambiente", a: "Ambientalista", b: "Desenvolvimentista", cor: "#2f7d52",
      txt: "O peso da natureza frente ao crescimento: de um lado, proteger rios, matas e o clima mesmo com custo econômico; do outro, priorizar obras, empregos e expansão.",
      frases: [
        [+1, "Gerar empregos deve vir antes da proteção ambiental quando os dois entram em conflito."],
        [-1, "A cidade deveria multar com mais rigor quem desmata ou polui rios e nascentes."],
        [+1, "Áreas verdes podem dar lugar a novos loteamentos se a cidade precisar crescer."],
        [-1, "A prefeitura deveria investir em ciclovias e transporte coletivo antes de abrir novas avenidas."],
        [+1, "As regras ambientais atrasam obras e deveriam ser mais simples."]] },
    { id: "religiao", nome: "Religião", a: "Laico", b: "Religioso", cor: "#a0773b",
      txt: "O lugar da fé na vida pública: de um lado, Estado separado das religiões; do outro, valores religiosos orientando leis e governo.",
      frases: [
        [+1, "Valores religiosos devem orientar as decisões dos governantes."],
        [-1, "Prédios públicos não deveriam exibir símbolos religiosos."],
        [+1, "Igrejas devem continuar isentas de impostos."],
        [-1, "O ensino religioso não deveria fazer parte da escola pública."],
        [+1, "É positivo que líderes religiosos apoiem candidatos nas eleições."]] },
    { id: "servicos", nome: "Serviços públicos", a: "Gestão pública", b: "Concessão privada", cor: "#2b7a8c",
      txt: "Quem deve prestar os serviços da cidade: de um lado, servidores e órgãos públicos; do outro, concessões, terceirização e parcerias com empresas.",
      frases: [
        [+1, "A prefeitura deveria conceder à iniciativa privada serviços como coleta de lixo e transporte público."],
        [-1, "Saúde e educação devem ser oferecidas principalmente pelo poder público, de graça para todos."],
        [-1, "A prefeitura deveria contratar servidores concursados em vez de terceirizar serviços."],
        [+1, "Parcerias com empresas para administrar creches e postos de saúde são uma boa ideia."],
        [-1, "Empresas estatais estratégicas, como Petrobras e Correios, devem continuar públicas."]] },
    { id: "participacao", nome: "Participação", a: "Participativo", b: "Autoridade", cor: "#c0623f",
      txt: "Como as decisões devem ser tomadas: de um lado, consulta à população, conselhos e orçamento participativo; do outro, governantes com mais liberdade para decidir.",
      frases: [
        [-1, "Moradores deveriam votar diretamente em parte do orçamento da cidade."],
        [+1, "Um bom prefeito precisa de liberdade para decidir sem consultar a população a todo momento."],
        [-1, "Conselhos municipais com participação da população deveriam ter mais poder."],
        [+1, "Em tempos de crise, o governo deve poder agir rápido, mesmo passando por cima de debates."],
        [-1, "Projetos importantes deveriam passar por consulta pública antes de serem votados na Câmara."]] },
    { id: "impostos", nome: "Impostos", a: "Mais serviços", b: "Menos impostos", cor: "#7a5ea8",
      txt: "O tamanho da conta: de um lado, arrecadar mais, inclusive de quem tem mais, para oferecer mais serviços; do outro, cobrar menos e enxugar o gasto público.",
      frases: [
        [+1, "Impostos municipais, como IPTU e ISS, deveriam ser menores, mesmo com menos investimento."],
        [-1, "Quem tem imóveis de maior valor deve pagar proporcionalmente mais IPTU."],
        [+1, "Dar isenção de impostos para atrair empresas compensa, mesmo que a prefeitura arrecade menos."],
        [-1, "Pagar uma taxa a mais vale a pena se o serviço público melhorar de verdade."],
        [+1, "A prefeitura deveria cortar cargos e gastos antes de pensar em aumentar qualquer tributo."]] },
  ];

  // Posição típica de cada ideologia nos 8 eixos (ordem de EIXOS), de -1 a +1.
  // São aproximações didáticas para comparar respostas, não definições oficiais.
  const IDEOLOGIAS = [
    ["Socialismo democrático", "Economia planejada pelo Estado, serviços públicos amplos e participação popular nas decisões.", [-.9, -.6, -.6, -.5, -.6, -.9, -.8, -.8]],
    ["Social-democracia", "Mercado com forte Estado de bem-estar: saúde, educação e proteção social financiadas por impostos progressivos.", [-.5, -.4, -.3, -.3, -.3, -.5, -.4, -.5]],
    ["Progressismo", "Prioridade para direitos individuais, diversidade e mudança de costumes, com Estado ativo nas políticas sociais.", [-.4, -.9, -.6, -.6, -.7, -.4, -.6, -.3]],
    ["Ambientalismo", "A proteção da natureza e do clima orienta a economia, as cidades e as obras públicas.", [-.4, -.5, -.3, -1, -.4, -.4, -.6, -.3]],
    ["Trabalhismo", "Defesa do emprego, dos direitos trabalhistas e de estatais, com posições moderadas nos costumes.", [-.7, .1, 0, .3, 0, -.7, -.2, -.5]],
    ["Centrismo", "Busca equilíbrio entre os polos e decide caso a caso, sem adesão forte a nenhum lado.", [0, 0, 0, 0, 0, 0, 0, 0]],
    ["Social-liberalismo", "Mercado livre com rede de proteção social e abertura nos costumes.", [.3, -.5, -.2, -.2, -.4, .2, -.3, .2]],
    ["Liberalismo econômico", "Estado enxuto, impostos baixos, concessões e menos regulação da economia.", [.9, -.1, .1, .5, -.2, .8, .1, .9]],
    ["Libertarianismo", "Mínima interferência do Estado tanto na economia quanto na vida pessoal.", [1, -.5, -.3, .6, -.5, 1, -.5, 1]],
    ["Liberal-conservadorismo", "Mercado livre e Estado enxuto na economia, com valores tradicionais nos costumes.", [.7, .6, .6, .4, .4, .6, .3, .7]],
    ["Conservadorismo cristão", "Valores religiosos e família tradicional no centro da vida pública.", [.3, .9, .6, .2, .9, .2, .4, .4]],
    ["Direita linha-dura", "Ordem e segurança em primeiro lugar, com governo forte e penas mais duras.", [.4, .8, 1, .6, .5, .2, .9, .4]],
  ];

  const OPCOES = [[2, "Concordo totalmente"], [1, "Concordo"], [0, "Neutro"], [-1, "Discordo"], [-2, "Discordo totalmente"]];
  const MODOS = { curto: { nome: "Curto", n: 3, min: 4 }, completo: { nome: "Completo", n: 5, min: 7 } };
  const CHAVE = "olho-espectro-v2";

  // Políticos com posição nos eixos, tirada de votos reais (site/politicos.js, gerado pelo
  // agentes/analista.py a partir de casos/<cidade>/eixos.json). Cada eixo: [soma, n], voto = ±1.
  const POL = window.POLITICOS || { votacoes: [], politicos: [] };
  const polVal = (p, id) => (p.eixos[id] && p.eixos[id][1] ? p.eixos[id][0] / p.eixos[id][1] : null);

  const app = document.getElementById("app");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (v) => Math.round(Math.abs(v) * 100);

  // Estado salvo: { modo, resp: { "eixo:i": valor } }
  let est = { modo: "curto", resp: {} };
  try { est = Object.assign(est, JSON.parse(localStorage.getItem(CHAVE) || "{}")); } catch (e) { /* começa vazio */ }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(est)); } catch (e) { /* só na memória */ } };

  // Lista de perguntas do modo, intercalando eixos para o teste não ficar monótono.
  function perguntas(modo) {
    const n = MODOS[modo].n, saida = [];
    for (let i = 0; i < n; i++) EIXOS.forEach((x) => saida.push({ eixo: x, i, d: x.frases[i][0], t: x.frases[i][1], k: `${x.id}:${i}` }));
    return saida;
  }

  function calcular() {
    const v = {};
    EIXOS.forEach((x) => {
      let soma = 0, max = 0;
      x.frases.forEach(([d], i) => { const r = est.resp[`${x.id}:${i}`]; if (r !== undefined) { soma += r * d; max += 2; } });
      v[x.id] = max ? soma / max : null;
    });
    return v;
  }

  function ranking(v) {
    return IDEOLOGIAS.map(([nome, txt, alvo]) => {
      let s = 0, n = 0;
      EIXOS.forEach((x, i) => { if (v[x.id] !== null) { s += (v[x.id] - alvo[i]) ** 2; n++; } });
      const dist = n ? Math.sqrt(s / n) : 2;
      return { nome, txt, prox: Math.max(0, Math.round((1 - dist / 2) * 100)) };
    }).sort((a, b) => b.prox - a.prox);
  }

  // Políticos mais parecidos: só os eixos em que você respondeu e o político tem votos classificados.
  function parecidos(v) {
    return POL.politicos.map((p) => {
      let dist = 0, eixosC = 0, votos = 0;
      EIXOS.forEach((x) => {
        const pv = polVal(p, x.id);
        if (v[x.id] === null || pv === null) return;
        dist += Math.abs(v[x.id] - pv); eixosC++; votos += p.eixos[x.id][1];
      });
      return eixosC ? { p, prox: Math.round((1 - dist / eixosC / 2) * 100), eixosC, votos } : null;
    }).filter(Boolean).sort((a, b) => b.prox - a.prox || b.votos - a.votos);
  }

  const iniciais = (nome) => nome.split(" ").filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("");
  const foto = (p, cls) => p.foto
    ? `<img class="${cls}" src="${esc(p.foto)}" alt="" loading="lazy">`
    : `<span class="${cls} esp-sem-foto" aria-hidden="true">${esc(iniciais(p.nome))}</span>`;
  const nomeP = (n) => n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/ (D[aeo]s?|E) /g, (m) => m.toLowerCase());

  function cartaoPol(r) {
    const p = r.p;
    return `<a class="cartao esp-pol" href="${esc(p.perfil)}" target="_self">
      ${foto(p, "esp-pol-foto")}
      <span class="esp-pol-txt"><b>${esc(nomeP(p.nome))}</b><span>${esc(p.cargo)}${p.partido ? ` · ${esc(p.partido)}` : ""}</span>
        <span class="suave">${r.votos} ${r.votos === 1 ? "voto" : "votos"} em ${r.eixosC} ${r.eixosC === 1 ? "eixo" : "eixos"}</span></span>
      <span class="esp-pol-pct">${r.prox}%</span></a>`;
  }

  function lado(x, v) {
    if (v === null) return "sem resposta";
    if (Math.abs(v) < 0.2) return "Centro";
    return `${v < 0 ? x.a : x.b} ${pct(v)}%`;
  }

  // ---------------------------------------------------------------- páginas

  function inicio() {
    const exemplo = [["Economia", "Centro"], ["Meio ambiente", "Ambientalista 55%"], ["Costumes", "Progressista 40%"]];
    app.innerHTML = `
      <section class="esp-capa">
        <div>
          <p class="esp-rot">Teste político</p>
          <h1>Onde você fica <span>no mapa político?</span></h1>
          <p class="esp-lead">Responda frases sobre economia, costumes, segurança, meio ambiente, religião, serviços públicos, participação e impostos. Veja sua posição em 8 eixos e a ideologia mais próxima das suas respostas.</p>
          <div class="acoes"><a class="botao botao-pr" href="#comecar" target="_self">Começar o teste →</a><a class="botao" href="#eixos" target="_self">Conhecer os eixos</a></div>
          <p class="esp-meta">Grátis · sem cadastro · de 4 a 7 minutos</p>
        </div>
        <figure class="esp-exemplo cartao" aria-label="Exemplo de resultado">
          <div class="esp-ex-selo" aria-hidden="true">⚖</div>
          <p class="esp-ex-nome">Social-democracia</p>
          <ul>${exemplo.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join("")}</ul>
          <figcaption>Exemplo de resultado</figcaption>
        </figure>
      </section>

      <h2>Os 8 eixos</h2>
      <p class="suave">Cada eixo tem duas pontas. Toque em um para ver as frases e o que cada resposta indica.</p>
      ${gradeEixos()}

      <h2>Faça o teste</h2>
      <div class="esp-modos">${Object.entries(MODOS).map(([k, m]) => `
        <a class="cartao esp-modo" href="#teste/${k}/1" target="_self">
          <span class="esp-modo-topo"><b>${m.nome}</b>${k === "curto" ? `<span class="etq etq-ok">Recomendado</span>` : `<span class="etq">Mais preciso</span>`}</span>
          <span class="esp-modo-n"><b>${m.n * EIXOS.length}</b> frases · uns ${m.min} minutos</span>
          <span class="esp-modo-ir">Começar o ${m.nome.toLowerCase()} →</span>
        </a>`).join("")}</div>

      <h2>Perguntas frequentes</h2>
      <div class="esp-faq">
        ${faq("O que é este teste?", "Um questionário com frases do debate público, várias delas sobre a vida na cidade. Para cada frase você diz se concorda ou discorda, e o resultado mostra onde você fica em 8 eixos e quais ideologias mais se parecem com suas respostas.")}
        ${faq("Ele mostra com quais políticos eu pareço?", "Sim, com base em votos reais. Algumas votações nominais da Câmara foram classificadas por eixo (por exemplo, uma moção sobre drogas conta em Costumes). Suas respostas são comparadas com esses votos, e o resultado mostra as fotos dos políticos mais parecidos. Ainda são poucas votações por eixo, e nem todo eixo tem votações.")}
        ${faq("Ele diz em quem votar?", "Não. Ele mostra semelhanças em alguns temas, não a atuação inteira de ninguém. Para ver tudo o que cada vereador fez, abra o perfil dele.")}
        ${faq("Minhas respostas são guardadas?", "Só no seu aparelho, para você poder voltar ao resultado. Nada é enviado para servidor nenhum.")}
        ${faq("O resultado é científico?", "É uma simplificação. As posições das ideologias são aproximações didáticas e dois ou oito eixos não resumem tudo o que uma pessoa pensa. Use como ponto de partida para conversar, não como rótulo.")}
      </div>`;
  }

  const faq = (p, r) => `<details class="esp-faq-item"><summary>${p}</summary><p>${r}</p></details>`;

  function gradeEixos() {
    return `<div class="esp-eixos">${EIXOS.map((x) => `
      <a class="cartao esp-eixo-card" href="#eixo/${x.id}" target="_self" style="--cor:${x.cor}">
        <span class="esp-eixo-ico" aria-hidden="true">${x.nome[0]}</span>
        <b><i class="esp-dot"></i>${x.nome}</b>
        <span>${x.a} ou ${x.b}</span>
      </a>`).join("")}</div>`;
  }

  function eixos() {
    app.innerHTML = `<p class="esp-rot">Teste político</p><h1>Os 8 eixos</h1>
      <p class="esp-lead">Cada eixo mede uma questão do debate público, de uma ponta a outra. O resultado mostra, em cada um, para que lado suas respostas pendem e com que força.</p>${gradeEixos()}
      <div class="acoes"><a class="botao botao-pr" href="#comecar" target="_self">Fazer o teste →</a></div>`;
  }

  function eixo(id) {
    const x = EIXOS.find((e) => e.id === id);
    if (!x) return inicio();
    const v = calcular()[x.id];
    app.innerHTML = `
      <p class="esp-migalha"><a href="#eixos" target="_self">← Os 8 eixos</a></p>
      <section class="esp-eixo-capa" style="--cor:${x.cor}">
        <div>
          <p class="esp-rot"><i class="esp-dot"></i> Eixo do teste político</p>
          <h1>${x.nome}</h1>
          <p class="esp-polos"><span>${x.a}</span><i></i><span>${x.b}</span></p>
          <p class="esp-lead">${x.txt}</p>
          <div class="acoes"><a class="botao botao-pr" href="#comecar" target="_self">Fazer o teste</a></div>
        </div>
        <div class="esp-eixo-grande" aria-hidden="true">${x.nome[0]}</div>
      </section>
      ${v !== null && v !== undefined ? `<div class="aviso">Sua posição neste eixo: <b>${lado(x, v)}</b>.</div>` : ""}
      <section class="cartao esp-frases">
        <h2>As cinco frases do eixo ${x.nome}</h2>
        <ol>${x.frases.map(([d, t], i) => `<li><p>${esc(t)}</p><span>Concordar puxa para ${d > 0 ? x.b.toLowerCase() : x.a.toLowerCase()}.${i < 3 ? " Também está no teste curto." : ""}</span></li>`).join("")}</ol>
      </section>
      ${politicosNoEixo(x, v)}
      <h2>Outros eixos</h2>${gradeEixos()}`;
  }

  const linkVotacao = (t) => t.url || `${t.cidade}/index.html#votacao/${t.id}`;

  // Régua com a foto de cada político na posição que os votos dele indicam, e as votações usadas.
  function politicosNoEixo(x, voce) {
    const vot = POL.votacoes.filter((t) => t.eixo === x.id);
    const pols = POL.politicos.map((p) => ({ p, v: polVal(p, x.id) })).filter((r) => r.v !== null).sort((a, b) => a.v - b.v);
    if (!pols.length) return `<section class="cartao esp-pols-eixo"><h2>Políticos neste eixo</h2>
      <p class="suave">Ainda não há votações classificadas neste eixo. Um político só aparece aqui quando votou em matérias que medem este tema.</p></section>`;
    const grupos = {};
    pols.forEach((r) => (grupos[r.v.toFixed(2)] ||= []).push(r));
    // Até 4 fotos por posição; o resto vira "+N" (a lista abaixo mostra todos). Nas pontas, o grupo
    // cresce para dentro da régua.
    const marcas = Object.values(grupos).map((g) => {
      const v = g[0].v, ponta = v > 0.6 ? " esp-regua-dir" : v < -0.6 ? " esp-regua-esq" : "";
      return `<span class="esp-regua-grupo${ponta}" style="left:${50 + v * 50}%">
        ${g.slice(0, 4).map((r) => `<a href="${esc(r.p.perfil)}" target="_self" title="${esc(nomeP(r.p.nome))}: ${esc(lado(x, r.v))}">${foto(r.p, "esp-regua-foto")}</a>`).join("")}${g.length > 4 ? `<span class="esp-regua-foto esp-regua-mais" title="${g.slice(4).map((r) => esc(nomeP(r.p.nome))).join(", ")}">+${g.length - 4}</span>` : ""}</span>`;
    }).join("");
    return `<section class="cartao esp-pols-eixo" style="--cor:${x.cor}">
      <h2>Políticos neste eixo</h2>
      <p class="suave">Posição de cada político pelos votos em ${vot.length} ${vot.length === 1 ? "votação" : "votações"} sobre o tema. Votar a favor ou contra puxa para um dos polos; abstenção e falta não contam.</p>
      <div class="esp-regua">${marcas}${voce !== null && voce !== undefined ? `<span class="esp-regua-voce" style="left:${50 + voce * 50}%">Você</span>` : ""}</div>
      <p class="esp-pontas"><span>${x.a}</span><span>${x.b}</span></p>
      <ul class="esp-pols-lista">${pols.slice().reverse().map((r) => `<li><a href="${esc(r.p.perfil)}" target="_self">${foto(r.p, "esp-mini-foto")}<b>${esc(nomeP(r.p.nome))}</b></a><span>${esc(r.p.partido || "")} · ${esc(r.p.cargo.replace(/\(a\)/, ""))}</span><span>${esc(lado(x, r.v))}</span><span class="suave">${r.p.eixos[x.id][1]} votos</span></li>`).join("")}</ul>
      <h3>Votações usadas</h3>
      <ol class="esp-vots">${vot.map((t) => `<li><a href="${esc(linkVotacao(t))}" ${t.url ? 'rel="noopener"' : 'target="_self"'}><b>${esc(t.m)}</b></a> · ${esc(t.fonte || "Câmara Municipal")} · ${esc(t.d.slice(0, 10).split("-").reverse().join("/"))} · ${esc(t.r)} (${t.n.favor || 0} a ${t.n.contra || 0})
        <p>${esc(t.nota)}</p><span class="suave">Votar a favor puxa para ${t.favor === "b" ? esc(x.b.toLowerCase()) : esc(x.a.toLowerCase())}.</span></li>`).join("")}</ol>
    </section>`;
  }

  function ideologias() {
    app.innerHTML = `<p class="esp-rot">Teste político</p><h1>As ideologias do teste</h1>
      <p class="esp-lead">No fim do teste, suas respostas são comparadas com a posição típica de cada ideologia nos 8 eixos. As posições são aproximações didáticas, para orientar a conversa.</p>
      <div class="esp-ideos">${IDEOLOGIAS.map(([n, t, alvo]) => `
        <article class="cartao"><h3>${n}</h3><p>${t}</p>
          <div class="esp-mini">${EIXOS.map((x, i) => `<span title="${x.nome}: ${lado(x, alvo[i])}" style="--v:${alvo[i]}"><i></i></span>`).join("")}</div>
          <p class="esp-mini-leg">${EIXOS.map((x) => x.nome).join(" · ")}</p>
        </article>`).join("")}</div>`;
  }

  function comecar() {
    app.innerHTML = `<section class="esp-escolha cartao">
      <h1>Qual teste você quer fazer?</h1>
      <div class="esp-modos" role="radiogroup" aria-label="Tamanho do teste">${Object.entries(MODOS).map(([k, m]) => `
        <button type="button" role="radio" class="esp-modo esp-radio" data-modo="${k}" aria-checked="${est.modo === k}">
          <span class="esp-modo-topo"><b>${m.nome}</b>${k === "curto" ? `<span class="etq etq-ok">Recomendado</span>` : ""}</span>
          <span class="esp-modo-n"><b>${m.min}</b> min</span>
          <span>${m.n * EIXOS.length} frases, ${m.n} por eixo</span>
          <span class="esp-precisao">Precisão ${"<i></i>".repeat(m.n)}${"<i class=v></i>".repeat(5 - m.n)}</span>
        </button>`).join("")}</div>
      <p class="suave">Suas respostas ficam só neste aparelho. Nada é enviado.</p>
      <div class="acoes"><a class="botao botao-pr" id="esp-ir" href="#teste/${est.modo}/1" target="_self">Começar o teste →</a></div>
    </section>`;
    app.querySelectorAll(".esp-radio").forEach((b) => b.addEventListener("click", () => {
      est.modo = b.dataset.modo; salvar();
      app.querySelectorAll(".esp-radio").forEach((x) => x.setAttribute("aria-checked", x === b));
      app.querySelector("#esp-ir").href = `#teste/${est.modo}/1`;
    }));
  }

  function teste(modo, n) {
    if (!MODOS[modo]) return comecar();
    est.modo = modo; salvar();
    const lista = perguntas(modo), total = lista.length;
    n = Math.min(Math.max(1, n || 1), total);
    const q = lista[n - 1], atual = est.resp[q.k];
    const feitas = lista.filter((p) => est.resp[p.k] !== undefined).length;
    app.innerHTML = `<section class="esp-pergunta" style="--cor:${q.eixo.cor}">
      <div class="esp-pg-topo"><span>${n} de ${total}</span><a href="#resultado" target="_self">Ver resultado parcial</a></div>
      <div class="esp-progresso" aria-hidden="true"><span style="width:${(100 * feitas) / total}%"></span></div>
      <p class="esp-rot"><i class="esp-dot"></i> ${q.eixo.nome}</p>
      <h1 class="esp-frase">${esc(q.t)}</h1>
      <div class="esp-opcoes" role="radiogroup" aria-label="Sua resposta">
        ${OPCOES.map(([v, r]) => `<button type="button" role="radio" class="esp-op esp-op${v}" data-v="${v}" aria-checked="${atual === v}">${r}</button>`).join("")}
      </div>
      <div class="esp-pg-nav">
        <a class="botao" href="#teste/${modo}/${n - 1}" target="_self" ${n === 1 ? 'aria-disabled="true" tabindex="-1"' : ""}>← Anterior</a>
        <a class="botao" href="${n === total ? "#resultado" : `#teste/${modo}/${n + 1}`}" target="_self">${n === total ? "Ver resultado" : "Pular"}</a>
      </div>
    </section>`;
    app.querySelectorAll(".esp-op").forEach((b) => b.addEventListener("click", () => {
      est.resp[q.k] = +b.dataset.v; salvar();
      location.hash = n === total ? "#resultado" : `#teste/${modo}/${n + 1}`;
    }));
  }

  function mapa(eco, cos) {
    const x = 160 + (eco || 0) * 130, y = 160 - (cos || 0) * 130;
    return `<svg class="esp-mapa" viewBox="0 0 320 320" role="img" aria-label="Sua posição: economia ${lado(EIXOS[0], eco)}, costumes ${lado(EIXOS[1], cos)}">
      <rect x="20" y="20" width="140" height="140" class="q q1"/><rect x="160" y="20" width="140" height="140" class="q q2"/>
      <rect x="20" y="160" width="140" height="140" class="q q3"/><rect x="160" y="160" width="140" height="140" class="q q4"/>
      <line x1="20" y1="160" x2="300" y2="160" class="eixo"/><line x1="160" y1="20" x2="160" y2="300" class="eixo"/>
      <text x="160" y="13" class="el">conservador</text><text x="160" y="316" class="el">progressista</text>
      <text x="9" y="160" class="el" transform="rotate(-90 9 160)">estatista</text>
      <text x="313" y="160" class="el" transform="rotate(90 313 160)">liberal</text>
      <circle cx="${x}" cy="${y}" r="16" class="ponto-halo"/><circle cx="${x}" cy="${y}" r="8" class="ponto"/>
    </svg>`;
  }

  function resultado() {
    const v = calcular();
    const respondidos = EIXOS.filter((x) => v[x.id] !== null).length;
    if (!respondidos) { app.innerHTML = `<h1>Ainda sem respostas</h1><p class="esp-lead">Responda o teste para ver seu resultado.</p><div class="acoes"><a class="botao botao-pr" href="#comecar" target="_self">Começar o teste →</a></div>`; return; }
    const rk = ranking(v), top = rk[0];
    const total = perguntas(est.modo).length, feitas = Object.keys(est.resp).length;
    const texto = `Meu resultado no Painel ideológico do Olho na Câmara: ${top.nome} (${top.prox}% de proximidade). Faça o seu: ${location.href.split("#")[0]}`;
    app.innerHTML = `
      <section class="esp-res-capa">
        <p class="esp-rot">Seu resultado</p>
        <h1>${top.nome}</h1>
        <p class="esp-lead">${top.txt}</p>
        <p class="suave">${top.prox}% de proximidade · com base em ${feitas} de ${total} frases${feitas < total ? ` · <a href="#teste/${est.modo}/1" target="_self">completar o teste</a>` : ""}</p>
      </section>
      <div class="esp-res-grade">
        <div class="cartao"><h3>Economia × costumes</h3>${mapa(v.economia, v.costumes)}</div>
        <div class="cartao"><h3>Também perto de você</h3><ol class="esp-top">${rk.slice(1, 4).map((r) => `<li><b>${r.nome}</b><span>${r.prox}%</span><p>${r.txt}</p></li>`).join("")}</ol>
          <p><a href="#ideologias" target="_self">Ver todas as ideologias →</a></p></div>
      </div>
      ${blocoParecidos(v)}
      <h2>Sua posição nos 8 eixos</h2>
      <div class="esp-barras">${EIXOS.map((x) => {
        const val = v[x.id];
        return `<a class="esp-barra" href="#eixo/${x.id}" target="_self" style="--cor:${x.cor}">
          <span class="esp-barra-topo"><b><i class="esp-dot"></i>${x.nome}</b><span>${lado(x, val)}</span></span>
          <span class="esp-trilho"><span class="esp-marca" style="left:${50 + (val || 0) * 50}%"${val === null ? " hidden" : ""}></span></span>
          <span class="esp-pontas"><span>${x.a}</span><span>${x.b}</span></span></a>`;
      }).join("")}</div>
      <div class="acoes">
        <a class="botao botao-pr" href="https://wa.me/?text=${encodeURIComponent(texto)}" rel="noopener">Compartilhar no WhatsApp</a>
        <a class="botao" href="index.html#quiz" target="_self">Com qual vereador você vota igual? →</a>
        <button type="button" id="esp-refazer">Refazer o teste</button>
      </div>
      <p class="aviso">A comparação com políticos usa poucas votações por eixo e não resume a atuação de ninguém. Este resultado não diz em quem votar. Para comparar votação por votação, use o quiz de votações reais.</p>`;
    app.querySelectorAll(".esp-cargo").forEach((b) => b.addEventListener("click", () => { est.cargo = b.dataset.cargo; salvar(); resultado(); }));
    app.querySelector("#esp-refazer").addEventListener("click", () => { est.resp = {}; salvar(); location.hash = "#comecar"; });
  }

  function blocoParecidos(v) {
    // Destaque só para quem tem base mínima (3 votos em 2 eixos); os demais ficam em "Ver todos".
    const cargos = [...new Set(POL.politicos.map((p) => p.cargo))];
    const todos = parecidos(v).filter((r) => !est.cargo || r.p.cargo === est.cargo), base = (r) => r.votos >= 3 && r.eixosC >= 2;
    const rk = [...todos.filter(base), ...todos.filter((r) => !base(r))];
    if (!rk.length && !est.cargo) return "";
    const eixosComVotos = EIXOS.filter((x) => POL.votacoes.some((t) => t.eixo === x.id)).map((x) => x.nome);
    return `<h2>Políticos que votaram parecido com você</h2>
      <p class="suave">Comparação das suas respostas com votos reais, em ${eixosComVotos.join(", ")}. Nos outros eixos ainda não há votações classificadas. Toque num nome para ver o perfil e todos os votos.</p>
      ${cargos.length > 1 ? `<div class="chips" role="group" aria-label="Cargo">${["", ...cargos].map((c) => `<button type="button" class="chip esp-cargo" data-cargo="${esc(c)}" aria-pressed="${(est.cargo || "") === c}">${esc(c ? c.replace(/\(a\)/, "s").replace("Vereadors", "Vereadores").replace("Deputados federal", "Deputados federais") : "Todos")}</button>`).join("")}</div>` : ""}
      <div class="esp-pols">${rk.slice(0, 6).map(cartaoPol).join("")}</div>
      ${rk.length > 6 ? `<details class="esp-mais-pols"><summary>Ver todos (${rk.length})</summary><div class="esp-pols">${rk.slice(6).map(cartaoPol).join("")}</div></details>` : ""}
      <p class="suave">Poucas votações por eixo: trate a porcentagem como pista, não como veredito. <a href="#eixos" target="_self">Ver as votações de cada eixo →</a></p>`;
  }

  // ---------------------------------------------------------------- rotas

  const TITULOS = { inicio: "Painel ideológico", comecar: "Escolha o teste", teste: "Teste político", resultado: "Seu resultado", eixos: "Os 8 eixos", eixo: "Eixo", ideologias: "Ideologias" };
  function rota() {
    const [pag, a, b] = (decodeURIComponent(location.hash.slice(1)) || "inicio").split("/");
    ({ inicio, comecar, eixos, ideologias, resultado, eixo: () => eixo(a), teste: () => teste(a, +b) }[pag] || inicio)();
    const h1 = app.querySelector("h1");
    document.title = `${pag === "eixo" ? (EIXOS.find((x) => x.id === a) || {}).nome || "Eixo" : (h1 && pag === "resultado" ? h1.textContent : TITULOS[pag] || TITULOS.inicio)} · Painel ideológico · Olho na Câmara`;
    document.querySelectorAll(".esp-nav a").forEach((l) => l.toggleAttribute("aria-current", l.getAttribute("href") === `#${pag}`));
    window.scrollTo(0, 0);
    if (pag !== "inicio") app.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", rota);
  rota();
})();
