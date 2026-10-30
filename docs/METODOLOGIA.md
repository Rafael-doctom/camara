# Metodologia

Todas as regras estão em `agentes/analista.py`. Este documento explica o que cada número significa e onde ele pode falhar.

## Período

Legislatura 2025–2028, a partir de 01/01/2025 (`INICIO_LEGISLATURA` em `agentes/comum.py`). Indicadores, rankings, afinidade e guia do eleitor usam só esse período. As legislaturas 2017–2020 e 2021–2024 têm números próprios, à parte (ver "Legislaturas anteriores").

## Quem conta como vereador

Os vereadores em exercício e todos que constam na página da legislatura no SisCam (inclui suplentes que assumiram e titulares afastados). Nomes são comparados sem acento e em maiúsculas.

Um mesmo vereador aparece com nomes diferentes, que são unificados no nome parlamentar atual:

- **Nome civil** da página de vereadores (ex.: "JOSÉ EDUARDO MORAIS PERBELINI" → EDUARDINHO PERBELINI).
- **Nome antigo** da página da legislatura: a Câmara trocou "MAURICIO COUTO" por "MAURICIO ENFERMEIRO" em jun/2025.
- **Lista curada** `casos/apelidos.json`, para ex-vereadores cujo nome civil o SisCam não publica (ex.: "JOÃO EDER ALVES MIGUEL" → JOÃO ÉDER).

Nomes de comissão listados como se fossem vereador (ex.: "COMISSÃO DE CONSTITUIÇÃO, JUSTIÇA E REDAÇÃO 2021 - 2022", em fev/2025) são descartados das chamadas, dos votos e dos placares. Nomes que não casam com ninguém aparecem como aviso no log do analista.

## Proposituras

- **Autoria**: o vereador recebe crédito como autor ou coautor. `principal` conta só o primeiro autor listado.
- **Origem**: "Vereador(es)" se algum autor é vereador; senão "Executivo/outros" (prefeito, Mesa, comissões).
- **PL aprovado**: situação contém APROVADO/APROVADA (exceto "NÃO APROVADO"), AGUARDANDO SANÇÃO ou VETO REJEITADO.
- **Situação**: o SisCam usa masculino ou feminino conforme o tipo (APROVADO/APROVADA, PREJUDICADO/PREJUDICADA, RETIRADO/RETIRADA PELO AUTOR). Para exibir, filtrar e contar, o site usa a forma masculina; a original fica guardada em cada item (`sitOrig`) e em `geral.por_situacao_original`.

### Categorias de projeto de lei (por palavras na ementa)

| Categoria | Regra |
|---|---|
| Nome de rua/prédio | "DENOMINA", "DA DENOMINAÇÃO", "ALTERA A DENOMINAÇÃO" |
| Utilidade pública | "UTILIDADE PÚBLICA" |
| Data comemorativa/campanha | "INSTITUI O DIA/SEMANA/MÊS/CAMPANHA", "CALENDÁRIO OFICIAL", "DIA MUNICIPAL" |
| Honraria | "TÍTULO DE CIDADÃO", "MEDALHA", "HONRA", "COMENDA" |
| Política pública/norma | todo o resto |

### Categorias de moção

Pesar, Repúdio, Aplauso/congratulação, Apoio/apelo, Outras.

### Temas de requerimentos e indicações

Primeiro tema que casar, nesta ordem: Fiscalização/transparência (contrato, licitação, gasto, cópia…), Saúde, Educação, Iluminação, Asfalto/vias/trânsito, Limpeza/mato/lixo, Segurança, Água/esgoto/drenagem, Transporte público, Animais, Outros.

### Temas sensíveis

Marcados em proposituras (exceto moções e indicações) e em votações:

- Impostos e taxas: ISS, IPTU, ITBI, imposto, taxa, tributo, alíquota, planta genérica, contribuição de iluminação.
- Investigação/fiscalização do Executivo: CEI, CPI, comissão processante, cassação, sindicância, contas do prefeito, parecer prévio, TCE.
- Salários de agentes políticos: subsídio, remuneração, verba de gabinete.
- Empréstimos e créditos: operação de crédito, empréstimo, financiamento, crédito adicional/suplementar/especial.
- Patrimônio público: concessão, privatização, alienação, doação de área, desafetação, permuta, PPP.
- Orçamento: LOA, LDO, PPA, "estima a receita e fixa a despesa", "diretrizes para a elaboração".

## Sessões e presença

- Só sessões **ordinárias e extraordinárias** contam para presença. Solenes e reuniões de comissão não contam.
- O vereador conta como **presente** se aparece em "Presentes" em qualquer chamada da sessão. Conta como **ausente** se aparece só em "Ausentes".
- A Câmara não informa no SisCam se a falta foi justificada.

## Votações

- **Votação dividida**: pelo menos um voto a favor e um contra.
- **Votações listadas no site**: todas entram nos totais. A lista do site deixa de fora requerimentos, moções, indicações e atas aprovados por unanimidade, a não ser que estejam ligados a um caso documentado.
- **Identificador**: cada votação listada tem um `id` estável, `<sessão>-<documento>`, com `-2`, `-3` quando o mesmo documento é votado de novo na sessão (ex.: 1ª e 2ª discussão no mesmo dia).
- **Casos documentados**: mostram todas as votações da matéria (número exato: "Requerimento Nº 1544/2026" não casa com 15440/2026).
- **Vota com o resultado**: nas votações divididas, percentual em que o vereador votou do lado vencedor. Um percentual alto indica alinhamento com a maioria do plenário, que em geral é a base do prefeito; um baixo indica oposição frequente.
- **Afinidade**: para cada par de vereadores, percentual de votações divididas em que os dois votaram igual. Só aparece com 3 votações em comum ou mais. No perfil, "mais alinhados" e "menos alinhados" mostram até 6 nomes cada, sem repetir: com menos de 12 pares, a lista é dividida ao meio.
- **"Não vota"**: em geral é o presidente da Câmara, que só vota em caso de empate ou quórum qualificado.
- Votações simbólicas não registram voto individual.

