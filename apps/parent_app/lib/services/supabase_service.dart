import 'dart:typed_data';
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

  /// Update student home/pickup location coordinates (using WKT Point format and optional address text)
  static Future<bool> updateStudentPickupLocation(
      String studentId, double latitude, double longitude, {String? addressText}) async {
    try {
      final wktPoint = 'POINT($longitude $latitude)';
      final Map<String, dynamic> updateData = {'pickup_location': wktPoint};
      if (addressText != null && addressText.isNotEmpty) {
        updateData['address'] = addressText;
      }
      await client
          .from('students')
          .update(updateData)
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

  /// Upload avatar photo to Supabase Storage bucket 'avatars' and update database table
  static Future<String?> uploadAvatar({
    required String id,
    required String targetTable,
    required List<int> imageBytes,
    required String fileName,
  }) async {
    try {
      final String storagePath = 'public/${targetTable}_${id}_${DateTime.now().millisecondsSinceEpoch}.jpg';
      
      await client.storage.from('avatars').uploadBinary(
            storagePath,
            Uint8List.fromList(imageBytes),
            fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: true),
          );

      final String publicUrl = client.storage.from('avatars').getPublicUrl(storagePath);

      await client
          .from(targetTable)
          .update({'avatar_url': publicUrl})
          .eq('id', id);

      return publicUrl;
    } catch (e) {
      print('Error uploading avatar to Supabase Storage: $e');
      return null;
    }
  }

  /// Delete avatar photo from Supabase Storage and clear database field
  static Future<bool> deleteAvatar({
    required String id,
    required String targetTable,
    required String currentAvatarUrl,
  }) async {
    try {
      if (currentAvatarUrl.contains('/avatars/')) {
        final String path = currentAvatarUrl.split('/avatars/').last;
        await client.storage.from('avatars').remove([path]);
      }

      await client
          .from(targetTable)
          .update({'avatar_url': null})
          .eq('id', id);

      return true;
    } catch (e) {
      print('Error deleting avatar from Supabase Storage: $e');
      return false;
    }
  }
}
