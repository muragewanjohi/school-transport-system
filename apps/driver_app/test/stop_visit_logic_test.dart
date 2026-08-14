import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/stop_visit_logic.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

void main() {
  group('resolveStopExit', () {
    test('Complete Stop → completed without admin alert', () {
      final result = resolveStopExit(
        reason: StopExitReason.completePressed,
        studentsActioned: 0,
      );
      expect(result.outcome, StopVisitOutcome.completed);
      expect(result.alertAdmin, isFalse);
    });

    test('Skip Stop → skipped with admin alert', () {
      final result = resolveStopExit(
        reason: StopExitReason.skipPressed,
        studentsActioned: 0,
      );
      expect(result.outcome, StopVisitOutcome.skipped);
      expect(result.alertAdmin, isTrue);
    });

    test('leave without complete or student action → visited with alert', () {
      final result = resolveStopExit(
        reason: StopExitReason.leftGeofence,
        studentsActioned: 0,
      );
      expect(result.outcome, StopVisitOutcome.visited);
      expect(result.alertAdmin, isTrue);
    });

    test('leave after picking students → completed without alert', () {
      final result = resolveStopExit(
        reason: StopExitReason.leftGeofence,
        studentsActioned: 1,
      );
      expect(result.outcome, StopVisitOutcome.completed);
      expect(result.alertAdmin, isFalse);
    });
  });

  group('dwellSeconds / formatDwell', () {
    test('records elapsed seconds between arrival and departure', () {
      final arrived = DateTime.utc(2026, 8, 14, 7, 0, 0);
      final departed = DateTime.utc(2026, 8, 14, 7, 2, 15);
      expect(dwellSeconds(arrivedAt: arrived, departedAt: departed), 135);
      expect(formatDwell(135), '2m 15s');
    });

    test('no arrival records 0 dwell', () {
      expect(
        dwellSeconds(arrivedAt: null, departedAt: DateTime.utc(2026, 8, 14, 7, 2, 15)),
        0,
      );
    });
  });

  group('shouldAutoOpenBoardingDrawer', () {
    test('arriving at the next unresolved stop opens the drawer', () {
      expect(
        shouldAutoOpenBoardingDrawer(
          arrivedStopId: 's1',
          nextStopId: 's1',
          alreadyOpenedStopId: null,
          drawerOpen: false,
        ),
        isTrue,
      );
    });

    test('does not reopen for the same arrival', () {
      expect(
        shouldAutoOpenBoardingDrawer(
          arrivedStopId: 's1',
          nextStopId: 's1',
          alreadyOpenedStopId: 's1',
          drawerOpen: false,
        ),
        isFalse,
      );
    });

    test('does not open when still approaching a different stop', () {
      expect(
        shouldAutoOpenBoardingDrawer(
          arrivedStopId: null,
          nextStopId: 's1',
          alreadyOpenedStopId: null,
          drawerOpen: false,
        ),
        isFalse,
      );
    });
  });

  group('firstUnresolvedStop', () {
    final stops = [
      {'id': 'a', 'sequence_no': 1},
      {'id': 'b', 'sequence_no': 2},
    ];

    test('returns first stop without an outcome', () {
      final next = firstUnresolvedStop(
        stops: stops,
        outcomes: { 'a': StopVisitOutcome.completed },
      );
      expect(next?['id'], 'b');
    });

    test('skipped stops are resolved and skipped on the map as not visited', () {
      expect(
        stopMarkerState(
          sequenceIndex: 0,
          stopId: 'a',
          visitedStopIds: {},
          nextStopId: 'b',
          orderedStopIds: ['a', 'b'],
          stopOutcomes: { 'a': StopVisitOutcome.skipped },
        ),
        StopMarkerState.notVisited,
      );
    });
  });

  group('shouldOverwriteOutcome', () {
    test('completed is not overwritten by visited', () {
      expect(
        shouldOverwriteOutcome(StopVisitOutcome.completed, StopVisitOutcome.visited),
        isFalse,
      );
    });
  });
}
