import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:driver_app/services/supabase_service.dart';
import 'package:driver_app/services/location_service.dart';
import 'package:driver_app/screens/login_screen.dart';
import 'package:driver_app/services/driver_api_auth.dart';
import 'package:driver_app/screens/student_selection_screen.dart';
import 'package:driver_app/screens/trip_screen.dart';
import 'package:driver_app/config/api_config.dart';
import 'package:driver_app/widgets/route_map_widget.dart';
import 'package:driver_app/utils/geo_utils.dart';
import 'package:driver_app/utils/gps_replay.dart';
import 'package:driver_app/utils/stop_visit_logic.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/providers/trip_providers.dart';
import 'package:driver_app/services/stop_navigation_service.dart';
import 'package:driver_app/widgets/guardian_photo_thumbnail.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:firebase_core/firebase_core.dart';
import 'package:url_launcher/url_launcher.dart';
import 'firebase_options.dart';

export 'package:driver_app/providers/trip_providers.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Keep startup resilient: a failed plugin init must not leave Android on the
  // native splash forever (first Flutter frame never draws).
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (e, st) {
    debugPrint('Firebase init failed: $e\n$st');
  }

  try {
    await Supabase.initialize(
      url: SupabaseService.url,
      publishableKey: SupabaseService.anonKey,
    );
  } catch (e, st) {
    debugPrint('Supabase init failed: $e\n$st');
  }

  try {
    await LocationTrackingService.initializeBackgroundService();
  } catch (e, st) {
    debugPrint('Background location service init failed: $e\n$st');
  }

  final prefs = await SharedPreferences.getInstance();
  final isLoggedIn = prefs.getBool('is_logged_in') ?? false;

  runApp(
    ProviderScope(
      child: MyApp(isLoggedIn: isLoggedIn),
    ),
  );
}

class MyApp extends StatelessWidget {
  final bool isLoggedIn;
  
  const MyApp({super.key, required this.isLoggedIn});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OnTheBus Driver',
      debugShowCheckedModeBanner: false,
      // OnTheBus light theme (page #F8F9FF, white cards, ink text)
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF10B981), // Action green
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF8F9FF),
        cardColor: const Color(0xFFFFFFFF),
        dividerColor: const Color(0xFFE2E8F0),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF10B981),
          foregroundColor: Colors.white,
          elevation: 2,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(8)),
            ),
            elevation: 2,
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
          ),
        ),
      ),
      home: isLoggedIn ? const MyHomePage() : const LoginScreen(),
    );
  }
}

class MyHomePage extends ConsumerStatefulWidget {
  const MyHomePage({super.key});

