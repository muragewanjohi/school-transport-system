import 'dart:math' as math;
import 'dart:typed_data';

/// Pure helpers for the parent live map (active trip + GPS overlay).
class ParentLiveSnapshot {
  final bool tripActive;
  final double? lat;
  final double? lng;
  final double speedMps;
  final bool isEmergency;
  final String? vehiclePlate;
  final String? driverName;
  final String? nextStopName;
  final int? etaMinutes;
  final int delaySeconds;
  final DateTime? predictedArrival;
  final String? transitStatus;
  final String? attendance;
  final String? direction;

  const ParentLiveSnapshot({
    required this.tripActive,
    this.lat,
    this.lng,
    this.speedMps = 0,
    this.isEmergency = false,
    this.vehiclePlate,
    this.driverName,
    this.nextStopName,
    this.etaMinutes,
    this.delaySeconds = 0,
    this.predictedArrival,
    this.transitStatus,
    this.attendance,
    this.direction,
  });

  bool get hasBusFix => lat != null && lng != null;

  factory ParentLiveSnapshot.idle() => const ParentLiveSnapshot(tripActive: false);

  factory ParentLiveSnapshot.fromJson(Map<String, dynamic> body) {
    final trip = body['trip'] is Map
        ? Map<String, dynamic>.from(body['trip'] as Map)
        : const <String, dynamic>{};
    final live = body['live'] is Map
        ? Map<String, dynamic>.from(body['live'] as Map)
        : null;
    final nextStop = body['next_stop'] is Map
        ? Map<String, dynamic>.from(body['next_stop'] as Map)
        : null;
    final eta = body['eta'] is Map
        ? Map<String, dynamic>.from(body['eta'] as Map)
        : null;

    DateTime? arrival;
    final rawArrival = eta?['predicted_arrival'];
    if (rawArrival != null) {
      arrival = DateTime.tryParse(rawArrival.toString())?.toUtc();
    }

    final direction = trip['direction']?.toString();
    final attendance = body['attendance']?.toString();
    final rawTransit = body['transit_status']?.toString();

    return ParentLiveSnapshot(
      tripActive: body['trip_active'] == true,
      lat: (live?['lat'] as num?)?.toDouble(),
      lng: (live?['lng'] as num?)?.toDouble(),
      speedMps: (live?['speed'] as num?)?.toDouble() ?? 0,
      isEmergency: live?['is_emergency'] == true,
      vehiclePlate: trip['vehicle_plate']?.toString(),
      driverName: trip['driver_name']?.toString(),
      nextStopName: nextStop?['name']?.toString(),
      etaMinutes: (eta?['eta_minutes'] as num?)?.toInt() ??
          etaMinutesFromArrival(arrival),
      delaySeconds: (eta?['delay_seconds'] as num?)?.toInt() ?? 0,
      predictedArrival: etaMinutesFromArrival(arrival) == null ? null : arrival,
      transitStatus: parentChildStatusLabel(
        rawTransit,
        attendance: attendance,
        direction: direction,
      ),
      attendance: attendance,
      direction: direction,
    );
  }
}

String? childStopIdForDirection({
  required String? direction,
  String? pickupStopId,
  String? dropoffStopId,
}) {
  if (direction == 'SCHOOL_TO_HOME') {
    return _nonEmpty(dropoffStopId) ?? _nonEmpty(pickupStopId);
  }
  return _nonEmpty(pickupStopId) ?? _nonEmpty(dropoffStopId);
}

String? _nonEmpty(String? value) {
  if (value == null || value.isEmpty) return null;
  return value;
}

double? distanceKmToPoint({
  required double? fromLat,
  required double? fromLng,
  required double? toLat,
  required double? toLng,
}) {
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
    return null;
  }
  const earth = 6371.0;
  final dLat = _toRad(toLat - fromLat);
  final dLon = _toRad(toLng - fromLng);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_toRad(fromLat)) *
          math.cos(_toRad(toLat)) *
          math.sin(dLon / 2) *
          math.sin(dLon / 2);
  return earth * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

double _toRad(double deg) => deg * math.pi / 180;

String formatDistanceAway(double? km) {
  if (km == null) return '--';
  if (km < 0.1) return '${(km * 1000).round()} m away';
  return '${km.toStringAsFixed(1)} km away';
}

String formatSpeedKmh(double metersPerSec) {
  if (metersPerSec <= 0) return 'Stopped';
  return '${(metersPerSec * 3.6).round()} km/h';
}

class ParentLatLng {
  final double lat;
  final double lng;
  const ParentLatLng({required this.lat, required this.lng});
}

