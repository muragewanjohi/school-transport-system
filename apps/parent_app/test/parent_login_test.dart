import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/screens/login_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  Future<void> pumpLogin(
    WidgetTester tester, {
    RequestOtpCallback? requestOtp,
    VerifyOtpCallback? verifyOtp,
    WidgetBuilder? authenticatedBuilder,
  }) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(
          requestOtp: requestOtp,
          verifyOtp: verifyOtp,
          authenticatedBuilder: authenticatedBuilder,
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('phone screen uses Parent copy and Send OTP', (tester) async {
    await pumpLogin(tester);

    expect(find.text('Parent App'), findsOneWidget);
    expect(find.text('SEND OTP'), findsOneWidget);
    expect(find.text('Welcome to OnTheBus'), findsOneWidget);
    expect(find.text('Driver & Conductor App'), findsNothing);
    expect(find.text('Safaricom Track Login'), findsNothing);
    expect(find.text('Parent Portal Dashboard'), findsNothing);
    expect(find.text('REQUEST OTP'), findsNothing);
  });

  testWidgets('Send OTP opens the verification screen', (tester) async {
    var requestedPhone = '';
    await pumpLogin(
      tester,
      requestOtp: (phone, {channel = 'sms'}) async {
        requestedPhone = phone;
        return null;
      },
    );

    await tester.enterText(find.byKey(const Key('parent-phone-field')), '712345678');
    await tester.tap(find.byKey(const Key('send-otp-button')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(requestedPhone, '+254712345678');
    expect(find.text('Verify your number'), findsOneWidget);
    expect(find.text('VERIFY & CONTINUE'), findsOneWidget);
    expect(find.byKey(const Key('otp-digit-0')), findsOneWidget);
    expect(find.byKey(const Key('otp-digit-5')), findsOneWidget);
    expect(find.text('SEND OTP'), findsNothing);
  });

  testWidgets('email hint shows Send code via email', (tester) async {
    await pumpLogin(
      tester,
      requestOtp: (phone, {channel = 'sms'}) async {
        return {'source': 'sms', 'email_hint': 'j***@gmail.com'};
      },
    );

    await tester.enterText(find.byKey(const Key('parent-phone-field')), '712345678');
    await tester.tap(find.byKey(const Key('send-otp-button')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byKey(const Key('send-otp-email-button')), findsOneWidget);
    expect(find.textContaining('Send code via email'), findsOneWidget);
  });

  testWidgets('unregistered phone shows school guidance', (tester) async {
    await pumpLogin(
      tester,
      requestOtp: (phone, {channel = 'sms'}) async {
        throw Exception('This phone number is not registered as a parent profile.');
      },
    );

    await tester.enterText(find.byKey(const Key('parent-phone-field')), '712345678');
    await tester.tap(find.byKey(const Key('send-otp-button')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Verify your number'), findsNothing);
    expect(
      find.text(
        'This number is not registered as a parent. Contact your school to get access.',
      ),
      findsOneWidget,
    );
  });
}
