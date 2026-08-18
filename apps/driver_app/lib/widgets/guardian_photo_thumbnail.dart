import 'package:flutter/material.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';

String guardianInitials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.isNotEmpty) return parts[0][0].toUpperCase();
  return '?';
}

/// Round photo, or initials thumbnail when [photoUrl] is missing or fails to load.
class GuardianPhotoThumbnail extends StatelessWidget {
  final String name;
  final String? photoUrl;
  final double radius;

  const GuardianPhotoThumbnail({
    super.key,
    required this.name,
    this.photoUrl,
    this.radius = 20,
  });

  @override
  Widget build(BuildContext context) {
    final url = photoUrl?.trim() ?? '';
    final size = radius * 2;
    if (url.isEmpty) {
      return _InitialsDisk(name: name, radius: radius);
    }
    return ClipOval(
      child: Image.network(
        url,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) =>
            _InitialsDisk(name: name, radius: radius),
      ),
    );
  }
}

class _InitialsDisk extends StatelessWidget {
  final String name;
  final double radius;

  const _InitialsDisk({required this.name, required this.radius});

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: radius,
      backgroundColor: AppColors.surfaceAlt,
      child: Text(
        guardianInitials(name),
        style: TextStyle(
          fontSize: radius * 0.7,
          fontWeight: FontWeight.w800,
          color: AppColors.muted,
        ),
      ),
    );
  }
}

class GuardianContactTile extends StatelessWidget {
  final GuardianContact contact;
  final VoidCallback? onCall;

  const GuardianContactTile({
    super.key,
    required this.contact,
    this.onCall,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: GuardianPhotoThumbnail(name: contact.name, photoUrl: contact.photoUrl),
      title: Text(
        contact.name,
        style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink),
      ),
      subtitle: Text(
        contact.phone,
        style: const TextStyle(fontSize: 13, color: AppColors.muted),
      ),
      trailing: onCall == null
          ? null
          : IconButton(
              tooltip: 'Call ${contact.name}',
              onPressed: onCall,
              icon: const Icon(Icons.phone_in_talk, color: AppColors.actionGreen),
            ),
    );
  }
}
