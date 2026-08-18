import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/stop_visit_logic.dart';
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

  group('boardingActionLabel', () {
    test('pickup → Boarded', () {
      expect(boardingActionLabel(isPickup: true), 'Boarded');
    });
    test('dropoff → Dropped off', () {
      expect(boardingActionLabel(isPickup: false), 'Dropped off');
    });
  });

  group('studentListAttendance', () {
    test('pending stays pending', () {
      expect(
        studentListAttendance({'attendance': 'pending'}, isPickup: true),
        StudentListAttendance.pending,
      );
    });
    test('pickup boarded is actioned', () {
      expect(
        studentListAttendance({'attendance': 'boarded'}, isPickup: true),
        StudentListAttendance.actioned,
      );
    });
    test('dropoff dropped_off is actioned', () {
      expect(
        studentListAttendance({'attendance': 'dropped_off'}, isPickup: false),
        StudentListAttendance.actioned,
      );
    });
    test('absent has no action', () {
      expect(
        studentListAttendance({'attendance': 'absent'}, isPickup: true),
        StudentListAttendance.absent,
      );
      expect(
        studentListAttendance({'attendance': 'absent'}, isPickup: false),
        StudentListAttendance.absent,
      );
    });
  });

  group('parseStudentGuardians', () {
    test('reads name and phone from a list', () {
      final contacts = parseStudentGuardians([
        {'name': 'Jane', 'phone': '+254700000002'},
      ]);
      expect(contacts, hasLength(1));
      expect(contacts.first.name, 'Jane');
      expect(contacts.first.phone, '+254700000002');
    });
    test('reads photo_url for the guardian thumbnail', () {
      final contacts = parseStudentGuardians([
        {
          'name': 'Jane',
          'phone': '+254700000002',
          'photo_url': 'https://cdn.example/jane.png',
        },
      ]);
      expect(contacts.first.photoUrl, 'https://cdn.example/jane.png');
    });
    test('blank photo_url is treated as missing', () {
      final contacts = parseStudentGuardians([
        {'name': 'Jane', 'phone': '+254700000002', 'photo_url': '  '},
      ]);
      expect(contacts.first.photoUrl, isNull);
    });
  });

  group('uniqueTripGuardians', () {
    test('lists each guardian once across students', () {
      final guardians = uniqueTripGuardians([
        {
          'id': '1',
          'guardians': [
            {'name': 'Jane', 'phone': '+254700000002'},
          ],
        },
        {
          'id': '2',
          'guardians': [
            {'name': 'Jane', 'phone': '+254 700 000 002'},
            {'name': 'Paul', 'phone': '+254700000003'},
          ],
        },
      ]);
      expect(guardians.map((g) => g.name).toList(), ['Jane', 'Paul']);
    });
  });

  group('studentMatchesQuery', () {
    test('matches a guardian name', () {
      expect(
        studentMatchesQuery({
          'name': 'Amina',
          'guardians': [
            {'name': 'Jane Wanjiku', 'phone': '+254700000002'},
          ],
        }, 'jane'),
        isTrue,
      );
    });
  });

  group('guardianTelUri', () {
    test('builds a tel URI from a Kenyan mobile', () {
      expect(guardianTelUri('+254700000002')?.toString(), 'tel:+254700000002');
    });
    test('rejects a number that is too short', () {
      expect(guardianTelUri('123'), isNull);
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

    test('visited outcome is visited marker', () {
      expect(
        stopMarkerState(
          sequenceIndex: 0,
          stopId: 'a',
          visitedStopIds: {},
          nextStopId: 'b',
          orderedStopIds: ordered,
          stopOutcomes: {'a': StopVisitOutcome.visited},
        ),
        StopMarkerState.visited,
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

  group('formatPickedSummary', () {
    test('pickup uses of and picked', () {
      expect(
        formatPickedSummary(boarded: 8, total: 24, isPickup: true),
        '8 of 24 picked',
      );
    });
    test('dropoff uses of and dropped', () {
      expect(
        formatPickedSummary(boarded: 5, total: 12, isPickup: false),
        '5 of 12 dropped',
      );
    });
  });

  group('stopProgressSegments', () {
    test('marks completed, current, and upcoming', () {
      final segments = stopProgressSegments(
        orderedStopIds: ['a', 'b', 'c'],
        outcomes: {'a': StopVisitOutcome.completed},
        nextStopId: 'b',
      );
      expect(segments.map((s) => s.kind).toList(), [
        StopProgressKind.completed,
        StopProgressKind.current,
        StopProgressKind.upcoming,
      ]);
    });
  });

  group('stopAfter', () {
    test('returns the stop after the given id', () {
      final next = stopAfter(
        stops: [
          {'id': 'a', 'name': 'One', 'sequence_no': 1},
          {'id': 'b', 'name': 'Two', 'sequence_no': 2},
        ],
        stopId: 'a',
      );
      expect(next?['id'], 'b');
    });
    test('returns null at the last stop', () {
      final next = stopAfter(
        stops: [
          {'id': 'a', 'sequence_no': 1},
        ],
        stopId: 'a',
      );
      expect(next, isNull);
    });
  });
}
