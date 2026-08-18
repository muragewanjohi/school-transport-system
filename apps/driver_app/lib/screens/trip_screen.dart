import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:driver_app/providers/trip_providers.dart';
import 'package:driver_app/services/stop_navigation_service.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/geo_utils.dart';
import 'package:driver_app/utils/stop_visit_logic.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/route_map_widget.dart';
import 'package:driver_app/widgets/stop_boarding_drawer.dart';
import 'package:driver_app/widgets/trip_control_drawer.dart';

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
          content: Text('SOS active â€” emergency telemetry streaming'),
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

class TripScreen extends ConsumerStatefulWidget {
  final bool isTripActive;
  final String vehiclePlate;
  final String? routeId;
  final String runType;
  final List<dynamic> stops;
  final List<dynamic> students;
  final Map<String, StopVisitOutcome> stopOutcomes;
  final DateTime? arrivedAt;
  final String? lastArrivedStopId;
  final int minStopDwellSeconds;
  final int? scheduleDurationMinutes;
  final TelemetryCoords? telemetry;
  final void Function({
    required String stopId,
    required StopVisitOutcome outcome,
    required int dwellSeconds,
    required int studentsActioned,
  }) onStopResolved;
  final Future<bool> Function(Map<String, dynamic> student, String status) onUpdateStudentStatus;
  final VoidCallback onViewStudents;
  final VoidCallback onGoHome;
  final Future<void> Function() onEndTrip;
  final VoidCallback? onMapRefresh;
  final bool gpsReplayActive;
  final String? gpsReplayLabel;
  final VoidCallback? onToggleGpsReplay;

  const TripScreen({
    super.key,
    required this.isTripActive,
    required this.vehiclePlate,
    required this.routeId,
    required this.runType,
    required this.stops,
    required this.students,
    required this.stopOutcomes,
    this.arrivedAt,
    this.lastArrivedStopId,
    this.minStopDwellSeconds = defaultMinStopDwellSeconds,
    this.scheduleDurationMinutes,
    required this.telemetry,
    required this.onStopResolved,
    required this.onUpdateStudentStatus,
    required this.onViewStudents,
    required this.onGoHome,
    required this.onEndTrip,
    this.onMapRefresh,
    this.gpsReplayActive = false,
    this.gpsReplayLabel,
    this.onToggleGpsReplay,
  });

