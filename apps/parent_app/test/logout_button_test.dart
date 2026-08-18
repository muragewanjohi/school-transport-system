import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/widgets/logout_button.dart';

void main() {
  testWidgets('Profile always offers Log out', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LogoutButton(onConfirm: () {}),
        ),
      ),
    );

    expect(find.text('Log out'), findsOneWidget);
  });

  testWidgets('confirming Log out runs the callback', (tester) async {
    var confirmed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LogoutButton(onConfirm: () => confirmed = true),
        ),
      ),
    );

    await tester.tap(find.widgetWithText(ElevatedButton, 'Log out'));
    await tester.pumpAndSettle();
    expect(find.text('Are you sure you want to log out?'), findsOneWidget);

    await tester.tap(find.widgetWithText(TextButton, 'Log out'));
    await tester.pumpAndSettle();
    expect(confirmed, isTrue);
  });
}
