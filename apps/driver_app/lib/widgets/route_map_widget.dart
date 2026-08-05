import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:driver_app/services/driver_api_auth.dart';
import 'package:driver_app/services/google_directions_service.dart';
import 'package:driver_app/config/api_config.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/geo_utils.dart';

class RouteMapWidget extends StatefulWidget {
  final String routeId;
  final double? liveLatitude;
  final double? liveLongitude;
  final String? vehiclePlate;
  final String? arrivedStopId;

  const RouteMapWidget({
    super.key,
    required this.routeId,
    this.liveLatitude,
    this.liveLongitude,
    this.vehiclePlate,
    this.arrivedStopId,
  });

  @override
  State<RouteMapWidget> createState() => _RouteMapWidgetState();
}

class _RouteMapWidgetState extends State<RouteMapWidget> {
  List<dynamic> _stops = [];
  List<LatLng> _roadPolyline = [];
  bool _isLoadingStops = false;
  bool _isLoadingRoute = false;
  String? _loadError;
  String _routeSource = 'none'; // google | osrm | none
  GoogleMapController? _mapController;
  BitmapDescriptor? _busIcon;
  BitmapDescriptor? _schoolIcon;

  @override
  void initState() {
    super.initState();
    _loadMarkerIcons();
    _fetchRouteStops();
  }

  @override
  void dispose() {
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _loadMarkerIcons() async {
    try {
      final bus = await BitmapDescriptor.asset(
        const ImageConfiguration(size: Size(48, 48)),
        'assets/bus-icon.png',
      );
      final school = await BitmapDescriptor.asset(
        const ImageConfiguration(size: Size(40, 40)),
        'assets/school-location-icon.png',
      );
      if (!mounted) return;
      setState(() {
        _busIcon = bus;
        _schoolIcon = school;
      });
    } catch (_) {
      // Fallback hues used when assets fail.
    }
  }

  @override
  void didUpdateWidget(covariant RouteMapWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.routeId != widget.routeId) {
      _fetchRouteStops();
    }
    if (widget.liveLatitude != oldWidget.liveLatitude ||
        widget.liveLongitude != oldWidget.liveLongitude) {
      if (widget.liveLatitude != null &&
          widget.liveLongitude != null &&
          _mapController != null) {
        final bus = LatLng(widget.liveLatitude!, widget.liveLongitude!);
        final route = _roadPolyline.isNotEmpty ? _roadPolyline : _fallbackPolyline;
        if (route.isEmpty || _nearRoute(bus, route, maxKm: 40)) {
          _mapController!.animateCamera(CameraUpdate.newLatLng(bus));
        }
      }
    }
  }

