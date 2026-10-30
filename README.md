# Olho na Câmara

Observatório independente das Câmaras Municipais de Tatuí, Itapetininga, Cerquilho, Iperó e Cesário Lange (SP). Mostra o que cada vereador propõe, como vota e quanto comparece; gastos e receitas das Câmaras e Prefeituras; emendas parlamentares recebidas; eleições de 2024 e 2026 com mapa por local de votação; deputados e senadores de SP; um teste político que compara o visitante com votos reais; e alertas da semana. Tudo vem de dados públicos oficiais, coletados por agentes automáticos.

## Atualização automática

Os coletores são programas em Python que rodam no seu computador ou no servidor do seu site: não usam o Claude nem gastam tokens. Para atualizar sozinho todo dia, agende `atualizar.bat` no Windows (passo a passo em [docs/AGENTES.md](docs/AGENTES.md#agendamento-no-windows)) ou `python agentes/orquestrador.py` no cron do servidor. Depois de cada execução, copie a pasta `site/` para o seu site (ou rode no próprio servidor, com `site/` dentro da pasta pública).

## Fontes e coletores

| Coletor | Fonte | Como |
|---|---|---|
| `coletor_vereadores.py`, `coletor_proposituras.py`, `coletor_sessoes.py` | SisCam de cada Câmara | páginas e CSV oficiais (o SisCam não tem API) |
| `coletor_deputados.py` | Câmara dos Deputados e Senado | API de dados abertos (deputados, votos, senadores, CEAPS) e arquivo anual da cota parlamentar |
| `coletor_tce.py` | TCE-SP | API de transparência municipal (despesas e receitas) |
| `coletor_emendas.py` | Portal da Transparência (CGU) | arquivo aberto de emendas parlamentares (sem chave) |
| `coletor_tse.py`, `coletor_tse_geral.py` | TSE | arquivos do Portal de Dados Abertos (o TSE não tem API de resultados); só com `--eleicoes` |
| `alertas.py` | os dados acima | o que mudou na semana |
| `descobrir_cidade.py` | SisCam | configura uma cidade nova automaticamente |

## Como usar

1. Abra `site/index.html` no navegador. Não precisa de servidor. Para publicar, copie a pasta `site/` inteira para qualquer hospedagem estática.
2. Para atualizar os dados, dê dois cliques em `atualizar.bat` ou rode:
   ```
   python agentes/orquestrador.py
   ```
   Sem opções, roda todas as cidades configuradas em `cidades/`. Para uma cidade só, use `--cidade itapetininga` (vale com as opções abaixo). Para adicionar uma cidade, veja [docs/AGENTES.md](docs/AGENTES.md#adicionar-uma-cidade).

   Para só regenerar o site com os dados já baixados:
   ```
   python agentes/orquestrador.py --so-site
   ```
   As legislaturas encerradas (2017-2020 e 2021-2024) são coletadas uma vez só, quando o arquivo delas em `dados/<cidade>/processados/` não existe; para coletar de novo, use `--historico`. `--eleicoes` inclui os dados do TSE e `--sem-extras` roda só as Câmaras.
   Código de saída: 0 ok; 1 falha de coleta; 2 checagem de sanidade (total caiu mais de 5% ou não há 17 vereadores em exercício). Nos casos 1 e 2 os dados anteriores ficam intactos e o site é gerado com eles. Se a queda for real, rode com `--forcar`.
3. Ao publicar, defina a variável de ambiente `OLHO_URL_SITE` (ex.: `https://exemplo.org`) antes de gerar o site, para o Open Graph das páginas de vereador usar URLs absolutas.

Requisitos: Python 3.10 ou mais novo. Usa só a biblioteca padrão; `pip install pillow` é opcional (reduz as fotos fora do Windows).

## O que o site mostra

| Página | Conteúdo |
|---|---|
| Início | Abertura com "Ver os vereadores" e "Fazer o quiz", contadores da Câmara, Meu vereador, Encontre seu vereador, casos em destaque e a última sessão |
| Rankings | 11 rankings: presença, faltas, PLs de política pública, PLs aprovados, requerimentos de fiscalização, total de requerimentos, homenagens, proporção de homenagens, votos contra, alinhamento com o lado vencedor, ausências na hora do voto |
| Vereadores | Perfil de cada um: presença, projetos por categoria, moções, temas de requerimentos, votos, com quem mais vota igual, votos contra |
| Proposituras | Busca e filtros (tipo, autor, situação, categoria, ano, temas sensíveis) com link para o documento oficial |
| Votações | Votações nominais, com filtro de período (atual, 2021-2024, 2017-2020), para as divididas, por tema sensível e por quem votou contra. Cada votação tem link próprio (`#votacao/<id>`) |
| Legislaturas | Resumo das legislaturas 2025-2028, 2021-2024 e 2017-2020 e tabela dos vereadores das anteriores (link na página Vereadores e em Como funciona). O perfil mostra os "Mandatos anteriores" de cada um |
| Casos | Grade de cartões (tema, data, placar, status) com filtros por tema e ano. Cada caso tem página própria (`#caso/<id>`): o que estava em jogo, placar, votos com foto, linha do tempo, resumo, fontes, compartilhar e navegação entre casos |
| Quiz | "Com qual vereador você vota igual?" (`#quiz`): 12 votações divididas escolhidas automaticamente (casos e temas sensíveis primeiro); resultado com percentual por vereador, compartilhável. Respostas só no navegador |
| Temas | Uma página por tema sensível (`#tema/<slug>`): o que é, casos, placar por vereador e votações divididas |
| A última sessão | Resumo automático da sessão mais recente (`#semana`) ou de outra (`#semana/<id da sessão>`) |
| Alianças | Matriz de afinidade "quem vota com quem" (`#aliancas`), ordenada por agrupamento, com os blocos e os pares extremos |
| Guia do eleitor | O que o vereador faz e não faz, o que pesquisar, ficha de pesquisa de cada vereador (presença, fiscalização, leis, homenagens, votos em temas sensíveis), voto proporcional com tabela por partido e links oficiais (TSE, TJSP, CNJ, TCE) |
| Como funciona | Metodologia e avisos de leitura |

Menu: Início, Vereadores, Votações, Casos, Quiz e "Mais" (as demais páginas). Botão de modo escuro no topo, salvo no navegador. Estilos visuais em `site/tema.css` (carregado depois de `style.css`).

## Estrutura

```
POLITICA DE TATUI/
├── README.md                    este arquivo
├── atualizar.bat                atalho para rodar a coleta no Windows
├── agentes/                     agentes automáticos (Python, só biblioteca padrão)
│   ├── comum.py                 HTTP com cache, normalização, caminhos
│   ├── coletor_vereadores.py    vereadores em exercício, legislatura, autores e fotos
│   ├── coletor_proposituras.py  proposituras (CSV oficial do SisCam)
│   ├── coletor_sessoes.py       sessões: frequência e votos nominais
│   ├── analista.py              indicadores, classificação e geração dos dados do site
│   └── orquestrador.py          roda tudo em ordem e grava log
├── .claude/agents/              agentes de IA (Claude Code)
│   ├── operador-coleta-tatui.md
│   ├── analista-politico-tatui.md
│   ├── verificador-casos-tatui.md
│   ├── designer-ui-ux-tatui.md
│   └── dev-senior-tatui.md
├── casos/
│   ├── casos.json               casos verificados (entram no site)
│   ├── apelidos.json            nomes alternativos curados (legislatura atual e anteriores)
│   └── pautas_a_verificar.json  denúncias recebidas, ainda sem verificação
├── dados/
│   ├── brutos/                  cache das páginas e CSVs baixados
│   ├── processados/             JSON limpos e indicadores (encerradas: *_2017.json, *_2021.json)
│   ├── historico/               instantâneo diário dos indicadores (versionar: não é regenerável)
│   └── logs/                    log de cada execução
├── site/                        site estático (HTML, CSS, JavaScript puro)
│   ├── index.html               (o analista só atualiza os ?v= dos scripts)
│   ├── style.css
│   ├── app.js
│   ├── dados-base.js            gerado: indicadores, vereadores, casos (carrega sempre)
│   ├── votacoes.js              gerado: votações e sessões (sob demanda, fora do git)
│   ├── proposituras.js          gerado: proposituras (sob demanda, fora do git)
│   ├── historico.js             gerado: votações de 2017-2024 (sob demanda, fora do git)
│   ├── fotos/                   gerado: fotos oficiais reduzidas
│   └── vereador/                gerado: uma página por vereador para compartilhar (Open Graph)
└── docs/
    ├── AGENTES.md               o que cada agente faz e como agendar
    ├── FONTES.md                endpoints do SisCam e formato das páginas
    ├── FORMATO-DADOS.md         formato dos arquivos de dados do site e rotas
    └── METODOLOGIA.md           como cada indicador é calculado e seus limites
```

## Documentação

- [docs/AGENTES.md](docs/AGENTES.md): agentes automáticos e agentes de IA, fluxo e agendamento.
- [docs/FONTES.md](docs/FONTES.md): de onde vêm os dados.
- [docs/METODOLOGIA.md](docs/METODOLOGIA.md): regras de cálculo e limites.
- [docs/FORMATO-DADOS.md](docs/FORMATO-DADOS.md): arquivos de dados do site, campos e rotas.

## Princípios

- Só dado público e verificável. Cada item tem link para o documento oficial.
- Linguagem neutra. O site mostra condutas documentadas e o leitor tira as conclusões.
- Denúncia de rede social só entra depois de conferida em documento oficial ou imprensa identificada.
