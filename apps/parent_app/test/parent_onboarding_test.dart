import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/screens/onboarding_screen.dart';
import 'package:parent_app/utils/parent_onboarding_pages.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpPhone(WidgetTester tester, Widget app) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(app);
  }

  test('onboarding has exactly three pages and first title is the peace-of-mind headline', () {
    expect(parentOnboardingPages, hasLength(3));
    expect(parentOnboardingPages.first.title, 'Peace of mind on every journey.');
    expect(parentOnboardingPages.first.body, "Real-time school bus tracking for your child's safety.");
    expect(isLastOnboardingPage(0), isFalse);
    expect(isLastOnboardingPage(2), isTrue);
  });

  test('pages 1 and 2 use Next; last page uses Get started', () {
    expect(onboardingPrimaryLabel(0), 'Next');
    expect(onboardingPrimaryLabel(1), 'Next');
    expect(onboardingPrimaryLabel(2), 'Get started');
  });

  testWidgets('first launch shows the branded welcome splash', (tester) async {
    await pumpPhone(
      tester,
      const MaterialApp(home: OnboardingScreen(onFinished: _noopFinish)),
    );

    expect(find.text('OnTheBus'), findsOneWidget);
    expect(find.text('PARENT APP'), findsOneWidget);
    expect(find.textContaining('Peace of mind'), findsOneWidget);
    expect(find.textContaining("for your child's safety."), findsOneWidget);
    expect(find.text('Next'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Get Started'), findsNothing);
    expect(find.text('Login'), findsNothing);
  });

  testWidgets('Skip completes onboarding', (tester) async {
    var finished = false;
    await pumpPhone(
      tester,
      MaterialApp(
        home: OnboardingScreen(
          onFinished: () async {
            finished = true;
          },
        ),
      ),
    );

    await tester.tap(find.text('Skip'));
    await tester.pump();

    expect(finished, isTrue);
  });

  testWidgets('Next opens the live-tracking page', (tester) async {
    await pumpPhone(
      tester,
      const MaterialApp(home: OnboardingScreen(onFinished: _noopFinish)),
    );

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    expect(find.text('Real-time Tracking'), findsOneWidget);
    expect(find.text("See your child's bus location live on the map."), findsOneWidget);
    expect(find.text('En route to School'), findsOneWidget);
    expect(find.text('7:45 AM'), findsOneWidget);
    expect(find.text('Next Stop'), findsOneWidget);
    expect(find.text('Greenview Estate\n2 min away'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
  });

  testWidgets('last page shows lock-screen notifications and Get started', (tester) async {
    await pumpPhone(
      tester,
      const MaterialApp(home: OnboardingScreen(onFinished: _noopFinish)),
    );

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    expect(find.text('Instant Updates'), findsOneWidget);
    expect(find.text('Get notified about pick-ups, drop-offs and delays.'), findsOneWidget);
    expect(find.text('9:41'), findsOneWidget);
    expect(find.text('James was picked up'), findsOneWidget);
    expect(find.text('James is on the way to school'), findsOneWidget);
    expect(find.text('James was dropped off'), findsOneWidget);
    expect(find.text('Delay Alert'), findsOneWidget);
    expect(find.text('Get started'), findsOneWidget);
  });
}

Future<void> _noopFinish() async {}
