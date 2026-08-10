import 'package:flutter/material.dart';
import 'package:parent_app/utils/eta_utils.dart';

/// Compact ETA label + optional delay badge used on map / dashboard cards.
class EtaDisplay extends StatelessWidget {
  final int? etaMinutes;
  final int delaySeconds;
  final String label;
  final double etaFontSize;
  final bool showBadge;

  const EtaDisplay({
    super.key,
    required this.etaMinutes,
    this.delaySeconds = 0,
    this.label = 'ETA',
    this.etaFontSize = 16,
    this.showBadge = true,
  });

  @override
  Widget build(BuildContext context) {
    final badge = showBadge ? formatDelayBadge(delaySeconds) : null;
    final delayed = badge != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            color: Color(0xFF64748B),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          formatEtaMinutes(etaMinutes),
          style: TextStyle(
            fontSize: etaFontSize,
            fontWeight: FontWeight.bold,
            color: delayed ? const Color(0xFFD97706) : const Color(0xFF16A34A),
          ),
        ),
        if (badge != null) ...[
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              badge,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Color(0xFFB45309),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Horizontal metric card used on the parent dashboard.
class EtaMetricCard extends StatelessWidget {
  final String title;
  final int? etaMinutes;
  final int delaySeconds;

  const EtaMetricCard({
    super.key,
    required this.title,
    required this.etaMinutes,
    this.delaySeconds = 0,
  });

  @override
  Widget build(BuildContext context) {
    final badge = formatDelayBadge(delaySeconds);
    final delayed = badge != null;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF1F5F9)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Color(0xFF64748B),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            formatEtaMinutes(etaMinutes),
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: delayed ? const Color(0xFFD97706) : const Color(0xFF16A34A),
            ),
          ),
          if (badge != null) ...[
            const SizedBox(height: 6),
            Text(
              badge,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Color(0xFFB45309),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
