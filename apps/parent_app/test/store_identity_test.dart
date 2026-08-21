import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/config/api_config.dart';

String _normalize(String source) => source.replaceAll('\r\n', '\n');

void main() {
  group('Home-screen name is OnTheBus', () {
    test('iOS Info.plist display name is OnTheBus', () {
      final plist = _normalize(File('ios/Runner/Info.plist').readAsStringSync());
      expect(plist.contains('<string>OnTheBus Parent</string>'), isFalse);
      expect(
        plist.contains('<key>CFBundleDisplayName</key>\n\t<string>OnTheBus</string>'),
        isTrue,
      );
      expect(
        plist.contains('<key>CFBundleName</key>\n\t<string>OnTheBus</string>'),
        isTrue,
      );
    });

    test('Android launcher label is OnTheBus', () {
      final manifest = _normalize(
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync(),
      );
      expect(manifest.contains('android:label="OnTheBus Parent"'), isFalse);
      expect(manifest.contains('android:label="OnTheBus"'), isTrue);
    });

    test('Android FCM default notification icon is OnTheBus status drawable', () {
      final manifest = _normalize(
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync(),
      );
      expect(
        manifest.contains('com.google.firebase.messaging.default_notification_icon'),
        isTrue,
      );
      expect(manifest.contains('@drawable/ic_stat_onthebus'), isTrue);
      expect(File('android/app/src/main/res/drawable/ic_stat_onthebus.xml').existsSync(), isTrue);
    });

    test('iOS Info.plist has camera, photos, and export-compliance keys', () {
      final plist = _normalize(File('ios/Runner/Info.plist').readAsStringSync());
      expect(plist.contains('NSCameraUsageDescription'), isTrue);
      expect(plist.contains('NSPhotoLibraryUsageDescription'), isTrue);
      expect(plist.contains('ITSAppUsesNonExemptEncryption'), isTrue);
    });

    test('iOS target is iPhone-only', () {
      final pbx = File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync();
      expect(pbx.contains('TARGETED_DEVICE_FAMILY = 1;'), isTrue);
      expect(pbx.contains('TARGETED_DEVICE_FAMILY = "1,2"'), isFalse);
    });

    test('applicationId stays com.schooltrack.parent_app', () {
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      expect(gradle.contains('applicationId = "com.schooltrack.parent_app"'), isTrue);
    });

    test('iOS bundle id is camelCase parentApp (Firebase rejects underscores)', () {
      final pbx = File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync();
      expect(pbx.contains('PRODUCT_BUNDLE_IDENTIFIER = com.schooltrack.parentApp;'), isTrue);
      expect(
        pbx.contains('PRODUCT_BUNDLE_IDENTIFIER = com.schooltrack.parentApp.RunnerTests;'),
        isTrue,
      );
      expect(pbx.contains('PRODUCT_BUNDLE_IDENTIFIER = com.schooltrack.parent_app;'), isFalse);
      expect(pbx.contains('com.schooltrack.parentapp.parentApp'), isFalse);
    });

    test('Android Firebase config uses the parent app id', () {
      final googleServices = File('android/app/google-services.json').readAsStringSync();
      expect(googleServices.contains('"package_name": "com.schooltrack.parent_app"'), isTrue);
      expect(googleServices.contains('1:465945931477:android:5a06937b146c6c6b5cbc5c'), isTrue);
      expect(googleServices.contains('1:465945931477:android:a75da1dd2c4c55965cbc5c'), isFalse);
    });

    test('iOS GoogleService-Info.plist uses parentApp bundle id', () {
      final plist = File('ios/Runner/GoogleService-Info.plist').readAsStringSync();
      expect(plist.contains('<string>com.schooltrack.parentApp</string>'), isTrue);
      expect(plist.contains('1:465945931477:ios:98205baf8a938a245cbc5c'), isTrue);
      expect(plist.contains('com.schooltrack.parent_app'), isFalse);
    });

    test('firebase_options.dart uses the parent Android and iOS app ids', () {
      final options = File('lib/firebase_options.dart').readAsStringSync();
      expect(options.contains('1:465945931477:android:5a06937b146c6c6b5cbc5c'), isTrue);
      expect(options.contains('1:465945931477:android:a75da1dd2c4c55965cbc5c'), isFalse);
      expect(options.contains('iosBundleId: \'com.schooltrack.parentApp\''), isTrue);
      expect(options.contains('1:465945931477:ios:98205baf8a938a245cbc5c'), isTrue);
      expect(options.contains('1:465945931477:ios:31f21deeba1d0ef35cbc5c'), isFalse);
    });
  });

  test('delete-account URL is the public legal page', () {
    expect(ApiConfig.deleteAccountUrl, 'https://onthebusapp.com/delete-account');
  });
}
