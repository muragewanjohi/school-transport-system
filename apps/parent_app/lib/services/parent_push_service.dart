import 'dart:convert';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/firebase_options.dart';
import 'package:parent_app/services/parent_api_auth.dart';
import 'package:parent_app/services/supabase_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

@pragma('vm:entry-point')
Future<void> parentFirebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Notification payload is displayed by the OS when the app is backgrounded.
}

class ParentPushService {
  static const tokenPrefsKey = 'fcm_token';
  static final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  static bool _localReady = false;
  static bool _fcmReady = false;

  static Future<void> initLocal() async {
    if (_localReady) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _local.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    _localReady = true;
  }

  static Future<void> showLocal(String title, String body) async {
    try {
      await initLocal();
      const android = AndroidNotificationDetails(
        'parent_trip_alerts',
        'Trip alerts',
        channelDescription: 'Campus exit, approach, delay, and boarding alerts',
        importance: Importance.high,
        priority: Priority.high,
      );
      await _local.show(
        DateTime.now().millisecondsSinceEpoch.remainder(100000),
        title,
        body,
        const NotificationDetails(
          android: android,
          iOS: DarwinNotificationDetails(),
        ),
      );
    } catch (_) {
      debugPrint('Local notification skipped');
    }
  }

  static Future<void> registerAfterLogin() async {
    await initLocal();
    await _registerFcm();
  }

  static Future<void> unregisterOnLogout() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(tokenPrefsKey);
      if (token == null || token.isEmpty) return;
      await deleteToken(token);
      await prefs.remove(tokenPrefsKey);
    } catch (_) {
      debugPrint('FCM unregister skipped');
    }
  }

  static Future<void> _registerFcm() async {
    if (kIsWeb) return;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      }
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      if (!_fcmReady) {
        FirebaseMessaging.onMessage.listen((message) {
          final notification = message.notification;
          final title = notification?.title ?? message.data['title']?.toString();
          final body = notification?.body ?? message.data['message']?.toString();
          if (title != null && body != null) {
            showLocal(title, body);
          }
        });
        messaging.onTokenRefresh.listen(upsertToken);
        _fcmReady = true;
      }
      final token = await messaging.getToken();
      if (token == null || token.isEmpty) return;
      await upsertToken(token);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(tokenPrefsKey, token);
    } catch (_) {
      debugPrint('FCM register skipped');
    }
  }

  static String deviceType() {
    try {
      if (Platform.isIOS) return 'ios';
    } catch (_) {}
    return 'android';
  }

  static Future<void> upsertToken(String token) async {
    try {
      final headers = await ParentApiAuth.headers();
      if (headers['Authorization'] != null) {
        final uri = Uri.parse('${ApiConfig.baseUrl}/api/parent/fcm-tokens');
        final response = await http
            .post(
              uri,
              headers: headers,
              body: json.encode({'token': token, 'device_type': deviceType()}),
            )
            .timeout(const Duration(seconds: 10));
        if (response.statusCode == 200) return;
      }
    } catch (_) {}

    final userId = SupabaseService.client.auth.currentUser?.id;
    if (userId == null) return;
    await SupabaseService.client.from('user_fcm_tokens').upsert(
      {
        'user_id': userId,
        'token': token,
        'device_type': deviceType(),
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      onConflict: 'user_id,token',
    );
  }

  static Future<void> deleteToken(String token) async {
    try {
      final headers = await ParentApiAuth.headers();
      if (headers['Authorization'] != null) {
        final uri = Uri.parse('${ApiConfig.baseUrl}/api/parent/fcm-tokens');
        final response = await http
            .delete(
              uri,
              headers: headers,
              body: json.encode({'token': token}),
            )
            .timeout(const Duration(seconds: 10));
        if (response.statusCode == 200) return;
      }
    } catch (_) {}

    final userId = SupabaseService.client.auth.currentUser?.id;
    if (userId == null) return;
    await SupabaseService.client.from('user_fcm_tokens').delete().eq('user_id', userId).eq('token', token);
  }
}
