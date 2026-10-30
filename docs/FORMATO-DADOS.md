# Formato dos dados do site

Tudo em `site/` é gerado por `agentes/analista.py`, exceto `index.html`, `app.js`, `style.css` e `tema.css`. Não edite os arquivos gerados à mão: rode `python agentes/orquestrador.py --so-site`.

## Arquivos

| Arquivo | Tamanho | Carregamento | Conteúdo |
|---|---|---|---|
| `dados-base.js` | ~60 KB | `<script>` no `index.html` | `geral`, `vereadores`, `afinidade`, `casos`, `apelidos`, `legislaturas`, `siscam`, `versoes` |
| `votacoes.js` | ~1,3 MB | sob demanda | `votacoes`, `sessoes` |
| `proposituras.js` | ~4,4 MB | sob demanda | `proposituras` |
| `historico.js` | ~1,8 MB | sob demanda | `historico`: votações e sessões de 2017-2024 |
| `fotos/<id>.jpg` | ~20 KB cada | `<img>` | foto oficial reduzida para 320 px de largura |
| `vereador/<slug>.html` | ~1,5 KB | link compartilhável | título, descrição e Open Graph; redireciona para `index.html#vereador/<chave>` |

Cada arquivo preenche uma parte de `window.DADOS` (`window.DADOS.votacoes = [...]`). `votacoes.js`, `proposituras.js` e `historico.js` não são versionados no git; `dados-base.js`, `fotos/` e `vereador/` são.

### Carregamento sob demanda

`app.js` tem `carregar(nome)`, que insere `<script src="<nome>.js?v=<hash>">` e devolve uma Promise. Funciona em `file://` (abrir o `index.html` direto do disco), onde `fetch` não funciona.

- Rotas declaram os arquivos que precisam em `PAGINAS` (`dados: ["votacoes"]`, ou uma função dos parâmetros: `#votacoes/periodo=2021` pede `historico`). O roteador mostra "Carregando dados da Câmara…" (`.carregando`) até chegarem.
- Para carregar só uma parte da página, use `depois(["proposituras"], elemento, preencher)`, como faz o perfil do vereador.

### Versionamento (cache do navegador)

O analista grava `?v=<hash do conteúdo>` em `index.html` para `dados-base.js`, `app.js` e `style.css`. Os hashes de `votacoes.js`, `proposituras.js` e `historico.js` ficam em `DADOS.versoes`. Ao editar `index.html`, mantenha as referências a esses três arquivos com aspas duplas (`src="app.js"` ou `href="style.css"`, com ou sem `?v=`).

## Rotas do SPA

| Rota | Página |
|---|---|
| `#inicio`, `#vereadores`, `#rankings`, `#casos`, `#sobre` | páginas fixas (só `dados-base.js`; o início carrega `votacoes` depois, para a última sessão) |
| `#vereador/<chave ou slug>` | perfil (`#vereador/MAURICIO%20ENFERMEIRO` ou `#vereador/mauricio-enfermeiro`); quem só atuou antes de 2025 tem perfil reduzido (`#vereador/EDUARDO%20SALLUM`) |
| `#proposituras/autor=<chave>&tipo=<tipo>` | lista com filtros iniciais (parâmetros opcionais) |
| `#votacoes/periodo=<ano>&vereador=<chave>&voto=<opção>` | votações; `periodo` é o ano de início de uma legislatura anterior (2021, 2017), vazio = atual. `#votacoes/contra=<chave>` continua valendo |
| `#legislaturas` | resumo das legislaturas e vereadores das anteriores |
| `#votacao/<id>` | uma votação, com a sessão e os casos ligados: é o link para compartilhar |
| `#guia/<chave ou slug>` | guia do eleitor com a ficha do vereador aberta |
| `#casos/tema=<tema>&ano=<ano>` | grade de casos com filtros (opcionais). O endereço antigo `#casos/<id>` redireciona para `#caso/<id>` |
| `#caso/<id>` | página do caso (só `dados-base.js`): usa `tema`, `curto`, `em_jogo`, `linha_do_tempo` (`[[data, texto]]`, data `AAAA-MM-DD` ou `AAAA-MM`) e `votacoes` |
| `#quiz`, `#quiz/resultado`, `#quiz/r=<S/N/P por pergunta>` | quiz (carrega `votacoes`); respostas em `localStorage` (`olho-tatui-quiz`). `r=` preenche as respostas pela ordem das perguntas |
| `#temas`, `#tema/<slug>` | temas sensíveis (carrega `votacoes`); slugs: `impostos`, `investigacao`, `salarios`, `emprestimos`, `patrimonio`, `orcamento` |
| `#semana`, `#semana/<id da sessão>` | resumo da sessão mais recente com chamada, ou de uma sessão escolhida (carrega `votacoes`) |
| `#aliancas` | matriz de afinidade (só `dados-base.js`); fica de fora quem tem menos de 10 votações divididas |

