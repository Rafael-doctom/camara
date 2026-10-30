# Agentes

O projeto tem dois tipos de agente:

- **Agentes automáticos** (`agentes/*.py`): scripts Python que coletam e processam dados sem intervenção. Rodam por agendamento.
- **Agentes de IA** (`.claude/agents/*.md`): subagentes do Claude Code para tarefas que pedem julgamento: consertar coletor, analisar, verificar denúncias.

## Fluxo

```
SisCam (tatui.siscam.com.br)
   │
   ├─► coletor_vereadores.py   ─► dados/processados/vereadores.json + site/fotos/
   ├─► coletor_proposituras.py ─► dados/processados/proposituras.json
   └─► coletor_sessoes.py      ─► dados/processados/sessoes.json
                                        │
casos/casos.json (verificador-casos) ──┤
casos/apelidos.json (curado) ──────────┤
                                        ▼
                                  analista.py ─► site/dados-base.js, votacoes.js, proposituras.js
                                              ─► site/vereador/<slug>.html, ?v= no site/index.html
                                              ─► dados/processados/indicadores.json
                                              ─► dados/historico/AAAA-MM-DD.json
```

`orquestrador.py` roda os quatro scripts nessa ordem e grava o log em `dados/logs/`. Se um coletor falha, o analista roda mesmo assim com os últimos dados bons, e o orquestrador sai com o maior código de erro.

## Proteções contra dados ruins

- **Validação antes do cache**: cada download tem um validador (página do SisCam com conteúdo, cabeçalho do CSV, página de sessão). Página de erro nunca é gravada no cache e conta como falha.
- **Gravação atômica**: JSON, arquivos do site e fotos são escritos em `.tmp` e trocados com `os.replace`. Um processo interrompido não deixa arquivo pela metade.
- **Sanidade** (`checar_sanidade` em `comum.py`): antes de sobrescrever, cada coletor compara com o arquivo anterior. Se algum total cair abaixo de 95%, ou se não houver 17 vereadores em exercício, sai com código 2 e não grava. `--forcar` ignora a regra quando a queda é real.
- **Sessões que falham**: o coletor usa a versão anterior delas, grava o resto e sai com código 1.
- **Layout mudou**: se menos da metade das sessões tiver chamadas ou votações, ou o CSV vier sem as colunas esperadas, o coletor aborta.
- **Avisos do analista**: nomes que não casam com nenhum vereador e comissões ignoradas aparecem no log.

## Agentes automáticos

### coletor_vereadores.py
- Lê `https://tatui.siscam.com.br/Vereadores`: nome parlamentar, nome civil, partido, e-mail e ID. Exige 17 vereadores.
- Lê `/Legislaturas/Legislatura/4`: todos que exerceram mandato na legislatura, com início, término, partido da eleição, votos e cargo (titular ou suplente). Assim acha quem saiu no meio do mandato (ex.: João Éder, substituído por Luzia Fermino; João JJ e Professor Duza, antes de Luiz Ricardo Trevisano).
- Lê o campo "Autoria" do formulário de pesquisa para mapear nome e ID de todos os autores.
- Baixa as fotos para `dados/brutos/fotos/` (cache de 30 dias) e grava em `site/fotos/<id>.jpg` uma versão de 320 px (System.Drawing do Windows via PowerShell; sem ele, copia o original).
- Cache: 1 dia (páginas), 7 dias (formulário de pesquisa).

### coletor_proposituras.py
- Usa a exportação CSV oficial do SisCam, um arquivo por ano, com todos os tipos de propositura.
- Colunas: Documento, Numero, Ano, Data, Ementa, Autoria, Situação, Protocolo, Classificacao.
- Não grava links: o site monta o link de consulta exata a partir de tipo, número e ano.
- Cache: 12 horas no ano corrente; 30 dias para anos anteriores.
- Anos específicos: `python agentes/coletor_proposituras.py 2021 2022 2023 2024`.

### coletor_sessoes.py
- Pagina `Sessoes/Pesquisa` desde o início da legislatura (`INICIO_LEGISLATURA` em `comum.py`).
- Para cada sessão extrai as chamadas (presentes e ausentes) e as votações: matéria, autoria e coautoria, assunto, quórum, tipo de votação, fase, voto nominal por vereador e resultado.
- Cache permanente para sessões antigas. Sessões dos últimos 30 dias (e as novas) usam cache de no máximo 12 horas, porque a Câmara corrige votos depois.
- Junta de volta nomes de comissão que têm vírgula ("COMISSÃO DE CONSTITUIÇÃO, JUSTIÇA E REDAÇÃO").

