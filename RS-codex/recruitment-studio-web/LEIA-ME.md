# Recruitment Studio

Aplicação para criar anúncios de recrutamento para o Facebook e o Instagram,
pensada para funções de obra. Funciona sem internet: tudo o que precisa
(letras, ícones, fotografias, código) está nesta pasta.

## Abrir

- **No computador:** duplo clique em **Recruitment Studio.exe**. Abre numa
  janela própria do Microsoft Edge: o balão do ícone entra pelo canto, os
  pontos escrevem e aparece o nome (uma vez por sessão; um toque ou uma tecla
  salta).
- **Atalho:** **Criar atalho no ambiente de trabalho.cmd** cria um atalho com
  o ícone da aplicação. Volte a corrê-lo se mudar a pasta de sítio.
- **Alternativa:** **Abrir Recruitment Studio.cmd** faz o mesmo que o `.exe`.
- **No telemóvel:** a cópia publicada está no Tailscale, em
  `https://<máquina>.tailfc994f.ts.net` (o telemóvel precisa do Tailscale
  ligado). Abra o endereço e toque em **Instalar** (ver «Instalar» abaixo).
  Fica instalada e funciona sem rede depois da primeira abertura. Quando
  publicar uma versão nova, a app passa para ela sozinha ao abrir (ou ao voltar
  a ela); o número da versão aparece no fundo do ecrã inicial.

## Instalar

O botão **Instalar** do ecrã inicial adapta-se ao aparelho:

- **Android (Chrome, Edge) e Chrome ou Edge no computador:** um toque abre a
  instalação do próprio navegador. No computador aparece a seguir o código QR
  para o telemóvel.
- **iPhone e iPad (Safari):** um guia animado mostra onde tocar: Partilhar →
  «Adicionar ao ecrã principal» → «Adicionar». Noutros navegadores do iPhone o
  guia é o da barra do endereço (e, se não aparecer, abrir no Safari).
- **Mac (Safari):** menu Ficheiro → «Adicionar à Dock».
- **Firefox e Samsung Internet no Android:** os passos do menu de cada um.
- **Dentro do Instagram ou do Facebook:** o guia manda abrir o link no Safari
  ou no Chrome primeiro (o navegador interno não instala).
- **No .exe (computador):** o botão chama-se **Instalar no telemóvel**: pede
  uma vez o endereço da app (`https://….ts.net`, fica guardado neste
  computador) e mostra o código QR. Aponte a câmara do telemóvel; o telemóvel
  precisa do Tailscale ligado. A janela do `.exe` nunca conta como «instalada».

Na primeira abertura como app instalada aparece uma pequena receção
(«BEM-VINDO»), uma única vez em cada aparelho.

## Cópias de segurança de toda a biblioteca

No ecrã inicial, **Cópias de segurança** guarda um ficheiro `.rsbackup` com
anúncios, marcas, modelos pessoais, fotografias e áudio. Pode incluir ou omitir
o histórico de versões e a reciclagem. O ficheiro `.anuncio` continua disponível
para transportar apenas um anúncio.

Ao abrir uma cópia global, reveja a lista antes de restaurar. **Adicionar como
cópias independentes** mantém os itens existentes. **Substituir itens com o mesmo
identificador** atualiza apenas as correspondências; os restantes itens mantêm-se.
A versão anterior de cada anúncio substituído fica no histórico. Marcas e modelos
correspondentes são substituídos: guarde primeiro uma cópia atual se os quiser
conservar. Os anúncios restaurados na reciclagem recebem um novo prazo de 30 dias.
Se outra janela alterar os dados durante a revisão, volte a abrir a cópia.

O painel mostra a data da última cópia preparada, o espaço estimado e se o navegador
concedeu armazenamento persistente. Confirme sempre que o ficheiro descarregado
ficou guardado. A proteção concedida pelo navegador não substitui uma cópia em
ficheiro, nem impede a eliminação manual dos dados do navegador.

O estado **Guardado** também aparece no telemóvel. Uma falha de gravação mantém um
aviso com **Tentar novamente** e **Guardar ficheiro de segurança**. Se só existir
armazenamento temporário, a app mostra **Só nesta sessão**. As janelas contêm o foco
do teclado e devolvem-no ao controlo anterior ao fechar; o vídeo tem um botão de
pausa acessível por teclado.

## O mesmo anúncio aberto em duas janelas

A aplicação deteta quando outra janela começa a editar ou guarda uma nova versão
do mesmo anúncio. **Gravação suspensa** impede que esta janela substitua o trabalho
da outra. Pode continuar a ajustar o rascunho local e escolher:

- **Guardar como cópia:** conserva esta edição num anúncio independente, em
  rascunho e sem os registos de publicação do original.
- **Recarregar guardada:** substitui a edição local pela versão mais recente,
  depois de confirmar. Se a outra janela continuar a editar, a gravação permanece
  suspensa até escolher qual deve continuar.
- **Continuar nesta janela:** confirma que esta edição passa a ser guardada.
  A versão anterior fica no histórico e a outra janela recebe o aviso.
- **Guardar ficheiro de segurança:** descarrega esta edição como `.anuncio`.

Para sair sem conservar a edição local, use **Voltar aos anúncios** e confirme
**Sair sem guardar**. Cancelar mantém o rascunho aberto. Esta proteção funciona entre
janelas do mesmo armazenamento local, sem servidor; não sincroniza computadores
ou perfis diferentes. Se uma janela fechar inesperadamente, a reserva de edição
expira em cerca de 45 segundos; pode depois recarregar ou continuar explicitamente.

