import 'package:driver_app/services/beacon_provision_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.schooltrack.driver_app/dx_beacon');
  final log = <MethodCall>[];

  setUp(() {
    log.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      log.add(call);
      switch (call.method) {
        case 'isSdkAvailable':
          return true;
        case 'connect':
        case 'unlock':
        case 'writeIBeacon':
        case 'enableTlm':
        case 'setDevicePassword':
        case 'restart':
        case 'disconnect':
          return true;
        default:
          return null;
      }
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test(
    'Given fake channel, When isSdkAvailable, Then true when radio present',
    () async {
      final service = BeaconProvisionService(channel: channel);
      expect(await service.isSdkAvailable(), isTrue);
      expect(log.map((c) => c.method), contains('isSdkAvailable'));
    },
  );

  test(
    'Given fake channel, When provisionDevice runs, Then unlock/write/password/restart called',
    () async {
      final service = BeaconProvisionService(channel: channel);
      final result = await service.provisionDevice(
        unlockPassword: 'DX1234',
        newDevicePassword: 'AB12CD',
        uuid: 'A1B2C3D4-E5F6-4789-A012-3456789ABCDE',
        major: 1,
        minor: 1,
      );
      expect(result.ok, isTrue);
      expect(log.map((c) => c.method), containsAll([
        'unlock',
        'writeIBeacon',
        'enableTlm',
        'setDevicePassword',
        'restart',
      ]));
    },
  );

  test(
    'Given unlock fails, When provisionDevice runs, Then error returned',
    () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'unlock') return false;
        return true;
      });
      final service = BeaconProvisionService(channel: channel);
      final result = await service.provisionDevice(
        unlockPassword: 'WRONG1',
        newDevicePassword: 'AB12CD',
        uuid: 'A1B2C3D4-E5F6-4789-A012-3456789ABCDE',
        major: 1,
        minor: 1,
      );
      expect(result.ok, isFalse);
      expect(result.error, contains('password'));
    },
  );

  test(
    'Given isSdkAvailable false, When checked, Then service reports unavailable',
    () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'isSdkAvailable') return false;
        return true;
      });
      final service = BeaconProvisionService(channel: channel);
      expect(await service.isSdkAvailable(), isFalse);
    },
  );
}
