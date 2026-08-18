import 'package:flutter/material.dart';
import 'package:parent_app/theme/parent_colors.dart';

class LogoutButton extends StatelessWidget {
  final VoidCallback onConfirm;
  final bool compact;

  const LogoutButton({
    super.key,
    required this.onConfirm,
    this.compact = false,
  });

  Future<void> _confirm(BuildContext context) async {
    final shouldLogout = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Log out'),
        content: const Text('Are you sure you want to log out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Log out', style: TextStyle(color: ParentColors.error)),
          ),
        ],
      ),
    );
    if (shouldLogout == true) {
      onConfirm();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return TextButton.icon(
        onPressed: () => _confirm(context),
        icon: const Icon(Icons.logout_rounded, size: 18, color: ParentColors.error),
        label: const Text(
          'Log out',
          style: TextStyle(
            color: ParentColors.error,
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton.icon(
        onPressed: () => _confirm(context),
        style: ElevatedButton.styleFrom(
          backgroundColor: ParentColors.errorSoft,
          foregroundColor: ParentColors.error,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
        icon: const Icon(Icons.logout_rounded, size: 20),
        label: const Text('Log out', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
      ),
    );
  }
}
