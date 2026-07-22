import 'package:flutter/material.dart';
import 'package:parent_app/services/supabase_service.dart';

class AttendanceFormScreen extends StatefulWidget {
  final Map<String, dynamic> student;
  final bool initialIsPresent;

  const AttendanceFormScreen({
    super.key,
    required this.student,
    required this.initialIsPresent,
  });

  @override
  State<AttendanceFormScreen> createState() => _AttendanceFormScreenState();
}

class _AttendanceFormScreenState extends State<AttendanceFormScreen> {
  late bool _useTransport;
  String _selectedReason = 'Sick';
  bool _isSaving = false;

  final List<String> _reasons = ['Sick', 'Holiday', 'Personal', 'Other'];

  @override
  void initState() {
    super.initState();
    _useTransport = widget.initialIsPresent;
  }

  Future<void> _saveAttendance() async {
    final String studentId = widget.student['id'] ?? '';
    final String transitStatus = widget.student['transit_status'] ?? widget.student['status'] ?? 'Present';
    final bool isOnboarded = transitStatus == 'On the Bus' || 
                             transitStatus == 'Boarded' || 
                             widget.student['status'] == 'Boarded';

    if (isOnboarded) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.lock, color: Colors.white, size: 18),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Student has already onboarded the bus. Attendance status cannot be modified during active trip.'),
                ),
              ],
            ),
            backgroundColor: Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      return;
    }

    setState(() => _isSaving = true);

    final String newStatus = _useTransport ? 'Present' : 'Absent';
    final success = await SupabaseService.updateStudentStatus(studentId, newStatus);

    setState(() => _isSaving = false);

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${widget.student['name']} attendance updated: $newStatus'),
            backgroundColor: _useTransport ? const Color(0xFF10B981) : Colors.amber,
            behavior: SnackBarBehavior.floating,
          ),
        );
        widget.student['status'] = newStatus;
        Navigator.of(context).pop({'updated': true, 'status': newStatus, 'studentId': studentId});
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to update attendance. Please try again.'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final String studentName = widget.student['name'] ?? 'James Mwangi';
    final String firstName = studentName.split(' ').first;
    final String gradeText = widget.student['grade'] != null
        ? 'Grade ${widget.student['grade']}'
        : (widget.student['class_name'] != null ? 'Grade ${widget.student['class_name']}' : 'Grade 5A');

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text(
          'Today\'s Transport',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: Color(0xFF0F172A),
            fontSize: 19,
          ),
        ),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Color(0xFF0F172A)),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // 1. Student Info Header Card
            Row(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: const Color(0xFFDBEAFE),
                  child: Text(
                    firstName[0].toUpperCase(),
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1E40AF),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        studentName,
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        gradeText,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          color: Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // 2. Main Form Card Container
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: const Color(0xFFF1F5F9)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.04),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  )
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Will $firstName use transport today?',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Option 1: Yes, he will use transport
                  InkWell(
                    onTap: () {
                      setState(() {
                        _useTransport = true;
                      });
                    },
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: _useTransport ? const Color(0xFFECFDF5) : Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: _useTransport ? const Color(0xFF10B981) : const Color(0xFFE2E8F0),
                          width: _useTransport ? 2 : 1.5,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: _useTransport ? const Color(0xFF10B981) : Colors.transparent,
                              border: Border.all(
                                color: _useTransport ? const Color(0xFF10B981) : const Color(0xFFCBD5E1),
                                width: 2,
                              ),
                            ),
                            child: _useTransport
                                ? const Icon(Icons.check, size: 16, color: Colors.white)
                                : null,
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'Yes, $firstName will use transport',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: _useTransport ? const Color(0xFF0F172A) : const Color(0xFF334155),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Option 2: No, he will NOT use transport
                  InkWell(
                    onTap: () {
                      setState(() {
                        _useTransport = false;
                      });
                    },
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: !_useTransport ? const Color(0xFFFEF2F2) : Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: !_useTransport ? const Color(0xFFEF4444) : const Color(0xFFE2E8F0),
                          width: !_useTransport ? 2 : 1.5,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: !_useTransport ? const Color(0xFFEF4444) : Colors.transparent,
                              border: Border.all(
                                color: !_useTransport ? const Color(0xFFEF4444) : const Color(0xFFCBD5E1),
                                width: 2,
                              ),
                            ),
                            child: !_useTransport
                                ? const Icon(Icons.close, size: 16, color: Colors.white)
                                : null,
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'No, $firstName will NOT use transport',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: !_useTransport ? const Color(0xFF0F172A) : const Color(0xFF334155),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Reason Section (visible when absent/no selected)
                  if (!_useTransport) ...[
                    const Text(
                      'Reason (optional)',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF64748B),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFF1F5F9)),
                      ),
                      child: Column(
                        children: _reasons.map((reason) {
                          final bool isSelected = _selectedReason == reason;
                          return InkWell(
                            onTap: () {
                              setState(() {
                                _selectedReason = reason;
                              });
                            },
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                              child: Row(
                                children: [
                                  Container(
                                    width: 22,
                                    height: 22,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isSelected ? const Color(0xFF2563EB) : Colors.transparent,
                                      border: Border.all(
                                        color: isSelected ? const Color(0xFF2563EB) : const Color(0xFFCBD5E1),
                                        width: 2,
                                      ),
                                    ),
                                    child: isSelected
                                        ? Center(
                                            child: Container(
                                              width: 8,
                                              height: 8,
                                              decoration: const BoxDecoration(
                                                color: Colors.white,
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                          )
                                        : null,
                                  ),
                                  const SizedBox(width: 12),
                                  Text(
                                    reason,
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w500,
                                      color: Color(0xFF0F172A),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],

                  // Soft Blue Info Card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFDBEAFE)),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.info_outline_rounded,
                          color: Color(0xFF2563EB),
                          size: 22,
                        ),
                        SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'If marked absent, the driver and school transport office will be notified.',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFF1E40AF),
                              height: 1.35,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),

            // Save Button
            Container(
              width: double.infinity,
              height: 54,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)],
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF2563EB).withOpacity(0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 6),
                  )
                ],
              ),
              child: ElevatedButton(
                onPressed: _isSaving ? null : _saveAttendance,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: _isSaving
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2.5,
                        ),
                      )
                    : const Text(
                        'Save',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.3,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
