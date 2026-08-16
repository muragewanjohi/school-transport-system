import 'package:flutter/material.dart';
import 'package:parent_app/config/api_config.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens the public account-deletion flow (Apple 5.1.1(v) / Play data-subject path).
class DeleteAccountLink extends StatelessWidget {
  const DeleteAccountLink({super.key, this.onLaunch});

  final Future<bool> Function(Uri url)? onLaunch;

  Future<void> _open(BuildContext context) async {
    final uri = Uri.parse(ApiConfig.deleteAccountUrl);
    final launcher = onLaunch ??
        ((Uri url) => launchUrl(url, mode: LaunchMode.externalApplication));
    final opened = await launcher(uri);
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open account deletion page.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => _open(context),
      child: const Text(
        'Delete my account',
        style: TextStyle(
          color: Color(0xFF64748B),
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