## Preparar a utilização sem rede

Em **Definições → Disponível sem rede**, confirme separadamente a aplicação e
as fotografias incluídas. A contagem vem dos recursos presentes na cache ativa,
incluindo o código e as fontes. **Preparar todos os recursos** mostra progresso
e **Repetir recursos em falta** retoma os ficheiros que não ficaram guardados.
Falhas de ligação ou espaço não são apresentadas como preparação concluída.
Uma verificação simples consulta a cache sem descarregar os recursos.

A preparação automática respeita a poupança de dados do navegador. A preparação
explícita descarrega as fotografias mesmo com essa opção ativa. A cópia aberta
por `file://` informa que depende da pasta local completa, pois aí não utiliza
service worker. Anúncios e recursos próprios continuam no armazenamento local;
a cache offline não substitui uma cópia de segurança.

## Rever traduções

Os atalhos **Textos guardados** e **Planear publicação** foram retirados da
interface. Os dados anteriormente guardados continuam preservados nos anúncios
e nas cópias de segurança.

Em **Rever traduções**, uma correspondência exata do original sugere a tradução
guardada para o mesmo cliente/profissão, ou uma entrada geral. A sugestão mostra
o texto antes de o aplicar e nunca o insere automaticamente. Depois de aplicar,
é necessário confirmar a revisão neste anúncio. **Guardar tradução aprovada**
guarda o par de línguas diretamente a partir de um bloco revisto. Esta biblioteca
está incluída no restauro global; não precisa de rede ou de um serviço de tradução.

Os textos prontos das 15 profissões passam a incluir italiano e espanhol, além
das línguas anteriores. São pontos de partida editáveis e devem ser revistos na
oferta concreta; não recebem uma marca de aprovação automática.

## Comparar formatos e enquadramentos

**Comparar formatos**, junto ao seletor de formato da imagem, mostra quadrado,
retrato e Story na língua atual. Pode ajustar aproximação e posição com controlos
acessíveis pelo teclado, aplicar um enquadramento aos três formatos ou recuperar
o enquadramento original num deles. Arrastar a fotografia no editor e usar a roda
do rato ou dois dedos também só altera o formato selecionado. Espelho e ajustes
de cor continuam comuns. Os anúncios antigos herdam o enquadramento anterior até
ser feito um ajuste. Os carrosséis herdam o enquadramento do respetivo formato;
uma fotografia personalizada num diapositivo mantém os seus próprios ajustes.

A comparação e a verificação de exportação avisam se o texto desenhado fica abaixo
de 26 px no ficheiro de 1080 px de largura (cerca de 8,7 px quando visto a 360 px).
É um aviso prático para conferir a leitura; não é uma certificação de acessibilidade.
A pequena assinatura da marca não entra nesta medida. No vídeo Story, **Zonas**
mostra uma sobreposição de segurança só na revisão, sem aparecer no ficheiro.

## Navegar no vídeo e escolher a capa

A pré-visualização do vídeo tem uma barra temporal nas cores da aplicação, um
contador e botões por momento com o respetivo tempo. O momento atual fica
destacado; as setas permitem avançar ou recuar. Os mesmos controlos aparecem
na escolha da capa e funcionam com rato, toque e teclado.
Arrastar a barra ou escolher um momento pausa o vídeo nesse fotograma; **Continuar**
retoma a reprodução e **Ouvir** começa a partir desse instante. No telemóvel pode
ampliar a pré-visualização para ter mais espaço.

**Escolher capa** abre uma pré-visualização em 9:16 com o fotograma real do vídeo.
O botão fica indisponível enquanto as fotografias e o vídeo estão a ser preparados,
para que a capa use a sequência completa. Num contador animado, escolha um instante
em que o número já tenha chegado ao valor que pretende mostrar.
Pode acrescentar uma chamada de até 80 caracteres, em cima ou em baixo. A escolha
é guardada por língua e só altera a capa. Pode descarregar o PNG nessa janela;
o pacote de campanha passa também a usar a capa escolhida. Sem uma escolha, mantém
a composição estática anterior. O manifesto do ZIP identifica a origem e o instante
de cada capa. Depois de alterar a duração, os textos ou o estilo, reveja o fotograma;
se o instante já não existir, a exportação ajusta-o ao último fotograma e avisa.

## Editar os carrosséis

Em **Direção de arte**, **Do anúncio** escolhe uma composição ligada ao modelo
da imagem. Também pode escolher **Editorial**, **Projeto**, **Sinalética**,
**Oficina**, **Colagem** ou **Atelier**: mudam a estrutura da capa, o tratamento
da fotografia, as páginas de vantagens e os detalhes gráficos da sequência.
Os desenhos vetoriais acompanham as profissões selecionadas: alvenaria, circuitos,
tubagens, ferramentas, estruturas e outros motivos de ofício. Sem fotografia,
o desenho ocupa o campo principal da capa.

**Outra composição** varia a disposição sem substituir textos ou páginas
personalizadas. A escolha fica guardada com o anúncio e pode ser desfeita.
As cores de fundo e texto, fontes, escala da letra, logótipo e respetiva tonalidade,
fotografias e ajustes acompanham a personalização do anúncio. A paginação adapta-se
à quantidade de texto; listas longas continuam sem perder conteúdo.

A pré-visualização mostra uma página em tamanho maior. Use as setas ou os
miniaturas numeradas para percorrer a sequência; a edição das páginas aparece logo
abaixo. A composição é a mesma nos PNG exportados em retrato e quadrado.


