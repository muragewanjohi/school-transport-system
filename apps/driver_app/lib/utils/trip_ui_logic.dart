import 'package:driver_app/utils/geo_utils.dart';

/// Attendance progress for the active trip roster.
class TripAttendanceProgress {
  final int boarded;
  final int total;

  const TripAttendanceProgress({required this.boarded, required this.total});

  int get remaining => (total - boarded).clamp(0, total);
  double get fraction => total <= 0 ? 0 : boarded / total;
}

/// Pickup: trip `attendance == boarded`. Dropoff: `attendance == dropped_off`.
/// Roster `students.status` (often default Present) is not trip boarding.
TripAttendanceProgress computeAttendanceProgress(
  List<dynamic> students, {
  required bool isPickup,
}) {
  var completed = 0;
  for (final s in students) {
    if (s is! Map) continue;
    final attendance = (s['attendance'] ?? 'pending').toString();
    if (isPickup && attendance == 'boarded') completed++;
    if (!isPickup && attendance == 'dropped_off') completed++;
  }
  return TripAttendanceProgress(boarded: completed, total: students.length);
}

String attendanceDoneWord({required bool isPickup}) => isPickup ? 'picked' : 'dropped';

/// Maps a driver Present/Absent toggle onto trip-manifest attendance.
String attendanceForStatusUpdate({required bool isPickup, required String status}) {
  if (isPickup) {
    return status == 'Present' ? 'boarded' : 'absent';
  }
  return status == 'Absent' ? 'dropped_off' : 'boarded';
}

/// Overlay trip-manifest attendance onto roster students. Missing rows stay pending.
List<Map<String, dynamic>> mergeManifestAttendance({
  required List<dynamic> students,
  required List<dynamic> manifests,
}) {
  final byId = <String, String>{};
  for (final m in manifests) {
    if (m is! Map) continue;
    final sid = m['student_id']?.toString() ?? '';
    final att = m['attendance']?.toString();
    if (sid.isEmpty || att == null || att.isEmpty) continue;
    byId[sid] = att;
  }
  return students.whereType<Map>().map((s) {
    final copy = Map<String, dynamic>.from(s);
    final id = copy['id']?.toString() ?? '';
    copy['attendance'] = byId[id] ?? copy['attendance'] ?? 'pending';
    return copy;
  }).toList();
}

/// Primary Trip CTA label from run type.
String tripBoardingCtaLabel(String runType) {
  return runType.toUpperCase() == 'DROPOFF' ? 'DropOff Students' : 'Pickup Students';
}

bool isPickupRunType(String runType) => runType.toUpperCase() != 'DROPOFF';

enum StopMarkerState { completed, next, upcoming, notVisited }

/// Assign marker state for a stop in sequence order.
StopMarkerState stopMarkerState({
  required int sequenceIndex,
  required String stopId,
  required Set<String> visitedStopIds,
  required String? nextStopId,
  required List<String> orderedStopIds,
}) {
  if (visitedStopIds.contains(stopId)) return StopMarkerState.completed;
  if (nextStopId != null && stopId == nextStopId) return StopMarkerState.next;

  final nextIdx = nextStopId == null
      ? -1
      : orderedStopIds.indexWhere((id) => id == nextStopId);

  if (nextIdx >= 0 && sequenceIndex < nextIdx && !visitedStopIds.contains(stopId)) {
    return StopMarkerState.notVisited;
  }
  return StopMarkerState.upcoming;
}

List<String> orderedStopIdsFrom(List<dynamic> stops) {
  return sortedStopsBySequence(stops)
      .whereType<Map>()
      .map((s) => s['id']?.toString() ?? '')
      .where((id) => id.isNotEmpty)
      .toList();
}

/// Students assigned to [stopId] for this run direction.
List<Map<String, dynamic>> studentsForStop({
  required List<dynamic> students,
  required String stopId,
  required bool isPickup,
}) {
  final out = <Map<String, dynamic>>[];
  for (final s in students) {
    if (s is! Map) continue;
    final key = isPickup ? 'pickup_stop_id' : 'dropoff_stop_id';
    if (s[key]?.toString() == stopId) {
      out.add(Map<String, dynamic>.from(s));
    }
  }
  return out;
}

/// Geometric ETA minutes from bus → next stop.
/// Uses speed (m/s) when usable; otherwise [fallbackMinutes].
int? estimateEtaMinutes({
  required double? busLat,
  required double? busLng,
  required double? stopLat,
  required double? stopLng,
  required double speedMetersPerSec,
  int? fallbackMinutes,
  double minSpeedMps = 1.5,
}) {
  if (busLat == null || busLng == null || stopLat == null || stopLng == null) {
    return fallbackMinutes;
  }
  final meters = haversineDistanceMeters(busLat, busLng, stopLat, stopLng);
  final speed = speedMetersPerSec > minSpeedMps ? speedMetersPerSec : 0.0;
  if (speed > 0) {
    final mins = (meters / speed / 60).ceil();
    return mins.clamp(1, 999);
  }
  if (fallbackMinutes != null && fallbackMinutes > 0) return fallbackMinutes;
  // Assume ~25 km/h crawl when stationary.
  final mins = (meters / (25 * 1000 / 3600) / 60).ceil();
  return mins.clamp(1, 999);
}

double? distanceKmToStop({
  required double? busLat,
  required double? busLng,
  required double? stopLat,
  required double? stopLng,
}) {
  if (busLat == null || busLng == null || stopLat == null || stopLng == null) {
    return null;
  }
  return haversineDistanceMeters(busLat, busLng, stopLat, stopLng) / 1000.0;
}

String formatTelemetryAge(String? isoTimestamp) {
  if (isoTimestamp == null || isoTimestamp.isEmpty) return 'waiting';
  try {
    final t = DateTime.parse(isoTimestamp).toLocal();
    final secs = DateTime.now().difference(t).inSeconds;
    if (secs < 5) return 'just now';
    if (secs < 60) return '$secs sec ago';
    final mins = (secs / 60).floor();
    return '$mins min ago';
  } catch (_) {
    return 'unknown';
  }
}
