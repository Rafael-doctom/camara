# Olho na Câmara de Tatuí

Observatório independente da Câmara Municipal da Estância Turística de Tatuí (SP). Ele mostra o que cada vereador propõe, como vota, quanto comparece às sessões e os casos relevantes documentados. Tudo vem de dados públicos oficiais, coletados por agentes automáticos.

## Como usar

1. Abra `site/index.html` no navegador. Não precisa de servidor. Para publicar, copie a pasta `site/` inteira para qualquer hospedagem estática.
2. Para atualizar os dados, dê dois cliques em `atualizar.bat` ou rode:
   ```
   python agentes/orquestrador.py
   ```
   Para só regenerar o site com os dados já baixados:
   ```
   python agentes/orquestrador.py --so-site
   ```
   As legislaturas encerradas (2017-2020 e 2021-2024) são coletadas uma vez só, quando o arquivo delas em `dados/processados/` não existe; para coletar de novo, use `--historico`.
   Código de saída: 0 ok; 1 falha de coleta; 2 checagem de sanidade (total caiu mais de 5% ou não há 17 vereadores em exercício). Nos casos 1 e 2 os dados anteriores ficam intactos e o site é gerado com eles. Se a queda for real, rode com `--forcar`.
3. Ao publicar, defina a variável de ambiente `OLHO_URL_SITE` (ex.: `https://exemplo.org`) antes de gerar o site, para o Open Graph das páginas de vereador usar URLs absolutas.

Requisitos: Python 3.10 ou mais novo. Usa só a biblioteca padrão; não há `pip install`.

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
