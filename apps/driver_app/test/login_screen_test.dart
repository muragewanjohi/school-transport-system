import 'package:driver_app/screens/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  Widget buildLogin({
    required RequestOtpCallback requestOtp,
    VerifyOtpCallback? verifyOtp,
  }) {
    return MaterialApp(
      home: LoginScreen(
        requestOtp: requestOtp,
        verifyOtp: verifyOtp,
        authenticatedBuilder: (_) =>
            const Scaffold(body: Text('Driver dashboard')),
      ),
    );
  }

  testWidgets('Driver login › valid phone › opens the verification screen', (
    tester,
  ) async {
    var requestedPhone = '';
    await tester.pumpWidget(
      buildLogin(
        requestOtp: (phone) async {
          requestedPhone = phone;
        },
      ),
    );

    await tester.enterText(
      find.byKey(const Key('driver-phone-field')),
      '712345678',
    );
    await tester.tap(find.byKey(const Key('send-otp-button')));
    await tester.pump(const Duration(milliseconds: 350));

    expect(requestedPhone, '+254712345678');
    expect(find.text('Verify your number'), findsOneWidget);
    expect(find.text('+254 712 345 678'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'Driver login › incomplete phone › shows validation and sends no request',
    (tester) async {
      var requestCount = 0;
      await tester.pumpWidget(
        buildLogin(
          requestOtp: (_) async {
            requestCount++;
          },
        ),
      );

      await tester.enterText(
        find.byKey(const Key('driver-phone-field')),
        '7123',
      );
      await tester.tap(find.byKey(const Key('send-otp-button')));
      await tester.pump();

      expect(requestCount, 0);
      expect(find.text('Enter a valid 9-digit mobile number'), findsOneWidget);
      expect(find.text('Welcome to OnTheBus'), findsOneWidget);
    },
  );

  testWidgets(
    'Driver login › corrects an invalid phone › clears the stale validation message',
    (tester) async {
      await tester.pumpWidget(buildLogin(requestOtp: (_) async {}));

      final phoneField = find.byKey(const Key('driver-phone-field'));
      await tester.enterText(phoneField, '7245');
      await tester.tap(find.byKey(const Key('send-otp-button')));
      await tester.pump();
      expect(find.text('Enter a valid 9-digit mobile number'), findsOneWidget);

      await tester.enterText(phoneField, '724511201');
      await tester.pump();

      expect(find.text('Enter a valid 9-digit mobile number'), findsNothing);
    },
  );

  testWidgets(
    'Driver login › valid OTP › persists the session and opens dashboard',
    (tester) async {
      await tester.pumpWidget(
        buildLogin(
          requestOtp: (_) async {},
          verifyOtp: (phone, otp) async {
            expect(phone, '+254712345678');
            expect(otp, '123456');
            return {
              'id': 'driver-1',
              'name': 'Play Review Driver',
              'phone': phone,
              'role': 'driver',
              'tenant_id': 'tenant-1',
              'vehicle_id': 'vehicle-1',
              'route_id': 'route-1',
              'access_token': 'test-token',
            };
          },
        ),
      );

      await tester.enterText(
        find.byKey(const Key('driver-phone-field')),
        '712345678',
      );
      await tester.tap(find.byKey(const Key('send-otp-button')));
      await tester.pump(const Duration(milliseconds: 350));

      for (var index = 0; index < 6; index++) {
        await tester.enterText(
          find.byKey(Key('otp-digit-$index')),
          '${index + 1}',
        );
      }
      await tester.tap(find.byKey(const Key('verify-otp-button')));
      await tester.pumpAndSettle();

      expect(find.text('Driver dashboard'), findsOneWidget);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool('is_logged_in'), isTrue);
      expect(prefs.getString('access_token'), 'test-token');
    },
  );

  testWidgets(
    'Driver login › resend countdown finishes › requests another OTP',
    (tester) async {
      var requestCount = 0;
      await tester.pumpWidget(
        buildLogin(
          requestOtp: (_) async {
            requestCount++;
          },
        ),
      );

      await tester.enterText(
        find.byKey(const Key('driver-phone-field')),
        '712345678',
      );
      await tester.tap(find.byKey(const Key('send-otp-button')));
      await tester.pump(const Duration(milliseconds: 350));
      expect(requestCount, 1);

      await tester.pump(const Duration(seconds: 25));
      await tester.tap(find.byKey(const Key('resend-otp-button')));
      await tester.pump();

      expect(requestCount, 2);
      expect(find.textContaining('Resend code in'), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
