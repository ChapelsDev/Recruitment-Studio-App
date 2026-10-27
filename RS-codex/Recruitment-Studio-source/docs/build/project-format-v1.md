# Formato de projeto v1 — `.recruitproj`

## Estado e fontes normativas

Esta referência descreve os bytes implementados pelo T06, não uma release aceite. Fonte selada: `a59ac6105448092a5d3a955be6636af021ef86d4`, com os nove ficheiros storage/testes byte-exatos ao último GREEN `78f4c4eb686aa60210542baf6d1c152e6be7bdb0`. Ver [estado e evidência T06](../releases/0.1.0/tdd/T06.md). O integrador autenticou formatter, analyzer, lockfile offline, full suite 779/779, LCOV atual e o produtor persistente rich/blank com readback real no host. Whitespace deste documento e as duas revisões são resolvidos nos recibos parentais source-bound; não se adianta o seu resultado nem se declara aceitação.

A implementação é a autoridade sobre o formato atual: `app/lib/features/storage/{project_codec,package_preflight,package_zip_io,strict_manifest_json,package_worker}.dart`, `app/lib/features/projects/{project,project_manifest,project_values,project_bundle}.dart`, `app/lib/features/media/resource_service.dart` e `app/lib/shared/{operation,work_budget,work_limits}.dart`. Os limites são guardrails iniciais não medidos em dispositivos. Não prometem todas as combinações máximas simultâneas, composição equivalente nem transporte físico Windows ↔ Android verificado.

## Contentor e nomes exatos

O pacote é um ZIP32 binário, sem execução de conteúdo nem extração genérica para disco. A extensão `.recruitproj` não é uma assinatura: a API recebe um `File` e valida os bytes independentemente da extensão.

| Entrada | Regra |
|---|---|
| `manifest.json` | Obrigatória, exatamente uma; objeto JSON UTF-8 estrito |
| `assets/<sha256>.jpg` | JPEG incorporado, hash com exatamente 64 algarismos hexadecimais minúsculos |
| `assets/<sha256>.png` | PNG incorporado, mesma regra de hash |
| `thumbnail.png` | Cache auxiliar opcional, apenas quando declarada por `thumbnailRef` |

Os nomes brutos têm de ser ASCII e ter no máximo 75 bytes. Não se normaliza nem se repara um nome. Não são aceites variantes de maiúsculas, barras invertidas, separadores mistos, `../`, caminhos absolutos, drive-relative `C:relative`, drive/UNC, device paths Windows, NUL, streams com `:`, pontos/espaços finais, pastas, entradas estrangeiras ou archives aninhados. Duplicados exatos são recusados. As restantes grafias nem pertencem à allowlist; não se tornam válidas através de canonicalização. A política de nomes é independente do sistema operativo; os testes destes nomes no host não demonstram junctions Windows reais.

O leitor aceita STORE (método 0) e raw DEFLATE (método 8). O escritor produz apenas STORE, com manifesto seguido dos recursos referenciados, headers sem timestamps e sem thumbnail. O perfil recusa ZIP64, volumes múltiplos, comentários EOCD/entrada, extra fields, data descriptors, encriptação, versões/métodos não suportados e tipos de ficheiro estrangeiros. `version needed` só admite 10 ou 20; `version made by` admite origem DOS/Unix (0/3) e versão até 20. Flags permitidas: apenas `0x800` em STORE; `0x806` em DEFLATE (bit UTF-8 e opções DEFLATE). O tipo Unix, quando presente, tem de ser regular; atributos DOS ficam limitados à máscara `0x21`.

O EOCD ocupa os últimos 22 bytes, a central tem tamanho limitado pelo número de entradas e termina imediatamente antes dele. São comparados assinatura, versão, flags, método, data/hora, CRC32, tamanhos e nome entre headers locais e central. As regiões locais ordenadas têm de ser contíguas desde offset zero até ao início da central: sobreposição, lacunas, prefixos escondidos, payload fora de intervalo, dados finais ocultos e truncamento são recusados. STORE exige tamanho comprimido igual ao expandido. A leitura posterior confere CRC32 e tamanho efetivo de cada payload. CRC32 deteta corrupção; não é autenticação criptográfica nem assinatura.

