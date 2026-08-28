import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_push_logic.dart';

void main() {
  group('iosMustWaitForApns', () {
    test('iOS with no APNs token › must wait', () {
      expect(iosMustWaitForApns(isIOS: true, apnsToken: null), isTrue);
      expect(iosMustWaitForApns(isIOS: true, apnsToken: ''), isTrue);
    });

    test('iOS with APNs token › may call getToken', () {
      expect(iosMustWaitForApns(isIOS: true, apnsToken: 'apns-hex'), isFalse);
    });

    test('Android › does not wait for APNs', () {
      expect(iosMustWaitForApns(isIOS: false, apnsToken: null), isFalse);
    });
  });

  group('shouldRotateFcmTokenOnLogin', () {
    test('Android rotates; iOS keeps the APNs mapping', () {
      expect(shouldRotateFcmTokenOnLogin(isIOS: false), isTrue);
      expect(shouldRotateFcmTokenOnLogin(isIOS: true), isFalse);
    });
  });
}
