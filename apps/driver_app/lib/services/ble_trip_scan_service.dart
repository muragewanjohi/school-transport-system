import 'dart:async';

import 'package:driver_app/utils/ble_boarding_confidence.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

/// Trip-scoped BLE advertisement scan (Unit B). No vendor SDK.
class BleTripScanService {
  BleTripScanService({
    this.tenantUuid,
    this.major = 1,
  });

  final String? tenantUuid;
  final int major;

  StreamSubscription<List<ScanResult>>? _sub;
  final _controller = StreamController<BleObservation>.broadcast();
  final Map<int, DateTime> _lastSeenByMinor = {};

  Stream<BleObservation> get observations => _controller.stream;

  Future<void> start() async {
    await stop();
    await FlutterBluePlus.startScan(continuousUpdates: true);
    _sub = FlutterBluePlus.scanResults.listen(_onResults);
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    try {
      await FlutterBluePlus.stopScan();
    } catch (_) {}
  }

  void dispose() {
    unawaited(stop());
    _controller.close();
  }

  void _onResults(List<ScanResult> results) {
    for (final r in results) {
      final parsed = parseIBeaconManufacturerData(r.advertisementData.manufacturerData);
      if (parsed == null) continue;
      if (tenantUuid != null &&
          parsed.uuid.replaceAll('-', '').toUpperCase() !=
              tenantUuid!.replaceAll('-', '').toUpperCase()) {
        continue;
      }
      if (parsed.major != major) continue;
      final obs = BleObservation(
        uuid: parsed.uuid,
        major: parsed.major,
        minor: parsed.minor,
        rssi: r.rssi,
        at: DateTime.now().toUtc(),
      );
      _lastSeenByMinor[parsed.minor] = obs.at;
      if (!_controller.isClosed) _controller.add(obs);
    }
  }

  DateTime? lastSeen(int minor) => _lastSeenByMinor[minor];
}

class ParsedIBeacon {
  const ParsedIBeacon({
    required this.uuid,
    required this.major,
    required this.minor,
    required this.txPower,
  });

  final String uuid;
  final int major;
  final int minor;
  final int txPower;
}

/// Apple company ID 0x004C, iBeacon type 0x02 0x15.
ParsedIBeacon? parseIBeaconManufacturerData(Map<int, List<int>> manufacturerData) {
  final bytes = manufacturerData[0x004C];
  if (bytes == null || bytes.length < 23) return null;
  if (bytes[0] != 0x02 || bytes[1] != 0x15) return null;
  final uuidBytes = bytes.sublist(2, 18);
  final hex = uuidBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  final uuid =
      '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}'
          .toUpperCase();
  final major = (bytes[18] << 8) | bytes[19];
  final minor = (bytes[20] << 8) | bytes[21];
  final tx = bytes[22] > 127 ? bytes[22] - 256 : bytes[22];
  return ParsedIBeacon(uuid: uuid, major: major, minor: minor, txPower: tx);
}
