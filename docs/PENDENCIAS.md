# Pendências e referências

Pedidos do dono do projeto e as referências enviadas (Hub Político), com o que já foi feito e o que falta. Atualize ao concluir cada item.

## Referências enviadas

| Link | O que mostra | Como entra no Olho na Câmara |
|---|---|---|
| https://hubpolitico.com.br/inteligencia/teste-politico | Página de entrada do teste político | `site/espectro.html#inicio` (feito) |
| https://hubpolitico.com.br/inteligencia/teste-politico/comecar | Escolha do tamanho do teste | `#comecar` (feito) |
| https://hubpolitico.com.br/inteligencia/teste-politico/eixos/costumes | Página de um eixo, com os políticos posicionados por foto | `#eixo/costumes` com a régua de fotos e as votações usadas (feito para vereadores) |
| https://hubpolitico.com.br/inteligencia/teste-politico/eixos/ambiental | Outro eixo, mesmo modelo | `#eixo/ambiente` (página feita; ainda sem votações classificadas) |
| https://hubpolitico.com.br/perfil/cezinhademadureira | Perfil de um deputado federal: foto, partido, posição nos eixos, votos | Perfil do vereador já existe em `site/<cidade>/#vereador/...`; falta a seção de eixos no perfil e os perfis de deputados |
| https://hubpolitico.com.br/perfil/cezinhademadureira/mapa/2026?... | Mapa de votos do candidato por bairro e município | A fazer: mapa de votação por bairro (dados do TSE) |
| https://hubpolitico.com.br/eleicoes/2026/apuracao/sp/deputado-federal/candidato/cezinhademadureira | Apuração de um candidato | A fazer: páginas de resultado eleitoral (TSE) |
| https://hubpolitico.com.br/eleicoes/2026/apuracao/sp/deputado-federal/candidato/cezinhademadureira/cidades | Votos do candidato por cidade | A fazer: votos por cidade (TSE) |
| https://hubpolitico.com.br/inteligencia/relatorios/eleicao-2026/quociente-eleitoral/sp/deputado-federal | Quociente eleitoral por partido | A fazer: relatório de quociente (TSE). O Guia do eleitor já explica o cálculo |

## Pedidos

1. **Várias cidades, começando por Itapetininga, Cerquilho e Iperó.** Estrutura pronta (`cidades/`, `--cidade`, página de entrada). Falta criar `cidades/<slug>.json` de cada uma e coletar. Passo a passo em `docs/AGENTES.md` ("Adicionar uma cidade").
2. **Painel ideológico com fotos dos políticos parecidos com o usuário.** Feito para os vereadores de Tatuí: resultado com "Políticos que votaram parecido com você" e régua de fotos em cada eixo. Base: votações classificadas em `casos/<cidade>/eixos.json` (ver `docs/METODOLOGIA.md`). Falta:
   - classificar mais votações (hoje: Costumes 4, Religião 1, Impostos 1, Participação 1; Economia, Segurança, Meio ambiente e Serviços públicos sem nenhuma);
   - deputados federais e estaduais e senadores: votos nominais nos dados abertos da Câmara dos Deputados (https://dadosabertos.camara.leg.br), da Alesp e do Senado, gravados em `dados/_politicos/<fonte>.json` no mesmo formato de `espectro.json`. O analista já junta esses arquivos em `site/politicos.js`;
   - seção "Posição nos eixos" no perfil de cada vereador.
3. **Dados eleitorais (mapa por bairro, votos por cidade, apuração, quociente).** Fonte: repositório de dados eleitorais do TSE (https://dadosabertos.tse.jus.br): candidatos, votação por seção ou zona e locais de votação com coordenadas.

## Bloqueio atual

O ambiente de nuvem onde o Claude trabalha não alcança `*.siscam.com.br`, `dadosabertos.camara.leg.br`, `al.sp.gov.br`, `legis.senado.leg.br`, `dadosabertos.tse.jus.br` nem `hubpolitico.com.br`. Para destravar, libere esses domínios no acesso à rede do ambiente (https://code.claude.com/docs/en/cloud-environments#network-access) ou rode a coleta no computador.