### analista.py
- Classifica projetos de lei, moções e pedidos (ver METODOLOGIA.md).
- Calcula por vereador: proposituras, PLs aprovados, presença, votos, alinhamento com o resultado e afinidade com cada colega.
- Marca temas sensíveis: impostos, CEI/CPI, salários, empréstimos, patrimônio, orçamento.
- Anexa a cada caso de `casos/casos.json` todas as votações oficiais da matéria.
- Unifica nomes: nome civil (página de vereadores), nome antigo (página da legislatura) e `casos/apelidos.json` (curado) apontam para o nome parlamentar.
- Gera os arquivos do site (formato em FORMATO-DADOS.md), as páginas `site/vereador/<slug>.html`, o `?v=` do `index.html`, `dados/processados/indicadores.json` e o instantâneo diário `dados/historico/AAAA-MM-DD.json`.

## Agentes de IA (Claude Code)

Ficam em `.claude/agents/` e aparecem automaticamente no Claude Code aberto nesta pasta.

| Agente | Quando usar |
|---|---|
| `operador-coleta-tatui` | "Atualize os dados", coleta falhou, número estranho, SisCam mudou o layout |
| `analista-politico-tatui` | Perguntas sobre vereadores, votos e projetos; relatórios em `relatorios/` |
| `verificador-casos-tatui` | Chegou um link, print ou boato: confere no SisCam e na imprensa e cadastra em `casos/casos.json` se for comprovado |
| `designer-ui-ux-tatui` | Revisar e melhorar visual, navegação, clareza e uso no celular do site (implementa as mudanças) |
| `dev-senior-tatui` | Arquitetura, novas funcionalidades e fontes de dados, bugs, desempenho, segurança, preparo para publicação |

Exemplos de pedido no Claude Code:
- "Use o verificador-casos-tatui com este print: ..."
- "Analista, quem votou a favor de aumento de imposto em 2026?"
- "Operador, rode a coleta e me diga quantas votações divididas houve no mês."

## Agendamento no Windows

Para atualizar todo dia às 7h:

1. Abra o **Agendador de Tarefas** e escolha **Criar Tarefa Básica**.
2. Gatilho: Diariamente, 07:00.
3. Ação: Iniciar um programa: `E:\DOCUMENTOS OF\POLITICA DE TATUI\atualizar.bat`.

Ou pelo terminal (PowerShell):

```powershell
schtasks /Create /TN "OlhoNaCamaraTatui" /SC DAILY /ST 07:00 /TR "\"E:\DOCUMENTOS OF\POLITICA DE TATUI\atualizar.bat\""
```

## Boas práticas de coleta

- Pausa de 1 segundo entre requisições (`PAUSA_ENTRE_REQUISICOES`). Não reduzir.
- User-Agent identifica o projeto como pesquisa cívica.
- Cache local evita baixar de novo o que não muda.
- Para incluir um apelido em `casos/apelidos.json`, confira no SisCam e registre a evidência no próprio arquivo.

## Adicionar uma cidade

Qualquer Câmara que publique no SisCam entra no site sem mudar código. Itapetininga, Cerquilho e Iperó já estão em `cidades/_site.json` (campo `ordem`) e entram assim que tiverem o arquivo de configuração.

1. Crie `cidades/<slug>.json` copiando `cidades/tatui.json`. O slug usa só letras minúsculas, números e hífen (ex.: `itapetininga`).
2. Preencha os campos conferindo no SisCam da cidade (`https://<cidade>.siscam.com.br`):
   - `nome`, `camara`, `site_camara`, `siscam` (endereço do SisCam, sem barra no fim) e `cadeiras` (vereadores em exercício).
   - `modulo_documentos` e `modulo`: abra Documentos > Pesquisa avançada e copie os parâmetros `id=` e `Modulo=` da URL.
   - `tipos_documento`: o valor de cada opção do campo "Documento" do mesmo formulário (nome igual ao do CSV exportado -> ID).
   - `legislatura_atual` e `legislaturas_anteriores`: o `{id}` de cada uma em `/Legislaturas`, com início e fim. Sem a página de legislaturas, use `"id": null`.
   - `coletar_anteriores`: `true` para coletar também as legislaturas encerradas (demora mais na primeira vez).
   - `folga_lista_exercicio`: quantos nomes a mais a lista `/Vereadores` costuma ter (titulares afastados). Normalmente 0.
   - `links` (opcional): `[título, URL, descrição]` de portais de transparência e vídeos da Câmara.
3. Crie `casos/<slug>/` com `casos.json` e `apelidos.json` (podem começar como `[]` e `{"apelidos": {}}`).
4. Rode só a nova cidade: `python agentes/orquestrador.py --cidade <slug>`.
5. Confira no log o número de vereadores em exercício e os avisos de "nomes sem perfil" (resolva com apelidos). A página da cidade fica em `site/<slug>/index.html`, e a entrada `site/index.html` ganha o cartão dela.

Sem `--cidade`, o orquestrador roda todas as cidades com configuração, na ordem de `_site.json`. A entrada só lista cidades que já têm dados processados.
