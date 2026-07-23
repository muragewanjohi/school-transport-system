import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:parent_app/services/supabase_service.dart';
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
  final MapController _mapController = MapController();

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
    _fetchStudentAndRouteData();
    _subscribeToLiveTelemetry();
  }

  @override
  void dispose() {
    _liveSubscription?.cancel();
    super.dispose();
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
        final List<LatLng> polyPoints = [];

        for (var stop in stopsList) {
          if (stop['location'] != null && stop['location']['coordinates'] != null) {
            final double lng = stop['location']['coordinates'][0] as double;
            final double lat = stop['location']['coordinates'][1] as double;
            polyPoints.add(LatLng(lat, lng));

            // Default pickup stage from stops list if available
            if (stop['stop_type'] == 'pickup' || _pickupStageLocation == null) {
              _pickupStageLocation = LatLng(lat, lng);
              if (stop['name'] != null) {
                _pickupStageName = stop['name'];
              }
            }
          }
        }

        // Fallback pickup stage coordinate near home if missing
        _pickupStageLocation ??= LatLng(_homeLocation.latitude + 0.0015, _homeLocation.longitude + 0.0012);

        setState(() {
          _stops = stopsList;
          _polylinePoints = polyPoints;
        });

        // Center map on live bus or home location
        _mapController.move(_homeLocation, 14.5);
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
          }
        }
      }
    });
  }

  // Dynamic metric calculations
  int get _distanceMeters {
    if (_pickupStageLocation == null) return 150;
    const distanceCalc = Distance();
    final double dist = distanceCalc.as(LengthUnit.Meter, _homeLocation, _pickupStageLocation!);
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

    final List<Marker> markers = [];

    // 1. School Destination Marker (using existing asset)
    for (var stop in _stops) {
      if (stop['location'] != null && stop['location']['coordinates'] != null) {
        final double lng = stop['location']['coordinates'][0] as double;
        final double lat = stop['location']['coordinates'][1] as double;
        final String stopName = stop['name'] ?? 'School';
        final bool isSchool = stopName.toLowerCase().contains('school') ||
            stopName.toLowerCase().contains('academy');

        if (isSchool) {
          markers.add(
            Marker(
              point: LatLng(lat, lng),
              width: 50,
              height: 50,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(color: Colors.black26, blurRadius: 8, offset: Offset(0, 3)),
                  ],
                ),
                child: Image.asset(
                  'assets/school-location-icon.png',
                  width: 38,
                  height: 38,
                  fit: BoxFit.contain,
                ),
              ),
            ),
          );
        }
      }
    }

    // 2. Pickup Stage Pin (Purple marker on route)
    if (_pickupStageLocation != null) {
      markers.add(
        Marker(
          point: _pickupStageLocation!,
          width: 36,
          height: 36,
          child: Container(
            decoration: const BoxDecoration(
              color: Color(0xFF8B5CF6),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 3)),
              ],
            ),
            child: const Icon(
              Icons.location_on_rounded,
              color: Colors.white,
              size: 22,
            ),
          ),
        ),
      );
    }

    // 3. Home Location Pin (Blue circle pin with white home icon)
    markers.add(
      Marker(
        point: _homeLocation,
        width: 48,
        height: 48,
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF2563EB),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2.5),
            boxShadow: const [
              BoxShadow(color: Colors.black26, blurRadius: 8, offset: Offset(0, 4)),
            ],
          ),
          child: const Icon(
            Icons.home_rounded,
            color: Colors.white,
            size: 26,
          ),
        ),
      ),
    );

    // 4. Live Bus Marker + Speech Bubble Callout ("8 mins away") - only if trip active
    if (_isTripActive) {
      final LatLng busPosition = (_liveLat != null && _liveLng != null)
          ? LatLng(_liveLat!, _liveLng!)
          : LatLng(_homeLocation.latitude + 0.003, _homeLocation.longitude - 0.003);

      markers.add(
        Marker(
          point: busPosition,
          width: 140,
          height: 100,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: const [
                    BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 4)),
                  ],
                ),
                child: const Column(
                  children: [
                    Text(
                      '8 mins',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    Text(
                      'away',
                      style: TextStyle(
                        fontSize: 10,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              Image.asset(
                'assets/bus-icon.png',
                width: 42,
                height: 42,
                fit: BoxFit.contain,
              ),
            ],
          ),
        ),
      );
    } else if (_pickupStageLocation != null) {
      // 5. Inactive Trip Speech Bubble Callout Marker (Image 2)
      final LatLng midPoint = LatLng(
        (_homeLocation.latitude + _pickupStageLocation!.latitude) / 2,
        (_homeLocation.longitude + _pickupStageLocation!.longitude) / 2,
      );

      markers.add(
        Marker(
          point: midPoint,
          width: 140,
          height: 65,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFF1F5F9)),
              boxShadow: const [
                BoxShadow(
                  color: Colors.black12,
                  blurRadius: 10,
                  offset: Offset(0, 4),
                )
              ],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '${_distanceMeters} m',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                Text(
                  '${_walkTimeMins} min walk',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF475569),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Google Maps Vector/Roadmap style tile url template
    final String googleMapsUrlTemplate =
        'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

    // Generate dotted walking path points
    final List<LatLng> walkingPath = _pickupStageLocation != null
        ? _generateDottedWalkingPath(_homeLocation, _pickupStageLocation!, 20)
        : [];

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: _isLoadingRoute
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF2563EB)))
          : Stack(
              children: [
                // 1. Google Map Canvas
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: _homeLocation,
                    initialZoom: 14.5,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: googleMapsUrlTemplate,
                      userAgentPackageName: 'com.schooltrack.parent_app',
                    ),
                    // Route Polyline (Blue)
                    if (_polylinePoints.isNotEmpty)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _polylinePoints,
                            strokeWidth: 5.0,
                            color: const Color(0xFF2563EB),
                          ),
                        ],
                      ),
                    // Dotted Walking Path from Home to Pickup Stage (Purple Dotted Line)
                    if (walkingPath.isNotEmpty)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: walkingPath,
                            strokeWidth: 3.5,
                            color: const Color(0xFF8B5CF6),
                          ),
                        ],
                      ),
                    MarkerLayer(markers: markers),
                  ],
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