  @override
  ConsumerState<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends ConsumerState<MyHomePage> {
  // Input controllers for B2B tenant routing parameters (populated from session)
  final TextEditingController _tenantController = TextEditingController();
  final TextEditingController _vehicleController = TextEditingController();
  final TextEditingController _routeController = TextEditingController();

  String _driverId = "";
  String _driverName = "";
  String _driverPhone = "";
  String _driverRole = "driver";
  String _vehiclePlate = "KBC 123X";
  String _schoolName = "OnTheBus Driver";
  StreamSubscription? _telemetrySub;
  StreamSubscription<Position>? _foregroundGpsSub;

  // Route and Trip selection states
  String? _selectedRouteId;
  String? _selectedTripId;
  String? _selectedTripRunId;

  bool _isLoadingDetails = false;
  String _selectedRunType = "PICKUP"; // "PICKUP" or "DROPOFF"

  List<dynamic> _stopsList = [];
  List<dynamic> _studentsList = [];
  int _currentTab = 0;

  final TextEditingController _studentsSearchController = TextEditingController();
  String _studentsSearchQuery = "";

  // Scheduled routes and trips state variables
  List<dynamic> _driverTrips = [];
  bool _isLoadingDriverTrips = false;
  bool _showClockWarning = false;
  Timer? _countdownTimer;
  String _countdownText = "";

  dynamic _activeTrip;
  dynamic _nextTrip;
  dynamic _lastCompletedTrip;

  final Map<String, StopVisitOutcome> _stopOutcomes = {};
  DateTime? _arrivedAt;
  String? _lastArrivedStopId;
  int _studentsActionedAtCurrentStop = 0;
  int _minStopDwellSeconds = defaultMinStopDwellSeconds;
  Timer? _dwellWatchTimer;

  bool _gpsReplayActive = false;
  String? _gpsReplayLabel;
  final GpsReplayPlayer _gpsReplayPlayer = GpsReplayPlayer();

  @override
  void initState() {
    super.initState();
    _loadSessionDetails();
    _checkActiveTripStatus();
    _listenToBackgroundTelemetry();
  }

  @override
  void dispose() {
    _stopGpsReplay(restartGps: false);
    _telemetrySub?.cancel();
    _foregroundGpsSub?.cancel();
    _countdownTimer?.cancel();
    _dwellWatchTimer?.cancel();
    _tenantController.dispose();
    _vehicleController.dispose();
    _routeController.dispose();
    _studentsSearchController.dispose();
    super.dispose();
  }

  ArrivedStop? _arrivedStopFor(TelemetryCoords? telemetry) {
    if (telemetry == null || _stopsList.isEmpty) return null;
    return findArrivedStop(
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      stops: _stopsList,
    );
  }

  bool get _isPickupRun => _selectedRunType == 'PICKUP';

  Map<String, dynamic>? _nextNavStop(TelemetryCoords? telemetry) {
    return nextNavigationStop(
      stops: _stopsList,
      latitude: telemetry?.latitude,
      longitude: telemetry?.longitude,
    );
  }

  Future<void> _navigateToStop(Map<String, dynamic>? stop) async {
    if (stop == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No next stop available for navigation.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final ok = await StopNavigationService.navigateToStop(stop);
    if (!mounted) return;
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Could not open Google Maps navigation for ${stop['name'] ?? 'stop'}.',
          ),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Widget _buildNextStopNavCard(TelemetryCoords? telemetry) {
    final nextStop = _nextNavStop(telemetry);
    final arrived = _arrivedStopFor(telemetry);
    final stopName = (nextStop?['name'] ?? 'No further stops').toString();
    final subtitle = arrived != null
        ? 'At ${arrived.name}. Navigate to the next stop when ready.'
        : (nextStop != null
            ? 'Turn-by-turn directions in Google Maps'
            : 'You are at the last stop on this route');

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFFFF),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.navigation, color: Color(0xFF10B981), size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      nextStop != null ? 'NEXT STOP' : 'ROUTE COMPLETE',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF64748B),
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      stopName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0B1C30),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (nextStop != null) ...[
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: () => _navigateToStop(nextStop),
              icon: const Icon(Icons.directions),
              label: const Text(
                'Navigate',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0B1C30),
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _applyTelemetry({
    required double latitude,
    required double longitude,
    double speed = 0,
    double bearing = 0,
    String? timestamp,
    bool fromReplay = false,
  }) {
    if (!mounted) return;
    if (_gpsReplayActive && !fromReplay) return;
    ref.read(telemetryCoordsProvider.notifier).state = TelemetryCoords(
      latitude: latitude,
      longitude: longitude,
      speed: speed,
      bearing: bearing,
      timestamp: timestamp ?? DateTime.now().toIso8601String(),
    );

    final next = firstUnresolvedStop(stops: _stopsList, outcomes: _stopOutcomes);
    final nextId = next?['id']?.toString();

    if (_lastArrivedStopId != null) {
      final currentStop = _stopById(_lastArrivedStopId!);
      final leftCurrent = currentStop == null ||
          hasLeftStopGeofence(
            latitude: latitude,
            longitude: longitude,
            stop: currentStop,
          );
      if (leftCurrent) {
        final leftId = _lastArrivedStopId!;
        _handleLeftStop(leftId);
      }
    }

    if (_lastArrivedStopId == null) {
      final arrived = findArrivedStop(
        latitude: latitude,
        longitude: longitude,
        stops: _stopsList,
      );
      if (arrived != null &&
          arrived.id == nextId &&
          !_stopOutcomes.containsKey(arrived.id)) {
        setState(() {
          _lastArrivedStopId = arrived.id;
          _arrivedAt = DateTime.now();
          _studentsActionedAtCurrentStop = 0;
        });
        _ensureDwellWatchTimer();
      }
    }
  }

  Map<String, dynamic>? _stopById(String stopId) {
    for (final s in _stopsList) {
      if (s is Map && s['id']?.toString() == stopId) {
        return Map<String, dynamic>.from(s);
      }
    }
    return null;
  }

  void _ensureDwellWatchTimer() {
    _dwellWatchTimer ??= Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final coords = ref.read(telemetryCoordsProvider);
      if (coords == null) return;
      _tryResolveDelayedVisited(latitude: coords.latitude, longitude: coords.longitude);
    });
  }

  void _tryResolveDelayedVisited({required double latitude, required double longitude}) {
    final stopId = _lastArrivedStopId;
    if (stopId == null || _arrivedAt == null) return;
    if (_stopOutcomes.containsKey(stopId)) return;
    if (_studentsActionedAtCurrentStop > 0) return;
    if (!skipStopAllowed(
      arrivedAt: _arrivedAt,
      now: DateTime.now(),
      minStopDwellSeconds: _minStopDwellSeconds,
    )) {
      return;
    }
    final currentStop = _stopById(stopId);
    if (currentStop == null) return;
    if (!hasLeftStopGeofence(latitude: latitude, longitude: longitude, stop: currentStop)) {
      return;
    }
    _handleLeftStop(stopId);
  }

  void _handleLeftStop(String stopId) {
    if (!shouldOverwriteOutcome(_stopOutcomes[stopId], StopVisitOutcome.visited) &&
        !shouldOverwriteOutcome(_stopOutcomes[stopId], StopVisitOutcome.completed)) {
      setState(() {
        if (_lastArrivedStopId == stopId) {
          _lastArrivedStopId = null;
          _arrivedAt = null;
        }
      });
      return;
    }
    if (_stopOutcomes.containsKey(stopId)) {
      setState(() {
        if (_lastArrivedStopId == stopId) {
          _lastArrivedStopId = null;
          _arrivedAt = null;
        }
      });
      return;
    }
    final arrivedAt = _arrivedAt;
    final resolution = resolveStopExit(
      reason: StopExitReason.leftGeofence,
      studentsActioned: _studentsActionedAtCurrentStop,
      arrivedAt: arrivedAt,
      now: DateTime.now(),
      minStopDwellSeconds: _minStopDwellSeconds,
    );
    if (resolution == null) {
      _ensureDwellWatchTimer();
      return;
    }
    _recordStopVisit(
      stopId: stopId,
      outcome: resolution.outcome,
      dwellSeconds: dwellSeconds(arrivedAt: arrivedAt, departedAt: DateTime.now()),
      studentsActioned: _studentsActionedAtCurrentStop,
      arrivedAt: arrivedAt,
    );
  }

  Future<void> _recordStopVisit({
    required String stopId,
    required StopVisitOutcome outcome,
    required int dwellSeconds,
    required int studentsActioned,
    DateTime? arrivedAt,
  }) async {
    if (!shouldOverwriteOutcome(_stopOutcomes[stopId], outcome)) return;
    setState(() {
      _stopOutcomes[stopId] = outcome;
      if (_lastArrivedStopId == stopId) {
        _lastArrivedStopId = null;
        _arrivedAt = null;
      }
      _studentsList = markPendingAbsentAtStop(
        students: _studentsList,
        stopId: stopId,
        isPickup: isPickupRunType(_selectedRunType),
      );
    });

    final tripId = _activeTrip is Map ? _activeTrip['id']?.toString() : _selectedTripRunId;
    if (tripId == null || tripId.isEmpty) return;

    try {
      final baseUrl = _getApiBaseUrl();
      await http
          .post(
            Uri.parse('$baseUrl/api/driver/stop-visits'),
            headers: await DriverApiAuth.headers(),
            body: json.encode({
              'trip_id': tripId,
              'stop_id': stopId,
              if (_selectedRouteId != null) 'route_id': _selectedRouteId,
              'outcome': outcome.name,
              if (arrivedAt != null) 'arrived_at': arrivedAt.toUtc().toIso8601String(),
              'departed_at': DateTime.now().toUtc().toIso8601String(),
              'dwell_seconds': dwellSeconds,
              'students_actioned': studentsActioned,
              'alerted': outcome == StopVisitOutcome.visited || outcome == StopVisitOutcome.skipped,
            }),
          )
          .timeout(const Duration(seconds: 8));
    } catch (e) {
      debugPrint('Error recording stop visit');
    }
  }

  Future<void> _seedForegroundGps() async {
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null) {
        _applyTelemetry(
          latitude: last.latitude,
          longitude: last.longitude,
          speed: last.speed,
          bearing: last.heading,
        );
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      );
      _applyTelemetry(
        latitude: position.latitude,
        longitude: position.longitude,
        speed: position.speed,
        bearing: position.heading,
      );
    } catch (e) {
      debugPrint('Foreground GPS seed failed: $e');
    }
  }

  void _startForegroundGpsStream() {
    _foregroundGpsSub?.cancel();
    _foregroundGpsSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
      ),
    ).listen((position) {
      _applyTelemetry(
        latitude: position.latitude,
        longitude: position.longitude,
        speed: position.speed,
        bearing: position.heading,
      );
    }, onError: (Object e) {
      debugPrint('Foreground GPS stream error: $e');
    });
  }

  void _stopForegroundGpsStream() {
    _foregroundGpsSub?.cancel();
    _foregroundGpsSub = null;
  }

  void _pushMockLocation({
    required double latitude,
    required double longitude,
    double speed = 0,
    double bearing = 0,
    bool enabled = true,
  }) {
    FlutterBackgroundService().invoke('setMockLocation', {
      'enabled': enabled,
      'latitude': latitude,
      'longitude': longitude,
      'speed': speed,
      'bearing': bearing,
    });
  }

  Future<void> _postReplayTelemetry({
    required double latitude,
    required double longitude,
    required double speed,
    required double bearing,
  }) async {
    final routeId = _selectedRouteId ?? _routeController.text.trim();
    if (routeId.isEmpty) return;
    try {
      await http
          .post(
            Uri.parse('${_getApiBaseUrl()}/api/driver/telemetry'),
            headers: await DriverApiAuth.headers(),
            body: json.encode({
              'tenant_id': _tenantController.text.trim(),
              'vehicle_id': _vehicleController.text.trim(),
              'route_id': routeId,
              'latitude': latitude,
              'longitude': longitude,
              'speed': speed,
              'bearing': bearing,
              'is_emergency': false,
            }),
          )
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      debugPrint('Replay telemetry post failed');
    }
  }

  void _toggleGpsReplay() {
    if (!kDebugMode) return;
    if (_gpsReplayActive) {
      _stopGpsReplay(restartGps: true);
      return;
    }
    _startGpsReplay();
  }

  void _startGpsReplay() {
    if (!kDebugMode) return;
    if (!ref.read(tripActiveProvider)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Start a trip before replaying GPS.')),
      );
      return;
    }

    final waypoints = buildStopReplayScript(
      stops: _stopsList,
      isPickup: _isPickupRun,
    );
    final ticks = expandReplayWaypoints(waypoints);
    if (ticks.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No stop coordinates to replay.')),
      );
      return;
    }

    _stopForegroundGpsStream();
    _pushMockLocation(
      latitude: ticks.first.latitude,
      longitude: ticks.first.longitude,
      enabled: true,
    );

    setState(() {
      _gpsReplayActive = true;
      _gpsReplayLabel = ticks.first.label;
    });

    _gpsReplayPlayer.start(
      ticks: ticks,
      onTick: (tick) {
        if (!mounted) return;
        setState(() => _gpsReplayLabel = tick.label);
        _applyTelemetry(
          latitude: tick.latitude,
          longitude: tick.longitude,
          speed: tick.speedMps,
          bearing: tick.bearing,
          fromReplay: true,
        );
        _pushMockLocation(
          latitude: tick.latitude,
          longitude: tick.longitude,
          speed: tick.speedMps,
          bearing: tick.bearing,
        );
        unawaited(
          _postReplayTelemetry(
            latitude: tick.latitude,
            longitude: tick.longitude,
            speed: tick.speedMps,
            bearing: tick.bearing,
          ),
        );
      },
      onDone: () {
        if (!mounted) return;
        _stopGpsReplay(restartGps: true);
      },
    );
  }

  void _stopGpsReplay({required bool restartGps}) {
    _gpsReplayPlayer.stop();
    _pushMockLocation(
      latitude: 0,
      longitude: 0,
      enabled: false,
    );
    final wasActive = _gpsReplayActive;
    if (mounted) {
      setState(() {
        _gpsReplayActive = false;
        _gpsReplayLabel = null;
      });
    } else {
      _gpsReplayActive = false;
      _gpsReplayLabel = null;
    }
    if (restartGps && wasActive && mounted && ref.read(tripActiveProvider)) {
      _startForegroundGpsStream();
    }
  }

  String _getApiBaseUrl() => ApiConfig.baseUrl;

  /// Load authenticated driver details from SharedPreferences
  Future<void> _loadSessionDetails() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _driverId = prefs.getString('driver_id') ?? '';
      _driverName = prefs.getString('driver_name') ?? "Unknown Driver";
      _driverPhone = prefs.getString('driver_phone') ?? "";
      _driverRole = prefs.getString('driver_role') ?? "driver";
      _tenantController.text = prefs.getString('tenant_id') ?? '8c9ad841-f762-4217-a021-9876251b5bcf';
      _vehicleController.text = prefs.getString('vehicle_id') ?? 'e5015e10-c09a-4c22-901d-5573752e379c';
      _vehiclePlate = prefs.getString('vehicle_plate') ?? 'KBC 123X';
      _schoolName = prefs.getString('school_name') ?? 'OnTheBus Driver';
    });

    // Fetch today's scheduled routes and trips
    await _fetchDriverTrips();

    // Fetch live vehicle details to update the plate number
    if (_vehicleController.text.isNotEmpty) {
      await _fetchVehiclePlate(_vehicleController.text);
    }

    // Fetch dynamic school name from system config
    await _fetchSchoolName();
  }

  /// Query the fleet API to retrieve the vehicle plate number
  Future<void> _fetchVehiclePlate(String vehicleId) async {
    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.get(
        Uri.parse('$baseUrl/api/fleet'),
        headers: await DriverApiAuth.headers(),
      ).timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          final List<dynamic> vehicles = result['data'];
          final vehicle = vehicles.firstWhere(
            (v) => v['id'] == vehicleId,
            orElse: () => null,
          );
          if (vehicle != null && vehicle['license_plate'] != null) {
            setState(() {
              _vehiclePlate = vehicle['license_plate'];
            });
            final prefs = await SharedPreferences.getInstance();
            await prefs.setString('vehicle_plate', _vehiclePlate);
          }
        }
      }
    } catch (e) {
      debugPrint("Error fetching vehicle plate: $e");
    }
  }

  /// Query the system config API to retrieve the school name
  Future<void> _fetchSchoolName() async {
    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.get(
        Uri.parse('$baseUrl/api/config'),
        headers: await DriverApiAuth.headers(),
      ).timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          final config = result['data'];
          final dwell = config['min_stop_dwell_seconds'];
          if (mounted) {
            setState(() {
              if (config['school_name'] != null && config['school_name'].toString().isNotEmpty) {
                _schoolName = config['school_name'];
              }
              if (dwell is num) {
                _minStopDwellSeconds = clampMinStopDwellSeconds(dwell.toInt());
              }
            });
          }
          if (config['school_name'] != null && config['school_name'].toString().isNotEmpty) {
            final prefs = await SharedPreferences.getInstance();
            await prefs.setString('school_name', _schoolName);
          }
        }
      }
    } catch (e) {
      debugPrint("Error fetching school name: $e");
    }
  }

  /// Fetch scheduled routes and trips assigned to this bus
  Future<void> _fetchDriverTrips() async {
    if (!mounted) return;
    setState(() {
      _isLoadingDriverTrips = true;
    });

    try {
      final baseUrl = _getApiBaseUrl();
      final vehicleId = _vehicleController.text.trim();
      final response = await http.get(
        Uri.parse('$baseUrl/api/driver/trips?vehicle_id=$vehicleId&driver_id=$_driverId'),
        headers: await DriverApiAuth.headers(),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          final trips = result['data'] as List<dynamic>;
          final serverTimeStr = result['server_time'] as String?;

          DateTime? serverTimeParsed;
          if (serverTimeStr != null) {
            serverTimeParsed = DateTime.parse(serverTimeStr).toLocal();
          }

          // Check clock drift
          bool showWarning = false;
          if (serverTimeParsed != null) {
            final drift = DateTime.now().difference(serverTimeParsed).inMinutes.abs();
            if (drift > 5) {
              showWarning = true;
            }
          }

          setState(() {
            _driverTrips = trips;
            _showClockWarning = showWarning;
          });

          _processTripStates();
        }
      }
    } catch (e) {
      debugPrint("Error fetching driver trips: $e");
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingDriverTrips = false;
        });
      }
    }
  }

  void _processTripStates() {
    dynamic activeTrip;
    dynamic nextTrip;
    dynamic lastCompletedTrip;

    // Find any trip that is in_progress
    for (final trip in _driverTrips) {
      if (trip['status'] == 'in_progress') {
        activeTrip = trip;
        break;
      }
    }

    // Filter all scheduled trips
    final scheduledTrips = _driverTrips.where((t) => t['status'] == 'scheduled').toList();

    if (scheduledTrips.isNotEmpty) {
      // If no trip run is selected, or the selected one is no longer scheduled, default to the first
      final isCurrentlyScheduled = scheduledTrips.any((t) => t['id'] == _selectedTripRunId);
      if (_selectedTripRunId == null || !isCurrentlyScheduled) {
        _selectedTripRunId = scheduledTrips.first['id'];
      }
      nextTrip = scheduledTrips.firstWhere(
        (t) => t['id'] == _selectedTripRunId,
        orElse: () => scheduledTrips.first,
      );
    }

    // Find the last completed trip
    for (final trip in _driverTrips) {
      if (trip['status'] == 'completed') {
        lastCompletedTrip = trip;
      }
    }

    setState(() {
      _activeTrip = activeTrip;
      _nextTrip = nextTrip;
      _lastCompletedTrip = lastCompletedTrip;
    });

    // Update active trip provider state
    final hasActiveTrip = activeTrip != null;
    ref.read(tripActiveProvider.notifier).state = hasActiveTrip;

    // Start/restart countdown timer if nextTrip is available
    _startCountdownTimer();

    // Automatically set selectedRouteId and selectedTripId for students and stops sequence tabs
    if (activeTrip != null) {
      final routeId = activeTrip['route']['id'];
      final tripId = activeTrip['schedule']['id'];
      final direction = activeTrip['schedule']['direction'] ?? 'PICKUP';
      
      setState(() {
        _selectedRouteId = routeId;
        _selectedTripId = tripId;
        _selectedRunType = direction == 'HOME_TO_SCHOOL' ? 'PICKUP' : 'DROPOFF';
        _routeController.text = routeId;
      });
      _fetchTripDetails(routeId, tripId);
    } else if (nextTrip != null) {
      final routeId = nextTrip['route']['id'];
      final tripId = nextTrip['schedule']['id'];
      final direction = nextTrip['schedule']['direction'] ?? 'PICKUP';
      
      setState(() {
        _selectedRouteId = routeId;
        _selectedTripId = tripId;
        _selectedRunType = direction == 'HOME_TO_SCHOOL' ? 'PICKUP' : 'DROPOFF';
        _routeController.text = routeId;
      });
      _fetchTripDetails(routeId, tripId);
    } else {
      setState(() {
        _selectedRouteId = null;
        _selectedTripId = null;
      });
    }
  }

  void _startCountdownTimer() {
    _countdownTimer?.cancel();
    if (_nextTrip == null) {
      setState(() {
        _countdownText = "";
      });
      return;
    }

    final departureTimeStr = _nextTrip['schedule']['departure_time'] as String; // e.g. "06:45:00"
    final timeParts = departureTimeStr.split(':');
    if (timeParts.length < 2) return;

    final hour = int.parse(timeParts[0]);
    final minute = int.parse(timeParts[1]);

    // Construct target DateTime today
    final now = DateTime.now();
    final targetTime = DateTime(now.year, now.month, now.day, hour, minute);

    void updateCountdown() {
      final timeNow = DateTime.now();
      final diff = targetTime.difference(timeNow);
      if (diff.isNegative) {
        setState(() {
          _countdownText = "Departing soon";
        });
      } else {
        final hours = diff.inHours;
        final minutes = diff.inMinutes % 60;
        final seconds = diff.inSeconds % 60;

        String text = "Starts in ";
        if (hours > 0) text += "${hours}h ";
        text += "${minutes}m ${seconds}s";

        setState(() {
          _countdownText = text;
        });
      }
    }

    updateCountdown();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted || _nextTrip == null) {
        timer.cancel();
        return;
      }
      updateCountdown();
    });
  }

  Future<void> _handleStartTrip(String tripId, String routeId, String scheduleId) async {
    setState(() => _isLoadingDriverTrips = true);
    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.put(
        Uri.parse('$baseUrl/api/trips'),
        headers: await DriverApiAuth.headers(),
        body: json.encode({
          'trip_id': tripId,
          'status': 'in_progress',
        }),
      ).timeout(const Duration(seconds: 8));

      final result = json.decode(response.body);
      if (response.statusCode == 200 && result['success'] == true) {
        // Save route/trip configuration locally in SharedPreferences for telemetry & background service mapping
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('route_id', routeId);
        await prefs.setString('trip_id', scheduleId); // background service config uses schedule_id mapping
        
        setState(() {
          _selectedRouteId = routeId;
          _selectedTripId = scheduleId;
          _routeController.text = routeId;
        });

        // Trigger native startTrip (starts background location tracking)
        await _startTrip();

        // Refresh trips from server
        await _fetchDriverTrips();
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to start trip: ${result['error'] ?? 'Server error'}')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Network error: Failed to start trip. $e')),
      );
    } finally {
      setState(() => _isLoadingDriverTrips = false);
    }
  }

  Future<void> _handleEndTrip(String tripId) async {
    setState(() => _isLoadingDriverTrips = true);
    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.put(
        Uri.parse('$baseUrl/api/trips'),
        headers: await DriverApiAuth.headers(),
        body: json.encode({
          'trip_id': tripId,
          'status': 'completed',
        }),
      ).timeout(const Duration(seconds: 8));

      final result = json.decode(response.body);
      if (response.statusCode == 200 && result['success'] == true) {
        // Stop location tracking background service
        await _endTrip();

        // Clean preferences
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('route_id');
        await prefs.remove('trip_id');

        setState(() {
          _selectedRouteId = null;
          _selectedTripId = null;
        });

        // Refresh trips from server
        await _fetchDriverTrips();
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to end trip: ${result['error'] ?? 'Server error'}')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Network error: Failed to end trip. $e')),
      );
    } finally {
      setState(() => _isLoadingDriverTrips = false);
    }
  }

  Future<void> _fetchTripDetails(String routeId, String tripId) async {
    if (!mounted) return;
    setState(() {
      _isLoadingDetails = true;
    });

    try {
      final baseUrl = _getApiBaseUrl();

      // 1. Fetch stops count
      final stopsResponse = await http.get(
        Uri.parse('$baseUrl/api/stops?route_id=$routeId'),
        headers: await DriverApiAuth.headers(),
      ).timeout(const Duration(seconds: 8));

      List<dynamic> stopsList = [];
      if (stopsResponse.statusCode == 200) {
        final stopsResult = json.decode(stopsResponse.body);
        if (stopsResult['success'] == true && stopsResult['data'] != null) {
          stopsList = stopsResult['data'] as List<dynamic>;
        }
      }

      // 2. Fetch students count
      final studentsResponse = await http.get(
        Uri.parse('$baseUrl/api/students'),
        headers: await DriverApiAuth.headers(),
      ).timeout(const Duration(seconds: 8));

      List<dynamic> studentsList = [];
      if (studentsResponse.statusCode == 200) {
        final studentsResult = json.decode(studentsResponse.body);
        if (studentsResult['success'] == true && studentsResult['data'] != null) {
          final allStudents = studentsResult['data'] as List<dynamic>;
          
          studentsList = allStudents.where((student) {
            final String studentRouteId = student['route_id'] ?? '';
            if (studentRouteId != routeId) return false;

            final dynamic scheduleIds = student['schedule_ids'];
            if (scheduleIds is List) {
              return scheduleIds.contains(tripId);
            }
            return false;
          }).toList();
        }
      }

      final previousManifests = _studentsList
          .whereType<Map>()
          .map((s) => <String, dynamic>{
                'student_id': s['id'],
                'attendance': s['attendance'] ?? 'pending',
              })
          .toList();
      var apiManifests = <dynamic>[];
      var fetchedManifests = false;
      final tripRunId = _activeTrip is Map ? _activeTrip['id']?.toString() : null;
      if (tripRunId != null && tripRunId.isNotEmpty) {
        try {
          final manifestResponse = await http
              .get(
                Uri.parse('$baseUrl/api/trips?trip_id=$tripRunId'),
                headers: await DriverApiAuth.headers(),
              )
              .timeout(const Duration(seconds: 8));
          if (manifestResponse.statusCode == 200) {
            final manifestResult = json.decode(manifestResponse.body);
            if (manifestResult['success'] == true && manifestResult['data'] is List) {
              apiManifests = manifestResult['data'] as List<dynamic>;
              fetchedManifests = true;
            }
          }
        } catch (e) {
          debugPrint('Error fetching trip manifests: $e');
        }
      }
      studentsList = mergeManifestAttendance(
        students: studentsList,
        manifests: fetchedManifests ? apiManifests : previousManifests,
      );

      if (mounted) {
        setState(() {
          _stopsList = stopsList;
          _studentsList = studentsList;
          _isLoadingDetails = false;
        });
      }
    } catch (e) {
      debugPrint("Error fetching trip details: $e");
      if (mounted) {
        setState(() {
          _isLoadingDetails = false;
          _stopsList = [];
          _studentsList = [];
        });
      }
    }
  }

  /// Sync local UI state with the background service's running status and persistent trip state
  Future<void> _checkActiveTripStatus() async {
    final prefs = await SharedPreferences.getInstance();
    final isTripStarted = prefs.getBool('is_trip_started') ?? false;

    final service = FlutterBackgroundService();
    final isRunning = await service.isRunning();

    if (!isTripStarted && isRunning) {
      service.invoke('stopService');
    }

    if (mounted) {
      ref.read(tripActiveProvider.notifier).state = isTripStarted;
      if (isTripStarted) {
        await _seedForegroundGps();
        _startForegroundGpsStream();
      }
    }
  }

  /// Register background event listener to receive coordinate streams
  void _listenToBackgroundTelemetry() {
    final service = FlutterBackgroundService();

    _telemetrySub = service.on('telemetryUpdate').listen((event) {
      if (event == null || !mounted) return;
      final lat = coordToDouble(event['latitude']);
      final lng = coordToDouble(event['longitude']);
      if (lat == null || lng == null) return;
      _applyTelemetry(
        latitude: lat,
        longitude: lng,
        speed: coordToDouble(event['speed']) ?? 0,
        bearing: coordToDouble(event['bearing']) ?? 0,
        timestamp: event['timestamp']?.toString(),
      );
    });
  }

  /// Start background tracking service and publish configuration parameters
  Future<void> _startTrip() async {
    // 1. Request hardware location permissions (Fail-safe wrapper)
    final bool granted = await SupabaseService.handleLocationPermissions();
    if (!mounted) return;

    if (!granted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Permission Denied: Location tracking is required to start trips.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final service = FlutterBackgroundService();

    // 2. Boot up background worker isolate
    final success = await service.startService();
    if (!mounted) return;

    if (!success) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error starting telemetry services.')),
      );
      return;
    }

    // Reset emergency state upon starting a new trip
    ref.read(emergencyActiveProvider.notifier).state = false;

    // Save trip started state in SharedPreferences
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('is_trip_started', true);

    // 3. Dispatch active trip configuration IDs to background worker
    service.invoke('updateConfig', {
      'tenantId': _tenantController.text.trim(),
      'vehicleId': _vehicleController.text.trim(),
      'routeId': _routeController.text.trim(),
      'accessToken': await DriverApiAuth.accessToken(),
      'apiBaseUrl': _getApiBaseUrl(),
    });

    // Seed UI map marker immediately; keep a foreground stream as a fallback
    // when background isolate events are delayed or drop numeric type casts.
    await _seedForegroundGps();
    _startForegroundGpsStream();

    ref.read(tripActiveProvider.notifier).state = true;
    setState(() {
      _currentTab = 1; // Switch to active trip tracking tab
      _stopOutcomes.clear();
      _arrivedAt = null;
      _lastArrivedStopId = null;
      _studentsActionedAtCurrentStop = 0;
    });
  }

  /// Shutdown background tracking service
  Future<void> _endTrip() async {
    _stopGpsReplay(restartGps: false);
    final service = FlutterBackgroundService();
    service.invoke('stopService');
    _stopForegroundGpsStream();

    // Save trip started state in SharedPreferences
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('is_trip_started', false);

    if (mounted) {
      ref.read(tripActiveProvider.notifier).state = false;
      ref.read(emergencyActiveProvider.notifier).state = false;
      ref.read(telemetryCoordsProvider.notifier).state = null;
      setState(() {
        _currentTab = 0; // Switch back to Home tab
        _stopOutcomes.clear();
        _arrivedAt = null;
        _lastArrivedStopId = null;
        _studentsActionedAtCurrentStop = 0;
      });
    }
  }

  /// Sign out driver and clear credentials
  Future<void> _handleSignOut() async {
    if (ref.read(tripActiveProvider)) {
      await _endTrip();
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();

    if (!mounted) return;

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (context) => const LoginScreen()),
    );
  }

  String _getInitials(String name) {
    if (name.isEmpty) return "DR";
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (parts.isNotEmpty && parts[0].isNotEmpty) {
      return parts[0][0].toUpperCase();
    }
    return "DR";
  }

  Future<bool> _updateStudentStatus(dynamic student, String newStatus) async {
    final studentId = student['id'];
    final oldStatus = student['status'];
    final oldAttendance = student is Map ? student['attendance'] : null;
    final newAttendance = attendanceForStatusUpdate(isPickup: _isPickupRun, status: newStatus);
    setState(() {
      student['status'] = newStatus;
      student['attendance'] = newAttendance;
      final idx = _studentsList.indexWhere((s) => s['id'] == studentId);
      if (idx != -1) {
        _studentsList[idx]['status'] = newStatus;
        _studentsList[idx]['attendance'] = newAttendance;
      }
      if (_lastArrivedStopId != null &&
          (newAttendance == 'boarded' || newAttendance == 'dropped_off')) {
        _studentsActionedAtCurrentStop += 1;
      }
    });

    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.put(
        Uri.parse('$baseUrl/api/students/$studentId'),
        headers: await DriverApiAuth.headers(),
        body: json.encode({'status': newStatus}),
      ).timeout(const Duration(seconds: 8));

      final result = json.decode(response.body);
      if (response.statusCode != 200 || result['success'] != true) {
        setState(() {
          student['status'] = oldStatus;
          student['attendance'] = oldAttendance;
          final idx = _studentsList.indexWhere((s) => s['id'] == studentId);
          if (idx != -1) {
            _studentsList[idx]['status'] = oldStatus;
            _studentsList[idx]['attendance'] = oldAttendance;
          }
          if (_lastArrivedStopId != null &&
              (newAttendance == 'boarded' || newAttendance == 'dropped_off') &&
              _studentsActionedAtCurrentStop > 0) {
            _studentsActionedAtCurrentStop -= 1;
          }
        });
        return false;
      }
      return true;
    } catch (e) {
      debugPrint("Error updating student status: $e");
      setState(() {
        student['status'] = oldStatus;
        student['attendance'] = oldAttendance;
        final idx = _studentsList.indexWhere((s) => s['id'] == studentId);
        if (idx != -1) {
          _studentsList[idx]['status'] = oldStatus;
          _studentsList[idx]['attendance'] = oldAttendance;
        }
        if (_lastArrivedStopId != null &&
            (newAttendance == 'boarded' || newAttendance == 'dropped_off') &&
            _studentsActionedAtCurrentStop > 0) {
          _studentsActionedAtCurrentStop -= 1;
        }
      });
      return false;
    }
  }

  Future<void> _callGuardian(String phone) async {
    final uri = guardianTelUri(phone);
    if (uri == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No valid phone number to call.')),
      );
      return;
    }
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the phone dialer.')),
      );
    }
  }

  void _showStudentDetailsPopup(dynamic student) {
    final telemetry = ref.read(telemetryCoordsProvider);
    final arrived = _arrivedStopFor(telemetry);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFFFFFFFF),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setPopupState) {
            final String studentName = student['name'] ?? 'Unknown Student';
            final String grade = student['grade'] ?? 'N/A';
            final String className = student['class_name'] ?? 'N/A';
            final String status = student['status'] ?? 'Absent';
            final bool isBoarded = status == "Present";
            final canAct = studentAllowedAtStop(
              student: Map<String, dynamic>.from(student as Map),
              arrivedStopId: arrived?.id,
              isBoardAction: !isBoarded,
            );

            final pickupStopId = student['pickup_stop_id'];
            final dropoffStopId = student['dropoff_stop_id'];
            
            final pickupStop = _stopsList.firstWhere(
              (s) => s['id'] == pickupStopId,
              orElse: () => null,
            );
            final dropoffStop = _stopsList.firstWhere(
              (s) => s['id'] == dropoffStopId,
              orElse: () => null,
            );
            
            final pickupName = pickupStop != null ? pickupStop['name'] as String : 'School / Default Stop';
            final dropoffName = dropoffStop != null ? dropoffStop['name'] as String : 'Home / Default Stop';

            dynamic rawGuardians = student['guardians'];
            List<dynamic> guardiansList = [];
            if (rawGuardians != null) {
              if (rawGuardians is String) {
                try {
                  guardiansList = json.decode(rawGuardians) as List<dynamic>;
                } catch (e) {
                  debugPrint("Error parsing guardians string: $e");
                }
              } else if (rawGuardians is List) {
                guardiansList = rawGuardians;
              }
            }

            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom,
              ),
              child: SingleChildScrollView(
                child: Container(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.close, color: Color(0xFF0B1C30)),
                            onPressed: () => Navigator.pop(context),
                          ),
                          const Text(
                            'Student Details',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
                          ),
                          const SizedBox(width: 48),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Center(
                        child: Column(
                          children: [
                            CircleAvatar(
                              radius: 40,
                              backgroundColor: isBoarded ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
                              child: Text(
                                _getInitials(studentName),
                                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              studentName,
                              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '$grade • $className',
                              style: const TextStyle(fontSize: 14, color: Color(0xFF94A3B8)),
                            ),
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: isBoarded ? Colors.green.withAlpha(26) : const Color(0xFFF1F5F9),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: isBoarded ? Colors.green : const Color(0xFFE2E8F0)),
                              ),
                              child: Text(
                                isBoarded ? 'ONBOARD • 07:12 AM' : 'PENDING',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isBoarded ? Colors.green : const Color(0xFF94A3B8),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: const Color(0xFFE2E8F0)),
                        ),
                        child: Column(
                          children: [
                            ListTile(
                              leading: const Icon(Icons.home, color: Color(0xFF10B981)),
                              title: const Text('Pickup Point', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                              subtitle: Text(pickupName, style: const TextStyle(fontSize: 14, color: Color(0xFF0B1C30), fontWeight: FontWeight.bold)),
                              trailing: const Icon(Icons.chevron_right, color: Color(0xFF64748B)),
                              onTap: () {},
                            ),
                            const Divider(height: 1, color: Color(0xFFE2E8F0)),
                            ListTile(
                              leading: const Icon(Icons.logout, color: Colors.orange),
                              title: const Text('Dropoff Point', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                              subtitle: Text(dropoffName, style: const TextStyle(fontSize: 14, color: Color(0xFF0B1C30), fontWeight: FontWeight.bold)),
                              trailing: const Icon(Icons.chevron_right, color: Color(0xFF64748B)),
                              onTap: () {},
                            ),
                            const Divider(height: 1, color: Color(0xFFE2E8F0)),
                            if (guardiansList.isEmpty)
                              const ListTile(
                                leading: Icon(Icons.phone, color: Color(0xFF64748B)),
                                title: Text('Parent / Guardian', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                                subtitle: Text('No parent / guardian registered', style: TextStyle(fontSize: 14, color: Color(0xFF0B1C30))),
                              )
                            else
                              ...guardiansList.map((guardian) {
                                final gName = guardian['name'] ?? 'Parent';
                                final gPhone = guardian['phone'] ?? 'N/A';
                                return Column(
                                  children: [
                                    ListTile(
                                      leading: const Icon(Icons.phone, color: Color(0xFF10B981)),
                                      title: Text('Parent / Guardian ($gName)', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                                      subtitle: Text(gPhone, style: const TextStyle(fontSize: 14, color: Color(0xFF0B1C30), fontWeight: FontWeight.bold)),
                                      trailing: IconButton(
                                        icon: const Icon(Icons.phone_in_talk, color: Color(0xFF10B981)),
                                        onPressed: () {
                                          _callGuardian(gPhone.toString());
                                        },
                                      ),
                                    ),
                                    const Divider(height: 1, color: Color(0xFFE2E8F0)),
                                  ],
                                );
                              }),
                            ListTile(
                              leading: const Icon(Icons.note_alt, color: Color(0xFF10B981)),
                              title: const Text('Notes', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                              subtitle: const Text('No notes', style: TextStyle(fontSize: 14, color: Color(0xFF0B1C30))),
                              trailing: const Icon(Icons.chevron_right, color: Color(0xFF64748B)),
                              onTap: () {},
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: canAct
                              ? const Color(0xFF10B981).withAlpha(26)
                              : Colors.orange.withAlpha(26),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: canAct ? const Color(0xFF10B981) : Colors.orange,
                          ),
                        ),
                        child: Text(
                          canAct
                              ? 'Unlocked at ${arrived?.name ?? "this stop"}.'
                              : arrived == null
                                  ? 'Arrive at this student\'s stop geofence to board or drop off.'
                                  : 'At ${arrived.name}. This student is assigned to a different stop.',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: canAct ? const Color(0xFF006B32) : Colors.orange.shade900,
                          ),
                        ),
                      ),
                      const Text(
                        'Trip Actions',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8), letterSpacing: 0.5),
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton.icon(
                        onPressed: canAct
                            ? () async {
                                final newStatus = isBoarded ? "Absent" : "Present";
                                await _updateStudentStatus(student, newStatus);
                                setPopupState(() {});
                              }
                            : null,
                        icon: Icon(isBoarded ? Icons.logout : Icons.login),
                        label: Text(
                          isBoarded
                              ? 'DROP OFF STUDENT'
                              : (_isPickupRun ? 'PICKUP STUDENT' : 'DROPOFF STUDENT'),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: isBoarded ? const Color(0xFF047857) : const Color(0xFF10B981),
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: const Color(0xFFE2E8F0),
                          minimumSize: const Size(double.infinity, 50),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () {},
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFF0B1C30),
                                side: const BorderSide(color: Color(0xFFE2E8F0)),
                                minimumSize: const Size(0, 50),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              child: const Text('MANUAL OVERRIDE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () {},
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFF0B1C30),
                                side: const BorderSide(color: Color(0xFFE2E8F0)),
                                minimumSize: const Size(0, 50),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              child: const Text('VIEW HISTORY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.report_problem, color: Colors.red),
                        label: const Text('REPORT AN ISSUE', style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red.withAlpha(26),
                          shadowColor: Colors.transparent,
                          minimumSize: const Size(double.infinity, 50),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildHeaderSection(BuildContext context) {
    final initials = _getInitials(_driverName);
    
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: Color(0xFF10B981), // Safaricom Green
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top + 16,
        left: 16,
        right: 16,
        bottom: 24,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Top Row: Title & Action Buttons
          Row(
            children: [
              Expanded(
                child: Text(
                  _schoolName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              // Sync Button
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: IconButton(
                  icon: const Icon(Icons.sync, color: Colors.white),
                  onPressed: () async {
                    await _checkActiveTripStatus();
                    await _fetchDriverTrips();
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Console and scheduled trips refreshed'),
                          duration: Duration(seconds: 1),
                        ),
                      );
                    }
                  },
                  tooltip: 'Sync service status',
                ),
              ),
              const SizedBox(width: 12),
              // Logout Button
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: IconButton(
                  icon: const Icon(Icons.logout, color: Colors.white),
                  onPressed: _handleSignOut,
                  tooltip: 'Sign Out',
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          // Nested Profile Container (Dark Green)
          Container(
            padding: const EdgeInsets.all(16.0),
            decoration: BoxDecoration(
              color: const Color(0xFF064E3B), // Dark green background matching design
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                // Initials Box
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: _driverRole.toLowerCase() == 'conductor'
                        ? Colors.blueGrey
                        : const Color(0xFF10B981), // Dynamic based on role
                    borderRadius: BorderRadius.circular(12),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    initials,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                // Driver Details
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _driverName,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.call, color: Colors.white70, size: 14),
                          const SizedBox(width: 4),
                          Text(
                            _driverPhone,
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                // Bus Assigned Container
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.white24, width: 1.5),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const Text(
                        'BUS ASSIGNED',
                        style: TextStyle(
                          color: Color(0xFF34D399), // Light green label
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _vehiclePlate,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHomeTab(bool isSos, bool isTripActive, String routeName, String tripName, TelemetryCoords? telemetry) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // SOS warning banner
        if (isSos) ...[
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.red.withAlpha(26),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.red, width: 2),
            ),
            child: const Row(
              children: [
                Icon(Icons.warning, color: Colors.red),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'CRITICAL WARNING: SOS Mode Active. Streaming coordinates.',
                    style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
        ],

        // Clock Sync warning banner
        if (_showClockWarning) ...[
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.orange.withAlpha(26),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.orange, width: 2),
            ),
            child: const Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: Colors.orange),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Your phone clock appears to be out of sync. Trip times are based on server time.',
                    style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
        ],

        // Trip Completed banner
        if (!isTripActive && _lastCompletedTrip != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: Colors.green.withAlpha(26),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.green, width: 1.5),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.green, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '✓ ${_lastCompletedTrip['route']?['name'] ?? 'Route'} - ${_lastCompletedTrip['schedule']?['name'] ?? 'Trip'} Completed',
                    style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
        ],

        // Loading state
        if (_isLoadingDriverTrips) ...[
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 40.0),
              child: CircularProgressIndicator(),
            ),
          ),
        ] else if (isTripActive && _activeTrip != null) ...[
          // TRIP IN PROGRESS (ACTIVE STATE)
          Container(
            padding: const EdgeInsets.all(20.0),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFFFF),
              borderRadius: const BorderRadius.all(Radius.circular(16)),
              border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      'TRIP IN PROGRESS',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Colors.green,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  '${_activeTrip['route']?['name'] ?? 'Active Route'}\n${_activeTrip['schedule']?['name'] ?? 'Active Trip'}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0B1C30),
                    height: 1.3
                  ),
                ),
                const SizedBox(height: 20),
                ElevatedButton.icon(
                  onPressed: () {
                    setState(() {
                      _currentTab = 1; // Switch to active trip tracking tab
                    });
                  },
                  icon: const Icon(Icons.map_outlined),
                  label: const Text('View Active Tracking Console', style: TextStyle(fontWeight: FontWeight.bold)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 50),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ],
            ),
          ),
          if (_selectedRouteId != null) ...[
            const SizedBox(height: 16),
            RouteMapWidget(
              routeId: _selectedRouteId!,
              liveLatitude: telemetry?.latitude,
              liveLongitude: telemetry?.longitude,
              vehiclePlate: _vehiclePlate,
              arrivedStopId: _arrivedStopFor(telemetry)?.id,
            ),
            const SizedBox(height: 12),
            _buildNextStopNavCard(telemetry),
          ],
        ] else if (_nextTrip != null) ...[
          // LIST OF SCHEDULED TRIPS (ACCORDION STYLE)
          const Text(
            'SCHEDULED TRIPS TODAY',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Color(0xFF64748B),
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 12),
          Builder(
            builder: (context) {
              final scheduledTrips = _driverTrips
                  .where((t) => t['status'] == 'scheduled')
                  .toList();

              return ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: scheduledTrips.length,
                separatorBuilder: (context, idx) => const SizedBox(height: 10),
                itemBuilder: (context, idx) {
                  final trip = scheduledTrips[idx];
                  final isSelected = trip['id'] == _selectedTripRunId;

                  if (isSelected) {
                    return _buildSelectedTripCard(trip);
                  } else {
                    return _buildCollapsedTripCard(trip);
                  }
                },
              );
            },
          ),
        ] else ...[
          // NO TRIPS SCHEDULED TODAY
          Container(
            padding: const EdgeInsets.all(24.0),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFFFF),
              borderRadius: const BorderRadius.all(Radius.circular(16)),
              border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.info_outline, size: 60, color: Color(0xFF10B981)),
                const SizedBox(height: 16),
                const Text(
                  'No Trips Scheduled Today',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
                ),
                const SizedBox(height: 8),
                const Text(
                  'You have no assigned route schedules for this bus today. Please contact your school administrator if this is an error.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8), height: 1.4),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Calling School Dispatch Administrator...')),
                    );
                  },
                  icon: const Icon(Icons.phone),
                  label: const Text('CONTACT ADMINISTRATOR', style: TextStyle(fontWeight: FontWeight.bold)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 50),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildTripTab(bool isTripActive, TelemetryCoords? telemetry) {
    final scheduleDuration = _activeTrip is Map
        ? (_activeTrip['estimated_duration'] as num?)?.toInt() ??
            (_activeTrip['schedule']?['estimated_duration'] as num?)?.toInt()
        : null;

    return TripScreen(
      isTripActive: isTripActive,
      vehiclePlate: _vehiclePlate,
      routeId: _selectedRouteId,
      runType: _selectedRunType,
      stops: _stopsList,
      students: _studentsList,
      stopOutcomes: Map<String, StopVisitOutcome>.from(_stopOutcomes),
      arrivedAt: _arrivedAt,
      lastArrivedStopId: _lastArrivedStopId,
      minStopDwellSeconds: _minStopDwellSeconds,
      scheduleDurationMinutes: scheduleDuration,
      telemetry: telemetry,
      onStopResolved: ({
        required stopId,
        required outcome,
        required dwellSeconds,
        required studentsActioned,
      }) {
        _recordStopVisit(
          stopId: stopId,
          outcome: outcome,
          dwellSeconds: dwellSeconds,
          studentsActioned: studentsActioned,
          arrivedAt: _arrivedAt,
        );
      },
      onUpdateStudentStatus: (student, status) => _updateStudentStatus(student, status),
      onViewStudents: () => setState(() => _currentTab = 2),
      onGoHome: () => setState(() => _currentTab = 0),
      onEndTrip: () async {
        if (_activeTrip != null) {
          await _handleEndTrip(_activeTrip['id']);
        } else {
          await _endTrip();
        }
      },
      onMapRefresh: () {
        if (_selectedRouteId != null && _selectedTripId != null) {
          _fetchTripDetails(_selectedRouteId!, _selectedTripId!);
        }
      },
      gpsReplayActive: _gpsReplayActive,
      gpsReplayLabel: _gpsReplayLabel,
      onToggleGpsReplay: kDebugMode ? _toggleGpsReplay : null,
    );
  }

  Widget _buildStudentsTab() {
    if (_selectedRouteId == null || _selectedTripId == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 60.0, horizontal: 24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.people_outline, size: 80, color: Color(0xFF64748B)),
              const SizedBox(height: 16),
              const Text(
                'No Route Selected',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
              ),
              const SizedBox(height: 8),
              const Text(
                'Please select a route and trip on the Home screen to view the students list.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: Color(0xFF94A3B8)),
              ),
            ],
          ),
        ),
      );
    }

    if (_isLoadingDetails) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 60.0),
          child: CircularProgressIndicator(),
        ),
      );
    }

    final telemetry = ref.watch(telemetryCoordsProvider);
    final arrived = _arrivedStopFor(telemetry);
    final tripGuardians = uniqueTripGuardians(_studentsList);
    final filteredStudents = _studentsList.whereType<Map>().where((student) {
      return studentMatchesQuery(Map<String, dynamic>.from(student), _studentsSearchQuery);
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          height: 48,
          decoration: BoxDecoration(
            color: const Color(0xFFFFFFFF),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
          ),
          child: TextField(
            controller: _studentsSearchController,
            style: const TextStyle(color: Color(0xFF0B1C30)),
            decoration: InputDecoration(
              hintText: 'Search students or guardians...',
              hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 14),
              prefixIcon: const Icon(Icons.search, color: Color(0xFF64748B)),
              suffixIcon: _studentsSearchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, color: Color(0xFF64748B)),
                      onPressed: () {
                        setState(() {
                          _studentsSearchController.clear();
                          _studentsSearchQuery = "";
                        });
                      },
                    )
                  : null,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
            ),
            onChanged: (val) {
              setState(() {
                _studentsSearchQuery = val;
              });
            },
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: arrived != null
                ? const Color(0xFF10B981).withAlpha(26)
                : Colors.orange.withAlpha(26),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: arrived != null ? const Color(0xFF10B981) : Colors.orange,
            ),
          ),
          child: Text(
            'Trip roster — all students and guardians. Boarded / Dropped off still requires the child’s stop geofence.',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: arrived != null ? const Color(0xFF006B32) : Colors.orange.shade900,
            ),
          ),
        ),
        const SizedBox(height: 16),

        Row(
          children: [
            const Icon(Icons.family_restroom, color: Color(0xFF10B981), size: 20),
            const SizedBox(width: 8),
            const Text(
              'GUARDIANS',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
            ),
            const Spacer(),
            Text(
              '${tripGuardians.length}',
              style: const TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (tripGuardians.isEmpty)
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
              'No guardians registered on this trip.',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
            ),
          )
        else
          ...tripGuardians.map(
            (g) => GuardianContactTile(
              contact: g,
              onCall: () => _callGuardian(g.phone),
            ),
          ),
        const SizedBox(height: 16),

        Row(
          children: [
            const Icon(Icons.people, color: Color(0xFF10B981), size: 20),
            const SizedBox(width: 8),
            Text(
              _isPickupRun ? 'PICKUP MANIFEST' : 'DROPOFF MANIFEST',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
            ),
            const Spacer(),
            Text(
              '${filteredStudents.length} of ${_studentsList.length}',
              style: const TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: 16),

        if (filteredStudents.isEmpty) ...[
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 40.0),
              child: Text(
                _studentsSearchQuery.isNotEmpty
                    ? 'No matching students or guardians.'
                    : 'No students on this trip.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 15),
              ),
            ),
          ),
        ] else ...[
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: filteredStudents.length,
            separatorBuilder: (context, index) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final student = Map<String, dynamic>.from(filteredStudents[index]);
              final String studentName = student['name'] ?? 'Unknown Student';
              final String grade = student['grade'] ?? 'N/A';
              final attendance = studentListAttendance(student, isPickup: _isPickupRun);
              final int studentIndex = index + 1;
              final studentGuardians = parseStudentGuardians(student['guardians']);
              final actioned = attendance == StudentListAttendance.actioned;

              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFFFF),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                  children: [
                    Text(
                      '$studentIndex',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: actioned ? const Color(0xFF10B981) : const Color(0xFF0B1C30),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: () => _showStudentDetailsPopup(student),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 20,
                              backgroundColor: actioned ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
                              child: Text(
                                _getInitials(studentName),
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    studentName,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF0B1C30),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    grade,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: Color(0xFF94A3B8),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (attendance == StudentListAttendance.pending)
                      ElevatedButton(
                        onPressed: () {
                          final allowed = studentAllowedAtStop(
                            student: student,
                            arrivedStopId: arrived?.id,
                            isBoardAction: _isPickupRun,
                          );
                          if (!allowed) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  _isPickupRun
                                      ? 'Arrive at this student\'s pickup stop to board.'
                                      : 'Arrive at this student\'s drop-off stop.',
                                ),
                                backgroundColor: Colors.red,
                              ),
                            );
                            return;
                          }
                          _updateStudentStatus(student, _isPickupRun ? 'Present' : 'Absent');
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF10B981),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          minimumSize: Size.zero,
                        ),
                        child: Text(
                          boardingActionLabel(isPickup: _isPickupRun),
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                      )
                    else
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: attendance == StudentListAttendance.absent
                              ? const Color(0xFFFEE2E2)
                              : Colors.green.withAlpha(26),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: attendance == StudentListAttendance.absent
                                ? const Color(0xFFFECACA)
                                : Colors.green,
                          ),
                        ),
                        child: Text(
                          attendance == StudentListAttendance.absent
                              ? 'Absent'
                              : boardingActionLabel(isPickup: _isPickupRun),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: attendance == StudentListAttendance.absent
                                ? const Color(0xFFB91C1C)
                                : Colors.green,
                          ),
                        ),
                      ),
                    const SizedBox(width: 4),
                    const Icon(
                      Icons.chevron_right,
                      color: Color(0xFF64748B),
                      size: 20,
                    ),
                  ],
                    ),
                    if (studentGuardians.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 10,
                        runSpacing: 8,
                        children: studentGuardians
                            .map(
                              (g) => InkWell(
                                onTap: () => _callGuardian(g.phone),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    GuardianPhotoThumbnail(
                                      name: g.name,
                                      photoUrl: g.photoUrl,
                                      radius: 14,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      g.name,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: Color(0xFF0B1C30),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildStopsTab() {
    if (_selectedRouteId == null || _selectedTripId == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 60.0, horizontal: 24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.alt_route, size: 80, color: Color(0xFF64748B)),
              const SizedBox(height: 16),
              const Text(
                'No Route Selected',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
              ),
              const SizedBox(height: 8),
              const Text(
                'Please select a route and trip on the Home screen to view stops sequence.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: Color(0xFF94A3B8)),
              ),
            ],
          ),
        ),
      );
    }

    if (_isLoadingDetails) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 60.0),
          child: CircularProgressIndicator(),
        ),
      );
    }

    if (_stopsList.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 60.0),
          child: Text(
            'No stops configured for this route.',
            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 15),
          ),
        ),
      );
    }

    final sortedStops = List<dynamic>.from(_stopsList)
      ..sort((a, b) => (a['sequence_no'] ?? 0).compareTo(b['sequence_no'] ?? 0));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Icon(Icons.format_list_bulleted, color: Color(0xFF10B981), size: 20),
            const SizedBox(width: 8),
            const Text(
              'STOPS SEQUENCE PREVIEW',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Color(0xFF94A3B8),
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: const Color(0xFFFFFFFF),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
          ),
          child: ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: sortedStops.length,
            itemBuilder: (context, index) {
              final stop = sortedStops[index];
              final String stopName = stop['name'] ?? 'Unnamed Stop';
              final int sequenceNo = stop['sequence_no'] ?? (index + 1);
              
              final stopId = stop['id'];
              final kidsCount = _studentsList.where((s) {
                if (_selectedRunType == "PICKUP") {
                  return s['pickup_stop_id'] == stopId;
                } else {
                  return s['dropoff_stop_id'] == stopId;
                }
              }).length;

              final isLast = index == sortedStops.length - 1;

              Color circleColor = const Color(0xFF94A3B8);
              if (index == 0) {
                circleColor = const Color(0xFF047857);
              } else if (isLast) {
                circleColor = const Color(0xFF0D9488);
              }

              return IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Column(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: circleColor,
                            shape: BoxShape.circle,
                            border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            '$sequenceNo',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                        ),
                        if (!isLast)
                          Expanded(
                            child: Container(
                              width: 2,
                              color: const Color(0xFFE2E8F0),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 24.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              stopName,
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '$kidsCount kids registered here · ${_isPickupRun ? "Pickup" : "Dropoff"}',
                              style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                            ),
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed: () => _navigateToStop(
                                  Map<String, dynamic>.from(stop as Map),
                                ),
                                icon: const Icon(Icons.directions, size: 18),
                                label: const Text(
                                  'Navigate',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                                ),
                                style: TextButton.styleFrom(
                                  foregroundColor: const Color(0xFF0B1C30),
                                  padding: EdgeInsets.zero,
                                  minimumSize: Size.zero,
                                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildTabBody(bool isSos, bool isTripActive, String routeName, String tripName, TelemetryCoords? telemetry) {
    switch (_currentTab) {
      case 0:
        return _buildHomeTab(isSos, isTripActive, routeName, tripName, telemetry);
      case 1:
        return _buildTripTab(isTripActive, telemetry);
      case 2:
        return _buildStudentsTab();
      case 3:
        return _buildStopsTab();
      default:
        return _buildHomeTab(isSos, isTripActive, routeName, tripName, telemetry);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTripActive = ref.watch(tripActiveProvider);
    final isSos = ref.watch(emergencyActiveProvider);
    final telemetry = ref.watch(telemetryCoordsProvider);

    String routeName = 'Active Route';
    String tripName = 'Active Trip';

    if (isTripActive && _activeTrip != null) {
      routeName = _activeTrip['route']?['name'] ?? 'Active Route';
      tripName = _activeTrip['schedule']?['name'] ?? 'Active Trip';
    } else if (_nextTrip != null) {
      routeName = _nextTrip['route']?['name'] ?? 'Scheduled Route';
      tripName = _nextTrip['schedule']?['name'] ?? 'Scheduled Trip';
    }

    final hideSchoolHeader = _currentTab == 1 && isTripActive;
    final tripImmersive = hideSchoolHeader;

    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FF),
      appBar: hideSchoolHeader
          ? AppBar(
              title: Text(tripName.isNotEmpty ? tripName : routeName),
              automaticallyImplyLeading: false,
              actions: const [TripSosAction()],
            )
          : null,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!hideSchoolHeader) _buildHeaderSection(context),

          Expanded(
            child: tripImmersive
                ? _buildTripTab(isTripActive, telemetry)
                : SingleChildScrollView(
                    padding: const EdgeInsets.all(16.0),
                    child: _buildTabBody(isSos, isTripActive, routeName, tripName, telemetry),
                  ),
          ),
        ],
      ),
      bottomNavigationBar: Theme(
        data: Theme.of(context).copyWith(
          canvasColor: const Color(0xFFFFFFFF),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentTab,
          onTap: (index) {
            setState(() {
              _currentTab = index;
            });
          },
          selectedItemColor: const Color(0xFF10B981),
          unselectedItemColor: const Color(0xFF64748B),
          backgroundColor: const Color(0xFFFFFFFF),
          elevation: 8,
          type: BottomNavigationBarType.fixed,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.home),
              label: 'Home',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.local_shipping),
              label: 'Trip',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.people),
              label: 'Students',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.alt_route),
              label: 'Stops',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSelectedTripCard(dynamic trip) {
    final schedule = trip['schedule'] ?? {};
    final route = trip['route'] ?? {};
    final departureTime = schedule['departure_time']?.toString().substring(0, 5) ?? '00:00';
    final direction = schedule['direction'] ?? 'HOME_TO_SCHOOL';
    final isPickup = direction == 'HOME_TO_SCHOOL';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFFFF),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF10B981), width: 2.0),
        boxShadow: [
          BoxShadow(color: const Color(0xFF10B981).withAlpha(30), blurRadius: 10, spreadRadius: 1)
        ]
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  route['name'] ?? 'Route',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: isPickup ? const Color(0xFF047857) : const Color(0xFFB45309),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  isPickup ? 'Pickup' : 'Dropoff',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.access_time_filled, color: Color(0xFF10B981), size: 16),
              const SizedBox(width: 6),
              Text(
                'Depart $departureTime',
                style: const TextStyle(fontSize: 14, color: Color(0xFF006B32), fontWeight: FontWeight.w600),
              ),
              const SizedBox(width: 16),
              const Icon(Icons.calendar_month, color: Color(0xFF10B981), size: 16),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  schedule['name'] ?? 'Trip Run',
                  style: const TextStyle(fontSize: 14, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        '${trip['students_count'] ?? 0}',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'STUDENTS',
                        style: TextStyle(fontSize: 9, color: Color(0xFF64748B), fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        '${trip['stops_count'] ?? 0}',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'STOPS',
                        style: TextStyle(fontSize: 9, color: Color(0xFF64748B), fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        '${trip['estimated_duration'] ?? 0}m',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'EST. TIME',
                        style: TextStyle(fontSize: 9, color: Color(0xFF64748B), fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          if (_countdownText.isNotEmpty) ...[
            const SizedBox(height: 16),
            Center(
              child: Text(
                _countdownText,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFB45309),
                ),
              ),
            ),
          ],
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (context) => StudentSelectionScreen(
                    routeId: route['id'],
                    tenantId: _tenantController.text.trim(),
                    tripId: schedule['id'],
                    stops: _stopsList,
                    runType: isPickup ? 'PICKUP' : 'DROPOFF',
                  ),
                ),
              );
            },
            icon: Icon(isPickup ? Icons.login : Icons.logout, size: 24),
            label: Text(
              isPickup ? 'PICKUP STUDENTS' : 'DROPOFF STUDENTS',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF1F5F9),
              foregroundColor: const Color(0xFF0B1C30),
              side: const BorderSide(color: Color(0xFFE2E8F0), width: 1.5),
              minimumSize: const Size(double.infinity, 54),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 10),
          ElevatedButton.icon(
            onPressed: () => _handleStartTrip(trip['id'], route['id'], schedule['id']),
            icon: const Icon(Icons.play_arrow, size: 24),
            label: const Text('START TRIP', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
              minimumSize: const Size(double.infinity, 54),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              elevation: 2,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCollapsedTripCard(dynamic trip) {
    final schedule = trip['schedule'] ?? {};
    final route = trip['route'] ?? {};
    final departureTime = schedule['departure_time']?.toString().substring(0, 5) ?? '00:00';
    final direction = schedule['direction'] ?? 'HOME_TO_SCHOOL';
    final isPickup = direction == 'HOME_TO_SCHOOL';

    return InkWell(
      onTap: () {
        setState(() {
          _selectedTripRunId = trip['id'];
          _processTripStates();
        });
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFFFF),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: isPickup ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    route['name'] ?? 'Route',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0B1C30)),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '$departureTime • ${schedule['name'] ?? 'Trip'} • ${trip['students_count'] ?? 0} students',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: isPickup ? const Color(0xFF047857).withAlpha(40) : const Color(0xFFB45309).withAlpha(40),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                isPickup ? 'AM' : 'PM',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: isPickup ? const Color(0xFF006B32) : const Color(0xFFF59E0B)
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
