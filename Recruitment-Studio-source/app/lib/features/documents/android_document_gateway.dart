part of 'document_gateway.dart';

// One default Flutter engine/channel in this application. Prepay bounded native
// target/retired-picker/queue metadata and I/O buffers for process lifetime.
// Detach/late callbacks cannot release these early or depend on timely GC.
abstract final class _AndroidNativeCredits {
  static final ordinary = AdmissionBudget.shared.reserve(2 * 1024 * 1024);
  static final buffers = (WorkBudget.shared() as WorkBudgetController)
      .reserveCopy(1024 * 1024);
  static void ensure() {
    if (!ordinary.isActive || buffers.bytes != 1024 * 1024) {
      throw const CapacityExceeded();
    }
  }
}

/// SAF adapter. Only native-issued opaque handles cross the channel; never URI
/// strings or caller paths. Chunk transport bounds each platform message.
final class AndroidDocumentGateway extends _Gateway {
  AndroidDocumentGateway(
    DocumentChannel? channel, {
    super.stagingDirectory,
    super.budget,
  }) : channel = channel ?? const MethodDocumentChannel() {
    if (this.channel is MethodDocumentChannel) _AndroidNativeCredits.ensure();
  }
  final DocumentChannel channel;
  Future<Map<String, Object?>> _call(
    String method,
    WorkOperation op, [
    Map<String, Object?> args = const {},
  ]) async {
    final r = await channel.invoke(method, {'operationId': op.id, ...args});
    if (r.length > 16) throw _failure();
    if (r['status'] == 'failed') {
      final code = switch (r['problem']) {
        'permissionDenied' => ProblemCode.permissionDenied,
        'capacityExceeded' => ProblemCode.capacityExceeded,
        'operationCancelled' => ProblemCode.operationCancelled,
        'invalidSelection' => ProblemCode.invalidSelection,
        _ => ProblemCode.ioFailure,
      };
      throw _failure(
        code,
        'Tentar novamente',
        r['residualPlaceholder'] == true,
      );
    }
    return r;
  }

  Future<Map<String, Object?>> _pickerCall(
    String method,
    WorkOperation op,
    Map<String, Object?> args,
  ) async {
    Future<Map<String, Object?>>? cleanup;
    final unsubscribe = op.addStopListener(() {
      cleanup = _call('releaseOperation', op);
    });
    try {
      final response = await _call(method, op, args);
      if (response['status'] == 'cancelled' &&
          response['residualPlaceholder'] == true) {
        throw _failure(
          ProblemCode.operationCancelled,
          'Verificar ficheiro residual',
          true,
        );
      }
      return response;
    } finally {
      unsubscribe();
      final released = await cleanup;
      if (released?['residualPlaceholder'] == true) {
        throw _failure(
          ProblemCode.operationCancelled,
          'Verificar ficheiro residual',
          true,
        );
      }
    }
  }

  void _affinity(Map<String, Object?> r, WorkOperation op) {
    if (r['operationId'] != op.id) throw _failure(ProblemCode.invalidSelection);
  }

  @override
  Future<DocumentRef?> pickOpen(
    Set<String> acceptedMimeTypes, {
    Operation? operation,
  }) async {
    if (acceptedMimeTypes.isEmpty || acceptedMimeTypes.length > 8) {
      throw _failure(ProblemCode.invalidSelection);
    }
    for (final m in acceptedMimeTypes) {
      _mime(m);
    }
    final own = operation == null;
    final op = _work(operation ?? Operation.create());
    var admitted = false, retained = false;
    try {
      return await _run(op, () async {
        admitted = true;
        try {
          final r = await _pickerCall('pickOpen', op, {
            'mimeTypes': acceptedMimeTypes.toList(),
          });
          if (r['status'] == 'cancelled') return null;
          op.throwIfCancelled();
          _affinity(r, op);
          if (r['status'] != 'picked') throw _failure();
          final e = _issue(
            op,
            own,
            r['opaqueId'] as String,
            r['displayName'] as String,
          );
          retained = true;
          return e.ref;
        } catch (error) {
          var residual =
              error is DocumentGatewayException && error.residualPlaceholder;
          try {
            final r = await _call('releaseOperation', op);
            residual = residual || r['residualPlaceholder'] == true;
          } catch (_) {
            residual = true;
            _cleanupFailed = true;
          }
          if (residual) {
            throw _failure(
              _problem(error).code,
              'Verificar ficheiro residual',
              true,
            );
          }
          rethrow;
        }
      }, finishWhenDrained: () => own && !retained);
    } catch (_) {
      if (own && !admitted) await op.finish();
      rethrow;
    }
  }

