import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

void main() {
  group('computeAttendanceProgress', () {
    test('pickup roster Present without trip attendance is 0 picked', () {
      final progress = computeAttendanceProgress([
        {'id': '1', 'status': 'Present'},
        {'id': '2', 'status': 'Present'},
        {'id': '3', 'status': 'Present'},
      ], isPickup: true);
      expect(progress.boarded, 0);
      expect(progress.total, 3);
      expect(progress.remaining, 3);
      expect(progress.fraction, 0);
    });

    test('pickup counts boarded attendance not roster Present', () {
      final progress = computeAttendanceProgress([
        {'id': '1', 'status': 'Present', 'attendance': 'boarded'},
        {'id': '2', 'status': 'Present', 'attendance': 'pending'},
        {'id': '3', 'status': 'Present'},
        {'id': '4', 'status': 'Absent', 'attendance': 'boarded'},
      ], isPickup: true);
      expect(progress.boarded, 2);
      expect(progress.total, 4);
      expect(progress.remaining, 2);
      expect(progress.fraction, 0.5);
    });

    test('dropoff counts dropped_off attendance not roster Absent', () {
      final progress = computeAttendanceProgress([
        {'id': '1', 'status': 'Absent', 'attendance': 'dropped_off'},
        {'id': '2', 'status': 'Absent'},
        {'id': '3', 'status': 'Present', 'attendance': 'boarded'},
        {'id': '4', 'status': 'Present', 'attendance': 'pending'},
      ], isPickup: false);
      expect(progress.boarded, 1);
      expect(progress.total, 4);
      expect(progress.remaining, 3);
    });
  });

  group('attendanceForStatusUpdate', () {
    test('pickup Present → boarded', () {
      expect(attendanceForStatusUpdate(isPickup: true, status: 'Present'), 'boarded');
    });
    test('pickup Absent → absent', () {
      expect(attendanceForStatusUpdate(isPickup: true, status: 'Absent'), 'absent');
    });
    test('dropoff Absent → dropped_off', () {
      expect(attendanceForStatusUpdate(isPickup: false, status: 'Absent'), 'dropped_off');
    });
    test('dropoff Present → boarded', () {
      expect(attendanceForStatusUpdate(isPickup: false, status: 'Present'), 'boarded');
    });
  });

  group('mergeManifestAttendance', () {
    test('applies boarded from manifests and defaults others to pending', () {
      final merged = mergeManifestAttendance(
        students: [
          {'id': '1', 'status': 'Present'},
          {'id': '2', 'status': 'Present'},
        ],
        manifests: [
          {'student_id': '1', 'attendance': 'boarded'},
        ],
      );
      expect(merged[0]['attendance'], 'boarded');
      expect(merged[1]['attendance'], 'pending');
    });
  });

  group('attendanceDoneWord', () {
    test('pickup → picked', () {
      expect(attendanceDoneWord(isPickup: true), 'picked');
    });
    test('dropoff → dropped', () {
      expect(attendanceDoneWord(isPickup: false), 'dropped');
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
