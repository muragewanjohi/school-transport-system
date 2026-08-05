import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Riverpod provider for managing active trip state.
final tripActiveProvider = StateProvider<bool>((ref) => false);

/// Riverpod provider for tracking emergency SOS status.
final emergencyActiveProvider = StateProvider<bool>((ref) => false);

/// Latest GPS / telemetry coordinates for the active trip UI.
class TelemetryCoords {
  final double latitude;
  final double longitude;
  final double speed;
  final double bearing;
  final String timestamp;

  TelemetryCoords({
    required this.latitude,
    required this.longitude,
    required this.speed,
    required this.bearing,
    required this.timestamp,
  });
}

final telemetryCoordsProvider = StateProvider<TelemetryCoords?>((ref) => null);
