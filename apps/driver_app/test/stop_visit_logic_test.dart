import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/stop_visit_logic.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

void main() {
  final arrived = DateTime.utc(2026, 8, 18, 7, 0, 0);

  group('skipStopAllowed', () {
    test('Skip is locked until minimum dwell', () {
      expect(
        skipStopAllowed(
          arrivedAt: arrived,
          now: arrived.add(const Duration(seconds: 30)),
          minStopDwellSeconds: 90,
        ),
        isFalse,
      );
    });

    test('Skip is allowed after minimum dwell', () {
      expect(
        skipStopAllowed(
          arrivedAt: arrived,
          now: arrived.add(const Duration(seconds: 90)),
          minStopDwellSeconds: 90,
        ),
        isTrue,
      );
    });

    test('Skip is locked when the bus has not arrived', () {
      expect(
        skipStopAllowed(arrivedAt: null, now: arrived, minStopDwellSeconds: 90),
        isFalse,
      );
    });
  });

  group('resolveStopExit', () {
    test('Complete Stop → completed without admin alert; remaining Pending become Absent', () {
      final result = resolveStopExit(
        reason: StopExitReason.completePressed,
        studentsActioned: 0,
      );
      expect(result?.outcome, StopVisitOutcome.completed);
      expect(result?.alertAdmin, isFalse);
      expect(result?.markRemainingAbsent, isTrue);
    });

    test('Skip Stop after min dwell → skipped with admin alert', () {
      final result = resolveStopExit(
        reason: StopExitReason.skipPressed,
        studentsActioned: 0,
        arrivedAt: arrived,
        now: arrived.add(const Duration(seconds: 90)),
        minStopDwellSeconds: 90,
      );
      expect(result?.outcome, StopVisitOutcome.skipped);
      expect(result?.alertAdmin, isTrue);
      expect(result?.markRemainingAbsent, isTrue);
    });

    test('Skip before min dwell is not allowed', () {
      expect(
        resolveStopExit(
          reason: StopExitReason.skipPressed,
          studentsActioned: 0,
          arrivedAt: arrived,
          now: arrived.add(const Duration(seconds: 30)),
          minStopDwellSeconds: 90,
        ),
        isNull,
      );
    });

    test('Leave before dwell does not resolve visited yet', () {
      final result = resolveStopExit(
        reason: StopExitReason.leftGeofence,
        studentsActioned: 0,
        arrivedAt: arrived,
        now: arrived.add(const Duration(seconds: 20)),
        minStopDwellSeconds: 90,
      );
      expect(result, isNull);
    });

    test('Leave after dwell with zero ticks marks visited and Absent', () {
      final result = resolveStopExit(
        reason: StopExitReason.leftGeofence,
        studentsActioned: 0,
        arrivedAt: arrived,
        now: arrived.add(const Duration(seconds: 90)),
        minStopDwellSeconds: 90,
      );
      expect(result?.outcome, StopVisitOutcome.visited);
      expect(result?.alertAdmin, isTrue);
      expect(result?.markRemainingAbsent, isTrue);
    });

    test('Leave with at least one tick completes immediately without waiting', () {
      final result = resolveStopExit(
        reason: StopExitReason.leftGeofence,
        studentsActioned: 1,
        arrivedAt: arrived,
        now: arrived.add(const Duration(seconds: 10)),
        minStopDwellSeconds: 90,
      );
      expect(result?.outcome, StopVisitOutcome.completed);
      expect(result?.alertAdmin, isFalse);
      expect(result?.markRemainingAbsent, isTrue);
    });
  });

  group('stopApproachPhase', () {
    test('outside the stage is Approaching', () {
      expect(
        stopApproachPhase(atStop: false, leftBeforeMinDwell: false),
        StopApproachPhase.approaching,
      );
      expect(stopPhaseEyebrow(StopApproachPhase.approaching), 'APPROACHING');
    });

    test('inside the stage is You’re at', () {
      expect(
        stopApproachPhase(atStop: true, leftBeforeMinDwell: false),
        StopApproachPhase.arrived,
      );
      expect(stopPhaseEyebrow(StopApproachPhase.arrived), "YOU'RE AT THIS STOP");
    });

    test('left before min dwell asks the driver to return', () {
      expect(
        stopApproachPhase(atStop: false, leftBeforeMinDwell: true),
        StopApproachPhase.returnToWait,
      );
    });
  });

  group('dwellSeconds / formatDwell', () {
    test('records elapsed seconds between arrival and departure', () {
      final start = DateTime.utc(2026, 8, 14, 7, 0, 0);
      final departed = DateTime.utc(2026, 8, 14, 7, 2, 15);
      expect(dwellSeconds(arrivedAt: start, departedAt: departed), 135);
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

    test('does not open at a school terminal', () {
      expect(
        shouldAutoOpenBoardingDrawer(
          arrivedStopId: 'school',
          nextStopId: 'school',
          alreadyOpenedStopId: null,
          drawerOpen: false,
          skipSchoolTerminal: true,
        ),
        isFalse,
      );
    });

    test('does not open when the stop roster is empty', () {
      expect(
        shouldAutoOpenBoardingDrawer(
          arrivedStopId: 's1',
          nextStopId: 's1',
          alreadyOpenedStopId: null,
          drawerOpen: false,
          studentsAtStop: 0,
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

  group('markPendingAbsentAtStop', () {
    test('Complete Stop marks remaining Pending Absent and keeps boarded', () {
      final updated = markPendingAbsentAtStop(
        students: [
          {'id': 'a', 'pickup_stop_id': 's1', 'attendance': 'boarded', 'status': 'Present'},
          {'id': 'b', 'pickup_stop_id': 's1', 'attendance': 'pending', 'status': 'Absent'},
          {'id': 'c', 'pickup_stop_id': 's2', 'attendance': 'pending', 'status': 'Absent'},
        ],
        stopId: 's1',
        isPickup: true,
      );
      expect(updated[0]['attendance'], 'boarded');
      expect(updated[1]['attendance'], 'absent');
      expect(updated[2]['attendance'], 'pending');
    });
  });
}
