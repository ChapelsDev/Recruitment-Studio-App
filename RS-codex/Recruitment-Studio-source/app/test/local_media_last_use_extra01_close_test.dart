import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/private_effect_custody.dart';
import 'package:recruitment_studio/features/storage/private_file_io.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/android_document_gateway_test.dart'
    show MemoryDocuments;
import 'joint_lifecycle_extra01_finish_frontier_test.dart' show RootObservation;
import 'support/project_fixtures.dart';

// Forward the final fixture; the native key lifetime is authoritative only at
// this deterministic transport boundary, not a physical Android/device claim.
class LocalSourceChannel implements DocumentChannel {
  final MemoryDocuments memory = MemoryDocuments();
  final released = Completer<void>();
  final operations = <String>[];
  bool nativeKeyLive = false;
  bool nativeKeyReleasedAuthoritative = false;
  bool aborted = false;
  int endedReads = 0;

  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    operations.add(args['operationId'] as String);
    final response = await memory.invoke(method, args);
    if (method == 'pickOpen') nativeKeyLive = true;
    if (method == 'endRead') endedReads++;
    if (method == 'abortPrepared') aborted = true;
    if (method == 'abortWrite' && args['releaseTarget'] == true) {
      expect(aborted, isTrue);
      expect(args['opaqueId'], 'native-input');
      nativeKeyLive = false;
      nativeKeyReleasedAuthoritative = true;
      released.complete();
    }
    return response;
  }
}

// Actual descriptor and actual close. Unlike D28 this variant creates no
// ordinary pressure after close and never changes that frozen oracle.
class HeldLocalClose extends PrivateFileIo {
  HeldLocalClose({this.phase = 'close'});
  final String phase;
  final entered = Completer<void>();
  final resume = Completer<void>();
  RandomAccessFile? actual;
  File? source;
  int closes = 0;
  bool closed = false;

  Future<void> hold() async {
    entered.complete();
    await resume.future;
  }

  @override
  Future<RandomAccessFile> open(
    File file, {
    FileMode mode = FileMode.read,
  }) async {
    source = file;
    final handle = await super.open(file, mode: mode);
    actual = handle;
    if (phase == 'open') await hold();
    return phase == 'read' || phase == 'length'
        ? HeldLocalReader(handle, this)
        : handle;
  }

  @override
  Future<void> close(RandomAccessFile handle) async {
    closes++;
    if (phase == 'close') await hold();
    await super.close(handle);
    closed = true;
  }
}

// Every executed method forwards to the actual opened descriptor. Unsupported
// methods throw, rather than fabricating a RandomAccessFile or read result.
class HeldLocalReader implements RandomAccessFile {
  HeldLocalReader(this.actual, this.io);
  final RandomAccessFile actual;
  final HeldLocalClose io;
  bool lengthHeld = false;
  @override
  Future<int> length() async {
    if (io.phase == 'length' && !lengthHeld) {
      lengthHeld = true;
      await io.hold();
    }
    return actual.length();
  }

  @override
  Future<Uint8List> read(int count) async {
    if (io.phase == 'read') await io.hold();
    return actual.read(count);
  }