  @override
  Future<PreparedDestination?> prepareSave(
    List<String> suggestedNames,
    String mimeType, {
    Operation? operation,
    DocumentRef? replace,
    bool overwriteApproved = false,
  }) async {
    _newOnly(suggestedNames, mimeType, replace);
    final own = operation == null;
    final op = _work(operation ?? Operation.create());
    var admitted = false, retained = false;
    try {
      return await _run(op, () async {
        admitted = true;
        try {
          final r = await _pickerCall('prepareSave', op, {
            'names': List<String>.of(suggestedNames),
            'mime': mimeType,
          });
          if (r['status'] == 'cancelled') return null;
          _affinity(r, op);
          if (r['status'] != 'prepared' ||
              r['canReadBack'] != true ||
              r['ownsReservedPlaceholder'] != true) {
            throw _failure();
          }
          final e = _issue(
            op,
            own,
            r['opaqueId'] as String,
            r['displayName'] as String,
            approvedName: suggestedNames.single,
            placeholder: true,
            renames: true,
          );
          if (op.isCancelled) {
            await _releaseNative(e);
            _forget(e);
            return null;
          }
          retained = true;
          return e.destination;
        } catch (error) {
          var residual =
              error is DocumentGatewayException && error.residualPlaceholder;
          try {
            final r = await _call('releaseOperation', op);
            residual = residual || r['residualPlaceholder'] == true;
          } catch (_) {
            residual = true;
            _cleanupFailed = true;
          }
          if (residual) {
            throw _failure(
              _problem(error).code,
              'Verificar ficheiro residual',
              true,
            );
          }
          rethrow;
        }
      }, finishWhenDrained: () => own && !retained);
    } catch (_) {
      if (own && !admitted) {
        await op.finish(); // refusal owns only this new operation
      }
      rethrow;
    }
  }

  Future<bool> _abort(_Entry e) async {
    final r = await _call('abortPrepared', e.operation, {
      'opaqueId': e.nativeId,
    });
    if (r['status'] != 'aborted' && r['status'] != 'released') throw _failure();
    final state = r['commitState'];
    if (state == 'reserved' || state == 'opening' || state == 'committed') {
      e.nativeEffectKnown = true;
      e.nativeHasEffect = state != 'reserved';
      e.residualKnown = e.nativeHasEffect || r['residualPlaceholder'] == true;
    } else {
      e.residualKnown = e.residualKnown || r['residualPlaceholder'] == true;
    }
    return e.residualKnown;
  }

  @override
  Future<void> _releaseNative(_Entry e) async {
    final residual = await _abort(e);
    await _call('abortWrite', e.operation, {
      'opaqueId': e.nativeId,
      'releaseTarget': true,
    });
    // A released native capability may still have a provider residual. Its
    // explicit diagnostic is distinct from an unresolved stream/handle drain.
    if (!e.drain.isCompleted) e.drain.complete();
    if (residual) {
      throw _failure(
        ProblemCode.ioFailure,
        'Verificar ficheiro residual',
        true,
      );
    }
  }

