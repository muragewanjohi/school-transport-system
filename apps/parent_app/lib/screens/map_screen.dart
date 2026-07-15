import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:parent_app/services/supabase_service.dart';

class MapScreen extends StatefulWidget {
  final String studentId;
  final String routeId;
  final String studentName;

  const MapScreen({
    super.key,
    required this.studentId,
    required this.routeId,
    required this.studentName,
  });

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> with SingleTickerProviderStateMixin {
  final MapController _mapController = MapController();
  late TabController _tabController;

  // Static Mapbox Credentials (matching the driver app)
  static const String _mapboxToken = "pk.eyJ1IjoibXVyYWdlMTAxIiwiYSI6ImNtcWdiM21mZjA1ZWkycnM3MmpnMXJjeWQifQ.ZmGc4WbWEbgNHPg4jHijzg";
  
  // State variables for route mapping
  List<dynamic> _stops = [];
  List<LatLng> _polylinePoints = [];
  bool _isLoadingRoute = true;

  // Live coordinates state (Nairobi defaults)
  double? _liveLat;
  double? _liveLng;
  double _liveSpeed = 0.0;
  bool _isEmergency = false;
  StreamSubscription? _liveSubscription;

  // Relocation mode state
  LatLng _selectedPickupLocation = const LatLng(-1.2721, 36.7981); // Default Nairobi coordinate
  bool _isSavingLocation = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _fetchRouteData();
    _subscribeToLiveTelemetry();
  }

