import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:driver_app/services/driver_api_auth.dart';
import 'package:driver_app/config/api_config.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/geo_utils.dart';

class Student {
  final String id;
  final String name;
  final String routeId;
  final String grade;
  final String className;
  String status; // "Present" (Boarded) | "Absent" (Off Bus / Not Boarded)
  final List<String> scheduleIds;
  final String? pickupStopId;
  final String? dropoffStopId;

  Student({
    required this.id,
    required this.name,
    required this.routeId,
    required this.grade,
    required this.className,
    required this.status,
    required this.scheduleIds,
    this.pickupStopId,
    this.dropoffStopId,
  });

  factory Student.fromJson(Map<String, dynamic> json) {
    final dynamic rawScheduleIds = json['schedule_ids'];
    List<String> parsedScheduleIds = [];
    if (rawScheduleIds is List) {
      parsedScheduleIds = rawScheduleIds.map((e) => e.toString()).toList();
    }
    return Student(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unknown Student',
      routeId: json['route_id'] ?? '',
      grade: json['grade'] ?? 'N/A',
      className: json['class_name'] ?? 'N/A',
      status: json['status'] ?? 'Absent',
      scheduleIds: parsedScheduleIds,
      pickupStopId: json['pickup_stop_id']?.toString(),
      dropoffStopId: json['dropoff_stop_id']?.toString(),
    );
  }

  Map<String, dynamic> toStopMap() => {
        'pickup_stop_id': pickupStopId,
        'dropoff_stop_id': dropoffStopId,
      };
}

class StudentChecklistWidget extends StatefulWidget {
  final String routeId;
  final String tenantId;
  final String tripId;
  final String? arrivedStopId;
  final String? arrivedStopName;

  const StudentChecklistWidget({
    super.key,
    required this.routeId,
    required this.tenantId,
    required this.tripId,
    this.arrivedStopId,
    this.arrivedStopName,
  });

  @override
  State<StudentChecklistWidget> createState() => _StudentChecklistWidgetState();
}

class _StudentChecklistWidgetState extends State<StudentChecklistWidget> {
  List<Student> _students = [];
  bool _isLoading = false;
  String _searchQuery = "";
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchStudents();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _getApiBaseUrl() => ApiConfig.baseUrl;

