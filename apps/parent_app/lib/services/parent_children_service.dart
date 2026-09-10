import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/services/parent_session_recovery.dart';
import 'package:parent_app/services/parent_supabase_session.dart';

class ParentChildrenService {
  static Future<List<dynamic>?> fetchChildren({bool bootstrapSupabaseAuth = false}) async {
    try {
      final uri = Uri.parse('${ApiConfig.baseUrl}/api/parent/children');
      final response = await ParentSessionRecovery.sendWithRetry(
        (headers) => http.get(uri, headers: headers).timeout(
              const Duration(seconds: 12),
            ),
        extraHeaders: bootstrapSupabaseAuth ? {'x-bootstrap-supabase': '1'} : null,
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
