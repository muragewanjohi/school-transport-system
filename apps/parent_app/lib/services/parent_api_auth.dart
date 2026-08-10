import 'package:shared_preferences/shared_preferences.dart';

class ParentApiAuth {
  static const String tokenKey = 'access_token';

  static Future<Map<String, String>> headers({bool jsonBody = true}) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(tokenKey) ?? '';
    return {
      if (jsonBody) 'Content-Type': 'application/json',
      if (token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  static Future<String?> accessToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(tokenKey);
  }

  static Future<void> persistToken(String? token) async {
    final prefs = await SharedPreferences.getInstance();
    if (token == null || token.isEmpty) {
      await prefs.remove(tokenKey);
    } else {
      await prefs.setString(tokenKey, token);
    }
  }
}
