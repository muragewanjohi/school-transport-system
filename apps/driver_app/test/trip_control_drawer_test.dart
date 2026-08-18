import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/utils/stop_visit_logic.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/trip_control_drawer.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(home: Scaffold(body: child));
  }

  TripControlDrawer pickupDrawer({
    VoidCallback? onNavigate,
    VoidCallback? onSkipStop,
    VoidCallback? onEndTrip,
    VoidCallback? onBoardStudents,
    VoidCallback? onViewStudents,
    VoidCallback? onToggleGpsReplay,
    bool gpsReplayActive = false,
    StopApproachPhase stopPhase = StopApproachPhase.arrived,
    bool skipUnlocked = true,
  }) {
    return TripControlDrawer(
      progress: const TripAttendanceProgress(boarded: 8, total: 24),
      isPickup: true,
      runType: 'PICKUP',
      nextStopName: 'Bypass, Ruaka',
      nextStopNumber: 3,
      studentsAtStop: 6,
      etaMinutes: 4,
      distanceKm: 1.2,
      segments: const [
        StopProgressSegment(stopId: 'a', kind: StopProgressKind.completed),
        StopProgressSegment(stopId: 'b', kind: StopProgressKind.completed),
        StopProgressSegment(stopId: 'c', kind: StopProgressKind.current),
        StopProgressSegment(stopId: 'd', kind: StopProgressKind.upcoming),
      ],
      upcomingStopName: 'La Cascade',
      upcomingStopNumber: 4,
      upcomingEtaMinutes: 11,
      stopPhase: stopPhase,
      skipUnlocked: skipUnlocked,
      onBoardStudents: onBoardStudents ?? () {},
      onSkipStop: onSkipStop ?? () {},
      onNavigate: onNavigate ?? () {},
      onViewStudents: onViewStudents ?? () {},
      onEndTrip: onEndTrip ?? () {},
      onToggleGpsReplay: onToggleGpsReplay,
      gpsReplayActive: gpsReplayActive,
    );
  }

  testWidgets('Drawer shows attendance, next stop, and pickup CTA', (tester) async {
    await tester.pumpWidget(wrap(pickupDrawer()));

    expect(find.text('8 of 24 picked'), findsOneWidget);
    expect(find.text('Bypass, Ruaka'), findsOneWidget);
    expect(find.text('6 students waiting'), findsOneWidget);
    expect(find.text('Pickup Students'), findsOneWidget);
    expect(find.text('4 min'), findsOneWidget);
    expect(find.text('1.2 km away'), findsOneWidget);
    expect(find.text('La Cascade'), findsOneWidget);
    expect(find.text('Skip stop'), findsOneWidget);
    expect(find.text('Hold to end trip'), findsOneWidget);
    expect(find.textContaining("YOU'RE AT THIS STOP"), findsOneWidget);
    expect(find.text('TRIP IN PROGRESS'), findsNothing);
    expect(find.text('END TRIP'), findsNothing);
  });

  testWidgets('Drop-off run uses DropOff Students', (tester) async {
    await tester.pumpWidget(
      wrap(
        const TripControlDrawer(
          progress: TripAttendanceProgress(boarded: 5, total: 12),
          isPickup: false,
          runType: 'DROPOFF',
          nextStopName: 'School Gate',
          nextStopNumber: 1,
          studentsAtStop: 3,
          upcomingStopNumber: 0,
        ),
      ),
    );

    expect(find.text('5 of 12 dropped'), findsOneWidget);
    expect(find.text('DropOff Students'), findsOneWidget);
    expect(find.text('3 students to drop'), findsOneWidget);
  });

  testWidgets('Overflow menu exposes Navigate', (tester) async {
    var navigated = false;
    await tester.pumpWidget(wrap(pickupDrawer(onNavigate: () => navigated = true)));

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Navigate'));
    await tester.pump();
    expect(navigated, isTrue);
  });

  testWidgets('Skip stop from the drawer', (tester) async {
    var skipped = false;
    await tester.pumpWidget(wrap(pickupDrawer(onSkipStop: () => skipped = true)));

    await tester.tap(find.text('Skip stop'));
    await tester.pump();
    expect(skipped, isTrue);
  });

  testWidgets('Approaching copy while outside the stage', (tester) async {
    await tester.pumpWidget(wrap(pickupDrawer(stopPhase: StopApproachPhase.approaching, skipUnlocked: false)));
    expect(find.text('APPROACHING'), findsOneWidget);
    expect(find.textContaining("YOU'RE AT THIS STOP"), findsNothing);
  });

  testWidgets('Skip is locked until minimum dwell', (tester) async {
    var skipped = false;
    await tester.pumpWidget(wrap(pickupDrawer(
      stopPhase: StopApproachPhase.arrived,
      skipUnlocked: false,
      onSkipStop: () => skipped = true,
    )));

    await tester.tap(find.text('Skip stop'));
    await tester.pump();
    expect(skipped, isFalse);
  });

  testWidgets('Debug overflow offers Replay demo GPS', (tester) async {
    var toggled = false;
    await tester.pumpWidget(
      wrap(pickupDrawer(onToggleGpsReplay: () => toggled = true)),
    );

    await tester.tap(find.byTooltip('More trip actions'));
    await tester.pumpAndSettle();
    expect(find.text('Replay demo GPS'), findsOneWidget);

    await tester.tap(find.text('Replay demo GPS'));
    await tester.pumpAndSettle();
    expect(toggled, isTrue);
  });

  testWidgets('Debug overflow shows Stop simulation while replaying', (tester) async {
    await tester.pumpWidget(
      wrap(pickupDrawer(onToggleGpsReplay: () {}, gpsReplayActive: true)),
    );

    await tester.tap(find.byTooltip('More trip actions'));
    await tester.pumpAndSettle();
    expect(find.text('Stop simulation'), findsOneWidget);
    expect(find.text('Replay demo GPS'), findsNothing);
  });

  testWidgets('Hold to end trip requires a press-and-hold', (tester) async {
    var ended = false;
    await tester.pumpWidget(wrap(pickupDrawer(onEndTrip: () => ended = true)));

    await tester.tap(find.text('Hold to end trip'));
    await tester.pump();
    expect(ended, isFalse);

    await tester.longPress(find.byType(HoldToEndTripButton));
    await tester.pump();
    expect(ended, isTrue);
  });
}
