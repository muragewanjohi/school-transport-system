import 'dart:convert';

import 'package:driver_app/utils/geo_utils.dart';
import 'package:driver_app/utils/stop_visit_logic.dart';

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

/// Pickup list CTA / drop-off list CTA.
String boardingActionLabel({required bool isPickup}) =>
    isPickup ? 'Boarded' : 'Dropped off';

enum StudentListAttendance { pending, actioned, absent }

/// Trip-manifest attendance for a student row (not roster Present/Absent alone).
StudentListAttendance studentListAttendance(
  Map<String, dynamic> student, {
  required bool isPickup,
}) {
  final attendance = (student['attendance'] ?? 'pending').toString();
  if (attendance == 'absent') return StudentListAttendance.absent;
  if (isPickup && attendance == 'boarded') return StudentListAttendance.actioned;
  if (!isPickup && attendance == 'dropped_off') return StudentListAttendance.actioned;
  return StudentListAttendance.pending;
}

class GuardianContact {
  final String name;
  final String phone;
  final String? photoUrl;

  const GuardianContact({
    required this.name,
    required this.phone,
    this.photoUrl,
  });
}

String? _nonEmptyPhotoUrl(dynamic value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

List<GuardianContact> parseStudentGuardians(dynamic raw) {
  List<dynamic> list = const [];
  if (raw is String && raw.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) list = decoded;
    } catch (_) {
      return const [];
    }
  } else if (raw is List) {
    list = raw;
  }
  final out = <GuardianContact>[];
  for (final g in list) {
    if (g is! Map) continue;
    final phone = (g['phone'] ?? '').toString().trim();
    if (phone.isEmpty) continue;
    final name = (g['name'] ?? 'Guardian').toString().trim();
    out.add(
      GuardianContact(
        name: name.isEmpty ? 'Guardian' : name,
        phone: phone,
        photoUrl: _nonEmptyPhotoUrl(g['photo_url']) ?? _nonEmptyPhotoUrl(g['avatar_url']),
      ),
    );
  }
  return out;
}

String guardianPhoneKey(String phone) => phone.replaceAll(RegExp(r'\D'), '');

/// Unique guardians across a trip roster, first occurrence wins.
List<GuardianContact> uniqueTripGuardians(List<dynamic> students) {
  final seen = <String>{};
  final out = <GuardianContact>[];
  for (final student in students) {
    if (student is! Map) continue;
    for (final guardian in parseStudentGuardians(student['guardians'])) {
      final key = guardianPhoneKey(guardian.phone);
      if (key.isEmpty || !seen.add(key)) continue;
      out.add(guardian);
    }
  }
  return out;
}

bool studentMatchesQuery(Map<String, dynamic> student, String query) {
  final needle = query.trim().toLowerCase();
  if (needle.isEmpty) return true;
  final name = (student['name'] ?? '').toString().toLowerCase();
  if (name.contains(needle)) return true;
  return parseStudentGuardians(student['guardians']).any((g) {
    return g.name.toLowerCase().contains(needle);
  });
}

/// Dialer URI for a guardian phone. Returns null if the number is too short.
Uri? guardianTelUri(String phone) {
  final trimmed = phone.trim();
  if (trimmed.isEmpty) return null;
  final allowed = trimmed.replaceAll(RegExp(r'[^\d+]'), '');
  final digits = allowed.replaceAll('+', '');
  if (digits.length < 9) return null;
  return Uri(scheme: 'tel', path: allowed);
}

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

enum StopMarkerState { completed, visited, next, upcoming, notVisited }

/// Assign marker state for a stop in sequence order.
StopMarkerState stopMarkerState({
  required int sequenceIndex,
  required String stopId,
  required Set<String> visitedStopIds,
  required String? nextStopId,
  required List<String> orderedStopIds,
  Map<String, StopVisitOutcome>? stopOutcomes,
}) {
  final outcome = stopOutcomes?[stopId];
  if (outcome == StopVisitOutcome.completed ||
      (outcome == null && visitedStopIds.contains(stopId))) {
    return StopMarkerState.completed;
  }
  if (outcome == StopVisitOutcome.visited) return StopMarkerState.visited;
  if (outcome == StopVisitOutcome.skipped) return StopMarkerState.notVisited;
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

/// Remaining Pending at a resolved stop become Absent. Ticked boarded/dropped_off stay.
List<Map<String, dynamic>> markPendingAbsentAtStop({
  required List<dynamic> students,
  required String stopId,
  required bool isPickup,
}) {
  final assignedIds = studentsForStop(
    students: students,
    stopId: stopId,
    isPickup: isPickup,
  ).map((s) => s['id']?.toString() ?? '').where((id) => id.isNotEmpty).toSet();

  return students.whereType<Map>().map((s) {
    final copy = Map<String, dynamic>.from(s);
    final id = copy['id']?.toString() ?? '';
    if (!assignedIds.contains(id)) return copy;
    final attendance = (copy['attendance'] ?? 'pending').toString();
    if (attendance == 'boarded' || attendance == 'dropped_off') return copy;
    copy['attendance'] = 'absent';
    if (isPickup) copy['status'] = 'Absent';
    return copy;
  }).toList();
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

enum StopProgressKind { completed, current, upcoming }

class StopProgressSegment {
  final String stopId;
  final StopProgressKind kind;

  const StopProgressSegment({required this.stopId, required this.kind});
}

/// One segment per sequenced stop: completed/visited → green, next → blue, else gray.
List<StopProgressSegment> stopProgressSegments({
  required List<String> orderedStopIds,
  required Map<String, StopVisitOutcome> outcomes,
  required String? nextStopId,
}) {
  return orderedStopIds.map((id) {
    final outcome = outcomes[id];
    if (outcome == StopVisitOutcome.completed || outcome == StopVisitOutcome.visited) {
      return StopProgressSegment(stopId: id, kind: StopProgressKind.completed);
    }
    if (nextStopId != null && id == nextStopId) {
      return StopProgressSegment(stopId: id, kind: StopProgressKind.current);
    }
    return StopProgressSegment(stopId: id, kind: StopProgressKind.upcoming);
  }).toList();
}

Map<String, dynamic>? stopAfter({
  required List<dynamic> stops,
  required String? stopId,
}) {
  if (stopId == null || stopId.isEmpty) return null;
  final ordered = sortedStopsBySequence(stops);
  final idx = ordered.indexWhere((s) => s is Map && s['id']?.toString() == stopId);
  if (idx < 0 || idx + 1 >= ordered.length) return null;
  final next = ordered[idx + 1];
  if (next is Map<String, dynamic>) return next;
  if (next is Map) return Map<String, dynamic>.from(next);
  return null;
}

int stopSequenceNumber({
  required List<dynamic> stops,
  required String? stopId,
}) {
  if (stopId == null || stopId.isEmpty) return 0;
  final ids = orderedStopIdsFrom(stops);
  final idx = ids.indexOf(stopId);
  return idx >= 0 ? idx + 1 : 0;
}

String formatPickedSummary({
  required int boarded,
  required int total,
  required bool isPickup,
}) {
  return '$boarded of $total ${attendanceDoneWord(isPickup: isPickup)}';
}

String formatEtaLabel(int? minutes) {
  if (minutes == null) return '--';
  return '$minutes min';
}

String formatDistanceAway(double? km) {
  if (km == null) return '';
  if (km < 0.1) return '${(km * 1000).round()} m away';
  return '${km.toStringAsFixed(1)} km away';
}

String studentsWaitingLabel({required int count, required bool isPickup}) {
  if (isPickup) return '$count students waiting';
  return '$count students to drop';
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
