import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/geo_utils.dart';
import 'package:driver_app/utils/gps_replay.dart';

void main() {
  group('offsetByMeters', () {
    test('north offset increases latitude', () {
      const origin = GeoPoint(-1.2921, 36.8219);
      final north = offsetByMeters(origin.latitude, origin.longitude, 100, 0);
      expect(north.latitude, greaterThan(origin.latitude));
      expect(
        haversineDistanceMeters(
          origin.latitude,
          origin.longitude,
          north.latitude,
          north.longitude,
        ),
        closeTo(100, 3),
      );
    });
  });

  group('buildPlayReviewReplayScript', () {
    final script = buildPlayReviewReplayScript(isPickup: true);

    test('starts inside the campus fence then campus exit farther than 150 m', () {
      expect(script.first.label, 'Campus');
      final startDist = haversineDistanceMeters(
        script.first.latitude,
        script.first.longitude,
        playReviewCampus.latitude,
        playReviewCampus.longitude,
      );
      expect(startDist, greaterThan(50));
      expect(startDist, lessThan(campusGeofenceMeters));

      final exit = script.firstWhere((w) => w.label == 'Campus exit');
      final dist = haversineDistanceMeters(
        playReviewCampus.latitude,
        playReviewCampus.longitude,
        exit.latitude,
        exit.longitude,
      );
      expect(dist, greaterThan(campusGeofenceMeters));
      expect(dist, closeTo(campusExitMeters, 8));
    });

    test('approaches Riverside outside then inside the 500 m ring', () {
      final far = script.firstWhere((w) => w.label == '600 m from Stop Riverside');
      final near = script.firstWhere((w) => w.label == '400 m from Stop Riverside');
      const riverside = GeoPoint(-1.267, 36.8095);

      expect(
        haversineDistanceMeters(
          far.latitude,
          far.longitude,
          riverside.latitude,
          riverside.longitude,
        ),
        greaterThan(500),
      );
      expect(
        haversineDistanceMeters(
          near.latitude,
          near.longitude,
          riverside.latitude,
          riverside.longitude,
        ),
        lessThan(500),
      );
      expect(
        haversineDistanceMeters(
          near.latitude,
          near.longitude,
          riverside.latitude,
          riverside.longitude,
        ),
        closeTo(nearApproachMeters, 12),
      );
    });

    test('visits each corridor stop at its pin', () {
      final centers = script.where((w) => w.isStopCenter).toList();
      expect(centers.map((w) => w.label).toList(), [
        'At Stop Riverside',
        'At Stop Market',
        'At Stop Park',
        'At Play Review Gate',
      ]);
      expect(
        haversineDistanceMeters(
          centers.first.latitude,
          centers.first.longitude,
          -1.267,
          36.8095,
        ),
        lessThan(2),
      );
    });
  });

  group('buildStopReplayScript', () {
    test('uses live stop coordinates when present', () {
      final script = buildStopReplayScript(
        isPickup: true,
        stops: [
          {
            'id': 'a',
            'name': 'Stage A',
            'sequence_no': 1,
            'latitude': -1.270,
            'longitude': 36.810,
          },
          {
            'id': 'b',
            'name': 'School Gate',
            'sequence_no': 2,
            'latitude': -1.2921,
            'longitude': 36.8219,
          },
        ],
      );

      final atA = script.firstWhere((w) => w.isStopCenter && w.stopId == 'a');
      expect(atA.label, 'At Stage A');
      expect(atA.latitude, closeTo(-1.270, 0.0001));
    });

    test('falls back to Play Review when stops have no coordinates', () {
      final script = buildStopReplayScript(stops: const [], isPickup: true);
      expect(script.first.label, 'Campus');
      expect(script.any((w) => w.label == 'At Stop Riverside'), isTrue);
    });
  });

  group('expandReplayWaypoints', () {
    test('interpolates between campus and campus exit', () {
      final waypoints = buildPlayReviewReplayScript(isPickup: true);
      final ticks = expandReplayWaypoints(
        waypoints.take(2).toList(),
        step: const Duration(seconds: 2),
        cruiseMps: 11,
      );
      expect(ticks, isNotEmpty);
      expect(ticks.first.label, 'Campus');
      expect(ticks.last.label, 'Campus exit');
      expect(ticks.length, greaterThan(2));

      final moving = ticks.where((t) => t.speedMps > 0).toList();
      expect(moving, isNotEmpty);
      expect(moving.first.bearing, greaterThanOrEqualTo(0));
    });
  });
}
