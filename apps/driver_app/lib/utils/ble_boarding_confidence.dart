/// Pure confidence rules for BLE boarding / drop-off (Unit B).
///
/// Parent notifications must only fire after [BleEventState.confirmed].
library;

enum BleEventState { candidate, confirmed, uncertain, corrected }

enum BleTripDirection { homeToSchool, schoolToHome }

class BleObservation {
  const BleObservation({
    required this.minor,
    required this.rssi,
    required this.at,
    this.uuid,
    this.major = 1,
  });

  final String? uuid;
  final int major;
  final int minor;
  final int rssi;
  final DateTime at;
}

class BleBoardingContext {
  const BleBoardingContext({
    required this.direction,
    required this.insideAssignedStopGeofence,
    required this.busLeftStopGeofence,
    required this.distanceFromStopMeters,
    required this.previouslyOnboard,
    required this.minObservations,
    required this.window,
    this.minDwellElapsed = true,
  });

  final BleTripDirection direction;
  final bool insideAssignedStopGeofence;
  final bool busLeftStopGeofence;
  final double distanceFromStopMeters;
  final bool previouslyOnboard;
  final int minObservations;
  final Duration window;
  final bool minDwellElapsed;
}

class BleConfidenceDecision {
  const BleConfidenceDecision({
    required this.state,
    required this.reason,
  });

  final BleEventState state;
  final String reason;
}

/// Evaluate pickup boarding confirmation.
BleConfidenceDecision evaluatePickupBoarding({
  required BleBoardingContext ctx,
  required List<BleObservation> observations,
}) {
  if (ctx.previouslyOnboard) {
    return const BleConfidenceDecision(
      state: BleEventState.corrected,
      reason: 'Already onboard',
    );
  }
  if (!ctx.insideAssignedStopGeofence && !ctx.busLeftStopGeofence) {
    return const BleConfidenceDecision(
      state: BleEventState.uncertain,
      reason: 'Outside assigned pickup geofence',
    );
  }

  final recent = _inWindow(observations, ctx.window);
  if (recent.length < ctx.minObservations) {
    return BleConfidenceDecision(
      state: BleEventState.candidate,
      reason: 'Need ${ctx.minObservations} observations, have ${recent.length}',
    );
  }

  // Confirm only after the bus leaves and the tag is still seen travelling.
  if (ctx.busLeftStopGeofence &&
      ctx.distanceFromStopMeters >= 100 &&
      recent.isNotEmpty) {
    return const BleConfidenceDecision(
      state: BleEventState.confirmed,
      reason: 'Tag travelled with bus after stop exit',
    );
  }

  return const BleConfidenceDecision(
    state: BleEventState.candidate,
    reason: 'Seen at stop; waiting for departure confirmation',
  );
}

/// Evaluate home-stop drop-off confirmation.
BleConfidenceDecision evaluateDropoff({
  required BleBoardingContext ctx,
  required List<BleObservation> observationsBeforeStop,
  required List<BleObservation> observationsAfterDeparture,
  required Duration absentFor,
}) {
  if (!ctx.previouslyOnboard) {
    return const BleConfidenceDecision(
      state: BleEventState.uncertain,
      reason: 'Student was not confirmed onboard',
    );
  }
  if (observationsBeforeStop.isEmpty) {
    return const BleConfidenceDecision(
      state: BleEventState.uncertain,
      reason: 'Beacon missing before stop arrival',
    );
  }
  if (!ctx.insideAssignedStopGeofence && !ctx.busLeftStopGeofence) {
    return const BleConfidenceDecision(
      state: BleEventState.uncertain,
      reason: 'Not at assigned drop-off stop',
    );
  }
  if (!ctx.minDwellElapsed) {
    return const BleConfidenceDecision(
      state: BleEventState.candidate,
      reason: 'Waiting for minimum dwell',
    );
  }
  if (!ctx.busLeftStopGeofence) {
    return const BleConfidenceDecision(
      state: BleEventState.candidate,
      reason: 'Waiting for bus to leave stop',
    );
  }
  if (observationsAfterDeparture.isNotEmpty) {
    return const BleConfidenceDecision(
      state: BleEventState.candidate,
      reason: 'Beacon reappeared after departure',
    );
  }
  if (absentFor.inSeconds < 30 && ctx.distanceFromStopMeters < 100) {
    return const BleConfidenceDecision(
      state: BleEventState.candidate,
      reason: 'Waiting for absence confirmation window',
    );
  }
  return const BleConfidenceDecision(
    state: BleEventState.confirmed,
    reason: 'Beacon remained absent after departure',
  );
}

List<BleObservation> _inWindow(List<BleObservation> all, Duration window) {
  if (all.isEmpty) return const [];
  final end = all.last.at;
  final start = end.subtract(window);
  return all.where((o) => !o.at.isBefore(start)).toList();
}
