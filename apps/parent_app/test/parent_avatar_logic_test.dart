import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_avatar_logic.dart';

void main() {
  test('avatarStoragePath prefixes auth uid folder for RLS', () {
    final path = avatarStoragePath(
      ownerUserId: 'aaaa-bbbb',
      targetKey: 'students',
      entityId: 'student-1',
      now: DateTime.utc(2026, 8, 21, 12),
    );
    expect(path.startsWith('aaaa-bbbb/students_student-1_'), isTrue);
    expect(path.endsWith('.jpg'), isTrue);
    expect(path.contains('public/'), isFalse);
  });

  test('avatarObjectPathFromPublicUrl strips query and bucket prefix', () {
    expect(
      avatarObjectPathFromPublicUrl(
        'https://x.supabase.co/storage/v1/object/public/avatars/uid/students_1_2.jpg?v=1',
      ),
      'uid/students_1_2.jpg',
    );
    expect(avatarObjectPathFromPublicUrl('https://example.com/nope'), isNull);
  });

  test('withGuardianAvatarUrl updates matching phone entry', () {
    final updated = withGuardianAvatarUrl(
      guardians: [
        {'name': 'Parent', 'phone': '+254700000001'},
        {'name': 'Aunt', 'phone': '0700 111 222'},
      ],
      guardianPhone: '+254700111222',
      avatarUrl: 'https://cdn/avatar.jpg',
    );
    expect(updated[0]['avatar_url'], isNull);
    expect(updated[1]['avatar_url'], 'https://cdn/avatar.jpg');
    expect(indexOfGuardianByPhone(updated, '0700111222'), 1);
  });

  test('avatarApiPayload includes target, id, and base64 bytes', () {
    final payload = avatarApiPayload(
      target: 'students',
      id: 'student-1',
      imageBytes: [1, 2, 3, 4],
      guardianPhone: '+254700111222',
    );
    expect(payload['target'], 'students');
    expect(payload['id'], 'student-1');
    expect(payload['guardian_phone'], '+254700111222');
    expect(payload['image_base64'], isA<String>());
    expect((payload['image_base64'] as String).isNotEmpty, isTrue);
  });

  test('looksLikeHeic detects ftyp heic/mif1', () {
    final heic = List<int>.filled(16, 0);
    heic[4] = 0x66;
    heic[5] = 0x74;
    heic[6] = 0x79;
    heic[7] = 0x70;
    heic[8] = 0x68;
    heic[9] = 0x65;
    heic[10] = 0x69;
    heic[11] = 0x63;
    expect(looksLikeHeic(heic), isTrue);
    expect(shouldReencodeAvatar(heic), isTrue);

    final jpeg = List<int>.filled(64, 0);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    expect(looksLikeHeic(jpeg), isFalse);
    expect(shouldReencodeAvatar(jpeg), isFalse);

    final largeJpeg = List<int>.filled(avatarReencodeBytesThreshold + 10, 0);
    largeJpeg[0] = 0xff;
    largeJpeg[1] = 0xd8;
    expect(shouldReencodeAvatar(largeJpeg), isTrue);
  });
}
