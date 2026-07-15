import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static const String url = 'https://nxhccqbvjrxqqfvpfcmx.supabase.co';
  static const String anonKey = 'sb_publishable_o8dPRVLYMRr2TgUDH75cBA_J_BpuODZ';

  static SupabaseClient get client => Supabase.instance.client;

  /// Update student attendance status (Present vs Absent)
  static Future<bool> updateStudentStatus(String studentId, String status) async {
    try {
      await client
          .from('students')
          .update({'status': status})
          .eq('id', studentId);
      return true;
    } catch (e) {
      print('Error updating student status: $e');
      return false;
    }
  }

  /// Update student home/pickup location coordinates (using WKT Point format)
  static Future<bool> updateStudentPickupLocation(
      String studentId, double latitude, double longitude) async {
    try {
      final wktPoint = 'POINT($longitude $latitude)';
      await client
          .from('students')
          .update({'pickup_location': wktPoint})
          .eq('id', studentId);
      return true;
    } catch (e) {
      print('Error updating student pickup location: $e');
      return false;
    }
  }

  /// Fetch route details (coordinates path and stops)
  static Future<Map<String, dynamic>?> fetchRouteDetails(String routeId) async {
    try {
      final routeData = await client
          .from('routes')
          .select('id, name, path')
          .eq('id', routeId)
          .single();

      final stopsData = await client
          .from('stops')
          .select('id, name, location, sequence_no, stop_type')
          .eq('route_id', routeId)
          .order('sequence_no', ascending: true);

      return {
        'route': routeData,
        'stops': stopsData,
      };
    } catch (e) {
      print('Error fetching route details: $e');
      return null;
    }
  }
}
