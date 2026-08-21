/// Pure helpers for parent avatar uploads (storage path + guardian JSONB).

/// Storage RLS requires the first folder segment to equal `auth.uid()`.
String avatarStoragePath({
  required String ownerUserId,
  required String targetKey,
  required String entityId,
  DateTime? now,
}) {
  final ts = (now ?? DateTime.now()).millisecondsSinceEpoch;
  return '$ownerUserId/${targetKey}_${entityId}_$ts.jpg';
}

/// Object path inside the avatars bucket from a public URL (or null if unparseable).
String? avatarObjectPathFromPublicUrl(String publicUrl) {
  final marker = '/avatars/';
  final idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  final path = publicUrl.substring(idx + marker.length).split('?').first;
  return path.isEmpty ? null : path;
}

String normalizeGuardianPhone(String? phone) {
  if (phone == null) return '';
  return phone.replaceAll(RegExp(r'[\s\-()]+'), '');
}

bool guardianPhonesMatch(String? a, String? b) {
  final left = normalizeGuardianPhone(a);
  final right = normalizeGuardianPhone(b);
  if (left.isEmpty || right.isEmpty) return false;
  if (left == right) return true;
  String dig(String v) => v.replaceAll(RegExp(r'\D'), '');
  final ld = dig(left);
  final rd = dig(right);
  if (ld.isEmpty || rd.isEmpty) return false;
  if (ld == rd) return true;
  // Kenya local 07… vs +2547…
  if (ld.length >= 9 && rd.length >= 9) {
    return ld.substring(ld.length - 9) == rd.substring(rd.length - 9);
  }
  return false;
}

/// Returns updated guardians list with [avatarUrl] on the matching phone entry.
List<Map<String, dynamic>> withGuardianAvatarUrl({
  required List<dynamic> guardians,
  required String guardianPhone,
  required String? avatarUrl,
}) {
  final out = <Map<String, dynamic>>[];
  var matched = false;
  for (final raw in guardians) {
    if (raw is! Map) continue;
    final g = Map<String, dynamic>.from(raw);
    if (!matched && guardianPhonesMatch(g['phone']?.toString(), guardianPhone)) {
      g['avatar_url'] = avatarUrl;
      matched = true;
    }
    out.add(g);
  }
  return out;
}

int indexOfGuardianByPhone(List<dynamic> guardians, String guardianPhone) {
  for (var i = 0; i < guardians.length; i++) {
    final raw = guardians[i];
    if (raw is! Map) continue;
    if (guardianPhonesMatch(raw['phone']?.toString(), guardianPhone)) return i;
  }
  return -1;
}
