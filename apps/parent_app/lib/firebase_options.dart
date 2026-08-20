// Generated for the parent Firebase apps in school-transport-system-f606a.
// Do not reuse driver app IDs. Override at build time with --dart-define if needed.
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError('Parent Firebase is not configured for web.');
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError('Parent Firebase is not configured for this platform.');
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: String.fromEnvironment(
      'FIREBASE_ANDROID_API_KEY',
      defaultValue: 'AIzaSyA66uKBRXsvKD0D8H1YyI2LHonhuascLPE',
    ),
    appId: String.fromEnvironment(
      'FIREBASE_ANDROID_APP_ID',
      defaultValue: '1:465945931477:android:5a06937b146c6c6b5cbc5c',
    ),
    messagingSenderId: '465945931477',
    projectId: 'school-transport-system-f606a',
    storageBucket: 'school-transport-system-f606a.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: String.fromEnvironment(
      'FIREBASE_IOS_API_KEY',
      defaultValue: 'AIzaSyA1G2_9Ob__51bTf8P2chtU5q3syA_526k',
    ),
    appId: String.fromEnvironment(
      'FIREBASE_IOS_APP_ID',
      defaultValue: '1:465945931477:ios:98205baf8a938a245cbc5c',
    ),
    messagingSenderId: '465945931477',
    projectId: 'school-transport-system-f606a',
    storageBucket: 'school-transport-system-f606a.firebasestorage.app',
    iosBundleId: 'com.schooltrack.parentApp',
  );
}