A expansão DEFLATE usa output fixo, verifica cada escrita, árvores, repetições, referências anteriores, LEN/NLEN, bloco final, EOB, consumo do input e tamanho final. Descarta bits de alinhamento sem exigir que sejam zero; bytes inteiros finais adicionais são recusados. A razão de compressão é apenas um diagnóstico em `PackageZipEntry.compressionRatio`, não uma regra isolada de recusa. Há controlos STORE/DEFLATE e adversários na suite; não existe alegação de interoperabilidade RFC1951 exaustiva.

## Manifesto e domínio

A raiz contém exatamente estes campos de domínio, mais `thumbnailRef` opcional tratado separadamente pelo codec:

| Campo | Valor e validação |
|---|---|
| `schemaVersion` | Inteiro `1` |
| `modelVersion` | String exata `editorial-b-v1` |
| `id`, `revision`, `name` | ID válido, revisão inteira não negativa, nome interno conservado literalmente |
| `photo`, `logo` | `null` ou referência completa com `id`, `kind`, `mediaType`, `width`, `height`, `sha256` |
| `cropByFormat` | Objeto com chaves opcionais `square`, `portrait`, `story`; retângulos `left`, `top`, `width`, `height` |
| `contactIds` | Lista ordenada de IDs únicos, até oito |
| `localeOrder` | Lista não vazia e sem duplicados de locales suportados |
| `editions` | Exatamente as locales ativas; cada valor tem `headline`, `location`, `contacts` |
| `sections` | Lista ordenada; cada secção tem `id`, `visible`, `titles`, `items`; cada item tem `id`, `texts` |
| `style` | Exatamente `ink`, `accent`, `paper`, `bodyPx`, `logoScale` |

IDs seguem `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`. Contactos são únicos no projeto, secções são únicas na sua lista e itens são únicos dentro de cada secção; não se exige unicidade de um ID de item entre secções diferentes. Foto e logótipo têm papéis corretos e IDs distintos. `mediaType` usa os tokens `jpeg` ou `png`; JPEG usa extensão ZIP `.jpg`, não `.jpeg`.

Locales suportadas: `pt-PT`, `en`, `fr`, `it`, `de-DE`, `de-CH`, `es`. A ordem de `localeOrder`, contactos, secções e itens é conservada. Cada edição tem exatamente os contactos declarados; títulos/textos do manifesto têm exatamente as locales ativas. Não existe idioma mestre, tradução automática nem preenchimento de conteúdo em branco. Guardar um projeto incompleto é permitido: fotografia, headline e contacto obrigatórios para exportar imagens não são pré-condições do codec.

Os retângulos contêm números finitos, origem não negativa, largura/altura positivas e limites dentro de `[0,1]`. Cores são inteiros ARGB entre `0` e `0xffffffff`; `bodyPx` é 26, 30 ou 34; `logoScale` é finito entre 0.1 e 4. A falta de recortes é válida: o codec não inventa os três. Quando presentes, os três recortes são conservados. Fontes, perfil global da empresa, preferências da interface e coordenadas de janela não são ficheiros transportados pelo pacote.

`Project.fromManifest` valida o esquema, as chaves exatas, tipos, IDs, ordem e referências antes da publicação. Schema/model futuros são recusados; não há migrador implementado nem fallback para projeto vazio. Valores JSON numéricos com tipo errado continuam inválidos mesmo que sejam matematicamente iguais a `1`.

### JSON sem ambiguidades

Antes de construir o domínio, `StrictManifestJson` limita o manifesto a 512 KiB, exige UTF-8 válido sem BOM, uma única raiz objeto e fim exato após whitespace JSON. Verifica chaves depois de descodificar escapes, antes de as inserir no mapa: `"a"` e `"\u0061"` no mesmo objeto são duplicadas. Recusa Unicode malformado, substituição silenciosa, surrogates isolados, controlo não escapado, números não finitos, leading zeros e sintaxe final extra. Aceita pares surrogate válidos e preserva texto, espaços e quebras de linha.