Outras chaves do `localStorage`: `olho-tatui-meu-vereador` e `olho-tatui-tema` (`claro` ou `escuro`).

Hash malformado não quebra o site: página desconhecida cai no início, e parâmetro inválido é ignorado.

## `DADOS.geral`

`gerado_em` (ISO com fuso, ex.: `2026-10-28T19:35-03:00`; exiba com `quando()`), `total_proposituras`, `por_tipo`, `por_situacao` (normalizada), `por_situacao_original`, `por_mes`, `total_sessoes`, `total_votacoes`, `votacoes_divididas`, `votacoes_listadas` e `periodo` (`[primeira, última]` data).

## `DADOS.vereadores[]`

Todos que exerceram mandato na legislatura e têm alguma atividade. Em exercício primeiro, depois por nome.

| Campo | Exemplo | Observação |
|---|---|---|
| `id` | `2152` | ID no SisCam |
| `chave` | `"MAURICIO ENFERMEIRO"` | identificador estável: sem acento, maiúsculo |
| `slug` | `"mauricio-enfermeiro"` | para URLs e `vereador/<slug>.html` |
| `nome`, `nome_civil`, `partido`, `email` | | `nome_civil` e `email` vazios para ex-vereadores |
| `em_exercicio` | `true` | segundo a página `/Vereadores` |
| `mandato` | `{inicio, fim, cargo, votos, partido_eleicao}` | da página da legislatura. `fim` pode estar desatualizado no SisCam (ex.: João Éder) |
| `foto` | `"fotos/2152.jpg"` | `""` se não houver; o site mostra as iniciais |
| `proposituras`, `principal` | `{"Requerimento": 854, ...}` | autor ou coautor; `principal` só o primeiro autor |
| `pl_total`, `pl_aprovados`, `pl_categorias`, `mocao_categorias`, `pedido_temas` | | ver METODOLOGIA.md |
| `presenca` | `{presente, ausente, pct}` | `pct` é `null` sem sessões |
| `votos` | `{favor, contra, abstencao, ausente, nao_vota}` | contagem de votos nominais |
| `alinhamento_maioria`, `divididas_total` | `37.1`, `132` | |

Não há mais `perfil` nem URL de foto remota: o link oficial é montado com `urlPerfil(id)`.

## `DADOS.afinidade`

`{"CHAVE A|CHAVE B": 93.9}`, com as chaves em ordem alfabética. Só pares com 3 ou mais votações divididas em comum.

## `DADOS.apelidos`

`{"MAURICIO COUTO": "MAURICIO ENFERMEIRO", "JOAO EDER ALVES MIGUEL": "JOAO EDER", ...}`: nome alternativo (sem acento, maiúsculo) para a chave do vereador. Use `quem(nome)` em `app.js` para resolver o nome de um autor de propositura. Vem dos nomes civis da página `/Vereadores`, da página da legislatura e de `casos/apelidos.json` (curado).

## `DADOS.legislaturas[]`

Legislaturas encerradas, da mais recente para a mais antiga (a atual está em `geral`): `ano` (início: 2021), `nome` ("18ª legislatura"), `inicio`, `fim`, `total_sessoes`, `sessoes_com_registro` (com chamada ou votos), `total_votacoes`, `votacoes_divididas`, `votacoes_listadas`, `total_proposituras`, `por_tipo` e `vereadores[]`:

| Campo | Exemplo | Observação |
|---|---|---|
| `chave`, `nome`, `slug`, `id` | `"PEPINHO"`, `1239` | mesma chave do perfil atual quando a pessoa está em 2025-2028 |
| `partido`, `cargo` | `"PSD"`, `"Titular"` | da página da legislatura; vazios para suplentes que ela não lista |
| `presenca` | `{presente, ausente, pct}` | |
| `pl_total`, `pl_pp`, `pl_aprovados` | | `pl_pp` = PL de política pública |
| `mocoes`, `requerimentos` | | autor ou coautor |
| `votos`, `alinhamento_maioria`, `divididas_total` | | como em `DADOS.vereadores` |

## `DADOS.historico` (em `historico.js`)

