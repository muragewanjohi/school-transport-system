import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/services/parent_api_auth.dart';
import 'package:parent_app/services/parent_supabase_session.dart';

class ParentChildrenService {
  static Future<List<dynamic>?> fetchChildren({bool bootstrapSupabaseAuth = false}) async {
    try {
      final headers = await ParentApiAuth.headers();
      if (headers['Authorization'] == null) return null;
      if (bootstrapSupabaseAuth) {
        headers['x-bootstrap-supabase'] = '1';
      }

      final uri = Uri.parse('${ApiConfig.baseUrl}/api/parent/children');
      final response = await http.get(uri, headers: headers).timeout(
            const Duration(seconds: 12),
          );
      if (response.statusCode != 200) return null;

      final body = json.decode(response.body) as Map<String, dynamic>;
      if (body['success'] != true) return null;
      await ParentSupabaseSession.applyFromApiBody(body);
      final children = body['children'];
      if (children is! List) return null;
      return children;
    } catch (_) {
      return null;
    }
  }
}
