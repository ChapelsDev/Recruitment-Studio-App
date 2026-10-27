import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/leave_project_guard.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'editor_session_test.dart' show entry;

bool confirm(EditorSession s, CapturedSnapshot h) => s.acknowledgeProjectSave(
  h,
  projectId: h.projectId,
  revision: h.revision,
  sessionGeneration: h.sessionGeneration,
  succeeded: true,
);

void main() {
  test('explicit cancel decision cancels its outstanding save without late abandon', () async {
    final s = EditorSession(Project.blank(id: 'p'));
    addTearDown(s.dispose);
    s.setName('Dirty');
    final before = s.bundle;
    final guard = LeaveProjectGuard(s);
    final done = Completer<bool>();
    var transitions = 0;
    late CapturedSnapshot captured;
    final future = guard.leave(
      LeaveDecision.save,
      save: (h) {
        captured = h;
        expect(confirm(s, h), isTrue);
        return done.future;
      },
      transition: () {
        transitions++;
      },
    );
    expect(await guard.leave(LeaveDecision.cancel), isFalse);
    done.complete(true);
    expect(await future, isFalse);
    expect(transitions, 0);
    expect(s.bundle, same(before));
    expect(s.hasUnsavedChanges, isTrue);
    expect(captured.isReleased, isTrue);
  });
  test('composed replacement resource bounds and live captures preserve old identity on refusal', () async {
    final budget = WorkBudgetController(capacityBytes: 5);
    final s = EditorSession(
      Project.blank(id: 'p'),
      budget: budget,
      historyBytes: 3,
    );
    addTearDown(s.dispose);
    s.attachResource(entry(1));
    final captured = s.captureSnapshot();
    final before = s.bundle;
    final guard = LeaveProjectGuard(s);
    final oversized = entry(2, size: 4);
    final over = ProjectBundle(
      Project.blank(id: 'new').withPhoto(oversized.ref),
      {'photo': oversized.bytes},
    );
    expect(await guard.replaceBundle(over, LeaveDecision.discard), isFalse);
    expect(s.bundle, same(before));
    expect(budget.reservedBytes, 3);
    final resource = entry(3);
    final next = ProjectBundle(
      Project.blank(id: 'new').withPhoto(resource.ref),
      {'photo': resource.bytes},
    );
    expect(await guard.replaceBundle(next, LeaveDecision.discard), isFalse);
    expect(s.bundle, same(before));
    expect(budget.reservedBytes, 3);
    expect(confirm(s, captured), isTrue);
    captured.release();
    s.dispose();
    expect(budget.reservedBytes, 0);
  });
  test('session issued leave permit is single-use even if first transition made no edit', () {
    final s = EditorSession(Project.blank(id: 'p'));
    final attempt = s.beginLeaveAttempt()!;
    var transitions = 0;
    expect(
      attempt.complete(
        discard: false,
        saved: false,
        transition: () {
          transitions++;
        },
      ),
      isTrue,
    );
    expect(
      attempt.complete(
        discard: false,
        saved: false,
        transition: () {
          transitions++;
        },
      ),
      isFalse,
    );
    expect(transitions, 1);
    attempt.end();
    attempt.end();
    s.dispose();
  });
  test('decision enum is exactly save discard cancel and clean leaving invokes no save', () async {
    expect(LeaveDecision.values.map((e) => e.name), [
      'save',
      'discard',
      'cancel',
    ]);
    final s = EditorSession(Project.blank(id: 'p'));
    final guard = LeaveProjectGuard(s);
    var saves = 0;
    var transitions = 0;
    expect(
      await guard.leave(
        LeaveDecision.save,
        save: (_) async {
          saves++;
          return true;
        },
        transition: () {
          transitions++;
        },
      ),
      isTrue,
    );
    expect(saves, 0);
    expect(transitions, 1);
    expect(s.hasConfirmedProjectSave, isFalse);
    s.dispose();
  });
  test('cancel preserves exact dirty bundle without callbacks and discard only authorizes explicit transition', () async {
    final s = EditorSession(Project.blank(id: 'p'));
    s.setName('Dirty');
    final before = s.bundle;
    final guard = LeaveProjectGuard(s);
    var saves = 0;
    var transitions = 0;
    expect(
      await guard.leave(
        LeaveDecision.cancel,
        save: (_) async {
          saves++;
          return true;
        },
        transition: () {
          transitions++;
        },
      ),
      isFalse,
    );
    expect(s.bundle, same(before));
    expect(saves, 0);
    expect(transitions, 0);
    expect(s.hasUnsavedChanges, isTrue);
    expect(
      await guard.leave(
        LeaveDecision.discard,
        transition: () {
          transitions++;
        },
      ),
      isTrue,
    );
    expect(s.bundle, same(before));
    expect(s.hasUnsavedChanges, isTrue);
    expect(transitions, 1);
    s.dispose();
  });
  test(
    'save callback true without actual-bound acknowledgement cannot abandon',
    () async {
      final s = EditorSession(Project.blank(id: 'p'));
      s.setName('Dirty');
      final before = s.bundle;
      final guard = LeaveProjectGuard(s);
      var transitions = 0;
      expect(
        await guard.leave(
          LeaveDecision.save,
          save: (_) async => true,
          transition: () {
            transitions++;
          },
        ),
        isFalse,
      );
      expect(
        await guard.leave(
          LeaveDecision.save,
          transition: () {
            transitions++;
          },
        ),
        isFalse,
      );
      expect(s.bundle, same(before));
      expect(s.hasUnsavedChanges, isTrue);
      expect(transitions, 0);
      s.dispose();
    },
  );
  test('save defers clean baseline until callback true and exact current acknowledgement', () async {
    final s = EditorSession(Project.blank(id: 'p'));
    s.setName('Dirty');
    final guard = LeaveProjectGuard(s);
    final done = Completer<bool>();
    var transitions = 0;
    final future = guard.leave(
      LeaveDecision.save,
      save: (h) {
        expect(confirm(s, h), isTrue);
        expect(s.hasUnsavedChanges, isTrue);
        return done.future;
      },
      transition: () {
        transitions++;
      },
    );
    done.complete(true);
    expect(await future, isTrue);
    expect(s.hasUnsavedChanges, isFalse);
    expect(s.hasConfirmedProjectSave, isTrue);
    expect(transitions, 1);
    s.dispose();
  });
  test('failed thrown or acknowledged false callback preserves dirty state and session', () async {
    final s = EditorSession(Project.blank(id: 'p'));
    s.setName('Dirty');
    final before = s.bundle;
    final guard = LeaveProjectGuard(s);
    for (var mode = 0; mode < 3; mode++) {
      expect(
        await guard.leave(
          LeaveDecision.save,
          save: (h) async {
            if (mode == 1) throw StateError('synthetic IO failure');
            if (mode == 2) expect(confirm(s, h), isTrue);
            return false;
          },
        ),
        isFalse,
      );
      expect(s.bundle, same(before));
      expect(s.hasUnsavedChanges, isTrue);
      expect(s.hasConfirmedProjectSave, isFalse);
    }
    s.dispose();
  });
  test('controlled new edits undo or replacement while awaiting prevent late abandon and clean claims', () async {
    for (final action in [0, 1, 2]) {
      final s = EditorSession(Project.blank(id: 'p'));
      s.setName('Dirty');
      final guard = LeaveProjectGuard(s);
      final done = Completer<bool>();
      late CapturedSnapshot captured;
      var transitions = 0;
      final future = guard.leave(
        LeaveDecision.save,
        save: (h) {
          captured = h;
          expect(confirm(s, h), isTrue);
          return done.future;
        },
        transition: () {
          transitions++;
        },
      );
      if (action == 0) s.setName('New');
      if (action == 1) {
        s.setName('New');
        s.undo();
      }
      if (action == 2) s.replaceProject(s.project.withName('Replacement'));
      final before = s.bundle;
      expect(confirm(s, captured), isFalse);
      done.complete(true);
      expect(await future, isFalse);
      expect(s.bundle, same(before));
      expect(s.hasUnsavedChanges, isTrue);
      expect(transitions, 0);
      s.dispose();
    }
  });
  test('pending cancellation retains capture until callback ends and rejects late acknowledgement', () async {
    final budget = WorkBudgetController(capacityBytes: 30);
    final s = EditorSession(Project.blank(id: 'p'), budget: budget);
    s.attachResource(entry(1));
    final guard = LeaveProjectGuard(s);
    final done = Completer<bool>();
    late CapturedSnapshot captured;
    final future = guard.leave(
      LeaveDecision.save,
      save: (h) {
        captured = h;
        return done.future;
      },
    );
    guard.cancelPending();
    expect(confirm(s, captured), isFalse);
    s.dispose();
    expect(budget.reservedBytes, 3);
    done.complete(true);
    expect(await future, isFalse);
    expect(budget.reservedBytes, 0);
    expect(captured.isReleased, isTrue);
  });
  test('overlapping attempts across separate guards cannot transition twice and release lock on errors', () async {
    final s = EditorSession(Project.blank(id: 'p'));
    s.setName('Dirty');
    final guard = LeaveProjectGuard(s);
    final other = LeaveProjectGuard(s);
    final done = Completer<bool>();
    var transitions = 0;
    final future = guard.leave(
      LeaveDecision.save,
      save: (h) {
        confirm(s, h);
        return done.future;
      },
      transition: () {
        transitions++;
      },
    );
    expect(
      await other.leave(
        LeaveDecision.discard,
        transition: () {
          transitions++;
        },
      ),
      isFalse,
    );
    expect(
      await guard.leave(LeaveDecision.save, save: (_) async => true),
      isFalse,
    );
    done.complete(true);
    expect(await future, isTrue);
    expect(transitions, 1);
    expect(
      await guard.leave(
        LeaveDecision.discard,
        transition: () {
          throw StateError('synthetic transition error');
        },
      ),
      isFalse,
    );
    expect(
      await other.leave(
        LeaveDecision.discard,
        transition: () {
          transitions++;
        },
      ),
      isTrue,
    );
    expect(transitions, 2);
    s.dispose();
  });
  test('composed cancel save discard replacement validates bytes before publishing new identity', () async {
    final budget = WorkBudgetController(capacityBytes: 30);
    final s = EditorSession(Project.blank(id: 'p'), budget: budget);
    s.setName('Dirty');
    s.addSection('s');
    final impact = s.requestRemoveSection('s');
    final guard = LeaveProjectGuard(s);
    final target = Project.blank(id: 'new');
    final before = s.bundle;
    expect(await guard.replaceProject(target, LeaveDecision.cancel), isFalse);
    expect(s.bundle, same(before));
    expect(
      await guard.replaceProject(
        target,
        LeaveDecision.save,
        save: (h) async {
          confirm(s, h);
          return true;
        },
      ),
      isTrue,
    );
    expect(s.project.id, 'new');
    expect(s.canUndo, isFalse);
    expect(s.hasConfirmedProjectSave, isFalse);
    expect(s.hasUnsavedChanges, isFalse);
    s.addSection('s');
    expect(() => s.confirmRemoveSection('s', impact: impact), throwsStateError);
    final dirty = s.bundle;
    expect(
      await guard.replaceProject(
        Project.blank(id: 'absent').withPhoto(entry(4).ref),
        LeaveDecision.discard,
      ),
      isFalse,
    );
    expect(s.bundle, same(dirty));
    final resource = entry(5);
    final replacement = ProjectBundle(
      Project.blank(id: 'third').withPhoto(resource.ref),
      {'photo': resource.bytes},
    );
    expect(
      await guard.replaceBundle(replacement, LeaveDecision.discard),
      isTrue,
    );
    expect(s.project.id, 'third');
    expect(s.bundle.resources['photo'], same(replacement.resources['photo']));
    expect(budget.reservedBytes, 3);
    s.dispose();
    expect(budget.reservedBytes, 0);
  });
}
