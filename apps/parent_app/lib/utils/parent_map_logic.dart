import 'dart:math' as math;
import 'dart:typed_data';

/// Pure helpers for the parent live map (active trip + GPS overlay).
class ParentCrewContact {
  final String? name;
  final String? phone;
  final String? avatarUrl;

  const ParentCrewContact({
    this.name,
    this.phone,
    this.avatarUrl,
  });

  bool get hasAnyDetail =>
      (name != null && name!.trim().isNotEmpty) ||
      (phone != null && phone!.trim().isNotEmpty) ||
      (avatarUrl != null && avatarUrl!.trim().isNotEmpty);

  String get displayName {
    final n = name?.trim();
    if (n != null && n.isNotEmpty) return n;
    return '—';
  }

  factory ParentCrewContact.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const ParentCrewContact();
    return ParentCrewContact(
      name: json['name']?.toString(),
      phone: json['phone']?.toString(),
      avatarUrl: json['avatar_url']?.toString(),
    );
  }

  /// Initials for thumbnail fallback (e.g. "Jane Driver" → "JD").
  static String initials(String? name) {
    final parts = (name ?? '')
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts.isNotEmpty) return parts[0][0].toUpperCase();
    return '?';
  }
}

class ParentNextTrip {
  final String departureTime;
  final String? direction;
  final String? scheduleName;
  final String? vehiclePlate;
  final String? busNumber;
  final int? estimatedDurationMinutes;

  const ParentNextTrip({
    required this.departureTime,
    this.direction,
    this.scheduleName,
    this.vehiclePlate,
    this.busNumber,
    this.estimatedDurationMinutes,
  });

  factory ParentNextTrip.fromJson(Map<String, dynamic> json) {
    return ParentNextTrip(
      departureTime: json['departure_time']?.toString() ?? '',
      direction: json['direction']?.toString(),
      scheduleName: json['schedule_name']?.toString(),
      vehiclePlate: json['vehicle_plate']?.toString(),
      busNumber: json['bus_number']?.toString(),
      estimatedDurationMinutes: (json['estimated_duration_minutes'] as num?)?.toInt(),
    );
  }

  String get busLabel {
    final plate = vehiclePlate?.trim();
    if (plate != null && plate.isNotEmpty) return plate;
    final bus = busNumber?.trim();
    if (bus != null && bus.isNotEmpty) return 'Bus $bus';
    return 'Assigned bus';
  }
}

class ParentLiveSnapshot {
  final bool tripActive;
  final double? lat;
  final double? lng;
  final double speedMps;
  final bool isEmergency;
  final String? vehiclePlate;
  final String? driverName;
  final ParentCrewContact? driver;
  final ParentCrewContact? conductor;
  final String? nextStopName;
  final int? etaMinutes;
  final int delaySeconds;
  final DateTime? predictedArrival;
  final String? transitStatus;
  final String? attendance;
  final String? direction;
  final ParentNextTrip? nextTrip;