Em **Exportar → Carrosséis e campanha**, escolha a língua e **Personalizar páginas**.
Pode mudar chamada e texto, subir/descer páginas, desmarcar **Publicar** para ocultar
uma página e acrescentar diapositivos. Para dividir, coloque o cursor no texto e
escolha **Dividir no cursor**. **Juntar à seguinte** conserva os textos e a composição
da primeira página. As páginas ocultas têm de ser mostradas antes de as juntar.

Há quatro composições por página: capa fotográfica, tipografia e destaques,
fotografia em baixo e texto com fotografia ao lado.
Cada página pode herdar a fotografia do anúncio, usar uma da biblioteca ou um
ficheiro próprio. O enquadramento, aproximação, espelho, luminosidade, contraste e
saturação podem ser ajustados sem alterar a imagem principal do anúncio. O ficheiro
`.anuncio`, a cópia global e o histórico incluem as fotografias dos diapositivos.

Os textos longos continuam em páginas adicionais, numeradas pela ordem de exportação.
Confirme a pré-visualização final. A personalização é independente por língua;
as restantes línguas continuam automáticas até serem personalizadas. Alterações
posteriores na oferta ou nos contactos geram um aviso para rever as páginas.
**Voltar ao automático** substitui a personalização dessa língua, com confirmação
e possibilidade de desfazer no editor.

## Espaço para editar

No telemóvel, **Recolher pré-visualização** dá mais espaço aos campos. **Mostrar
pré-visualização** volta a apresentar a imagem ou o vídeo. A preferência fica
guardada neste navegador e não altera o anúncio.

No computador, arraste a divisória entre os campos e a pré-visualização. Também
pode focá-la com Tab e usar as setas esquerda/direita (Shift para passos menores),
Home e End. Um duplo clique repõe a largura inicial. A largura adapta-se à janela
e fica guardada para a próxima edição.

## Ficha comum da oferta e revisão da publicação

Em **Texto → Ficha da oferta**, preencha salário, moeda, período, número de vagas,
localização pública e data de início. Os dados são comuns às línguas do anúncio;
os rótulos e a apresentação da data adaptam-se a cada língua. Escolha se a ficha
aparece na imagem, vídeo, carrossel e texto automático da publicação. Por omissão,
a imagem mantém o comportamento anterior, sem a ficha; pode ativá-la explicitamente.
Na imagem, a ficha acompanha a introdução sem alterar o texto que escreveu nesse
campo. No vídeo, surge nos destaques ou nos cartões de texto, conforme o estilo;
confirme os avisos de conteúdo que não coube na duração escolhida.

Um texto de publicação personalizado mantém-se quando altera a oferta ou os
contactos. A app assinala **Rever publicação** e apresenta um aviso antes de
exportar. Reveja e edite o texto, confirme que está atualizado ou use **Regenerar**
para voltar ao texto automático. A confirmação vale apenas para a língua escolhida.
Textos personalizados de versões antigas, sem registo de revisão, pedem uma
primeira confirmação; nunca são substituídos automaticamente.

## Definições: movimento, tema e vibração

As **Definições** estão sempre à mão: no ecrã inicial, a roda dentada da barra
de cima; no editor, o separador **Definições** da barra das secções (no fim da
barra da esquerda, no computador; na barra flutuante, no telemóvel). Tudo o que
se escolhe fica guardado neste aparelho e vale logo.

- **Movimento: Ilustrativo · Sóbrio · Calmo** (cada um com um pequeno desenho
  a mexer, para ver a diferença).
  - **Ilustrativo** (o de início): a obra a acontecer em cada toque e em cada
    ecrã. Um botão principal tocado faz saltar um tijolo; a grua vem buscar o
    modelo (ou o anúncio) e pousa-o no editor, que se monta à volta; a escolha
    da barra viaja como o carrinho da grua e balança ao parar; os painéis
    chegam bloco a bloco; uma linha nova assenta como um tijolo, com
    argamassa, e uma linha apagada tomba e cai; o ecrã inicial vive mesmo
    parado (a grua ao fundo balança a carga, os pontos do ícone escrevem, os
    cartões inclinam-se com o rato ou com o telemóvel Android); mudar de tema
    é o anoitecer (ou o amanhecer) na obra; as mensagens descem penduradas no
    gancho; um anúncio apagado desmorona-se em tijolos; «Guardado» é uma colher
    de pedreiro que desenha um visto; um erro chega com a fita da obra.
  - **Sóbrio**: rápido e discreto no dia a dia (botões que afundam e voltam com
    mola, a escolha que desliza, menus que crescem a partir do botão, números
    que contam); a grua, os tijolos e o «PRONTO» só nas esperas e nas vitórias.
  - **Calmo**: as mesmas mudanças, só a esbater, sem voos nem saltos nem
    números a contar. Quem pede ao aparelho menos movimento começa no Calmo
    até escolher outro.
- **Tema: Automático · Claro · Escuro.** «Automático» segue o telemóvel ou o
  computador e muda sozinho quando o aparelho passa a escuro à noite. Os
  anúncios e os vídeos nunca mudam de cor: o que vai para o Instagram é igual
  nos dois temas.
- **Vibração** (ligada à partida): no Android, um toque leve nos botões, e
  padrões próprios para «pronto» e «erro»; no iPhone, o toque do sistema nos
  botões (o iPhone não deixa vibrar de outra maneira, por isso «pronto» e
  «erro» não vibram); no computador nada vibra (nem num portátil com ecrã
  tátil).

