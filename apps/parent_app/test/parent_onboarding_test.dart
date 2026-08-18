import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/screens/onboarding_screen.dart';
import 'package:parent_app/utils/parent_onboarding_pages.dart';

void main() {
  test('onboarding has exactly three pages and first title is Follow the bus', () {
    expect(parentOnboardingPages, hasLength(3));
    expect(parentOnboardingPages.first.title, 'Follow the bus');
    expect(isLastOnboardingPage(0), isFalse);
    expect(isLastOnboardingPage(2), isTrue);
  });

  test('pages 1 and 2 use Next; last page uses Get started', () {
    expect(onboardingPrimaryLabel(0), 'Next');
    expect(onboardingPrimaryLabel(1), 'Next');
    expect(onboardingPrimaryLabel(2), 'Get started');
  });

  testWidgets('first launch shows the live-map onboarding page', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: OnboardingScreen(onFinished: _noopFinish)),
    );

    expect(find.text('Follow the bus'), findsOneWidget);
    expect(find.text('Next'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
  });

  testWidgets('Skip completes onboarding', (tester) async {
    var finished = false;
    await tester.pumpWidget(
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

  testWidgets('last page uses Get started', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: OnboardingScreen(onFinished: _noopFinish)),
    );

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    expect(find.text('Peace of mind, every trip'), findsOneWidget);
    expect(find.text('Get started'), findsOneWidget);
  });
}

Future<void> _noopFinish() async {}
