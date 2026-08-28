// iOS FCM tokens stay null until Apple Push (APNs) has registered.

bool hasUsableApnsToken(String? token) => token != null && token.isNotEmpty;

const apnsTokenPollAttempts = 10;

Duration apnsTokenPollDelay(int attemptZeroBased) {
  final ms = 300 * (attemptZeroBased + 1);
  return Duration(milliseconds: ms > 2000 ? 2000 : ms);
}

bool iosMustWaitForApns({required bool isIOS, required String? apnsToken}) {
  return isIOS && !hasUsableApnsToken(apnsToken);
}

/// Android can mint a fresh token on login. iOS must not delete the token
/// before APNs is ready — that leaves getToken() null and skips lock-screen push.
bool shouldRotateFcmTokenOnLogin({required bool isIOS}) => !isIOS;
