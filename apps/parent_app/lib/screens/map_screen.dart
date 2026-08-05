import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:parent_app/services/supabase_service.dart';
import 'package:parent_app/services/google_directions_service.dart';
import 'package:parent_app/screens/relocate_screen.dart';

class MapScreen extends StatefulWidget {
  final String studentId;
  final String routeId;
  final String studentName;
  final bool isEmbedded;

  const MapScreen({
    super.key,
    required this.studentId,
    required this.routeId,
    required this.studentName,
    this.isEmbedded = false,
  });

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  GoogleMapController? _mapController;
  BitmapDescriptor? _busIcon;
  BitmapDescriptor? _schoolIcon;

  // Route and Stop state
  List<dynamic> _stops = [];
  List<LatLng> _polylinePoints = [];
  bool _isLoadingRoute = true;

  // Student Home location & Pickup stage state
  LatLng _homeLocation = const LatLng(-1.2721, 36.7981);
  LatLng? _pickupStageLocation;
  String _pickupStageName = 'Kiambu Rd Stage';
  String _studentStatus = 'Present';
  String _transitStatus = 'On the Bus';

  // Vehicle & Conductor info
  String _licensePlate = 'Bus 12';
  String _conductorName = 'John Kamau';

  // Telemetry stream state
  double? _liveLat;
  double? _liveLng;
  double _liveSpeed = 0.0;
  bool _isEmergency = false;
  StreamSubscription? _liveSubscription;

  @override
  void initState() {
    super.initState();
    _loadMarkerIcons();
    _fetchStudentAndRouteData();
    _subscribeToLiveTelemetry();
  }

