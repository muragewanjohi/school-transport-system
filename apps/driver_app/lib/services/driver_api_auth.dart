import 'package:shared_preferences/shared_preferences.dart';

class DriverApiAuth {
  static Future<Map<String, String>> headers({bool jsonBody = true}) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token') ?? '';
    return {
      if (jsonBody) 'Content-Type': 'application/json',
      if (token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  static Future<String?> accessToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('access_token');
  }
}
