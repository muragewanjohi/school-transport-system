import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/services/parent_api_auth.dart';
import 'package:parent_app/utils/parent_avatar_logic.dart';

class ParentAvatarApi {
  static Future<String?> upload({
    required String target,
    required String id,
    required List<int> imageBytes,
    String? guardianPhone,
  }) async {
    try {
      final headers = await ParentApiAuth.headers();
      if (headers['Authorization'] == null) return null;

      final uri = Uri.parse('${ApiConfig.baseUrl}/api/parent/avatar');
      final response = await http
          .post(
            uri,
            headers: headers,
            body: json.encode(
              avatarApiPayload(
                target: target,
                id: id,
                imageBytes: imageBytes,
                guardianPhone: guardianPhone,
              ),
            ),
          )
          .timeout(const Duration(seconds: 45));

      if (response.statusCode != 200) return null;
      final decoded = json.decode(response.body);
      if (decoded is! Map) return null;
      if (decoded['success'] != true) return null;
      final url = decoded['avatar_url']?.toString();
      if (url == null || url.isEmpty) return null;
      return url;
    } catch (_) {
      return null;
    }
  }
}
