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

    test('iOS bundle id matches Android applicationId', () {
      final pbx = File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync();
      expect(pbx.contains('PRODUCT_BUNDLE_IDENTIFIER = com.schooltrack.parent_app;'), isTrue);
      expect(
        pbx.contains('PRODUCT_BUNDLE_IDENTIFIER = com.schooltrack.parent_app.RunnerTests;'),
        isTrue,
      );
      expect(pbx.contains('com.schooltrack.parentapp.parentApp'), isFalse);
    });
  });

  test('delete-account URL is the public legal page', () {
    expect(ApiConfig.deleteAccountUrl, 'https://onthebusapp.com/delete-account');
  });
}