Em qualquer estilo, nada faz esperar: um toque novo salta a animação que está
a correr para o fim e faz o que foi pedido; o desenho das miniaturas e dos
vídeos de exemplo vai entrando aos poucos sem prender os toques.

Use sempre o mesmo navegador: os anúncios ficam guardados nesse navegador,
neste aparelho.

## Criar um anúncio

1. **Criar anúncio**, escolha um dos 12 modelos e uma ou mais **funções**
   (eletricistas, pedreiros e masseiros, cofragistas, canalizadores...). A
   primeira que tocar é a principal: dá o título e as vantagens; as vagas de
   todas entram na caixa «Procuramos». Os textos chegam prontos.
2. **Texto**: ajuste a oferta (profissões, título, vantagens, vagas, salário,
   selo). A pré-visualização muda a cada letra e a letra encolhe sozinha quando
   o texto é comprido; nada bloqueia.
3. **Contactos**: o seu WhatsApp, os outros contactos e o código QR.
4. **Imagens**: escolha uma fotografia da biblioteca, ou arraste uma sua para
   o anúncio. Arraste a fotografia no anúncio para a enquadrar; Ctrl + roda do
   rato, ou dois dedos no telemóvel, aproxima. «Ajustar a fotografia» corrige
   brilho, contraste e cor.
5. **Aspeto**: o **Modelo** (fechado à partida, diz qual está escolhido; abra-o
   para trocar de composição), as cores, a letra, os tamanhos e a biblioteca pessoal.
6. **Exportar**: formatos (Quadrado, Retrato, Story), línguas, PNG ou JPG.
   Várias imagens saem num ZIP. No telemóvel, **Partilhar** envia diretamente
   para o Instagram, o Facebook ou o WhatsApp. O texto da publicação (com
   hashtags) vem pronto a copiar.

## Fala comigo no WhatsApp

O anúncio leva o candidato a falar consigo no WhatsApp com um toque, já com uma
mensagem escrita.

- **O seu WhatsApp** (em Contactos): escolha o país e escreva o número.
  O anúncio mostra o botão verde «Manda mensagem · +351 …» e o código QR passa
  a abrir o WhatsApp. O interruptor «Botão WhatsApp no anúncio» esconde o botão.
- **Mensagem que o candidato envia**: a app escreve-a sozinha com as funções do
  anúncio e na língua do anúncio («Olá! Vi o anúncio para pedreiro e servente e
  tenho interesse.»). Pode mudá-la à vontade; **Repor** volta à da app. A
  mensagem não leva códigos nem etiquetas.
- **Outros contactos** (em Contactos): telefone, email ou site, depois do botão
  verde. O olho deste bloco oculta do anúncio todos os contactos, com o WhatsApp
  e o QR.
- **Código QR** (em Contactos): «WhatsApp (recomendado)» abre a conversa com essa mensagem;
  «Link» usa um link seu (site, formulário). Os anúncios antigos com link ficam
  em «Link».
- **Texto da publicação** (em Exportar): leva o link do WhatsApp e o número,
  para quem lê no telemóvel (ninguém consegue ler o QR no próprio ecrã).
  **Copiar link do WhatsApp** serve para o autocolante «Link» das Stories do
  Instagram.
- **Mostrar QR** (no início e na barra do editor, ícone de QR): um QR grande do
  seu WhatsApp para mostrar cara a cara. A outra pessoa aponta a câmara e o
  WhatsApp abre com «Olá, falámos agora há pouco.» na língua que escolher. No
  início usa o número da sua marca; no editor, o do anúncio. Se ainda não houver
  número, pede-o e guarda-o.
- **Marcas e modelos** guarda também o número e a **mensagem por
  omissão** dos anúncios novos na língua que está a editar; `{profissões}` (também sem til)
  é trocado pelas funções de cada anúncio.

## Vídeo para Reels e Stories

O vídeo começa com os textos do próprio anúncio: o mesmo anúncio pode sair numa
publicação como imagem e noutra como vídeo. Pode depois mudar qualquer texto só
no vídeo, em cada língua.

- No editor, passe de **Imagem** para **Vídeo** (no topo, em **Vídeo** na barra
  de secções ou em **Converter em vídeo**, por cima da imagem). O vídeo mexe-se
  no lugar do anúncio, no formato escolhido (Story, Retrato ou Quadrado);
  **Ouvir** toca-o com o som e um clique no vídeo pausa e continua. Cada
  alteração aparece logo no vídeo.
- O painel **Vídeo** tem quatro separadores:
  **Modelo**, **Textos**, **Aspeto** e **Som e fim**; enquanto o editor estiver
  aberto, volta ao último que usou.

### Modelo