  @override
  Future<void> close() => actual.close();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> localCloseWitness({
  required bool host,
  required bool shutdown,
  String phase = 'close',
}) async {
  final root = await Directory.systemTemp.createTemp('local-last-use-');
  final provider = LocalSourceChannel();
  provider.memory.data = await File('test/fixtures/assets/logo.png')
      .readAsBytes();
  final io = HeldLocalClose(phase: phase);
  final budget = WorkBudgetController();
  late RootObservation observed;
  final runtime = await ProductRuntime.open(
    root,
    (stage, domain) => observed = RootObservation(
      AndroidDocumentGateway(provider, stagingDirectory: stage, budget: domain),
    ),
    budget: budget,
    fileIo: io,
  );
  await runtime.adoptSession(
    EditorSession.fromBundle(await fixtureBundle(), budget: budget),
  );
  runtime.host!.preview.setPaused(true);
  await runtime.host!.preview.processingSettled;
  await runtime.scheduler!.checkpoint();
  final current = runtime.session!;
  final originalHost = runtime.host!;
  final generation = current.generation;
  final dirty = current.hasUnsavedChanges;
  final retained = PrivateEffectCustody.retainedCount;
  Future<void>? closing;
  var settled = false;
  final Future<void> importing;
  if (host) {
    originalHost.requestMedia(AssetKind.logo);
    importing = originalHost.idle;
  } else {
    importing = runtime.importProfileLogo();
  }
  importing.then((_) => settled = true);
  try {
    await io.entered.future.timeout(const Duration(seconds: 5));
    final source = io.source!;
    final heldCredit = budget.reservedBytes;
    expect(source.existsSync(), isTrue);
    expect(await io.actual!.length(), provider.memory.data.length);
    if (phase == 'read' || phase == 'close') {
      expect(heldCredit, greaterThanOrEqualTo(2 * provider.memory.data.length));
    }
    expect(PrivateEffectCustody.retainedCount, retained + 1);
    expect(provider.endedReads, 1);
    if (shutdown) {
      closing = runtime.close();
    } else {
      runtime.cancel();
    }
    await provider.released.future.timeout(const Duration(seconds: 5));
    expect(observed.root!.id, provider.memory.owner);
    expect(observed.root!.isFinishing, isTrue);
    var rootSettled = false;
    final finishing = observed.root!.finish().then((_) => rootSettled = true);
    await Future<void>.delayed(const Duration(milliseconds: 30));
    expect(rootSettled, isFalse);
    expect(provider.nativeKeyReleasedAuthoritative, isTrue);
    expect(provider.nativeKeyLive, isFalse);
    expect(
      source.existsSync(),
      isTrue,
      reason: 'The same-root stage must survive actual private close last-use',
    );
    expect(settled, isFalse);
    expect(io.closed, isFalse);
    if (phase == 'read' || phase == 'close') {
      expect(
        budget.reservedBytes,
        greaterThanOrEqualTo(2 * provider.memory.data.length),
      );
    }
    // Runtime shutdown may independently retire scheduler snapshots in this
    // same domain. Do not mistake their refund for this held source's refund.
    expect(
      AdmissionBudget.shared.reservedBytes,
      greaterThanOrEqualTo(64 * 1024),
    );
    expect(PrivateEffectCustody.retainedCount, retained + 1);
    expect(current.isDisposed, isFalse);
    expect(current.generation, generation);
    expect(current.hasUnsavedChanges, dirty);
    expect(runtime.profile.draft.logo, isNull);
    expect(provider.operations.toSet(), {provider.memory.owner});
    io.resume.complete();
    await importing.timeout(const Duration(seconds: 5));
    await finishing.timeout(const Duration(seconds: 5));
    if (closing != null) await closing.timeout(const Duration(seconds: 5));
    expect(io.closed, isTrue);
    expect(io.closes, 1);
    expect(source.existsSync(), isFalse);
    expect(PrivateEffectCustody.retainedCount, retained);
    await expectLater(io.actual!.length(), throwsA(isA<FileSystemException>()));
    expect(current.isDisposed, shutdown);
    if (!shutdown) {
      expect(current.generation, generation);
      expect(current.hasUnsavedChanges, dirty);
    }
    // Machine print is a causal observation, not a synthetic provider receipt.
    // ignore: avoid_print -- machine causal test evidence only
    print(
      'LOCAL_LAST_USE phase=$phase host=$host shutdown=$shutdown '
      'nativeReleased=${provider.nativeKeyReleasedAuthoritative} '
      'actualCloses=${io.closes} stageAfter=${source.existsSync()} '
      'heldCopy=$heldCredit rootSettled=$rootSettled',
    );
  } finally {
    // A failed baseline assertion must actually let the real descriptor close;
    // this cleanup is not a positive last-use observation.
    if (!io.resume.isCompleted) io.resume.complete();
    await importing.timeout(const Duration(seconds: 5));
    await (closing ?? runtime.close()).timeout(const Duration(seconds: 5));
    runtime.dispose();
    await root.delete(recursive: true);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'L01 runtime cancel retains same-root stage through held actual local close',
    () => localCloseWitness(host: false, shutdown: false),
  );
  test(
    'L02 runtime close retains same-root stage through held actual local close',
    () => localCloseWitness(host: false, shutdown: true),
  );
  test(
    'L03 actual host cancel retains stage through held private close',
    () => localCloseWitness(host: true, shutdown: false),
  );
  test(
    'L04 actual host runtime close retains stage through held private close',
    () => localCloseWitness(host: true, shutdown: true),
  );
  test(
    'L05 actual host cancel retains stage through held real descriptor read',
    () => localCloseWitness(host: true, shutdown: false, phase: 'read'),
  );
  test(
    'L06 runtime close retains stage through held real descriptor open handoff',
    () => localCloseWitness(host: false, shutdown: true, phase: 'open'),
  );
  test(
    'L07 runtime cancel retains stage through held real descriptor length',
    () => localCloseWitness(host: false, shutdown: false, phase: 'length'),
  );
}
