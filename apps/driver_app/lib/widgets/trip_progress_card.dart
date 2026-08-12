import 'package:flutter/material.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

class TripProgressCard extends StatelessWidget {
  final TripAttendanceProgress progress;
  final bool isPickup;
  final String? nextStopName;
  final int? etaMinutes;
  final double? distanceKm;
  final VoidCallback? onViewStopDetails;

  const TripProgressCard({
    super.key,
    required this.progress,
    required this.isPickup,
    this.nextStopName,
    this.etaMinutes,
    this.distanceKm,
    this.onViewStopDetails,
  });

  @override
  Widget build(BuildContext context) {
    final remainingLabel = isPickup ? 'to pick up' : 'to drop off';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border, width: 1.5),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.softGreen,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.directions_bus,
                            color: AppColors.actionGreen,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 10),
                        const Text(
                          'TRIP IN PROGRESS',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: AppColors.actionGreen,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '${progress.boarded} / ${progress.total} students ${isPickup ? 'picked up' : 'on board'}',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${progress.remaining} $remainingLabel',
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: progress.fraction,
                        minHeight: 8,
                        backgroundColor: AppColors.surfaceAlt,
                        color: AppColors.actionGreen,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                width: 1,
                height: 110,
                color: AppColors.border,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Next stop',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.muted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      nextStopName ?? '—',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppColors.ink,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      etaMinutes != null ? '~$etaMinutes min' : '—',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppColors.actionGreen,
                      ),
                    ),
                    if (distanceKm != null)
                      Text(
                        '${distanceKm!.toStringAsFixed(1)} km',
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    if (onViewStopDetails != null) ...[
                      const SizedBox(height: 8),
                      InkWell(
                        onTap: onViewStopDetails,
                        child: const Row(
                          children: [
                            Text(
                              'View Stop Details',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: AppColors.actionGreen,
                              ),
                            ),
                            Icon(Icons.chevron_right, size: 18, color: AppColors.actionGreen),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