- Todos os modelos se mexem na galeria. As **receitas** são vídeos feitos à
  volta de uma só ideia, em que cada cena nasce da anterior, sem cortes:
  - **Tijolo**: o tijolo vira palavra e as palavras viram prédio (fundo claro
    ou escuro);
  - **Píxel**: cada píxel é um tijolo e, no fim, os píxeis formam o QR;
  - **Planta**: uma só linha de cota leva do título até ao WhatsApp;
  - **Apresentação**: um diapositivo, uma ideia, como num lançamento (fundo
    claro ou escuro);
  - **Colagem**: as letras do anúncio são janelas para a obra (usa
    fotografias);
  - **Números**: cada número roda como um conta-quilómetros e ocupa o ecrã
    inteiro (o salário e as vagas primeiro);
  - **Partidas**: um painel de partidas em que cada linha vira letra a letra;
    o embarque é no WhatsApp;
  - **Notificações**: um ecrã bloqueado às 07:00; cada vantagem chega como
    notificação e a do WhatsApp abre a conversa;
  - **Grua**: uma grua desce cada informação no gancho e assenta-a no prédio
    (fundo claro ou escuro);
  - **Contrato**: um contrato numa prancheta, com vantagens marcadas a tinta,
    assinatura e carimbo;
  - **Crachá**: um crachá de obra sai da impressora, vira em 3D e mostra o
    anúncio nas suas faces; o QR está no crachá;
  - **Fita métrica**: uma fita desenrola-se e cada informação é uma marca; o
    salário é a medida;
  - **Esteira**: uma passadeira leva caixas com as palavras do anúncio, uma
    prensa carimba-as e a última caixa abre-se no contacto.

  Os **estilos** continuam: **Néon**, **Obra**, **Limpo**, **Cinema**,
  **Impacto**, **Curto** (6 segundos) e **Cartaz animado** (o anúncio tal como
  está, a aparecer por partes).
- **Duração**: **Automática** (recomendada) dá o tempo que os textos pedem,
  entre 10 e 30 segundos, e mostra-o («Automática · 22 s»); ou 10, 15, 20, 25
  ou 30 segundos (e 6 nos modelos que o tinham). Um vídeo mais longo mostra
  mais, não mais devagar: cada página de informação tem o seu momento. As
  durações que os textos não conseguem encher ficam a cinzento, com o que falta
  escrever («Escreva mais 3 vantagens ou destaques para chegar aos 30 s»); o
  vídeo nunca é esticado nem repetido (nos estilos, só as vantagens alongam o
  vídeo). Se outra língua do anúncio não encher a duração escolhida, o painel
  diz quanto falta escrever nessa língua. Se não couber tudo, o painel diz o
  que fica de fora.

### Textos

- Cada texto do vídeo começa igual ao da imagem e acompanha-a até o mudar
  aqui; o que mudar fica **só no vídeo** e **só nessa língua** (os botões de
  língua, no topo, trocam a língua dos textos e do vídeo).
- Blocos: **Chamada**, **Título**, **Introdução**, **Vantagens**,
  **Destaques**, **Vagas** (título da lista e vagas), **Conversa no WhatsApp**
  (nas receitas: a mensagem a ser escrita e enviada), **Contactos**, **Botão e
  dica** (o texto do botão verde e a dica do QR), **Frase final** (uma frase
  sua antes do contacto, por exemplo «Começa já na segunda-feira»), **Nome da
  empresa** e **Textos do modelo** (as palavras próprias de alguns modelos,
  como o cabeçalho do painel de Partidas ou o carimbo do Contrato, já
  traduzidas).
- O olho de cada bloco mostra ou oculta-o no vídeo, sem apagar o texto. Os
  blocos ocultos na imagem começam ocultos no vídeo; ocultar os Contactos tira
  também o cartão do WhatsApp do fim.
- Nas listas pode mudar, tirar (**Voltar a pôr** traz de volta) ou juntar
  linhas. Os **Destaques** são números com legenda: começam no salário, nas
  vagas e no selo do anúncio, e pode juntar os seus («40 h» · «por semana»).
  Só um número simples (com moeda ou unidade) conta até ao valor; o resto
  aparece tal como está escrito.
- Um texto mudado mostra **Só no vídeo** e **Repor da imagem**; **Repor tudo
  da imagem** volta a pôr todos os textos da língua iguais aos da imagem (Ctrl+Z
  desfaz). Um texto apagado fica em branco no vídeo, e o painel diz o que isso
  faz. Apagar na imagem uma linha mudada para o vídeo apaga também a mudança.
- O **Cartaz animado** mostra a imagem tal como está: os textos mudam-se na
  imagem.

### Aspeto

- **Cores**: as do modelo, as **cores da marca** (as do anúncio), uma das
  paletas prontas e a **cor de destaque** à escolha. O botão do WhatsApp fica
  sempre verde e o texto fica sempre legível: as cores são ajustadas quando é
  preciso. **Letra**: a do modelo ou uma das quatro da aplicação. **Fundo**
  claro ou escuro onde o modelo o permite.
- **Fotografias** (só nos modelos que as usam): as das funções do anúncio ou,
  em **Escolher**, até oito da biblioteca e das suas (entram no vídeo pela
  ordem em que as escolher).

### Som e fim

- **Som**: **Música da app** (cada receita tem a sua; criada pela aplicação,
  sem direitos de autor), **Um som meu** (um MP3 ou M4A seu, ajustado à duração
  com um final suave; **Trocar** escolhe outro) ou **Sem som** (para juntar a
  música depois, na app do Instagram).
- **Contacto no fim**: o cartão com o número, o botão verde e o QR fica parado
  cerca de 2 ou 4 segundos; **Código QR no cartão** liga ou desliga o QR.

### Exportar

- **Exportar** (Ctrl+E) abre no separador em que está, Imagem ou Vídeo. No
  vídeo escolhe os formatos e as línguas (um vídeo por língua e formato, cada
  um com os textos dessa língua; vários saem num ZIP); **Mudar o vídeo** volta
  ao painel Vídeo. **Criar vídeo** mostra a percentagem e pode ser cancelado;
  no telemóvel, **Partilhar vídeo** envia-o diretamente.
