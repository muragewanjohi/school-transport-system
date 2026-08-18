import 'package:flutter/gestures.dart' show kLongPressTimeout;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/stop_visit_logic.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

const Duration holdToEndTripDuration = kLongPressTimeout;

class TripControlDrawer extends StatelessWidget {
  final TripAttendanceProgress progress;
  final bool isPickup;
  final String runType;
  final String? nextStopName;
  final int nextStopNumber;
  final int studentsAtStop;
  final int? etaMinutes;
  final double? distanceKm;
  final List<StopProgressSegment> segments;
  final String? upcomingStopName;
  final int upcomingStopNumber;
  final int? upcomingEtaMinutes;
  final VoidCallback? onBoardStudents;
  final VoidCallback? onSkipStop;
  final VoidCallback? onNavigate;
  final VoidCallback? onViewStudents;
  final VoidCallback? onEndTrip;
  final VoidCallback? onToggleGpsReplay;
  final bool gpsReplayActive;
  final StopApproachPhase stopPhase;
  final bool skipUnlocked;
  final int skipWaitSeconds;
  final int dwellSecondsElapsed;
  final int minStopDwellSeconds;

  const TripControlDrawer({
    super.key,
    required this.progress,
    required this.isPickup,
    required this.runType,
    this.nextStopName,
    required this.nextStopNumber,
    required this.studentsAtStop,
    this.etaMinutes,
    this.distanceKm,
    this.segments = const [],
    this.upcomingStopName,
    required this.upcomingStopNumber,
    this.upcomingEtaMinutes,
    this.onBoardStudents,
    this.onSkipStop,
    this.onNavigate,
    this.onViewStudents,
    this.onEndTrip,
    this.onToggleGpsReplay,
    this.gpsReplayActive = false,
    this.stopPhase = StopApproachPhase.approaching,
    this.skipUnlocked = false,
    this.skipWaitSeconds = 0,
    this.dwellSecondsElapsed = 0,
    this.minStopDwellSeconds = defaultMinStopDwellSeconds,
  });

