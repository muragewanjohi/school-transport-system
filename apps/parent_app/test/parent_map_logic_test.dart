import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_map_logic.dart';

void main() {
  test('fromJson maps an in-progress trip with GPS', () {
    final snap = ParentLiveSnapshot.fromJson({
      'trip_active': true,
      'trip': {'vehicle_plate': 'KDD 123A', 'driver_name': 'Jane'},
      'live': {'lat': -1.27, 'lng': 36.8, 'speed': 8.3, 'is_emergency': false},
      'next_stop': {'id': 's1', 'name': 'Greenview Estate'},
      'eta': {'eta_minutes': 8, 'delay_seconds': 0, 'predicted_arrival': '2026-08-20T12:08:00Z'},
    });

    expect(snap.tripActive, isTrue);
    expect(snap.hasBusFix, isTrue);
    expect(snap.vehiclePlate, 'KDD 123A');
    expect(snap.nextStopName, 'Greenview Estate');
    expect(snap.etaMinutes, 8);
  });

  test('idle snapshot has no bus fix', () {
    expect(ParentLiveSnapshot.idle().tripActive, isFalse);
    expect(ParentLiveSnapshot.idle().hasBusFix, isFalse);
  });

  test('childStopIdForDirection uses dropoff on school-to-home', () {
    expect(
      childStopIdForDirection(
        direction: 'SCHOOL_TO_HOME',
        pickupStopId: 'pick',
        dropoffStopId: 'drop',
      ),
      'drop',
    );
  });

  test('formatters match driver trip overlay copy', () {
    expect(formatDistanceAway(0.05), '50 m away');
    expect(formatDistanceAway(1.24), '1.2 km away');
    expect(formatSpeedKmh(0), 'Stopped');
    expect(formatSpeedKmh(8.3), '30 km/h');
    expect(idleTripTitle(), 'No Active Trip');
  });

  test('Live trip status prefers transit wording from the bus', () {
    expect(parentChildStatusLabel('On the Bus'), 'On the Bus');
    expect(parentChildStatusLabel(null), 'En route');
    expect(parentChildStatusLabel('  '), 'En route');
  });

  test('Arrival status mirrors driver punctuality copy', () {
    expect(
      parentArrivalStatusLabel(hasBusFix: false, delaySeconds: 0),
      'Awaiting GPS',
    );
    expect(
      parentArrivalStatusLabel(hasBusFix: true, delaySeconds: 600, etaMinutes: 8),
      'Running late',
    );
    expect(
      parentArrivalStatusLabel(hasBusFix: true, delaySeconds: 0, etaMinutes: 8),
      'On time',
    );
  });

  test('Next-stop meta matches driver trip overlay', () {
    expect(
      formatNextStopMeta(etaMinutes: 8, distanceKm: 1.2),
      '8 min • 1.2 km',
    );
    expect(formatNextStopMeta(etaMinutes: null, distanceKm: null), 'Awaiting GPS');
  });

  test('parseCoordinatePayload reads PostGIS EWKB hex', () {
    final point = parseCoordinatePayload(
      '0101000020E61000004C37894160855EC0DABB500A04B64240',
    );
    expect(point, isNotNull);
    expect(point!.lng, closeTo(-122.084, 0.000001));
    expect(point.lat, closeTo(37.4219983, 0.000001));
  });
}
