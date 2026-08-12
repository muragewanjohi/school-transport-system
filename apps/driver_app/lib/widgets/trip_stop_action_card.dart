import 'package:flutter/material.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

class TripStopActionCard extends StatelessWidget {
  final String? stopName;
  final int studentsAtStop;
  final int? etaMinutes;
  final double? distanceKm;
  final bool navMode;
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
    required this.navMode,
    required this.canBoard,
    required this.runType,
    this.onNavigate,
    this.onBoardStudents,
    this.onViewStudents,
  });

  @override
  Widget build(BuildContext context) {
    final cta = tripBoardingCtaLabel(runType);
    final isPickup = isPickupRunType(runType);
    final metaParts = <String>[
      '$studentsAtStop students',
      if (etaMinutes != null) '~$etaMinutes min',
      if (distanceKm != null) '(${distanceKm!.toStringAsFixed(1)} km)',
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.location_on, color: Color(0xFF3B82F6), size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      stopName != null ? 'NEXT STOP: $stopName' : 'ROUTE COMPLETE',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      stopName != null ? metaParts.join(' • ') : 'No further stops on this route',
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              if (onViewStudents != null)
                TextButton.icon(
                  onPressed: onViewStudents,
                  icon: const Icon(Icons.people_outline, size: 18),
                  label: const Text('View Students'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.actionGreen,
                    textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
                  ),
                ),
            ],
          ),
          if (!canBoard && stopName != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'Arrive at this stop geofence to board or drop off students.',
                style: TextStyle(fontSize: 12, color: Color(0xFF92400E), fontWeight: FontWeight.w600),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: stopName == null ? null : onNavigate,
                  icon: Icon(navMode ? Icons.close : Icons.navigation, size: 20),
                  label: Text(
                    navMode ? 'Exit Nav' : 'Navigate',
                    style: const TextStyle(fontWeight: FontWeight.bold),
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
                  onPressed: canBoard ? onBoardStudents : null,
                  icon: Icon(isPickup ? Icons.person_add_alt_1 : Icons.person_remove_alt_1, size: 20),
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
    );
  }
}
