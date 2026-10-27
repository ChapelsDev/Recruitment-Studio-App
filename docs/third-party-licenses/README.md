# Avisos de terceiros — snapshot do código atual

**Estado:** material de licenças para preparação da entrega; não é uma release, aprovação jurídica, aceitação da aplicação ou cobertura final dos binários.

Este diretório reúne cópias byte a byte de 75 textos de licença/avisos presentes nos componentes locais efetivamente resolvidos. O índice `index.json` liga os avisos às 74 dependências de `app/pubspec.lock` (67 hosted e 7 SDK), aos 5 ficheiros de fontes declarados e aos textos de origem dos SDK. Cada aviso contém tamanho e SHA-256; não foram acrescentados termos, removidos copyrights nem reinterpretadas permissões.

As entradas SDK com versão de solver `0.0.0` não afirmam uma versão de produto do Flutter/Dart. As suas declarações locais não incluem versão; a ligação é ao nome e à raiz SDK observada na resolução atual. Os nomes e versões dos pacotes hosted foram comparados com os respetivos `pubspec.yaml`. Quando um pacote SDK não tinha aviso na sua própria raiz, o índice identifica explicitamente a ligação ao texto existente na raiz do Flutter SDK.

## Cobertura e limites

- Inclui dependências diretas, transitivas e de desenvolvimento: é um conjunto conservador do lock atual, não uma lista de código efetivamente ligado nos executáveis finais.
- As fontes DM Sans e DM Serif Display estão ligadas aos dois textos OFL existentes nos assets; os ficheiros de fonte são identificados por hash, mas não são duplicados neste pacote de textos.
- Os textos foram obtidos do cache/SDK/assets locais, preservados integralmente. Os SHA de arquivo declarados no lock não foram comparados com novos downloads de arquivos de pacotes.
- Ainda não existem binários finais Windows/Android verificados. Componentes efetivamente incluídos pelo engine, plugins nativos e cadeia de empacotamento devem ser reconciliados com a distribuição final e com os avisos gerados pelo build.
- Este snapshot não escolhe nem concede uma licença para o código próprio da aplicação.
- A validação do índice/cópias e as revisões deste snapshot não substituem provas nativas, revisão jurídica quando necessária ou T00–T15/AC01–AC15.

## Utilização na entrega

Conservar os textos em `texts/` juntamente com `index.json`. Reconciliar o índice e os avisos de build com cada ZIP/APK final, testar a cópia extraída e preservar os mesmos bytes dos notices. Se mudar lock/config, SDK/engine/plugin/fontes ou binários, esta recolha deve ser revalidada antes de ser apresentada como cobertura final.

Fonte verificável de cada afirmação factual: os membros e hashes de `index.json`; a proveniência de cache e os recibos de comparação são privados no dossier de execução. Nenhum caminho absoluto da máquina nem segredo é necessário neste artefacto.