  @override
  Future<void> abortPrepared(
    PreparedDestination destination, {
    Operation? operation,
  }) async {
    final e = _lookup(destination.opaqueId, destination, operation);
    await _run(
      e.operation,
      () async {
        try {
          final residual = await _abort(e);
          await _call('abortWrite', e.operation, {
            'opaqueId': e.nativeId,
            'releaseTarget': true,
          });
          _forget(e);
          if (residual) {
            throw _failure(
              ProblemCode.ioFailure,
              'Verificar ficheiro residual',
              true,
            );
          }
        } catch (_) {
          _settleFailedDrain(e);
          rethrow;
        }
      },
      allowCancelled: true,
      finishImplicit: e.implicit,
    );
  }

  Future<_Digest> _read(
    _Entry e,
    int maximum, {
    _DocumentStage? output,
    bool committing = false,
  }) async {
    final op = e.operation;
    final r = await _call('beginRead', op, {
      'opaqueId': e.nativeId,
      'maximumBytes': maximum,
    });
    if (r['status'] != 'ready') throw _failure();
    final transfer = r['transferId'];
    if (transfer is! String || transfer.length > 128) throw _failure();
    final digest = _DigestSink();
    final hash = sha256.startChunkedConversion(digest);
    var count = 0;
    try {
      while (true) {
        if (!committing) op.throwIfCancelled();
        final n = (_chunkBytes).clamp(1, maximum - count + 1);
        final chunk = await _call('readChunk', op, {
          'transferId': transfer,
          'offset': count,
          'length': n,
        });
        final bytes = chunk['bytes'];
        if (chunk['status'] != 'ready' ||
            bytes is! Uint8List ||
            bytes.length > n) {
          throw _failure();
        }
        if (bytes.isEmpty) break;
        count += bytes.length;
        if (count > maximum) throw const CapacityExceeded();
        hash.add(bytes);
        await output?.write(bytes);
      }
    } finally {
      hash.close();
      await _call('endRead', op, {'transferId': transfer});
    }
    return _Digest(count, digest.value.toString());
  }

  @override
  Future<File> stageRead(
    DocumentRef ref,
    int maximumBytes, {
    Operation? operation,
  }) async {
    _limit(maximumBytes);
    final e = _lookup(ref.id, ref, operation);
    return _stageOwned(e, (file) async {
      await _read(e, maximumBytes, output: file);
    });
  }

  @override
  Future<WriteReceipt> writePrepared(
    File source,
    PreparedDestination destination,
    String selectedName, {
    Operation? operation,
  }) async {
    _Entry? admittedEntry;
    try {
      final e = _lookup(destination.opaqueId, destination, operation);
      if (e.operation.isCancelled && _cleanup.isNotEmpty) {
        while (_cleanup.isNotEmpty) {
          await _cleanup.first;
        }
        if (e.consumed) {
          return _receipt(
            WriteStatus.cancelled,
            e.operation.id,
            target: e.ref,
            problem: _problem(
              const OperationException(ProblemCode.operationCancelled),
            ),
            residual: e.residualKnown,
          );
        }
      }
      return await _run(
        e.operation,
        () async {
          admittedEntry = e;
          try {
            AdmissionBudget.shared.reserve(8192);
          } catch (error) {
            try {
              await _releaseNative(e);
              _forget(e);
            } catch (_) {
              e.residualKnown = true;
              _settleFailedDrain(e);
            }
            rethrow;
          }
          return _writeOwned(source, destination, selectedName, e);
        },
        allowCancelled: true,
        finishImplicit: e.implicit,
      );
    } catch (error) {
      final e = admittedEntry;
      return _receipt(
        WriteStatus.failed,
        destination.operationId,
        target: e?.ref,
        problem: _problem(error),
        residual: e?.residualKnown ?? false,
      );
    }
  }

