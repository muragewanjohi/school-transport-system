import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:driver_app/services/supabase_service.dart';
import 'package:driver_app/services/location_service.dart';
import 'package:driver_app/screens/login_screen.dart';
import 'package:driver_app/screens/student_selection_screen.dart';
import 'package:http/http.dart' as http;

// Riverpod provider for managing active trip state
final tripActiveProvider = StateProvider<bool>((ref) => false);

// Riverpod provider for tracking emergency SOS status
final emergencyActiveProvider = StateProvider<bool>((ref) => false);

// Riverpod provider for storing the latest received telemetry coordinates
class TelemetryCoords {
  final double latitude;
  final double longitude;
  final double speed;
  final double bearing;
  final String timestamp;

  TelemetryCoords({
    required this.latitude,
    required this.longitude,
    required this.speed,
    required this.bearing,
    required this.timestamp,
  });
}

final telemetryCoordsProvider = StateProvider<TelemetryCoords?>((ref) => null);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Supabase client
  await Supabase.initialize(
    url: SupabaseService.url,
    publishableKey: SupabaseService.anonKey,
  );

  // Initialize the location background service setup
  await LocationTrackingService.initializeBackgroundService();

  // Check login state to determine initial screen
  final prefs = await SharedPreferences.getInstance();
  final isLoggedIn = prefs.getBool('is_logged_in') ?? false;

  runApp(
    // Wrap application in ProviderScope to enable Riverpod state management
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
      title: 'Safaricom Track Driver Console',
      debugShowCheckedModeBanner: false,
      // Daylight-optimized contrast theme (bright backgrounds, bold styling)
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF10B981), // Safaricom Green
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: Colors.white,
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

  String _driverName = "";
  String _driverPhone = "";
  String _driverRole = "driver";
  StreamSubscription? _telemetrySub;

  // Route and Trip selection states
  List<dynamic> _routes = [];
  List<dynamic> _trips = [];
  String? _selectedRouteId;
  String? _selectedTripId;
  bool _isLoadingRoutes = false;
  bool _isLoadingTrips = false;

  int _stopsCount = 0;
  int _studentsCount = 0;
  int _estimatedDuration = 0;
  bool _isLoadingDetails = false;
  String _selectedRunType = "PICKUP"; // "PICKUP" or "DROPOFF"

  @override
  void initState() {
    super.initState();
    _loadSessionDetails();
    _checkActiveTripStatus();
    _listenToBackgroundTelemetry();
  }

  @override
  void dispose() {
    _telemetrySub?.cancel();
    _tenantController.dispose();
    _vehicleController.dispose();
    _routeController.dispose();
    super.dispose();
  }

  // Get the base API URL mapping localhost correctly for Android emulator and iOS simulator
  String _getApiBaseUrl() {
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:3000';
      }
    } catch (_) {}
    return 'http://localhost:3000';
  }

  /// Load authenticated driver details from SharedPreferences
  Future<void> _loadSessionDetails() async {
    final prefs = await SharedPreferences.getInstance();
    final savedRouteId = prefs.getString('route_id') ?? '';
    final savedTripId = prefs.getString('trip_id') ?? '';
    final savedRunType = prefs.getString('run_type') ?? 'PICKUP';
    setState(() {
      _driverName = prefs.getString('driver_name') ?? "Unknown Driver";
      _driverPhone = prefs.getString('driver_phone') ?? "";
      _driverRole = prefs.getString('driver_role') ?? "driver";
      _tenantController.text = prefs.getString('tenant_id') ?? '8c9ad841-f762-4217-a021-9876251b5bcf';
      _vehicleController.text = prefs.getString('vehicle_id') ?? 'e5015e10-c09a-4c22-901d-5573752e379c';
      _routeController.text = savedRouteId;
      _selectedRouteId = savedRouteId.isNotEmpty ? savedRouteId : null;
      _selectedTripId = savedTripId.isNotEmpty ? savedTripId : null;
      _selectedRunType = savedRunType;
    });

    // Fetch all routes
    await _fetchRoutes();

    // Fetch trips for initial route if we have one
    if (_selectedRouteId != null && _selectedRouteId!.isNotEmpty) {
      await _fetchTrips(_selectedRouteId!);
      if (_selectedTripId != null && _selectedTripId!.isNotEmpty) {
        _fetchTripDetails(_selectedRouteId!, _selectedTripId!);
      }
    }
  }

  Future<void> _fetchRoutes() async {
    if (!mounted) return;
    setState(() => _isLoadingRoutes = true);
    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.get(
        Uri.parse('$baseUrl/api/routes'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          final fetchedRoutes = result['data'] as List<dynamic>;
          setState(() {
            _routes = fetchedRoutes;
            // Validate if selected route ID is in the fetched list
            final routeExists = fetchedRoutes.any((r) => r['id'] == _selectedRouteId);
            if (!routeExists) {
              _selectedRouteId = null;
              _selectedTripId = null;
              _trips = [];
            }
          });
        }
      }
    } catch (e) {
      debugPrint("Error fetching routes: $e");
    } finally {
      if (mounted) {
        setState(() => _isLoadingRoutes = false);
      }
    }
  }

  Future<void> _fetchTrips(String routeId) async {
    if (!mounted) return;
    setState(() => _isLoadingTrips = true);
    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.get(
        Uri.parse('$baseUrl/api/schedules?route_id=$routeId'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          final fetchedTrips = result['data'] as List<dynamic>;
          setState(() {
            _trips = fetchedTrips;
            // Validate if selected trip ID is in the fetched list
            final tripExists = fetchedTrips.any((t) => t['id'] == _selectedTripId);
            if (!tripExists) {
              _selectedTripId = null;
            }
          });
          if (_selectedRouteId != null && _selectedTripId != null) {
            _fetchTripDetails(_selectedRouteId!, _selectedTripId!);
          }
        }
      }
    } catch (e) {
      debugPrint("Error fetching trips: $e");
    } finally {
      if (mounted) {
        setState(() => _isLoadingTrips = false);
      }
    }
  }

  Future<void> _fetchTripDetails(String routeId, String tripId) async {
    if (!mounted) return;
    setState(() {
      _isLoadingDetails = true;
      _stopsCount = 0;
      _studentsCount = 0;
      _estimatedDuration = 0;
    });

    try {
      final baseUrl = _getApiBaseUrl();

      // 1. Fetch stops count
      final stopsResponse = await http.get(
        Uri.parse('$baseUrl/api/stops?route_id=$routeId'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 8));

      int stopsCount = 0;
      if (stopsResponse.statusCode == 200) {
        final stopsResult = json.decode(stopsResponse.body);
        if (stopsResult['success'] == true && stopsResult['data'] != null) {
          stopsCount = (stopsResult['data'] as List<dynamic>).length;
        }
      }

      // 2. Fetch students count
      final studentsResponse = await http.get(
        Uri.parse('$baseUrl/api/students'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 8));

      int studentsCount = 0;
      if (studentsResponse.statusCode == 200) {
        final studentsResult = json.decode(studentsResponse.body);
        if (studentsResult['success'] == true && studentsResult['data'] != null) {
          final allStudents = studentsResult['data'] as List<dynamic>;
          
          studentsCount = allStudents.where((student) {
            final String studentRouteId = student['route_id'] ?? '';
            if (studentRouteId != routeId) return false;

            final dynamic scheduleIds = student['schedule_ids'];
            if (scheduleIds is List) {
              return scheduleIds.contains(tripId);
            }
            return false;
          }).length;
        }
      }

      if (mounted) {
        setState(() {
          _stopsCount = stopsCount;
          _studentsCount = studentsCount;
          _estimatedDuration = (stopsCount * 4) + 15 + studentsCount;
          _isLoadingDetails = false;
        });
      }
    } catch (e) {
      debugPrint("Error fetching trip details: $e");
      if (mounted) {
        setState(() => _isLoadingDetails = false);
      }
    }
  }

  /// Sync local UI state with the background service's running status
  Future<void> _checkActiveTripStatus() async {
    final service = FlutterBackgroundService();
    final isRunning = await service.isRunning();
    if (mounted) {
      ref.read(tripActiveProvider.notifier).state = isRunning;
    }
  }

  /// Register background event listener to receive coordinate streams
  void _listenToBackgroundTelemetry() {
    final service = FlutterBackgroundService();
    
    _telemetrySub = service.on('telemetryUpdate').listen((event) {
      if (event != null && mounted) {
        final coords = TelemetryCoords(
          latitude: event['latitude'] as double,
          longitude: event['longitude'] as double,
          speed: event['speed'] as double,
          bearing: event['bearing'] as double,
          timestamp: event['timestamp'] as String,
        );
        ref.read(telemetryCoordsProvider.notifier).state = coords;
      }
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

    // 3. Dispatch active trip configuration IDs to background worker
    service.invoke('updateConfig', {
      'tenantId': _tenantController.text.trim(),
      'vehicleId': _vehicleController.text.trim(),
      'routeId': _routeController.text.trim(),
    });

    ref.read(tripActiveProvider.notifier).state = true;
  }

  /// Shutdown background tracking service
  Future<void> _endTrip() async {
    final service = FlutterBackgroundService();
    service.invoke('stopService');
    
    if (mounted) {
      ref.read(tripActiveProvider.notifier).state = false;
      ref.read(emergencyActiveProvider.notifier).state = false;
      ref.read(telemetryCoordsProvider.notifier).state = null;
    }
  }

  /// Trigger or clear Emergency SOS Status
  void _toggleSOS() {
    final isSos = ref.read(emergencyActiveProvider);
    final service = FlutterBackgroundService();
    
    // Toggle state
    ref.read(emergencyActiveProvider.notifier).state = !isSos;
    
    // Notify background isolate to append emergency flag to Supabase logs
    service.invoke('toggleSOS', {'isEmergency': !isSos});

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          !isSos 
            ? 'EMERGENCY SOS INITIATED: Telemetry flagged. Dispatching alerts.'
            : 'SOS Cleared. Operations returning to normal.',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: !isSos ? Colors.red : Colors.green,
        duration: const Duration(seconds: 4),
      ),
    );
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

  @override
  Widget build(BuildContext context) {
    final isTripActive = ref.watch(tripActiveProvider);
    final isSos = ref.watch(emergencyActiveProvider);
    final telemetry = ref.watch(telemetryCoordsProvider);

    final activeRoute = _routes.firstWhere(
      (r) => r['id'] == _selectedRouteId,
      orElse: () => null,
    );
    final activeTrip = _trips.firstWhere(
      (t) => t['id'] == _selectedTripId,
      orElse: () => null,
    );
    final routeName = activeRoute != null ? activeRoute['name'] as String : 'Active Route';
    final tripName = activeTrip != null ? activeTrip['name'] as String : 'Active Trip';

    return Scaffold(
      appBar: AppBar(
        title: Text(
          isTripActive ? 'Active Route Console' : 'Safaricom Track Console',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            onPressed: _checkActiveTripStatus,
            tooltip: 'Sync service status',
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _handleSignOut,
            tooltip: 'Sign Out',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Driver/Conductor Profile Header
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    backgroundColor: _driverRole.toLowerCase() == 'conductor'
                        ? Colors.blueGrey
                        : const Color(0xFF10B981),
                    child: Icon(
                      _driverRole.toLowerCase() == 'conductor' ? Icons.badge : Icons.person,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _driverName,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF1E293B)),
                      ),
                      Text(
                        '${_driverRole.isNotEmpty ? _driverRole[0].toUpperCase() + _driverRole.substring(1) : "Driver"} • $_driverPhone',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Emergency SOS Flashing Banner (if active)
            if (isSos)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.red.shade100,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red, width: 2),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.warning, color: Colors.red),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'CRITICAL WARNING: SOS Mode Active. High-priority coordinates are being streamed.',
                        style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),



            // Status Indicator Header Panel (shown only when trip is active)
            if (isTripActive) ...[
              Container(
                padding: const EdgeInsets.all(20.0),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: const BorderRadius.all(Radius.circular(12)),
                  border: Border.all(
                    color: isSos ? Colors.red : const Color(0xFFE2E8F0), 
                    width: isSos ? 2.0 : 1.5
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 14,
                          height: 14,
                          decoration: BoxDecoration(
                            color: Colors.green,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: Colors.green.withAlpha(128),
                                blurRadius: 8,
                                spreadRadius: 2,
                              )
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'TRACKING TELEMETRY ACTIVE',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.green,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '$routeName\n$tripName',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.blueGrey,
                        height: 1.3
                      ),
                    ),
                    if (telemetry != null) ...[
                      const Divider(height: 24, color: Color(0xFFE2E8F0)),
                      Text(
                        'Lat: ${telemetry.latitude.toStringAsFixed(6)}',
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                      ),
                      Text(
                        'Lng: ${telemetry.longitude.toStringAsFixed(6)}',
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          Text(
                            'Speed: ${(telemetry.speed * 3.6).toStringAsFixed(1)} km/h',
                            style: const TextStyle(fontSize: 14, color: Colors.blueGrey, fontWeight: FontWeight.w600),
                          ),
                          Text(
                            'Bearing: ${telemetry.bearing.toStringAsFixed(0)}°',
                            style: const TextStyle(fontSize: 14, color: Colors.blueGrey, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Last Sync: ${telemetry.timestamp.split('T').last.substring(0, 8)}',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ] else ...[
                      const SizedBox(height: 8),
                      const Text(
                        'Waiting for GPS coordinates...',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: Colors.grey),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            if (!isTripActive) ...[
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8.0),
                child: Text(
                  'SELECT ASSIGNED ROUTE',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.blueGrey,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              const SizedBox(height: 8),

              // Route Dropdown
              _isLoadingRoutes
                  ? const Center(child: Padding(padding: EdgeInsets.all(16.0), child: CircularProgressIndicator()))
                  : DropdownButtonFormField<String>(
                      initialValue: _routes.any((route) => route['id'] == _selectedRouteId) ? _selectedRouteId : null,
                      hint: const Text('Select a Route'),
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        fillColor: Color(0xFFF8FAFC),
                        filled: true,
                      ),
                      isExpanded: true,
                      items: _routes.map<DropdownMenuItem<String>>((route) {
                        return DropdownMenuItem<String>(
                          value: route['id'] as String,
                          child: Text(route['name'] ?? 'Unnamed Route'),
                        );
                      }).toList(),
                      onChanged: (val) {
                        if (val == null) return;
                        setState(() {
                          _selectedRouteId = val;
                          _routeController.text = val;
                          _selectedTripId = null;
                          _trips = [];
                          _stopsCount = 0;
                          _studentsCount = 0;
                          _estimatedDuration = 0;
                        });
                        SharedPreferences.getInstance().then((prefs) {
                          prefs.setString('route_id', val);
                          prefs.remove('trip_id');
                        });
                        _fetchTrips(val);
                      },
                    ),
              const SizedBox(height: 20),

              if (_selectedRouteId != null) ...[
                const Text(
                  'TRIP RUN TYPE',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.blueGrey,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 8),

                // Pick Up / Drop Off Toggle Row
                Row(
                  children: [
                    // Pick Up Run Toggle Button
                    Expanded(
                      child: GestureDetector(
                        onTap: () {
                          setState(() {
                            _selectedRunType = "PICKUP";
                            _selectedTripId = null;
                            _stopsCount = 0;
                            _studentsCount = 0;
                            _estimatedDuration = 0;
                          });
                          SharedPreferences.getInstance().then((prefs) {
                            prefs.setString('run_type', 'PICKUP');
                            prefs.remove('trip_id');
                          });
                        },
                        child: Container(
                          height: 50,
                          decoration: BoxDecoration(
                            color: _selectedRunType == "PICKUP"
                                ? const Color(0xFF10B981) // Safaricom Green
                                : const Color(0xFFF1F5F9), // Light Grey
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: _selectedRunType == "PICKUP"
                                  ? const Color(0xFF047857)
                                  : const Color(0xFFE2E8F0),
                              width: 1.5,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.login,
                                color: _selectedRunType == "PICKUP" ? Colors.white : Colors.blueGrey,
                                size: 20,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Pick Up',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: _selectedRunType == "PICKUP" ? Colors.white : Colors.blueGrey,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Drop Off Run Toggle Button
                    Expanded(
                      child: GestureDetector(
                        onTap: () {
                          setState(() {
                            _selectedRunType = "DROPOFF";
                            _selectedTripId = null;
                            _stopsCount = 0;
                            _studentsCount = 0;
                            _estimatedDuration = 0;
                          });
                          SharedPreferences.getInstance().then((prefs) {
                            prefs.setString('run_type', 'DROPOFF');
                            prefs.remove('trip_id');
                          });
                        },
                        child: Container(
                          height: 50,
                          decoration: BoxDecoration(
                            color: _selectedRunType == "DROPOFF"
                                ? const Color(0xFF10B981) // Safaricom Green
                                : const Color(0xFFF1F5F9),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: _selectedRunType == "DROPOFF"
                                  ? const Color(0xFF047857)
                                  : const Color(0xFFE2E8F0),
                              width: 1.5,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.logout,
                                color: _selectedRunType == "DROPOFF" ? Colors.white : Colors.blueGrey,
                                size: 20,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Drop Off',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: _selectedRunType == "DROPOFF" ? Colors.white : Colors.blueGrey,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                const Text(
                  'SELECT TRIP RUN',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.blueGrey,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 8),

                // Filtered Trip Dropdown
                Builder(
                  builder: (context) {
                    final filteredTrips = _trips.where((trip) {
                      final direction = trip['direction'] ?? '';
                      if (_selectedRunType == "PICKUP") {
                        return direction == 'HOME_TO_SCHOOL';
                      } else {
                        return direction == 'SCHOOL_TO_HOME';
                      }
                    }).toList();

                    return _isLoadingTrips
                        ? const Center(child: Padding(padding: EdgeInsets.all(12.0), child: CircularProgressIndicator()))
                        : DropdownButtonFormField<String>(
                            initialValue: filteredTrips.any((t) => t['id'] == _selectedTripId) ? _selectedTripId : null,
                            hint: Text(filteredTrips.isEmpty
                                ? 'No ${_selectedRunType == "PICKUP" ? "Pick Up" : "Drop Off"} Trips Configured'
                                : 'Select a Trip'),
                            decoration: const InputDecoration(
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                              fillColor: Color(0xFFF8FAFC),
                              filled: true,
                            ),
                            isExpanded: true,
                            items: filteredTrips.map<DropdownMenuItem<String>>((trip) {
                              return DropdownMenuItem<String>(
                                value: trip['id'] as String,
                                child: Text('${trip['name'] ?? 'Trip'} (${trip['departure_time']?.toString().substring(0, 5) ?? ''})'),
                              );
                            }).toList(),
                            onChanged: filteredTrips.isEmpty ? null : (val) {
                              if (val == null) return;
                              setState(() {
                                _selectedTripId = val;
                              });
                              SharedPreferences.getInstance().then((prefs) {
                                prefs.setString('trip_id', val);
                              });
                              _fetchTripDetails(_selectedRouteId!, val);
                            },
                          );
                  },
                ),
                const SizedBox(height: 20),
              ],

              if (_selectedRouteId != null && _selectedTripId != null) ...[
                _isLoadingDetails
                    ? const Center(
                        child: Padding(
                          padding: EdgeInsets.symmetric(vertical: 24.0),
                          child: CircularProgressIndicator(),
                        ),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              // Scheduled Card
                              Expanded(
                                child: Container(
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: const Color(0xFFE2E8F0)),
                                    boxShadow: const [
                                      BoxShadow(
                                        color: Colors.black12,
                                        blurRadius: 4,
                                        offset: Offset(0, 2),
                                      )
                                    ],
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Row(
                                        children: [
                                          Icon(Icons.people_outline, color: Colors.blueGrey, size: 20),
                                          SizedBox(width: 8),
                                          Text(
                                            'Scheduled',
                                            style: TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w500),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        '$_studentsCount Students',
                                        style: const TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF1E293B),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              // Total Stops Card
                              Expanded(
                                child: Container(
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: const Color(0xFFE2E8F0)),
                                    boxShadow: const [
                                      BoxShadow(
                                        color: Colors.black12,
                                        blurRadius: 4,
                                        offset: Offset(0, 2),
                                      )
                                    ],
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Row(
                                        children: [
                                          Icon(Icons.location_on_outlined, color: Colors.blueGrey, size: 20),
                                          SizedBox(width: 8),
                                          Text(
                                            'Total Stops',
                                            style: TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w500),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        '$_stopsCount Stops',
                                        style: const TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF1E293B),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          // Estimated Time Card
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                              boxShadow: const [
                                BoxShadow(
                                  color: Colors.black12,
                                  blurRadius: 4,
                                  offset: Offset(0, 2),
                                )
                              ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Row(
                                  children: [
                                    Icon(Icons.access_time, color: Colors.blueGrey, size: 20),
                                    SizedBox(width: 8),
                                    Text(
                                      'Estimated Time',
                                      style: TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w500),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  '$_estimatedDuration mins',
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF1E293B),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),
                          // Big Start Trip Button
                          ElevatedButton.icon(
                            onPressed: _startTrip,
                            icon: const Icon(Icons.play_arrow, size: 28),
                            label: const Text('START TRIP', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF10B981), // Safaricom Green
                              foregroundColor: Colors.white,
                              minimumSize: const Size(double.infinity, 64),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              elevation: 4,
                            ),
                          ),
                        ],
                      ),
              ],
            ] else ...[
              Row(
                children: [
                  // End Trip Button
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _endTrip,
                      icon: const Icon(Icons.stop, size: 28),
                      label: const Text('END', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        minimumSize: const Size(double.infinity, 64),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Emergency SOS Button (Requires Long Press for safety)
                  Expanded(
                    flex: 3,
                    child: GestureDetector(
                      onLongPress: _toggleSOS,
                      child: Container(
                        height: 64,
                        decoration: BoxDecoration(
                          color: isSos ? Colors.orange : Colors.red.shade900,
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: const [
                            BoxShadow(
                              color: Colors.black12,
                              blurRadius: 4,
                              offset: Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.emergency, color: Colors.white, size: 28),
                            const SizedBox(width: 8),
                            Text(
                              isSos ? 'CLEAR SOS' : 'HOLD FOR SOS',
                              style: const TextStyle(
                                color: Colors.white, 
                                fontSize: 18, 
                                fontWeight: FontWeight.bold
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
            
            // Manifest removed from main view (routed to FAB + dedicated screen)

            const SizedBox(height: 24),
          ],
        ),
      ),
      floatingActionButton: (isTripActive && _selectedRouteId != null)
          ? FloatingActionButton.extended(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (context) => StudentSelectionScreen(
                      routeId: _selectedRouteId!,
                      tenantId: _tenantController.text.trim(),
                      tripId: _selectedTripId ?? '',
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.people),
              label: const Text('Board Students'),
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
            )
          : null,
    );
  }
}
