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
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

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

  // Initialize Firebase
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

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
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF10B981), // Safaricom Green
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0A0E1A), // Dark Navy
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
  String _schoolName = "Safaricom Track Console";
  StreamSubscription? _telemetrySub;

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
    _countdownTimer?.cancel();
    _tenantController.dispose();
    _vehicleController.dispose();
    _routeController.dispose();
    _studentsSearchController.dispose();
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
    setState(() {
      _driverId = prefs.getString('driver_id') ?? '';
      _driverName = prefs.getString('driver_name') ?? "Unknown Driver";
      _driverPhone = prefs.getString('driver_phone') ?? "";
      _driverRole = prefs.getString('driver_role') ?? "driver";
      _tenantController.text = prefs.getString('tenant_id') ?? '8c9ad841-f762-4217-a021-9876251b5bcf';
      _vehicleController.text = prefs.getString('vehicle_id') ?? 'e5015e10-c09a-4c22-901d-5573752e379c';
      _vehiclePlate = prefs.getString('vehicle_plate') ?? 'KBC 123X';
      _schoolName = prefs.getString('school_name') ?? 'Safaricom Track Console';
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
        headers: {'Content-Type': 'application/json'},
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
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          final config = result['data'];
          if (config['school_name'] != null && config['school_name'].toString().isNotEmpty) {
            setState(() {
              _schoolName = config['school_name'];
            });
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
        headers: {'Content-Type': 'application/json'},
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
        headers: {'Content-Type': 'application/json'},
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
        headers: {'Content-Type': 'application/json'},
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
        headers: {'Content-Type': 'application/json'},
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
        headers: {'Content-Type': 'application/json'},
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

    // Save trip started state in SharedPreferences
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('is_trip_started', true);

    // 3. Dispatch active trip configuration IDs to background worker
    service.invoke('updateConfig', {
      'tenantId': _tenantController.text.trim(),
      'vehicleId': _vehicleController.text.trim(),
      'routeId': _routeController.text.trim(),
    });

    ref.read(tripActiveProvider.notifier).state = true;
    setState(() {
      _currentTab = 1; // Switch to active trip tracking tab
    });
  }

  /// Shutdown background tracking service
  Future<void> _endTrip() async {
    final service = FlutterBackgroundService();
    service.invoke('stopService');
    
    // Save trip started state in SharedPreferences
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('is_trip_started', false);
    
    if (mounted) {
      ref.read(tripActiveProvider.notifier).state = false;
      ref.read(emergencyActiveProvider.notifier).state = false;
      ref.read(telemetryCoordsProvider.notifier).state = null;
      setState(() {
        _currentTab = 0; // Switch back to Home tab
      });
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

  Future<void> _updateStudentStatus(dynamic student, String newStatus) async {
    final studentId = student['id'];
    final oldStatus = student['status'];
    setState(() {
      student['status'] = newStatus;
      final idx = _studentsList.indexWhere((s) => s['id'] == studentId);
      if (idx != -1) {
        _studentsList[idx]['status'] = newStatus;
      }
    });

    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.put(
        Uri.parse('$baseUrl/api/students/$studentId'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'status': newStatus}),
      ).timeout(const Duration(seconds: 8));

      final result = json.decode(response.body);
      if (response.statusCode != 200 || result['success'] != true) {
        setState(() {
          student['status'] = oldStatus;
          final idx = _studentsList.indexWhere((s) => s['id'] == studentId);
          if (idx != -1) {
            _studentsList[idx]['status'] = oldStatus;
          }
        });
      }
    } catch (e) {
      debugPrint("Error updating student status: $e");
      setState(() {
        student['status'] = oldStatus;
        final idx = _studentsList.indexWhere((s) => s['id'] == studentId);
        if (idx != -1) {
          _studentsList[idx]['status'] = oldStatus;
        }
      });
    }
  }

  void _simulateCall(String guardianName, String phone) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.phone_in_talk, color: Colors.white),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Calling $guardianName at $phone...',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF10B981),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  void _showStudentDetailsPopup(dynamic student) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF151C2C),
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
                            icon: const Icon(Icons.close, color: Colors.white),
                            onPressed: () => Navigator.pop(context),
                          ),
                          const Text(
                            'Student Details',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
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
                              backgroundColor: isBoarded ? const Color(0xFF10B981) : const Color(0xFF334155),
                              child: Text(
                                _getInitials(studentName),
                                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              studentName,
                              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
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
                                color: isBoarded ? Colors.green.withAlpha(26) : Colors.white.withAlpha(13),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: isBoarded ? Colors.green : Colors.white24),
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
                          color: const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: const Color(0xFF223049)),
                        ),
                        child: Column(
                          children: [
                            ListTile(
                              leading: const Icon(Icons.home, color: Color(0xFF10B981)),
                              title: const Text('Pickup Point', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                              subtitle: Text(pickupName, style: const TextStyle(fontSize: 14, color: Colors.white, fontWeight: FontWeight.bold)),
                              trailing: const Icon(Icons.chevron_right, color: Color(0xFF64748B)),
                              onTap: () {},
                            ),
                            const Divider(height: 1, color: Color(0xFF223049)),
                            ListTile(
                              leading: const Icon(Icons.logout, color: Colors.orange),
                              title: const Text('Dropoff Point', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                              subtitle: Text(dropoffName, style: const TextStyle(fontSize: 14, color: Colors.white, fontWeight: FontWeight.bold)),
                              trailing: const Icon(Icons.chevron_right, color: Color(0xFF64748B)),
                              onTap: () {},
                            ),
                            const Divider(height: 1, color: Color(0xFF223049)),
                            if (guardiansList.isEmpty)
                              const ListTile(
                                leading: Icon(Icons.phone, color: Color(0xFF64748B)),
                                title: Text('Parent / Guardian', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                                subtitle: Text('No parent / guardian registered', style: TextStyle(fontSize: 14, color: Colors.white)),
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
                                      subtitle: Text(gPhone, style: const TextStyle(fontSize: 14, color: Colors.white, fontWeight: FontWeight.bold)),
                                      trailing: IconButton(
                                        icon: const Icon(Icons.phone_in_talk, color: Color(0xFF10B981)),
                                        onPressed: () {
                                          _simulateCall(gName, gPhone);
                                        },
                                      ),
                                    ),
                                    const Divider(height: 1, color: Color(0xFF223049)),
                                  ],
                                );
                              }),
                            ListTile(
                              leading: const Icon(Icons.note_alt, color: Color(0xFF10B981)),
                              title: const Text('Notes', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                              subtitle: const Text('No notes', style: TextStyle(fontSize: 14, color: Colors.white)),
                              trailing: const Icon(Icons.chevron_right, color: Color(0xFF64748B)),
                              onTap: () {},
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        'Trip Actions',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8), letterSpacing: 0.5),
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton.icon(
                        onPressed: () async {
                          final newStatus = isBoarded ? "Absent" : "Present";
                          await _updateStudentStatus(student, newStatus);
                          setPopupState(() {});
                        },
                        icon: Icon(isBoarded ? Icons.logout : Icons.login),
                        label: Text(isBoarded ? 'DROP OFF STUDENT' : 'BOARD STUDENT'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: isBoarded ? const Color(0xFF047857) : const Color(0xFF10B981),
                          foregroundColor: Colors.white,
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
                                foregroundColor: Colors.white,
                                side: const BorderSide(color: Color(0xFF223049)),
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
                                foregroundColor: Colors.white,
                                side: const BorderSide(color: Color(0xFF223049)),
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
              color: const Color(0xFF151C2C),
              borderRadius: const BorderRadius.all(Radius.circular(16)),
              border: Border.all(color: const Color(0xFF223049), width: 1.5),
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
                    color: Colors.white,
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
              color: const Color(0xFF151C2C),
              borderRadius: const BorderRadius.all(Radius.circular(16)),
              border: Border.all(color: const Color(0xFF223049), width: 1.5),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.info_outline, size: 60, color: Color(0xFF10B981)),
                const SizedBox(height: 16),
                const Text(
                  'No Trips Scheduled Today',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
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

  Widget _buildTripTab(bool isSos, bool isTripActive, String routeName, String tripName, TelemetryCoords? telemetry) {
    if (!isTripActive) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 60.0, horizontal: 24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.local_shipping_outlined, size: 80, color: Color(0xFF64748B)),
              const SizedBox(height: 16),
              const Text(
                'No Active Trip',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 8),
              const Text(
                'Select a route and trip run on the Home tab, then tap "START TRIP" to begin location tracking and telemetry streaming.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: Color(0xFF94A3B8)),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: () {
                  setState(() {
                    _currentTab = 0;
                  });
                },
                icon: const Icon(Icons.home),
                label: const Text('Go to Home'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF10B981),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(20.0),
          decoration: BoxDecoration(
            color: const Color(0xFF151C2C),
            borderRadius: const BorderRadius.all(Radius.circular(16)),
            border: Border.all(
              color: isSos ? Colors.red : const Color(0xFF223049), 
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
                  color: Color(0xFF94A3B8),
                  height: 1.3
                ),
              ),
              if (telemetry != null) ...[
                const Divider(height: 24, color: Color(0xFF223049)),
                Text(
                  'Lat: ${telemetry.latitude.toStringAsFixed(6)}',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                Text(
                  'Lng: ${telemetry.longitude.toStringAsFixed(6)}',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    Text(
                      'Speed: ${(telemetry.speed * 3.6).toStringAsFixed(1)} km/h',
                      style: const TextStyle(fontSize: 14, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600),
                    ),
                    Text(
                      'Bearing: ${telemetry.bearing.toStringAsFixed(0)}°',
                      style: const TextStyle(fontSize: 14, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600),
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
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              flex: 2,
              child: ElevatedButton.icon(
                onPressed: () async {
                  if (_activeTrip != null) {
                    await _handleEndTrip(_activeTrip['id']);
                  } else {
                    await _endTrip();
                  }
                },
                icon: const Icon(Icons.stop, size: 28),
                label: const Text('END', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 64),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 3,
              child: GestureDetector(
                onLongPress: _toggleSOS,
                child: Container(
                  height: 64,
                  decoration: BoxDecoration(
                    color: isSos ? Colors.orange : Colors.red.shade900,
                    borderRadius: BorderRadius.circular(12),
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
        const SizedBox(height: 24),
      ],
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
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
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

    final filteredStudents = _studentsList.where((student) {
      final name = (student['name'] ?? '').toString().toLowerCase();
      return name.contains(_studentsSearchQuery.toLowerCase());
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          height: 48,
          decoration: BoxDecoration(
            color: const Color(0xFF151C2C),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF223049), width: 1.5),
          ),
          child: TextField(
            controller: _studentsSearchController,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Search students...',
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
        const SizedBox(height: 20),

        Row(
          children: [
            const Icon(Icons.people, color: Color(0xFF10B981), size: 20),
            const SizedBox(width: 8),
            const Text(
              'STUDENT MANIFEST',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
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
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 40.0),
              child: Text(
                'No matching students found.',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 15),
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
              final student = filteredStudents[index];
              final String studentName = student['name'] ?? 'Unknown Student';
              final String grade = student['grade'] ?? 'N/A';
              final String status = student['status'] ?? 'Absent';
              final bool isBoarded = status == "Present";
              final int studentIndex = index + 1;

              return GestureDetector(
                onTap: () => _showStudentDetailsPopup(student),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF151C2C),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF223049)),
                  ),
                  child: Row(
                    children: [
                      Text(
                        '$studentIndex',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: isBoarded ? const Color(0xFF10B981) : const Color(0xFFE2E8F0),
                        ),
                      ),
                      const SizedBox(width: 12),
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: isBoarded ? const Color(0xFF10B981) : const Color(0xFF334155),
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
                                color: Colors.white,
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
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          if (isBoarded) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.green.withAlpha(26),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: Colors.green),
                              ),
                              child: const Text(
                                'ONBOARD',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.green,
                                ),
                              ),
                            ),
                            const SizedBox(height: 2),
                            const Text(
                              '07:12 AM',
                              style: TextStyle(
                                fontSize: 9,
                                color: Color(0xFF64748B),
                              ),
                            ),
                          ] else ...[
                            const Text(
                              'PENDING',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: Colors.orange,
                              ),
                            ),
                            const SizedBox(height: 4),
                            GestureDetector(
                              onTap: () {
                                _updateStudentStatus(student, "Present");
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF10B981),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'BOARD',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(width: 8),
                      const Icon(
                        Icons.chevron_right,
                        color: Color(0xFF64748B),
                        size: 20,
                      ),
                    ],
                  ),
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
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
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
            color: const Color(0xFF151C2C),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF223049), width: 1.5),
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

              Color circleColor = const Color(0xFF1E293B);
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
                            border: Border.all(color: const Color(0xFF223049), width: 1.5),
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
                              color: const Color(0xFF223049),
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
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '$kidsCount kids registered here',
                              style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
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
        return _buildTripTab(isSos, isTripActive, routeName, tripName, telemetry);
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

    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Pinned custom header section
          _buildHeaderSection(context),
          
          // Scrollable body content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: _buildTabBody(isSos, isTripActive, routeName, tripName, telemetry),
            ),
          ),
        ],
      ),
      bottomNavigationBar: Theme(
        data: Theme.of(context).copyWith(
          canvasColor: const Color(0xFF151C2C),
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
          backgroundColor: const Color(0xFF151C2C),
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

  Widget _buildSelectedTripCard(dynamic trip) {
    final schedule = trip['schedule'] ?? {};
    final route = trip['route'] ?? {};
    final departureTime = schedule['departure_time']?.toString().substring(0, 5) ?? '00:00';
    final direction = schedule['direction'] ?? 'HOME_TO_SCHOOL';
    final isPickup = direction == 'HOME_TO_SCHOOL';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF151C2C),
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
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
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
                style: const TextStyle(fontSize: 14, color: Color(0xFF34D399), fontWeight: FontWeight.w600),
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
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF223049)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        '${trip['students_count'] ?? 0}',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
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
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF223049)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        '${trip['stops_count'] ?? 0}',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
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
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF223049)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        '${trip['estimated_duration'] ?? 0}m',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
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
                  color: Colors.amber,
                ),
              ),
            ),
          ],
          const SizedBox(height: 20),
          if (!isPickup) ...[
            ElevatedButton.icon(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (context) => StudentSelectionScreen(
                      routeId: route['id'],
                      tenantId: _tenantController.text.trim(),
                      tripId: schedule['id'],
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.people_outline, size: 24),
              label: const Text('BOARD STUDENTS', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0F172A),
                foregroundColor: Colors.white,
                side: const BorderSide(color: Color(0xFF223049), width: 1.5),
                minimumSize: const Size(double.infinity, 54),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 10),
          ],
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
          color: const Color(0xFF151C2C),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF223049)),
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
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
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
                  color: isPickup ? const Color(0xFF34D399) : const Color(0xFFF59E0B)
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
