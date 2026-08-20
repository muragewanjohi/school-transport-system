import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:driver_app/config/api_config.dart';
import 'package:driver_app/services/driver_api_auth.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/trip_ui_logic.dart';
import 'package:driver_app/widgets/campus_boarding_panel.dart';

/// Campus roll-call for a scheduled drop-off trip (trip run UUID, not schedule id).
class CampusBoardingScreen extends StatefulWidget {
  final String tripId;
  final Future<bool> Function()? onStartTrip;

  const CampusBoardingScreen({
    super.key,
    required this.tripId,
    this.onStartTrip,
  });

  @override
  State<CampusBoardingScreen> createState() => _CampusBoardingScreenState();
}

class _CampusBoardingScreenState extends State<CampusBoardingScreen> {
  List<Map<String, dynamic>> _students = [];
  bool _loading = true;
  bool _busy = false;
  String _busyMessage = campusSavingLabel;

  @override
  void initState() {
    super.initState();
    _loadManifests();
  }

  Future<void> _loadManifests({bool showListLoader = true}) async {
    if (showListLoader) setState(() => _loading = true);
    try {
      final response = await http
          .get(
            Uri.parse('${ApiConfig.baseUrl}/api/trips?trip_id=${widget.tripId}'),
            headers: await DriverApiAuth.headers(),
          )
          .timeout(const Duration(seconds: 10));
      if (!mounted) return;
      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] is List) {
          setState(() {
            _students = flattenTripManifestRows(result['data'] as List<dynamic>);
          });
        }
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load roster. $e'), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<bool> _putAttendance(String manifestId, String attendance) async {
    final response = await http
        .put(
          Uri.parse('${ApiConfig.baseUrl}/api/trips'),
          headers: await DriverApiAuth.headers(),
          body: json.encode({'manifest_id': manifestId, 'attendance': attendance}),
        )
        .timeout(const Duration(seconds: 8));
    final result = json.decode(response.body);
    return response.statusCode == 200 && result['success'] == true;
  }

  Future<void> _setAttendance(Map<String, dynamic> student, String attendance) async {
    final manifestId = student['manifest_id']?.toString() ?? '';
    if (manifestId.isEmpty) return;
    final idx = _students.indexWhere((row) => row['id'] == student['id']);
    if (idx < 0) return;
    final previous = _students[idx]['attendance'];
    setState(() => _students[idx]['attendance'] = attendance);
    try {
      final ok = await _putAttendance(manifestId, attendance);
      if (!ok && mounted) {
        setState(() => _students[idx]['attendance'] = previous);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to update attendance.'), backgroundColor: Colors.red),
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _students[idx]['attendance'] = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Network error updating attendance.'), backgroundColor: Colors.red),
      );
    }
  }

  Future<void> _completeBoarding() async {
    setState(() {
      _busy = true;
      _busyMessage = campusSavingLabel;
    });
    try {
      final pending = pendingCampusRows(_students);
      var failed = 0;
      for (final student in pending) {
        final manifestId = student['manifest_id']?.toString() ?? '';
        if (manifestId.isEmpty) {
          failed += 1;
          continue;
        }
        final idx = _students.indexWhere((row) => row['id'] == student['id']);
        if (idx >= 0) {
          setState(() => _students[idx]['attendance'] = 'absent');
        }
        final ok = await _putAttendance(manifestId, 'absent');
        if (!ok) {
          failed += 1;
          if (idx >= 0 && mounted) {
            setState(() => _students[idx]['attendance'] = student['attendance']);
          }
        }
      }
      if (!mounted) return;
      if (failed > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not mark every remaining student absent.'),
            backgroundColor: Colors.red,
          ),
        );
      }
      await _loadManifests(showListLoader: false);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Network error. $e'), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _startTrip() async {
    setState(() {
      _busy = true;
      _busyMessage = campusStartingTripLabel;
    });
    var left = false;
    try {
      final started = await widget.onStartTrip?.call();
      if (started == true && mounted) {
        left = true;
        Navigator.of(context).pop(true);
      }
    } finally {
      if (mounted && !left) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_busy,
      child: Stack(
        children: [
          Scaffold(
            backgroundColor: AppColors.pageBg,
            appBar: AppBar(
              title: const Text(
                'Board Students',
                style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
              ),
              backgroundColor: AppColors.actionGreen,
              foregroundColor: Colors.white,
              automaticallyImplyLeading: !_busy,
            ),
            body: SafeArea(
              child: RefreshIndicator(
                onRefresh: () async {
                  if (_busy) return;
                  await _loadManifests();
                },
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  child: CampusBoardingPanel(
                    students: _students,
                    loading: _loading,
                    busy: _busy,
                    onBoard: (student) => _setAttendance(student, attendanceForCampusBoarding('Present')),
                    onMarkAbsent: (student) => _setAttendance(student, attendanceForCampusBoarding('Absent')),
                    onCompleteBoarding: _completeBoarding,
                    onStartTrip: _startTrip,
                  ),
                ),
              ),
            ),
          ),
          if (_busy) CampusBusyOverlay(message: _busyMessage),
        ],
      ),
    );
  }
}
