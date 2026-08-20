import 'package:flutter/material.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

/// Home drop-off actions: campus roll-call first, then Start Trip.
class DropoffHomeActions extends StatelessWidget {
  final bool readyToStart;
  final VoidCallback onBoardStudents;
  final VoidCallback? onStartTrip;

  const DropoffHomeActions({
    super.key,
    required this.readyToStart,
    required this.onBoardStudents,
    this.onStartTrip,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ElevatedButton.icon(
          onPressed: onBoardStudents,
          icon: const Icon(Icons.login, size: 24),
          label: Text(
            homeManifestCtaLabel(isPickup: false),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFFF1F5F9),
            foregroundColor: const Color(0xFF0B1C30),
            side: const BorderSide(color: Color(0xFFE2E8F0), width: 1.5),
            minimumSize: const Size(double.infinity, 54),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 10),
        ElevatedButton.icon(
          onPressed: readyToStart ? onStartTrip : null,
          icon: const Icon(Icons.play_arrow, size: 24),
          label: const Text('START TRIP', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF10B981),
            foregroundColor: Colors.white,
            disabledBackgroundColor: const Color(0xFFCBD5E1),
            disabledForegroundColor: const Color(0xFF64748B),
            minimumSize: const Size(double.infinity, 54),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            elevation: readyToStart ? 2 : 0,
          ),
        ),
        if (!readyToStart) ...[
          const SizedBox(height: 8),
          const Text(
            dropoffStartBlockedMessage,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFFB45309),
            ),
          ),
        ],
      ],
    );
  }
}

/// Full-roster campus boarding (no stop geofence).
class CampusBoardingPanel extends StatelessWidget {
  final List<Map<String, dynamic>> students;
  final bool loading;
  final bool busy;
  final ValueChanged<Map<String, dynamic>> onBoard;
  final ValueChanged<Map<String, dynamic>> onMarkAbsent;
  final VoidCallback? onCompleteBoarding;
  final VoidCallback? onStartTrip;

  const CampusBoardingPanel({
    super.key,
    required this.students,
    required this.onBoard,
    required this.onMarkAbsent,
    this.loading = false,
    this.busy = false,
    this.onCompleteBoarding,
    this.onStartTrip,
  });

  @override
  Widget build(BuildContext context) {
    final counts = campusBoardingCounts(students);
    final ready = dropoffTripReadyToStart(students);
    final hasPending = counts.pending > 0;

    if (loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.actionGreen));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          counts.progressLabel,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink),
        ),
        const SizedBox(height: 4),
        const Text(
          campusToggleHint,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted),
        ),
        const SizedBox(height: 12),
        if (students.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Text(
              'No students on this trip.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600),
            ),
          )
        else
          ...students.map((student) {
            return CampusStudentRow(
              student: student,
              busy: busy,
              onBoarded: () => onBoard(student),
              onAbsent: () => onMarkAbsent(student),
            );
          }),
        const SizedBox(height: 16),
        if (hasPending)
          ElevatedButton(
            onPressed: busy ? null : onCompleteBoarding,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.surfaceAlt,
              foregroundColor: AppColors.ink,
              minimumSize: const Size(double.infinity, 52),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(
              busy ? campusSavingLabel : markRemainingAbsentLabel,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
          )
        else
          ElevatedButton.icon(
            onPressed: busy ? null : onStartTrip,
            icon: busy
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                  )
                : const Icon(Icons.play_arrow),
            label: Text(
              busy ? campusStartingTripLabel : 'START TRIP',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.actionGreen,
              foregroundColor: Colors.white,
              disabledBackgroundColor: AppColors.actionGreen,
              disabledForegroundColor: Colors.white,
              minimumSize: const Size(double.infinity, 54),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        if (!ready && hasPending) ...[
          const SizedBox(height: 8),
          const Text(
            dropoffStartBlockedMessage,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFFB45309)),
          ),
        ],
      ],
    );
  }
}

/// Blocking overlay while attendance is saved or the trip is starting.
class CampusBusyOverlay extends StatelessWidget {
  final String message;

  const CampusBusyOverlay({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return SizedBox.expand(
      child: AbsorbPointer(
        child: ColoredBox(
          color: const Color(0x73000000),
          child: Center(
            child: Material(
              color: AppColors.surface,
              elevation: 8,
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(28, 24, 28, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(color: AppColors.actionGreen),
                    const SizedBox(height: 16),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                        color: AppColors.ink,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class CampusStudentRow extends StatelessWidget {
  final Map<String, dynamic> student;
  final bool busy;
  final VoidCallback onBoarded;
  final VoidCallback onAbsent;

  const CampusStudentRow({
    super.key,
    required this.student,
    required this.onBoarded,
    required this.onAbsent,
    this.busy = false,
  });

  @override
  Widget build(BuildContext context) {
    final name = (student['name'] ?? 'Student').toString();
    final grade = (student['grade'] ?? student['class_name'] ?? '').toString();
    final code = (student['student_code'] ?? student['id'] ?? '').toString();
    final shortId = code.length > 8 ? code.substring(0, 8) : code;
    final selection = campusToggleSelection(student['attendance']?.toString());
    final boarded = campusSwitchIsOn(selection);
    final status = campusSwitchStatusLabel(selection);
    final meta = [
      status,
      if (grade.isNotEmpty) grade,
      if (shortId.isNotEmpty) 'ID: $shortId',
    ].join(' • ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: SwitchListTile(
          value: boarded,
          onChanged: busy
              ? null
              : (on) {
                  if (on) {
                    onBoarded();
                  } else {
                    onAbsent();
                  }
                },
          title: Text(
            name,
            style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.ink),
          ),
          subtitle: Text(
            meta,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selection == CampusToggleSelection.absent
                  ? AppColors.dangerInk
                  : AppColors.muted,
            ),
          ),
          secondary: CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.softGreen,
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primaryGreen),
            ),
          ),
          activeThumbColor: AppColors.actionGreen,
          activeTrackColor: AppColors.softGreen,
          inactiveThumbColor: selection == CampusToggleSelection.absent
              ? AppColors.dangerInk
              : AppColors.mutedLight,
          inactiveTrackColor: selection == CampusToggleSelection.absent
              ? AppColors.dangerSoft
              : AppColors.surfaceAlt,
          contentPadding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
        ),
      ),
    );
  }
}
