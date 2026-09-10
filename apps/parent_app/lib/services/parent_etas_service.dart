import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/services/parent_session_recovery.dart';
import 'package:parent_app/utils/eta_utils.dart';

class ParentEtasService {
  /// Fetches the live ETA for [studentId] via the signed parent session API.
  static Future<StopEta?> fetchStudentEta(String studentId) async {
    if (studentId.isEmpty) return null;
    final uuid = RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    );
    if (!uuid.hasMatch(studentId)) return null;

    try {
      final uri = Uri.parse('${ApiConfig.baseUrl}/api/parent/etas').replace(
        queryParameters: {'student_id': studentId},
      );
      final response = await ParentSessionRecovery.sendWithRetry(
        (headers) => http.get(uri, headers: headers).timeout(
              const Duration(seconds: 10),
            ),
      );

      if (response.statusCode != 200) {
        return null;
      }

      final body = json.decode(response.body) as Map<String, dynamic>;
      if (body['success'] != true || body['eta'] == null) {
        return null;
      }

      final eta = body['eta'] as Map<String, dynamic>;
      return StopEta.fromRow({
        'predicted_arrival': eta['predicted_arrival'],
        'delay_seconds': eta['delay_seconds'] ?? 0,
      });
    } catch (e) {
      print('Error fetching parent ETA: $e');
      return null;
    }
  }
}
