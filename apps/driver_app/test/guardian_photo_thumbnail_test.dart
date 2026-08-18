import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/guardian_photo_thumbnail.dart';

void main() {
  testWidgets('View Students lists guardians with initials thumbnail when photo is missing', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GuardianContactTile(
            contact: const GuardianContact(
              name: 'Jane Wanjiku',
              phone: '+254700000002',
            ),
          ),
        ),
      ),
    );

    expect(find.text('Jane Wanjiku'), findsOneWidget);
    expect(find.text('+254700000002'), findsOneWidget);
    expect(find.text('JW'), findsOneWidget);
  });
}
