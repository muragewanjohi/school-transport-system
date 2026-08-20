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

  group('dropoffTripReadyToStart', () {
    test('empty roster is ready', () {
      expect(dropoffTripReadyToStart([]), isTrue);
    });
    test('boarded and absent is ready', () {
      expect(
        dropoffTripReadyToStart([
          {'attendance': 'boarded'},
          {'attendance': 'absent'},
        ]),
        isTrue,
      );
    });
    test('pending is not ready', () {
      expect(
        dropoffTripReadyToStart([
          {'attendance': 'boarded'},
          {'attendance': 'pending'},
        ]),
        isFalse,
      );
    });
    test('pendingCount 0 is ready', () {
      expect(dropoffTripReadyFromCounts(pendingCount: 0), isTrue);
    });
    test('pendingCount > 0 is not ready', () {
      expect(dropoffTripReadyFromCounts(pendingCount: 3), isFalse);
    });
    test('missing counts without rows is not ready', () {
      expect(dropoffTripReadyFromCounts(), isFalse);
    });
  });

  group('attendanceForCampusBoarding', () {
    test('Present → boarded', () {
      expect(attendanceForCampusBoarding('Present'), 'boarded');
    });
    test('Absent → absent not dropped_off', () {
      expect(attendanceForCampusBoarding('Absent'), 'absent');
    });
  });

  group('homeManifestCtaLabel', () {
    test('drop-off Home CTA is Board Students', () {
      expect(homeManifestCtaLabel(isPickup: false), 'BOARD STUDENTS');
    });
    test('pickup Home CTA stays Pickup Students', () {
      expect(homeManifestCtaLabel(isPickup: true), 'PICKUP STUDENTS');
    });
  });

  group('flattenTripManifestRows', () {
    test('uses trip run nested student and manifest id', () {
      final rows = flattenTripManifestRows([
        {
          'id': 'man-1',
          'student_id': 'std-1',
          'attendance': 'pending',
          'student': {'id': 'std-1', 'name': 'Amina', 'grade': 'Grade 3'},
        },
      ]);
      expect(rows, hasLength(1));
      expect(rows.first['id'], 'std-1');
      expect(rows.first['manifest_id'], 'man-1');
      expect(rows.first['name'], 'Amina');
      expect(rows.first['attendance'], 'pending');
    });
  });

  group('campusBoardingCounts', () {
    test('labels boarded absent and remaining', () {
      final counts = campusBoardingCounts([
        {'attendance': 'boarded'},
        {'attendance': 'absent'},
        {'attendance': 'pending'},
      ]);
      expect(counts.progressLabel, '1 boarded · 1 absent · 1 remaining');
    });
  });

  group('campusToggleSelection', () {
    test('pending is neither boarded nor absent', () {
      expect(campusToggleSelection(null), CampusToggleSelection.pending);
      expect(campusToggleSelection('pending'), CampusToggleSelection.pending);
    });
    test('boarded and absent map to the matching side', () {
      expect(campusToggleSelection('boarded'), CampusToggleSelection.boarded);
      expect(campusToggleSelection('absent'), CampusToggleSelection.absent);
    });
    test('switch is on only when boarded', () {
      expect(campusSwitchIsOn(CampusToggleSelection.boarded), isTrue);
      expect(campusSwitchIsOn(CampusToggleSelection.pending), isFalse);
      expect(campusSwitchIsOn(CampusToggleSelection.absent), isFalse);
    });
    test('pendingCampusRows keeps leftover pending only', () {
      final pending = pendingCampusRows([
        {'id': '1', 'name': 'Brian', 'attendance': 'boarded'},
        {'id': '2', 'name': 'Joyland', 'attendance': 'boarded'},
        {'id': '3', 'name': 'Elena', 'attendance': 'boarded'},
        {'id': '4', 'name': 'Fig Student', 'attendance': 'pending'},
      ]);
      expect(pending, hasLength(1));
      expect(pending.first['id'], '4');
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
    test('pickup boarded is boarded', () {
      expect(
        studentListAttendance({'attendance': 'boarded'}, isPickup: true),
        StudentListAttendance.boarded,
      );
    });
    test('dropoff campus boarded stays boarded not dropped off', () {
      expect(
        studentListAttendance({'attendance': 'boarded'}, isPickup: false),
        StudentListAttendance.boarded,
      );
      expect(
        studentListStatusLabel(StudentListAttendance.boarded),
        'Boarded',
      );
      expect(
        studentListShowsActionButton(
          StudentListAttendance.boarded,
          isPickup: false,
        ),
        isTrue,
      );
      expect(
        studentListActionComplete(
          StudentListAttendance.boarded,
          isPickup: false,
        ),
        isFalse,
      );
    });
    test('dropoff dropped_off is complete', () {
      expect(
        studentListAttendance({'attendance': 'dropped_off'}, isPickup: false),
        StudentListAttendance.droppedOff,
      );
      expect(
        studentListStatusLabel(StudentListAttendance.droppedOff),
        'Dropped off',
      );
      expect(
        studentListActionComplete(
          StudentListAttendance.droppedOff,
          isPickup: false,
        ),
        isTrue,
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
      expect(
        studentListStatusLabel(StudentListAttendance.absent),
        'Absent',
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

  group('school terminal stops', () {
    final stops = [
      {'id': 'school', 'name': 'Campus', 'sequence_no': 1},
      {'id': 'home-1', 'name': 'Ruaka', 'sequence_no': 2},
      {'id': 'home-2', 'name': 'Bypass', 'sequence_no': 3},
    ];
    final pickupStops = [
      {'id': 'home-1', 'name': 'Ruaka', 'sequence_no': 1},
      {'id': 'home-2', 'name': 'Bypass', 'sequence_no': 2},
      {'id': 'school', 'name': 'Campus', 'sequence_no': 3},
    ];

    test('drop-off first stop is school origin', () {
      expect(
        isSchoolOriginStop(stop: stops.first, stops: stops, isPickup: false),
        isTrue,
      );
      expect(
        isSchoolOriginStop(stop: stops.last, stops: stops, isPickup: false),
        isFalse,
      );
      expect(
        isSchoolOriginStop(stop: pickupStops.first, stops: pickupStops, isPickup: true),
        isFalse,
      );
    });

    test('pickup last stop is school destination', () {
      expect(
        isSchoolDestinationStop(stop: pickupStops.last, stops: pickupStops, isPickup: true),
        isTrue,
      );
      expect(
        isSchoolDestinationStop(stop: pickupStops.first, stops: pickupStops, isPickup: true),
        isFalse,
      );
      expect(
        isSchoolDestinationStop(stop: stops.last, stops: stops, isPickup: false),
        isFalse,
      );
    });

    test('skips the boarding drawer at drop-off school origin', () {
      expect(
        shouldSkipBoardingDrawer(
          stop: stops.first,
          stops: stops,
          isPickup: false,
          studentsAtStop: 12,
        ),
        isTrue,
      );
    });

    test('skips the boarding drawer at pickup school destination', () {
      expect(
        shouldSkipBoardingDrawer(
          stop: pickupStops.last,
          stops: pickupStops,
          isPickup: true,
          studentsAtStop: 8,
        ),
        isTrue,
      );
    });

    test('skips the boarding drawer when the stop roster is empty', () {
      expect(
        shouldSkipBoardingDrawer(
          stop: pickupStops.first,
          stops: pickupStops,
          isPickup: true,
          studentsAtStop: 0,
        ),
        isTrue,
      );
    });

    test('still opens at a pickup home stop', () {
      expect(
        shouldSkipBoardingDrawer(
          stop: pickupStops.first,
          stops: pickupStops,
          isPickup: true,
          studentsAtStop: 4,
        ),
        isFalse,
      );
    });

    test('pickup arriving at school auto-completes', () {
      expect(
        shouldAutoCompletePickupAtSchool(
          arrivedStop: pickupStops.last,
          stops: pickupStops,
          isPickup: true,
        ),
        isTrue,
      );
      expect(
        shouldAutoCompletePickupAtSchool(
          arrivedStop: pickupStops.first,
          stops: pickupStops,
          isPickup: true,
        ),
        isFalse,
      );
      expect(
        shouldAutoCompletePickupAtSchool(
          arrivedStop: stops.last,
          stops: stops,
          isPickup: false,
        ),
        isFalse,
      );
    });
  });

  group('trip duration', () {
    test('duration_seconds is completed_at minus started_at', () {
      expect(
        durationSecondsFromRange(
          DateTime.utc(2026, 8, 20, 7, 0),
          DateTime.utc(2026, 8, 20, 7, 32),
        ),
        1920,
      );
    });

    test('missing started_at is 0', () {
      expect(durationSecondsFromRange(null, DateTime.utc(2026, 8, 20, 7, 32)), 0);
    });

    test('snackbar uses ceiling minutes', () {
      expect(tripCompleteSnackLabel(90), 'Trip complete · 2 min');
      expect(tripCompleteSnackLabel(0), 'Trip complete · 0 min');
    });
  });

  group('home active-trip summary labels', () {
    test('pickup progress title', () {
      expect(homeAttendanceProgressTitle(isPickup: true), 'STUDENTS PICKED UP');
    });

    test('drop-off progress title', () {
      expect(homeAttendanceProgressTitle(isPickup: false), 'STUDENTS DROPPED OFF');
    });

    test('next stop meta joins ETA and distance', () {
      expect(
        formatNextStopMeta(etaMinutes: 3, distanceKm: 1.2),
        '3 min • 1.2 km',
      );
    });

    test('arrival clock adds ETA minutes', () {
      expect(
        formatEstimatedArrivalClock(25, now: DateTime(2026, 8, 20, 13, 0)),
        '13:25',
      );
    });

    test('punctuality is On time when start is near departure', () {
      expect(
        homeArrivalStatusLabel(
          etaMinutes: 10,
          startedAt: DateTime(2026, 8, 20, 13, 2),
          departureTime: '13:00:00',
          now: DateTime(2026, 8, 20, 13, 5),
        ),
        'On time',
      );
    });
  });
}
