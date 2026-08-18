import 'dart:async';
import 'package:flutter/material.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/stop_visit_logic.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/student_contact_sheet.dart';

enum BoardingIntent { pending, present, absent }

enum StopBoardingAction { completed, skipped }

/// Result returned when the driver completes or skips a stop.
class StopBoardingSheetResult {
  final String stopId;
  final StopBoardingAction action;
  final int dwellSeconds;
  final int studentsActioned;
  final List<String> presentStudentIds;
  final List<String> absentStudentIds;

  const StopBoardingSheetResult({
    required this.stopId,
    required this.action,
    required this.dwellSeconds,
    required this.studentsActioned,
    this.presentStudentIds = const [],
    this.absentStudentIds = const [],
  });
}

typedef StopBoardingCompleteResult = StopBoardingSheetResult;

Future<StopBoardingSheetResult?> showStopBoardingDrawer({
  required BuildContext context,
  required String stopId,
  required String stopName,
  required int stopIndex,
  required int stopCount,
  required List<Map<String, dynamic>> students,
  required bool isPickup,
  required bool arrived,
  DateTime? arrivedAt,
  int minStopDwellSeconds = defaultMinStopDwellSeconds,
  required Future<bool> Function(Map<String, dynamic> student, String status) onUpdateStatus,
}) {
  return showModalBottomSheet<StopBoardingSheetResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) {
      return DraggableScrollableSheet(
        initialChildSize: 0.78,
        minChildSize: 0.45,
        maxChildSize: 0.95,
        builder: (context, scrollController) {
          return _StopBoardingDrawerBody(
            scrollController: scrollController,
            stopId: stopId,
            stopName: stopName,
            stopIndex: stopIndex,
            stopCount: stopCount,
            students: students,
            isPickup: isPickup,
            arrived: arrived,
            arrivedAt: arrivedAt,
            minStopDwellSeconds: minStopDwellSeconds,
            onUpdateStatus: onUpdateStatus,
          );
        },
      );
    },
  );
}

class _StopBoardingDrawerBody extends StatefulWidget {
  final ScrollController scrollController;
  final String stopId;
  final String stopName;
  final int stopIndex;
  final int stopCount;
  final List<Map<String, dynamic>> students;
  final bool isPickup;
  final bool arrived;
  final DateTime? arrivedAt;
  final int minStopDwellSeconds;
  final Future<bool> Function(Map<String, dynamic> student, String status) onUpdateStatus;

  const _StopBoardingDrawerBody({
    required this.scrollController,
    required this.stopId,
    required this.stopName,
    required this.stopIndex,
    required this.stopCount,
    required this.students,
    required this.isPickup,
    required this.arrived,
    this.arrivedAt,
    this.minStopDwellSeconds = defaultMinStopDwellSeconds,
    required this.onUpdateStatus,
  });

  @override
  State<_StopBoardingDrawerBody> createState() => _StopBoardingDrawerBodyState();
}

class _StopBoardingDrawerBodyState extends State<_StopBoardingDrawerBody> {
  late Map<String, BoardingIntent> _intents;
  bool _completing = false;
  Timer? _dwellTimer;
  int _dwellSeconds = 0;

