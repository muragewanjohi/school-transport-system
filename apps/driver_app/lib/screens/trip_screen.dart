import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:driver_app/providers/trip_providers.dart';
import 'package:driver_app/services/stop_navigation_service.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/geo_utils.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/route_map_widget.dart';
import 'package:driver_app/widgets/stop_boarding_drawer.dart';
import 'package:driver_app/widgets/trip_progress_card.dart';
import 'package:driver_app/widgets/trip_stop_action_card.dart';

/// Long-press SOS control for the Trip AppBar.
class TripSosAction extends ConsumerWidget {
  const TripSosAction({super.key});

  Future<void> _confirmSos(BuildContext context, WidgetRef ref) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Activate SOS?'),
        content: const Text(
          'This marks your trip as an emergency and streams SOS telemetry to the school. Long-press again after confirming.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Activate SOS'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    ref.read(emergencyActiveProvider.notifier).state = true;
    final service = FlutterBackgroundService();
    service.invoke('toggleSOS', {'isEmergency': true});
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('SOS active — emergency telemetry streaming'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _clearSos(BuildContext context, WidgetRef ref) async {
    ref.read(emergencyActiveProvider.notifier).state = false;
    final service = FlutterBackgroundService();
    service.invoke('toggleSOS', {'isEmergency': false});
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('SOS cleared'), backgroundColor: AppColors.actionGreen),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isSos = ref.watch(emergencyActiveProvider);
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Center(
        child: GestureDetector(
          onLongPress: () => isSos ? _clearSos(context, ref) : _confirmSos(context, ref),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isSos ? Colors.red : Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: isSos ? Colors.white : Colors.red, width: 1.5),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.shield, color: isSos ? Colors.white : Colors.red, size: 20),
                const SizedBox(width: 4),
                Text(
                  'SOS',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: isSos ? Colors.white : Colors.red,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class TripScreen extends ConsumerWidget {
  final bool isTripActive;
  final String vehiclePlate;
  final String? routeId;
  final String runType;
  final List<dynamic> stops;
  final List<dynamic> students;
  final Set<String> visitedStopIds;
  final DateTime? arrivedAt;
  final int? scheduleDurationMinutes;
  final TelemetryCoords? telemetry;
  final ValueChanged<String> onStopCompleted;
  final Future<bool> Function(Map<String, dynamic> student, String status) onUpdateStudentStatus;
  final VoidCallback onViewStudents;
  final VoidCallback onGoHome;
  final Future<void> Function() onEndTrip;
  final VoidCallback? onMapRefresh;

  const TripScreen({
    super.key,
    required this.isTripActive,
    required this.vehiclePlate,
    required this.routeId,
    required this.runType,
    required this.stops,
    required this.students,
    required this.visitedStopIds,
    this.arrivedAt,
    this.scheduleDurationMinutes,
    required this.telemetry,
    required this.onStopCompleted,
    required this.onUpdateStudentStatus,
    required this.onViewStudents,
    required this.onGoHome,
    required this.onEndTrip,
    this.onMapRefresh,
  });

  bool get _isPickup => isPickupRunType(runType);

  ArrivedStop? get _arrived {
    if (telemetry == null || stops.isEmpty) return null;
    return findArrivedStop(
      latitude: telemetry!.latitude,
      longitude: telemetry!.longitude,
      stops: stops,
    );
  }

  Map<String, dynamic>? get _nextStop {
    // Prefer first incomplete stop in sequence as "active" stop for boarding.
    final ordered = sortedStopsBySequence(stops);
    for (final s in ordered) {
      if (s is! Map) continue;
      final id = s['id']?.toString() ?? '';
      if (id.isEmpty) continue;
      if (!visitedStopIds.contains(id)) {
        return Map<String, dynamic>.from(s);
      }
    }
    return nextNavigationStop(
      stops: stops,
      latitude: telemetry?.latitude,
      longitude: telemetry?.longitude,
    );
  }

  Future<void> _openBoardingDrawer(BuildContext context) async {
    final stop = _nextStop;
    if (stop == null) return;
    final stopId = stop['id']?.toString() ?? '';
    if (stopId.isEmpty) return;
    final arrived = _arrived;
    final atStop = arrived != null && arrived.id == stopId;
    if (!atStop) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Arrive at this stop geofence before boarding.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final orderedIds = orderedStopIdsFrom(stops);
    final idx = orderedIds.indexOf(stopId);
    final stopStudents = studentsForStop(
      students: students,
      stopId: stopId,
      isPickup: _isPickup,
    );

    final result = await showStopBoardingDrawer(
      context: context,
      stopId: stopId,
      stopName: (stop['name'] ?? 'Stop').toString(),
      stopIndex: idx >= 0 ? idx + 1 : 1,
      stopCount: orderedIds.length,
      students: stopStudents,
      isPickup: _isPickup,
      arrived: true,
      arrivedAt: arrivedAt,
      onUpdateStatus: onUpdateStudentStatus,
    );

    if (result != null) {
      onStopCompleted(result.stopId);
    }
  }

  Future<void> _navigateToNextStop(BuildContext context) async {
    final stop = _nextStop;
    if (stop == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No next stop available for navigation.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final ok = await StopNavigationService.navigateToStop(stop);
    if (!context.mounted) return;
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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!isTripActive) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.local_shipping_outlined, size: 80, color: AppColors.muted),
            const SizedBox(height: 16),
            const Text(
              'No Active Trip',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.ink),
            ),
            const SizedBox(height: 8),
            const Text(
              'Select a route and trip run on the Home tab, then tap START TRIP to begin tracking.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: AppColors.mutedLight),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onGoHome,
              icon: const Icon(Icons.home),
              label: const Text('Go to Home'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.actionGreen,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ],
        ),
      );
    }

    final isSos = ref.watch(emergencyActiveProvider);
    final progress = computeAttendanceProgress(students, isPickup: _isPickup);
    final next = _nextStop;
    final nextPoint = next == null ? null : stopLatLng(next);
    final nextId = next?['id']?.toString();
    final remainingStops = orderedStopIdsFrom(stops).where((id) => !visitedStopIds.contains(id)).length;
    final fallbackEta = (scheduleDurationMinutes != null && remainingStops > 0)
        ? (scheduleDurationMinutes! / remainingStops).ceil()
        : scheduleDurationMinutes;

    final eta = estimateEtaMinutes(
      busLat: telemetry?.latitude,
      busLng: telemetry?.longitude,
      stopLat: nextPoint?.latitude,
      stopLng: nextPoint?.longitude,
      speedMetersPerSec: telemetry?.speed ?? 0,
      fallbackMinutes: fallbackEta,
    );
    final distKm = distanceKmToStop(
      busLat: telemetry?.latitude,
      busLng: telemetry?.longitude,
      stopLat: nextPoint?.latitude,
      stopLng: nextPoint?.longitude,
    );

    final arrived = _arrived;
    final canBoard = nextId != null && arrived != null && arrived.id == nextId;
    final atStopStudents = nextId == null
        ? 0
        : studentsForStop(students: students, stopId: nextId, isPickup: _isPickup).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (isSos) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.red, width: 1.5),
            ),
            child: const Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: Colors.red),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'CRITICAL WARNING: SOS Mode Active. Streaming coordinates.',
                    style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        TripProgressCard(
          progress: progress,
          isPickup: _isPickup,
        ),
        if (routeId != null) ...[
          const SizedBox(height: 12),
          RouteMapWidget(
            routeId: routeId!,
            liveLatitude: telemetry?.latitude,
            liveLongitude: telemetry?.longitude,
            liveBearing: telemetry?.bearing,
            vehiclePlate: vehiclePlate,
            arrivedStopId: arrived?.id,
            nextStopId: nextId,
            visitedStopIds: visitedStopIds,
            lastTelemetryIso: telemetry?.timestamp,
            onRefresh: onMapRefresh,
            height: 450,
          ),
          const SizedBox(height: 12),
          TripStopActionCard(
            stopName: next?['name']?.toString(),
            studentsAtStop: atStopStudents,
            etaMinutes: eta,
            distanceKm: distKm,
            canBoard: canBoard,
            runType: runType,
            onNavigate: next == null ? null : () => _navigateToNextStop(context),
            onBoardStudents: () => _openBoardingDrawer(context),
            onViewStudents: onViewStudents,
          ),
        ],
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: onEndTrip,
          icon: const Icon(Icons.stop_circle_outlined, color: Colors.red),
          label: const Text(
            'END TRIP',
            style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red),
          ),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: Colors.red, width: 1.5),
            minimumSize: const Size(double.infinity, 56),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}
