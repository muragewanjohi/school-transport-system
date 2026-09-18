import 'dart:async';
import 'dart:convert';

import 'package:driver_app/config/api_config.dart';
import 'package:driver_app/services/beacon_provision_service.dart';
import 'package:driver_app/services/driver_api_auth.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:http/http.dart' as http;

class ProvisionTagScreen extends StatefulWidget {
  const ProvisionTagScreen({
    super.key,
    this.provisionService,
    this.httpGet,
    this.httpPost,
  });

  final BeaconProvisionService? provisionService;
  final Future<http.Response> Function(Uri uri, {Map<String, String>? headers})?
      httpGet;
  final Future<http.Response> Function(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
  })? httpPost;

  @override
  State<ProvisionTagScreen> createState() => _ProvisionTagScreenState();
}

class _ProvisionTagScreenState extends State<ProvisionTagScreen> {
  late final BeaconProvisionService _provisionService =
      widget.provisionService ?? BeaconProvisionService();

  final _pinController = TextEditingController();
  bool _loading = false;
  bool _radioAvailable = true;
  bool _radioChecked = false;
  String? _status;
  String? _error;
  Map<String, dynamic>? _template;
  List<_StudentOption> _students = const [];
  List<_ScanHit> _hits = const [];
  _ScanHit? _selectedHit;
  _StudentOption? _selectedStudent;
  StreamSubscription<List<ScanResult>>? _scanSub;

  @override
  void initState() {
    super.initState();
    _checkRadio();
  }

