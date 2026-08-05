import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/services/osrm_routing_service.dart';

class GoogleDirectionsService {
  GoogleDirectionsService._();

  static Future<List<LatLng>> fetchDrivingRoute(List<LatLng> waypoints) async {
    if (waypoints.length < 2) return const [];

    final googlePoints = await _fetchViaProxy(waypoints);
    if (googlePoints.isNotEmpty) return googlePoints;

    return OsrmRoutingService.fetchDrivingRoute(waypoints);
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
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: json.encode(body),
          )
          .timeout(const Duration(seconds: 15));

      final raw = response.body.trimLeft();
      if (raw.startsWith('<!') || raw.startsWith('<html')) {
        debugPrint('Directions proxy returned HTML (${response.statusCode})');
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
      return const [];
    } catch (e) {
      debugPrint('Directions proxy error: $e');
      return const [];
    }
  }
}
