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
