import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:driver_app/utils/geo_utils.dart';

/// Opens Google Maps turn-by-turn navigation to a stop.
class StopNavigationService {
  StopNavigationService._();

  static Future<bool> navigateToStop(Map<String, dynamic> stop) async {
    final point = stopLatLng(stop);
    if (point == null) {
      debugPrint('Stop has no coordinates for navigation');
      return false;
    }

    final lat = point.latitude;
    final lng = point.longitude;
    final label = Uri.encodeComponent((stop['name'] ?? 'Stop').toString());

    // Prefer native Google Maps navigation intent on Android.
    final navUri = Uri.parse('google.navigation:q=$lat,$lng&mode=d');
    if (await canLaunchUrl(navUri)) {
      return launchUrl(navUri, mode: LaunchMode.externalApplication);
    }

    // Cross-platform / iOS fallback: Google Maps directions web/app deep link.
    final mapsUri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving&dir_action=navigate',
    );
    if (await canLaunchUrl(mapsUri)) {
      return launchUrl(mapsUri, mode: LaunchMode.externalApplication);
    }

    // Last resort: geo: URI with label.
    final geoUri = Uri.parse('geo:$lat,$lng?q=$lat,$lng($label)');
    if (await canLaunchUrl(geoUri)) {
      return launchUrl(geoUri, mode: LaunchMode.externalApplication);
    }

    return false;
  }
}
