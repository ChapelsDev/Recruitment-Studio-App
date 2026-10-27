import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_controls.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

class _RetirementProbe extends StatefulWidget {
  const _RetirementProbe({required this.child, required this.onRetire});
  final Widget child;
  final VoidCallback onRetire;
  @override
  State<_RetirementProbe> createState() => _RetirementProbeState();
}

class _RetirementProbeState extends State<_RetirementProbe> {
  @override
  Widget build(BuildContext context) => widget.child;
  @override
  void dispose() {
    widget.onRetire();
    super.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: child));
  EditorActionButton action(int request, [VoidCallback? pressed]) =>
      EditorActionButton(
        key: const Key('owner'),
        buttonKey: const Key('action'),
        label: 'Correct',
        focusRequest: request,
        onPressed: pressed,
      );

  testWidgets(
    'corrective focus owner pays one fixed ticket and preserves ordinary focus',
    (tester) async {
      await tester.pumpWidget(wrap(const SizedBox()));
      final bytes = AdmissionBudget.shared.reservedBytes;
      final tickets = AdmissionBudget.shared.ticketCount;
      var calls = 0;
      await tester.pumpWidget(wrap(action(1, () => calls++)));
      await tester.pumpAndSettle();
      final node = tester
          .widget<TextButton>(find.byKey(const Key('action')))
          .focusNode!;
      expect(node.hasFocus, isTrue);
      expect(calls, 0);
      expect(AdmissionBudget.shared.reservedBytes - bytes, 4096);
      expect(AdmissionBudget.shared.ticketCount - tickets, 1);
      for (var request = 2; request < 6; request++) {
        await tester.pumpWidget(wrap(action(request, () => calls++)));
        await tester.pumpAndSettle();
        expect(
          tester.widget<TextButton>(find.byKey(const Key('action'))).focusNode,
          same(node),
        );
        expect(node.hasFocus, isTrue);
        expect(AdmissionBudget.shared.reservedBytes - bytes, 4096);
      }
      await tester.pumpWidget(wrap(const SizedBox()));
      await tester.pump();
      expect(AdmissionBudget.shared.reservedBytes, bytes);
      expect(AdmissionBudget.shared.ticketCount, tickets);
    },
  );

  testWidgets(
    'queued corrective focus callback keeps credit until retirement after unmount',
    (tester) async {
      await tester.pumpWidget(wrap(const SizedBox()));
      final bytes = AdmissionBudget.shared.reservedBytes;
      int? atUnmount;
      await tester.pumpWidget(
        wrap(
          _RetirementProbe(
            onRetire: () => atUnmount = AdmissionBudget.shared.reservedBytes,
            child: action(0, () {}),
          ),
        ),
      );
      final element = tester.element(find.byType(EditorActionButton));
      // Direct framework update queues the callback before the next frame. The
      // next pump removes the owner before that callback is allowed to execute.
      element.owner!.buildScope(
        tester.binding.rootElement!,
        () => element.update(action(9, () {})),
      );
      expect(AdmissionBudget.shared.reservedBytes - bytes, 4096);
      int? atRetirement;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        // FIFO: owner callback has now skipped the disposed node and refunded.
        atRetirement = AdmissionBudget.shared.reservedBytes;
      });
      await tester.pumpWidget(wrap(const SizedBox()));
      expect(
        atUnmount,
        bytes + 4096,
        reason: 'Callback still owns its prepaid state after unmount',
      );
      expect(atRetirement, bytes);
      expect(AdmissionBudget.shared.reservedBytes, bytes);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'cancelled queued request does not steal focus or invoke action',
    (tester) async {
      var calls = 0;
      await tester.pumpWidget(wrap(action(0, () => calls++)));
      final element = tester.element(find.byType(EditorActionButton));
      element.owner!.buildScope(tester.binding.rootElement!, () {
        element.update(action(1, () => calls++));
        element.update(action(0, () => calls++));
      });
      await tester.pump();
      expect(
        tester
            .widget<TextButton>(find.byKey(const Key('action')))
            .focusNode!
            .hasFocus,
        isFalse,
      );
      expect(calls, 0);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'focus admission refusal creates no unpaid button or queued focus owner',
    (tester) async {
      await tester.pumpWidget(wrap(const SizedBox()));
      final pressure = AdmissionBudget.shared.reserve(
        AdmissionBudget.shared.capacityBytes -
            AdmissionBudget.shared.reservedBytes,
      );
      final bytes = AdmissionBudget.shared.reservedBytes;
      final tickets = AdmissionBudget.shared.ticketCount;
      try {
        await tester.pumpWidget(wrap(action(1, () {})));
        await tester.pump();
        expect(
          find.byKey(const Key('editor-capacity-refusal')),
          findsOneWidget,
        );
        expect(find.byKey(const Key('action')), findsNothing);
        expect(AdmissionBudget.shared.reservedBytes, bytes);
        expect(AdmissionBudget.shared.ticketCount, tickets);
        await tester.pumpWidget(wrap(const SizedBox()));
        expect(AdmissionBudget.shared.reservedBytes, bytes);
      } finally {
        pressure.release();
      }
    },
  );
}
