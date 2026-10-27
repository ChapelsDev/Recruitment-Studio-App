# Melhorias autorizadas — 26 de outubro de 2026

Objetivo: implementar e testar individualmente os pontos 1–8, 10 e 12–14 da análise. Os pontos 9 (associar marcas/modelos a clientes), 11 (operações/criação em lote) e 15 (otimizações de escala) estão excluídos.

## Implementação e testes automáticos

- [x] 1. Estado de gravação visível no telemóvel; erro persistente com recuperação; nomes acessíveis; foco contido/restaurado nas janelas; pausa do vídeo por teclado.
- [x] 2. Cópia global versionada de anúncios, marcas, modelos e recursos, com histórico/reciclagem opcionais; data da cópia, espaço e persistência; pré-visualização e restauro seguro.
- [x] 3. Pré-visualização recolhível durante edição móvel e painel ajustável no computador.
- [x] 4. Ficha comum de salário, vagas, localização pública e início; escolha de visibilidade por peça; aviso de textos personalizados desatualizados sem os substituir.
- [x] 5. Carrosséis editáveis: reordenar, ocultar, dividir/juntar, chamada, fotografia por página, composições consistentes e tratamento de imagem.
- [x] 6. Navegação temporal e por momentos do vídeo; escolher fotograma e chamada curta para a capa exportada.
- [x] 7. Comparação de formatos, enquadramentos por formato, legibilidade absoluta e zonas de segurança no vídeo.
- [x] 8. Biblioteca local de blocos/traduções aprovadas por cliente/profissão; sugestões exatas; aprovação contextual; ampliar cobertura dos textos prontos.
- [x] 10. Recursos com nomes, descrições, pesquisa, etiquetas, favoritos, utilização, duplicados e resultado detalhado da importação.
- [x] 12. Planeamento local com datas, canais, línguas publicadas, ligações e encerramento; listas de tarefas ao abrir.
- [x] 13. Estado offline da aplicação e fotografias, progresso, preparação explícita e repetição de falhas.
- [x] 14. Deteção de edição concorrente; continuar nesta janela, recarregar ou guardar cópia; impedir substituição silenciosa.

Cada ponto recebe testes adequados após a implementação, antes do seguinte. A conclusão global requer testes de integração, documentação e revisão no navegador em computador e telemóvel. Não publicar nem adicionar serviços externos.

Os vistos acima representam implementação e testes automáticos. Não representam
aprovação visual ou validação em aparelhos físicos.

## Validação final

- [x] Suite completa final: **237 testes passaram**, sem falhas, cancelamentos ou omissões.
- [x] Sintaxe verificada nos 38 ficheiros JavaScript da aplicação e do service worker,
  mais o novo controlo manual `tests/browser/offline-control.js`.
- [x] Referências locais do HTML incluídas na cache; versão final
  **recruitment-studio-v25**, com abertura real sem acesso ao servidor.
- [x] Instruções de utilização atualizadas em `LEIA-ME.md`.
- [x] Interface revista a 1440 × 900, 390 × 844 e 360 × 740, nos dois temas,
  incluindo teclado, foco, janelas sobrepostas, mensagens e campos longos.
  São dimensões do navegador de computador; não são aparelhos móveis físicos.
- [x] Ficheiros realmente exportados conferidos: enquadramentos, oferta comum,
  carrosséis personalizados, capas e pacote completo em PT/FR. Áudio verificado
  por descodificação e medição do sinal; audição humana continua por fazer.
- [x] Aplicação e recursos abertos com o servidor da origem desligado; falhas,
  contagem, progresso e retoma exercitados com o service worker real.
- [x] Mesmo anúncio em duas páginas reais independentes do navegador, no mesmo
  perfil: suspensão, recarregar, cópia, continuar e sair sem guardar, com
  confirmação das versões preservadas. Foram separadores, não janelas do sistema.