- Precisa do Microsoft Edge ou do Google Chrome atualizados (ou do Safari
  recente no iPhone). Se o navegador não conseguir juntar o som, o vídeo é
  gravado em tempo real (demora o mesmo que o vídeo); se nem assim, sai sem som
  e a aplicação avisa.

## Dicas

- Clique em qualquer elemento do anúncio para ir direto ao campo.
- O olho ao lado de cada bloco oculta-o do anúncio sem apagar o texto.
- **Profissões do anúncio** (no topo de Texto): junte ou tire funções; a
  mensagem do WhatsApp e as fotografias «Deste anúncio» acompanham. **Usar os
  textos prontos destas profissões** troca todos os textos de uma vez nas
  sete línguas disponíveis (PT, DE-CH, DE, FR, IT, EN, ES); os contactos,
  o QR e a mensagem do WhatsApp mantêm-se.
- **Língua** (em cima): ao acrescentar DE-CH, DE, FR, IT, EN ou ES, os textos prontos
  são traduzidos automaticamente; o que escreveu à mão é copiado para traduzir.
- **Marcas e modelos** guarda várias identidades e modelos completos para reutilizar.
- Ctrl+Z desfaz, Ctrl+Y refaz, Ctrl+E abre a exportação.

## Biblioteca de fotografias

As fotografias que vêm com a aplicação são embutidas com uma ferramenta, a
partir de uma pasta organizada por função:

```
fotografias/
  eletricistas/   pedreiros/   cofragem/   canalizadores/   pintores/
  carpinteiros/   serralheiros/   ladrilhadores/   telhados/   maquinas/
  pladur/   serventes/   tecnicos/   armadores/   obras/
```

Fotografias soltas ou noutras pastas ficam em «Gerais». Depois:

```
node tools/build-photos.mjs "C:\caminho\para\fotografias"
```

Cada utilizador também pode acrescentar as suas em **Imagens > Biblioteca >
Adicionar fotografias à biblioteca** (ficam no navegador desse aparelho).

Em **As minhas**, as fotografias têm nome, descrição, etiquetas, profissão e
favorito. **Detalhes** permite editar esses dados e consultar os anúncios,
históricos, itens da reciclagem e modelos pessoais onde a imagem é usada.
Retirar uma imagem da biblioteca não a apaga dos anúncios ou versões que a usam.
A pesquisa encontra nome, descrição, etiquetas e profissão; o seletor de
fotografias do vídeo também permite pesquisar e mostrar só as suas favoritas.
Pesquisar não altera as fotografias já selecionadas para o vídeo.

Ao importar, a app mostra o resultado de cada ficheiro: adicionado, duplicado
ou rejeitado com o motivo. Duplicados são detetados pelo conteúdo (SHA-256),
mesmo quando o nome muda; não se trata de reconhecimento de fotografias visualmente
parecidas. Se o navegador não disponibilizar essa API local, a importação avisa
que não verificou duplicados. Os metadados acompanham os recursos no projeto
portátil e na cópia de segurança global.

## Cópias de segurança

O trabalho é guardado automaticamente no navegador. Para guardar uma cópia
ou passar um anúncio para outro computador use **Guardar ficheiro** (cria um
`.anuncio`) e, no outro computador, **Abrir ficheiro**. O ficheiro inclui a
versão atual do anúncio, os textos da publicação em cada língua, o logótipo,
o áudio e todas as fotografias utilizadas pelo vídeo, com a ordem e o
enquadramento. As fotografias automáticas ficam fixadas na cópia importada;
mudar as profissões ou a fotografia principal volta a escolher fotografias
para essa oferta. Os ficheiros antigos continuam a abrir, mas não podem
recuperar fotografias que não tinham sido incluídas na altura.

O histórico e a reciclagem ficam neste navegador; não são incluídos no
ficheiro da versão atual. Limpar os dados do navegador apaga os anúncios e
as versões que não tenham cópia.

### Texto da publicação por língua

Em **Exportar**, o **Texto para a publicação** acompanha o anúncio até ser
editado. Depois fica guardado por língua, mesmo que o deixe vazio. Fechar a
exportação, trocar de língua e voltar a abrir a app mantém o que escreveu.
**Regenerar** volta ao texto automático apenas nessa língua; Ctrl+Z desfaz.

### Reciclagem e histórico

- **Reciclagem**, no ecrã inicial: anúncios eliminados ficam disponíveis por
  **30 dias**, com imagens, áudio e histórico. **Restaurar** devolve-os aos
  anúncios. Depois desse prazo são removidos na próxima abertura da app.
- **Histórico de versões**: no menu de cada anúncio, na barra do editor no
  computador ou no fundo de **Exportar** no telemóvel. Guarda até **50
  versões** por anúncio. As alterações automáticas são agrupadas por minuto;
  a primeira alteração de uma sessão também conserva o estado anterior.
- **Guardar versão atual** cria um ponto de recuperação manual. **Restaurar**
  recupera textos, línguas, imagens e configurações dessa versão e conserva
  o estado anterior no histórico, permitindo voltar atrás.
- O histórico começa com as alterações feitas nesta versão da app; anúncios
  antigos não ganham retroativamente versões de edições anteriores.

### Campanhas e organização

Em **Organizar**, no editor, ou **Mais ações > Organizar anúncio**, no ecrã
inicial, defina campanha, cliente, localização, etiquetas (separadas por
vírgulas), favorito e estado: **Rascunho**, **Pronto**, **Publicado** ou
**Encerrado**. São dados internos; não aparecem na imagem nem no vídeo.

