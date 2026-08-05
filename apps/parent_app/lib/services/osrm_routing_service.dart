import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:google_maps_flutter/google_maps_flutter.dart';

class OsrmRoutingService {
  OsrmRoutingService._();

  static const _base = 'https://router.project-osrm.org/route/v1/driving';

  static Future<List<LatLng>> fetchDrivingRoute(List<LatLng> waypoints) async {
    if (waypoints.length < 2) return const [];
    final capped = waypoints.length > 25 ? waypoints.sublist(0, 25) : waypoints;
    final coords = capped.map((p) => '${p.longitude},${p.latitude}').join(';');
    final uri = Uri.parse('$_base/$coords?overview=full&geometries=geojson&steps=false');

    try {
      final response = await http.get(
        uri,
        headers: const {
          'Accept': 'application/json',
          'User-Agent': 'OnTheBusParent/1.0 (com.schooltrack.parent_app)',
        },
      ).timeout(const Duration(seconds: 12));
      if (response.statusCode != 200) return const [];
      final body = json.decode(response.body) as Map<String, dynamic>;
      if (body['code'] != 'Ok') return const [];
      final routes = body['routes'] as List<dynamic>?;
      if (routes == null || routes.isEmpty) return const [];
      final geometry = routes.first['geometry'];
      if (geometry is! Map) return const [];
      final coordinates = geometry['coordinates'];
      if (coordinates is! List) return const [];
      return [
        for (final c in coordinates)
          if (c is List && c.length >= 2)
            LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()),
      ];
    } catch (e) {
      debugPrint('OSRM fallback failed: $e');
      return const [];
    }
  }
}
