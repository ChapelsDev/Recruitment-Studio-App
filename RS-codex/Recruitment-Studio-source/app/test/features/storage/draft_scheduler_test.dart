import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/draft_scheduler.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

class ManualClock implements DraftClock {
  Duration time = Duration.zero;
  final List<ManualTimer> timers = [];
  @override
  Duration get now => time;
  @override
  DraftTimer schedule(Duration delay, void Function() callback) {
    final timer = ManualTimer(time + delay, callback);
    timers.add(timer);
    return timer;
  }

  void advance(Duration duration) {
    final end = time + duration;
    while (true) {
      final due = timers.where((t) => !t.cancelled && t.at <= end).toList()
        ..sort((a, b) => a.at.compareTo(b.at));
      if (due.isEmpty) break;
      final timer = due.first;
      time = timer.at;
      timer.cancelled = true;
      timer.callback();
    }
    time = end;
  }
}

class ManualTimer implements DraftTimer {
  ManualTimer(this.at, this.callback);
  final Duration at;
  final void Function() callback;
  bool cancelled = false;
  @override
  void cancel() {
    cancelled = true;
  }
}

class ControlledRepository implements LocalRepository {
  final List<
    ({
      ProjectBundle bundle,
      WorkOperation operation,
      Completer<SaveReceipt> result,
    })
  >
  calls = [];
  bool automatic = true;
  @override
  Future<SaveReceipt> saveDraft(ProjectBundle bundle, {Operation? operation}) {
    final op = operation! as WorkOperation;
    final result = Completer<SaveReceipt>();
    calls.add((bundle: bundle, operation: op, result: result));
    if (automatic) complete(calls.length - 1);
    return result.future;
  }

  void complete(
    int i, {
    SaveStatus status = SaveStatus.completed,
    int? generation,
  }) {
    final c = calls[i];
    c.result.complete(
      SaveReceipt(
        projectId: c.bundle.project.id,
        revision: c.bundle.project.revision,
        sessionGeneration: generation ?? c.operation.sessionGeneration!,
        snapshotSha256: status == SaveStatus.completed ? 'a' * 64 : null,
        status: status,
        problem: status == SaveStatus.failed
            ? const Problem(
                code: ProblemCode.ioFailure,
                severity: ProblemSeverity.error,
              )
            : null,
      ),
    );
  }

  @override
  Future<ProjectBundle?> recoverDraft(String projectId) async => null;
  @override
  Future<List<ProjectSummary>> listProjects() async => [];
  @override
  Future<void> saveProfile(CompanyProfile profile) async {}
  @override
  Future<CompanyProfile?> loadProfile() async => null;
}