A pesquisa encontra nomes, textos, clientes, localizações e etiquetas,
mesmo sem acentos. Combine os filtros de campanha, estado, etiqueta e
favoritos; ordene por nome ou data de alteração. A estrela de cada cartão
alterna o favorito. Uma cópia mantém a campanha e as etiquetas, mas começa
como rascunho e sem favorito. Os filtros mantêm-se ao voltar do editor,
durante a mesma abertura da app.

### Revisão de traduções

Com duas ou mais línguas, **Rever traduções** compara cada bloco com a língua
de origem. Edite a tradução e use **Marcar como revisto**; os textos personalizados
precisam de tradução manual. A revisão distingue texto igual ao original,
texto em falta, blocos por rever e **Original alterado**. Confirmar também
pode significar que decidiu deixar um bloco vazio. Alterar um texto revisto
volta a pedir revisão; Ctrl+Z permite desfazer edições e confirmações.

Inclui o texto da publicação e, quando há personalizações, os textos do vídeo.
Estes últimos têm um atalho para **Vídeo > Textos**. Num anúncio antigo, os
blocos começam por rever; a app não presume que já foram conferidos.
Campanhas e revisões acompanham os ficheiros `.anuncio`, o histórico e a
reciclagem. Não há serviço de tradução online.

### Antes de exportar

**Exportar > Antes de exportar** verifica as línguas e os formatos selecionados:
contactos de exemplo, falta de um contacto utilizável visível, WhatsApp
incompleto, link do QR inválido, título em falta, traduções pendentes, texto
pequeno e fotografia de baixa resolução. No vídeo, verifica também conteúdo
que fica de fora do modelo ou da duração escolhidos. Os contactos próprios
do vídeo são considerados. A verificação de vários formatos decorre por etapas.

**Verificar** abre o campo ou a configuração correspondente e **Rever tradução**
abre essa língua. Os avisos não impedem exportar: omissões podem ser intencionais.
A verificação de contactos é de formato e exemplos conhecidos; não confirma
que um telefone, email ou site existe. Confirme sempre o resultado na pré-visualização.

### Marcas e modelos pessoais

Abra **Marcas e modelos** no editor (também em **Aspeto > Abrir biblioteca pessoal**).
Guarde uma marca com nome próprio: inclui logótipo, cores, fontes, nome/frase,
contactos por língua e WhatsApp. Pode definir uma mensagem por omissão na língua
atual. Um número incompleto impede guardar a marca até ser corrigido ou retirado.
**Aplicar marca** troca a identidade e os contactos, incluindo ligações antigas;
pode desfazer. Os textos da oferta continuam no anúncio. Escolha **Usar por omissão**
para os próximos anúncios ou selecione outra marca na galeria de modelos.
A marca antiga é migrada automaticamente para esta biblioteca.

Para reutilizar tudo, escolha **Modelo: anúncio completo**. Guarda textos por língua,
publicações, imagens e configurações do vídeo. No início, **Marcas e modelos pessoais
> Criar anúncio** cria uma cópia independente, em rascunho e sem campanha.
Pode mudar nomes, atualizar com o anúncio atual ou remover itens da biblioteca.
Os anúncios já criados mantêm-se; as imagens e o som dos modelos ficam preservados
mesmo que o anúncio de origem saia da reciclagem. A biblioteca fica neste navegador.
Use um projeto `.anuncio` para transportar um anúncio completo para outro aparelho.

### Carrosséis e pacote de campanha

Em **Exportar > Carrosséis e campanha completa**, escolha:

- **Carrossel:** diapositivos PNG numerados, em retrato ou quadrado, mais o texto
  da publicação por língua. Distribui título, introdução, oferta, vantagens, vagas
  e contactos pelos diapositivos; os textos longos continuam em páginas adicionais.
  Respeita os blocos visíveis do anúncio. Confirme a sequência na pré-visualização.
- **Campanha completa:** feed 4:5, story 9:16, vídeo 9:16, capa PNG 9:16,
  carrossel, publicações e projeto portátil. Pode selecionar as peças e línguas.
  A capa usa o fotograma escolhido por língua ou, sem escolha, a composição
  estática do anúncio. O vídeo usa as definições do editor,
  incluindo o som; o ficheiro será MP4 ou WebM conforme o suporte do navegador.

O ZIP contém uma pasta por língua, `manifesto.json` e `LEIA-ME.txt`. Os textos
personalizados são exportados exatamente como estão guardados, incluindo um texto
vazio. As escolhas de línguas, peças e formato ficam guardadas no anúncio.
Pode cancelar durante a preparação; uma falha não descarrega um pacote parcial.
Se o navegador não permitir vídeo, desmarque essa peça. Se não conseguir juntar
o som escolhido, a app avisa e não entrega silenciosamente um vídeo sem áudio.
Pacotes acima de 768 MB devem ser divididos por línguas ou peças.

Para correr os testes de dados e interface em Node: `npm ci` e `npm test`.
As dependências de desenvolvimento não são incluídas na aplicação publicada.