A profundidade máxima é 32, começando a raiz em 1; o contador de chamadas de leitura de valores limita o grafo a 8192 nós; cada objeto/lista tem no máximo 1024 membros. Strings descodificadas, incluindo chaves, ficam limitadas a 16 000 unidades UTF-16, não glifos. Há ainda até 12 secções, oito itens por secção e oito contactos. A suite demonstra profundidade e fanout; falta um testemunho isolado da fronteira cumulativa de 8192 nós.

## Recursos incorporados, deduplicação e órfãos

`ProjectBundle.resources` é indexado por ID de domínio, não pelo path ZIP. Os buffers pertencem ao bundle e são readonly; o construtor valida presença/digest, mas digest correto não certifica segurança de imagem.

Cada referência atual de foto/logótipo aponta para `assets/<sha256>.<ext>`. Dois IDs/papéis podem usar bytes idênticos: o escritor emite uma entrada por path/hash/tipo e o leitor reconstitui ambos os IDs. Metadados incompatíveis para o mesmo path (tipo ou dimensões) são recusados; os limites de cada papel continuam aplicáveis. Hashes SHA256 são conferidos contra os bytes, não apenas contra o nome.

O bundle pode reter recursos antigos não referenciados. O escritor omite-os do pacote e não altera o bundle original; inclui só foto/logótipo atualmente referenciados. O leitor exige exatamente manifesto mais os paths referenciados e eventual thumbnail declarada: falta de recurso ou entrada órfã causa recusa. Não se aceita um ficheiro arbitrário só porque está abaixo do limite de 16 entradas.

Antes de qualquer decoder de imagem, todos os papéis passam por checks de tamanho, cabeçalho real, tipo, dimensões, digest, orientação e metadados privados. Imagens gigantes, multiframe ou com metadados privados são recusadas. Depois, todos os bytes aceites passam pela verificação real `ResourceService.validateEmbeddedWithLease`, sequencialmente, com o mesmo lease pesado. Hash/header corretos não dispensam a verificação completa de imagem.

### Thumbnail auxiliar

`thumbnailRef`, quando não nula, tem exatamente as seis propriedades da referência, `kind: "thumbnail"` e `mediaType: "png"`, ID distinto dos IDs públicos, dimensões positivas até 512 × 512 e hash válido. Os bytes de `thumbnail.png` ficam limitados a 1 MiB e passam pelos mesmos checks e verificação real do serviço. Referência omitida ou `null` significa ausência de thumbnail; bytes não declarados são órfãos.

O resultado de `PackagePreflight.inspect` é um `PackageIndex` destacado, com `project`, `entries`, `resources`, `thumbnailRef` e `thumbnailBytes`. A thumbnail nunca entra nos recursos públicos foto/logótipo nem serve de fonte à composição. `ZipProjectCodec.decode` devolve só `ProjectBundle` e não conserva a thumbnail auxiliar. A API de `encode` não recebe DTO de thumbnail: produz pacote sem cache, mesmo após decode de input com cache. Descartar/regenerar cache ao editar é responsabilidade da integração futura, não um scheduler implementado em T06; não se alteram textos para conservar cache.

## Limites, operação e buffers

| Limite inicial | Aplicação efetiva |
|---|---|
| ZIP comprimido / conteúdo expandido | Até 64 MiB cada; declarações e contagem efetiva são conferidas |
| Entradas / manifesto | Até 16 / 512 KiB |
| Foto | Até 25 MiB e 12 000 000 pixels |
| Logótipo | Até 8 MiB e 4 000 000 pixels |
| Thumbnail | Até 1 MiB; cada dimensão até 512 |
| Buffers próprios reservados | Domínio contabilístico de 256 MiB; não RSS |
| Tempo de decode | Timer de inspeção e timeout do worker de 15 segundos |

