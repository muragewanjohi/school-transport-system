import 'package:parent_app/utils/parent_children_logic.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Direct Supabase roster, used only when `/api/parent/children` is unreachable.
///
/// Deliberately not filtered by `parent_id`: RLS (`parent_student_ids()`) already
/// limits rows to the signed-in parent's children, including students where they
/// are a secondary guardian rather than the primary `parent_id`.
class ParentChildrenFallback {
  static const nestedSelect =
      'id, name, grade, class_name, address, route_id, status, guardians, avatar_url, transit_status, tenant:tenants(id, name), pickup_stop:stops!students_pickup_stop_id_fkey(id, name, location), dropoff_stop:stops!students_dropoff_stop_id_fkey(id, name, location), route:routes(id, name, schedules(id, name, departure_time, direction, days_of_week))';

  static const simpleSelect =
      'id, name, grade, class_name, address, route_id, status, guardians, avatar_url, transit_status';

  /// Returns the roster, or null when both queries fail or time out.
  static Future<List<dynamic>?> fetch(
    SupabaseClient client, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    final nested = await awaitOrNull(
      client.from('students').select(nestedSelect),
      timeout: timeout,
    );
    if (nested is List) return nested;

    final simple = await awaitOrNull(
      client.from('students').select(simpleSelect),
      timeout: timeout,
    );
    return simple is List ? simple : null;
  }
}
