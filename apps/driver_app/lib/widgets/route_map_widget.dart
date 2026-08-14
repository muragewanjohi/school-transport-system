import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:driver_app/services/driver_api_auth.dart';
import 'package:driver_app/services/google_directions_service.dart';
import 'package:driver_app/config/api_config.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/geo_utils.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/trip_map_legend.dart';

class RouteMapWidget extends StatefulWidget {
  final String routeId;
  final double? liveLatitude;
  final double? liveLongitude;
  final double? liveBearing;
  final String? vehiclePlate;
  final String? arrivedStopId;
  final String? nextStopId;
  final Set<String> visitedStopIds;
  final bool navMode;
  final String? lastTelemetryIso;
  final VoidCallback? onRefresh;
  final double height;

  const RouteMapWidget({
    super.key,
    required this.routeId,
    this.liveLatitude,
    this.liveLongitude,
    this.liveBearing,
    this.vehiclePlate,
    this.arrivedStopId,
    this.nextStopId,
    this.visitedStopIds = const {},
    this.navMode = false,
    this.lastTelemetryIso,
    this.onRefresh,
    this.height = 280,
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
  String _routeSource = 'none';
  GoogleMapController? _mapController;
  BitmapDescriptor? _busIcon;
  final Map<String, BitmapDescriptor> _numberedMarkers = {};

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
      if (!mounted) return;
      setState(() => _busIcon = bus);
    } catch (_) {}
  }

  Future<BitmapDescriptor> _markerForState(StopMarkerState state, int number) async {
    final key = '${state.name}-$number';
    final cached = _numberedMarkers[key];
    if (cached != null) return cached;
    final icon = await _createNumberedMarker(state, number);
    _numberedMarkers[key] = icon;
    return icon;
  }

  Future<BitmapDescriptor> _createNumberedMarker(StopMarkerState state, int number) async {
    const size = 32.0;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    late Color fill;
    late Color border;
    String? text;
    IconData? iconData;

    switch (state) {
      case StopMarkerState.completed:
        fill = const Color(0xFF10B981);
        border = const Color(0xFF047857);
        iconData = Icons.check;
        break;
      case StopMarkerState.next:
        fill = const Color(0xFF3B82F6);
        border = const Color(0xFF1D4ED8);
        text = '$number';
        break;
      case StopMarkerState.upcoming:
        fill = const Color(0xFF94A3B8);
        border = const Color(0xFF64748B);
        text = '$number';
        break;
      case StopMarkerState.notVisited:
        fill = const Color(0xFFEF4444);
        border = const Color(0xFFB91C1C);
        text = '$number';
        break;
    }

    final paint = Paint()..color = fill;
    canvas.drawCircle(const Offset(size / 2, size / 2), size / 2 - 1, paint);
    final borderPaint = Paint()
      ..color = border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    canvas.drawCircle(const Offset(size / 2, size / 2), size / 2 - 1, borderPaint);

    if (iconData != null) {
      final builder = ui.ParagraphBuilder(
        ui.ParagraphStyle(textAlign: TextAlign.center),
      )
        ..pushStyle(ui.TextStyle(color: Colors.white, fontSize: 14))
        ..addText('✓');
      final paragraph = builder.build()
        ..layout(const ui.ParagraphConstraints(width: size));
      canvas.drawParagraph(paragraph, Offset(0, (size - paragraph.height) / 2));
    } else if (text != null) {
      final builder = ui.ParagraphBuilder(
        ui.ParagraphStyle(textAlign: TextAlign.center, fontWeight: FontWeight.bold),
      )
        ..pushStyle(ui.TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold))
        ..addText(text);
      final paragraph = builder.build()
        ..layout(const ui.ParagraphConstraints(width: size));
      canvas.drawParagraph(paragraph, Offset(0, (size - paragraph.height) / 2));
    }

