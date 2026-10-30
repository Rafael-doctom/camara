# Fontes de dados

## Fonte principal: SisCam (Sino Informática)

A Câmara de Tatuí publica proposituras, sessões e vereadores no SisCam:

- Portal: https://tatui.siscam.com.br (também acessível como https://consulta.siscam.com.br/camaratatui)
- Site institucional: https://camaratatui.sp.gov.br

### Endpoints usados

| Dado | URL |
|---|---|
| Vereadores em exercício | `/Vereadores` |
| Vereadores anteriores | `/Vereadores/Anteriores?Pagina={n}` (221 nomes de todas as legislaturas, 15 por página, ID e nome parlamentar mais recente, sem nome civil; liga a mesma pessoa entre legislaturas) |
| Lista de legislaturas | `/Legislaturas` |
| Legislatura (todos que exerceram mandato) | `/Legislaturas/Legislatura/{id}`: 19ª (2025-2028) = 4, 18ª (2021-2024) = 3, 17ª (2017-2020) = 2, 16ª (2013-2016) = 1 |
| Perfil de vereador | `/Vereadores/Vereador/{id}` (sem nome civil; alguns IDs do cadastro de autores dão 404) |
| Foto | `/Vereadores/Foto/{id}` (JPEG 800x1000, ~400 KB) |
| Proposituras (CSV) | `/Documentos/Exportar?tipo=2&Pesquisa=Avancada&id=80&pagina=1&Modulo=8&Documento=0&Numeracao=Documento&AnoInicial={ano}&AnoFinal={ano}&Situacao=0&Classificacao=0&TipoAutor=Todos&AutoriaId=0&NoTexto=false` |
| Consulta de uma propositura | `/Documentos/Pesquisa?...&Documento={tipo}&NumeroInicial={n}&AnoInicial={ano}&NumeroFinal={n}&AnoFinal={ano}` |
| Documento | `/Documentos/Documento/{id}` |
| PDF | `/arquivo?Id={id}` |
| Lista de sessões | `/Sessoes/Pesquisa?Classe=0&tipo=0&dataInicial=DD/MM/AAAA&dataFinal=DD/MM/AAAA&pagina={n}` (15 por página) |
| Sessão (frequência e votos) | `/Sessoes/Sessao/{id}` |

O parâmetro `tipo=2` na exportação devolve CSV em UTF-8 com BOM e separador `;`; `tipo=1` devolve PDF.

### IDs de tipo de documento

| ID | Tipo |
|---|---|
| 134 | Projeto de Lei |
| 135 | Projeto de Lei Complementar |
| 136 | Projeto de Decreto Legislativo |
| 137 | Projeto de Resolução |
| 138 | Projeto de Emenda à Lei Orgânica |
| 139 | Requerimento |
| 140 | Indicação |
| 141 | Moção |
| 1003 | Despacho Interlocutório |

### Formato da página de sessão

- Bloco "Frequências": uma entrada por chamada (`Chamada Regimental`, `Chamada Ordem do Dia`), com `Presentes (n) - NOMES` e `Ausentes (n) - NOMES`.
- Bloco "Votações": uma entrada por matéria, com Autoria, Coautoria, Assunto, Quórum, Votação (Nominal/Simbólica), Fase, grupos de voto (`A favor`, `Contra`, `Não vota`, `Ausente`, `Abstenção`) e Resultado (`Aprovado`, `NEGADO` etc.).

### Página da legislatura

Tabela com Nome (link para o perfil), Início, Término, Partido, Votos e Cargo (Titular/Suplente). Usa o nome parlamentar da época da posse (ex.: "MAURICIO COUTO" para o ID 2152, hoje "MAURICIO ENFERMEIRO"). O término nem sempre é atualizado: João Éder aparece até 31/12/2028, embora tenha deixado o exercício em outubro de 2026.

### Legislaturas encerradas (2017-2020 e 2021-2024)