  @override
  Widget build(BuildContext context) {
    final cta = tripBoardingCtaLabel(runType);
    final summary = formatPickedSummary(
      boarded: progress.boarded,
      total: progress.total,
      isPickup: isPickup,
    );
    final distanceLabel = formatDistanceAway(distanceKm);

    return Material(
      color: Colors.transparent,
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          boxShadow: [
            BoxShadow(color: Color(0x1A000000), blurRadius: 20, offset: Offset(0, -4)),
          ],
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.border,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Text(
                      summary,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: _StopSegmentBar(segments: segments)),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          formatEtaLabel(etaMinutes),
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: AppColors.ink,
                            height: 1.1,
                          ),
                        ),
                        if (distanceLabel.isNotEmpty)
                          Text(
                            distanceLabel,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.muted,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _NextStopCard(
                  stopNumber: nextStopNumber,
                  stopName: nextStopName,
                  phase: stopPhase,
                  waitingLabel: nextStopName == null
                      ? 'No further stops on this route'
                      : studentsWaitingLabel(count: studentsAtStop, isPickup: isPickup),
                  dwellLabel: _dwellLabel(),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: nextStopName == null ? null : onBoardStudents,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.actionGreen,
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: AppColors.mutedLight,
                          minimumSize: const Size(0, 52),
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        child: Text(
                          cta,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    _OverflowMenu(
                      onNavigate: nextStopName == null ? null : onNavigate,
                      onViewStudents: onViewStudents,
                      onToggleGpsReplay: onToggleGpsReplay,
                      gpsReplayActive: gpsReplayActive,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: nextStopName == null || !skipUnlocked ? null : onSkipStop,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.ink,
                          backgroundColor: AppColors.surfaceAlt,
                          side: BorderSide.none,
                          minimumSize: const Size(0, 48),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        child: const Text(
                          'Skip stop',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: HoldToEndTripButton(onCompleted: onEndTrip),
                    ),
                  ],
                ),
                if (upcomingStopName != null) ...[
                  const SizedBox(height: 10),
                  _UpcomingStopRow(
                    stopNumber: upcomingStopNumber,
                    stopName: upcomingStopName!,
                    etaMinutes: upcomingEtaMinutes,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  String? _dwellLabel() {
    if (nextStopName == null) return null;
    if (stopPhase == StopApproachPhase.arrived) {
      if (skipUnlocked) return 'Waited ${formatDwell(dwellSecondsElapsed)}';
      return 'Wait ${skipWaitSeconds}s before skip';
    }
    if (stopPhase == StopApproachPhase.returnToWait) {
      return skipUnlocked
          ? 'Waited ${formatDwell(dwellSecondsElapsed)} — stop still open'
          : 'Wait ${skipWaitSeconds}s before skip';
    }
    return null;
  }
}

class _StopSegmentBar extends StatelessWidget {
  final List<StopProgressSegment> segments;

  const _StopSegmentBar({required this.segments});

  @override
  Widget build(BuildContext context) {
    if (segments.isEmpty) {
      return const SizedBox.shrink();
    }
    return Row(
      children: [
        for (var i = 0; i < segments.length; i++) ...[
          if (i > 0) const SizedBox(width: 4),
          Expanded(
            child: Container(
              height: 6,
              decoration: BoxDecoration(
                color: _colorFor(segments[i].kind),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Color _colorFor(StopProgressKind kind) {
    switch (kind) {
      case StopProgressKind.completed:
        return AppColors.actionGreen;
      case StopProgressKind.current:
        return AppColors.nextBlue;
      case StopProgressKind.upcoming:
        return AppColors.border;
    }
  }
}

class _NextStopCard extends StatelessWidget {
  final int stopNumber;
  final String? stopName;
  final String waitingLabel;
  final StopApproachPhase phase;
  final String? dwellLabel;

  const _NextStopCard({
    required this.stopNumber,
    required this.stopName,
    required this.waitingLabel,
    required this.phase,
    this.dwellLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.nextBlue,
              shape: BoxShape.circle,
            ),
            child: Text(
              stopNumber > 0 ? '$stopNumber' : '–',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  stopName == null ? 'NEXT STOP' : stopPhaseEyebrow(phase),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                    color: AppColors.muted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  stopName ?? 'Route complete',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  waitingLabel,
                  style: const TextStyle(fontSize: 13, color: AppColors.muted),
                ),
                if (dwellLabel != null && dwellLabel!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    dwellLabel!,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OverflowMenu extends StatelessWidget {
  final VoidCallback? onNavigate;
  final VoidCallback? onViewStudents;
  final VoidCallback? onToggleGpsReplay;
  final bool gpsReplayActive;

  const _OverflowMenu({
    this.onNavigate,
    this.onViewStudents,
    this.onToggleGpsReplay,
    this.gpsReplayActive = false,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border),
      ),
      child: PopupMenuButton<String>(
        tooltip: 'More trip actions',
        enabled: onNavigate != null ||
            onViewStudents != null ||
            onToggleGpsReplay != null,
        onSelected: (value) {
          if (value == 'navigate') onNavigate?.call();
          if (value == 'students') onViewStudents?.call();
          if (value == 'replay') onToggleGpsReplay?.call();
        },
        itemBuilder: (context) => [
          if (onNavigate != null)
            const PopupMenuItem(value: 'navigate', child: Text('Navigate')),
          if (onViewStudents != null)
            const PopupMenuItem(value: 'students', child: Text('View Students')),
          if (onToggleGpsReplay != null)
            PopupMenuItem(
              value: 'replay',
              child: Text(gpsReplayActive ? 'Stop simulation' : 'Replay demo GPS'),
            ),
        ],
        child: const SizedBox(
          width: 52,
          height: 52,
          child: Icon(Icons.more_horiz, color: AppColors.ink),
        ),
      ),
    );
  }
}

class _UpcomingStopRow extends StatelessWidget {
  final int stopNumber;
  final String stopName;
  final int? etaMinutes;

  const _UpcomingStopRow({
    required this.stopNumber,
    required this.stopName,
    required this.etaMinutes,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.mutedLight,
              shape: BoxShape.circle,
            ),
            child: Text(
              '$stopNumber',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              stopName,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            ),
          ),
          Text(
            formatEtaLabel(etaMinutes),
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class HoldToEndTripButton extends StatefulWidget {
  final VoidCallback? onCompleted;
  final Duration holdDuration;

  const HoldToEndTripButton({
    super.key,
    required this.onCompleted,
    this.holdDuration = holdToEndTripDuration,
  });

  @override
  State<HoldToEndTripButton> createState() => _HoldToEndTripButtonState();
}

class _HoldToEndTripButtonState extends State<HoldToEndTripButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  bool _fired = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.holdDuration);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _startHold() {
    if (widget.onCompleted == null) return;
    _fired = false;
    _controller.forward(from: 0);
  }

  void _cancelHold() {
    if (_fired) return;
    _controller.reset();
  }

  void _completeHold() {
    if (widget.onCompleted == null || _fired) return;
    _fired = true;
    HapticFeedback.mediumImpact();
    widget.onCompleted?.call();
    _controller.reset();
    _fired = false;
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onLongPressStart: (_) => _startHold(),
      onLongPress: _completeHold,
      onLongPressCancel: _cancelHold,
      onLongPressEnd: (_) => _cancelHold(),
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.dangerSoft,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.dangerBorder),
                  ),
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: FractionallySizedBox(
                    widthFactor: _controller.value,
                    child: Container(
                      height: 48,
                      color: AppColors.dangerBorder.withValues(alpha: 0.7),
                    ),
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AppColors.dangerInk,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      'Hold to end trip',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: AppColors.dangerInk,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