  @override
  void initState() {
    super.initState();
    _intents = {};
    for (final s in widget.students) {
      final id = s['id']?.toString() ?? '';
      if (id.isEmpty) continue;
      _intents[id] = switch (studentListAttendance(s, isPickup: widget.isPickup)) {
        StudentListAttendance.actioned => BoardingIntent.present,
        StudentListAttendance.absent => BoardingIntent.absent,
        StudentListAttendance.pending => BoardingIntent.pending,
      };
    }
    _refreshDwell();
    _dwellTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(_refreshDwell);
    });
  }

  @override
  void dispose() {
    _dwellTimer?.cancel();
    super.dispose();
  }

  void _refreshDwell() {
    _dwellSeconds = dwellSeconds(arrivedAt: widget.arrivedAt, departedAt: DateTime.now());
  }

  int get _picked => _intents.values.where((v) => v == BoardingIntent.present).length;
  int get _absent => _intents.values.where((v) => v == BoardingIntent.absent).length;
  int get _pending => _intents.values.where((v) => v == BoardingIntent.pending).length;
  int get _total => widget.students.length;
  bool get _skipUnlocked => skipStopAllowed(
        arrivedAt: widget.arrivedAt,
        now: DateTime.now(),
        minStopDwellSeconds: widget.minStopDwellSeconds,
      );

  Future<void> _setPresent(Map<String, dynamic> student) async {
    final id = student['id']?.toString() ?? '';
    if (id.isEmpty) return;
    final previous = _intents[id] ?? BoardingIntent.pending;
    setState(() => _intents[id] = BoardingIntent.present);
    // Pickup boards as Present; dropoff alights as Absent.
    final apiStatus = widget.isPickup ? 'Present' : 'Absent';
    final ok = await widget.onUpdateStatus(student, apiStatus);
    if (!ok && mounted) {
      setState(() => _intents[id] = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not update student status'), backgroundColor: Colors.red),
      );
    }
  }

  void _setAbsent(Map<String, dynamic> student) {
    final id = student['id']?.toString() ?? '';
    if (id.isEmpty) return;
    setState(() => _intents[id] = BoardingIntent.absent);
  }

  Future<void> _completeStop() async {
    if (!widget.arrived) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Stay inside the stop geofence to complete this stop.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }
    setState(() => _completing = true);
    final presentIds = <String>[];
    final absentIds = <String>[];
    try {
      for (final s in widget.students) {
        final id = s['id']?.toString() ?? '';
        if (id.isEmpty) continue;
        final intent = _intents[id] ?? BoardingIntent.pending;
        if (intent == BoardingIntent.present) {
          presentIds.add(id);
          continue;
        }
        // Remaining Pending/absent intent → Absent on stop resolve (not dropped_off).
        absentIds.add(id);
        _intents[id] = BoardingIntent.absent;
      }
      if (!mounted) return;
      Navigator.of(context).pop(
        StopBoardingSheetResult(
          stopId: widget.stopId,
          action: StopBoardingAction.completed,
          dwellSeconds: dwellSeconds(arrivedAt: widget.arrivedAt, departedAt: DateTime.now()),
          studentsActioned: presentIds.length,
          presentStudentIds: presentIds,
          absentStudentIds: absentIds,
        ),
      );
    } finally {
      if (mounted) setState(() => _completing = false);
    }
  }

  Future<void> _skipStop() async {
    if (!skipStopAllowed(
      arrivedAt: widget.arrivedAt,
      now: DateTime.now(),
      minStopDwellSeconds: widget.minStopDwellSeconds,
    )) {
      final wait = skipWaitRemainingSeconds(
        arrivedAt: widget.arrivedAt,
        now: DateTime.now(),
        minStopDwellSeconds: widget.minStopDwellSeconds,
      );
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
    Navigator.of(context).pop(
      StopBoardingSheetResult(
        stopId: widget.stopId,
        action: StopBoardingAction.skipped,
        dwellSeconds: dwellSeconds(arrivedAt: widget.arrivedAt, departedAt: DateTime.now()),
        studentsActioned: _picked,
      ),
    );
  }

  String _formatTime(DateTime? t) {
    if (t == null) return '--:--';
    final h = t.hour.toString().padLeft(2, '0');
    final m = t.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  @override
  Widget build(BuildContext context) {
    final pickedLabel = widget.isPickup ? 'PICKED UP' : 'DROPPED OFF';

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.pageBg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          Expanded(
            child: ListView(
              controller: widget.scrollController,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              children: [
                Row(
                  children: [
                    const Icon(Icons.location_on, color: Color(0xFF3B82F6)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        widget.stopName,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: AppColors.ink,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceAlt,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        'Stop ${widget.stopIndex} of ${widget.stopCount}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.muted,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '$_total students expected',
                  style: const TextStyle(fontSize: 13, color: AppColors.muted),
                ),
                if (widget.arrived) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      _Pill(
                        label: 'Arrived ${_formatTime(widget.arrivedAt)}',
                        bg: AppColors.softGreen,
                        fg: AppColors.primaryGreen,
                      ),
                      _Pill(
                        label: 'Time at stop ${formatDwell(_dwellSeconds)}',
                        bg: const Color(0xFFFEF3C7),
                        fg: const Color(0xFF92400E),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.paleGreen,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.softGreen),
                  ),
                  child: Text(
                    'Tap ${boardingActionLabel(isPickup: widget.isPickup)} when the child is ready. Tap a name to call a guardian. Swipe left to mark absent.',
                    style: const TextStyle(fontSize: 13, color: AppColors.ink, height: 1.35),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  widget.isPickup ? 'STUDENTS AT THIS STOP' : 'STUDENTS DROPPING HERE',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppColors.muted,
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 8),
                ...widget.students.map((s) {
                  final id = s['id']?.toString() ?? '';
                  final intent = _intents[id] ?? BoardingIntent.pending;
                  return StudentBoardRow(
                    student: s,
                    intent: intent,
                    isPickup: widget.isPickup,
                    onPresent: () => _setPresent(s),
                    onAbsent: () => _setAbsent(s),
                    onOpenDetails: () => showStudentContactSheet(
                      context: context,
                      student: s,
                      isPickup: widget.isPickup,
                    ),
                  );
                }),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _SummaryCell(
                        label: pickedLabel,
                        value: '$_picked / $_total',
                        accent: AppColors.actionGreen,
                        progress: _total == 0 ? 0 : _picked / _total,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _SummaryCell(
                        label: 'PENDING',
                        value: '$_pending',
                        accent: const Color(0xFF3B82F6),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _SummaryCell(
                        label: 'ABSENT',
                        value: '$_absent',
                        accent: const Color(0xFFEF4444),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.lightbulb_outline, size: 18, color: Color(0xFF2563EB)),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Tip: Swipe a pending student left to mark absent. Tap a name to call a guardian.',
                          style: TextStyle(fontSize: 12, color: Color(0xFF1E40AF)),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _completing || !_skipUnlocked ? null : _skipStop,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFB91C1C),
                        side: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
                        minimumSize: const Size(0, 52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Skip Stop', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _completing ? null : _completeStop,
                      icon: _completing
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.check),
                      label: Text(
                        _completing ? 'Completing…' : 'Complete Stop',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.actionGreen,
                        foregroundColor: Colors.white,
                        minimumSize: const Size(0, 52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color bg;
  final Color fg;

  const _Pill({required this.label, required this.bg, required this.fg});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fg)),
    );
  }
}

class _SummaryCell extends StatelessWidget {
  final String label;
  final String value;
  final Color accent;
  final double? progress;

  const _SummaryCell({
    required this.label,
    required this.value,
    required this.accent,
    this.progress,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: accent)),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: accent)),
          if (progress != null) ...[
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 4,
                backgroundColor: AppColors.surfaceAlt,
                color: accent,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class StudentBoardRow extends StatelessWidget {
  final Map<String, dynamic> student;
  final BoardingIntent intent;
  final bool isPickup;
  final VoidCallback onPresent;
  final VoidCallback onAbsent;
  final VoidCallback onOpenDetails;

  const StudentBoardRow({
    super.key,
    required this.student,
    required this.intent,
    required this.isPickup,
    required this.onPresent,
    required this.onAbsent,
    required this.onOpenDetails,
  });

  @override
  Widget build(BuildContext context) {
    final name = (student['name'] ?? 'Student').toString();
    final grade = (student['grade'] ?? student['class_name'] ?? '').toString();
    final code = (student['student_code'] ?? student['id'] ?? '').toString();
    final shortId = code.length > 8 ? code.substring(0, 8) : code;
    final canSwipeAbsent = intent == BoardingIntent.pending;

    return Dismissible(
      key: ValueKey('board-${student['id']}'),
      direction: canSwipeAbsent ? DismissDirection.endToStart : DismissDirection.none,
      confirmDismiss: (_) async {
        onAbsent();
        return false;
      },
      background: Container(
        alignment: Alignment.centerRight,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.only(right: 16),
        decoration: BoxDecoration(
          color: const Color(0xFFFEE2E2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Text(
          'ABSENT',
          style: TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.bold),
        ),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: InkWell(
                onTap: onOpenDetails,
                borderRadius: BorderRadius.circular(8),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: AppColors.softGreen,
                      child: Text(
                        name.isNotEmpty ? name[0].toUpperCase() : '?',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primaryGreen),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.ink)),
                          Text(
                            [
                              if (grade.isNotEmpty) grade,
                              if (shortId.isNotEmpty) 'ID: $shortId',
                            ].join(' • '),
                            style: const TextStyle(fontSize: 12, color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            if (intent == BoardingIntent.pending)
              ElevatedButton(
                onPressed: onPresent,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.actionGreen,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  minimumSize: Size.zero,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: Text(
                  boardingActionLabel(isPickup: isPickup),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                ),
              )
            else
              _StatusChip(intent: intent, isPickup: isPickup),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final BoardingIntent intent;
  final bool isPickup;

  const _StatusChip({required this.intent, required this.isPickup});

  @override
  Widget build(BuildContext context) {
    late final String label;
    late final Color bg;
    late final Color fg;
    switch (intent) {
      case BoardingIntent.present:
        label = isPickup ? 'Picked' : 'Dropped';
        bg = AppColors.softGreen;
        fg = AppColors.primaryGreen;
        break;
      case BoardingIntent.absent:
        label = 'Absent';
        bg = const Color(0xFFFEE2E2);
        fg = const Color(0xFFB91C1C);
        break;
      case BoardingIntent.pending:
        label = 'Pending';
        bg = const Color(0xFFDBEAFE);
        fg = const Color(0xFF1D4ED8);
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
    );
  }
}