O acesso normal à origem autorizada funcionou nesta continuação. Não foi alterada
a política do navegador nem usada outra origem, navegador ou CDP. A causa da recusa
anterior continua desconhecida. O servidor terminou **desligado**, sem publicação
ou commits. Resultados e limites detalhados em [Validação real desta continuação](#validação-real-desta-continuação).

## Diagnóstico anterior do bloqueio — registo histórico

Os parágrafos seguintes conservam o diagnóstico da sessão anterior. O bloqueio
neles descrito não se reproduziu nesta continuação.

Bloqueio: o acesso automatizado à origem de teste `http://127.0.0.1:18973`
foi recusado pelo controlo de permissões do navegador. O utilizador autorizou
os dados fictícios e o acesso no chat, mas a ferramenta continuou a indicar uma
permissão guardada ou política de bloqueio. Não foi usado outro navegador ou
endereço para contornar a recusa. É necessário remover esse bloqueio antes de
terminar os ensaios visuais. Os testes de interface usam DOM simulado; os testes
de cache não equivalem a uma abertura real sem rede.

Revalidação: a mudança do ambiente de execução para acesso completo não removeu
a recusa. Uma nova tentativa na mesma origem voltou a ser rejeitada. Segundo a
[documentação oficial do navegador](https://learn.chatgpt.com/docs/browser?surface=app),
as regras por sítio são geridas em **Definições → Navegador → Permissões do agente**;
remover a regra personalizada repõe as permissões predefinidas. Foi pedido ao
utilizador que remova a recusa apenas da origem de teste. Se o controlo estiver
bloqueado por uma política da organização, a alteração depende do administrador.

O utilizador confirmou depois que alterou a regra desse endereço. A tentativa
seguinte, na mesma origem, voltou a ser recusada com a indicação de permissão
guardada ou política. Não foi possível determinar qual controlo está a prevalecer.
O servidor de teste foi encerrado. O objetivo fica bloqueado, com os quatro
ensaios finais acima ainda por concluir; não foi declarado concluído.

Diagnóstico posterior, após reinício e captura das definições fornecida pelo
utilizador:

- A captura mostra **Navegação: Permitir sempre** tanto por omissão como para
  a origem exata `http://127.0.0.1:18973`.
- A configuração do utilizador contém agora
  `[browser_use.origins."http://127.0.0.1:18973"]` com `access = "allow"`.
- Não existem os ficheiros locais `%ProgramData%\OpenAI\Codex\requirements.toml`
  e `~/.codex/managed_config.toml` nas localizações documentadas para Windows.
- Uma consulta de diagnóstico, apenas de leitura, pela API pública da CLI
  confirmou essa regra em `config/read` e devolveu `requirements: null` em
  `configRequirements/read`. Esta consulta arrancou um processo temporário;
  não prova o estado interno da instância do navegador integrado. O processo
  terminou após a leitura, sem iniciar conversas nem alterar configurações.
- A última tentativa de abrir a mesma origem pelo navegador integrado voltou
  a ser rejeitada antes da navegação. A ferramenta não identifica a regra ou
  a origem da política que está a prevalecer. Os ensaios visuais mantêm-se pendentes.

Referências do diagnóstico:
[configuração gerida](https://learn.chatgpt.com/docs/enterprise/managed-configuration)
e [consulta de configuração pela API](https://learn.chatgpt.com/docs/app-server).

## Evidência de validação

Estado inicial: aplicação sem alterações desta implementação; 180 testes existentes na análise anterior. Revalidar os testes ao aplicar cada ponto.

Esta secção conserva a evolução original. As menções a validação visual pendente
descrevem o estado nessa altura; os resultados atuais estão na secção seguinte.

- Ponto 1: implementado; 183 testes automáticos passaram (incluindo gravação falhada, foco em janelas sobrepostas e pausa do vídeo). Confirmação visual pendente: o acesso ao navegador de teste está bloqueado por uma permissão guardada, apesar da autorização no chat.
- Ponto 2: implementado; 189 testes automáticos passaram, incluindo o fluxo de exportação cancelada, pré-visualização sem escrita e restauro de cópias com atualização do ecrã inicial. Cobertura de dados: transferência integral, histórico/reciclagem opcionais, correspondências, recuperação da versão substituída, ficheiros inválidos, alterações concorrentes, reversão por falta de espaço e estado de persistência. Confirmação visual pendente pelo mesmo bloqueio de permissões.
- Ponto 3: implementado; os 18 testes da interface passaram, incluindo recolher/mostrar a pré-visualização sem alterar o anúncio, editar enquanto recolhida, manter a preferência ao reabrir e redimensionar o painel com ponteiro/teclado dentro dos limites. Os restantes 173 testes passaram na execução conjunta; as duas falhas de sincronização dos novos testes foram corrigidas e revalidadas na suite da interface. Confirmação visual pendente.
- Ponto 4: implementado; 88 testes específicos passaram. A suite global passou 196 de 197; o teste novo estava a clicar no seletor Imagem em vez de Fechar na exportação. Corrigido o seletor, esse teste passou também. Cobertura: migração, visibilidade independente por peça, rótulos nas sete línguas, estilos de vídeo antigos e receitas, preservação dos textos editáveis, avisos/confirmação por língua, alterações de contactos e marca. Confirmação visual pendente.
- Ponto 5: implementado; suite completa: 204 testes passaram. Inclui edição da interface, ordenar/ocultar/dividir/juntar, fotografias independentes, três composições, paginação integral em dois formatos, avisos após alterações da oferta/contactos, importação .anuncio, cópia global e retenção dos recursos pelo histórico. Confirmação visual pendente pelo bloqueio do navegador.
- Ponto 6: implementado; suite completa: 209 testes passaram. Inclui navegação por instante/momento, pausa ao deslocar, som a partir do instante escolhido, capa por língua com chamada, normalização para fotogramas de 30 fps e exportação da capa real no pacote. Confirmação visual pendente pelo mesmo bloqueio.
- Ponto 7: implementado; 212 testes passaram na suite completa e o novo teste da interface passou após corrigir os dados iniciais da própria prova (a fotografia era introduzida depois de carregar a lista). Cobertura: três formatos, enquadramentos independentes/herdados, copiar/repor, exportação com o enquadramento escolhido, normalização e legibilidade medida apenas no texto efetivamente desenhado. Zonas de segurança do vídeo são uma sobreposição de revisão, sem entrar nos ficheiros. Confirmação visual pendente.
- Ponto 8: implementado; suite completa: 219 testes passaram. Cobertura: biblioteca pesquisável por cliente/profissão, aprovação vinculada ao texto exato, sugestões contextuais, inserção por língua com revisão explícita no anúncio, transferência/restauro global e textos prontos completos em IT/ES para as 15 profissões. Os testes confirmam a cobertura e preservação dos textos personalizados; os textos de base continuam sujeitos a revisão na oferta concreta. Confirmação visual pendente.
- Ponto 10: implementado; suite completa: 222 testes passaram. Cobertura: nomes/descrições/etiquetas/favoritos, pesquisa, utilização em anúncios atuais/históricos/reciclagem/modelos, duplicados pelo conteúdo, importações e alterações de metadados concorrentes, resultados por ficheiro, cancelamento do seletor e transferência em .anuncio/cópia global. Confirmação visual pendente.
- Ponto 12: implementado; suite completa: 227 testes passaram. Cobertura: datas/canais e publicação independente por língua, ligações seguras, tarefas por fazer/rever/encerrar, alterações depois da publicação, encerramento manual, projetos duplicados/modelos sem registos herdados, proteção de gravação desatualizada e transporte/restauro sem falsos avisos por mudança dos identificadores dos recursos. Confirmação visual pendente.
- Ponto 13: implementado; suite completa: 231 testes passaram. Cobertura: estado baseado na cache ativa, aplicação/fotografias separadas, progresso, falha e retoma só dos recursos em falta, preservação de caches de outras aplicações, remoção de recursos refletida no estado, ponte de mensagens e apresentação/repetição na interface. A abertura real sem rede continua pendente do acesso ao navegador.
- Ponto 14: implementado; suite completa: 236 testes passaram. Cobertura: reserva de edição atómica, revisão obrigatória antes de gravar, expiração e passagem explícita entre janelas, histórico da versão substituída, recarregar/cópia independente, saída com confirmação sem substituir dados, proteção após restauro global e reciclagem. As reservas não são exportadas nas cópias globais e não invalidam a pré-visualização de um restauro. O teste com duas janelas reais continua pendente pelo mesmo bloqueio.

## Validação real desta continuação

Realizada em 26 de outubro de 2026, exclusivamente em
`http://127.0.0.1:18973`, com anúncios fictícios identificados por `TESTE QA 26-10`.
Antes de alterar o código, foram lidos os ficheiros atuais e repetidos os 236
testes e a verificação de sintaxe. As alterações anteriores foram preservadas.
Os pontos 9, 11 e 15 continuam excluídos.

### Correções encontradas no navegador

| Problema observado | Correção e confirmação |
| --- | --- |
| Comparar formatos e zonas do vídeo tinham pouco contraste no fundo escuro da pré-visualização, com o tema claro. | Botões com a variante visual adequada; revistos nos dois temas. |
| A 360 px, a barra de formatos e os dois avisos de texto ocupavam várias linhas e comprimiam excessivamente o cartaz. | Espaçamentos mais compactos até 380 px; cartaz passou de cerca de 80 para 154 px de altura no caso ensaiado, sem esconder os controlos. |
| Campos da capa, carrossel, pesquisa e bibliotecas podiam aparecer com o aspeto nativo, sem o tratamento dos restantes campos. | Tipos de campo explícitos na capa/carrossel e estilos para pesquisa e texto sem tipo declarado. Nome do anúncio preserva o seu estilo próprio; conferidos 18 px no móvel e 21 px no computador. |
| Abrir Escolher capa imediatamente após entrar em Vídeo podia fixar a sequência provisória de 17 s, antes de carregar as fotografias; a sequência completa tinha 22 s. | A escolha aguarda imagens e preparação correspondentes ao anúncio atual. Recursos de uma preparação anterior não são reutilizados como se fossem atuais. Teste de regressão falhou antes e passou depois; no navegador o botão começou desativado, abriu depois a sequência de 22 s e exportou o PNG real. |

Foi também corrigida uma espera no teste de recarregar a versão guardada: durante
a renderização o botão podia ainda não existir. A espera agora verifica a sua
existência, sem alterar o comportamento da aplicação.

### Interface e interação

As seis combinações de dimensão/tema foram revistas e capturadas novamente na
versão v25. Nomes longos mantêm reticências; não se observou deslocamento horizontal
do documento. O estado Guardado permanece visível nos dois tamanhos móveis.

- Painel do computador ajustado por teclado, com foco visível.
- Pré-visualização recolhida/reaberta no móvel, editando o campo entretanto sem
  perder o conteúdo; navegação por Tab, Shift+Tab, Enter, Escape, Home e End.
- Vídeo pausado/retomado por Space, zonas de segurança e navegação por momentos.
- Janela de exportação com confirmação Regenerar sobreposta: Tab e Shift+Tab
  ficaram na confirmação; Escape fechou só a confirmação e devolveu o foco.
- Comparação de formatos, controlos de enquadramento e formulários de capa e
  carrossel revistos nos tamanhos móveis.

Capturas em [tests/evidence/2026-10-26](tests/evidence/2026-10-26), incluindo
`desktop-{light,dark}-final.png`, `mobile-{360,390}-{light,dark}-final.png`,
`nested-dialog-390-light.png` e `cover-form-360-dark-fixed.png`.

### Exportações efetivas

Foi usado `tests/browser/visual.html`, que só substitui Guardar como por uma ligação
de descarga. Os ficheiros descarregados foram copiados para a pasta de evidências,
extraídos, inspecionados e comparados com as escolhas feitas na interface.

- `imagens-pt-fr.zip`: seis PNGs, 1080 × 1080, 1080 × 1350 e 1080 × 1920 por
  língua; posições horizontais distintas por formato. Salário, 12 vagas,
  localização e data de início aparecem na ficha comum, com rótulos PT/FR.
- `carrossel-retrato.zip` e `carrossel-quadrado.zip`: quatro páginas PT e cinco FR,
  respetivamente 1080 × 1350 e 1080 × 1080. Confirmados chamada personalizada,
  reordenação, ocultação, dividir/juntar, fotografia independente e composição
  lado a lado. A versão FR conserva a sua sequência própria.
- `capa-pt.png` e `capa-fr.png`: instantes 7,8 s e 0,8 s, chamada em baixo/em cima.
  As capas do pacote correspondem visualmente aos fotogramas dos vídeos. O valor
  1877 € no instante PT é uma fase da animação que termina em 1900 €, não o valor
  final da oferta. Deve escolher-se um instante posterior para uma capa com o
  contador já estabilizado. Após corrigir a preparação foi descarregada e revista
  outra capa, `capa-pt-readiness-fixed.png`.
- `campanha-pt-fr.zip`: 22 ficheiros, incluindo manifesto e instruções. As 20
  entradas do manifesto têm os tamanhos declarados. Inclui feed, story, capa,
  carrossel, publicação e vídeo por língua, mais projeto `.anuncio` v2 com 16
  recursos. O texto de publicação PT personalizado foi preservado exatamente.
- Os dois MP4 têm H.264 a 1080 × 1920 durante 22 s e AAC estéreo a 48 kHz durante
  22,016 s. Descodificação sem erros, sinal não silencioso, média −20,7 dB e pico
  −0,3 dB. Não foi feita apreciação auditiva humana da música/sincronização.
- Os avisos de contactos fictícios, textos FR por rever, texto pequeno e conteúdo
  omitido pelo estilo Néon foram apresentados; não foram tratados como aprovações
  editoriais de um anúncio real.

Foram conferidas as dimensões de 39 PNGs extraídos. Evidência:
`export-validation.json`, `images-contact-sheet.png`, `carrossel-contact-sheet.png`,
`carrossel-square-contact-sheet.png`, `covers-contact-sheet.png` e `audio-*.log`.
Os pacotes completos foram produzidos antes da correção de abertura antecipada
da capa; a exportação adicional confirma esse caminho depois da correção.

### Offline, falha e retoma reais

O `sw.js` real esteve ativo durante todos os ensaios. Não houve substituição de
fetch, Cache API, IndexedDB ou mensagens do worker por simulações.

1. Preparação observada até 63/63 fotografias, com 51/51 recursos da aplicação.
2. Servidor desligado e ausência de escuta na porta 18973 confirmada. O controlo
   manual `tests/browser/offline-control.html` retirou apenas duas fotografias
   descarregáveis da cache da origem autorizada.
3. A aplicação mostrou 61/63 e duas falhas de ligação ao tentar prepará-las.
4. Servidor retomado; Repetir recursos em falta mostrou 62/63 e depois 63/63.
   O registo do servidor contém exatamente os dois pedidos das fotografias em falta.
5. Servidor novamente desligado: a raiz da aplicação abriu da cache, o anúncio
   abriu e uma fotografia recuperada foi escolhida e desenhada. A escolha foi desfeita.
6. Depois das correções finais, repetida a abertura da raiz com a cache v25 e o
   servidor desligado: aplicação, fotografia, letras e 63/63 disponíveis; sem
   avisos ou erros na consola dessa abertura.

Falha/retoma foram exercitadas na v22; a lógica do worker não mudou depois disso,
apenas o identificador da cache. A abertura final confirmou a v25. Evidência:
`offline-failure.log`, `offline-resume.log`, `server-resume.log`,
`offline-final-cache.json`, `server-final-stopped.log` e `offline-final-v25.png`.
Desligar o servidor tornou todos os recursos desta origem inacessíveis pela rede;
não foi desligado o adaptador de rede do computador.

### Edição concorrente em páginas reais

Dois separadores independentes do navegador, com o mesmo armazenamento local,
foram usados enquanto o servidor estava desligado:

1. A abriu o original. B abriu o mesmo anúncio e ficou com Gravação suspensa.
2. A guardou um novo título. Recarregar guardada em B carregou esse título;
   B continuou suspensa enquanto A detinha a edição.
3. B escreveu um rascunho diferente e Guardar como cópia criou outro anúncio;
   o original manteve o título de A.
4. B voltou ao original e escolheu Continuar nesta janela. B passou a guardar;
   A recebeu o aviso e conservou o seu rascunho local.
5. O histórico em B permitiu restaurar a versão de A anterior à passagem e,
   depois, recuperar a versão de B anterior ao restauro.
6. A editou novamente: Cancelar a saída conservou o rascunho; Sair sem guardar
   descartou-o. Ao reabrir, o original continha a versão de B e a cópia continha
   o rascunho independente de B.

Evidência: `concurrency-results.json`, `conflict-copy.png` e
`conflict-exit-confirm.png`. Após um recarregamento abrupto foi também observada
a reserva temporária já documentada: pode subsistir até cerca de 45 segundos.
Recarregar guardada depois de expirar recuperou a edição, sem perda dos dados.

### Validação automática e limites restantes

`npm test`: **237/237**, zero falhas/omissões, cerca de 28,5 s. Registo integral:
`unit-final.log`. A regressão da capa tem os registos antes/depois em
`cover-readiness-before.log` e `cover-readiness-after.log`. Sintaxe válida nos
38 ficheiros da aplicação/SW e no novo controlo offline. Os testes automáticos
com DOM/cache simulados continuam identificados como tal; os ensaios acima são
evidência separada de navegador e ficheiros reais.

Fica por verificar em equipamento físico: teclado virtual, toque, instalação/PWA,
comportamento específico de Safari/iOS ou Chrome/Android e audição dos vídeos.
Não foram ensaiados dois contentores de janela do sistema operativo, apenas dois
contextos Window reais em separadores. A importação do pacote noutro perfil ou
origem também não foi feita nesta sessão. Estes limites não devem ser confundidos
com os ensaios realizados na origem autorizada.

Os dois anúncios fictícios permanecem na origem de teste. Nenhum anúncio de
trabalho foi usado. Não houve publicação nem commits; servidor de teste encerrado.
