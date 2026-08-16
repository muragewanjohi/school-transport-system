import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/widgets/delete_account_link.dart';

void main() {
  testWidgets(
    'Parent requests account deletion › opens delete-account URL',
    (tester) async {
      Uri? launched;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DeleteAccountLink(
              onLaunch: (uri) async {
                launched = uri;
                return true;
              },
            ),
          ),
        ),
      );

      await tester.tap(find.text('Delete my account'));
      await tester.pump();

      expect(launched, Uri.parse(ApiConfig.deleteAccountUrl));
      expect(find.text('Could not open account deletion page.'), findsNothing);
    },
  );

  testWidgets(
    'Delete-account page cannot open › shows error',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DeleteAccountLink(
              onLaunch: (_) async => false,
            ),
          ),
        ),
      );

      await tester.tap(find.text('Delete my account'));
      await tester.pump();

      expect(find.text('Could not open account deletion page.'), findsOneWidget);
    },
  );
}
