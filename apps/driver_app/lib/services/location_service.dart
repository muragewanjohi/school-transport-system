import 'dart:async';
import 'dart:convert';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:driver_app/services/supabase_service.dart';

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
        initialNotificationTitle: 'Safaricom Track Active',
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

  // Handle configuration updates from the main UI thread
  service.on('updateConfig').listen((event) {
    if (event != null) {
      tenantId = event['tenantId'];
      vehicleId = event['vehicleId'];
      routeId = event['routeId'];
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

  // Start periodic GPS location tracking at 5-second intervals (Success Criteria 1)
  Timer.periodic(const Duration(seconds: 5), (timer) async {
    // Stop the timer if the service instance was stopped
    if (service is AndroidServiceInstance && !await service.isForegroundService()) {
      timer.cancel();
      return;
    }

    // Ensure we have active configuration keys before trying to stream coordinates
    if (tenantId == null || vehicleId == null || routeId == null) {
      if (service is AndroidServiceInstance) {
        service.setForegroundNotificationInfo(
          title: "Safaricom Track Active",
          content: "Waiting for trip details assignment...",
        );
      }
      return;
    }

    try {
      // Fetch high-precision GPS coordinate details using modern LocationSettings API
      final Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 4),
        ),
      );

      // Update foreground notification with live coordinates or SOS status
      if (service is AndroidServiceInstance) {
        service.setForegroundNotificationInfo(
          title: isEmergency ? "⚠️ CRITICAL SOS ACTIVE" : "Safaricom Track Running",
          content: isEmergency
              ? "Distress Signal Broadcasting..."
              : "Bus Location: Lat ${position.latitude.toStringAsFixed(5)}, Lng ${position.longitude.toStringAsFixed(5)}",
        );
      }

      // Insert GPS telemetry into PostgreSQL + PostGIS database via REST API
      await http.post(
        Uri.parse('${SupabaseService.url}/rest/v1/live_coordinates'),
        headers: {
          'apikey': SupabaseService.anonKey,
          'Authorization': 'Bearer ${SupabaseService.anonKey}',
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: json.encode({
          'tenant_id': tenantId,
          'vehicle_id': vehicleId,
          'route_id': routeId,
          'coordinates': 'POINT(${position.longitude} ${position.latitude})',
          'speed': position.speed,
          'bearing': position.heading,
          'is_emergency': isEmergency,
        }),
      );

      // Broadcast coordinate updates back to the main UI thread for local updates
      service.invoke('telemetryUpdate', {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'speed': position.speed,
        'bearing': position.heading,
        'timestamp': DateTime.now().toIso8601String(),
        'isEmergency': isEmergency,
      });

    } catch (e) {
      if (service is AndroidServiceInstance) {
        service.setForegroundNotificationInfo(
          title: isEmergency ? "⚠️ SOS Broadcast Warning" : "Safaricom Track Warning",
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
