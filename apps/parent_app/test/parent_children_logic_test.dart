import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_children_logic.dart';

void main() {
  test('Failed refresh keeps the login cache', () {
    final cached = [
      {'id': 'child-1', 'name': 'Brian Demo'},
    ];

    expect(
      resolveParentChildren(
        cached: cached,
        apiChildren: null,
        supabaseChildren: const [],
      ),
      cached,
    );
  });

  test('API roster wins even when empty', () {
    expect(
      resolveParentChildren(
        cached: [
          {'id': 'child-1', 'name': 'Brian Demo'},
        ],
        apiChildren: const [],
        supabaseChildren: const [],
      ),
      isEmpty,
    );
  });

  test('awaitOrNull returns null when the future never completes in time', () async {
    final result = await awaitOrNull(
      Future<String>.delayed(const Duration(seconds: 2), () => 'late'),
      timeout: const Duration(milliseconds: 20),
    );
    expect(result, isNull);
  });

  test('awaitOrNull returns the value when the future completes in time', () async {
    final result = await awaitOrNull(
      Future.value('ok'),
      timeout: const Duration(seconds: 1),
    );
    expect(result, 'ok');
  });

  test('Supabase roster is used when the API is unavailable', () {
    final fromSupabase = [
      {'id': 'child-2', 'name': 'Grace Demo'},
    ];
    expect(
      resolveParentChildren(
        cached: const [],
        apiChildren: null,
        supabaseChildren: fromSupabase,
      ),
      fromSupabase,
    );
  });
}