  @override
  void dispose() {
    _liveSubscription?.cancel();
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
    } catch (_) {}
  }

  double _haversineMeters(LatLng a, LatLng b) {
    const earth = 6371000.0;
    final dLat = (b.latitude - a.latitude) * math.pi / 180;
    final dLon = (b.longitude - a.longitude) * math.pi / 180;
    final lat1 = a.latitude * math.pi / 180;
    final lat2 = b.latitude * math.pi / 180;
    final h = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1) * math.cos(lat2) * math.sin(dLon / 2) * math.sin(dLon / 2);
    return earth * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
  }

  Future<void> _fetchStudentAndRouteData() async {
    setState(() => _isLoadingRoute = true);
    try {
      // 1. Fetch student data for home pickup_location, status
      final studentResponse = await SupabaseService.client
          .from('students')
          .select(
              'id, status, pickup_location, route:routes(id, name)')
          .eq('id', widget.studentId)
          .maybeSingle();

      if (studentResponse != null) {
        if (studentResponse['status'] != null) {
          _studentStatus = studentResponse['status'];
        }
        if (studentResponse['transit_status'] != null) {
          _transitStatus = studentResponse['transit_status'];
        }

        // Home WKT Point parsing
        if (studentResponse['pickup_location'] != null) {
          final String? coordsStr = studentResponse['pickup_location'] as String?;
          if (coordsStr != null) {
            final clean = coordsStr.replaceAll('POINT(', '').replaceAll(')', '').trim();
            final parts = clean.split(' ');
            if (parts.length >= 2) {
              _homeLocation = LatLng(double.parse(parts[1]), double.parse(parts[0]));
            }
          }
        }

        // Vehicle & Conductor resolution
        try {
          if (studentResponse['route'] != null && studentResponse['route']['vehicle'] != null) {
            final vehicle = studentResponse['route']['vehicle'];
            if (vehicle['license_plate'] != null && (vehicle['license_plate'] as String).isNotEmpty) {
              _licensePlate = vehicle['license_plate'];
            }
            if (vehicle['conductor'] != null && vehicle['conductor']['name'] != null) {
              _conductorName = vehicle['conductor']['name'];
            } else if (vehicle['driver'] != null && vehicle['driver']['name'] != null) {
              _conductorName = vehicle['driver']['name'];
            }
          }
        } catch (_) {}
      }

      // 2. Fetch route path and stops
      final details = await SupabaseService.fetchRouteDetails(widget.routeId);
      if (details != null && mounted) {
        final List<dynamic> stopsList = details['stops'] ?? [];
        final List<LatLng> stopPoints = [];

        for (var stop in stopsList) {
          if (stop['location'] != null && stop['location']['coordinates'] != null) {
            final coords = stop['location']['coordinates'] as List;
            final double lng = (coords[0] as num).toDouble();
            final double lat = (coords[1] as num).toDouble();
            stopPoints.add(LatLng(lat, lng));

            if (stop['stop_type'] == 'pickup' || _pickupStageLocation == null) {
              _pickupStageLocation = LatLng(lat, lng);
              if (stop['name'] != null) {
                _pickupStageName = stop['name'];
              }
            }
          }
        }

        _pickupStageLocation ??= LatLng(_homeLocation.latitude + 0.0015, _homeLocation.longitude + 0.0012);

        final road = await GoogleDirectionsService.fetchDrivingRoute(stopPoints);
        setState(() {
          _stops = stopsList;
          _polylinePoints = road.isNotEmpty ? road : stopPoints;
        });

        _mapController?.animateCamera(CameraUpdate.newLatLngZoom(_homeLocation, 14.5));
      }
    } catch (e) {
      print('Error fetching map route data: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoadingRoute = false);
      }
    }
  }

  void _subscribeToLiveTelemetry() {
    _liveSubscription = SupabaseService.client
        .from('live_coordinates')
        .stream(primaryKey: ['id'])
        .eq('route_id', widget.routeId)
        .order('created_at', ascending: false)
        .limit(1)
        .listen((List<Map<String, dynamic>> data) {
      if (data.isNotEmpty && mounted) {
        final latest = data.first;
        final String? coordsStr = latest['coordinates'] as String?;
        if (coordsStr != null) {
          final clean = coordsStr.replaceAll('POINT(', '').replaceAll(')', '').trim();
          final parts = clean.split(' ');
          if (parts.length >= 2) {
            final double lng = double.parse(parts[0]);
            final double lat = double.parse(parts[1]);

            setState(() {
              _liveLat = lat;
              _liveLng = lng;
              _liveSpeed = (latest['speed'] as num?)?.toDouble() ?? 0.0;
              _isEmergency = latest['is_emergency'] as bool? ?? false;
            });
            _mapController?.animateCamera(
              CameraUpdate.newLatLng(LatLng(lat, lng)),
            );
          }
        }
      }
    });
  }

  // Dynamic metric calculations
  int get _distanceMeters {
    if (_pickupStageLocation == null) return 150;
    final dist = _haversineMeters(_homeLocation, _pickupStageLocation!);
    return dist.round() > 0 ? dist.round() : 150;
  }

  int get _walkTimeMins {
    return (_distanceMeters / 75).ceil().clamp(1, 60);
  }

  String get _homeAddress {
    return 'Kiambu Road, Nairobi, Kenya';
  }

  String get _busArrivalTime {
    return '7:15 AM';
  }

  String get _daysActive {
    return 'Mon, Tue, Wed, Thu, Fri';
  }

  bool get _isTripActive {
    return _liveLat != null && _liveLng != null && (_transitStatus == 'In Transit' || _transitStatus == 'On the Bus');
  }

  // Create dotted walking polyline between Home Pin & Pickup Stage Pin
  List<LatLng> _generateDottedWalkingPath(LatLng start, LatLng end, int steps) {
    List<LatLng> points = [];
    for (int i = 0; i <= steps; i++) {
      double t = i / steps;
      double lat = start.latitude + (end.latitude - start.latitude) * t;
      double lng = start.longitude + (end.longitude - start.longitude) * t;
      points.add(LatLng(lat, lng));
    }
    return points;
  }

  @override
  Widget build(BuildContext context) {
    final bool isOnboarded = _transitStatus == 'On the Bus' ||
                             _transitStatus == 'Boarded' ||
                             _studentStatus == 'Boarded';
    final bool isDropped = _transitStatus == 'Dropped' || _transitStatus == 'At School';

    final Set<Marker> markers = {};

    for (var stop in _stops) {
      if (stop['location'] != null && stop['location']['coordinates'] != null) {
        final coords = stop['location']['coordinates'] as List;
        final double lng = (coords[0] as num).toDouble();
        final double lat = (coords[1] as num).toDouble();
        final String stopName = stop['name'] ?? 'Stop';
        final bool isSchool = stopName.toLowerCase().contains('school') ||
            stopName.toLowerCase().contains('academy') ||
            stopName.toLowerCase().contains('gate');
        final stopId = (stop['id'] ?? stopName).toString();

        markers.add(
          Marker(
            markerId: MarkerId('stop-$stopId'),
            position: LatLng(lat, lng),
            infoWindow: InfoWindow(title: stopName),
            icon: isSchool
                ? (_schoolIcon ??
                    BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen))
                : BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
          ),
        );
      }
    }

    if (_pickupStageLocation != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('pickup-stage'),
          position: _pickupStageLocation!,
          infoWindow: InfoWindow(title: _pickupStageName, snippet: 'Pickup stage'),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueViolet),
        ),
      );
    }

    markers.add(
      Marker(
        markerId: const MarkerId('home'),
        position: _homeLocation,
        infoWindow: const InfoWindow(title: 'Home'),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
      ),
    );

    if (_isTripActive) {
      final LatLng busPosition = (_liveLat != null && _liveLng != null)
          ? LatLng(_liveLat!, _liveLng!)
          : LatLng(_homeLocation.latitude + 0.003, _homeLocation.longitude - 0.003);

      markers.add(
        Marker(
          markerId: const MarkerId('live-bus'),
          position: busPosition,
          infoWindow: InfoWindow(
            title: _licensePlate,
            snippet: _isEmergency ? 'SOS active' : '8 mins away',
          ),
          icon: _busIcon ??
              BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          zIndexInt: 5,
        ),
      );
    } else if (_pickupStageLocation != null) {
      // Keep inactive mid-point marker as a simple map annotation via InfoWindow-less pin.
      final LatLng midPoint = LatLng(
        (_homeLocation.latitude + _pickupStageLocation!.latitude) / 2,
        (_homeLocation.longitude + _pickupStageLocation!.longitude) / 2,
      );

      markers.add(
        Marker(
          markerId: const MarkerId('walk-hint'),
          position: midPoint,
          infoWindow: InfoWindow(
            title: '$_walkTimeMins min walk',
            snippet: '$_distanceMeters m from home',
          ),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueMagenta),
        ),
      );
    }

    final List<LatLng> walkingPath = _pickupStageLocation != null
        ? _generateDottedWalkingPath(_homeLocation, _pickupStageLocation!, 20)
        : [];

    final Set<Polyline> polylines = {
      if (_polylinePoints.length >= 2)
        Polyline(
          polylineId: const PolylineId('route'),
          points: _polylinePoints,
          width: 5,
          color: const Color(0xFF2563EB),
        ),
      if (walkingPath.length >= 2)
        Polyline(
          polylineId: const PolylineId('walk'),
          points: walkingPath,
          width: 4,
          color: const Color(0xFF8B5CF6),
          patterns: [PatternItem.dot, PatternItem.gap(12)],
        ),
    };

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: _isLoadingRoute
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF2563EB)))
          : Stack(
              children: [
                GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: _homeLocation,
                    zoom: 14.5,
                  ),
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  mapToolbarEnabled: false,
                  compassEnabled: false,
                  markers: markers,
                  polylines: polylines,
                  onMapCreated: (controller) => _mapController = controller,
                ),

                // 2. TOP FLOATING CARD: Home Address (Inactive) vs Active Bus Info
                Positioned(
                  top: 50,
                  left: 16,
                  right: 16,
                  child: _isTripActive
                      ? Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.08),
                                blurRadius: 16,
                                offset: const Offset(0, 6),
                              )
                            ],
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 42,
                                    height: 42,
                                    decoration: const BoxDecoration(
                                      color: Color(0xFFF1F5F9),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.directions_bus_rounded,
                                      color: Color(0xFF0F172A),
                                      size: 24,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _licensePlate,
                                        style: const TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF0F172A),
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        _conductorName,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          color: Color(0xFF64748B),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              const Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    'ETA',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF64748B),
                                    ),
                                  ),
                                  SizedBox(height: 2),
                                  Text(
                                    '8 mins',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF16A34A),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        )
                      : _buildHomeAddressHeaderCard(),
                ),

                // 3. BOTTOM PANEL SHEET: Inactive Card (Image 3) vs Active Panels
                Positioned(
                  bottom: 20,
                  left: 16,
                  right: 16,
                  child: Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.08),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        )
                      ],
                    ),
                    child: !_isTripActive
                        ? _buildInactiveTripBottomCard()
                        : ((!isOnboarded && !isDropped)
                            ? _buildPrePickupPanel()
                            : _buildOnboardedPanel(isOnboarded, isDropped)),
                  ),
                ),
              ],
            ),
    );
  }

  // Bottom Panel State 1: Before student is picked up
  Widget _buildPrePickupPanel() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                color: Color(0xFFEDE9FE),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.directions_bus_filled_rounded,
                color: Color(0xFF8B5CF6),
                size: 24,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Pickup Stage',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _pickupStageName,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              color: Color(0xFF0F172A),
              size: 26,
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Walking distance line
        Padding(
          padding: const EdgeInsets.only(left: 58),
          child: Row(
            children: [
              const Text('🚶 ', style: TextStyle(fontSize: 14)),
              const Text(
                '2 min walk ',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF8B5CF6),
                ),
              ),
              const Text(
                '(150 m)',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF8B5CF6),
                ),
              ),
              const SizedBox(width: 4),
              const Text(
                'from your home',
                style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFF475569),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Divider(color: Color(0xFFF1F5F9), height: 1),
        const SizedBox(height: 14),

        // Bus arrival ETA
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                color: Color(0xFFF3E8FF),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.timer_outlined,
                color: Color(0xFF8B5CF6),
                size: 24,
              ),
            ),
            const SizedBox(width: 14),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Bus arrives in',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF64748B),
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  '6 mins',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF8B5CF6),
                  ),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  // Bottom Panel State 2: After student is picked up / onboarded or dropped
  Widget _buildOnboardedPanel(bool isOnboarded, bool isDropped) {
    final String statusLabel = isDropped ? 'Student Dropped' : 'Status: Onboarded';
    final String subText = isDropped ? 'Arrived safely at destination' : 'En route to school';

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: isDropped ? const Color(0xFFD1FAE5) : const Color(0xFFDBEAFE),
                shape: BoxShape.circle,
              ),
              child: Icon(
                isDropped ? Icons.check_circle_rounded : Icons.directions_bus_rounded,
                color: isDropped ? const Color(0xFF059669) : const Color(0xFF2563EB),
                size: 24,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    statusLabel,
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: isDropped ? const Color(0xFF059669) : const Color(0xFF2563EB),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subText,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        const Divider(color: Color(0xFFF1F5F9), height: 1),
        const SizedBox(height: 14),

        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                color: Color(0xFFECFDF5),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.school_rounded,
                color: Color(0xFF10B981),
                size: 24,
              ),
            ),
            const SizedBox(width: 14),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Estimated ETA to School',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF64748B),
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  '8 mins',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF10B981),
                  ),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  // Top Card: Home Address when trip is inactive (Image 1)
  Widget _buildHomeAddressHeaderCard() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 16,
            offset: const Offset(0, 6),
          )
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: Color(0xFFFEE2E2),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.home_rounded,
              color: Color(0xFFEF4444),
              size: 24,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Current Home Address',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF64748B),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  _homeAddress,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDCFCE7),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'Verified',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF15803D),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // Bottom Sheet: Inactive Trip Metrics & Update Home Location CTA (Image 3)
  Widget _buildInactiveTripBottomCard() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Row 1: Distance from home
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Row(
              children: [
                Icon(Icons.location_on_outlined, color: Color(0xFF475569), size: 20),
                SizedBox(width: 10),
                Text(
                  'Distance from home',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF334155),
                  ),
                ),
              ],
            ),
            Text(
              '${_distanceMeters} metres',
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),

        // Row 2: Walking time
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Row(
              children: [
                Icon(Icons.directions_walk_rounded, color: Color(0xFF475569), size: 20),
                SizedBox(width: 10),
                Text(
                  'Walking time',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF334155),
                  ),
                ),
              ],
            ),
            Text(
              '${_walkTimeMins} minutes',
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),

        // Row 3: Bus arrival time
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Row(
              children: [
                Icon(Icons.directions_bus_outlined, color: Color(0xFF475569), size: 20),
                SizedBox(width: 10),
                Text(
                  'Bus arrival time',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF334155),
                  ),
                ),
              ],
            ),
            Text(
              _busArrivalTime,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        const Divider(color: Color(0xFFF1F5F9), height: 1),
        const SizedBox(height: 14),

        // Row 4: Days active
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.calendar_today_rounded, color: Color(0xFF475569), size: 18),
                SizedBox(width: 10),
                Text(
                  'Days active',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF334155),
                  ),
                ),
              ],
            ),
            Text(
              _daysActive,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Action Button: Update Home Location
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton.icon(
            onPressed: () async {
              final result = await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (context) => RelocateScreen(
                    studentId: widget.studentId,
                    studentName: widget.studentName,
                    initialLocation: _homeLocation,
                  ),
                ),
              );
              if (result == true) {
                _fetchStudentAndRouteData();
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              foregroundColor: Colors.white,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            icon: const Icon(Icons.map_rounded, size: 20),
            label: const Text(
              'Update Home Location',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
