import 'package:driver_app/utils/ble_boarding_confidence.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final now = DateTime.utc(2026, 9, 15, 12);

  group('evaluatePickupBoarding › travels with bus › confirmed', () {
    test(
      'Given repeated sightings and bus left stop, When evaluated, Then confirmed',
      () {
        final obs = List.generate(
          5,
          (i) => BleObservation(
            minor: 1,
            rssi: -70,
            at: now.add(Duration(seconds: i * 2)),
          ),
        );
        final decision = evaluatePickupBoarding(
          ctx: BleBoardingContext(
            direction: BleTripDirection.homeToSchool,
            insideAssignedStopGeofence: false,
            busLeftStopGeofence: true,
            distanceFromStopMeters: 150,
            previouslyOnboard: false,
            minObservations: 3,
            window: const Duration(seconds: 20),
          ),
          observations: obs,
        );
        expect(decision.state, BleEventState.confirmed);
      },
    );
  });

  group('evaluatePickupBoarding › only at stop › candidate', () {
    test(
      'Given sightings inside geofence before leave, When evaluated, Then candidate',
      () {
        final obs = [
          BleObservation(minor: 1, rssi: -65, at: now),
          BleObservation(minor: 1, rssi: -66, at: now.add(const Duration(seconds: 2))),
          BleObservation(minor: 1, rssi: -64, at: now.add(const Duration(seconds: 4))),
        ];
        final decision = evaluatePickupBoarding(
          ctx: BleBoardingContext(
            direction: BleTripDirection.homeToSchool,
            insideAssignedStopGeofence: true,
            busLeftStopGeofence: false,
            distanceFromStopMeters: 5,
            previouslyOnboard: false,
            minObservations: 3,
            window: const Duration(seconds: 20),
          ),
          observations: obs,
        );
        expect(decision.state, BleEventState.candidate);
      },
    );
  });

  group('evaluateDropoff › absent after departure › confirmed', () {
    test(
      'Given onboard, healthy before stop, gone after leave, When evaluated, Then confirmed',
      () {
        final before = [
          BleObservation(minor: 2, rssi: -60, at: now),
        ];
        final decision = evaluateDropoff(
          ctx: BleBoardingContext(
            direction: BleTripDirection.schoolToHome,
            insideAssignedStopGeofence: false,
            busLeftStopGeofence: true,
            distanceFromStopMeters: 200,
            previouslyOnboard: true,
            minObservations: 1,
            window: const Duration(seconds: 30),
            minDwellElapsed: true,
          ),
          observationsBeforeStop: before,
          observationsAfterDeparture: const [],
          absentFor: const Duration(seconds: 45),
        );
        expect(decision.state, BleEventState.confirmed);
      },
    );
  });

  group('evaluateDropoff › beacon missing before stop › uncertain', () {
    test(
      'Given no observations before stop, When evaluated, Then uncertain',
      () {
        final decision = evaluateDropoff(
          ctx: BleBoardingContext(
            direction: BleTripDirection.schoolToHome,
            insideAssignedStopGeofence: true,
            busLeftStopGeofence: true,
            distanceFromStopMeters: 200,
            previouslyOnboard: true,
            minObservations: 1,
            window: const Duration(seconds: 30),
          ),
          observationsBeforeStop: const [],
          observationsAfterDeparture: const [],
          absentFor: const Duration(seconds: 60),
        );
        expect(decision.state, BleEventState.uncertain);
      },
    );
  });
}