    final image = await recorder.endRecording().toImage(size.toInt(), size.toInt());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
  }

  @override
  void didUpdateWidget(covariant RouteMapWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.routeId != widget.routeId) {
      _fetchRouteStops();
    }
    final visitChanged = !setEquals(oldWidget.visitedStopIds, widget.visitedStopIds) ||
        oldWidget.nextStopId != widget.nextStopId;
    if (visitChanged && _stops.isNotEmpty) {
      _prefetchMarkerIcons(_stops);
    }
    if (widget.navMode &&
        widget.liveLatitude != null &&
        widget.liveLongitude != null &&
        _mapController != null &&
        (oldWidget.liveLatitude != widget.liveLatitude ||
            oldWidget.liveLongitude != widget.liveLongitude ||
            oldWidget.navMode != widget.navMode)) {
      _followNavCamera();
    } else if (!widget.navMode &&
        widget.liveLatitude != null &&
        widget.liveLongitude != null &&
        _mapController != null &&
        (oldWidget.liveLatitude != widget.liveLatitude ||
            oldWidget.liveLongitude != widget.liveLongitude)) {
      final bus = LatLng(widget.liveLatitude!, widget.liveLongitude!);
      final route = _roadPolyline.isNotEmpty ? _roadPolyline : _fallbackPolyline;
      if (route.isEmpty || _nearRoute(bus, route, maxKm: 40)) {
        _mapController!.animateCamera(CameraUpdate.newLatLng(bus));
      }
    }
  }

  Future<void> _followNavCamera() async {
    if (_mapController == null || widget.liveLatitude == null || widget.liveLongitude == null) {
      return;
    }
    final bearing = widget.liveBearing ?? 0;
    await _mapController!.animateCamera(
      CameraUpdate.newCameraPosition(
        CameraPosition(
          target: LatLng(widget.liveLatitude!, widget.liveLongitude!),
          zoom: 16.2,
          tilt: 45,
          bearing: bearing,
        ),
      ),
    );
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
          await _prefetchMarkerIcons(stops);
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

  Future<void> _prefetchMarkerIcons(List<dynamic> stops) async {
    final ordered = orderedStopIdsFrom(stops);
    for (var i = 0; i < ordered.length; i++) {
      final id = ordered[i];
      final state = stopMarkerState(
        sequenceIndex: i,
        stopId: id,
        visitedStopIds: widget.visitedStopIds,
        nextStopId: widget.nextStopId,
        orderedStopIds: ordered,
      );
      await _markerForState(state, i + 1);
    }
    if (mounted) setState(() {});
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
      } else {
        _loadError = null;
      }
    });

    if (_mapController != null) {
      await _fitRouteAndBus(result.points.isNotEmpty ? result.points : waypoints);
    }
  }

  Future<void> _fitRouteAndBus(List<LatLng> routePoints) async {
    if (widget.navMode) {
      await _followNavCamera();
      return;
    }
    final points = List<LatLng>.from(routePoints);
    if (widget.liveLatitude != null && widget.liveLongitude != null) {
      final bus = LatLng(widget.liveLatitude!, widget.liveLongitude!);
      if (points.isEmpty || _nearRoute(bus, points, maxKm: 40)) {
        points.add(bus);
      } else if (mounted) {
        setState(() {
          _loadError =
              'Bus GPS is far from this route. Set emulator location near the route to see the bus on the path.';
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
    final ordered = orderedStopIdsFrom(_stops);

    for (var i = 0; i < _stops.length; i++) {
      final stop = _stops[i];
      if (stop is! Map) continue;
      final point = stopLatLng(stop);
      if (point == null) continue;
      final stopId = (stop['id'] ?? '').toString();
      final stopName = (stop['name'] ?? 'Stop').toString();
      final seqIdx = ordered.indexOf(stopId);
      final number = seqIdx >= 0 ? seqIdx + 1 : i + 1;
      final state = stopMarkerState(
        sequenceIndex: seqIdx >= 0 ? seqIdx : i,
        stopId: stopId,
        visitedStopIds: widget.visitedStopIds,
        nextStopId: widget.nextStopId,
        orderedStopIds: ordered,
      );
      final key = '${state.name}-$number';
      final icon = _numberedMarkers[key] ??
          BitmapDescriptor.defaultMarkerWithHue(
            state == StopMarkerState.next
                ? BitmapDescriptor.hueAzure
                : state == StopMarkerState.completed
                    ? BitmapDescriptor.hueGreen
                    : state == StopMarkerState.notVisited
                        ? BitmapDescriptor.hueRed
                        : BitmapDescriptor.hueOrange,
          );

      markers.add(
        Marker(
          markerId: MarkerId('stop-$stopId'),
          position: LatLng(point.latitude, point.longitude),
          infoWindow: InfoWindow(
            title: stopName,
            snippet: state.name,
          ),
          icon: icon,
          zIndexInt: state == StopMarkerState.next ? 3 : 1,
          anchor: const Offset(0.5, 0.5),
        ),
      );
    }

    if (widget.liveLatitude != null && widget.liveLongitude != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('live-bus'),
          position: LatLng(widget.liveLatitude!, widget.liveLongitude!),
          infoWindow: InfoWindow(
            title: widget.vehiclePlate ?? 'Live Bus',
            snippet: 'Current GPS location',
          ),
          icon: _busIcon ??
              BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          zIndexInt: 6,
          anchor: const Offset(0.5, 0.5),
          rotation: widget.liveBearing ?? 0,
          flat: true,
        ),
      );
    }

    return markers;
  }

  Set<Circle> _buildCircles() {
    if (widget.liveLatitude == null || widget.liveLongitude == null) return {};
    return {
      Circle(
        circleId: const CircleId('bus-halo'),
        center: LatLng(widget.liveLatitude!, widget.liveLongitude!),
        radius: 40,
        fillColor: AppColors.actionGreen.withValues(alpha: 0.18),
        strokeColor: AppColors.actionGreen.withValues(alpha: 0.45),
        strokeWidth: 2,
      ),
    };
  }

  Set<Polyline> _buildPolylines() {
    final polylinePoints =
        _roadPolyline.isNotEmpty ? _roadPolyline : _fallbackPolyline;
    if (polylinePoints.length < 2) return {};

    final polylines = <Polyline>{
      Polyline(
        polylineId: const PolylineId('route'),
        points: polylinePoints,
        width: widget.navMode ? 4 : (_roadPolyline.isNotEmpty ? 5 : 3),
        color: AppColors.actionGreen.withValues(
          alpha: widget.navMode ? 0.45 : (_roadPolyline.isNotEmpty ? 0.9 : 0.5),
        ),
      ),
    };

    if (widget.navMode &&
        widget.liveLatitude != null &&
        widget.liveLongitude != null &&
        widget.nextStopId != null) {
      Map? nextStop;
      for (final s in _stops) {
        if (s is Map && s['id']?.toString() == widget.nextStopId) {
          nextStop = s;
          break;
        }
      }
      final nextPt = nextStop == null ? null : stopLatLng(nextStop);
      if (nextPt != null) {
        polylines.add(
          Polyline(
            polylineId: const PolylineId('nav-leg'),
            points: [
              LatLng(widget.liveLatitude!, widget.liveLongitude!),
              LatLng(nextPt.latitude, nextPt.longitude),
            ],
            width: 7,
            color: AppColors.actionGreen,
          ),
        );
      }
    }

    return polylines;
  }

  Future<void> _handleRefresh() async {
    widget.onRefresh?.call();
    await _fetchRouteStops();
    if (widget.navMode) {
      await _followNavCamera();
    }
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

    return Container(
      height: widget.height,
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
            initialCameraPosition: CameraPosition(
              target: initialCenter,
              zoom: widget.navMode ? 16 : 13.5,
            ),
            myLocationEnabled: false,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: true,
            zoomGesturesEnabled: true,
            scrollGesturesEnabled: true,
            rotateGesturesEnabled: true,
            tiltGesturesEnabled: true,
            mapToolbarEnabled: false,
            compassEnabled: false,
            markers: _buildMarkers(),
            circles: _buildCircles(),
            polylines: _buildPolylines(),
            gestureRecognizers: const <Factory<OneSequenceGestureRecognizer>>{
              Factory<EagerGestureRecognizer>(EagerGestureRecognizer.new),
            },
            onMapCreated: (controller) async {
              _mapController = controller;
              final points =
                  _roadPolyline.isNotEmpty ? _roadPolyline : _fallbackPolyline;
              await _fitRouteAndBus(points);
            },
          ),
          const Positioned(
            top: 8,
            left: 8,
            child: TripMapLegend(),
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
          if (!hasLive || (_loadError != null && !widget.navMode))
            Positioned(
              top: 8,
              left: 110,
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
                      ? 'Waiting for GPS…'
                      : _loadError!,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.muted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          if (widget.navMode)
            Positioned(
              top: 8,
              right: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.actionGreen,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'NAV',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 11,
                  ),
                ),
              ),
            ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              color: Colors.white.withValues(alpha: 0.94),
              child: Row(
                children: [
                  Icon(
                    Icons.gps_fixed,
                    size: 16,
                    color: hasLive ? AppColors.actionGreen : AppColors.muted,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      hasLive
                          ? 'Live GPS · ${formatTelemetryAge(widget.lastTelemetryIso)}${_routeSource == 'osrm' ? ' · road fallback' : ''}'
                          : 'Waiting for GPS',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _handleRefresh,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.actionGreen,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text(
                      'Refresh',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                    ),
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