/// Parses WKT `POINT(lng lat)`, GeoJSON, or PostGIS EWKB hex from Supabase.
ParentLatLng? parseCoordinatePayload(dynamic raw) {
  if (raw == null) return null;
  if (raw is String) {
    final wkt = RegExp(
      r'POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)',
      caseSensitive: false,
    ).firstMatch(raw);
    if (wkt != null) {
      final lng = double.tryParse(wkt.group(1)!);
      final lat = double.tryParse(wkt.group(2)!);
      if (lat == null || lng == null) return null;
      return ParentLatLng(lat: lat, lng: lng);
    }
    return _parseEwkbPointHex(raw);
  }
  if (raw is Map) {
    final coords = raw['coordinates'];
    if (coords is List && coords.length >= 2) {
      final lng = (coords[0] as num?)?.toDouble();
      final lat = (coords[1] as num?)?.toDouble();
      if (lat == null || lng == null) return null;
      return ParentLatLng(lat: lat, lng: lng);
    }
  }
  return null;
}

ParentLatLng? _parseEwkbPointHex(String hex) {
  final clean = hex.replaceFirst(RegExp(r'^\\x', caseSensitive: false), '').trim();
  if (!RegExp(r'^[0-9a-fA-F]+$').hasMatch(clean) || clean.length < 42) {
    return null;
  }
  final bytes = <int>[];
  for (var i = 0; i < clean.length; i += 2) {
    bytes.add(int.parse(clean.substring(i, i + 2), radix: 16));
  }
  if (bytes.length < 21) return null;
  final littleEndian = bytes[0] == 1;
  var offset = 1;
  var type = _readUint32(bytes, offset, littleEndian);
  offset += 4;
  if ((type & 0x20000000) != 0) {
    offset += 4;
    type = type & ~0x20000000;
  }
  if ((type & 0xff) != 1 || offset + 16 > bytes.length) return null;
  final lng = _readFloat64(bytes, offset, littleEndian);
  final lat = _readFloat64(bytes, offset + 8, littleEndian);
  if (lat.isNaN || lng.isNaN) return null;
  return ParentLatLng(lat: lat, lng: lng);
}

int _readUint32(List<int> bytes, int offset, bool littleEndian) {
  if (littleEndian) {
    return bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24);
  }
  return (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
}

double _readFloat64(List<int> bytes, int offset, bool littleEndian) {
  final data = ByteData(8);
  for (var i = 0; i < 8; i++) {
    data.setUint8(i, bytes[offset + i]);
  }
  return data.getFloat64(0, littleEndian ? Endian.little : Endian.big);
}

String idleTripTitle() => 'No Active Trip';

String idleTripSubtitle() =>
    'Live tracking starts when the bus is on a trip for this child.';

/// Compact next-stop meta borrowed from the driver trip overlay: `3 min • 1.2 km`.
String formatNextStopMeta({required int? etaMinutes, required double? distanceKm}) {
  final parts = <String>[];
  if (etaMinutes != null) {
    parts.add(etaMinutes <= 0 ? 'Arriving' : '$etaMinutes min');
  }
  if (distanceKm != null) {
    if (distanceKm < 0.1) {
      parts.add('${(distanceKm * 1000).round()} m');
    } else {
      parts.add('${distanceKm.toStringAsFixed(1)} km');
    }
  }
  if (parts.isEmpty) return 'Awaiting GPS';
  return parts.join(' • ');
}

/// Punctuality label for the parent live map arrival column.
String parentArrivalStatusLabel({
  required bool hasBusFix,
  required int delaySeconds,
  int? etaMinutes,
}) {
  if (!hasBusFix && etaMinutes == null) return 'Awaiting GPS';
  if (delaySeconds >= 300) return 'Running late';
  return 'On time';
}

/// Child column title for the live trip summary.
/// Prefers trip-manifest attendance when available; never shows raw "pending".
String parentChildStatusLabel(
  String? transitStatus, {
  String? attendance,
  String? direction,
}) {
  final att = (attendance ?? '').trim().toLowerCase();
  if (att == 'boarded') return 'On the Bus';
  if (att == 'dropped_off') return 'Dropped off';
  if (att == 'absent' || att == 'no_show') return 'Absent';
  if (att == 'pending') {
    return direction == 'SCHOOL_TO_HOME' ? 'At school' : 'Waiting for pickup';
  }

  final value = (transitStatus ?? '').trim();
  if (value.isEmpty || value.toLowerCase() == 'pending') {
    return direction == 'SCHOOL_TO_HOME' ? 'At school' : 'Waiting for pickup';
  }
  return value;
}

/// Minutes until [arrival]; null when missing or stale (more than 2 minutes past).
int? etaMinutesFromArrival(DateTime? arrival, [DateTime? now]) {
  if (arrival == null) return null;
  final base = (now ?? DateTime.now()).toUtc();
  final secs = arrival.toUtc().difference(base).inSeconds;
  if (secs < -120) return null;
  if (secs <= 0) return 0;
  return (secs / 60).ceil();
}
