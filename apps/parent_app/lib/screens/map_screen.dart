import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:parent_app/services/google_directions_service.dart';
import 'package:parent_app/services/parent_etas_service.dart';
import 'package:parent_app/services/parent_live_service.dart';
import 'package:parent_app/services/parent_session_recovery.dart';
import 'package:parent_app/services/supabase_service.dart';
import 'package:parent_app/theme/parent_colors.dart';
import 'package:parent_app/utils/eta_utils.dart';
import 'package:parent_app/utils/parent_children_logic.dart';
import 'package:parent_app/utils/parent_map_logic.dart';
import 'package:parent_app/widgets/eta_display.dart';

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

class _MapScreenState extends State<MapScreen> with WidgetsBindingObserver {
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
  String _transitStatus = 'Waiting for pickup';

  // Vehicle & Conductor info
  String _licensePlate = 'Bus 12';
  String _conductorName = 'John Kamau';

  // Telemetry stream state
  ParentLiveSnapshot _live = ParentLiveSnapshot.idle();
  StreamSubscription? _liveSubscription;
  Timer? _livePollTimer;
  Timer? _idleTickTimer;

  // Live ETA: HMAC poll + optional Realtime
  String? _targetStopId;
  StopEta? _stopEta;
  Timer? _etaPollTimer;
  StreamSubscription? _etaRealtimeSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadMarkerIcons();
    _bootstrapLive();
  }

  Future<void> _bootstrapLive() async {
    await ParentSessionRecovery.recover();
    if (!mounted) return;
    await _fetchStudentAndRouteData();
    _subscribeToLiveTelemetry();
    _startLivePolling();
    _startEtaPolling();
    _idleTickTimer?.cancel();
    _idleTickTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _isTripActive) return;
      setState(() {});
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _onResume();
    }
  }

  Future<void> _onResume() async {
    await ParentSessionRecovery.recover();
    if (!mounted) return;
    await _fetchStudentAndRouteData();
    _liveSubscription?.cancel();
    _etaRealtimeSub?.cancel();
    _subscribeToLiveTelemetry();
    _startLivePolling();
    _startEtaPolling();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _liveSubscription?.cancel();
    _livePollTimer?.cancel();
    _idleTickTimer?.cancel();
    _etaPollTimer?.cancel();
    _etaRealtimeSub?.cancel();
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

  Future<void> _fetchStudentAndRouteData() async {
    setState(() => _isLoadingRoute = true);
    try {
      // 1. Fetch student data for home pickup_location, status, relevant stop
      final studentResponse = await awaitOrNull(
        SupabaseService.client
            .from('students')
            .select(
                'id, status, transit_status, pickup_location, pickup_stop_id, dropoff_stop_id, route:routes(id, name)')
            .eq('id', widget.studentId)
            .maybeSingle(),
        timeout: const Duration(seconds: 8),
      );

      if (studentResponse != null) {
        if (studentResponse['transit_status'] != null) {
          _transitStatus = studentResponse['transit_status'];
        }

        _targetStopId = (studentResponse['pickup_stop_id'] as String?) ??
            (studentResponse['dropoff_stop_id'] as String?);

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
      final details = await awaitOrNull(
        SupabaseService.fetchRouteDetails(widget.routeId),
        timeout: const Duration(seconds: 10),
      );
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
      debugPrint('Error fetching map route data');
    } finally {
      if (mounted) {
        setState(() => _isLoadingRoute = false);
      }
    }
  }

  Future<void> _refreshLive() async {
    final snap = await ParentLiveService.fetchLive(
      widget.studentId,
      routeId: widget.routeId,
    );
    if (!mounted || snap == null) return;
    setState(() {
      _live = snap;
      if (snap.transitStatus != null && snap.transitStatus!.isNotEmpty) {
        _transitStatus = snap.transitStatus!;
      }
      if (snap.vehiclePlate != null && snap.vehiclePlate!.isNotEmpty) {
        _licensePlate = snap.vehiclePlate!;
      }
      if (snap.driverName != null && snap.driverName!.isNotEmpty) {
        _conductorName = snap.driverName!;
      }
      if (snap.nextStopName != null && snap.nextStopName!.isNotEmpty) {
        _pickupStageName = snap.nextStopName!;
      }
    });
    if (snap.hasBusFix) {
      _mapController?.animateCamera(
        CameraUpdate.newLatLng(LatLng(snap.lat!, snap.lng!)),
      );
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
      if (data.isEmpty || !mounted || !_isTripActive) return;
      final latest = data.first;
      final point = parseCoordinatePayload(latest['coordinates']);
      if (point == null) return;

      setState(() {
        _live = ParentLiveSnapshot(
          tripActive: true,
          lat: point.lat,
          lng: point.lng,
          speedMps: (latest['speed'] as num?)?.toDouble() ?? _live.speedMps,
          isEmergency: latest['is_emergency'] as bool? ?? _live.isEmergency,
          vehiclePlate: _live.vehiclePlate,
          driverName: _live.driverName,
          nextStopName: _live.nextStopName,
          etaMinutes: _live.etaMinutes,
          delaySeconds: _live.delaySeconds,
          predictedArrival: _live.predictedArrival,
          transitStatus: _live.transitStatus,
          attendance: _live.attendance,
          direction: _live.direction,
          nextTrip: _live.nextTrip,
        );
      });
      _mapController?.animateCamera(
        CameraUpdate.newLatLng(LatLng(point.lat, point.lng)),
      );
    });
  }

  void _startLivePolling() {
    _refreshLive();
    _livePollTimer?.cancel();
    _livePollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _refreshLive();
    });
  }

  void _recenterOnBus() {
    if (!_live.hasBusFix) return;
    _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(_live.lat!, _live.lng!), 15.5),
    );
  }

  Future<void> _refreshEta() async {
    final eta = await ParentEtasService.fetchStudentEta(widget.studentId);
    if (!mounted || eta == null) return;
    setState(() => _stopEta = eta);
  }

  void _startEtaPolling() {
    _refreshEta();
    _etaPollTimer?.cancel();
    _etaPollTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      _refreshEta();
    });

    // Prefer Realtime when a Supabase Auth parent JWT is present
    _etaRealtimeSub?.cancel();
    if (SupabaseService.client.auth.currentSession != null) {
      _etaRealtimeSub = SupabaseService.streamTripStopEtas(widget.routeId).listen(
        (rows) {
          if (!mounted || rows.isEmpty) return;
          final eta = pickStopEta(rows, _targetStopId) ??
              StopEta.fromRow(rows.first);
          setState(() => _stopEta = eta);
        },
        onError: (_) {},
      );
    }
  }

  // Dynamic metric calculations
  int? get _etaMinutes {
    if (_live.etaMinutes != null) return _live.etaMinutes;
    return _stopEta?.freshMinutesUntil();
  }

  DateTime? get _predictedArrival {
    if (_live.predictedArrival != null &&
        etaMinutesFromArrival(_live.predictedArrival) != null) {
      return _live.predictedArrival;
    }
    if (_stopEta != null && _stopEta!.freshMinutesUntil() != null) {
      return _stopEta!.predictedArrival;
    }
    return null;
  }

  int get _delaySeconds =>
      _live.delaySeconds != 0 ? _live.delaySeconds : (_stopEta?.delaySeconds ?? 0);

  bool get _isTripActive => _live.tripActive;

  String get _displayPlate {
    if (_live.vehiclePlate != null && _live.vehiclePlate!.isNotEmpty) {
      return _live.vehiclePlate!;
    }
    return _licensePlate;
  }

  String get _displayDriver {
    if (_live.driverName != null && _live.driverName!.isNotEmpty) {
      return _live.driverName!;
    }
    return _conductorName;
  }

  @override
  Widget build(BuildContext context) {
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

    // Home pin is context only — parents edit it on Home Location, not Map.
    markers.add(
      Marker(
        markerId: const MarkerId('home'),
        position: _homeLocation,
        infoWindow: const InfoWindow(title: 'Home'),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
      ),
    );

    if (_isTripActive && _live.hasBusFix) {
      final LatLng busPosition = LatLng(_live.lat!, _live.lng!);
      markers.add(
        Marker(
          markerId: const MarkerId('live-bus'),
          position: busPosition,
          infoWindow: InfoWindow(
            title: _displayPlate,
            snippet: _live.isEmergency
                ? 'SOS active'
                : (_etaMinutes != null
                    ? '${formatEtaMinutes(_etaMinutes)} away'
                    : 'Tracking...'),
          ),
          icon: _busIcon ??
              BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          zIndexInt: 5,
        ),
      );
    }

    final Set<Polyline> polylines = {
      if (_polylinePoints.length >= 2)
        Polyline(
          polylineId: const PolylineId('route'),
          points: _polylinePoints,
          width: 5,
          color: const Color(0xFF2563EB),
        ),
    };

    final cameraTarget = _isTripActive && _live.hasBusFix
        ? LatLng(_live.lat!, _live.lng!)
        : (_pickupStageLocation ?? _homeLocation);

    if (!_isTripActive) {
      return Scaffold(
        backgroundColor: const Color(0xFFF8FAFC),
        body: _isLoadingRoute
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF2563EB)))
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        widget.studentName,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Upcoming trip',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Expanded(child: _buildIdleScheduleCard()),
                    ],
                  ),
                ),
              ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: _isLoadingRoute
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF2563EB)))
          : Stack(
              children: [
                GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: cameraTarget,
                    zoom: 15.2,
                  ),
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  mapToolbarEnabled: false,
                  compassEnabled: false,
                  markers: markers,
                  polylines: polylines,
                  onMapCreated: (controller) => _mapController = controller,
                ),

                if (_live.isEmergency)
                  const Positioned(
                    top: 12,
                    left: 16,
                    right: 16,
                    child: _SosBanner(),
                  ),

                Positioned(
                  top: _live.isEmergency ? 72 : 50,
                  left: 16,
                  right: 16,
                  child: _buildLiveHeaderCard(),
                ),

                if (_live.hasBusFix)
                  Positioned(
                    right: 16,
                    bottom: 230,
                    child: FloatingActionButton.small(
                      heroTag: 'recenter-bus',
                      backgroundColor: Colors.white,
                      foregroundColor: ParentColors.ink,
                      onPressed: _recenterOnBus,
                      child: const Icon(Icons.my_location),
                    ),
                  ),

                Positioned(
                  bottom: 20,
                  left: 16,
                  right: 16,
                  child: Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        )
                      ],
                    ),
                    child: _buildLiveTripBottomCard(),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildIdleScheduleCard() {
    final next = _live.nextTrip;
    if (next == null || next.departureTime.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: const Color(0xFFE2E8F0)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.event_busy_outlined, size: 52, color: Color(0xFF94A3B8)),
            const SizedBox(height: 14),
            Text(
              noTripScheduledTitle(),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              noTripScheduledSubtitle(),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, height: 1.4, color: Color(0xFF64748B)),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: const BoxDecoration(
                  color: Color(0xFFEFF6FF),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.directions_bus_filled, color: Color(0xFF2563EB)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      next.scheduleName?.trim().isNotEmpty == true
                          ? next.scheduleName!
                          : (next.direction == 'SCHOOL_TO_HOME'
                              ? 'Home run'
                              : 'School run'),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      next.busLabel,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          Row(
            children: [
              Expanded(
                child: _ScheduleStat(
                  label: 'DEPART',
                  value: next.departureTime,
                ),
              ),
              Expanded(
                child: _ScheduleStat(
                  label: 'EST. TIME',
                  value: formatEstTripDuration(next.estimatedDurationMinutes),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              countdownToDeparture(next.departureTime),
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
              ),
            ),
          ),
          const Spacer(),
          Text(
            idleTripSubtitle(),
            style: const TextStyle(fontSize: 12, height: 1.35, color: Color(0xFF94A3B8)),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveHeaderCard() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 6),
          )
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: const BoxDecoration(
              color: Color(0xFFEAF8EF),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.directions_bus_rounded,
              color: Color(0xFF006B32),
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _displayPlate,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _live.hasBusFix
                      ? '${formatSpeedKmh(_live.speedMps)} · $_displayDriver'
                      : 'Awaiting GPS · $_displayDriver',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF64748B),
                  ),
                ),
              ],
            ),
          ),
          EtaDisplay(
            etaMinutes: _etaMinutes,
            delaySeconds: _delaySeconds,
            label: 'ETA',
            etaFontSize: 16,
          ),
        ],
      ),
    );
  }

  Widget _buildLiveTripBottomCard() {
    final distKm = distanceKmToPoint(
      fromLat: _live.lat,
      fromLng: _live.lng,
      toLat: _pickupStageLocation?.latitude,
      toLng: _pickupStageLocation?.longitude,
    );
    final arrival = formatArrivalClock(_predictedArrival);
    final status = parentArrivalStatusLabel(
      hasBusFix: _live.hasBusFix,
      delaySeconds: _delaySeconds,
      etaMinutes: _etaMinutes,
    );
    final statusColor = status == 'Running late'
        ? const Color(0xFFB91C1C)
        : status == 'Awaiting GPS'
            ? const Color(0xFF64748B)
            : const Color(0xFF006B32);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _LiveMetric(
                  title: 'CHILD STATUS',
                  value: parentChildStatusLabel(
                    _live.transitStatus ?? _transitStatus,
                    attendance: _live.attendance,
                    direction: _live.direction,
                    tripActive: true,
                  ),
                  footer: widget.studentName,
                ),
              ),
              const VerticalDivider(width: 16, thickness: 1, color: Color(0xFFE2E8F0)),
              Expanded(
                child: _LiveMetric(
                  title: 'NEXT STOP',
                  value: _live.nextStopName ?? _pickupStageName,
                  footer: formatNextStopMeta(
                    etaMinutes: _etaMinutes,
                    distanceKm: distKm,
                  ),
                ),
              ),
              const VerticalDivider(width: 16, thickness: 1, color: Color(0xFFE2E8F0)),
              Expanded(
                child: _LiveMetric(
                  title: 'EST. ARRIVAL',
                  value: arrival,
                  footer: status,
                  footerColor: statusColor,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LiveMetric extends StatelessWidget {
  const _LiveMetric({
    required this.title,
    required this.value,
    required this.footer,
    this.footerColor,
  });

  final String title;
  final String value;
  final String footer;
  final Color? footerColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
            color: Color(0xFF64748B),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          footer,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: footerColor ?? const Color(0xFF64748B),
          ),
        ),
      ],
    );
  }
}

class _ScheduleStat extends StatelessWidget {
  final String label;
  final String value;

  const _ScheduleStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: Color(0xFF94A3B8),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          value,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0F172A),
          ),
        ),
      ],
    );
  }
}

class _SosBanner extends StatelessWidget {
  const _SosBanner();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFFEF2F2),
      borderRadius: BorderRadius.circular(12),
      child: const Padding(
        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Color(0xFFDC2626)),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'SOS is active on this trip.',
                style: TextStyle(
                  color: Color(0xFFB91C1C),
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
