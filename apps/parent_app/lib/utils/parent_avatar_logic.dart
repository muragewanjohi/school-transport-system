import 'dart:convert';

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

/// JSON body for `POST /api/parent/avatar` (HMAC session, no PII besides ids).
Map<String, dynamic> avatarApiPayload({
  required String target,
  required String id,
  required List<int> imageBytes,
  String? guardianPhone,
}) {
  return {
    'target': target,
    'id': id,
    'image_base64': base64Encode(imageBytes),
    if (guardianPhone != null && guardianPhone.isNotEmpty) 'guardian_phone': guardianPhone,
  };
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

bool looksLikeHeic(List<int> bytes) {
  if (bytes.length < 12) return false;
  if (bytes[4] != 0x66 || bytes[5] != 0x74 || bytes[6] != 0x79 || bytes[7] != 0x70) {
    return false;
  }
  final brand = String.fromCharCodes(bytes.sublist(8, 12)).toLowerCase();
  return brand == 'heic' ||
      brand == 'heix' ||
      brand == 'heif' ||
      brand == 'mif1' ||
      brand == 'msf1';
}

const avatarReencodeBytesThreshold = 1200000;

/// Must stay under server [AVATAR_MAX_BYTES] after base64 + JSON overhead.
const avatarMaxUploadBytes = 2800000;

bool shouldReencodeAvatar(List<int> bytes) {
  if (looksLikeHeic(bytes)) return true;
  if (bytes.length < 32) return false;
  return bytes.length > avatarReencodeBytesThreshold ||
      bytes.length > avatarMaxUploadBytes;
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
