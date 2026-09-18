import 'package:flutter/services.dart';

/// Native DX-SMART / CP35 provision bridge.
///
/// Channel: `com.schooltrack.driver_app/dx_beacon`
class BeaconProvisionService {
  BeaconProvisionService({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('com.schooltrack.driver_app/dx_beacon');

  final MethodChannel _channel;

  Future<bool> isSdkAvailable() async {
    final result = await _channel.invokeMethod<bool>('isSdkAvailable');
    return result ?? false;
  }

  Future<List<NearbyBeacon>> scanNearbyBeacons() async {
    final raw = await _channel.invokeMethod<List<dynamic>>('scanNearbyBeacons');
    return (raw ?? const [])
        .whereType<Map>()
        .map((m) => NearbyBeacon.fromMap(Map<String, dynamic>.from(m)))
        .toList();
  }

  Future<bool> connect(String mac) async {
    final ok = await _channel.invokeMethod<bool>('connect', {'mac': mac});
    return ok ?? false;
  }

  Future<bool> unlock(String password) async {
    final ok = await _channel.invokeMethod<bool>('unlock', {'password': password});
    return ok ?? false;
  }

  Future<bool> writeIBeacon({
    required String uuid,
    required int major,
    required int minor,
    double txDbm = -19.5,
    int intervalMs = 400,
  }) async {
    final ok = await _channel.invokeMethod<bool>('writeIBeacon', {
      'uuid': uuid,
      'major': major,
      'minor': minor,
      'txDbm': txDbm,
      'intervalMs': intervalMs,
    });
    return ok ?? false;
  }

  Future<bool> enableTlm({int intervalMs = 800, double txDbm = -19.5}) async {
    final ok = await _channel.invokeMethod<bool>('enableTlm', {
      'intervalMs': intervalMs,
      'txDbm': txDbm,
    });
    return ok ?? false;
  }

  Future<bool> setDevicePassword(String newPassword) async {
    final ok = await _channel.invokeMethod<bool>('setDevicePassword', {
      'newPassword': newPassword,
    });
    return ok ?? false;
  }

  Future<bool> restart(String password) async {
    final ok = await _channel.invokeMethod<bool>('restart', {'password': password});
    return ok ?? false;
  }

  Future<void> disconnect() async {
    await _channel.invokeMethod<bool>('disconnect');
  }

  /// Full provision sequence after [connect].
  Future<ProvisionDeviceResult> provisionDevice({
    required String unlockPassword,
    required String newDevicePassword,
    required String uuid,
    required int major,
    required int minor,
    double txDbm = -19.5,
    int ibeaconIntervalMs = 400,
    int tlmIntervalMs = 800,
  }) async {
    final unlocked = await unlock(unlockPassword);
    if (!unlocked) {
      return const ProvisionDeviceResult(ok: false, error: 'Wrong tag password');
    }
    final wrote = await writeIBeacon(
      uuid: uuid,
      major: major,
      minor: minor,
      txDbm: txDbm,
      intervalMs: ibeaconIntervalMs,
    );
    if (!wrote) {
      return const ProvisionDeviceResult(ok: false, error: 'Failed to write iBeacon frame');
    }
    await enableTlm(intervalMs: tlmIntervalMs, txDbm: txDbm);
    if (newDevicePassword != unlockPassword) {
      final locked = await setDevicePassword(newDevicePassword);
      if (!locked) {
        return const ProvisionDeviceResult(ok: false, error: 'Failed to set device password');
      }
    }
    final restarted = await restart(newDevicePassword);
    if (!restarted) {
      return const ProvisionDeviceResult(ok: false, error: 'Failed to restart tag');
    }
    return const ProvisionDeviceResult(ok: true);
  }
}

class NearbyBeacon {
  const NearbyBeacon({
    required this.name,
    required this.mac,
    required this.rssi,
  });

  final String name;
  final String mac;
  final int rssi;

  factory NearbyBeacon.fromMap(Map<String, dynamic> map) {
    return NearbyBeacon(
      name: map['name']?.toString() ?? 'Unknown',
      mac: map['mac']?.toString() ?? '',
      rssi: (map['rssi'] as num?)?.toInt() ?? 0,
    );
  }
}

class ProvisionDeviceResult {
  const ProvisionDeviceResult({required this.ok, this.error});

  final bool ok;
  final String? error;
}
