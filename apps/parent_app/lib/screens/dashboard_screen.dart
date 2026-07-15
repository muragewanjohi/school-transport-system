import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:parent_app/services/supabase_service.dart';
import 'package:parent_app/screens/login_screen.dart';
import 'package:parent_app/screens/map_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _parentName = 'Parent';
  String _parentId = '';
  List<dynamic> _students = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadSessionAndData();
  }

  Future<void> _loadSessionAndData() async {
    setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      _parentId = prefs.getString('parent_id') ?? '';
      _parentName = prefs.getString('parent_name') ?? 'Parent';

      // Load cached students first
      final cachedJson = prefs.getString('children_json');
      if (cachedJson != null) {
        setState(() {
          _students = json.decode(cachedJson);
        });
      }

      // Fetch fresh data from Supabase
      if (_parentId.isNotEmpty) {
        final List<dynamic> response = await SupabaseService.client
            .from('students')
            .select('id, name, route_id, status, route:routes(name)')
            .eq('parent_id', _parentId);
        
        setState(() {
          _students = response;
        });
        // Cache fresh data
        await prefs.setString('children_json', json.encode(response));
      }
    } catch (e) {
      print('Error loading parent dashboard data: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleAbsenteeism(int index, bool isPresent) async {
    final student = _students[index];
    final String studentId = student['id'];
    final String newStatus = isPresent ? 'Present' : 'Absent';

    // Optimistic UI update
    setState(() {
      _students[index]['status'] = newStatus;
    });

    final success = await SupabaseService.updateStudentStatus(studentId, newStatus);
    if (!success) {
      // Revert if failed
      setState(() {
        _students[index]['status'] = isPresent ? 'Absent' : 'Present';
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to update student attendance status.'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } else {
      // Save updated data to cache
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('children_json', json.encode(_students));
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${student['name']} marked as $newStatus.'),
            backgroundColor: isPresent ? Colors.green : Colors.amber,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _handleLogout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (context) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0E1A), // Dark Navy
      appBar: AppBar(
        title: const Text(
          'Safaricom Track Parent',
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        backgroundColor: const Color(0xFF0A0E1A),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: () {
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  backgroundColor: const Color(0xFF151C2C),
                  title: const Text('Log Out', style: TextStyle(color: Colors.white)),
                  content: const Text('Are you sure you want to log out of the parent portal?', style: TextStyle(color: Color(0xFF94A3B8))),
                  actions: [
                    TextButton(
                      child: const Text('Cancel', style: TextStyle(color: Color(0xFF64748B))),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                    TextButton(
                      child: const Text('Log Out', style: TextStyle(color: Colors.red)),
                      onPressed: () {
                        Navigator.of(context).pop();
                        _handleLogout();
                      },
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadSessionAndData,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Welcoming User Banner
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              decoration: const BoxDecoration(
                color: Color(0xFF151C2C),
                borderRadius: BorderRadius.only(
                  bottomLeft: Radius.circular(24),
                  bottomRight: Radius.circular(24),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Welcome back,',
                    style: TextStyle(fontSize: 14, color: Colors.grey[400]),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _parentName,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Students List Title
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              child: Text(
                'YOUR CHILDREN TRANSITS',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF94A3B8),
                  letterSpacing: 0.5,
                ),
              ),
            ),

            // Student Roster Listing
            Expanded(
              child: _students.isEmpty
                  ? Center(
                      child: _isLoading
                          ? const CircularProgressIndicator()
                          : const Text(
                              'No registered children found.',
                              style: TextStyle(color: Color(0xFF94A3B8)),
                            ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      itemCount: _students.length,
                      itemBuilder: (context, index) {
                        final student = _students[index];
                        final bool isPresent = student['status'] == 'Present';
                        final String routeName = student['route'] != null && student['route']['name'] != null
                            ? student['route']['name']
                            : 'Route Unassigned';

                        return Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: const Color(0xFF151C2C),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: const Color(0xFF223049),
                              width: 1.5,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  CircleAvatar(
                                    backgroundColor: isPresent
                                        ? const Color(0xFF10B981).withOpacity(0.15)
                                        : Colors.amber.withOpacity(0.15),
                                    child: Icon(
                                      Icons.person,
                                      color: isPresent
                                          ? const Color(0xFF10B981)
                                          : Colors.amber,
                                    ),
                                  ),
                                  const SizedBox(width: 16),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          student['name'] ?? 'Student Name',
                                          style: const TextStyle(
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          routeName,
                                          style: TextStyle(
                                            fontSize: 13,
                                            color: Colors.grey[400],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const Divider(height: 24, color: Color(0xFF223049)),
                              
                              // Status Control Row
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'ATTENDANCE STATUS',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF94A3B8),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        isPresent ? 'Present (In Transit)' : 'Absent (Not Riding)',
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                          color: isPresent ? const Color(0xFF10B981) : Colors.amber,
                                        ),
                                      ),
                                    ],
                                  ),
                                  
                                  // Switch Toggle for Absenteeism
                                  Switch(
                                    value: isPresent,
                                    activeColor: const Color(0xFF10B981),
                                    inactiveThumbColor: Colors.amber,
                                    onChanged: (bool value) {
                                      _toggleAbsenteeism(index, value);
                                    },
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),

                              // Map Navigation Trigger Button
                              ElevatedButton.icon(
                                onPressed: student['route_id'] == null
                                    ? null
                                    : () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (context) => MapScreen(
                                              studentId: student['id'],
                                              routeId: student['route_id'],
                                              studentName: student['name'],
                                            ),
                                          ),
                                        );
                                      },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Theme.of(context).colorScheme.primary,
                                  disabledBackgroundColor: const Color(0xFF151C2C),
                                  disabledForegroundColor: Colors.grey[700],
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  minimumSize: const Size.fromHeight(48),
                                ),
                                icon: const Icon(Icons.map_outlined, color: Colors.white),
                                label: const Text(
                                  'TRACK TRANSIT LIVE',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
