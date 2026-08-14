import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/widgets/trip_stop_action_card.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(home: Scaffold(body: child));
  }

  testWidgets('collapsed next stop shows only the stop name', (tester) async {
    await tester.pumpWidget(
      wrap(
        TripStopActionCard(
          stopName: 'Westlands Gate',
          studentsAtStop: 3,
          etaMinutes: 5,
          distanceKm: 1.2,
          canBoard: false,
          runType: 'PICKUP',
          onNavigate: () {},
          onBoardStudents: () {},
        ),
      ),
    );

    expect(find.text('Next stop: Westlands Gate'), findsOneWidget);
    expect(find.text('Navigate'), findsNothing);
    expect(find.text('Pickup Students'), findsNothing);
  });

  testWidgets('collapsed route-complete shows Route complete', (tester) async {
    await tester.pumpWidget(
      wrap(
        const TripStopActionCard(
          stopName: null,
          studentsAtStop: 0,
          canBoard: false,
          runType: 'PICKUP',
        ),
      ),
    );

    expect(find.text('Route complete'), findsOneWidget);
    expect(find.text('Navigate'), findsNothing);
  });

  testWidgets('expanded next stop Navigate callback fires', (tester) async {
    var navigated = false;
    await tester.pumpWidget(
      wrap(
        TripStopActionCard(
          stopName: 'Westlands Gate',
          studentsAtStop: 3,
          etaMinutes: 5,
          distanceKm: 1.2,
          canBoard: false,
          runType: 'PICKUP',
          onNavigate: () => navigated = true,
          onBoardStudents: () {},
        ),
      ),
    );

    await tester.tap(find.text('Next stop: Westlands Gate'));
    await tester.pumpAndSettle();

    expect(find.text('Navigate'), findsOneWidget);
    expect(find.text('Pickup Students'), findsOneWidget);
    expect(find.textContaining('3 students'), findsOneWidget);

    await tester.tap(find.text('Navigate'));
    await tester.pump();
    expect(navigated, isTrue);
  });
}