## Rankings

Calculados no navegador (`site/app.js`, constante `RANKINGS`) a partir dos indicadores acima.

- Entram só vereadores em exercício com pelo menos 20 sessões no período (`MIN_SESSOES`).
- **Homenagens** = moções de aplauso/congratulação + PLs de nome de rua + honrarias + datas comemorativas.
- **Proporção de homenagens** = homenagens ÷ total de proposituras do vereador.
- **Vota com o lado vencedor** exige pelo menos 10 votações divididas.
- **Ausências na hora do voto** conta votações nominais em que o vereador consta como "Ausente", mesmo que tenha assinado a chamada da sessão.

## Guia do eleitor

- **Ficha de pesquisa**: reúne os indicadores do vereador e lista as votações nominais em temas sensíveis. Divididas aparecem primeiro; pareceres de comissão ficam de fora.
- **Tabela por partido**: partido atual informado pela Câmara; média de "vota com o lado vencedor" só entre vereadores com 10 votações divididas ou mais.

## Legislaturas anteriores

Mesmas regras de presença, proposituras, votos, votação dividida, "vota com o resultado" e dedupe de votações repetidas na sessão, aplicadas separadamente a cada legislatura encerrada (`LEGISLATURAS_FECHADAS` em `comum.py`). Não há afinidade nem ranking para elas.

- **Quem entra**: quem consta na página da legislatura ou aparece em alguma chamada ou voto do período (inclui suplentes que o SisCam não lista na página).
- **Mesma pessoa em legislaturas diferentes**: cada nome é ligado a um ID do SisCam, nesta ordem de confiança: página da própria legislatura; vereadores atuais (nome e nome civil); páginas das outras legislaturas; `apelidos_anteriores` em `casos/apelidos.json` (curado, com evidência); `/Vereadores/Anteriores`; cadastro de autores quando o ID do autor é o de um vereador. A chave é a do perfil atual para quem está em 2025–2028 (MAURICIO COUTO em 2021 vira MAURICIO ENFERMEIRO) e o nome parlamentar mais recente para os demais (JAIRO MARTINS vira PEPINHO; EDUARDO DADE SALLUM vira EDUARDO SALLUM). Nome sem ID aparece como aviso no log.
- **Votações listadas** (`historico.js`): divididas, negadas, com abstenção, em temas sensíveis, ligadas a casos, e todas as de projetos de lei, de lei complementar, de emenda à Lei Orgânica e de emendas a projetos; sempre com os nomes por voto. As demais entram só nos totais.
- **Partido**: o da posse, da página da legislatura; vazio para suplentes que a página não lista.
- **Limite**: o registro do SisCam é incompleto em 2017–2018 (ver FONTES.md). Presença e "vota com o resultado" desse período cobrem só as sessões e votações registradas.

## Histórico

A cada execução, o analista grava `dados/historico/AAAA-MM-DD.json` com os indicadores de cada vereador naquele dia (presença, proposituras por tipo, PLs, votos, alinhamento) e os totais gerais. Uma segunda execução no mesmo dia sobrescreve o arquivo. Esses arquivos não podem ser regenerados depois: ficam versionados no git.

## Limites conhecidos

- A classificação por palavras-chave erra em ementas ambíguas. O link oficial de cada item permite conferir.
- Pareceres de comissão também são votados: um mesmo projeto pode gerar três ou quatro votações (pareceres + projeto).
- Número de proposituras mede volume, não qualidade. Requerimento repetido conta várias vezes.
- O SisCam pode mudar de layout. Se um número zerar de repente, acione o agente `operador-coleta-tatui`.

## Painel ideológico: posição dos políticos nos eixos

O teste (`site/espectro.html`) compara as respostas do visitante com votos reais. A posição de um político num eixo vem só das votações nominais classificadas à mão em `casos/<cidade>/eixos.json`:

- Cada votação classificada tem um eixo e o polo para onde o voto **a favor** puxa. Voto a favor vale +1 para esse polo; voto contra vale +1 para o polo oposto. Abstenção, ausência e "não vota" não contam.
- A posição no eixo é a média dos votos (de -1 a +1). Entram só os vereadores em exercício.
- Só entra votação em que o texto da matéria deixa claro o sentido do voto no tema. Votações explicadas pelo alinhamento partidário ficam de fora (exemplo no próprio arquivo).
- Semelhança com o visitante: média da distância nos eixos em que os dois têm posição, convertida para 0-100%. O destaque mostra primeiro quem tem pelo menos 3 votos em 2 eixos.

Limites: há poucas votações por eixo, e vários eixos ainda não têm nenhuma. Moções de repúdio ou aplauso medem o que o vereador apoia publicamente, não o que fez como legislador. O resultado é uma pista, não um retrato da atuação.

Arquivos: o analista grava `dados/<cidade>/processados/espectro.json` e junta todas as cidades (e `dados/_politicos/*.json`, se houver) em `site/politicos.js`.