Future<void> drain() async {
  for (var i = 0; i < 12; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  late ManualClock clock;
  late ControlledRepository repository;
  late DraftScheduler scheduler;
  late WorkBudgetController budget;
  late List<SaveReceipt> receipts;
  ProjectBundle bundle([String name = '', String id = 'p1']) =>
      ProjectBundle(Project.blank(id: id).withName(name), const {});
  setUp(() {
    clock = ManualClock();
    repository = ControlledRepository();
    budget = WorkBudgetController();
    receipts = [];
    scheduler = DraftScheduler(
      repository,
      clock,
      budget: budget,
      onReceipt: receipts.add,
    );
  });
  tearDown(() async {
    await scheduler.close(checkpoint: false);
    expect(budget.reservedBytes, 0);
  });
  test(
    'debounce persists latest immutable edit exactly after two idle seconds',
    () async {
      scheduler.changed(bundle('first'), sessionGeneration: 1);
      clock.advance(const Duration(seconds: 1));
      scheduler.changed(bundle('second'), sessionGeneration: 2);
      clock.advance(const Duration(milliseconds: 1999));
      await drain();
      expect(repository.calls, isEmpty);
      clock.advance(const Duration(milliseconds: 1));
      await drain();
      expect(repository.calls.single.bundle.project.name, 'second');
      expect(receipts.single.sessionGeneration, 2);
    },
  );
  test('continuous editing checkpoints at ten seconds without resetting maximum timer', () async {
    scheduler.changed(bundle('0'));
    for (var i = 1; i <= 9; i++) {
      clock.advance(const Duration(seconds: 1));
      scheduler.changed(bundle('$i'), sessionGeneration: i);
    }
    expect(repository.calls, isEmpty);
    clock.advance(const Duration(seconds: 1));
    await drain();
    expect(repository.calls.single.bundle.project.name, '9');
  });
  test(
    'checkpoint is immediate and does not duplicate idle timer work',
    () async {
      scheduler.changed(bundle('manual'), sessionGeneration: 4);
      expect((await scheduler.checkpoint())!.status, SaveStatus.completed);
      clock.advance(const Duration(seconds: 20));
      await drain();
      expect(repository.calls, hasLength(1));
    },
  );
  test('late A completion is isolated after activating B even when A reports completed', () async {
    repository.automatic = false;
    scheduler.changed(bundle('A', 'a'), sessionGeneration: 5);
    final a = scheduler.checkpoint();
    await drain();
    scheduler.activate('b', 6);
    scheduler.changed(bundle('B', 'b'), sessionGeneration: 6);
    expect(repository.calls.single.operation.isCancelled, isTrue);
    repository.complete(0);
    await a;
    await drain();
    expect(receipts, isEmpty);
    final b = scheduler.checkpoint();
    await drain();
    repository.complete(1);
    await b;
    expect(receipts.single.projectId, 'b');
  });
  test(
    'same project reopened generation rejects prior callback and stale edits',
    () async {
      repository.automatic = false;
      scheduler.changed(bundle('old'), sessionGeneration: 7);
      final old = scheduler.checkpoint();
      await drain();
      scheduler.activate('p1', 8);
      scheduler.changed(bundle('new'), sessionGeneration: 8);
      scheduler.changed(bundle('stale'), sessionGeneration: 7);
      repository.complete(0);
      await old;
      expect(receipts, isEmpty);
      final next = scheduler.checkpoint();
      await drain();
      repository.complete(1);
      await next;
      expect(repository.calls.last.bundle.project.name, 'new');
    },
  );
  test(
    'edits during in-flight IO serialize and coalesce to latest revision',
    () async {
      repository.automatic = false;
      final first = bundle('first');
      scheduler.changed(first);
      final a = scheduler.checkpoint();
      await drain();
      scheduler.changed(
        first.withProject(first.project.withName('second')),
        sessionGeneration: 1,
      );
      scheduler.changed(
        first.withProject(first.project.withName('second').withName('third')),
        sessionGeneration: 2,
      );
      clock.advance(const Duration(seconds: 10));
      await drain();
      expect(repository.calls, hasLength(1));
      repository.complete(0);
      await a;
      await drain();
      expect(repository.calls, hasLength(2));
      expect(repository.calls.last.bundle.project.name, 'third');
      repository.complete(1);
      await drain();
      expect(receipts.single.sessionGeneration, 2);
    },
  );
  test(
    'failed attempt remains pending and manual retry can confirm it',
    () async {
      repository.automatic = false;
      scheduler.changed(bundle('retry'), sessionGeneration: 1);
      final failed = scheduler.checkpoint();
      await drain();
      repository.complete(0, status: SaveStatus.failed);
      expect((await failed)!.status, SaveStatus.failed);
      expect(scheduler.hasPendingChanges, isTrue);
      final retry = scheduler.checkpoint();
      await drain();
      repository.complete(1);
      await retry;
      expect(scheduler.hasPendingChanges, isFalse);
      expect(receipts.last.status, SaveStatus.completed);
    },
  );
  test('receipt with wrong generation cannot confirm current state', () async {
    repository.automatic = false;
    scheduler.changed(bundle('current'), sessionGeneration: 1);
    final pending = scheduler.checkpoint();
    await drain();
    repository.complete(0, generation: 0);
    await pending;
    expect(receipts, isEmpty);
    expect(scheduler.hasPendingChanges, isTrue);
  });
  test(
    'cancel close drains active work without accepting a late callback',
    () async {
      repository.automatic = false;
      scheduler.changed(bundle('active'));
      final active = scheduler.checkpoint();
      await drain();
      final closed = scheduler.close(checkpoint: false);
      expect(repository.calls.single.operation.isCancelled, isTrue);
      repository.complete(0);
      await active;
      await closed;
      expect(receipts, isEmpty);
      expect(() => scheduler.changed(bundle()), throwsStateError);
      clock.advance(const Duration(seconds: 20));
      expect(repository.calls, hasLength(1));
    },
  );
  test('default close checkpoints pending content and is idempotent', () async {
    scheduler.changed(bundle('close'));
    expect((await scheduler.close())!.status, SaveStatus.completed);
    await scheduler.close();
    expect(repository.calls, hasLength(1));
  });
  test('refused replacement preserves prior pending snapshot and operation credits', () async {
    scheduler.changed(bundle('first', 'a'), sessionGeneration: 1);
    final next = bundle('second', 'b');
    final before = AdmissionBudget.shared.reservedBytes;
    final held = AdmissionBudget.shared.reserve(
      AdmissionBudget.shared.capacityBytes - before - 4096,
    );
    try {
      expect(
        () => scheduler.changed(next, sessionGeneration: 2),
        throwsA(isA<CapacityExceeded>()),
      );
    } finally {
      held.release();
    }
    await drain();
    expect(AdmissionBudget.shared.reservedBytes, lessThanOrEqualTo(before));
    await scheduler.checkpoint();
    expect(repository.calls, hasLength(1));
    expect(repository.calls.single.bundle.project.name, 'first');
  });
  test(
    'autosave confirmation never clears editor unsaved project changes',
    () async {
      final session = EditorSession(Project.blank(id: 'p1'), budget: budget);
      session.setName('dirty');
      final captured = session.captureSnapshot();
      scheduler.changed(
        captured.bundle,
        sessionGeneration: captured.sessionGeneration,
      );
      final receipt = (await scheduler.checkpoint())!;
      expect(
        session.acknowledgeDraft(
          captured,
          projectId: receipt.projectId,
          revision: receipt.revision,
          sessionGeneration: receipt.sessionGeneration,
          succeeded: receipt.status == SaveStatus.completed,
        ),
        isTrue,
      );
      expect(session.hasUnsavedChanges, isTrue);
      expect(session.hasConfirmedProjectSave, isFalse);
      captured.release();
      session.dispose();
    },
  );
}
