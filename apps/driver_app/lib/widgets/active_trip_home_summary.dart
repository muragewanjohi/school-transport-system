import 'package:flutter/material.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

/// Single-row Home summary for an active trip (replaces the Home map).
class ActiveTripHomeSummary extends StatelessWidget {
  final bool isPickup;
  final int boarded;
  final int total;
  final String nextStopName;
  final int? etaMinutes;
  final double? distanceKm;
  final String arrivalClock;
  final String arrivalStatus;
  final VoidCallback? onNavigate;
  final VoidCallback? onOpenTripConsole;

  const ActiveTripHomeSummary({
    super.key,
    required this.isPickup,
    required this.boarded,
    required this.total,
    required this.nextStopName,
    required this.arrivalClock,
    required this.arrivalStatus,
    this.etaMinutes,
    this.distanceKm,
    this.onNavigate,
    this.onOpenTripConsole,
  });

  @override
  Widget build(BuildContext context) {
    final fraction = attendanceProgressFraction(boarded, total);
    final statusColor = arrivalStatus == 'Running late'
        ? AppColors.dangerInk
        : arrivalStatus == 'Awaiting GPS'
            ? AppColors.muted
            : AppColors.primaryGreen;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0A0F172A),
                blurRadius: 8,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _MetricColumn(
                    badge: const _BadgeIcon(
                      icon: Icons.groups,
                      background: AppColors.softGreen,
                      foreground: AppColors.primaryGreen,
                    ),
                    title: homeAttendanceProgressTitle(isPickup: isPickup),
                    value: formatAttendanceCount(boarded, total),
                    footer: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: LinearProgressIndicator(
                            value: fraction,
                            minHeight: 6,
                            backgroundColor: AppColors.border,
                            color: AppColors.actionGreen,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          formatAttendancePercentLabel(boarded, total),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const VerticalDivider(width: 20, thickness: 1, color: AppColors.border),
                Expanded(
                  child: _MetricColumn(
                    badge: const _BadgeIcon(
                      icon: Icons.location_on,
                      background: Color(0xFFDBEAFE),
                      foreground: Color(0xFF1D4ED8),
                    ),
                    title: 'NEXT STOP',
                    value: nextStopName,
                    footer: Text(
                      formatNextStopMeta(etaMinutes: etaMinutes, distanceKm: distanceKm),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.muted,
                      ),
                    ),
                  ),
                ),
                const VerticalDivider(width: 20, thickness: 1, color: AppColors.border),
                Expanded(
                  child: _MetricColumn(
                    badge: const _BadgeIcon(
                      icon: Icons.schedule,
                      background: AppColors.softGreen,
                      foreground: AppColors.primaryGreen,
                    ),
                    title: 'EST. ARRIVAL',
                    value: arrivalClock,
                    footer: Text(
                      arrivalStatus,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: statusColor,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (onNavigate != null || onOpenTripConsole != null) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              if (onNavigate != null)
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: onNavigate,
                    icon: const Icon(Icons.directions, size: 18),
                    label: const Text('Navigate', style: TextStyle(fontWeight: FontWeight.bold)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.ink,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(0, 44),
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              if (onNavigate != null && onOpenTripConsole != null) const SizedBox(width: 8),
              if (onOpenTripConsole != null)
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onOpenTripConsole,
                    icon: const Icon(Icons.map_outlined, size: 18),
                    label: const Text('Trip', style: TextStyle(fontWeight: FontWeight.bold)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primaryGreen,
                      side: const BorderSide(color: AppColors.border),
                      minimumSize: const Size(0, 44),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _MetricColumn extends StatelessWidget {
  final Widget badge;
  final String title;
  final String value;
  final Widget footer;

  const _MetricColumn({
    required this.badge,
    required this.title,
    required this.value,
    required this.footer,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        badge,
        const SizedBox(height: 8),
        Text(
          title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: AppColors.muted,
            letterSpacing: 0.4,
            height: 1.2,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: AppColors.ink,
            height: 1.2,
          ),
        ),
        const SizedBox(height: 8),
        footer,
      ],
    );
  }
}

class _BadgeIcon extends StatelessWidget {
  final IconData icon;
  final Color background;
  final Color foreground;

  const _BadgeIcon({
    required this.icon,
    required this.background,
    required this.foreground,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(color: background, shape: BoxShape.circle),
      child: Icon(icon, size: 16, color: foreground),
    );
  }
}