`{votacoes: [...], sessoes: [...]}` das legislaturas encerradas. Votações no formato de `DADOS.votacoes`, sempre com `v` (nomes por voto), mais `l` (ano de início da legislatura). Sessões como em `DADOS.sessoes`, mais o ano da legislatura no fim. `#votacao/<id>` encontra votações atuais e anteriores (carrega `historico.js` se preciso).

## `DADOS.casos[]`

Como em `casos/casos.json` (`id`, `titulo`, `data`, `materia`, `resumo`, `status`, `fontes[]`) mais `votacoes[]`, com **todas** as votações listadas da matéria (da legislatura atual ou das anteriores) (1ª e 2ª discussão, emendas etc.), em ordem de data, no mesmo formato de `DADOS.votacoes`.

## `DADOS.siscam`

`{base: "https://tatui.siscam.com.br", tipos: {"Projeto de Lei": 134, ...}}`. Usado pelas funções que montam links: `urlDocumento(doc)`, `urlSessao(id)`, `urlPerfil(id)`, `urlProposicao(p)`. Todo `href` que vem de dados passa por `url()`, que só aceita http/https.

## `DADOS.votacoes[]` (em `votacoes.js`)

Só as votações que interessam ao leitor: divididas, negadas, em temas sensíveis, ligadas a casos, ou que não são rotina (requerimento, moção, indicação, ata aprovados por unanimidade ficam só nos totais).

| Campo | Exemplo | Observação |
|---|---|---|
| `id` | `"1107-117712"` | `<sessão>-<documento>`; se o mesmo documento for votado de novo na sessão, `-2`, `-3`… Estável entre coletas |
| `s`, `d` | `1107`, `"2025-10-23"` | ID e data da sessão |
| `doc` | `117712` | ID do documento no SisCam (`urlDocumento(doc)`) |
| `m`, `a` | | matéria e assunto (até 400 caracteres) |
| `au` | `["COMISSÃO DE CONSTITUIÇÃO, JUSTIÇA E REDAÇÃO"]` | autoria como escrita no SisCam |
| `t`, `f`, `r` | `"Nominal"`, `"2ª Discussão"`, `"Aprovado"` | tipo de votação, fase, resultado |
| `div`, `sens` | `true`, `["Impostos e taxas"]` | dividida; temas sensíveis |
| `v` | `{"favor": ["ALEX MOTA", ...], "contra": [...]}` | **chaves** de vereador por opção. Vazio (`{}`) quando só o placar importa |
| `n` | `{"favor": 9, "contra": 7, "nao_vota": 1}` | placar |

Comissões que o SisCam às vezes lista como votante são descartadas.

## `DADOS.sessoes[]` (em `votacoes.js`)

Lista de `[id, titulo, data, presentes, ausentes, número de votações]`.

## `DADOS.proposituras[]` (em `proposituras.js`)

Lista compacta; os índices estão em `P` no `app.js` e na mesma ordem de `lista_props` no `analista.py`:

| Índice | `P.` | Conteúdo |
|---|---|---|
| 0 | `tipo` | `"Projeto de Lei"` |
| 1 | `num` | `26` |
| 2 | `ano` | `2025` |
| 3 | `data` | `"2025-03-25"` |
| 4 | `ementa` | até 450 caracteres |
| 5 | `autores` | nomes como escritos no SisCam (podem ser nomes civis; use `quem()`) |
| 6 | `sit` | situação normalizada (`APROVADA` vira `APROVADO`, `PREJUDICADA` vira `PREJUDICADO`, `RETIRADA PELO AUTOR` vira `RETIRADO PELO AUTOR`) |
| 7 | `cat` | categoria (PL, moção) ou tema (requerimento, indicação) |
| 8 | `origem` | `"Vereador(es)"` ou `"Executivo/outros"` |
| 9 | `sens` | temas sensíveis |
| 10 | `sitOrig` | situação original do SisCam se diferente de `sit`; senão `""` |

O link oficial não vem no arquivo: `urlProposicao(p)` monta a partir de tipo, número e ano.

## Fora do site

- `dados/processados/indicadores.json`: `geral`, `vereadores`, `afinidade`, `casos` e `apelidos`.
- `dados/processados/{vereadores,proposituras,sessoes}_<ano>.json`: dados das legislaturas encerradas (2017, 2021). Os de proposituras e sessões ficam fora do git (grandes, regeneráveis).
- `dados/historico/AAAA-MM-DD.json`: instantâneo diário por vereador (`presenca`, `proposituras`, `por_tipo`, `pl_total`, `pl_aprovados`, `votos`, `alinhamento_maioria`, `divididas_total`) e os totais gerais. Base para gráficos de evolução.