  Future<void> _fetchRouteStops() async {
    if (!mounted) return;
    setState(() {
      _isLoadingStops = true;
      _loadError = null;
      _roadPolyline = [];
    });
    try {
      final response = await http
          .get(
            Uri.parse('${ApiConfig.baseUrl}/api/stops?route_id=${widget.routeId}'),
            headers: await DriverApiAuth.headers(),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          final stops = List<dynamic>.from(result['data'] as List<dynamic>);
          stops.sort((a, b) {
            final sa = (a is Map ? a['sequence_no'] : null) as num? ?? 0;
            final sb = (b is Map ? b['sequence_no'] : null) as num? ?? 0;
            return sa.compareTo(sb);
          });
          setState(() => _stops = stops);
          await _loadRoadNetwork(stops);
        } else {
          setState(() => _loadError = 'Could not load route stops for the map.');
        }
      } else {
        setState(() => _loadError = 'Map stops request failed (${response.statusCode}).');
      }
    } catch (e) {
      debugPrint('Error fetching stops for map: $e');
      setState(() => _loadError = 'Map data unavailable.');
    } finally {
      if (mounted) setState(() => _isLoadingStops = false);
    }
  }

  Future<void> _loadRoadNetwork(List<dynamic> stops) async {
    final waypoints = <LatLng>[];
    for (final stop in stops) {
      final point = stopLatLng(stop);
      if (point != null) {
        waypoints.add(LatLng(point.latitude, point.longitude));
      }
    }
    if (waypoints.length < 2) return;

    setState(() => _isLoadingRoute = true);
    final result = await GoogleDirectionsService.fetchDrivingRoute(waypoints);
    if (!mounted) return;
    setState(() {
      _roadPolyline = result.points;
      _routeSource = result.source;
      _isLoadingRoute = false;
      if (result.points.isEmpty) {
        _loadError = 'Road directions unavailable — showing straight stop links.';
      } else if (result.source == 'osrm') {
        // Proxy not deployed / Google Directions key issue — OSRM still follows roads.
        _loadError = null;
      } else {
        _loadError = null;
      }
    });

    if (_mapController != null) {
      await _fitRouteAndBus(result.points.isNotEmpty ? result.points : waypoints);
    }
  }

  Future<void> _fitRouteAndBus(List<LatLng> routePoints) async {
    final points = List<LatLng>.from(routePoints);
    if (widget.liveLatitude != null && widget.liveLongitude != null) {
      final bus = LatLng(widget.liveLatitude!, widget.liveLongitude!);
      // Only expand camera to the bus when it is near the route (emulator GPS
      // often sits in another country and would zoom the map to the world).
      if (points.isEmpty || _nearRoute(bus, points, maxKm: 40)) {
        points.add(bus);
      } else if (mounted) {
        setState(() {
          _loadError =
              'Bus GPS is far from this route. Set emulator location near Nairobi to see the bus on the path.';
        });
      }
    }
    if (points.isNotEmpty) await _fitBounds(points);
  }

  bool _nearRoute(LatLng bus, List<LatLng> route, {required double maxKm}) {
    final maxM = maxKm * 1000;
    for (final p in route) {
      final d = haversineDistanceMeters(
        bus.latitude,
        bus.longitude,
        p.latitude,
        p.longitude,
      );
      if (d <= maxM) return true;
    }
    return false;
  }

  Future<void> _fitBounds(List<LatLng> points) async {
    if (_mapController == null || points.isEmpty) return;
    var minLat = points.first.latitude;
    var maxLat = points.first.latitude;
    var minLng = points.first.longitude;
    var maxLng = points.first.longitude;
    for (final p in points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    await _mapController!.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat, minLng),
          northeast: LatLng(maxLat, maxLng),
        ),
        48,
      ),
    );
  }

  List<LatLng> get _fallbackPolyline {
    final points = <LatLng>[];
    for (final stop in _stops) {
      final point = stopLatLng(stop);
      if (point != null) {
        points.add(LatLng(point.latitude, point.longitude));
      }
    }
    return points;
  }

  Set<Marker> _buildMarkers() {
    final markers = <Marker>{};

    for (final stop in _stops) {
      final point = stopLatLng(stop);
      if (point == null) continue;
      final stopId = (stop['id'] ?? '').toString();
      final stopName = (stop['name'] ?? 'Stop').toString();
      final isArrived = widget.arrivedStopId != null && widget.arrivedStopId == stopId;
      final isSchool = stopName.toLowerCase().contains('school') ||
          stopName.toLowerCase().contains('academy') ||
          stopName.toLowerCase().contains('gate') ||
          stopName.toLowerCase().contains('kindergarten');

      markers.add(
        Marker(
          markerId: MarkerId('stop-$stopId'),
          position: LatLng(point.latitude, point.longitude),
          infoWindow: InfoWindow(
            title: isArrived ? '$stopName (HERE)' : stopName,
            snippet: isSchool ? 'School stop' : 'Route stop',
          ),
          icon: isSchool
              ? (_schoolIcon ??
                  BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen))
              : BitmapDescriptor.defaultMarkerWithHue(
                  isArrived ? BitmapDescriptor.hueAzure : BitmapDescriptor.hueRed,
                ),
          zIndexInt: isArrived ? 2 : 1,
        ),
      );
    }

    if (widget.liveLatitude != null && widget.liveLongitude != null) {
      // Prefer the bright default orange pin so the bus stays visible even if
      // the custom asset fails to decode on some devices/emulators.
      markers.add(
        Marker(
          markerId: const MarkerId('live-bus'),
          position: LatLng(widget.liveLatitude!, widget.liveLongitude!),
          infoWindow: InfoWindow(
            title: widget.vehiclePlate ?? 'Live Bus',
            snippet: 'Current GPS location',
          ),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          zIndexInt: 5,
        ),
      );
      if (_busIcon != null) {
        // Layer custom bus artwork when available (still keep orange as base).
        markers.add(
          Marker(
            markerId: const MarkerId('live-bus-icon'),
            position: LatLng(widget.liveLatitude!, widget.liveLongitude!),
            icon: _busIcon!,
            zIndexInt: 6,
            anchor: const Offset(0.5, 0.5),
          ),
        );
      }
    }

    return markers;
  }

  @override
  Widget build(BuildContext context) {
    final hasLive = widget.liveLatitude != null && widget.liveLongitude != null;
    final LatLng initialCenter = hasLive
        ? LatLng(widget.liveLatitude!, widget.liveLongitude!)
        : () {
            for (final stop in _stops) {
              final point = stopLatLng(stop);
              if (point != null) {
                return LatLng(point.latitude, point.longitude);
              }
            }
            return const LatLng(-1.2845, 36.8192);
          }();

    final polylinePoints =
        _roadPolyline.isNotEmpty ? _roadPolyline : _fallbackPolyline;

    return Container(
      height: 280,
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border, width: 1.5),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: CameraPosition(target: initialCenter, zoom: 13.5),
            myLocationEnabled: false,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            compassEnabled: false,
            markers: _buildMarkers(),
            polylines: {
              if (polylinePoints.length >= 2)
                Polyline(
                  polylineId: const PolylineId('route'),
                  points: polylinePoints,
                  width: _roadPolyline.isNotEmpty ? 5 : 3,
                  color: AppColors.actionGreen.withValues(
                    alpha: _roadPolyline.isNotEmpty ? 0.9 : 0.5,
                  ),
                ),
            },
            onMapCreated: (controller) async {
              _mapController = controller;
              final points =
                  _roadPolyline.isNotEmpty ? _roadPolyline : _fallbackPolyline;
              await _fitRouteAndBus(points);
            },
          ),
          if (_isLoadingStops || _isLoadingRoute)
            const Positioned(
              top: 10,
              right: 10,
              child: DecoratedBox(
                decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                child: Padding(
                  padding: EdgeInsets.all(6),
                  child: SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ),
            ),
          if (!hasLive || _loadError != null)
            Positioned(
              top: 8,
              left: 8,
              right: 48,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.95),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppColors.border),
                ),
                child: Text(
                  !hasLive
                      ? 'Waiting for GPS… set a location in the emulator (Extended controls → Location), preferably near the route.'
                      : _loadError!,
                  style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600),
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
              child: Text(
                _routeSource == 'google'
                    ? 'Google Maps · Directions'
                    : _routeSource == 'osrm'
                        ? 'Google Maps · Road fallback'
                        : 'Google Maps',
                style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w500),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
