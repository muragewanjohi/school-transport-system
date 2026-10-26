import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:parent_app/services/parent_children_fallback.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Real SupabaseClient over a fake HTTP layer that records each request.
SupabaseClient clientReturning(
  List<(Object, int)> responses,
  List<Uri> requests,
) {
  var call = 0;
  final mock = MockClient((request) async {
    requests.add(request.url);
    final (body, status) = responses[call < responses.length ? call : responses.length - 1];
    call += 1;
    // postgrest reads response.request, so attach it
    return http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
      request: request,
    );
  });
  return SupabaseClient(
    'https://example.supabase.co',
    'test-anon-key',
    httpClient: mock,
    authOptions: const AuthClientOptions(autoRefreshToken: false),
  );
}

(Object, int) jsonResponse(Object body, [int status = 200]) => (body, status);

void main() {
  group('ParentChildrenFallback.fetch', () {
    test(
      'Given the children API is unreachable, When the fallback queries students, Then it is not filtered by parent_id',
      () async {
        // Arrange
        final requests = <Uri>[];
        final client = clientReturning([
          jsonResponse([
            {'id': 'brian', 'name': 'Brian Demo'},
          ]),
        ], requests);

        // Act
        final rows = await ParentChildrenFallback.fetch(client);

        // Assert
        expect(rows, hasLength(1));
        expect(requests, hasLength(1));
        expect(requests.single.path, '/rest/v1/students');
        expect(requests.single.queryParameters.containsKey('select'), isTrue);
        expect(requests.single.queryParameters.containsKey('parent_id'), isFalse);
      },
    );

    test(
      'Given the nested select fails, When the fallback runs, Then it retries the simple select without parent_id',
      () async {
        final requests = <Uri>[];
        final client = clientReturning([
          jsonResponse({'message': 'relationship not found'}, 400),
          jsonResponse([
            {'id': 'brian', 'name': 'Brian Demo'},
          ]),
        ], requests);

        final rows = await ParentChildrenFallback.fetch(client);

        expect(rows, hasLength(1));
        expect(requests, hasLength(2));
        expect(
          requests.last.queryParameters['select'],
          ParentChildrenFallback.simpleSelect.replaceAll(' ', ''),
        );
        expect(requests.any((u) => u.queryParameters.containsKey('parent_id')), isFalse);
      },
    );

    test(
      'Given both selects fail, When the fallback runs, Then it returns null so the cached roster is kept',
      () async {
        final requests = <Uri>[];
        final client = clientReturning([
          jsonResponse({'message': 'boom'}, 500),
        ], requests);

        final rows = await ParentChildrenFallback.fetch(client);

        expect(rows, isNull);
      },
    );
  });
}
