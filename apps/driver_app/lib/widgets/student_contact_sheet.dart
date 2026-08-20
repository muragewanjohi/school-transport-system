import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/guardian_photo_thumbnail.dart';

Future<void> showStudentContactSheet({
  required BuildContext context,
  required Map<String, dynamic> student,
  required bool isPickup,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => StudentContactSheet(student: student, isPickup: isPickup),
  );
}

class StudentContactSheet extends StatelessWidget {
  final Map<String, dynamic> student;
  final bool isPickup;
  final Future<bool> Function(Uri uri)? launchDialer;

  const StudentContactSheet({
    super.key,
    required this.student,
    required this.isPickup,
    this.launchDialer,
  });

  @override
  Widget build(BuildContext context) {
    final name = (student['name'] ?? 'Student').toString();
    final grade = (student['grade'] ?? student['class_name'] ?? '').toString();
    final attendance = studentListAttendance(student, isPickup: isPickup);
    final guardians = parseStudentGuardians(student['guardians']);
    final statusLabel = studentListStatusLabel(attendance);
    final isComplete = studentListActionComplete(attendance, isPickup: isPickup);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
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
            const SizedBox(height: 16),
            Text(
              name,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: AppColors.ink,
              ),
            ),
            if (grade.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(grade, style: const TextStyle(fontSize: 14, color: AppColors.muted)),
            ],
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: attendance == StudentListAttendance.absent
                      ? AppColors.dangerSoft
                      : isComplete
                          ? AppColors.softGreen
                          : attendance == StudentListAttendance.boarded
                              ? AppColors.softGreen
                              : const Color(0xFFDBEAFE),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: attendance == StudentListAttendance.absent
                        ? AppColors.dangerInk
                        : isComplete || attendance == StudentListAttendance.boarded
                            ? AppColors.primaryGreen
                            : const Color(0xFF1D4ED8),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'GUARDIANS',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
                color: AppColors.muted,
              ),
            ),
            const SizedBox(height: 8),
            if (guardians.isEmpty)
              const Text(
                'No parent / guardian registered',
                style: TextStyle(fontSize: 14, color: AppColors.ink),
              )
            else
              ...guardians.map((g) => _GuardianCallTile(
                    contact: g,
                    launchDialer: launchDialer,
                  )),
          ],
        ),
      ),
    );
  }
}

class _GuardianCallTile extends StatelessWidget {
  final GuardianContact contact;
  final Future<bool> Function(Uri uri)? launchDialer;

  const _GuardianCallTile({required this.contact, this.launchDialer});

  Future<void> _call(BuildContext context) async {
    final uri = guardianTelUri(contact.phone);
    if (uri == null) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No valid phone number to call.')),
      );
      return;
    }
    final launcher = launchDialer ?? (u) => launchUrl(u, mode: LaunchMode.externalApplication);
    final ok = await launcher(uri);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the phone dialer.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: GuardianPhotoThumbnail(name: contact.name, photoUrl: contact.photoUrl),
      title: Text(contact.name, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
      subtitle: Text(
        contact.phone,
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink),
      ),
      trailing: ElevatedButton.icon(
        onPressed: () => _call(context),
        icon: const Icon(Icons.phone_in_talk, size: 18),
        label: const Text('Call'),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.actionGreen,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
      ),
    );
  }
}