Coletadas com `--legislatura 2017` ou `--legislatura 2021` em cada coletor (o orquestrador faz isso sozinho quando o arquivo não existe). Mesmos endpoints, com cache permanente: lista de sessões em `dados/brutos/sessoes_lista/<ano>/`, páginas em `dados/brutos/sessoes/`, CSVs em `dados/brutos/proposituras_<ano>.csv`, página da legislatura em `dados/brutos/legislatura_<id>.html` e `/Vereadores/Anteriores` em `dados/brutos/anteriores/`. Saída: `vereadores_<ano>.json`, `proposituras_<ano>.json` e `sessoes_<ano>.json` em `dados/processados/`.

Peculiaridades:

- **Nomes variam**: a mesma pessoa aparece com nome civil e parlamentar, às vezes na mesma sessão (chamada com nome civil e votos com nome parlamentar, fev.-abr. de 2021), e o nome parlamentar muda no meio do mandato (NILTO JOSÉ ALVES -> BISPO NILTO; MIGUEL LOPES CARDOSO JUNIOR -> PROF. MIGUEL; SEVERINO GUILHERME DA SILVA -> TIOZINHO STA RITA; ANTONIO MARCOS DE ABREU -> MARQUINHO DE ABREU; JAIRO MARTINS -> PEPINHO; MARCIO ANTONIO DE CAMARGO -> MARCIO DO SANTA RITA). O ID do SisCam não muda: o analista liga por ele (ver METODOLOGIA.md).
- **Suplentes faltando**: a página da legislatura lista os titulares e só um suplente em 2017-2020, nenhum em 2021-2024, embora vários tenham assumido (FÁBIO MENEZES, LEVI PINTO SOARES, HIAGO DAROS, LEANDRO MAGRÃO, LUZIA APARECIDA FERMINO, RODOLFO HESSEL FANGANIELLO, WLADMIR FAUSTINO SAPORITO, DIONE BATISTA). Eles entram pelas chamadas e votos e pelo ID em `/Vereadores/Anteriores`.
- **Registro incompleto**: 40 das 209 sessões de 2017-2020 (20 delas em 2017) e 10 das 309 de 2021-2024 não têm chamada nem votos. Em 2017 e 2018 os votos nominais registrados são quase só de requerimentos; os de projetos de lei aparecem pouco em 2018 e ficam regulares a partir de 2019.
- **Numeração repetida**: em 2018 o Executivo e o Legislativo numeravam projetos separadamente (há dois "Projeto de Lei Nº 56/2018"). A consulta por tipo, número e ano traz os dois.
- **Fase "Discussão Única"** aparece em projetos que exigem dois turnos (ex.: Projeto de Emenda à Lei Orgânica Nº 2/2019, em 08/09/2020). Confira na página do documento ("Documentos de Sessão").

### Problemas conhecidos nos dados do SisCam

- **Comissão no lugar de vereador**: nas chamadas e votações de 03/02 a 19/02/2025 aparece "COMISSÃO DE CONSTITUIÇÃO, JUSTIÇA E REDAÇÃO 2021 - 2022" entre os vereadores. Pelo período, é provavelmente a cadeira de PROFESSOR DUZA (suplente de 10/01 a 23/02/2025, membro da CCJ), mas isso não está documentado. O site descarta o registro e não credita presença a ninguém.
- **Nome civil sem cadastro**: "JOÃO EDER ALVES MIGUEL" (autor ID 1561, perfil 404) assina 142 proposituras de jun. a out. de 2025. Mapeado para JOÃO ÉDER em `casos/apelidos.json`.
- **Nome de comissão com vírgula**: quebrado em dois na lista separada por vírgula; os coletores juntam de volta.
- **Situação no masculino ou feminino** (APROVADO/APROVADA): o analista normaliza para exibir e contar, e guarda o original.

## Fontes complementares (manuais)

- Legislação consolidada: https://www.legislacaodigital.com.br/Tatui-SP
- Portal da Transparência da Câmara: https://transparencia.camaratatui.sp.gov.br
- Vídeos das sessões: https://www.youtube.com/@camaratatui
- Imprensa local: Diário de Tatuí, O Progresso de Tatuí, Jornal Cruzeiro, TVS+

## Ideias para próximas fontes

- Portal da Transparência da Câmara: gastos de gabinete, diárias, verbas (prioridade).
- Prefeitura: contratos e licitações citados em requerimentos.
- TSE (divulgacandcontas): doadores de campanha de cada vereador.
- TCE-SP: pareceres sobre as contas do prefeito e da Câmara.