  Future<WriteReceipt> _writeOwned(
    File source,
    PreparedDestination destination,
    String selectedName,
    _Entry e,
  ) async {
    var commitRequested = false;
    var committed = false;
    var released = false, cleanupFailed = false;
    try {
      if (!destination.approvedNames.contains(selectedName)) {
        throw _failure(ProblemCode.invalidSelection);
      }
      if (e.operation.isCancelled) {
        while (_cleanup.isNotEmpty) {
          await _cleanup.first;
        }
        throw const OperationException(ProblemCode.operationCancelled);
      }
      return await (() async {
        final expected = await _hashFile(
          source,
          _maximumDocumentBytes,
          operation: e.operation,
        );
        final r = await _call('beginWrite', e.operation, {
          'opaqueId': e.nativeId,
          'maximumBytes': expected.bytes,
          'expectedSha256': expected.hash,
        });
        if (r['status'] != 'ready') throw _failure();
        final transfer = r['transferId'];
        if (transfer is! String || transfer.length > 128) throw _failure();
        final input = await source.open(mode: FileMode.read);
        final buffer = Uint8List(_chunkBytes);
        var written = 0;
        try {
          while (true) {
            e.operation.throwIfCancelled();
            final n = await input.readInto(buffer);
            if (n == 0) break;
            written += n;
            if (written > expected.bytes) throw _failure();
            final ack = await _call('writeChunk', e.operation, {
              'transferId': transfer,
              'bytes': Uint8List.sublistView(buffer, 0, n),
            });
            if (ack['status'] != 'ready') throw _failure();
          }
        } finally {
          await input.close();
        }
        if (written != expected.bytes) throw _failure();
        _work(e.operation);
        commitRequested = true;
        final result = await _call('writePrepared', e.operation, {
          'opaqueId': e.nativeId,
          'transferId': transfer,
          'selectedName': selectedName,
          'expectedBytes': expected.bytes,
          'expectedSha256': expected.hash,
        });
        committed = true; // only a native completed result establishes effect
        _affinity(result, e.operation);
        if (result['status'] != 'completed' ||
            result['opaqueId'] != e.nativeId ||
            result['confirmedBytes'] != expected.bytes ||
            result['confirmedSha256'] != expected.hash) {
          throw _failure();
        }
        final effectiveName = result['displayName'];
        if (effectiveName is! String) throw _failure();
        _name(effectiveName);
        final effectiveTarget = DocumentRef._(e.ref.id, effectiveName);
        // This is an ACTUAL second reopened provider read, not the asserted
        // receipt/expected SHA echoed by a transport or an equal-size shortcut.
        final actual = await _read(e, expected.bytes, committing: true);
        if (!actual.matches(expected)) throw _failure();
        await _call('abortWrite', e.operation, {
          'opaqueId': e.nativeId,
          'releaseTarget': true,
        });
        released = true;
        _forget(e);
        return _receipt(
          WriteStatus.completed,
          e.operation.id,
          target: effectiveTarget,
          digest: actual,
        );
      })();
    } catch (error) {
      var residual =
          error is DocumentGatewayException && error.residualPlaceholder;
      // Request submission is NOT commit. Native abort reconciles authoritative
      // effect and preserves all outputs once provider opening has begun.
      try {
        final nativeResidual = await _abort(e);
        committed = committed || e.nativeHasEffect;
        residual = nativeResidual || (!e.nativeEffectKnown && residual);
        await _call('abortWrite', e.operation, {
          'opaqueId': e.nativeId,
          'releaseTarget': true,
        });
        released = true;
        _forget(e);
      } catch (_) {
        residual = true;
        cleanupFailed = true; // preserve exact capability for close/retry
        e.residualKnown = true;
      }
      final p = _problem(error);
      return _receipt(
        p.code == ProblemCode.operationCancelled && !committed && !cleanupFailed
            ? WriteStatus.cancelled
            : WriteStatus.failed,
        e.operation.id,
        target: commitRequested ? e.ref : null,
        problem: p,
        residual: residual,
      );
    } finally {
      if (!released) {
        // Attempt transfer cleanup even if target abort failed. Never ask native
        // to release an un-aborted precommit target or discard its retry key.
        try {
          await _call('abortWrite', e.operation, {
            'opaqueId': e.nativeId,
            'releaseTarget': false,
          });
        } catch (_) {
          /* entry remains owned for close */
        }
        _settleFailedDrain(e);
      }
    }
  }
}
