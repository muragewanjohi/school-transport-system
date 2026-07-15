import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/main.dart';

void main() {
  testWidgets('Parent App Login Screen smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const MyApp(isLoggedIn: false));

    // Verify that the login portal text is visible.
    expect(find.text('Parent Portal Dashboard'), findsOneWidget);
    expect(find.text('MOBILE PHONE NUMBER'), findsOneWidget);
    expect(find.text('OTP VERIFICATION CODE'), findsOneWidget);
  });
}
