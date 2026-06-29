import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class Student {
  final String id;
  final String name;
  final String routeId;
  final String grade;
  final String className;
  String status; // "Present" (Boarded) | "Absent" (Off Bus / Not Boarded)

  Student({
    required this.id,
    required this.name,
    required this.routeId,
    required this.grade,
    required this.className,
    required this.status,
  });

  factory Student.fromJson(Map<String, dynamic> json) {
    return Student(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unknown Student',
      routeId: json['route_id'] ?? '',
      grade: json['grade'] ?? 'N/A',
      className: json['class_name'] ?? 'N/A',
      status: json['status'] ?? 'Absent',
    );
  }
}

class StudentChecklistWidget extends StatefulWidget {
  final String routeId;
  final String tenantId;

  const StudentChecklistWidget({
    super.key,
    required this.routeId,
    required this.tenantId,
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

  String _getApiBaseUrl() {
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:3000';
      }
    } catch (_) {}
    return 'http://localhost:3000';
  }

  Future<void> _fetchStudents() async {
    setState(() => _isLoading = true);
    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.get(
        Uri.parse('$baseUrl/api/students'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (result['success'] == true && result['data'] != null) {
          final List<dynamic> data = result['data'];
          final allStudents = data.map((item) => Student.fromJson(item)).toList();
          
          // Filter students assigned to this route on the client
          final routeStudents = allStudents
              .where((s) => s.routeId == widget.routeId)
              .toList();

          setState(() {
            _students = routeStudents;
          });
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

  Future<void> _updateStudentStatus(Student student, String newStatus) async {
    // Optimistic UI update
    final oldStatus = student.status;
    setState(() {
      student.status = newStatus;
    });

    try {
      final baseUrl = _getApiBaseUrl();
      final response = await http.put(
        Uri.parse('$baseUrl/api/students/${student.id}'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'status': newStatus}),
      ).timeout(const Duration(seconds: 8));

      if (!mounted) return;

      final result = json.decode(response.body);
      if (response.statusCode != 200 || result['success'] != true) {
        // Rollback state if network failed
        setState(() {
          student.status = oldStatus;
        });
        _showErrorSnackBar("Failed to sync status update with database.");
      } else {
        // Status synced successfully, show snackbar feedback
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
      setState(() {
        student.status = oldStatus;
      });
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
    final filtered = _students.where((student) {
      return student.name.toLowerCase().contains(_searchQuery.toLowerCase());
    }).toList();

    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Student Roster Manifest',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, size: 20, color: Color(0xFF10B981)),
                onPressed: _fetchStudents,
                tooltip: 'Refresh student list',
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Search Field
          TextField(
            controller: _searchController,
            onChanged: (val) => setState(() => _searchQuery = val),
            decoration: InputDecoration(
              hintText: 'Search student by name...',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _searchQuery = "");
                      },
                    )
                  : null,
              border: const OutlineInputBorder(),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
          ),
          const SizedBox(height: 16),

          // List Grid
          if (_isLoading && _students.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 24.0),
                child: CircularProgressIndicator(),
              ),
            )
          else if (filtered.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 32.0),
                child: Text(
                  _searchQuery.isNotEmpty ? 'No matches found.' : 'No students registered on this route.',
                  style: const TextStyle(color: Colors.grey, fontSize: 13),
                ),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: filtered.length,
              separatorBuilder: (context, index) => const Divider(height: 16, color: Color(0xFFF1F5F9)),
              itemBuilder: (context, index) {
                final student = filtered[index];
                final isBoarded = student.status == "Present";

                return Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Student details
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            student.name,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF1E293B),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              Text(
                                '${student.grade} • ${student.className}',
                                style: const TextStyle(fontSize: 12, color: Colors.grey),
                              ),
                              const SizedBox(width: 8),
                              // Status badge
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: isBoarded ? Colors.green.shade50 : Colors.grey.shade100,
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(
                                    color: isBoarded ? Colors.green.shade200 : Colors.grey.shade300,
                                  ),
                                ),
                                child: Text(
                                  isBoarded ? 'ON BUS' : 'AWAY',
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                    color: isBoarded ? Colors.green.shade700 : Colors.grey.shade600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    // Manual pick/drop action controls
                    Row(
                      children: [
                        if (!isBoarded)
                          ElevatedButton(
                            onPressed: () => _updateStudentStatus(student, "Present"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF10B981),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              minimumSize: Size.zero,
                            ),
                            child: const Text('PICK UP', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          )
                        else
                          ElevatedButton(
                            onPressed: () => _updateStudentStatus(student, "Absent"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.blueGrey,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              minimumSize: Size.zero,
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
