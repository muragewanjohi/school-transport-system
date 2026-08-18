// Shared Firebase project with the driver app. Parent Android/iOS apps
// should be registered in the same project; override app IDs at build time
// with --dart-define if the console IDs differ.
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
      defaultValue: 'AIzaSyClDS4aDEX43Tk5v_rnG5NB3Ew6vKtIVaQ',
    ),
    appId: String.fromEnvironment(
      'FIREBASE_ANDROID_APP_ID',
      defaultValue: '1:465945931477:android:a75da1dd2c4c55965cbc5c',
    ),
    messagingSenderId: '465945931477',
    projectId: 'school-transport-system-f606a',
    storageBucket: 'school-transport-system-f606a.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: String.fromEnvironment(
      'FIREBASE_IOS_API_KEY',
      defaultValue: 'AIzaSyClDS4aDEX43Tk5v_rnG5NB3Ew6vKtIVaQ',
    ),
    appId: String.fromEnvironment(
      'FIREBASE_IOS_APP_ID',
      defaultValue: '1:465945931477:ios:31f21deeba1d0ef35cbc5c',
    ),
    messagingSenderId: '465945931477',
    projectId: 'school-transport-system-f606a',
    storageBucket: 'school-transport-system-f606a.firebasestorage.app',
    iosBundleId: 'com.schooltrack.parent_app',
  );
}
