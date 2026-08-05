import 'dart:math' as math;

/// Earth-surface distance in meters (Haversine).
double haversineDistanceMeters(double lat1, double lon1, double lat2, double lon2) {
  const earthRadius = 6371000.0;
  final dLat = _toRadians(lat2 - lat1);
  final dLon = _toRadians(lon2 - lon1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_toRadians(lat1)) *
          math.cos(_toRadians(lat2)) *
          math.sin(dLon / 2) *
          math.sin(dLon / 2);
  return earthRadius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

double _toRadians(double degrees) => degrees * math.pi / 180;

double? coordToDouble(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}

class GeoPoint {
  final double latitude;
  final double longitude;
  const GeoPoint(this.latitude, this.longitude);
}

/// GeoJSON Point on stops is `[lng, lat]`.
GeoPoint? stopLatLng(dynamic stop) {
  if (stop is! Map) return null;
  final location = stop['location'];
  if (location is Map) {
    final coords = location['coordinates'];
    if (coords is List && coords.length >= 2) {
      final lng = coordToDouble(coords[0]);
      final lat = coordToDouble(coords[1]);
      if (lat != null && lng != null) return GeoPoint(lat, lng);
    }
  }
  final lat = coordToDouble(stop['latitude']);
  final lng = coordToDouble(stop['longitude']);
  if (lat != null && lng != null) return GeoPoint(lat, lng);
  return null;
}

int stopGeofenceRadiusMeters(dynamic stop) {
  final raw = stop is Map ? stop['geofence_radius_meters'] : null;
  final parsed = coordToDouble(raw);
  if (parsed == null || parsed < 5) return 50;
  return parsed.round();
}

class ArrivedStop {
  final String id;
  final String name;
  final double distanceMeters;
  final int radiusMeters;

  const ArrivedStop({
    required this.id,
    required this.name,
    required this.distanceMeters,
    required this.radiusMeters,
  });
}

/// Nearest stop whose geofence contains the bus, or null if outside all fences.
ArrivedStop? findArrivedStop({
  required double latitude,
  required double longitude,
  required List<dynamic> stops,
}) {
  ArrivedStop? best;
  for (final stop in stops) {
    if (stop is! Map) continue;
    final point = stopLatLng(stop);
    if (point == null) continue;
    final id = stop['id']?.toString();
    if (id == null || id.isEmpty) continue;
    final radius = stopGeofenceRadiusMeters(stop);
    final distance = haversineDistanceMeters(
      latitude,
      longitude,
      point.latitude,
      point.longitude,
    );
    if (distance <= radius) {
      if (best == null || distance < best.distanceMeters) {
        best = ArrivedStop(
          id: id,
          name: (stop['name'] ?? 'Stop').toString(),
          distanceMeters: distance,
          radiusMeters: radius,
        );
      }
    }
  }
  return best;
}

/// Whether attendance action is allowed for this student at [arrivedStopId].
/// Board (`Present`) → pickup stop; Drop (`Absent` / already Present) → dropoff stop.
bool studentAllowedAtStop({
  required Map<String, dynamic> student,
  required String? arrivedStopId,
  required bool isBoardAction,
}) {
  if (arrivedStopId == null) return false;
  final pickup = student['pickup_stop_id']?.toString();
  final dropoff = student['dropoff_stop_id']?.toString();
  if (isBoardAction) {
    return pickup != null && pickup == arrivedStopId;
  }
  return dropoff != null && dropoff == arrivedStopId;
}

List<dynamic> sortedStopsBySequence(List<dynamic> stops) {
  final sorted = List<dynamic>.from(stops);
  sorted.sort((a, b) {
    final sa = (a is Map ? a['sequence_no'] : null) as num? ?? 0;
    final sb = (b is Map ? b['sequence_no'] : null) as num? ?? 0;
    return sa.compareTo(sb);
  });
  return sorted;
}

/// Next stop to drive toward:
/// - If currently inside a stop geofence → the following stop in sequence
/// - Otherwise → nearest stop by distance (or first stop if no GPS)
Map<String, dynamic>? nextNavigationStop({
  required List<dynamic> stops,
  double? latitude,
  double? longitude,
}) {
  final sorted = sortedStopsBySequence(stops);
  if (sorted.isEmpty) return null;

  if (latitude != null && longitude != null) {
    final arrived = findArrivedStop(
      latitude: latitude,
      longitude: longitude,
      stops: sorted,
    );
    if (arrived != null) {
      final idx = sorted.indexWhere((s) => s is Map && s['id']?.toString() == arrived.id);
      if (idx >= 0 && idx < sorted.length - 1) {
        final next = sorted[idx + 1];
        if (next is Map<String, dynamic>) return next;
        if (next is Map) return Map<String, dynamic>.from(next);
      }
      // At last stop — no further navigation target.
      return null;
    }

    Map<String, dynamic>? nearest;
    double? nearestDist;
    for (final stop in sorted) {
      if (stop is! Map) continue;
      final point = stopLatLng(stop);
      if (point == null) continue;
      final d = haversineDistanceMeters(
        latitude,
        longitude,
        point.latitude,
        point.longitude,
      );
      if (nearestDist == null || d < nearestDist) {
        nearestDist = d;
        nearest = Map<String, dynamic>.from(stop);
      }
    }
    return nearest;
  }

  final first = sorted.first;
  if (first is Map<String, dynamic>) return first;
  if (first is Map) return Map<String, dynamic>.from(first);
  return null;
}
