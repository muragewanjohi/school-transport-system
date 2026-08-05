import 'dart:io';

/// Central API host for Parent app HTTP calls (auth + Google Maps proxies).
class ApiConfig {
  static const String productionUrl = 'https://www.onthebusapp.com';

  static String get baseUrl {
    const fromEnv = String.fromEnvironment('API_BASE_URL');
    if (fromEnv.isNotEmpty) {
      return fromEnv.replaceAll(RegExp(r'/+$'), '');
    }
    return productionUrl;
  }

  static String get localEmulatorUrl => 'http://10.0.2.2:3000';

  static String get localHostUrl {
    try {
      if (Platform.isAndroid) return localEmulatorUrl;
    } catch (_) {}
    return 'http://localhost:3000';
  }
}
