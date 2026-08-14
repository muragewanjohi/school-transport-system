import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/trip_progress_card.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(home: Scaffold(body: child));
  }

  testWidgets('collapsed progress shows picked vs roster', (tester) async {
    await tester.pumpWidget(
      wrap(
        const TripProgressCard(
          progress: TripAttendanceProgress(boarded: 8, total: 12),
          isPickup: true,
        ),
      ),
    );

    expect(find.text('8 / 12 picked'), findsOneWidget);
    expect(find.text('TRIP IN PROGRESS'), findsNothing);
    expect(find.text('8 / 12 students picked'), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets('collapsed dropoff progress shows dropped vs roster', (tester) async {
    await tester.pumpWidget(
      wrap(
        const TripProgressCard(
          progress: TripAttendanceProgress(boarded: 5, total: 12),
          isPickup: false,
        ),
      ),
    );

    expect(find.text('5 / 12 dropped'), findsOneWidget);
  });

  testWidgets('expanding progress shows remaining and bar', (tester) async {
    await tester.pumpWidget(
      wrap(
        const TripProgressCard(
          progress: TripAttendanceProgress(boarded: 8, total: 12),
          isPickup: true,
        ),
      ),
    );

    await tester.tap(find.text('8 / 12 picked'));
    await tester.pumpAndSettle();

    expect(find.text('TRIP IN PROGRESS'), findsOneWidget);
    expect(find.text('8 / 12 students picked'), findsOneWidget);
    expect(find.text('4 to pick up'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
  });
}
