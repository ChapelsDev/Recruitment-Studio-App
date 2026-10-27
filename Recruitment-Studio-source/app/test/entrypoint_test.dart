import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:recruitment_studio/app_bootstrap.dart';
import 'package:recruitment_studio/main.dart' as app;
import 'package:recruitment_studio/product_application.dart';

const _ioTimeout = Duration(seconds: 10);

class _OwnedSupportPathProvider extends PathProviderPlatform {
  _OwnedSupportPathProvider(this.root);

  final Directory root;

  @override
  Future<String?> getApplicationSupportPath() async => root.path;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadBundledFonts);
  testWidgets('entrypoint launches only the empty recruitment shell', (
    tester,
  ) async {
    final supportRoot = await tester.runAsync(
      () => Directory.systemTemp.createTemp('entrypoint-support-'),
    );
    if (supportRoot == null) {
      throw StateError('Could not create owned entrypoint support root');
    }
    final previousProvider = PathProviderPlatform.instance;
    ProductApplicationState? application;
    addTearDown(() async {
      // A timed-out Windows open has no public completion to join: retain its
      // owned root rather than deleting underneath potentially live private IO.
      var storageRetired = !Platform.isWindows;
      try {
        final runtime = application?.runtime;
        if (runtime != null) {
          storageRetired = false;
          final closed = await tester.runAsync(() async {
            var settled = false;
            Object? closeError;
            StackTrace? closeStack;
            unawaited(
              runtime.close().then<void>(
                (_) => settled = true,
                onError: (Object error, StackTrace stack) {
                  closeError = error;
                  closeStack = stack;
                  settled = true;
                },
              ),
            );
            final watch = Stopwatch()..start();
            while (!settled && watch.elapsed < _ioTimeout) {
              await Future<void>.delayed(const Duration(milliseconds: 10));
              await tester.pump();
            }
            if (!settled) {
              throw TimeoutException(
                'Entrypoint shutdown did not settle',
                _ioTimeout,
              );
            }
            if (closeError != null) {
              Error.throwWithStackTrace(closeError!, closeStack!);
            }
            return true;
          });
          if (closed != true) {
            throw StateError('Entrypoint runtime shutdown did not complete');
          }
          storageRetired = true;
        }
      } finally {
        try {
          // ProductApplicationState owns runtime.dispose(), after close joins IO.
          await tester.pumpWidget(const SizedBox.shrink());
        } finally {
          PathProviderPlatform.instance = previousProvider;
        }
      }
      if (storageRetired) {
        await tester.runAsync(() async {
          await supportRoot.delete(recursive: true).timeout(_ioTimeout);
        });
      }
    });
    PathProviderPlatform.instance = _OwnedSupportPathProvider(supportRoot);
    app.main();
    await tester.pump();
    final state = tester.state<ProductApplicationState>(
      find.byType(ProductApplication),
    );
    application = state;
    if (Platform.isWindows) {
      // Pumping fake time cannot finish native filesystem futures. Readiness is
      // publication of the real runtime, not elapsed time or the loading shell.
      final ready = await tester.runAsync(() async {
        final watch = Stopwatch()..start();
        while (state.runtime == null && watch.elapsed < _ioTimeout) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
          // IO completes in real time, but startup continuations were enrolled
          // by initState in the fake test zone. Drain both sides of the seam.
          await tester.pump();
        }
        return state.runtime != null;
      });
      if (ready != true) {
        throw TimeoutException(
          'Entrypoint native startup did not complete',
          _ioTimeout,
        );
      }
    }
    await tester.pumpAndSettle();
    expect(find.text('Recrutamento'), findsOneWidget);
    expect(find.text('Criar projeto'), findsOneWidget);
    expect(find.text('Flutter Demo Home Page'), findsNothing);
    expect(find.byType(FloatingActionButton), findsNothing);
  });
}