Para validação visual, sirva esta pasta por HTTP numa origem local de teste.
`tests/browser/visual.html` abre a aplicação com o exportador real e substitui
apenas a janela nativa «Guardar como» por um link de descarga. Use esse ficheiro
em «Abrir ficheiro» noutra origem/perfil vazio para verificar a portabilidade.
Esta página usa os dados da sua origem; não deve ser aberta numa instalação
com anúncios de trabalho. Os ficheiros de teste não entram na versão publicada.
Verifique desktop e telemóvel (360 e 390 px), ambos os temas, nomes longos no
histórico, restauro de versões, reciclagem, textos PT/FR e regeneração/desfazer.
Verifique também organização e pesquisa combinada, revisão após alterar o
original, correção de contactos pelo aviso e omissões na exportação de vídeo.
Na biblioteca, valide gravação, aplicação, renomeação, atualização e criação de
uma cópia independente. Nos pacotes, confirme a ordem e dimensões dos PNGs,
textos PT/FR, vídeos com áudio, projeto portátil, cancelamento e seleção de peças.

Para testar falhas e retoma offline na origem autorizada
`http://127.0.0.1:18973`, existe também `tests/browser/offline-control.html`.
Mostra a cache real e as mensagens do service worker; o botão de remoção retira
apenas duas fotografias descarregáveis dessa cache, sem alterar anúncios.
Prepare primeiro os recursos na aplicação, desligue o servidor, retire as duas
fotografias e confirme as falhas em **Definições**. Volte a ligar o servidor e use
**Repetir recursos em falta**; depois desligue-o e volte a abrir a aplicação.
Este controlo recusa outras origens e também fica excluído da versão publicada.
Os resultados da validação de 26 de outubro estão em `IMPLEMENTACAO.md` e em
`tests/evidence/2026-10-26/`.

## Para quem mantém a aplicação

- `index.html` carrega `assets/` (estilos, letras embutidas, ícones),
  `vendor/` (Preact + htm, QR codes, mp4-muxer) e `js/`: `trades.js` (funções e
  traduções), `model.js` (dados), `workflow.js` (campanhas, revisão e verificação
  da exportação), `workflow-ui.js` (filtros e janelas destas áreas), `reuse.js`
  (marcas e modelos pessoais), `carousel-art.js` (desenhos vetoriais por profissão),
  `production.js` (direções de arte, carrosséis e pacotes),
  `production-ui.js` (biblioteca e exportação em conjunto), `contact.js` (WhatsApp: números, mensagens,
  links), `engine.js` (desenho, ajuste automático do texto e animação do
  cartaz), `templates.js` (os 12 modelos), `motion-timeline.js` (os textos do
  vídeo, que seguem a imagem até serem mudados em Vídeo › Textos, e as cenas, os
  atos e as páginas de 2 segundos de cada duração), `motion-kit.js` (peças comuns das
  receitas: tempos, texto, desfocagem de movimento, conversa, QR),
  `motion.js` (os estilos de vídeo e a base das receitas), `recipes/` (uma
  receita de vídeo por ficheiro), `sound.js` (música da app e som próprio), `store.js` (IndexedDB, ficheiros
  e biblioteca), `video.js` (cria o MP4 com som), `appearance.js` (tema e
  vibração, carregado no `<head>` para não haver clarão do tema claro),
  `install.js` (navegador, passos de instalação, endereço da app),
  `haptics.js` (vibração no Android, interruptores invisíveis no iPhone),
  `ui-motion.js` (movimento da interface: pílula deslizante, números que
  contam, carregadores, grua, celebração, abertura) e `app.js` (interface).
- Sem servidor e sem CDN. Scripts clássicos de propósito: módulos ES não
  carregam a partir de `file://`. As fotografias embutidas são ficheiros JS
  com data URLs, porque imagens lidas de `file://` bloqueariam a exportação.
- Ferramentas (só para desenvolvimento):
  - `tools/build-assets.mjs <pacotes npm>`: regenera letras, ícones e vendor.
  - `tools/build-photos.mjs <pasta>`: regenera `photos/`.
  - `tools/build-icons.mjs`: desenha o ícone «Balão a entrar» em todos os
    tamanhos (`assets/icons/*.png`) a partir de `assets/brand/icon.svg`
    (64 px e mais), `icon-small.svg` (16–48 px: pontos maiores, menos corte)
    e `icon-maskable.svg` (Android, máscara redonda), no Edge sem janela.
  - `tools/build-launcher.mjs`: junta os PNG em `assets/app.ico` e recompila
    o `.exe` com o compilador C# que vem com o Windows (corra primeiro
    `build-icons.mjs`).
  - `tools/build-screenshots.mjs`: tira as duas capturas que a instalação
    mostra (`assets/screenshots/phone.png` 1080×1920 e `wide.png` 1920×1080).
  - `tools/build-web.mjs`: gera `../web-publicar/recruitment-studio/` e o ZIP
    para publicar (versão instalável no telemóvel). Cada geração muda a versão
    da cache, por isso os telemóveis recebem as novidades sozinhos.
  - `tools/build-photos.mjs <pasta> --map tools/photos-map.json`: o mapa
    classifica fotografias soltas e deixa de fora as danificadas.
- Licenças em `licenses/` (letras SIL OFL, ícones Lucide ISC, htm Apache-2.0,
  qrcode-generator MIT, mp4-muxer MIT).
- Desenho e decisões:
  `../documentation/specs/2026-10-16-recruitment-studio-web-design.md` e,
  para o vídeo, `../documentation/specs/2026-10-19-recruitment-studio-video-design.md`
  e `../documentation/specs/2026-10-21-recruitment-studio-video-texts-durations-models-design.md`
  (textos do vídeo, durações de 10 a 30 s e os oito modelos novos); o
  movimento, a vibração, o tema escuro, a instalação e o ícone em
  `../documentation/specs/2026-10-21-recruitment-studio-premium-feel-design.md`.
