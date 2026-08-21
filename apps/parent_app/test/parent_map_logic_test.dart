import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_map_logic.dart';

void main() {
  test('fromJson maps an in-progress trip with GPS', () {
    final snap = ParentLiveSnapshot.fromJson({
      'trip_active': true,
      'trip': {
        'vehicle_plate': 'KDD 123A',
        'driver_name': 'Jane',
        'driver': {
          'name': 'Jane Driver',
          'phone': '+254700000001',
          'avatar_url': 'https://cdn/d.jpg',
        },
        'conductor': {
          'name': 'Tom Conductor',
          'phone': '+254700000099',
          'avatar_url': 'https://cdn/c.jpg',
        },
      },
      'live': {'lat': -1.27, 'lng': 36.8, 'speed': 8.3, 'is_emergency': false},
      'next_stop': {'id': 's1', 'name': 'Greenview Estate'},
      'eta': {'eta_minutes': 8, 'delay_seconds': 0, 'predicted_arrival': '2026-08-20T12:08:00Z'},
    });

    expect(snap.tripActive, isTrue);
    expect(snap.hasBusFix, isTrue);
    expect(snap.vehiclePlate, 'KDD 123A');
    expect(snap.nextStopName, 'Greenview Estate');
    expect(snap.etaMinutes, 8);
    expect(snap.driver?.name, 'Jane Driver');
    expect(snap.driver?.phone, '+254700000001');
    expect(snap.conductor?.name, 'Tom Conductor');
    expect(ParentCrewContact.initials('Jane Driver'), 'JD');
  });

  test('fromJson maps idle next_trip schedule card fields', () {
    final snap = ParentLiveSnapshot.fromJson({
      'trip_active': false,
      'trip': null,
      'live': null,
      'next_trip': {
        'departure_time': '06:45',
        'direction': 'HOME_TO_SCHOOL',
        'schedule_name': 'Morning',
        'vehicle_plate': 'KDD 123A',
        'bus_number': '12',
        'estimated_duration_minutes': 35,
      },
      'transit_status': 'Waiting for pickup',
    });

    expect(snap.tripActive, isFalse);
    expect(snap.nextTrip, isNotNull);
    expect(snap.nextTrip!.departureTime, '06:45');
    expect(snap.nextTrip!.busLabel, 'KDD 123A');
    expect(snap.nextTrip!.estimatedDurationMinutes, 35);
    expect(snap.transitStatus, 'Waiting for pickup');
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
    expect(noTripScheduledTitle(), 'No trip scheduled today');
    expect(formatEstTripDuration(35), '~35m');
  });

  test('countdownToDeparture formats remaining time', () {
    final now = DateTime.parse('2026-08-21T03:00:00Z'); // 06:00 EAT
    expect(countdownToDeparture('06:45', now), 'Starts in 45m 0s');
    expect(countdownToDeparture('05:50', now), 'Departing soon');
  });

  test('Live trip status prefers transit wording from the bus', () {
    expect(parentChildStatusLabel('On the Bus'), 'On the Bus');
    expect(parentChildStatusLabel(null), 'Waiting for pickup');
    expect(parentChildStatusLabel('  '), 'Waiting for pickup');
    expect(
      parentChildStatusLabel('pending', attendance: 'boarded', direction: 'SCHOOL_TO_HOME'),
      'On the Bus',
    );
    expect(
      parentChildStatusLabel('pending', direction: 'SCHOOL_TO_HOME'),
      'At school',
    );
    expect(
      parentChildStatusLabel(
        'On the Bus',
        attendance: 'boarded',
        tripActive: false,
      ),
      'Waiting for pickup',
    );
  });

  test('etaMinutesFromArrival rejects stale past predictions', () {
    final now = DateTime.parse('2026-08-20T15:00:00Z');
    expect(
      etaMinutesFromArrival(DateTime.parse('2026-08-20T03:43:00Z'), now),
      isNull,
    );
    expect(
      etaMinutesFromArrival(DateTime.parse('2026-08-20T15:08:00Z'), now),
      8,
    );
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
