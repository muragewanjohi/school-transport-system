import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/campus_boarding_panel.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));
  }

  testWidgets('Drop-off Home card requires Board Students first', (tester) async {
    await tester.pumpWidget(
      wrap(
        DropoffHomeActions(
          readyToStart: false,
          onBoardStudents: () {},
          onStartTrip: () {},
        ),
      ),
    );

    expect(find.text('BOARD STUDENTS'), findsOneWidget);
    expect(find.text('START TRIP'), findsOneWidget);
    expect(find.text(dropoffStartBlockedMessage), findsOneWidget);

    final startTrip = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'START TRIP'),
    );
    expect(startTrip.onPressed, isNull);
  });

  testWidgets('Drop-off Start Trip is enabled when roster is resolved', (tester) async {
    var started = false;
    await tester.pumpWidget(
      wrap(
        DropoffHomeActions(
          readyToStart: true,
          onBoardStudents: () {},
          onStartTrip: () => started = true,
        ),
      ),
    );

    expect(find.text(dropoffStartBlockedMessage), findsNothing);
    await tester.tap(find.text('START TRIP'));
    await tester.pump();
    expect(started, isTrue);
  });

  testWidgets('Pending SwitchListTile is off and not boarded', (tester) async {
    await tester.pumpWidget(
      wrap(
        CampusBoardingPanel(
          students: [
            {'id': '1', 'name': 'Brian Demo', 'attendance': 'pending'},
          ],
          onBoard: (_) {},
          onMarkAbsent: (_) {},
        ),
      ),
    );

    expect(find.text('0 boarded · 0 absent · 1 remaining'), findsOneWidget);
    expect(find.text(campusToggleHint), findsOneWidget);
    expect(find.textContaining('Pending'), findsOneWidget);
    expect(find.byType(SwitchListTile), findsOneWidget);
    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isFalse);
    expect(find.text('START TRIP'), findsNothing);
  });

  testWidgets('Switching on marks the student boarded', (tester) async {
    String? boardedId;
    await tester.pumpWidget(
      wrap(
        CampusBoardingPanel(
          students: [
            {'id': '1', 'name': 'Brian Demo', 'attendance': 'pending'},
          ],
          onBoard: (student) => boardedId = student['id']?.toString(),
          onMarkAbsent: (_) {},
        ),
      ),
    );

    await tester.tap(find.byType(SwitchListTile));
    await tester.pump();
    expect(boardedId, '1');
  });

  testWidgets('Switching off a boarded student marks them absent', (tester) async {
    String? marked;
    await tester.pumpWidget(
      wrap(
        CampusBoardingPanel(
          students: [
            {'id': '1', 'name': 'Brian Demo', 'attendance': 'boarded'},
          ],
          onBoard: (_) {},
          onMarkAbsent: (student) => marked = student['id']?.toString(),
        ),
      ),
    );

    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isTrue);
    await tester.tap(find.byType(SwitchListTile));
    await tester.pump();
    expect(marked, '1');
  });

  testWidgets('Mark remaining absent dumps leftover pending, not boarded', (tester) async {
    var completeTapped = false;
    await tester.pumpWidget(
      wrap(
        CampusBoardingPanel(
          students: [
            {'id': '1', 'name': 'Amina', 'attendance': 'boarded'},
            {'id': '2', 'name': 'Leo', 'attendance': 'pending'},
          ],
          onBoard: (_) {},
          onMarkAbsent: (_) {},
          onCompleteBoarding: () => completeTapped = true,
        ),
      ),
    );

    expect(find.text('1 boarded · 0 absent · 1 remaining'), findsOneWidget);
    expect(find.text(markRemainingAbsentLabel), findsOneWidget);
    expect(find.text('START TRIP'), findsNothing);

    await tester.tap(find.text(markRemainingAbsentLabel));
    await tester.pump();
    expect(completeTapped, isTrue);
  });

  testWidgets('Start Trip stays off while any student is still pending', (tester) async {
    var started = false;
    await tester.pumpWidget(
      wrap(
        CampusBoardingPanel(
          students: [
            {'id': '1', 'name': 'Amina', 'attendance': 'boarded'},
            {'id': '2', 'name': 'Leo', 'attendance': 'pending'},
          ],
          onBoard: (_) {},
          onMarkAbsent: (_) {},
          onStartTrip: () => started = true,
        ),
      ),
    );

    expect(find.text('START TRIP'), findsNothing);
    expect(find.text(dropoffStartBlockedMessage), findsOneWidget);
    expect(started, isFalse);
  });

  testWidgets('Resolved campus roster shows Start Trip', (tester) async {
    var started = false;
    await tester.pumpWidget(
      wrap(
        CampusBoardingPanel(
          students: [
            {'id': '1', 'name': 'Amina', 'attendance': 'boarded'},
            {'id': '2', 'name': 'Leo', 'attendance': 'absent'},
          ],
          onBoard: (_) {},
          onMarkAbsent: (_) {},
          onStartTrip: () => started = true,
        ),
      ),
    );

    expect(find.text(markRemainingAbsentLabel), findsNothing);
    expect(find.text('START TRIP'), findsOneWidget);
    await tester.tap(find.text('START TRIP'));
    await tester.pump();
    expect(started, isTrue);
  });

  testWidgets('Busy start trip shows Starting trip on the button', (tester) async {
    await tester.pumpWidget(
      wrap(
        CampusBoardingPanel(
          busy: true,
          students: [
            {'id': '1', 'name': 'Amina', 'attendance': 'boarded'},
            {'id': '2', 'name': 'Leo', 'attendance': 'absent'},
          ],
          onBoard: (_) {},
          onMarkAbsent: (_) {},
          onStartTrip: () {},
        ),
      ),
    );

    expect(find.text('START TRIP'), findsNothing);
    expect(find.text(campusStartingTripLabel), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    final startTrip = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
    expect(startTrip.onPressed, isNull);
  });

  testWidgets('Busy mark remaining shows Saving on the button', (tester) async {
    await tester.pumpWidget(
      wrap(
        CampusBoardingPanel(
          busy: true,
          students: [
            {'id': '1', 'name': 'Amina', 'attendance': 'boarded'},
            {'id': '2', 'name': 'Leo', 'attendance': 'pending'},
          ],
          onBoard: (_) {},
          onMarkAbsent: (_) {},
          onCompleteBoarding: () {},
        ),
      ),
    );

    expect(find.text(markRemainingAbsentLabel), findsNothing);
    expect(find.text(campusSavingLabel), findsOneWidget);
  });

  testWidgets('Campus busy overlay shows Starting trip', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Stack(
            children: const [
              SizedBox.expand(),
              CampusBusyOverlay(message: campusStartingTripLabel),
            ],
          ),
        ),
      ),
    );

    expect(find.text(campusStartingTripLabel), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
