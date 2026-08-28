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
}
