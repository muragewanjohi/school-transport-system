import 'dart:async';
import 'dart:convert';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

class LocationTrackingService {
  /// Configure and initialize the background service definitions.
  static Future<void> initializeBackgroundService() async {
    final service = FlutterBackgroundService();

    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: onStart,
        autoStart: false, // Start manually on driver 'Start Trip' toggle
        isForegroundMode: true,
        notificationChannelId: 'telemetry_foreground_channel',
        initialNotificationTitle: 'OnTheBus Driver Active',
        initialNotificationContent: 'GPS telemetry engine starting...',
        foregroundServiceNotificationId: 888,
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: onStart,
        onBackground: onIosBackground,
      ),
    );
  }
}

/// Android/iOS Foreground service start handler executed in a separate isolate.
@pragma('vm:entry-point')
void onStart(ServiceInstance service) async {
  // Ensure Dart plugin APIs are initialized inside the separate background isolate
  DartPluginRegistrant.ensureInitialized();
  WidgetsFlutterBinding.ensureInitialized();

  // Track active trip parameters
  String? tenantId;
  String? vehicleId;
  String? routeId;
  String? accessToken;
  String? apiBaseUrl;

  // Handle configuration updates from the main UI thread
  service.on('updateConfig').listen((event) {
    if (event != null) {
      tenantId = event['tenantId'];
      vehicleId = event['vehicleId'];
      routeId = event['routeId'];
      accessToken = event['accessToken'];
      apiBaseUrl = event['apiBaseUrl'];
    }
  });

  // Handle stop service execution request
  service.on('stopService').listen((event) {
    service.stopSelf();
  });

  bool isEmergency = false;

  // Handle emergency SOS toggles from the main UI thread
  service.on('toggleSOS').listen((event) {
    if (event != null) {
      isEmergency = event['isEmergency'] as bool? ?? false;
    }
  });

  // Debug GPS replay: UI injects mock coordinates so the isolate does not
  // overwrite the simulated trip with the emulator/device GPS.
  bool mockEnabled = false;
  double? mockLat;
  double? mockLng;
  double mockSpeed = 0;
  double mockBearing = 0;

  service.on('setMockLocation').listen((event) {
    if (event == null) return;
    mockEnabled = event['enabled'] == true;
    if (!mockEnabled) {
      mockLat = null;
      mockLng = null;
      mockSpeed = 0;
      mockBearing = 0;
      return;
    }
    final lat = event['latitude'];
    final lng = event['longitude'];
    mockLat = lat is num ? lat.toDouble() : double.tryParse('$lat');
    mockLng = lng is num ? lng.toDouble() : double.tryParse('$lng');
    final speed = event['speed'];
    final bearing = event['bearing'];
    mockSpeed = speed is num ? speed.toDouble() : 0;
    mockBearing = bearing is num ? bearing.toDouble() : 0;
  });

  // Start periodic GPS location tracking at 5-second intervals (Success Criteria 1)
  Timer.periodic(const Duration(seconds: 5), (timer) async {
    // Stop the timer if the service instance was stopped
    if (service is AndroidServiceInstance && !await service.isForegroundService()) {
      timer.cancel();
      return;
    }

    // Ensure we have active configuration keys before trying to stream coordinates
    if (tenantId == null || vehicleId == null || routeId == null || accessToken == null || apiBaseUrl == null) {
      if (service is AndroidServiceInstance) {
        service.setForegroundNotificationInfo(
          title: "OnTheBus Driver Active",
          content: "Waiting for trip details assignment...",
        );
      }
      return;
    }

    try {
      final double latitude;
      final double longitude;
      final double speed;
      final double bearing;

      if (mockEnabled) {
        if (mockLat == null || mockLng == null) return;
        latitude = mockLat!;
        longitude = mockLng!;
        speed = mockSpeed;
        bearing = mockBearing;
      } else {
        final Position position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 4),
          ),
        );
        latitude = position.latitude;
        longitude = position.longitude;
        speed = position.speed;
        bearing = position.heading;
      }

      // Update foreground notification with live coordinates or SOS status
      if (service is AndroidServiceInstance) {
        service.setForegroundNotificationInfo(
          title: isEmergency ? "⚠️ CRITICAL SOS ACTIVE" : "OnTheBus Driver Running",
          content: isEmergency
              ? "Distress Signal Broadcasting..."
              : mockEnabled
                  ? "Simulating GPS along the route"
                  : "Bus Location: Lat ${latitude.toStringAsFixed(5)}, Lng ${longitude.toStringAsFixed(5)}",
        );
      }

      // Insert GPS telemetry via secured Next.js API (service role; no anon RLS bypass)
      await http.post(
        Uri.parse('$apiBaseUrl/api/driver/telemetry'),
        headers: {
          'Authorization': 'Bearer $accessToken',
          'Content-Type': 'application/json',
        },
        body: json.encode({
          'tenant_id': tenantId,
          'vehicle_id': vehicleId,
          'route_id': routeId,
          'latitude': latitude,
          'longitude': longitude,
          'speed': speed,
          'bearing': bearing,
          'is_emergency': isEmergency,
        }),
      );

      // Broadcast coordinate updates back to the main UI thread for local updates
      service.invoke('telemetryUpdate', {
        'latitude': latitude,
        'longitude': longitude,
        'speed': speed,
        'bearing': bearing,
        'timestamp': DateTime.now().toIso8601String(),
        'isEmergency': isEmergency,
      });

    } catch (e) {
      if (service is AndroidServiceInstance) {
        service.setForegroundNotificationInfo(
          title: isEmergency ? "⚠️ SOS Broadcast Warning" : "OnTheBus Driver Warning",
          content: "Failed to stream GPS: ${e.toString().split('\n').first}",
        );
      }
    }
  });
}

/// iOS background callback hook
@pragma('vm:entry-point')
bool onIosBackground(ServiceInstance service) {
  WidgetsFlutterBinding.ensureInitialized();
  return true;
}
