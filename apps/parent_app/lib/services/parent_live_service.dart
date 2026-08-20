import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/services/parent_api_auth.dart';
import 'package:parent_app/services/supabase_service.dart';
import 'package:parent_app/utils/parent_map_logic.dart';

class ParentLiveService {
  /// Prefers HMAC `/api/parent/live`. When that route is missing (404) or
  /// unauthorized, falls back to Supabase using the parent Auth session.
  static Future<ParentLiveSnapshot?> fetchLive(
    String studentId, {
    String? routeId,
  }) async {
    if (studentId.isEmpty) return null;

    final viaApi = await _fetchViaApi(studentId);
    if (viaApi != null) return viaApi;

    return _fetchViaSupabase(studentId: studentId, routeId: routeId);
  }

  static Future<ParentLiveSnapshot?> _fetchViaApi(String studentId) async {
    try {
      final headers = await ParentApiAuth.headers();
      if (headers['Authorization'] == null) return null;

      final uri = Uri.parse('${ApiConfig.baseUrl}/api/parent/live').replace(
        queryParameters: {'student_id': studentId},
      );
      final response = await http.get(uri, headers: headers).timeout(
            const Duration(seconds: 10),
          );
      if (response.statusCode != 200) return null;

      final body = json.decode(response.body) as Map<String, dynamic>;
      if (body['success'] != true) return null;
      return ParentLiveSnapshot.fromJson(body);
    } catch (_) {
      return null;
    }
  }

  static Future<ParentLiveSnapshot?> _fetchViaSupabase({
    required String studentId,
    String? routeId,
  }) async {
    try {
      final client = SupabaseService.client;
      if (client.auth.currentSession == null) return null;

      var resolvedRouteId = routeId ?? '';
      String? transitStatus;
      String? pickupStopId;
      String? dropoffStopId;

      final student = await client
          .from('students')
          .select(
            'id, route_id, transit_status, pickup_stop_id, dropoff_stop_id',
          )
          .eq('id', studentId)
          .maybeSingle()
          .timeout(const Duration(seconds: 8));

      if (student != null) {
        resolvedRouteId = student['route_id']?.toString() ?? resolvedRouteId;
        transitStatus = student['transit_status']?.toString();
        pickupStopId = student['pickup_stop_id']?.toString();
        dropoffStopId = student['dropoff_stop_id']?.toString();
      }
      if (resolvedRouteId.isEmpty) return ParentLiveSnapshot.idle();

      final tripRows = await client
          .from('trips')
          .select(
            'id, status, schedule:schedules(direction), vehicle:vehicles(license_plate), driver:profiles!trips_driver_id_fkey(name)',
          )
          .eq('route_id', resolvedRouteId)
          .eq('status', 'in_progress')
          .order('started_at', ascending: false)
          .limit(1)
          .timeout(const Duration(seconds: 8));

      if (tripRows is! List || tripRows.isEmpty) {
        return ParentLiveSnapshot(
          tripActive: false,
          transitStatus: transitStatus,
        );
      }

      final trip = Map<String, dynamic>.from(tripRows.first as Map);
      final schedule = trip['schedule'];
      final direction = schedule is Map ? schedule['direction']?.toString() : null;
      final vehicle = trip['vehicle'];
      final driver = trip['driver'];
      final plate = vehicle is Map ? vehicle['license_plate']?.toString() : null;
      final driverName = driver is Map ? driver['name']?.toString() : null;

      final liveRows = await client
          .from('live_coordinates')
          .select('coordinates, speed, bearing, is_emergency, created_at')
          .eq('route_id', resolvedRouteId)
          .order('created_at', ascending: false)
          .limit(1)
          .timeout(const Duration(seconds: 8));

      double? lat;
      double? lng;
      var speed = 0.0;
      var isEmergency = false;
      if (liveRows is List && liveRows.isNotEmpty) {
        final live = Map<String, dynamic>.from(liveRows.first as Map);
        final point = parseCoordinatePayload(live['coordinates']);
        lat = point?.lat;
        lng = point?.lng;
        speed = (live['speed'] as num?)?.toDouble() ?? 0;
        isEmergency = live['is_emergency'] == true;
      }

      final stopId = childStopIdForDirection(
        direction: direction,
        pickupStopId: pickupStopId,
        dropoffStopId: dropoffStopId,
      );
      String? nextStopName;
      if (stopId != null) {
        final stop = await client
            .from('stops')
            .select('id, name')
            .eq('id', stopId)
            .maybeSingle()
            .timeout(const Duration(seconds: 6));
        nextStopName = stop?['name']?.toString();
      }

      return ParentLiveSnapshot(
        tripActive: true,
        lat: lat,
        lng: lng,
        speedMps: speed,
        isEmergency: isEmergency,
        vehiclePlate: plate,
        driverName: driverName,
        nextStopName: nextStopName,
        transitStatus: transitStatus,
      );
    } catch (_) {
      return null;
    }
  }
}
