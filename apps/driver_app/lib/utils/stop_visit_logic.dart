import 'package:driver_app/utils/geo_utils.dart';

enum StopVisitOutcome { completed, visited, skipped }

enum StopExitReason { completePressed, skipPressed, leftGeofence }

/// Drawer copy for the next unresolved stage.
enum StopApproachPhase { approaching, arrived, returnToWait }

const int defaultMinStopDwellSeconds = 90;
const int minStopDwellFloor = 60;
const int minStopDwellCeiling = 180;

class StopExitResolution {
  final StopVisitOutcome outcome;
  final bool alertAdmin;
  final bool markRemainingAbsent;

  const StopExitResolution({
    required this.outcome,
    required this.alertAdmin,
    this.markRemainingAbsent = true,
  });
}

int clampMinStopDwellSeconds(int? raw) {
  final value = raw ?? defaultMinStopDwellSeconds;
  if (value < minStopDwellFloor) return minStopDwellFloor;
  if (value > minStopDwellCeiling) return minStopDwellCeiling;
  return value;
}

bool skipStopAllowed({
  required DateTime? arrivedAt,
  required DateTime now,
  int minStopDwellSeconds = defaultMinStopDwellSeconds,
}) {
  if (arrivedAt == null) return false;
  final min = clampMinStopDwellSeconds(minStopDwellSeconds);
  return dwellSeconds(arrivedAt: arrivedAt, departedAt: now) >= min;
}

int skipWaitRemainingSeconds({
  required DateTime? arrivedAt,
  required DateTime now,
  int minStopDwellSeconds = defaultMinStopDwellSeconds,
}) {
  final min = clampMinStopDwellSeconds(minStopDwellSeconds);
  if (arrivedAt == null) return min;
  final remaining = min - dwellSeconds(arrivedAt: arrivedAt, departedAt: now);
  return remaining < 0 ? 0 : remaining;
}

/// GPS leave: ticks complete immediately; zero ticks wait until min dwell, then visited.
StopExitResolution? resolveStopExit({
  required StopExitReason reason,
  required int studentsActioned,
  DateTime? arrivedAt,
  DateTime? now,
  int minStopDwellSeconds = defaultMinStopDwellSeconds,
}) {
  if (reason == StopExitReason.completePressed) {
    return const StopExitResolution(
      outcome: StopVisitOutcome.completed,
      alertAdmin: false,
      markRemainingAbsent: true,
    );
  }
  final clock = now ?? DateTime.now();
  if (reason == StopExitReason.skipPressed) {
    if (!skipStopAllowed(
      arrivedAt: arrivedAt,
      now: clock,
      minStopDwellSeconds: minStopDwellSeconds,
    )) {
      return null;
    }
    return const StopExitResolution(
      outcome: StopVisitOutcome.skipped,
      alertAdmin: true,
      markRemainingAbsent: true,
    );
  }
  if (studentsActioned > 0) {
    return const StopExitResolution(
      outcome: StopVisitOutcome.completed,
      alertAdmin: false,
      markRemainingAbsent: true,
    );
  }
  if (!skipStopAllowed(
    arrivedAt: arrivedAt,
    now: clock,
    minStopDwellSeconds: minStopDwellSeconds,
  )) {
    return null;
  }
  return const StopExitResolution(
    outcome: StopVisitOutcome.visited,
    alertAdmin: true,
    markRemainingAbsent: true,
  );
}

StopApproachPhase stopApproachPhase({
  required bool atStop,
  required bool leftBeforeMinDwell,
}) {
  if (atStop) return StopApproachPhase.arrived;
  if (leftBeforeMinDwell) return StopApproachPhase.returnToWait;
  return StopApproachPhase.approaching;
}

String stopPhaseEyebrow(StopApproachPhase phase) {
  switch (phase) {
    case StopApproachPhase.arrived:
      return "YOU'RE AT THIS STOP";
    case StopApproachPhase.returnToWait:
      return 'RETURN TO STOP';
    case StopApproachPhase.approaching:
      return 'APPROACHING';
  }
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
  bool skipSchoolTerminal = false,
  int studentsAtStop = 1,
}) {
  if (skipSchoolTerminal) return false;
  if (studentsAtStop <= 0) return false;
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