  Future<void> _checkRadio() async {
    try {
      final ok = await _provisionService.isSdkAvailable();
      if (!mounted) return;
      setState(() {
        _radioAvailable = ok;
        _radioChecked = true;
        if (!ok) {
          _error =
              'BLE provisioning unavailable on this device (no Bluetooth adapter).';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _radioAvailable = false;
        _radioChecked = true;
        _error =
            'BLE provisioning unavailable on this device (no Bluetooth adapter).';
      });
    }
  }

  @override
  void dispose() {
    _scanSub?.cancel();
    FlutterBluePlus.stopScan();
    _pinController.dispose();
    super.dispose();
  }

  Future<Map<String, String>> _headers() => DriverApiAuth.headers();

  Future<void> _loadTemplateAndStudents() async {
    final pin = _pinController.text.trim();
    if (pin.isEmpty) {
      setState(() {
        _error = 'Enter the school Provision PIN from your admin (emailed at school setup).';
        _status = null;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _status = 'Loading school beacon template…';
    });
    try {
      final pinQ = '?provision_pin=${Uri.encodeComponent(pin)}';
      final get = widget.httpGet ??
          ((uri, {headers}) => http.get(uri, headers: headers));
      final templateRes = await get(
        Uri.parse('${ApiConfig.baseUrl}/api/driver/beacon/template$pinQ'),
        headers: await _headers(),
      );
      final studentsRes = await get(
        Uri.parse('${ApiConfig.baseUrl}/api/driver/beacon/students'),
        headers: await _headers(),
      );

      final templateBody = json.decode(templateRes.body);
      if (templateRes.statusCode != 200 ||
          templateBody is! Map ||
          templateBody['success'] != true) {
        final err = templateBody is Map
            ? (templateBody['error']?.toString() ?? 'Template failed')
            : 'Template failed';
        if (templateRes.statusCode == 403) {
          throw Exception(
            err.contains('not configured')
                ? 'Provision PIN not configured — ask your school admin to generate one under Config.'
                : 'Invalid Provision PIN. Ask your school admin for the current PIN.',
          );
        }
        throw Exception(err);
      }

      final studentsBody = json.decode(studentsRes.body);
      final rows = studentsBody is Map && studentsBody['data'] is List
          ? (studentsBody['data'] as List)
          : const [];

      setState(() {
        _template = Map<String, dynamic>.from(templateBody['data'] as Map);
        _students = rows
            .whereType<Map>()
            .map((m) => _StudentOption.fromMap(Map<String, dynamic>.from(m)))
            .toList();
        _status = 'Template ready. Scan for a CP35 tag.';
      });
    } catch (e) {
      final msg = e.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
      setState(() => _error = msg);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startScan() async {
    setState(() {
      _error = null;
      _status = 'Scanning…';
      _hits = const [];
      _selectedHit = null;
    });
    try {
      await FlutterBluePlus.startScan(timeout: const Duration(seconds: 8));
      await _scanSub?.cancel();
      final seen = <String, _ScanHit>{};
      _scanSub = FlutterBluePlus.scanResults.listen((results) {
        for (final r in results) {
          final name = r.advertisementData.advName.isNotEmpty
              ? r.advertisementData.advName
              : (r.device.platformName.isNotEmpty
                  ? r.device.platformName
                  : 'Unknown');
          final mac = r.device.remoteId.str;
          seen[mac] = _ScanHit(name: name, mac: mac, rssi: r.rssi);
        }
        if (mounted) {
          setState(() {
            _hits = seen.values.toList()
              ..sort((a, b) => b.rssi.compareTo(a.rssi));
          });
        }
      });
      await Future<void>.delayed(const Duration(seconds: 8));
      await FlutterBluePlus.stopScan();
      setState(() {
        _status = _hits.isEmpty
            ? 'No devices found. Try again near the tag.'
            : 'Select a tag, then a student.';
      });
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  Future<void> _provision() async {
    final template = _template;
    final hit = _selectedHit;
    final student = _selectedStudent;
    if (template == null || hit == null || student == null) {
      setState(() => _error = 'Select a tag and a student first.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _status = 'Provisioning ${hit.name}…';
    });

    try {
      final unlock = template['unlock_password']?.toString() ?? 'DX1234';
      final newPwd = template['new_device_password']?.toString() ?? unlock;
      final uuid = template['uuid']?.toString() ?? '';
      final major = (template['major'] as num?)?.toInt() ?? 1;
      final minor = (template['minor'] as num?)?.toInt() ?? 1;

      await _provisionService.connect(hit.mac);
      final deviceResult = await _provisionService.provisionDevice(
        unlockPassword: unlock,
        newDevicePassword: newPwd,
        uuid: uuid,
        major: major,
        minor: minor,
        txDbm: (template['tx_dbm'] as num?)?.toDouble() ?? -19.5,
        ibeaconIntervalMs:
            (template['ibeacon_interval_ms'] as num?)?.toInt() ?? 400,
        tlmIntervalMs: (template['tlm_interval_ms'] as num?)?.toInt() ?? 800,
      );
      if (!deviceResult.ok) {
        throw Exception(deviceResult.error ?? 'Device provision failed');
      }

      final post = widget.httpPost ??
          ((uri, {headers, body}) =>
              http.post(uri, headers: headers, body: body));
      final pin = _pinController.text.trim();
      final res = await post(
        Uri.parse('${ApiConfig.baseUrl}/api/driver/beacon/provision'),
        headers: await _headers(),
        body: json.encode({
          'student_id': student.id,
          'uuid': uuid,
          'major': major,
          'minor': minor,
          'mac': hit.mac,
          'device_name': hit.name,
          'provision_pin': pin,
          'password_locked': true,
        }),
      );
      final body = json.decode(res.body);
      if (res.statusCode != 200 ||
          body is! Map ||
          body['success'] != true) {
        final err = body is Map
            ? (body['error']?.toString() ?? 'API provision failed')
            : 'API provision failed';
        if (res.statusCode == 403) {
          throw Exception(
            err.contains('not configured')
                ? 'Provision PIN not configured — ask your school admin to generate one under Config.'
                : 'Invalid Provision PIN. Ask your school admin for the current PIN.',
          );
        }
        throw Exception(err);
      }

      if (!mounted) return;
      setState(() {
        _status =
            'Tag locked — only OnTheBus can reconfigure this tag. Assigned to ${student.name} (Minor $minor).';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Tag locked — only OnTheBus can reconfigure this tag.'),
        ),
      );
    } catch (e) {
      final msg = e.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
      setState(() => _error = msg);
    } finally {
      try {
        await _provisionService.disconnect();
      } catch (_) {}
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.pageBg,
      appBar: AppBar(
        title: const Text('Provision Tag'),
        backgroundColor: AppColors.primaryGreen,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _pinController,
            decoration: const InputDecoration(
              labelText: 'School provision PIN (required)',
              border: OutlineInputBorder(),
            ),
            obscureText: true,
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: (_loading || !_radioAvailable) ? null : _loadTemplateAndStudents,
            child: const Text('Load template'),
          ),
          const SizedBox(height: 8),
          FilledButton.tonal(
            onPressed: _loading || !_radioAvailable || _template == null
                ? null
                : _startScan,
            child: const Text('Scan nearby tags'),
          ),
          if (_radioChecked && !_radioAvailable) ...[
            const SizedBox(height: 12),
            const Text(
              'BLE provisioning unavailable on this device.',
              style: TextStyle(color: AppColors.dangerInk),
            ),
          ],
          const SizedBox(height: 16),
          if (_status != null)
            Text(_status!, style: const TextStyle(color: AppColors.muted)),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: AppColors.dangerInk)),
          if (_template != null) ...[
            const SizedBox(height: 12),
            Text(
              'UUID ${_template!['uuid']} · next Minor ${_template!['minor']}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ],
          const SizedBox(height: 16),
          const Text('Tags', style: TextStyle(fontWeight: FontWeight.bold)),
          ..._hits.map(
            (h) => RadioListTile<_ScanHit>(
              value: h,
              groupValue: _selectedHit,
              onChanged: _loading
                  ? null
                  : (v) => setState(() => _selectedHit = v),
              title: Text(h.name),
              subtitle: Text('${h.mac} · ${h.rssi} dBm'),
            ),
          ),
          const SizedBox(height: 8),
          const Text('Student', style: TextStyle(fontWeight: FontWeight.bold)),
          DropdownButtonFormField<_StudentOption>(
            value: _selectedStudent,
            items: _students
                .map(
                  (s) => DropdownMenuItem(
                    value: s,
                    child: Text('${s.name}${s.grade != null ? ' (${s.grade})' : ''}'),
                  ),
                )
                .toList(),
            onChanged: _loading
                ? null
                : (v) => setState(() => _selectedStudent = v),
            decoration: const InputDecoration(border: OutlineInputBorder()),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _loading ||
                    !_radioAvailable ||
                    _selectedHit == null ||
                    _selectedStudent == null ||
                    _template == null
                ? null
                : _provision,
            child: _loading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Provision & lock tag'),
          ),
        ],
      ),
    );
  }
}

class _ScanHit {
  const _ScanHit({required this.name, required this.mac, required this.rssi});
  final String name;
  final String mac;
  final int rssi;
}

class _StudentOption {
  const _StudentOption({required this.id, required this.name, this.grade});
  final String id;
  final String name;
  final String? grade;

  factory _StudentOption.fromMap(Map<String, dynamic> map) {
    return _StudentOption(
      id: map['id']?.toString() ?? '',
      name: map['name']?.toString() ?? 'Student',
      grade: map['grade']?.toString(),
    );
  }
}
