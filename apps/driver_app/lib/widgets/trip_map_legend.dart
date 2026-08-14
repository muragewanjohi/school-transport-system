import 'package:flutter/material.dart';
import 'package:driver_app/theme/app_colors.dart';

/// Compact legend for Trip map stop marker states.
class TripMapLegend extends StatelessWidget {
  const TripMapLegend({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 4, offset: Offset(0, 1)),
        ],
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _LegendRow(color: Color(0xFF10B981), label: 'On Route', icon: Icons.directions_bus),
          _LegendRow(color: Color(0xFF3B82F6), label: 'Next Stop'),
          _LegendRow(color: Color(0xFF94A3B8), label: 'Upcoming'),
          _LegendRow(color: Color(0xFF10B981), label: 'Completed', icon: Icons.check_circle),
          _LegendRow(color: Color(0xFFF59E0B), label: 'Visited'),
          _LegendRow(color: Color(0xFFEF4444), label: 'Not Visited'),
        ],
      ),
    );
  }
}

class _LegendRow extends StatelessWidget {
  final Color color;
  final String label;
  final IconData? icon;

  const _LegendRow({required this.color, required this.label, this.icon});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null)
            Icon(icon, size: 12, color: color)
          else
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
