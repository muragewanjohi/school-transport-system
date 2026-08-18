import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/widgets/student_contact_sheet.dart';

void main() {
  testWidgets('Driver can open guardian contact from a student row', (tester) async {
    Uri? launched;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StudentContactSheet(
            isPickup: true,
            launchDialer: (uri) async {
              launched = uri;
              return true;
            },
            student: {
              'name': 'Amina',
              'grade': 'Grade 3',
              'attendance': 'pending',
              'guardians': [
                {'name': 'Jane', 'phone': '+254700000002'},
              ],
            },
          ),
        ),
      ),
    );

    expect(find.text('Amina'), findsOneWidget);
    expect(find.text('Jane'), findsOneWidget);
    expect(find.text('+254700000002'), findsOneWidget);

    await tester.tap(find.text('Call'));
    await tester.pump();
    expect(launched, Uri.parse('tel:+254700000002'));
  });
}
