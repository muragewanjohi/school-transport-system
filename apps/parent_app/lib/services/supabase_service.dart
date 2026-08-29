import 'dart:typed_data';
import 'package:parent_app/services/parent_avatar_api.dart';
import 'package:parent_app/services/parent_children_service.dart';
import 'package:parent_app/services/parent_supabase_session.dart';
import 'package:parent_app/utils/parent_avatar_logic.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static const String url = 'https://nxhccqbvjrxqqfvpfcmx.supabase.co';
  static const String anonKey = 'sb_publishable_o8dPRVLYMRr2TgUDH75cBA_J_BpuODZ';

  static SupabaseClient get client => Supabase.instance.client;

  /// Update parent-editable student profile fields (name, home address).
  static Future<bool> updateStudentProfile(
    String studentId, {
    required String name,
    String? address,
  }) async {
    try {
      final Map<String, dynamic> updateData = {'name': name};
      if (address != null) {
        updateData['address'] = address;
      }
      await client.from('students').update(updateData).eq('id', studentId);
      return true;
    } catch (e) {
      print('Error updating student profile: $e');
      return false;
    }
  }

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

  /// One-shot fetch of live per-stop ETAs for a route (from `trip_stop_etas`).
  static Future<List<Map<String, dynamic>>> fetchTripStopEtas(String routeId) async {
    try {
      final rows = await client
          .from('trip_stop_etas')
          .select('stop_id, predicted_arrival, delay_seconds, updated_at, trip_id')
          .eq('route_id', routeId)
          .order('updated_at', ascending: false);
      return List<Map<String, dynamic>>.from(rows as List);
    } catch (e) {
      print('Error fetching trip stop ETAs: $e');
      return [];
    }
  }

  /// Realtime stream of live per-stop ETAs for a route.
  static Stream<List<Map<String, dynamic>>> streamTripStopEtas(String routeId) {
    return client
        .from('trip_stop_etas')
        .stream(primaryKey: ['id'])
        .eq('route_id', routeId)
        .order('updated_at', ascending: false)
        .map((rows) => List<Map<String, dynamic>>.from(rows));
  }

  /// Upload avatar photo to Supabase Storage bucket 'avatars' and update database table.
  /// [targetTable] must be `students` or `profiles` (owner-scoped RLS).
  static Future<String?> uploadAvatar({
    required String id,
    required String targetTable,
    required List<int> imageBytes,
    required String fileName,
  }) async {
    try {
      if (targetTable != 'students' && targetTable != 'profiles') {
        print('Error uploading avatar: unsupported table $targetTable');
        return null;
      }

      final viaApi = await ParentAvatarApi.upload(
        target: targetTable,
        id: id,
        imageBytes: imageBytes,
      );
      if (viaApi != null && viaApi.isNotEmpty) return viaApi;

      await ParentSupabaseSession.ensureActive();
      if (client.auth.currentUser?.id == null) {
        // Bootstraps auth.users for legacy HMAC-only sessions before storage fallback.
        await ParentChildrenService.fetchChildren(bootstrapSupabaseAuth: true);
      }

      final uid = client.auth.currentUser?.id;
      if (uid == null || uid.isEmpty) {
        print('Error uploading avatar: no Supabase Auth session');
        return null;
      }

      final storagePath = avatarStoragePath(
        ownerUserId: uid,
        targetKey: targetTable,
        entityId: id,
      );

      await client.storage.from('avatars').uploadBinary(
            storagePath,
            Uint8List.fromList(imageBytes),
            fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: true),
          );

      final String publicUrl = client.storage.from('avatars').getPublicUrl(storagePath);

      await client.from(targetTable).update({'avatar_url': publicUrl}).eq('id', id);

      return publicUrl;
    } catch (e) {
      print('Error uploading avatar to Supabase Storage: $e');
      return null;
    }
  }

  /// Upload photo for a secondary guardian stored in `students.guardians` JSONB.
  static Future<String?> uploadGuardianAvatar({
    required String studentId,
    required String guardianPhone,
    required List<int> imageBytes,
    required String fileName,
  }) async {
    try {
      final viaApi = await ParentAvatarApi.upload(
        target: 'guardian',
        id: studentId,
        imageBytes: imageBytes,
        guardianPhone: guardianPhone,
      );
      if (viaApi != null && viaApi.isNotEmpty) return viaApi;

      await ParentSupabaseSession.ensureActive();
      if (client.auth.currentUser?.id == null) {
        // Bootstraps auth.users for legacy HMAC-only sessions before storage fallback.
        await ParentChildrenService.fetchChildren(bootstrapSupabaseAuth: true);
      }

      final uid = client.auth.currentUser?.id;
      if (uid == null || uid.isEmpty) {
        print('Error uploading guardian avatar: no Supabase Auth session');
        return null;
      }

      final row = await client
          .from('students')
          .select('guardians')
          .eq('id', studentId)
          .maybeSingle();
      final rawGuardians = row?['guardians'];
      if (rawGuardians is! List ||
          indexOfGuardianByPhone(rawGuardians, guardianPhone) < 0) {
        print('Error uploading guardian avatar: guardian not found on student');
        return null;
      }

      final storagePath = avatarStoragePath(
        ownerUserId: uid,
        targetKey: 'guardian',
        entityId: studentId,
      );

      await client.storage.from('avatars').uploadBinary(
            storagePath,
            Uint8List.fromList(imageBytes),
            fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: true),
          );

      final publicUrl = client.storage.from('avatars').getPublicUrl(storagePath);
      final updated = withGuardianAvatarUrl(
        guardians: rawGuardians,
        guardianPhone: guardianPhone,
        avatarUrl: publicUrl,
      );

      await client.from('students').update({'guardians': updated}).eq('id', studentId);
      return publicUrl;
    } catch (e) {
      print('Error uploading guardian avatar: $e');
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
      final path = avatarObjectPathFromPublicUrl(currentAvatarUrl);
      if (path != null) {
        await client.storage.from('avatars').remove([path]);
      }

      await client.from(targetTable).update({'avatar_url': null}).eq('id', id);

      return true;
    } catch (e) {
      print('Error deleting avatar from Supabase Storage: $e');
      return false;
    }
  }

  static Future<bool> deleteGuardianAvatar({
    required String studentId,
    required String guardianPhone,
    required String currentAvatarUrl,
  }) async {
    try {
      final path = avatarObjectPathFromPublicUrl(currentAvatarUrl);
      if (path != null) {
        await client.storage.from('avatars').remove([path]);
      }

      final row = await client
          .from('students')
          .select('guardians')
          .eq('id', studentId)
          .maybeSingle();
      final rawGuardians = row?['guardians'];
      if (rawGuardians is! List) return false;

      final updated = withGuardianAvatarUrl(
        guardians: rawGuardians,
        guardianPhone: guardianPhone,
        avatarUrl: null,
      );
      await client.from('students').update({'guardians': updated}).eq('id', studentId);
      return true;
    } catch (e) {
      print('Error deleting guardian avatar: $e');
      return false;
    }
  }
}