  Future<void> _fetchStudents() async {
    setState(() => _isLoading = true);
    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.get(
        Uri.parse('$baseUrl/api/students'),
        headers: await DriverApiAuth.headers(),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          final List<dynamic> data = result['data'];
          final allStudents = data.map((item) => Student.fromJson(item as Map<String, dynamic>)).toList();

          final routeStudents = allStudents
              .where((s) => s.routeId == widget.routeId && s.scheduleIds.contains(widget.tripId))
              .toList();

          setState(() => _students = routeStudents);
        }
      }
    } catch (e) {
      debugPrint("Error fetching students: $e");
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  bool _canAct(Student student) {
    final isBoarded = student.status == "Present";
    return studentAllowedAtStop(
      student: student.toStopMap(),
      arrivedStopId: widget.arrivedStopId,
      isBoardAction: !isBoarded,
    );
  }

  Future<void> _updateStudentStatus(Student student, String newStatus) async {
    final allowed = studentAllowedAtStop(
      student: student.toStopMap(),
      arrivedStopId: widget.arrivedStopId,
      isBoardAction: newStatus == "Present",
    );
    if (!allowed) {
      _showErrorSnackBar(
        widget.arrivedStopId == null
            ? 'Arrive at a stop geofence before boarding or dropping off.'
            : 'This student is not assigned to ${widget.arrivedStopName ?? "this stop"}.',
      );
      return;
    }

    final oldStatus = student.status;
    setState(() => student.status = newStatus);

    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.put(
        Uri.parse('$baseUrl/api/students/${student.id}'),
        headers: await DriverApiAuth.headers(),
        body: json.encode({'status': newStatus}),
      ).timeout(const Duration(seconds: 8));

      if (!mounted) return;

      final result = json.decode(response.body);
      if (response.statusCode != 200 || result['success'] != true) {
        setState(() => student.status = oldStatus);
        _showErrorSnackBar(
          (result['error'] as String?) ?? 'Failed to sync status update with database.',
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              newStatus == "Present"
                  ? "${student.name} marked as BOARDED. Parents notified."
                  : "${student.name} marked as DROPPED OFF. Parents notified.",
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            backgroundColor: newStatus == "Present" ? Colors.green : Colors.blueGrey,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      setState(() => student.status = oldStatus);
      _showErrorSnackBar("Network error: Failed to update status.");
    }
  }

  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: Colors.red,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final atStop = widget.arrivedStopId != null;

    final filtered = _students.where((student) {
      if (!student.name.toLowerCase().contains(_searchQuery.toLowerCase())) {
        return false;
      }
      if (!atStop) return false;
      final isBoarded = student.status == "Present";
      // At this stop: pending pickups OR onboard drop-offs for this stop.
      return studentAllowedAtStop(
        student: student.toStopMap(),
        arrivedStopId: widget.arrivedStopId,
        isBoardAction: !isBoarded,
      );
    }).toList();

    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Student Roster Manifest',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.ink),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, size: 20, color: AppColors.actionGreen),
                onPressed: _fetchStudents,
                tooltip: 'Refresh student list',
              ),
            ],
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: atStop ? AppColors.actionGreen.withAlpha(26) : Colors.orange.withAlpha(26),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: atStop ? AppColors.actionGreen : Colors.orange),
            ),
            child: Text(
              atStop
                  ? 'At ${widget.arrivedStopName ?? "stop"} — only students for this stop can board or drop off.'
                  : 'Drive into a stop geofence to unlock boarding and drop-off for that stop.',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: atStop ? AppColors.primaryGreen : Colors.orange.shade900,
              ),
            ),
          ),
          const SizedBox(height: 12),

          TextField(
            controller: _searchController,
            onChanged: (val) => setState(() => _searchQuery = val),
            style: const TextStyle(color: AppColors.ink),
            decoration: InputDecoration(
              hintText: 'Search student by name...',
              hintStyle: const TextStyle(color: AppColors.muted),
              prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.muted),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18, color: AppColors.muted),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _searchQuery = "");
                      },
                    )
                  : null,
              filled: true,
              fillColor: AppColors.surfaceAlt,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.border, width: 1.5),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.border, width: 1.5),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.actionGreen, width: 1.5),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            ),
          ),
          const SizedBox(height: 16),

          if (_isLoading && _students.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 24.0),
                child: CircularProgressIndicator(),
              ),
            )
          else if (!atStop)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 32.0),
                child: Text(
                  'No stop unlocked yet. Keep driving until the bus enters a stop zone.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.muted, fontSize: 13),
                ),
              ),
            )
          else if (filtered.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 32.0),
                child: Text(
                  _searchQuery.isNotEmpty
                      ? 'No matches at this stop.'
                      : 'No students to board or drop at ${widget.arrivedStopName ?? "this stop"}.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                ),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: filtered.length,
              separatorBuilder: (context, index) => const Divider(height: 16, color: AppColors.border),
              itemBuilder: (context, index) {
                final student = filtered[index];
                final isBoarded = student.status == "Present";
                final canAct = _canAct(student);

                return Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            student.name,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: AppColors.ink,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              Text(
                                '${student.grade} • ${student.className}',
                                style: const TextStyle(fontSize: 12, color: AppColors.mutedLight),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: isBoarded ? Colors.green.withAlpha(26) : AppColors.surfaceAlt,
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(
                                    color: isBoarded ? Colors.green : AppColors.border,
                                  ),
                                ),
                                child: Text(
                                  isBoarded ? 'ON BUS' : 'AWAY',
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                    color: isBoarded ? Colors.green : AppColors.mutedLight,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Row(
                      children: [
                        if (!isBoarded)
                          ElevatedButton(
                            onPressed: canAct ? () => _updateStudentStatus(student, "Present") : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.actionGreen,
                              foregroundColor: Colors.white,
                              disabledBackgroundColor: AppColors.border,
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              minimumSize: Size.zero,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            child: const Text('PICK UP', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          )
                        else
                          ElevatedButton(
                            onPressed: canAct ? () => _updateStudentStatus(student, "Absent") : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.muted,
                              foregroundColor: Colors.white,
                              disabledBackgroundColor: AppColors.border,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              minimumSize: Size.zero,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            child: const Text('DROP OFF', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          ),
                      ],
                    ),
                  ],
                );
              },
            ),
        ],
      ),
    );
  }
}
