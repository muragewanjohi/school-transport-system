import 'package:flutter/material.dart';
import 'package:parent_app/utils/parent_map_logic.dart';

/// Compact clickable crew row (driver / conductor) for the Home active-trip card.
class CrewContactCard extends StatelessWidget {
  final String roleLabel;
  final ParentCrewContact contact;
  final VoidCallback? onCall;

  const CrewContactCard({
    super.key,
    required this.roleLabel,
    required this.contact,
    this.onCall,
  });

  void _openPhotoDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => CrewPhotoDialog(
        roleLabel: roleLabel,
        contact: contact,
        onCall: onCall,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final phone = contact.phone?.trim() ?? '';
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => _openPhotoDialog(context),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFA7F3D0)),
          ),
          child: Row(
            children: [
              _CrewAvatar(name: contact.displayName, avatarUrl: contact.avatarUrl, radius: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      roleLabel,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.3,
                        color: Color(0xFF64748B),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      contact.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    if (phone.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        phone,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, color: Color(0xFF475569)),
                      ),
                    ],
                  ],
                ),
              ),
              if (phone.isNotEmpty && onCall != null)
                IconButton(
                  onPressed: onCall,
                  tooltip: 'Call $roleLabel',
                  icon: const Icon(Icons.phone, color: Color(0xFF2563EB), size: 20),
                ),
              const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8), size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

class CrewPhotoDialog extends StatelessWidget {
  final String roleLabel;
  final ParentCrewContact contact;
  final VoidCallback? onCall;

  const CrewPhotoDialog({
    super.key,
    required this.roleLabel,
    required this.contact,
    this.onCall,
  });

  @override
  Widget build(BuildContext context) {
    final phone = contact.phone?.trim() ?? '';
    final url = contact.avatarUrl?.trim() ?? '';
    return Dialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close_rounded, color: Color(0xFF64748B)),
              ),
            ),
            if (url.isNotEmpty)
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Image.network(
                  url,
                  width: 220,
                  height: 220,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => _CrewAvatar(
                    name: contact.displayName,
                    avatarUrl: null,
                    radius: 88,
                  ),
                ),
              )
            else
              _CrewAvatar(name: contact.displayName, avatarUrl: null, radius: 88),
            const SizedBox(height: 16),
            Text(
              roleLabel,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Color(0xFF64748B),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              contact.displayName,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: Color(0xFF0F172A),
              ),
            ),
            if (phone.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                phone,
                style: const TextStyle(fontSize: 14, color: Color(0xFF475569)),
              ),
              if (onCall != null) ...[
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.of(context).pop();
                      onCall!();
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF10B981),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.phone),
                    label: Text('Call $roleLabel'),
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _CrewAvatar extends StatelessWidget {
  final String name;
  final String? avatarUrl;
  final double radius;

  const _CrewAvatar({
    required this.name,
    required this.avatarUrl,
    required this.radius,
  });

  @override
  Widget build(BuildContext context) {
    final url = avatarUrl?.trim() ?? '';
    final size = radius * 2;
    if (url.isNotEmpty) {
      return ClipOval(
        child: Image.network(
          url,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _initialsDisk(),
        ),
      );
    }
    return _initialsDisk();
  }

  Widget _initialsDisk() {
    return CircleAvatar(
      radius: radius,
      backgroundColor: const Color(0xFFDCFCE7),
      child: Text(
        ParentCrewContact.initials(name),
        style: TextStyle(
          fontSize: radius * 0.7,
          fontWeight: FontWeight.w800,
          color: const Color(0xFF15803D),
        ),
      ),
    );
  }
}
