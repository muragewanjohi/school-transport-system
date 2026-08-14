import 'package:flutter/material.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

class TripStopActionCard extends StatefulWidget {
  final String? stopName;
  final int studentsAtStop;
  final int? etaMinutes;
  final double? distanceKm;
  final bool canBoard;
  final String runType;
  final VoidCallback? onNavigate;
  final VoidCallback? onBoardStudents;
  final VoidCallback? onViewStudents;

  const TripStopActionCard({
    super.key,
    this.stopName,
    required this.studentsAtStop,
    this.etaMinutes,
    this.distanceKm,
    required this.canBoard,
    required this.runType,
    this.onNavigate,
    this.onBoardStudents,
    this.onViewStudents,
  });

  @override
  State<TripStopActionCard> createState() => _TripStopActionCardState();
}

class _TripStopActionCardState extends State<TripStopActionCard> {
  bool _expanded = false;

  String get _collapsedTitle => widget.stopName != null
      ? 'Next stop: ${widget.stopName}'
      : 'Route complete';

  @override
  Widget build(BuildContext context) {
    final cta = tripBoardingCtaLabel(widget.runType);
    final isPickup = isPickupRunType(widget.runType);
    final metaParts = <String>[
      '${widget.studentsAtStop} students',
      if (widget.etaMinutes != null) '~${widget.etaMinutes} min',
      if (widget.distanceKm != null) '(${widget.distanceKm!.toStringAsFixed(1)} km)',
    ];

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border, width: 1.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  const Icon(Icons.location_on, color: Color(0xFF3B82F6), size: 22),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _expanded
                          ? (widget.stopName != null
                              ? 'NEXT STOP: ${widget.stopName}'
                              : 'ROUTE COMPLETE')
                          : _collapsedTitle,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    color: AppColors.muted,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.stopName != null
                              ? metaParts.join(' • ')
                              : 'No further stops on this route',
                          style: const TextStyle(fontSize: 12, color: AppColors.muted),
                        ),
                      ),
                      if (widget.onViewStudents != null)
                        TextButton.icon(
                          onPressed: widget.onViewStudents,
                          icon: const Icon(Icons.people_outline, size: 18),
                          label: const Text('View Students'),
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.actionGreen,
                            textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                  if (!widget.canBoard && widget.stopName != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3C7),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'Arrive at this stop geofence to board or drop off students.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF92400E),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: widget.stopName == null ? null : widget.onNavigate,
                          icon: const Icon(Icons.navigation, size: 20),
                          label: const Text(
                            'Navigate',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.actionGreen,
                            side: const BorderSide(color: AppColors.actionGreen, width: 1.5),
                            minimumSize: const Size(0, 52),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 2,
                        child: ElevatedButton.icon(
                          onPressed: widget.canBoard ? widget.onBoardStudents : null,
                          icon: Icon(
                            isPickup ? Icons.person_add_alt_1 : Icons.person_remove_alt_1,
                            size: 20,
                          ),
                          label: Text(
                            cta,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.actionGreen,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor: AppColors.mutedLight,
                            minimumSize: const Size(0, 52),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