  @override
  ConsumerState<TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends ConsumerState<TripScreen> {
  bool _drawerOpen = false;
  String? _openedForStopId;
  Timer? _dwellTicker;

  bool get _isPickup => isPickupRunType(widget.runType);

  Set<String> get _resolvedStopIds => widget.stopOutcomes.keys.toSet();

  ArrivedStop? get _arrived {
    if (widget.telemetry == null || widget.stops.isEmpty) return null;
    return findArrivedStop(
      latitude: widget.telemetry!.latitude,
      longitude: widget.telemetry!.longitude,
      stops: widget.stops,
    );
  }

  Map<String, dynamic>? get _nextStop {
    return firstUnresolvedStop(stops: widget.stops, outcomes: widget.stopOutcomes) ??
        nextNavigationStop(
          stops: widget.stops,
          latitude: widget.telemetry?.latitude,
          longitude: widget.telemetry?.longitude,
        );
  }

  @override
  void initState() {
    super.initState();
    _dwellTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || widget.arrivedAt == null) return;
      setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _maybeAutoOpenDrawer();
    });
  }

  @override
  void dispose() {
    _dwellTicker?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(TripScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _maybeAutoOpenDrawer();
      _maybeDismissDrawerAfterLeave();
    });
  }

  void _maybeAutoOpenDrawer() {
    final arrived = _arrived;
    final next = _nextStop;
    final nextId = next?['id']?.toString();
    if (!shouldAutoOpenBoardingDrawer(
      arrivedStopId: arrived?.id,
      nextStopId: nextId,
      alreadyOpenedStopId: _openedForStopId,
      drawerOpen: _drawerOpen,
    )) {
      return;
    }
    _openBoardingDrawer();
  }

  void _maybeDismissDrawerAfterLeave() {
    if (!_drawerOpen) return;
    final arrived = _arrived;
    final nextId = _nextStop?['id']?.toString();
    if (arrived == null || (nextId != null && arrived.id != nextId && arrived.id != _openedForStopId)) {
      Navigator.of(context, rootNavigator: true).maybePop();
    }
  }

  Future<void> _openBoardingDrawer({bool requireArrival = true}) async {
    final stop = _nextStop;
    if (stop == null) return;
    final stopId = stop['id']?.toString() ?? '';
    if (stopId.isEmpty) return;
    final arrived = _arrived;
    final atStop = arrived != null && arrived.id == stopId;
    if (requireArrival && !atStop) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Arrive at this stop geofence before boarding.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }
    if (_drawerOpen) return;

    final orderedIds = orderedStopIdsFrom(widget.stops);
    final idx = orderedIds.indexOf(stopId);
    final stopStudents = studentsForStop(
      students: widget.students,
      stopId: stopId,
      isPickup: _isPickup,
    );

    setState(() {
      _drawerOpen = true;
      _openedForStopId = stopId;
    });

    final result = await showStopBoardingDrawer(
      context: context,
      stopId: stopId,
      stopName: (stop['name'] ?? 'Stop').toString(),
      stopIndex: idx >= 0 ? idx + 1 : 1,
      stopCount: orderedIds.length,
      students: stopStudents,
      isPickup: _isPickup,
      arrived: atStop,
      arrivedAt: widget.arrivedAt,
      minStopDwellSeconds: widget.minStopDwellSeconds,
      onUpdateStatus: widget.onUpdateStudentStatus,
    );

    if (!mounted) return;
    setState(() => _drawerOpen = false);

    if (result == null) return;
    final outcome = result.action == StopBoardingAction.skipped
        ? StopVisitOutcome.skipped
        : StopVisitOutcome.completed;
    widget.onStopResolved(
      stopId: result.stopId,
      outcome: outcome,
      dwellSeconds: result.dwellSeconds,
      studentsActioned: result.studentsActioned,
    );
  }

  Future<void> _skipCurrentStop() async {
    final stop = _nextStop;
    if (stop == null) return;
    final stopId = stop['id']?.toString() ?? '';
    if (stopId.isEmpty) return;
    final now = DateTime.now();
    if (!skipStopAllowed(
      arrivedAt: widget.arrivedAt,
      now: now,
      minStopDwellSeconds: widget.minStopDwellSeconds,
    )) {
      final wait = skipWaitRemainingSeconds(
        arrivedAt: widget.arrivedAt,
        now: now,
        minStopDwellSeconds: widget.minStopDwellSeconds,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Wait ${wait}s before skip.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Skip this stop?'),
        content: const Text(
          'This marks the stop as not visited. School admins will be alerted.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFB91C1C)),
            child: const Text('Skip Stop'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    widget.onStopResolved(
      stopId: stopId,
      outcome: StopVisitOutcome.skipped,
      dwellSeconds: dwellSeconds(arrivedAt: widget.arrivedAt, departedAt: DateTime.now()),
      studentsActioned: 0,
    );
  }

  Future<void> _navigateToNextStop() async {
    final stop = _nextStop;
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

  @override
  Widget build(BuildContext context) {
    if (!widget.isTripActive) {
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
              onPressed: widget.onGoHome,
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
    final progress = computeAttendanceProgress(widget.students, isPickup: _isPickup);
    final next = _nextStop;
    final nextPoint = next == null ? null : stopLatLng(next);
    final nextId = next?['id']?.toString();
    final remainingStops = orderedStopIdsFrom(widget.stops).where((id) => !_resolvedStopIds.contains(id)).length;
    final fallbackEta = (widget.scheduleDurationMinutes != null && remainingStops > 0)
        ? (widget.scheduleDurationMinutes! / remainingStops).ceil()
        : widget.scheduleDurationMinutes;

    final eta = estimateEtaMinutes(
      busLat: widget.telemetry?.latitude,
      busLng: widget.telemetry?.longitude,
      stopLat: nextPoint?.latitude,
      stopLng: nextPoint?.longitude,
      speedMetersPerSec: widget.telemetry?.speed ?? 0,
      fallbackMinutes: fallbackEta,
    );
    final distKm = distanceKmToStop(
      busLat: widget.telemetry?.latitude,
      busLng: widget.telemetry?.longitude,
      stopLat: nextPoint?.latitude,
      stopLng: nextPoint?.longitude,
    );

    final arrived = _arrived;
    final atStop = arrived != null && arrived.id == nextId;
    final now = DateTime.now();
    final skipUnlocked = skipStopAllowed(
      arrivedAt: widget.arrivedAt,
      now: now,
      minStopDwellSeconds: widget.minStopDwellSeconds,
    );
    final leftBeforeMinDwell = widget.lastArrivedStopId != null &&
        widget.lastArrivedStopId == nextId &&
        !atStop &&
        widget.arrivedAt != null &&
        !skipUnlocked;
    final phase = stopApproachPhase(atStop: atStop, leftBeforeMinDwell: leftBeforeMinDwell);
    final dwellElapsed = dwellSeconds(arrivedAt: widget.arrivedAt, departedAt: now);
    final skipWait = skipWaitRemainingSeconds(
      arrivedAt: widget.arrivedAt,
      now: now,
      minStopDwellSeconds: widget.minStopDwellSeconds,
    );
    final atStopStudents = nextId == null
        ? 0
        : studentsForStop(students: widget.students, stopId: nextId, isPickup: _isPickup).length;
    final upcoming = stopAfter(stops: widget.stops, stopId: nextId);
    final upcomingPoint = upcoming == null ? null : stopLatLng(upcoming);
    final upcomingEta = estimateEtaMinutes(
      busLat: widget.telemetry?.latitude,
      busLng: widget.telemetry?.longitude,
      stopLat: upcomingPoint?.latitude,
      stopLng: upcomingPoint?.longitude,
      speedMetersPerSec: widget.telemetry?.speed ?? 0,
    );
    final orderedIds = orderedStopIdsFrom(widget.stops);
    final segments = stopProgressSegments(
      orderedStopIds: orderedIds,
      outcomes: widget.stopOutcomes,
      nextStopId: nextId,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (isSos)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
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
        if (widget.routeId != null)
          Expanded(
            child: Stack(
              children: [
                RouteMapWidget(
                  routeId: widget.routeId!,
                  liveLatitude: widget.telemetry?.latitude,
                  liveLongitude: widget.telemetry?.longitude,
                  liveBearing: widget.telemetry?.bearing,
                  vehiclePlate: widget.vehiclePlate,
                  arrivedStopId: arrived?.id,
                  nextStopId: nextId,
                  visitedStopIds: _resolvedStopIds,
                  stopOutcomes: widget.stopOutcomes,
                  lastTelemetryIso: widget.telemetry?.timestamp,
                  onRefresh: widget.onMapRefresh,
                  height: null,
                  followBus: true,
                ),
                if (widget.gpsReplayActive)
                  Positioned(
                    top: 12,
                    left: 12,
                    right: 12,
                    child: Material(
                      color: AppColors.accentYellow.withValues(alpha: 0.95),
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        child: Text(
                          widget.gpsReplayLabel == null || widget.gpsReplayLabel!.isEmpty
                              ? 'Simulating GPS'
                              : 'Simulating GPS · ${widget.gpsReplayLabel}',
                          style: const TextStyle(
                            color: AppColors.ink,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          )
        else
          const Expanded(
            child: Center(child: Text('No route selected for this trip.')),
          ),
        TripControlDrawer(
          progress: progress,
          isPickup: _isPickup,
          runType: widget.runType,
          nextStopName: next?['name']?.toString(),
          nextStopNumber: stopSequenceNumber(stops: widget.stops, stopId: nextId),
          studentsAtStop: atStopStudents,
          etaMinutes: eta,
          distanceKm: distKm,
          segments: segments,
          upcomingStopName: upcoming?['name']?.toString(),
          upcomingStopNumber: stopSequenceNumber(
            stops: widget.stops,
            stopId: upcoming?['id']?.toString(),
          ),
          upcomingEtaMinutes: upcomingEta,
          stopPhase: phase,
          skipUnlocked: skipUnlocked,
          skipWaitSeconds: skipWait,
          dwellSecondsElapsed: dwellElapsed,
          minStopDwellSeconds: widget.minStopDwellSeconds,
          onBoardStudents: () => _openBoardingDrawer(),
          onSkipStop: next == null ? null : _skipCurrentStop,
          onNavigate: next == null ? null : _navigateToNextStop,
          onViewStudents: widget.onViewStudents,
          onEndTrip: widget.onEndTrip,
          onToggleGpsReplay: widget.onToggleGpsReplay,
          gpsReplayActive: widget.gpsReplayActive,
        ),
      ],
    );
  }
}