  @override
  void dispose() {
    _liveSubscription?.cancel();
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _fetchRouteData() async {
    setState(() => _isLoadingRoute = true);
    try {
      final details = await SupabaseService.fetchRouteDetails(widget.routeId);
      if (details != null && mounted) {
        final List<dynamic> stopsList = details['stops'] ?? [];
        final List<LatLng> polyPoints = [];
        
        for (var stop in stopsList) {
          if (stop['location'] != null && stop['location']['coordinates'] != null) {
            final double lng = stop['location']['coordinates'][0] as double;
            final double lat = stop['location']['coordinates'][1] as double;
            polyPoints.add(LatLng(lat, lng));
          }
        }

        // Fetch the student's current custom pickup location to center on
        final studentResponse = await SupabaseService.client
            .from('students')
            .select('pickup_location')
            .eq('id', widget.studentId)
            .single();

        LatLng initialPickup = const LatLng(-1.2721, 36.7981);
        if (studentResponse['pickup_location'] != null) {
          final String? coordsStr = studentResponse['pickup_location'] as String?;
          if (coordsStr != null) {
            final clean = coordsStr.replaceAll('POINT(', '').replaceAll(')', '').trim();
            final parts = clean.split(' ');
            if (parts.length >= 2) {
              initialPickup = LatLng(double.parse(parts[1]), double.parse(parts[0]));
            }
          }
        }

        setState(() {
          _stops = stopsList;
          _polylinePoints = polyPoints;
          _selectedPickupLocation = initialPickup;
        });

        // Center map on the current pickup location
        if (polyPoints.isNotEmpty) {
          _mapController.move(initialPickup, 14.0);
        }
      }
    } catch (e) {
      print('Error fetching route data: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoadingRoute = false);
      }
    }
  }

  void _subscribeToLiveTelemetry() {
    // Listen to Supabase postgres_changes for live coordinate streams
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

                // Auto-center on the live bus in Live Tracking mode
                if (_tabController.index == 0) {
                  _mapController.move(LatLng(lat, lng), _mapController.camera.zoom);
                }
              }
            }
          }
        });
  }

  Future<void> _saveNewPickupLocation() async {
    setState(() => _isSavingLocation = true);
    
    final success = await SupabaseService.updateStudentPickupLocation(
      widget.studentId,
      _selectedPickupLocation.latitude,
      _selectedPickupLocation.longitude,
    );

    setState(() => _isSavingLocation = false);

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Home pickup location and geofence updated successfully!'),
            backgroundColor: Color(0xFF10B981),
            behavior: SnackBarBehavior.floating,
          ),
        );
        _tabController.animateTo(0); // Return to live tracking mode
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to update home location. Please try again.'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Generate Markers List
    final List<Marker> markers = [];

    // 1. Add stops markers (with schools custom icons & names below them)
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

    // 2. Add custom student home/pickup location marker
    markers.add(
      Marker(
        point: _selectedPickupLocation,
        width: 100,
        height: 65,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.home, color: Colors.blue, size: 36),
            const SizedBox(height: 2),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              decoration: BoxDecoration(
                color: Colors.blue.withOpacity(0.85),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                '${widget.studentName}\'s Home',
                style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );

    // 3. Add live bus marker (if active in tracking mode)
    if (_tabController.index == 0 && _liveLat != null && _liveLng != null) {
      markers.add(
        Marker(
          point: LatLng(_liveLat!, _liveLng!),
          width: 50,
          height: 50,
          child: Tooltip(
            message: _isEmergency ? 'EMERGENCY SOS ACTIVE' : 'School Bus',
            child: Container(
              decoration: _isEmergency
                  ? BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.red, width: 3),
                      boxShadow: [
                        BoxShadow(color: Colors.red.withOpacity(0.6), blurRadius: 10, spreadRadius: 4),
                      ],
                    )
                  : null,
              child: Image.asset(
                'assets/bus-icon.png',
                width: 45,
                height: 45,
                fit: BoxFit.contain,
              ),
            ),
          ),
        ),
      );
    }

    final String mapboxUrlTemplate = 
        'https://api.mapbox.com/styles/v1/mapbox/traffic-day-v2/tiles/{z}/{x}/{y}?access_token=$_mapboxToken';

    return Scaffold(
      backgroundColor: const Color(0xFF0A0E1A),
      appBar: AppBar(
        title: Text('${widget.studentName}\'s Transit Tracking'),
        backgroundColor: const Color(0xFF0A0E1A),
        foregroundColor: Colors.white,
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF10B981),
          unselectedLabelColor: Colors.grey,
          indicatorColor: const Color(0xFF10B981),
          onTap: (index) {
            setState(() {});
          },
          tabs: const [
            Tab(icon: Icon(Icons.location_searching), text: 'LIVE TRACK'),
            Tab(icon: Icon(Icons.edit_location_alt), text: 'RELOCATE HOME'),
          ],
        ),
      ),
      body: _isLoadingRoute
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              children: [
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: _selectedPickupLocation,
                    initialZoom: 14.0,
                    onTap: _tabController.index == 1
                        ? (tapPosition, point) {
                            setState(() {
                              _selectedPickupLocation = point;
                            });
                          }
                        : null,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: mapboxUrlTemplate,
                      userAgentPackageName: 'com.schooltrack.parent_app',
                    ),
                    if (_polylinePoints.isNotEmpty)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _polylinePoints,
                            strokeWidth: 4.5,
                            color: Colors.indigo.withOpacity(0.85),
                          ),
                        ],
                      ),
                    MarkerLayer(markers: markers),
                  ],
                ),

                // Bottom Panel Overlay: Live info or Relocation saving controls
                Positioned(
                  bottom: 16,
                  left: 16,
                  right: 16,
                  child: _tabController.index == 0
                      ? _buildLiveTrackingPanel()
                      : _buildRelocationPanel(),
                ),
              ],
            ),
    );
  }

  Widget _buildLiveTrackingPanel() {
    final bool isBusActive = _liveLat != null && _liveLng != null;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF151C2C).withOpacity(0.95),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF223049), width: 1.5),
        boxShadow: const [
          BoxShadow(color: Colors.black45, blurRadius: 10, offset: Offset(0, 4)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isBusActive ? Icons.directions_bus : Icons.bus_alert,
                color: _isEmergency
                    ? Colors.red
                    : (isBusActive ? const Color(0xFF10B981) : Colors.amber),
                size: 28,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isEmergency
                          ? '⚠️ EMERGENCY SOS BROADCASTING'
                          : (isBusActive ? 'School Bus Active' : 'Bus Offline / Parked'),
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: _isEmergency ? Colors.red : Colors.white,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      isBusActive
                          ? 'Speed: ${(_liveSpeed * 3.6).toStringAsFixed(1)} km/h • Tracking active'
                          : 'Waiting for driver to start the scheduled route trip.',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRelocationPanel() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF151C2C).withOpacity(0.95),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF223049), width: 1.5),
        boxShadow: const [
          BoxShadow(color: Colors.black45, blurRadius: 10, offset: Offset(0, 4)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Relocate Home/Pickup Location',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 6),
          const Text(
            'Tap anywhere on the map or drag map to position your custom pickup stop pin.',
            style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _isSavingLocation ? null : _saveNewPickupLocation,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: _isSavingLocation
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                  )
                : const Text(
                    'CONFIRM & SAVE HOME PIN',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                  ),
          ),
        ],
      ),
    );
  }
}
