import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_map_logic.dart';
import 'package:parent_app/widgets/crew_contact_card.dart';

void main() {
  testWidgets('CrewContactCard shows name phone and opens photo dialog', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CrewContactCard(
            roleLabel: 'DRIVER',
            contact: const ParentCrewContact(
              name: 'Jane Driver',
              phone: '+254700000001',
              avatarUrl: null,
            ),
          ),
        ),
      ),
    );

    expect(find.text('DRIVER'), findsOneWidget);
    expect(find.text('Jane Driver'), findsOneWidget);
    expect(find.text('+254700000001'), findsOneWidget);
    expect(find.text('JD'), findsOneWidget);

    await tester.tap(find.byType(CrewContactCard));
    await tester.pumpAndSettle();

    expect(find.byType(CrewPhotoDialog), findsOneWidget);
    expect(find.text('Jane Driver'), findsWidgets);
  });
}