A central é lida com random access limitado antes de payloads. O preflight reserva 16 MiB para índice/JSON/domínio antes de ler o índice e adquire `3*E + 2*C` para o envelope de payload, transferências e cópias (`E`: expansão cumulativa declarada validada; `C`: maior entrada comprimida). Cada worker exige lease vivo, do mesmo owner, com carga suficiente antes de spawn/alocação. Há até 16 entradas sequenciais e um isolate por lease; leitura em chunks de 65536 bytes para buffer fixo. Os filhos de media reservam adicionalmente snapshot/scratch. Encode reserva a retenção total do bundle mais 16 MiB e escreve STORE sem buffer ZIP integral.

Reservas são contabilísticas; o allowance de 16 MiB não é uma prova do tamanho físico de todos os objetos JSON/Dart. Retenção do resultado após retorno, número de snapshots vivos, GC e RSS pertencem ao caller/ensaios posteriores. Ver o envelope source-bound parcial e as lacunas no relatório T06. Pacotes abaixo de caps individuais podem ser corretamente recusados pela admissão agregada.

A assinatura pública é:

```dart
abstract interface class ProjectCodec {
  Future<void> encode(ProjectBundle bundle, File output, {Operation? operation});
  Future<ProjectBundle> decode(File input, {Operation? operation});
}
```

`PackagePreflight.inspect(File input, {Operation? operation, void Function(PackageIndex)? beforeRelease})` mantém a chamada sem operação. `beforeRelease` permite copiar um bundle ainda com a reserva viva; não autoriza promover uma sessão. O ciclo suportado é `WorkOperation`. Se omitido, o codec cria e termina a operação; uma operação fornecida é emprestada e nunca terminada implicitamente. O caller termina-a depois de consumir o resultado. Leases dos filhos são partilhados, não adquiridos recursivamente.

Cancelamento/finishing são verificados na leitura, expansão e antes da publicação. O isolate de expansão é terminável, não apenas uma Future com timeout sobre trabalho bloqueante na thread principal. Barriers registam streams fechados e worker terminado/drenado; a libertação do slot espera por esses pendentes. O input é conservado; decode devolve um bundle completo destacado e não dispõe de API para substituir a sessão. Timer não substitui validação nem assegura preempção de todos os trechos síncronos do host.

A cache de admissão é um `Expando` por instância de codec, keyed pela identidade do buffer readonly. Guarda só escalares digest/tipo/dimensões/CRC e não retém o projeto nem os bytes por uma referência forte no valor. Apenas buffers verificados por esta instância ou devolvidos pelo seu decode podem reutilizar a admissão. Uma cópia distinta com o mesmo digest exige admissão nova. Um snapshot de texto via `bundle.withProject(...)`, com os mesmos buffers já admitidos, usa STORE sem segundo hash de recurso/raster/worker; não é um motor de autosave completo.

## Ownership da saída preparada e fronteiras nativas

`encode` produz exclusivamente um ficheiro privado novo. Recusa destino existente, link ou antepassado não regular; não cria pastas em falta e não concede aprovação de overwrite. Cria o ficheiro exclusivamente, escreve, faz flush e fecha antes de o dar por completo. O output fechado bem-sucedido pertence ao caller e sobrevive a `finish`; não é registado como staging descartável. A substituição do destino final, confirmação, backups e transação de sessão pertencem às integrações posteriores.

Em falha/cancelamento, a limpeza só tenta remover output criado por esta invocação, com path regular e stat consistente. Path/stat guards e o teste de replacement protegem casos modelados no host, mas não eliminam TOCTOU, aliases hard-link ou atacante concorrente capaz de conservar metadados. Não equivalem a handles nativos imutáveis, junctions Windows demonstradas ou atomicidade de destinos Android/SAF.

**Não verificado:** ambos os percursos físicos Windows → Android → Windows e Android → Windows → Android, composição nos targets, junctions/reparse points nativos, RSS/GC/allocator, adaptadores de destino, atomicidade, assinatura e release. Um eventual testemunho `host_transport_only` mostra bytes transportados entre diretórios privados no mesmo host; não fecha AC-07, AC-11 nativa, T04 ou a aceitação do produto.
