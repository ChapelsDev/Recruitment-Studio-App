# Recruitment Studio / Editorial B — código-fonte não compilado

Commit: 87b70119b67387cf4a4f9f9c7698b763ba64bcf8
Árvore Git da aplicação: 3cb351a9db0bd545b3a183ead9db184e1c434874.
Os 328 ficheiros de app/ são byte-idênticos ao commit indicado.
Não é um executável nem uma entrega final aprovada: a aceitação completa das
jornadas reais Windows continua pendente. Android está em standby.

## Conteúdo
- app/lib/: código Dart/Flutter atual.
- app/windows/: projeto e código nativo Windows/CMake.
- app/android/: código Android existente, sem aceitação Android declarada.
- app/assets/: fontes locais e respetivas licenças.
- app/test/ e app/integration_test/: testes, fixtures e goldens versionados.
- app/pubspec.yaml e app/pubspec.lock: dependências e versões.
- design-studies/v1/: estudo B, tokens e licenças originais usadas nos testes.
- docs/build/project-format-v1.md: documentação do formato de projeto.
- SOURCE-MANIFEST.json e SHA256SUMS.txt: proveniência e integridade.

O README dentro de app/ e algumas descrições de bootstrap são históricos T00:
não representam o estado funcional atual. Foram preservados sem alteração para
manter os ficheiros exportados idênticos ao repositório. Este README orienta a
cópia de transferência.

## Abrir no teu computador
Extrai o ZIP inteiro, preservando a estrutura. Abre a pasta app/ no teu editor.
Para apenas ler ou editar o código, não é necessário compilar.

## Executar ou compilar em Windows
SDK usado no projeto: Flutter 3.47.5 / Dart 3.13.4.
É necessário ter o ambiente de desenvolvimento Windows do Flutter preparado,
incluindo a toolchain C++ adequada. O ZIP não inclui SDK nem toolchains.
Num terminal na pasta app/:

    flutter doctor -v
    flutter pub get --enforce-lockfile
    flutter run -d windows

Para gerar uma release, em vez de flutter run:

    flutter build windows --release

O pub get pode precisar de Internet para obter as dependências. Mantém
pubspec.lock; não é necessário fazer pub upgrade para abrir o projeto.
Estes comandos são instruções para o teu computador, não foram executados
nesta exportação. Os testes de integração e de recursos incluídos não são
considerados executados ou aprovados por estarem presentes no ZIP.

## Privacidade e limites
Sem histórico .git, logs operacionais, credenciais, projetos pessoais, caches,
outputs QA ou binários da aplicação. As imagens de teste e goldens versionados
são fixtures de desenvolvimento, não projetos pessoais.
As licenças das fontes estão em app/assets/licenses/ e design-studies/v1/licenses/.
Esta transferência não acrescenta licença de publicação ao projeto; as
dependências mantêm os seus próprios termos.