  const ParentLiveSnapshot({
    required this.tripActive,
    this.lat,
    this.lng,
    this.speedMps = 0,
    this.isEmergency = false,
    this.vehiclePlate,
    this.driverName,
    this.driver,
    this.conductor,
    this.nextStopName,
    this.etaMinutes,
    this.delaySeconds = 0,
    this.predictedArrival,
    this.transitStatus,
    this.attendance,
    this.direction,
    this.nextTrip,
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
    final nextTripJson = body['next_trip'] is Map
        ? Map<String, dynamic>.from(body['next_trip'] as Map)
        : null;
    final nextTrip =
        nextTripJson != null ? ParentNextTrip.fromJson(nextTripJson) : null;

    DateTime? arrival;
    final rawArrival = eta?['predicted_arrival'];
    if (rawArrival != null) {
      arrival = DateTime.tryParse(rawArrival.toString())?.toUtc();
    }

    final tripActive = body['trip_active'] == true;
    final direction =
        trip['direction']?.toString() ?? nextTrip?.direction;
    final attendance = body['attendance']?.toString();
    final rawTransit = body['transit_status']?.toString();

    final driverJson = trip['driver'] is Map
        ? Map<String, dynamic>.from(trip['driver'] as Map)
        : null;
    final conductorJson = trip['conductor'] is Map
        ? Map<String, dynamic>.from(trip['conductor'] as Map)
        : null;
    var driver = ParentCrewContact.fromJson(driverJson);
    if (!driver.hasAnyDetail && trip['driver_name'] != null) {
      driver = ParentCrewContact(name: trip['driver_name']?.toString());
    }
    final conductor = ParentCrewContact.fromJson(conductorJson);

    return ParentLiveSnapshot(
      tripActive: tripActive,
      lat: (live?['lat'] as num?)?.toDouble(),
      lng: (live?['lng'] as num?)?.toDouble(),
      speedMps: (live?['speed'] as num?)?.toDouble() ?? 0,
      isEmergency: live?['is_emergency'] == true,
      vehiclePlate: trip['vehicle_plate']?.toString(),
      driverName: driver.name ?? trip['driver_name']?.toString(),
      driver: driver.hasAnyDetail ? driver : null,
      conductor: conductor.hasAnyDetail ? conductor : null,
      nextStopName: nextStop?['name']?.toString(),
      etaMinutes: (eta?['eta_minutes'] as num?)?.toInt() ??
          etaMinutesFromArrival(arrival),
      delaySeconds: (eta?['delay_seconds'] as num?)?.toInt() ?? 0,
      predictedArrival: etaMinutesFromArrival(arrival) == null ? null : arrival,
      transitStatus: parentChildStatusLabel(
        rawTransit,
        attendance: attendance,
        direction: direction,
        tripActive: tripActive,
      ),
      attendance: attendance,
      direction: direction,
      nextTrip: nextTrip,
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

String noTripScheduledTitle() => 'No trip scheduled today';

String noTripScheduledSubtitle() =>
    'When the school schedules a run for this child, departure time and bus details will show here.';

/// Countdown to today's departure clock (HH:MM) in Africa/Nairobi.
String countdownToDeparture(String departureHhMm, [DateTime? nowUtc]) {
  final match = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(departureHhMm.trim());
  if (match == null) return 'See schedule';
  final hour = int.tryParse(match.group(1)!);
  final minute = int.tryParse(match.group(2)!);
  if (hour == null || minute == null) return 'See schedule';

  final now = (nowUtc ?? DateTime.now()).toUtc();
  final nairobi = now.add(const Duration(hours: 3));
  final departNairobi = DateTime.utc(
    nairobi.year,
    nairobi.month,
    nairobi.day,
    hour,
    minute,
  );
  final departUtc = departNairobi.subtract(const Duration(hours: 3));
  final diff = departUtc.difference(now);
  if (diff.inSeconds <= 0) return 'Departing soon';
  final h = diff.inHours;
  final m = diff.inMinutes.remainder(60);
  final s = diff.inSeconds.remainder(60);
  if (h > 0) return 'Starts in ${h}h ${m}m';
  if (m > 0) return 'Starts in ${m}m ${s}s';
  return 'Starts in ${s}s';
}

String formatEstTripDuration(int? minutes) {
  if (minutes == null || minutes <= 0) return '--';
  return '~${minutes}m';
}

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
/// When [tripActive] is false, never returns "On the Bus".
String parentChildStatusLabel(
  String? transitStatus, {
  String? attendance,
  String? direction,
  bool tripActive = true,
}) {
  final idleByDirection =
      direction == 'SCHOOL_TO_HOME' ? 'At school' : 'Waiting for pickup';

  if (!tripActive) {
    return idleByDirection;
  }

  final att = (attendance ?? '').trim().toLowerCase();
  if (att == 'boarded') return 'On the Bus';
  if (att == 'dropped_off') return 'Dropped off';
  if (att == 'absent' || att == 'no_show') return 'Absent';
  if (att == 'pending') {
    return idleByDirection;
  }

  final value = (transitStatus ?? '').trim();
  if (value.isEmpty || value.toLowerCase() == 'pending') {
    return idleByDirection;
  }
  if (value.toLowerCase() == 'on the bus' || value.toLowerCase() == 'boarded') {
    return 'On the Bus';
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
