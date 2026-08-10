import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/widgets/eta_display.dart';

void main() {
  testWidgets(
    'Parent app › live ETA replaces placeholders › shows 12 mins and delay badge',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EtaDisplay(
              etaMinutes: 12,
              delaySeconds: 360,
              label: 'ETA',
            ),
          ),
        ),
      );

      expect(find.text('ETA'), findsOneWidget);
      expect(find.text('12 mins'), findsOneWidget);
      expect(find.text('Running 6 min late'), findsOneWidget);
    },
  );

  testWidgets(
    'Parent app › delay under 5 minutes › no badge',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EtaDisplay(
              etaMinutes: 8,
              delaySeconds: 120,
            ),
          ),
        ),
      );

      expect(find.text('8 mins'), findsOneWidget);
      expect(find.textContaining('late'), findsNothing);
    },
  );

  testWidgets(
    'EtaMetricCard › shows title, ETA, and delay badge',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EtaMetricCard(
              title: 'ETA to School',
              etaMinutes: 12,
              delaySeconds: 360,
            ),
          ),
        ),
      );

      expect(find.text('ETA to School'), findsOneWidget);
      expect(find.text('12 mins'), findsOneWidget);
      expect(find.text('Running 6 min late'), findsOneWidget);
    },
  );
}
