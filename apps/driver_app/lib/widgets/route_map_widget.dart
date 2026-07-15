import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:http/http.dart' as http;

class RouteMapWidget extends StatefulWidget {
  final String routeId;
  final double? liveLatitude;
  final double? liveLongitude;
  final String? vehiclePlate;

  const RouteMapWidget({
    super.key,
    required this.routeId,
    this.liveLatitude,
    this.liveLongitude,
    this.vehiclePlate,
  });

  @override
  State<RouteMapWidget> createState() => _RouteMapWidgetState();
}

class _RouteMapWidgetState extends State<RouteMapWidget> {
  List<dynamic> _stops = [];
  bool _isLoadingStops = false;
  final MapController _mapController = MapController();

  // Mapbox Access Token used in Web App
  static const String _mapboxToken = "pk.eyJ1IjoibXVyYWdlMTAxIiwiYSI6ImNtcWdiM21mZjA1ZWkycnM3MmpnMXJjeWQifQ.ZmGc4WbWEbgNHPg4jHijzg";

  @override
  void initState() {
    super.initState();
    _fetchRouteStops();
  }

  @override
  void didUpdateWidget(covariant RouteMapWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.liveLatitude != oldWidget.liveLatitude ||
        widget.liveLongitude != oldWidget.liveLongitude) {
      if (widget.liveLatitude != null && widget.liveLongitude != null) {
        _mapController.move(
          LatLng(widget.liveLatitude!, widget.liveLongitude!),
          _mapController.camera.zoom,
        );
      }
    }
  }

  String _getApiBaseUrl() {
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:3000';
      }
    } catch (_) {}
    return 'http://localhost:3000';
  }

  Future<void> _fetchRouteStops() async {
    if (!mounted) return;
    setState(() => _isLoadingStops = true);
    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.get(
        Uri.parse('$baseUrl/api/stops?route_id=${widget.routeId}'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          setState(() {
            _stops = result['data'] as List<dynamic>;
          });
        }
      }
    } catch (e) {
      debugPrint("Error fetching stops for map: $e");
    } finally {
      if (mounted) {
        setState(() => _isLoadingStops = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final LatLng initialCenter = widget.liveLatitude != null && widget.liveLongitude != null
        ? LatLng(widget.liveLatitude!, widget.liveLongitude!)
        : _stops.isNotEmpty &&
                _stops[0]['location'] != null &&
                _stops[0]['location']['coordinates'] != null
            ? LatLng(
                _stops[0]['location']['coordinates'][1] as double,
                _stops[0]['location']['coordinates'][0] as double,
              )
            : const LatLng(-1.2845, 36.8192); // Nairobi CBD fallback

    final List<Marker> markers = [];

    // 1. Add stops markers
    for (var stop in _stops) {
      if (stop['location'] != null && stop['location']['coordinates'] != null) {
        final double lng = stop['location']['coordinates'][0] as double;
        final double lat = stop['location']['coordinates'][1] as double;
        final String stopName = stop['name'] ?? 'Stop';
        final bool isSchool = stopName.toLowerCase().contains('school') ||
            stopName.toLowerCase().contains('academy') ||
            stopName.toLowerCase().contains('kindergarten');

        markers.add(
          Marker(
            point: LatLng(lat, lng),
            width: 120,
            height: 65,
            child: Tooltip(
              message: stopName,
              child: isSchool
                  ? Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Image.asset(
                          'assets/school-location-icon.png',
                          width: 36,
                          height: 36,
                          fit: BoxFit.contain,
                        ),
                        const SizedBox(height: 2),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.75),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            stopName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 8,
                              fontWeight: FontWeight.bold,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    )
                  : const Icon(
                      Icons.location_on,
                      color: Colors.red,
                      size: 32,
                    ),
            ),
          ),
        );
      }
    }

    // 2. Add live bus marker (if coordinates are active)
    if (widget.liveLatitude != null && widget.liveLongitude != null) {
      markers.add(
        Marker(
          point: LatLng(widget.liveLatitude!, widget.liveLongitude!),
          width: 50,
          height: 50,
          child: Tooltip(
            message: widget.vehiclePlate ?? 'Live Bus',
            child: Image.asset(
              'assets/bus-icon.png',
              width: 45,
              height: 45,
              fit: BoxFit.contain,
            ),
          ),
        ),
      );
    }

    // 3. Create route line coordinates connecting all stops
    final List<LatLng> polylinePoints = [];
    for (var stop in _stops) {
      if (stop['location'] != null && stop['location']['coordinates'] != null) {
        final double lng = stop['location']['coordinates'][0] as double;
        final double lat = stop['location']['coordinates'][1] as double;
        polylinePoints.add(LatLng(lat, lng));
      }
    }

    // Mapbox Traffic Day style url template
    final String mapboxUrlTemplate = 
        'https://api.mapbox.com/styles/v1/mapbox/traffic-day-v2/tiles/{z}/{x}/{y}?access_token=$_mapboxToken';

    return Container(
      height: 280,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: initialCenter,
              initialZoom: 13.5,
            ),
            children: [
              TileLayer(
                urlTemplate: mapboxUrlTemplate,
                userAgentPackageName: 'com.safaricom.track.driver_app',
              ),
              if (polylinePoints.isNotEmpty)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: polylinePoints,
                      strokeWidth: 4,
                      color: Colors.blue.withValues(alpha: 0.7),
                    ),
                  ],
                ),
              MarkerLayer(markers: markers),
            ],
          ),
          if (_isLoadingStops)
            Positioned(
              top: 10,
              right: 10,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                child: const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          Positioned(
            bottom: 8,
            left: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Row(
                children: [
                  Icon(Icons.map, color: Colors.white, size: 10),
                  SizedBox(width: 4),
                  Text(
                    'Mapbox © OpenStreetMap',
                    style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
