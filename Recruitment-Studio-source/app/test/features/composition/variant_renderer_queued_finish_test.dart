import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/composition/variant_renderer.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'variant_renderer_test_fixtures.dart';

Matcher _refusal(ProblemCode code) =>
    isA<OperationException>().having((e) => e.code, 'code', code);

void _record(String name, Map<String, Object?> observation) {
  final root = Platform.environment['T05_QUEUE_EVIDENCE_DIR'];
  if (root != null) {
    final dir = Directory(root)..createSync(recursive: true);
    File('${dir.path}/$name.json')
        .writeAsStringSync(jsonEncode(observation), flush: true);
  }
}

void _empty(WorkBudgetController budget) {
  expect(budget.reservedBytes, 0);
  expect(budget.queuedCount, 0);
}

Future<void> _queuedStop(
  ProjectBundle bundle,
  ImageEncoding encoding, {
  required bool cancel,
}) async {
  final budget = WorkBudgetController();
  final holder = WorkOperation.create();
  final caller = WorkOperation.create();
  final lease = await budget.acquire(holder, 4096);
  final holderId = holder.id;
  final before = bundleFingerprint(bundle);
  final events = <String>[];
  Object? diagnosticFailure;
  StackTrace? diagnosticStack;
  Object? observedError;
  final renderer = CanvasVariantRenderer(
    budget: budget,
    testHooks: RendererTestHooks(onEvent: events.add),
  );
  final render = renderer.render(
    bundle,
    AppLocale.ptPT,
    ExportFormat.square,
    encoding,
    operation: caller,
  );
  // Observe the actual exception and attach the exact-code matcher before stop.
  final observed = render.then<void>(
    (result) async {
      await result.dispose();
    },
    onError: (Object error, StackTrace stack) {
      observedError = error;
    },
  );
  final rejected =
      expectLater(
        render,
        throwsA(_refusal(ProblemCode.operationCancelled)),
      ).then<void>(
        (_) {},
        onError: (Object error, StackTrace stack) {
          // Retain only this matcher failure; all lifecycle assertions still execute.
          diagnosticFailure = error;
          diagnosticStack = stack;
        },
      );
  try {
    // acquire enrolls its queue synchronously before render's first await.
    expect(budget.queuedCount, 1);
    expect(budget.reservedBytes, lease.bytes);
    expect(events, isEmpty);
    expect(caller.isFinishing, isFalse);
    if (cancel) {
      caller.cancel();
    }
    var drained = false;
    final drain = caller.finish().then((_) {
      drained = true;
    });
    expect(caller.isFinishing, isTrue);
    expect(caller.isCancelled, cancel);
    expect(drained, isFalse);
    expect(budget.queuedCount, 0);
    await rejected;
    await observed;
    await drain;
    expect(drained, isTrue);
    expect(
      events,
      isEmpty,
      reason: 'Queued stop never admits decode, raster, worker or output',
    );
    expect(budget.reservedBytes, lease.bytes);
    expect(budget.queuedCount, 0);
    expect(holder.id, holderId);
    expect(holder.isFinishing, isFalse);
    expect(holder.isCancelled, isFalse);
    expect(lease.forChild(holder), same(lease));
    expect(bundleFingerprint(bundle), before);
    _record('${cancel ? 'cancel' : 'finish'}-${encoding.name}', {
      'actualCode': observedError is OperationException
          ? (observedError as OperationException).code.name
          : null,
      'expectedCode': ProblemCode.operationCancelled.name,
      'callerCancelled': caller.isCancelled,
      'callerDrained': drained,
      'events': events,
      'holderOpen': !holder.isFinishing && !holder.isCancelled,
      'holderBytesAfterWaiterDrain': budget.reservedBytes,
      'queuedAfterWaiterDrain': budget.queuedCount,
      'bundleSHA256Before': sha256.convert(utf8.encode(before)).toString(),
      'bundleSHA256After': sha256
          .convert(utf8.encode(bundleFingerprint(bundle)))
          .toString(),
    });
  } finally {
    await rejected;
    await observed;
    await caller.finish();
    lease.release();
    await holder.finish();
    _empty(budget);
    _record('cleanup-${cancel ? 'cancel' : 'finish'}-${encoding.name}', {
      'reservedBytes': budget.reservedBytes,
      'queuedCount': budget.queuedCount,
      'bundleUnchanged': bundleFingerprint(bundle) == before,
    });
  }
  // This is the sole intended RED assertion, after complete resource cleanup.
  if (diagnosticFailure != null) {
    Error.throwWithStackTrace(diagnosticFailure!, diagnosticStack!);
  }
}

