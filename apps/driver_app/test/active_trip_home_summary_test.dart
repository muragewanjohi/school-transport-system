import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/widgets/active_trip_home_summary.dart';

void main() {
  testWidgets('Home summary shows attendance, next stop, and arrival in one row', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ActiveTripHomeSummary(
              isPickup: false,
              boarded: 2,
              total: 4,
              nextStopName: 'Riverside',
              etaMinutes: 3,
              distanceKm: 1.2,
              arrivalClock: '13:25',
              arrivalStatus: 'On time',
            ),
          ),
        ),
      ),
    );

    expect(find.text('STUDENTS DROPPED OFF'), findsOneWidget);
    expect(find.text('2 / 4'), findsOneWidget);
    expect(find.text('50% completed'), findsOneWidget);
    expect(find.text('NEXT STOP'), findsOneWidget);
    expect(find.text('Riverside'), findsOneWidget);
    expect(find.text('3 min • 1.2 km'), findsOneWidget);
    expect(find.text('EST. ARRIVAL'), findsOneWidget);
    expect(find.text('13:25'), findsOneWidget);
    expect(find.text('On time'), findsOneWidget);
    expect(find.byType(VerticalDivider), findsNWidgets(2));
  });
}
