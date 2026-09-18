import 'package:driver_app/services/ble_trip_scan_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Given Apple iBeacon manufacturer bytes, When parsed, Then uuid major minor extracted',
    () {
      // UUID A1B2C3D4-E5F6-4789-A012-3456789ABCDE, major 1, minor 2, tx -59
      final uuid = <int>[
        0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6, 0x47, 0x89,
        0xA0, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE,
      ];
      final bytes = <int>[0x02, 0x15, ...uuid, 0x00, 0x01, 0x00, 0x02, 0xC5];
      final parsed = parseIBeaconManufacturerData({0x004C: bytes});
      expect(parsed, isNotNull);
      expect(parsed!.uuid, 'A1B2C3D4-E5F6-4789-A012-3456789ABCDE');
      expect(parsed.major, 1);
      expect(parsed.minor, 2);
    },
  );

  test('Given non-Apple payload, When parsed, Then null', () {
    expect(parseIBeaconManufacturerData({0x0059: [1, 2, 3]}), isNull);
  });
}