void _validPng(RenderedVariant result) {
  expect(result.encoding, ImageEncoding.png);
  expect(result.width, 1080);
  expect(result.height, 1080);
  expect(result.bytes.take(8).toList(), [137, 80, 78, 71, 13, 10, 26, 10]);
  final decoded = img.decodePng(result.bytes)!;
  expect(decoded.width, 1080);
  expect(decoded.height, 1080);
  final pixel = decoded.getPixel(10, 10);
  expect([pixel.r.toInt(), pixel.g.toInt(), pixel.b.toInt()], [244, 241, 233]);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late ProjectBundle bundle;
  setUpAll(() async {
    await FontCatalog.load();
    bundle = rendererFixture();
  });
  test('T05 queued caller finish PNG exact operationCancelled', () async {
    await _queuedStop(bundle, ImageEncoding.png, cancel: false);
  });
  test('T05 queued caller finish JPG exact operationCancelled', () async {
    await _queuedStop(bundle, ImageEncoding.jpg, cancel: false);
  });
  test('T05 queued explicit cancel PNG exact operationCancelled', () async {
    await _queuedStop(bundle, ImageEncoding.png, cancel: true);
  });
  test('T05 queued explicit cancel JPG exact operationCancelled', () async {
    await _queuedStop(bundle, ImageEncoding.jpg, cancel: true);
  });
  test(
    'T05 ordinary queued PNG paid disposal reusable caller FIFO cleanup',
    () async {
      final budget = WorkBudgetController();
      final holder = WorkOperation.create();
      final caller = WorkOperation.create();
      final follower = WorkOperation.create();
      final holderLease = await budget.acquire(holder, 4096);
      final before = bundleFingerprint(bundle);
      final events = <String>[];
      List<String>? eventsAtFollower;
      WorkLease? followerLease;
      RenderedVariant? first;
      RenderedVariant? second;
      final renderer = CanvasVariantRenderer(
        budget: budget,
        testHooks: RendererTestHooks(onEvent: events.add),
      );
      final render = renderer.render(
        bundle,
        AppLocale.ptPT,
        ExportFormat.square,
        ImageEncoding.png,
        operation: caller,
      );
      final following = budget.acquire(follower, 7).then((lease) {
        followerLease = lease;
        eventsAtFollower = events.toList();
        return lease;
      });
      try {
        expect(budget.queuedCount, 2);
        expect(budget.reservedBytes, holderLease.bytes);
        expect(events, isEmpty);
        holderLease.release();
        first = await render;
        await following;
        _validPng(first);
        expect(
          eventsAtFollower,
          containsAll([
            'rasterDisposed',
            'pictureDisposed',
            'sourceImageDisposed',
            'sceneDisposed',
          ]),
        );
        expect(events.where((e) => e == 'sourceImageDecoded').length, 2);
        expect(events.where((e) => e == 'sourceImageDisposed').length, 2);
        expect(events, contains('resultTransferred'));
        expect(caller.isFinishing, isFalse);
        expect(caller.isCancelled, isFalse);
        expect(holder.isFinishing, isFalse);
        expect(budget.queuedCount, 0);
        expect(budget.reservedBytes, first.bytes.length + 7);
        followerLease!.release();
        await follower.finish();
        expect(budget.reservedBytes, first.bytes.length);
        final firstPaid = first.bytes.length;
        await first.dispose();
        _empty(budget);
        second = await renderer.render(
          bundle,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.png,
          operation: caller,
        );
        _validPng(second);
        expect(second.bytes, first.bytes);
        expect(caller.isFinishing, isFalse);
        expect(budget.reservedBytes, second.bytes.length);
        expect(bundleFingerprint(bundle), before);
        _record('ordinary', {
          'events': events,
          'eventsAtFollowerAdmission': eventsAtFollower,
          'firstPaidBytes': firstPaid,
          'secondPaidBytes': budget.reservedBytes,
          'callerReusable': !caller.isFinishing && !caller.isCancelled,
          'bundleUnchanged': bundleFingerprint(bundle) == before,
          'width': second.width,
          'height': second.height,
        });
      } finally {
        holderLease.release();
        first ??= await render;
        await first.dispose();
        await second?.dispose();
        await following;
        followerLease?.release();
        await follower.finish();
        await caller.finish();
        await holder.finish();
        _empty(budget);
        _record('ordinary-cleanup', {
          'reservedBytes': budget.reservedBytes,
          'queuedCount': budget.queuedCount,
          'bundleUnchanged': bundleFingerprint(bundle) == before,
        });
      }
    },
  );
  test('T05 actual JPG worker StateError open owner ioFailure exit cleanup recovery', () async {
    final budget = WorkBudgetController();
    final caller = WorkOperation.create();
    final ready = Completer<void>();
    final release = Completer<void>();
    final events = <String>[];
    final before = bundleFingerprint(bundle);
    RenderedVariant? recovery;
    final renderer = CanvasVariantRenderer(
      budget: budget,
      testHooks: RendererTestHooks(
        onEvent: events.add,
        beforeJpgEncode: () async {
          ready.complete();
          await release.future;
          throw StateError('controlled real JPG worker fault');
        },
      ),
    );
    final render = renderer.render(
      bundle,
      AppLocale.ptPT,
      ExportFormat.square,
      ImageEncoding.jpg,
      operation: caller,
    );
    final rejected = expectLater(
      render,
      throwsA(_refusal(ProblemCode.ioFailure)),
    );
    try {
      await ready.future;
      expect(events, contains('workerStarted'));
      expect(events, isNot(contains('workerExited')));
      expect(caller.isFinishing, isFalse);
      expect(caller.isCancelled, isFalse);
      expect(budget.reservedBytes, greaterThan(0));
      release.complete();
      await rejected;
      expect(caller.isFinishing, isFalse);
      expect(caller.isCancelled, isFalse);
      expect(events.where((e) => e == 'workerStarted').length, 1);
      expect(events.where((e) => e == 'workerExited').length, 1);
      expect(events.where((e) => e == 'sourceImageDisposed').length, 2);
      expect(
        events,
        containsAll(['rasterDisposed', 'pictureDisposed', 'sceneDisposed']),
      );
      expect(
        events.indexOf('workerExited'),
        lessThan(events.indexOf('rasterDisposed')),
      );
      expect(events, isNot(contains('resultTransferred')));
      _empty(budget);
      recovery = await CanvasVariantRenderer(budget: budget).render(
        bundle,
        AppLocale.ptPT,
        ExportFormat.square,
        ImageEncoding.jpg,
        operation: caller,
      );
      final decoded = img.decodeJpg(recovery.bytes)!;
      expect(decoded.width, 1080);
      expect(decoded.height, 1080);
      expect(recovery.bytes.take(2).toList(), [255, 216]);
      expect(caller.isFinishing, isFalse);
      expect(budget.reservedBytes, recovery.bytes.length);
      expect(bundleFingerprint(bundle), before);
      _record('worker-fault', {
        'events': events,
        'actualCode': ProblemCode.ioFailure.name,
        'callerOpenAfterFaultAndRecovery':
            !caller.isFinishing && !caller.isCancelled,
        'recoveryPaidBytes': budget.reservedBytes,
        'bundleUnchanged': bundleFingerprint(bundle) == before,
      });
    } finally {
      if (!release.isCompleted) {
        release.complete();
      }
      await rejected;
      await recovery?.dispose();
      await caller.finish();
      _empty(budget);
      _record('worker-cleanup', {
        'reservedBytes': budget.reservedBytes,
        'queuedCount': budget.queuedCount,
        'bundleUnchanged': bundleFingerprint(bundle) == before,
      });
    }
  });
}
