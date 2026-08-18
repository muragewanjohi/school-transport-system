import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/widgets/stop_boarding_drawer.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(home: Scaffold(body: child));
  }

  StudentBoardRow pickupRow({
    BoardingIntent intent = BoardingIntent.pending,
    VoidCallback? onPresent,
    VoidCallback? onOpenDetails,
  }) {
    return StudentBoardRow(
      student: {
        'id': 's1',
        'name': 'Amina',
        'grade': 'Grade 3',
        'attendance': 'pending',
      },
      intent: intent,
      isPickup: true,
      onPresent: onPresent ?? () {},
      onAbsent: () {},
      onOpenDetails: onOpenDetails ?? () {},
    );
  }

  testWidgets('Pickup list uses a Boarded button', (tester) async {
    var boarded = false;
    await tester.pumpWidget(wrap(pickupRow(onPresent: () => boarded = true)));

    expect(find.byType(Checkbox), findsNothing);
    expect(find.text('Boarded'), findsOneWidget);

    await tester.tap(find.text('Boarded'));
    await tester.pump();
    expect(boarded, isTrue);
  });

  testWidgets('Drop-off list uses a Dropped off button', (tester) async {
    await tester.pumpWidget(
      wrap(
        StudentBoardRow(
          student: {'id': 's1', 'name': 'Amina', 'attendance': 'pending'},
          intent: BoardingIntent.pending,
          isPickup: false,
          onPresent: () {},
          onAbsent: () {},
          onOpenDetails: () {},
        ),
      ),
    );

    expect(find.text('Dropped off'), findsOneWidget);
    expect(find.text('Boarded'), findsNothing);
    expect(find.byType(Checkbox), findsNothing);
  });

  testWidgets('Absent student has no action button', (tester) async {
    await tester.pumpWidget(wrap(pickupRow(intent: BoardingIntent.absent)));

    expect(find.text('Absent'), findsOneWidget);
    expect(find.text('Boarded'), findsNothing);
    expect(find.byType(ElevatedButton), findsNothing);
  });

  testWidgets('Tapping the name opens details', (tester) async {
    var opened = false;
    await tester.pumpWidget(wrap(pickupRow(onOpenDetails: () => opened = true)));

    await tester.tap(find.text('Amina'));
    await tester.pump();
    expect(opened, isTrue);
  });
}
