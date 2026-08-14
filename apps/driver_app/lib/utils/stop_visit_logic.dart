import 'package:driver_app/utils/geo_utils.dart';

enum StopVisitOutcome { completed, visited, skipped }

enum StopExitReason { completePressed, skipPressed, leftGeofence }

class StopExitResolution {
  final StopVisitOutcome outcome;
  final bool alertAdmin;

  const StopExitResolution({required this.outcome, required this.alertAdmin});
}

StopExitResolution resolveStopExit({
  required StopExitReason reason,
  required int studentsActioned,
}) {
  if (reason == StopExitReason.completePressed) {
    return const StopExitResolution(outcome: StopVisitOutcome.completed, alertAdmin: false);
  }
  if (reason == StopExitReason.skipPressed) {
    return const StopExitResolution(outcome: StopVisitOutcome.skipped, alertAdmin: true);
  }
  if (studentsActioned > 0) {
    return const StopExitResolution(outcome: StopVisitOutcome.completed, alertAdmin: false);
  }
  return const StopExitResolution(outcome: StopVisitOutcome.visited, alertAdmin: true);
}

int dwellSeconds({required DateTime? arrivedAt, required DateTime departedAt}) {
  if (arrivedAt == null) return 0;
  final secs = departedAt.difference(arrivedAt).inSeconds;
  return secs < 0 ? 0 : secs;
}

String formatDwell(int seconds) {
  if (seconds < 60) return '${seconds}s';
  final minutes = seconds ~/ 60;
  final remainder = seconds % 60;
  return '${minutes}m ${remainder.toString().padLeft(2, '0')}s';
}

const int geofenceExitHysteresisMeters = 15;

/// True when the bus is outside the stop radius plus hysteresis (GPS jitter guard).
bool hasLeftStopGeofence({
  required double latitude,
  required double longitude,
  required dynamic stop,
  int extraMeters = geofenceExitHysteresisMeters,
}) {
  final point = stopLatLng(stop);
  if (point == null) return true;
  final radius = stopGeofenceRadiusMeters(stop) + extraMeters;
  final distance = haversineDistanceMeters(
    latitude,
    longitude,
    point.latitude,
    point.longitude,
  );
  return distance > radius;
}

Map<String, dynamic>? firstUnresolvedStop({
  required List<dynamic> stops,
  required Map<String, StopVisitOutcome> outcomes,
}) {
  for (final s in sortedStopsBySequence(stops)) {
    if (s is! Map) continue;
    final id = s['id']?.toString() ?? '';
    if (id.isEmpty) continue;
    if (!outcomes.containsKey(id)) {
      return Map<String, dynamic>.from(s);
    }
  }
  return null;
}

bool shouldAutoOpenBoardingDrawer({
  required String? arrivedStopId,
  required String? nextStopId,
  required String? alreadyOpenedStopId,
  required bool drawerOpen,
}) {
  if (drawerOpen) return false;
  if (arrivedStopId == null || nextStopId == null) return false;
  if (arrivedStopId != nextStopId) return false;
  if (alreadyOpenedStopId == arrivedStopId) return false;
  return true;
}

const int outcomeRankCompleted = 3;
const int outcomeRankVisited = 2;
const int outcomeRankSkipped = 1;

int _rank(StopVisitOutcome outcome) {
  switch (outcome) {
    case StopVisitOutcome.completed:
      return outcomeRankCompleted;
    case StopVisitOutcome.visited:
      return outcomeRankVisited;
    case StopVisitOutcome.skipped:
      return outcomeRankSkipped;
  }
}

bool shouldOverwriteOutcome(StopVisitOutcome? existing, StopVisitOutcome incoming) {
  if (existing == null) return true;
  return _rank(incoming) > _rank(existing);
}
