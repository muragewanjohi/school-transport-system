import 'package:flutter/material.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

class TripProgressCard extends StatefulWidget {
  final TripAttendanceProgress progress;
  final bool isPickup;

  const TripProgressCard({
    super.key,
    required this.progress,
    required this.isPickup,
  });

  @override
  State<TripProgressCard> createState() => _TripProgressCardState();
}

class _TripProgressCardState extends State<TripProgressCard> {
  bool _expanded = false;

  String get _verb => attendanceDoneWord(isPickup: widget.isPickup);

  String get _collapsedSummary =>
      '${widget.progress.boarded} / ${widget.progress.total} $_verb';

  @override
  Widget build(BuildContext context) {
    final remainingLabel = widget.isPickup ? 'to pick up' : 'to drop off';
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
                  Expanded(
                    child: Text(
                      _expanded ? 'TRIP IN PROGRESS' : _collapsedSummary,
                      style: TextStyle(
                        fontSize: _expanded ? 13 : 15,
                        fontWeight: FontWeight.bold,
                        color: _expanded ? AppColors.actionGreen : AppColors.ink,
                        letterSpacing: _expanded ? 0.4 : 0,
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
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${widget.progress.boarded} / ${widget.progress.total} students $_verb',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${widget.progress.remaining} $remainingLabel',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: widget.progress.fraction,
                      minHeight: 8,
                      backgroundColor: AppColors.surfaceAlt,
                      color: AppColors.actionGreen,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
