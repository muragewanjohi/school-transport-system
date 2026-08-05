import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:driver_app/config/api_config.dart';
import 'package:driver_app/services/driver_api_auth.dart';
import 'package:driver_app/services/osrm_routing_service.dart';

class DirectionsResult {
  final List<LatLng> points;
  final String source; // google | osrm | none

  const DirectionsResult({required this.points, required this.source});
}

/// Fetches a road-snapped driving polyline via the OnTheBus Directions proxy
/// (Google Directions). Falls back to OSRM when the proxy is missing/unavailable.
class GoogleDirectionsService {
  GoogleDirectionsService._();

  static Future<DirectionsResult> fetchDrivingRoute(List<LatLng> waypoints) async {
    if (waypoints.length < 2) {
      return const DirectionsResult(points: [], source: 'none');
    }

    final googlePoints = await _fetchViaProxy(waypoints);
    if (googlePoints.isNotEmpty) {
      return DirectionsResult(points: googlePoints, source: 'google');
    }

    final osrmPoints = await OsrmRoutingService.fetchDrivingRoute(waypoints);
    if (osrmPoints.isNotEmpty) {
      return DirectionsResult(points: osrmPoints, source: 'osrm');
    }

    return const DirectionsResult(points: [], source: 'none');
  }

  static Future<List<LatLng>> _fetchViaProxy(List<LatLng> waypoints) async {
    final capped = waypoints.length > 25 ? waypoints.sublist(0, 25) : waypoints;
    final body = {
      'waypoints': capped
          .map((p) => {'lat': p.latitude, 'lng': p.longitude})
          .toList(growable: false),
    };

    try {
      final response = await http
          .post(
            Uri.parse('${ApiConfig.baseUrl}/api/maps/directions'),
            headers: {
              ...await DriverApiAuth.headers(),
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: json.encode(body),
          )
          .timeout(const Duration(seconds: 15));

      final raw = response.body.trimLeft();
      if (raw.startsWith('<!') || raw.startsWith('<html')) {
        debugPrint(
          'Directions proxy returned HTML (${response.statusCode}) — not deployed or misconfigured.',
        );
        return const [];
      }

      final decoded = json.decode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && decoded['success'] == true) {
        final data = decoded['data'] as Map<String, dynamic>?;
        final points = data?['points'] as List<dynamic>? ?? const [];
        return points
            .whereType<Map>()
            .map(
              (p) => LatLng(
                (p['lat'] as num).toDouble(),
                (p['lng'] as num).toDouble(),
              ),
            )
            .toList();
      }

      debugPrint('Directions proxy failed (${response.statusCode}): ${decoded['error']}');
      return const [];
    } catch (e) {
      debugPrint('Directions proxy error: $e');
      return const [];
    }
  }
}
