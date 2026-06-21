import 'package:geolocator/geolocator.dart';

class SupabaseService {
  // Static project connection credentials matching the user's Supabase instance
  static const String url = 'https://nxhccqbvjrxqqfvpfcmx.supabase.co';
  static const String anonKey = 'sb_publishable_o8dPRVLYMRr2TgUDH75cBA_J_BpuODZ';

  /// Request Fine, Coarse, and Background Location permissions.
  /// Ensures the hardware is enabled and degrades gracefully if rejected.
  ///
  /// Returns True if permissions are fully granted, false otherwise.
  static Future<bool> handleLocationPermissions() async {
    bool serviceEnabled;
    LocationPermission permission;

    // Test if location services are enabled.
    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return false;
    }

    return true;
  }
}
