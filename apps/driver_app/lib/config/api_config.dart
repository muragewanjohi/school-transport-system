import 'dart:io';

/// Central API host for Driver app HTTP calls.
///
/// Defaults to production (`www`) so Play Review / release builds work.
/// Apex `onthebusapp.com` 308-redirects to www; POST bodies can be lost and
/// the client then parses HTML → "invalid data format".
///
/// Local dashboard override:
/// `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000`
class ApiConfig {
  static const String productionUrl = 'https://www.onthebusapp.com';

  static String get baseUrl {
    const fromEnv = String.fromEnvironment('API_BASE_URL');
    if (fromEnv.isNotEmpty) {
      return fromEnv.replaceAll(RegExp(r'/+$'), '');
    }
    return productionUrl;
  }

  /// Local Next.js on the Android emulator loopback (host machine :3000).
  static String get localEmulatorUrl => 'http://10.0.2.2:3000';

  static String get localHostUrl {
    try {
      if (Platform.isAndroid) return localEmulatorUrl;
    } catch (_) {}
    return 'http://localhost:3000';
  }
}
