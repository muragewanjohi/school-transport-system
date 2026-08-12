import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

void main() {
  group('computeAttendanceProgress', () {
    test('counts Present as boarded and remaining', () {
      final progress = computeAttendanceProgress([
        {'id': '1', 'status': 'Present'},
        {'id': '2', 'status': 'Present'},
        {'id': '3', 'status': 'Absent'},
        {'id': '4', 'status': 'Absent'},
      ]);
      expect(progress.boarded, 2);
      expect(progress.total, 4);
      expect(progress.remaining, 2);
      expect(progress.fraction, 0.5);
    });
  });

  group('tripBoardingCtaLabel', () {
    test('PICKUP → Pickup Students', () {
      expect(tripBoardingCtaLabel('PICKUP'), 'Pickup Students');
    });
    test('DROPOFF → DropOff Students', () {
      expect(tripBoardingCtaLabel('DROPOFF'), 'DropOff Students');
    });
  });

  group('stopMarkerState', () {
    const ordered = ['a', 'b', 'c', 'd'];

    test('visited is completed', () {
      expect(
        stopMarkerState(
          sequenceIndex: 0,
          stopId: 'a',
          visitedStopIds: {'a'},
          nextStopId: 'b',
          orderedStopIds: ordered,
        ),
        StopMarkerState.completed,
      );
    });

    test('next stop is next', () {
      expect(
        stopMarkerState(
          sequenceIndex: 1,
          stopId: 'b',
          visitedStopIds: {'a'},
          nextStopId: 'b',
          orderedStopIds: ordered,
        ),
        StopMarkerState.next,
      );
    });

    test('after next is upcoming', () {
      expect(
        stopMarkerState(
          sequenceIndex: 2,
          stopId: 'c',
          visitedStopIds: {'a'},
          nextStopId: 'b',
          orderedStopIds: ordered,
        ),
        StopMarkerState.upcoming,
      );
    });

    test('skipped before next is notVisited', () {
      expect(
        stopMarkerState(
          sequenceIndex: 0,
          stopId: 'a',
          visitedStopIds: {},
          nextStopId: 'c',
          orderedStopIds: ordered,
        ),
        StopMarkerState.notVisited,
      );
    });
  });

  group('studentsForStop', () {
    final students = [
      {'id': '1', 'pickup_stop_id': 's1', 'dropoff_stop_id': 's9'},
      {'id': '2', 'pickup_stop_id': 's2', 'dropoff_stop_id': 's1'},
    ];

    test('filters pickup students', () {
      final list = studentsForStop(students: students, stopId: 's1', isPickup: true);
      expect(list.map((s) => s['id']), ['1']);
    });

    test('filters dropoff students', () {
      final list = studentsForStop(students: students, stopId: 's1', isPickup: false);
      expect(list.map((s) => s['id']), ['2']);
    });
  });

  group('estimateEtaMinutes', () {
    test('uses speed when moving', () {
      // 1000 m at 10 m/s → 100 s → 2 min ceil
      final eta = estimateEtaMinutes(
        busLat: 0,
        busLng: 0,
        stopLat: 0,
        stopLng: 1000 / 111320, // ~1000 m east at equator scale
        speedMetersPerSec: 10,
      );
      expect(eta, isNotNull);
      expect(eta! >= 1, isTrue);
    });

    test('falls back when stationary', () {
      final eta = estimateEtaMinutes(
        busLat: null,
        busLng: null,
        stopLat: 1,
        stopLng: 1,
        speedMetersPerSec: 0,
        fallbackMinutes: 7,
      );
      expect(eta, 7);
    });
  });
}
