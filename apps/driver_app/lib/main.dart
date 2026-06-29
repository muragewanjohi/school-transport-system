import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:driver_app/services/supabase_service.dart';
import 'package:driver_app/services/location_service.dart';
import 'package:driver_app/screens/login_screen.dart';
import 'package:driver_app/widgets/student_checklist_widget.dart';

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
  StreamSubscription? _telemetrySub;

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

  /// Load authenticated driver details from SharedPreferences
  Future<void> _loadSessionDetails() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _driverName = prefs.getString('driver_name') ?? "Unknown Driver";
      _driverPhone = prefs.getString('driver_phone') ?? "";
      _tenantController.text = prefs.getString('tenant_id') ?? '8c9ad841-f762-4217-a021-9876251b5bcf';
      _vehicleController.text = prefs.getString('vehicle_id') ?? 'e5015e10-c09a-4c22-901d-5573752e379c';
      _routeController.text = prefs.getString('route_id') ?? '782cd841-f762-4217-a021-9876251b5bca';
    });
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
            // Driver Profile Header
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
                  const CircleAvatar(
                    backgroundColor: Color(0xFF10B981),
                    child: Icon(Icons.person, color: Colors.white),
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
                        'Driver • $_driverPhone',
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

            // Status Indicator Header Panel
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
                          color: isTripActive ? Colors.green : Colors.red,
                          shape: BoxShape.circle,
                          boxShadow: isTripActive
                              ? [
                                  BoxShadow(
                                    color: Colors.green.withAlpha(128),
                                    blurRadius: 8,
                                    spreadRadius: 2,
                                  )
                                ]
                              : [],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        isTripActive ? 'TRACKING TELEMETRY ACTIVE' : 'TRIP NOT STARTED',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: isTripActive ? Colors.green : Colors.red,
                        ),
                      ),
                    ],
                  ),
                  if (isTripActive && telemetry != null) ...[
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
                      'Press the Start button below to request hardware permissions and activate background geolocation streaming.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: Colors.grey),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Oversized Chunky Control Buttons
            if (!isTripActive) ...[
              ElevatedButton.icon(
                onPressed: _startTrip,
                icon: const Icon(Icons.play_arrow, size: 28),
                label: const Text('START TRIP', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF10B981),
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 64),
                ),
              ),
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
            
            // Student checklist manifest panel (shown only during active trips)
            if (isTripActive) ...[
              const SizedBox(height: 24),
              StudentChecklistWidget(
                routeId: _routeController.text.trim(),
                tenantId: _tenantController.text.trim(),
              ),
            ],

            const SizedBox(height: 24),

            // Configure Routing Parameters Form Panel (Read-only during trip)
            const Text(
              'Trip Ingress Configurations (B2B Scopes)',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.blueGrey),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(16.0),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: const BorderRadius.all(Radius.circular(12)),
                border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
              ),
              child: Column(
                children: [
                  TextField(
                    controller: _tenantController,
                    enabled: false, // Locked: controlled by auth session
                    decoration: const InputDecoration(
                      labelText: 'Tenant ID (UUID)',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _vehicleController,
                    enabled: false, // Locked: controlled by auth session
                    decoration: const InputDecoration(
                      labelText: 'Vehicle ID (UUID)',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _routeController,
                    enabled: false, // Locked: controlled by auth session
                    decoration: const InputDecoration(
                      labelText: 'Route ID (UUID)',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
