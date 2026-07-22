import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:image_picker/image_picker.dart';
import 'package:parent_app/services/supabase_service.dart';
import 'package:parent_app/screens/login_screen.dart';
import 'package:parent_app/screens/map_screen.dart';
import 'package:parent_app/screens/relocate_screen.dart';
import 'package:parent_app/screens/attendance_form_screen.dart';
import 'package:parent_app/screens/notifications_screen.dart';
import 'package:latlong2/latlong.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _currentIndex = 0;
  int _selectedStudentIndex = 0;
  String _parentName = 'Parent';
  String _parentId = '';
  String _parentPhone = '0712 345 678';
  String _parentEmail = 'parent@school.com';
  List<dynamic> _students = [];
  bool _isLoading = true;
  String? _parentAvatarUrl;
  Map<String, dynamic>? _guardian = {
    'id': 'g1',
    'name': 'Grace Wanjohi',
    'relationship': 'Guardian',
    'phone': '0700 111 222',
    'avatar_url': null,
  };

  // Attendance Form State
  String _selectedReason = 'Sick';
  final TextEditingController _notesController = TextEditingController();

  Future<void> _showPhotoPickerModal(String id, String targetTable, String name, String? currentAvatarUrl) async {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF151C2C),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Update Photo for $name',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 20),
              ListTile(
                leading: const Icon(Icons.camera_alt_rounded, color: Color(0xFF2563EB)),
                title: const Text('Take Photo (Camera)', style: TextStyle(color: Colors.white)),
                onTap: () async {
                  Navigator.of(context).pop();
                  final picker = ImagePicker();
                  final XFile? image = await picker.pickImage(source: ImageSource.camera, imageQuality: 80);
                  if (image != null) {
                    final bytes = await image.readAsBytes();
                    final publicUrl = await SupabaseService.uploadAvatar(
                      id: id,
                      targetTable: targetTable,
                      imageBytes: bytes,
                      fileName: image.name,
                    );
                    if (publicUrl != null) {
                      setState(() {
                        if (targetTable == 'profiles' && id == _parentId) {
                          _parentAvatarUrl = publicUrl;
                        } else if (targetTable == 'students') {
                          for (var s in _students) {
                            if (s['id'] == id) s['avatar_url'] = publicUrl;
                          }
                        } else if (_guardian != null && _guardian!['id'] == id) {
                          _guardian!['avatar_url'] = publicUrl;
                        }
                      });
                      _loadSessionAndData();
                    }
                  }
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_rounded, color: Color(0xFF10B981)),
                title: const Text('Choose from Gallery', style: TextStyle(color: Colors.white)),
                onTap: () async {
                  Navigator.of(context).pop();
                  final picker = ImagePicker();
                  final XFile? image = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
                  if (image != null) {
                    final bytes = await image.readAsBytes();
                    final publicUrl = await SupabaseService.uploadAvatar(
                      id: id,
                      targetTable: targetTable,
                      imageBytes: bytes,
                      fileName: image.name,
                    );
                    if (publicUrl != null) {
                      setState(() {
                        if (targetTable == 'profiles' && id == _parentId) {
                          _parentAvatarUrl = publicUrl;
                        } else if (targetTable == 'students') {
                          for (var s in _students) {
                            if (s['id'] == id) s['avatar_url'] = publicUrl;
                          }
                        } else if (_guardian != null && _guardian!['id'] == id) {
                          _guardian!['avatar_url'] = publicUrl;
                        }
                      });
                      _loadSessionAndData();
                    }
                  }
                },
              ),
              if (currentAvatarUrl != null && currentAvatarUrl.isNotEmpty) ...[
                const Divider(color: Color(0xFF223049)),
                ListTile(
                  leading: const Icon(Icons.delete_forever_rounded, color: Color(0xFFEF4444)),
                  title: const Text('Remove Photo', style: TextStyle(color: Color(0xFFEF4444))),
                  onTap: () async {
                    Navigator.of(context).pop();
                    final success = await SupabaseService.deleteAvatar(
                      id: id,
                      targetTable: targetTable,
                      currentAvatarUrl: currentAvatarUrl,
                    );
                    if (success) {
                      setState(() {
                        if (targetTable == 'profiles' && id == _parentId) {
                          _parentAvatarUrl = null;
                        } else if (targetTable == 'students') {
                          for (var s in _students) {
                            if (s['id'] == id) s['avatar_url'] = null;
                          }
                        } else if (_guardian != null && _guardian!['id'] == id) {
                          _guardian!['avatar_url'] = null;
                        }
                      });
                      _loadSessionAndData();
                    }
                  },
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  void _showAddGuardianModal() {
    final nameCtrl = TextEditingController();
    final relationCtrl = TextEditingController(text: 'Guardian');
    final phoneCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF151C2C),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            left: 24,
            right: 24,
            top: 24,
            bottom: MediaQuery.of(context).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Add Guardian (Max 1)',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.grey),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: nameCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Guardian Full Name',
                  labelStyle: TextStyle(color: Color(0xFF94A3B8)),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: relationCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Relationship (e.g. Guardian, Aunt, Uncle)',
                  labelStyle: TextStyle(color: Color(0xFF94A3B8)),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: phoneCtrl,
                keyboardType: TextInputType.phone,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Phone Number',
                  labelStyle: TextStyle(color: Color(0xFF94A3B8)),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () {
                    if (nameCtrl.text.trim().isNotEmpty && phoneCtrl.text.trim().isNotEmpty) {
                      setState(() {
                        _guardian = {
                          'id': 'g1',
                          'name': nameCtrl.text.trim(),
                          'relationship': relationCtrl.text.trim(),
                          'phone': phoneCtrl.text.trim(),
                          'avatar_url': null,
                        };
                      });
                      Navigator.of(context).pop();
                    }
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF10B981)),
                  child: const Text('Save Guardian', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  void initState() {
    super.initState();
    _loadSessionAndData();
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) {
      return 'Good morning,';
    } else if (hour < 17) {
      return 'Good afternoon,';
    } else {
      return 'Good evening,';
    }
  }

  Future<void> _callConductor(String phoneNumber) async {
    final Uri phoneUri = Uri(scheme: 'tel', path: phoneNumber);
    if (await canLaunchUrl(phoneUri)) {
      await launchUrl(phoneUri);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Dialing conductor at $phoneNumber...'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
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

      // Fetch fresh data from Supabase (with vehicle, driver, and conductor joins)
      final bool isValidUuid = RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$').hasMatch(_parentId);
      if (_parentId.isNotEmpty && isValidUuid) {
        try {
          final profileRes = await SupabaseService.client
              .from('profiles')
              .select('id, name, phone, email, avatar_url')
              .eq('id', _parentId)
              .maybeSingle();

          if (profileRes != null) {
            setState(() {
              if (profileRes['name'] != null) _parentName = profileRes['name'];
              if (profileRes['avatar_url'] != null) _parentAvatarUrl = profileRes['avatar_url'];
              if (profileRes['phone'] != null) _parentPhone = profileRes['phone'];
              if (profileRes['email'] != null) _parentEmail = profileRes['email'];
            });
          }
        } catch (_) {}

        try {
          final List<dynamic> response = await SupabaseService.client
              .from('students')
              .select('id, name, grade, class_name, school_name, admission_no, dob, gender, address, pickup_stage_name, pickup_stage_address, route_id, status, guardians, tenant:tenants(id, name), pickup_stop:stops!students_pickup_stop_id_fkey(id, name, location), dropoff_stop:stops!students_dropoff_stop_id_fkey(id, name, location), route:routes(id, name)')
              .eq('parent_id', _parentId);

          setState(() {
            _students = response;
            if (_selectedStudentIndex >= _students.length) {
              _selectedStudentIndex = 0;
            }
            if (_students.isNotEmpty && _selectedStudentIndex < _students.length) {
              final sel = _students[_selectedStudentIndex];
              if (sel['guardians'] != null && (sel['guardians'] as List).isNotEmpty) {
                final gList = sel['guardians'] as List;
                if (gList.length > 1) {
                  _guardian = Map<String, dynamic>.from(gList[1]);
                } else if (gList.isNotEmpty) {
                  _guardian = Map<String, dynamic>.from(gList[0]);
                }
              }
            }
          });
          await prefs.setString('children_json', json.encode(response));
        } catch (e) {
          // Fallback query if relationships aren't deeply configured in cache
          final List<dynamic> fallback = await SupabaseService.client
              .from('students')
              .select('*')
              .eq('parent_id', _parentId);
          setState(() {
            _students = fallback;
            if (_selectedStudentIndex >= _students.length) {
              _selectedStudentIndex = 0;
            }
          });
        }
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
    final String transitStatus = student['transit_status'] ?? student['status'] ?? 'Present';
    
    // Check if student has onboarded the bus
    final bool isOnboarded = transitStatus == 'On the Bus' || 
                             transitStatus == 'Boarded' || 
                             transitStatus == 'In Transit';

    if (isOnboarded) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.lock, color: Colors.white, size: 18),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Student is currently on the bus. Attendance status cannot be changed for this trip.'),
                ),
              ],
            ),
            backgroundColor: Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
            duration: Duration(seconds: 4),
          ),
        );
      }
      return;
    }

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
            backgroundColor: isPresent ? const Color(0xFF10B981) : Colors.amber,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  void _showChildPickerModal() {
    if (_students.length <= 1) return;

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF151C2C),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Select Child',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.grey),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              ListView.builder(
                shrinkWrap: true,
                itemCount: _students.length,
                itemBuilder: (context, index) {
                  final child = _students[index];
                  final isSelected = index == _selectedStudentIndex;
                  final String grade = child['grade'] != null
                      ? 'Grade ${child['grade']}'
                      : (child['class_name'] != null ? 'Grade ${child['class_name']}' : 'Grade 5A');

                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? const Color(0xFF10B981).withOpacity(0.12)
                          : const Color(0xFF0A0E1A),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isSelected ? const Color(0xFF10B981) : const Color(0xFF223049),
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: ListTile(
                      onTap: () {
                        setState(() {
                          _selectedStudentIndex = index;
                        });
                        Navigator.of(context).pop();
                      },
                      leading: CircleAvatar(
                        radius: 22,
                        backgroundColor: isSelected ? const Color(0xFF10B981) : Colors.blueGrey,
                        child: Text(
                          (child['name'] ?? 'C')[0].toUpperCase(),
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                      title: Text(
                        child['name'] ?? 'Child',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                      subtitle: Text(grade, style: const TextStyle(color: Color(0xFF94A3B8))),
                      trailing: isSelected
                          ? const Icon(Icons.check_circle, color: Color(0xFF10B981))
                          : null,
                    ),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
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
    Widget currentTabWidget;
    switch (_currentIndex) {
      case 0:
        currentTabWidget = _buildHomeTab();
        break;
      case 1:
        currentTabWidget = _buildMapTab();
        break;
      case 2:
        currentTabWidget = _buildAttendanceTab();
        break;
      case 3:
        currentTabWidget = _buildProfileTab();
        break;
      default:
        currentTabWidget = _buildHomeTab();
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC), // Clean white-slate canvas background
      appBar: (_currentIndex == 0 || _currentIndex == 3)
          ? null // Home and Profile tabs render custom header row matching design
          : AppBar(
              title: Text(
                _currentIndex == 1
                    ? 'Live Transit Map'
                    : 'Attendance Manager',
                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 18),
              ),
              backgroundColor: const Color(0xFF0A0E1A),
              foregroundColor: Colors.white,
              elevation: 0,
              centerTitle: true,
            ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF10B981)))
          : RefreshIndicator(
              onRefresh: _loadSessionAndData,
              child: currentTabWidget,
            ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: const Color(0xFF2563EB), // Blue active icon
        unselectedItemColor: const Color(0xFF94A3B8),
        showSelectedLabels: true,
        showUnselectedLabels: true,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelStyle: const TextStyle(fontSize: 12),
        elevation: 12,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.map_outlined),
            activeIcon: Icon(Icons.map),
            label: 'Map',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.check_circle_outline),
            activeIcon: Icon(Icons.check_circle),
            label: 'Attendance',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  void _openAttendanceForm(Map<String, dynamic> student, bool initialIsPresent) async {
    final result = await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => AttendanceFormScreen(
          student: student,
          initialIsPresent: initialIsPresent,
        ),
      ),
    );
    if (result != null) {
      if (result is Map && result['updated'] == true) {
        final String newStatus = result['status'];
        final String studentId = result['studentId'];
        setState(() {
          for (var s in _students) {
            if (s['id'] == studentId) {
              s['status'] = newStatus;
            }
          }
        });
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('children_json', json.encode(_students));
      }
      _loadSessionAndData();
    }
  }

  Widget _buildHomeTab() {
    if (_students.isEmpty) {
      return _buildEmptyState();
    }
    
    final student = _students[_selectedStudentIndex];
    final bool isPresent = (student['status'] ?? 'Present') == 'Present';
    
    // Resolve dynamic fields
    final String studentName = student['name'] ?? 'James Mwangi';
    final String firstName = studentName.split(' ').first;
    final String gradeText = student['grade'] != null
        ? 'Grade ${student['grade']}'
        : (student['class_name'] != null ? 'Grade ${student['class_name']}' : 'Grade 5A');
        
    String licensePlate = 'Bus 12';
    String conductorName = 'John Kamau';
    String conductorPhone = '+254 712 345 678';
    
    try {
      if (student['route'] != null && student['route']['vehicle'] != null) {
        final vehicle = student['route']['vehicle'];
        if (vehicle['license_plate'] != null && (vehicle['license_plate'] as String).isNotEmpty) {
          licensePlate = vehicle['license_plate'];
        }
        
        if (vehicle['conductor'] != null) {
          final cond = vehicle['conductor'];
          if (cond['name'] != null) conductorName = cond['name'];
          if (cond['phone'] != null) conductorPhone = cond['phone'];
        } else if (vehicle['driver'] != null) {
          final drv = vehicle['driver'];
          if (drv['name'] != null) conductorName = drv['name'];
          if (drv['phone'] != null) conductorPhone = drv['phone'];
        }
      }
    } catch (_) {}

    final String parentFirstName = _parentName.split(' ').first;
    final String transitStatusText = student['transit_status'] ?? 'On the Bus';
    final bool isOnboarded = transitStatusText == 'On the Bus' || 
                             transitStatusText == 'Boarded' || 
                             student['status'] == 'Boarded';
    final bool isDropped = transitStatusText == 'Dropped' || student['status'] == 'Dropped';

    return SafeArea(
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1. TOP HEADER ROW: Greeting & Notification Bell
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _getGreeting(),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        color: Color(0xFF334155),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(
                          parentFirstName,
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF0F172A),
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(width: 6),
                        const Text('👋', style: TextStyle(fontSize: 24)),
                      ],
                    ),
                  ],
                ),
                // Notification Bell with Badge
                InkWell(
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (context) => NotificationsScreen(students: _students),
                      ),
                    );
                  },
                  borderRadius: BorderRadius.circular(24),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.06),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            )
                          ],
                          border: Border.all(color: const Color(0xFFF1F5F9)),
                        ),
                        child: const Icon(
                          Icons.notifications_none_rounded,
                          color: Color(0xFF0F172A),
                          size: 26,
                        ),
                      ),
                      Positioned(
                        right: 2,
                        top: 2,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Color(0xFFEF4444),
                            shape: BoxShape.circle,
                          ),
                          constraints: const BoxConstraints(
                            minWidth: 18,
                            minHeight: 18,
                          ),
                          child: Text(
                            '${_students.length * 3}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (_students.length > 1) ...[
              const SizedBox(height: 14),
              SizedBox(
                height: 42,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: _students.length,
                  itemBuilder: (context, index) {
                    final child = _students[index];
                    final bool isSelected = index == _selectedStudentIndex;
                    final String name = child['name'] ?? 'Child';
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: InkWell(
                        onTap: () {
                          setState(() {
                            _selectedStudentIndex = index;
                          });
                        },
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: isSelected ? const Color(0xFF2563EB) : Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: isSelected ? const Color(0xFF2563EB) : const Color(0xFFE2E8F0),
                            ),
                            boxShadow: isSelected
                                ? [
                                    BoxShadow(
                                      color: const Color(0xFF2563EB).withOpacity(0.3),
                                      blurRadius: 8,
                                      offset: const Offset(0, 3),
                                    )
                                  ]
                                : null,
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.face_rounded,
                                size: 18,
                                color: isSelected ? Colors.white : const Color(0xFF64748B),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                name.split(' ').first,
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                  color: isSelected ? Colors.white : const Color(0xFF334155),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
            const SizedBox(height: 20),

            // 2. MAIN CHILD TRANSIT CARD (White rounded container)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: const Color(0xFFF1F5F9), width: 1.5),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.04),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  )
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Child Header with Selector Dropdown
                  InkWell(
                    onTap: _students.length > 1 ? _showChildPickerModal : null,
                    borderRadius: BorderRadius.circular(16),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundColor: const Color(0xFFDBEAFE),
                            child: Text(
                              firstName[0].toUpperCase(),
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF1E40AF),
                              ),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  studentName,
                                  style: const TextStyle(
                                    fontSize: 19,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF0F172A),
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  gradeText,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                    color: Color(0xFF64748B),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (_students.length > 1)
                            const Icon(
                              Icons.keyboard_arrow_down_rounded,
                              color: Color(0xFF64748B),
                              size: 28,
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Green Status Banner
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFA7F3D0)),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 10,
                                      height: 10,
                                      decoration: const BoxDecoration(
                                        color: Color(0xFF10B981),
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      transitStatusText,
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.bold,
                                        color: Color(0xFF0F172A),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  licensePlate,
                                  style: const TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF15803D),
                                  ),
                                ),
                              ],
                            ),
                            // Bus Illustration Icon
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: Colors.amber.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.directions_bus_rounded,
                                color: Color(0xFFD97706),
                                size: 36,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        const Divider(color: Color(0xFFA7F3D0), height: 1),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                const Text(
                                  'Conductor: ',
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: Color(0xFF475569),
                                  ),
                                ),
                                Text(
                                  conductorName,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF0F172A),
                                  ),
                                ),
                              ],
                            ),
                            InkWell(
                              onTap: () => _callConductor(conductorPhone),
                              child: Container(
                                width: 36,
                                height: 36,
                                decoration: const BoxDecoration(
                                  color: Colors.white,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.phone,
                                  color: Color(0xFF2563EB),
                                  size: 20,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ETA & Next Stop Metrics Sub-Cards
                  Row(
                    children: [
                      // ETA Card
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFFF1F5F9)),
                          ),
                          child: const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'ETA to School',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                              SizedBox(height: 6),
                              Text(
                                '8 mins',
                                style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF16A34A),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      // Next Stop Card
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFFF1F5F9)),
                          ),
                          child: const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Next Stop',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                              SizedBox(height: 4),
                              Text(
                                'Kiambu Rd Stage',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                              SizedBox(height: 2),
                              Text(
                                '6 mins away',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // 3. TODAY'S RIDING STATUS (Attendance Toggle Card - Image 2)
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFF1F5F9)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.03),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  )
                ],
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'TODAY\'S RIDING STATUS',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF64748B),
                          letterSpacing: 0.8,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isPresent ? const Color(0xFFD1FAE5) : const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          isPresent ? 'RIDING TODAY' : 'ABSENT TODAY',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: isPresent ? const Color(0xFF065F46) : const Color(0xFF92400E),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Pill Button Toggle Row (Image 2 design)
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Row(
                      children: [
                        // Present Button
                        Expanded(
                          child: InkWell(
                            onTap: () => _openAttendanceForm(student, true),
                            borderRadius: BorderRadius.circular(12),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: isPresent ? const Color(0xFF10B981) : Colors.transparent,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.check_circle,
                                    size: 18,
                                    color: isPresent ? Colors.white : const Color(0xFF94A3B8),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Present',
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.bold,
                                      color: isPresent ? Colors.white : const Color(0xFF64748B),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),

                        // Absent / Skip Button
                        Expanded(
                          child: InkWell(
                            onTap: () => _openAttendanceForm(student, false),
                            borderRadius: BorderRadius.circular(12),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: !isPresent ? const Color(0xFFEF4444) : Colors.transparent,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.cancel,
                                    size: 18,
                                    color: !isPresent ? Colors.white : const Color(0xFF94A3B8),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Absent / Skip',
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.bold,
                                      color: !isPresent ? Colors.white : const Color(0xFF64748B),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (isOnboarded) ...[
                    const SizedBox(height: 8),
                    const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.lock_outline, size: 12, color: Color(0xFF94A3B8)),
                        SizedBox(width: 4),
                        Text(
                          'Attendance locked during active trip',
                          style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 24),

            // 4. TODAY'S SCHEDULE SECTION (Vertical Timeline)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: const Color(0xFFF1F5F9)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.03),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  )
                ],
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Today\'s Schedule',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${DateTime.now().day}/${DateTime.now().month}/${DateTime.now().year} — Today',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            _currentIndex = 2; // Attendance tab
                          });
                        },
                        child: const Text(
                          'View all',
                          style: TextStyle(
                            color: Color(0xFF2563EB),
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  _buildTimelineNode('7:00 AM', 'Trip Started', isCompleted: isPresent, isLast: false),
                  _buildTimelineNode('7:07 AM', 'Bus Approaching', isCompleted: isPresent, isLast: false),
                  _buildTimelineNode('7:15 AM', isPresent ? '$firstName Boarded' : '$firstName Marked Absent', isCompleted: isPresent && isOnboarded, isLast: false),
                  _buildTimelineNode('7:50 AM', 'Arrive at School', isCompleted: isPresent && isDropped, isLast: false),
                  _buildTimelineNode('2:30 PM', 'School Ends', isCompleted: false, isLast: false),
                  _buildTimelineNode('2:40 PM', 'Bus Approaching Home', isCompleted: false, isLast: false),
                  _buildTimelineNode('2:50 PM', '$firstName Dropped Home', isCompleted: false, isLast: true),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // 5. PRIMARY CTA BUTTON: Track Bus
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
                onPressed: () {
                  setState(() {
                    _currentIndex = 1; // Switch to Map Screen
                  });
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Track Bus',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.3,
                      ),
                    ),
                    SizedBox(width: 8),
                    Icon(Icons.navigation_rounded, size: 20),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildTimelineNode(String time, String title, {required bool isCompleted, required bool isLast}) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 70,
            child: Text(
              time,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: isCompleted ? const Color(0xFF334155) : const Color(0xFF94A3B8),
              ),
            ),
          ),
          Column(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isCompleted ? const Color(0xFF10B981) : Colors.transparent,
                  border: Border.all(
                    color: isCompleted ? const Color(0xFF10B981) : const Color(0xFFCBD5E1),
                    width: 2,
                  ),
                ),
                child: isCompleted
                    ? const Icon(Icons.check, size: 14, color: Colors.white)
                    : null,
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                    color: isCompleted ? const Color(0xFF10B981) : const Color(0xFFE2E8F0),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: isCompleted ? FontWeight.bold : FontWeight.w500,
                  color: isCompleted ? const Color(0xFF0F172A) : const Color(0xFF64748B),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMapTab() {
    if (_students.isEmpty) {
      return _buildEmptyState();
    }
    
    final student = _students[_selectedStudentIndex];
    final String routeId = student['route_id'] ?? '';
    final String studentId = student['id'] ?? '';
    final String studentName = student['name'] ?? '';
    
    if (routeId.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24.0),
          child: Text(
            'This child has no transit route assigned.\nPlease contact school administration to configure route transits.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 15),
          ),
        ),
      );
    }
    
    return MapScreen(
      key: ValueKey(studentId),
      studentId: studentId,
      routeId: routeId,
      studentName: studentName,
      isEmbedded: true,
    );
  }

  Widget _buildAttendanceTab() {
    if (_students.isEmpty) {
      return _buildEmptyState();
    }

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'ATTENDANCE REGISTRY',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Color(0xFF94A3B8),
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 16),

          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _students.length,
            itemBuilder: (context, index) {
              final child = _students[index];
              final bool isPresent = (child['status'] ?? 'Present') == 'Present';
              final String studentName = child['name'] ?? 'Child';
              final String firstName = studentName.split(' ').first;
              final String gradeText = child['grade'] != null
                  ? 'Grade ${child['grade']}'
                  : (child['class_name'] != null ? 'Grade ${child['class_name']}' : 'Grade 5A');
              final String transitStatusText = child['transit_status'] ?? 'On the Bus';
              final bool isOnboarded = transitStatusText == 'On the Bus' || 
                                       transitStatusText == 'Boarded' || 
                                       child['status'] == 'Boarded';

              return Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFF1F5F9)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.04),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    )
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 26,
                          backgroundColor: const Color(0xFFDBEAFE),
                          child: Text(
                            firstName[0].toUpperCase(),
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF1E40AF),
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                studentName,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                gradeText,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: isPresent ? const Color(0xFFD1FAE5) : const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            isPresent ? 'RIDING TODAY' : 'ABSENT TODAY',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: isPresent ? const Color(0xFF065F46) : const Color(0xFF92400E),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    const Divider(color: Color(0xFFF1F5F9), height: 1),
                    const SizedBox(height: 14),

                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(
                              isPresent ? Icons.check_circle_outline : Icons.cancel_outlined,
                              color: isPresent ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                              size: 20,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              isPresent ? 'Transport Status: Present' : 'Transport Status: Absent',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: isPresent ? const Color(0xFF0F172A) : const Color(0xFFEF4444),
                              ),
                            ),
                          ],
                        ),
                        ElevatedButton(
                          onPressed: () => _openAttendanceForm(child, isPresent),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2563EB),
                            foregroundColor: Colors.white,
                            elevation: 0,
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          child: const Text(
                            'UPDATE',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (isOnboarded) ...[
                      const SizedBox(height: 8),
                      const Row(
                        children: [
                          Icon(Icons.lock_outline, size: 12, color: Color(0xFF94A3B8)),
                          SizedBox(width: 4),
                          Text(
                            'Attendance locked during active trip',
                            style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildProfileTab() {
    if (_students.isEmpty) {
      return _buildEmptyState();
    }
    
    final student = _students[_selectedStudentIndex];
    final String studentId = student['id'] ?? '';
    final String studentName = student['name'] ?? 'Reuel Njiru';
    final String studentGrade = student['grade'] != null 
        ? '${student['grade']} ${student['class_name'] ?? ''}'.trim() 
        : 'Grade 1 Nile';
    final String schoolName = student['tenant']?['name'] ?? student['school_name'] ?? student['school']?['name'] ?? 'Oakwood Primary School';
    final String admissionNo = student['admission_no'] ?? student['admission_number'] ?? (student['id'] != null ? student['id'].toString().substring(0, 8).toUpperCase() : '2023/1456');
    final String dateOfBirth = student['dob'] ?? student['date_of_birth'] ?? '12 May 2018';
    final String gender = student['gender'] ?? 'Male';
    final String homeAddress = student['address'] ?? student['home_address'] ?? 'Kiambu Road, Nairobi';
    final String pickupStageName = student['pickup_stop']?['name'] ?? student['pickup_stage_name'] ?? student['pickup_stage'] ?? 'Kiambu Rd Stage';
    final String pickupStageAddress = student['pickup_stop']?['name'] != null
        ? '${student['pickup_stop']['name']} Stop'
        : (student['pickup_stage_address'] ?? student['pickup_stage_description'] ?? 'Kiambu Rd Stage (Near Shell Petrol Station)');
    final String? studentAvatarUrl = student['avatar_url'] as String?;
    
    // Conductor & Bus details
    String conductorName = 'John Kamau';
    String conductorPhone = '+254 712 345 678';
    String vehiclePlate = 'KDD 123A';
    String vehicleBusNo = 'Bus 12';
    
    try {
      if (student['route'] != null && student['route']['vehicle'] != null) {
        final vehicle = student['route']['vehicle'];
        if (vehicle['license_plate'] != null) vehiclePlate = vehicle['license_plate'];
        if (vehicle['bus_number'] != null) vehicleBusNo = 'Bus ${vehicle['bus_number']}';
        
        if (vehicle['conductor'] != null) {
          final cond = vehicle['conductor'];
          if (cond['name'] != null) conductorName = cond['name'];
          if (cond['phone'] != null) conductorPhone = cond['phone'];
        } else if (vehicle['driver'] != null) {
          final drv = vehicle['driver'];
          if (drv['name'] != null) conductorName = drv['name'];
          if (drv['phone'] != null) conductorPhone = drv['phone'];
        }
      }
    } catch (_) {}

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 1. TOP HEADER BAR: Title, Subtitle, Bell Badge & Parent Avatar
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Profile',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          "Manage your child's information\nand transport settings",
                          style: TextStyle(
                            fontSize: 13,
                            color: Color(0xFF64748B),
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Notification Bell Badge
                  InkWell(
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (context) => NotificationsScreen(
                            students: _students,
                          ),
                        ),
                      );
                    },
                    borderRadius: BorderRadius.circular(24),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 3)),
                        ],
                      ),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          const Icon(Icons.notifications_none_rounded, color: Color(0xFF334155), size: 24),
                          Positioned(
                            top: 8,
                            right: 8,
                            child: Container(
                              padding: const EdgeInsets.all(4),
                              decoration: const BoxDecoration(
                                color: Color(0xFFEF4444),
                                shape: BoxShape.circle,
                              ),
                              child: const Text(
                                '3',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Parent Profile Avatar (With Photo CRUD trigger)
                  GestureDetector(
                    onTap: () => _showPhotoPickerModal(_parentId, 'profiles', _parentName, _parentAvatarUrl),
                    child: Stack(
                      children: [
                        CircleAvatar(
                          radius: 22,
                          backgroundColor: const Color(0xFFDBEAFE),
                          backgroundImage: _parentAvatarUrl != null ? NetworkImage(_parentAvatarUrl!) : null,
                          child: _parentAvatarUrl == null
                              ? Text(
                                  _parentName.isNotEmpty ? _parentName[0].toUpperCase() : 'P',
                                  style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF2563EB)),
                                )
                              : null,
                        ),
                        Positioned(
                          bottom: 0,
                          right: 0,
                          child: Container(
                            padding: const EdgeInsets.all(3),
                            decoration: const BoxDecoration(
                              color: Color(0xFF10B981),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.camera_alt_rounded, size: 10, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // 2. MY CHILDREN SECTION
              const Text(
                'My Children',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 12),

              SizedBox(
                height: 88,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: _students.length + 1,
                  itemBuilder: (context, index) {
                    if (index == _students.length) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: Container(
                          width: 52,
                          height: 84,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: const Icon(Icons.add, color: Color(0xFF64748B), size: 26),
                        ),
                      );
                    }

                    final childItem = _students[index];
                    final bool isSelected = index == _selectedStudentIndex;
                    final String name = childItem['name'] ?? 'Child';
                    final String grade = childItem['grade'] ?? 'Grade 1';
                    final String transit = childItem['transit_status'] ?? 'On the Bus';
                    final String? childAvatar = childItem['avatar_url'] as String?;

                    Color statusColor = const Color(0xFF16A34A);
                    Color statusBg = const Color(0xFFDCFCE7);
                    if (transit == 'At School') {
                      statusColor = const Color(0xFF2563EB);
                      statusBg = const Color(0xFFDBEAFE);
                    } else if (transit == 'Dropped Home' || transit == 'Dropped') {
                      statusColor = const Color(0xFF9333EA);
                      statusBg = const Color(0xFFF3E8FF);
                    }

                    return GestureDetector(
                      onTap: () {
                        setState(() {
                          _selectedStudentIndex = index;
                        });
                      },
                      child: Container(
                        margin: const EdgeInsets.only(right: 12),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: isSelected ? const Color(0xFFF0FDF4) : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: isSelected ? const Color(0xFF10B981) : const Color(0xFFE2E8F0),
                            width: isSelected ? 2 : 1,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.04),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 20,
                              backgroundColor: const Color(0xFFE2E8F0),
                              backgroundImage: childAvatar != null ? NetworkImage(childAvatar) : null,
                              child: childAvatar == null
                                  ? Text(
                                      name[0].toUpperCase(),
                                      style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                                    )
                                  : null,
                            ),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  name,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF0F172A),
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  grade,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: Color(0xFF64748B),
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: statusBg,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Container(
                                        width: 6,
                                        height: 6,
                                        decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle),
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        transit,
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                          color: statusColor,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),

              const SizedBox(height: 20),

              // 3. SELECTED CHILD DETAILS WHITE CARD
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.06),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Child Header Row with Camera Badge
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        GestureDetector(
                          onTap: () => _showPhotoPickerModal(studentId, 'students', studentName, studentAvatarUrl),
                          child: Stack(
                            children: [
                              Container(
                                width: 84,
                                height: 84,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(20),
                                  color: const Color(0xFFF1F5F9),
                                  image: studentAvatarUrl != null
                                      ? DecorationImage(image: NetworkImage(studentAvatarUrl), fit: BoxFit.cover)
                                      : null,
                                ),
                                child: studentAvatarUrl == null
                                    ? const Icon(Icons.person, size: 48, color: Color(0xFF94A3B8))
                                    : null,
                              ),
                              Positioned(
                                bottom: 4,
                                right: 4,
                                child: Container(
                                  padding: const EdgeInsets.all(5),
                                  decoration: const BoxDecoration(
                                    color: Color(0xFF10B981),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.camera_alt_rounded, size: 14, color: Colors.white),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      studentName,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 20,
                                        fontWeight: FontWeight.bold,
                                        color: Color(0xFF0F172A),
                                      ),
                                    ),
                                  ),
                                  const Text(
                                    'Edit ✏️',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF10B981),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFDCFCE7),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  student['status'] ?? 'Active',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF15803D),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  const Icon(Icons.school_outlined, size: 16, color: Color(0xFF64748B)),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      schoolName,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.bold,
                                        color: Color(0xFF334155),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 3),
                              Text(
                                '$studentGrade  •  Admission No. $admissionNo',
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 20),

                    // Soft Green Bus & Conductor Info Bar (Responsive Overflow-Free Row)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF0FDF4),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFDCFCE7)),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 4,
                            child: Row(
                              children: [
                                const Icon(Icons.directions_bus_rounded, color: Color(0xFF10B981), size: 20),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(vehicleBusNo, overflow: TextOverflow.ellipsis, maxLines: 1, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Color(0xFF64748B))),
                                      Text(vehiclePlate, overflow: TextOverflow.ellipsis, maxLines: 1, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            flex: 5,
                            child: Row(
                              children: [
                                const Icon(Icons.person_outline_rounded, color: Color(0xFF10B981), size: 20),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Text('Conductor', overflow: TextOverflow.ellipsis, maxLines: 1, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Color(0xFF64748B))),
                                      Text(conductorName, overflow: TextOverflow.ellipsis, maxLines: 1, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            flex: 5,
                            child: Row(
                              children: [
                                const Icon(Icons.location_on_outlined, color: Color(0xFF10B981), size: 20),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Text('Pickup Stage', overflow: TextOverflow.ellipsis, maxLines: 1, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Color(0xFF64748B))),
                                      Text(pickupStageName, overflow: TextOverflow.ellipsis, maxLines: 1, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                    ],
                                  ),
                                ),
                                const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8), size: 18),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 24),

                    // Personal Information Section
                    const Text(
                      'Personal Information',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 14),

                    Row(
                      children: [
                        // DOB
                        Expanded(
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: const BoxDecoration(color: Color(0xFFF1F5F9), shape: BoxShape.circle),
                                child: const Icon(Icons.calendar_today_rounded, size: 18, color: Color(0xFF10B981)),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Date of Birth', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                                    Text(dateOfBirth, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        // Gender
                        Expanded(
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: const BoxDecoration(color: Color(0xFFF1F5F9), shape: BoxShape.circle),
                                child: const Icon(Icons.person_outline_rounded, size: 18, color: Color(0xFF10B981)),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Gender', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                                    Text(gender, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),

                    // Home & Transport Section
                    const Text(
                      'Home & Transport',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Home Location Tile
                    InkWell(
                      onTap: () async {
                        LatLng initialLoc = const LatLng(-1.2721, 36.7981);
                        if (student['pickup_location'] != null) {
                          final String? coordsStr = student['pickup_location'] as String?;
                          if (coordsStr != null) {
                            final clean = coordsStr.replaceAll('POINT(', '').replaceAll(')', '').trim();
                            final parts = clean.split(' ');
                            if (parts.length >= 2) {
                              initialLoc = LatLng(double.parse(parts[1]), double.parse(parts[0]));
                            }
                          }
                        }
                        final res = await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (context) => RelocateScreen(
                              studentId: studentId,
                              studentName: studentName,
                              initialLocation: initialLoc,
                            ),
                          ),
                        );
                        if (res == true) _loadSessionAndData();
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: const BoxDecoration(color: Color(0xFFF1F5F9), shape: BoxShape.circle),
                              child: const Icon(Icons.home_rounded, size: 20, color: Color(0xFF10B981)),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Home Location', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                  Text(homeAddress, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(12)),
                              child: const Text('150 m • 2 min walk', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF16A34A))),
                            ),
                            const SizedBox(width: 8),
                            const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8), size: 22),
                          ],
                        ),
                      ),
                    ),

                    const Divider(color: Color(0xFFF1F5F9)),

                    // Pickup Stage Tile
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: const BoxDecoration(color: Color(0xFFF1F5F9), shape: BoxShape.circle),
                            child: const Icon(Icons.location_on_rounded, size: 20, color: Color(0xFF8B5CF6)),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Pickup Stage', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                Text(pickupStageAddress, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8), size: 22),
                        ],
                      ),
                    ),

                    const Divider(color: Color(0xFFF1F5F9)),

                    // Transport Schedule Tile
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: const BoxDecoration(color: Color(0xFFF1F5F9), shape: BoxShape.circle),
                            child: const Icon(Icons.calendar_today_rounded, size: 20, color: Color(0xFF2563EB)),
                          ),
                          const SizedBox(width: 14),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Transport Schedule', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                Text('Mon - Fri (Morning & Afternoon)', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8), size: 22),
                        ],
                      ),
                    ),

                    const Divider(color: Color(0xFFF1F5F9)),

                    // Today's Status Tile
                    InkWell(
                      onTap: () async {
                        final res = await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (context) => AttendanceFormScreen(
                              student: student,
                              initialIsPresent: (student['status'] ?? 'Present') == 'Present',
                            ),
                          ),
                        );
                        if (res == true) _loadSessionAndData();
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: const BoxDecoration(color: Color(0xFFF1F5F9), shape: BoxShape.circle),
                              child: const Icon(Icons.person_outline_rounded, size: 20, color: Color(0xFFF59E0B)),
                            ),
                            const SizedBox(width: 14),
                            const Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text("Today's Status", style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                  Text('Will use transport', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(color: const Color(0xFFDCFCE7), borderRadius: BorderRadius.circular(12)),
                              child: Text(student['status'] ?? 'Present', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF15803D))),
                            ),
                            const SizedBox(width: 8),
                            const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8), size: 22),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 28),

                    // 4. CONTACTS SECTION (Renamed from Emergency Contacts, Max 1 Guardian)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Contacts',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        if (_guardian == null)
                          GestureDetector(
                            onTap: _showAddGuardianModal,
                            child: const Text(
                              '+ Add Guardian',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF10B981),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Contact 1: Primary Parent
                    _buildContactTile(
                      name: _parentName,
                      role: 'Primary Parent',
                      phone: _parentPhone,
                      iconBg: const Color(0xFFDCFCE7),
                      iconColor: const Color(0xFF16A34A),
                      iconData: Icons.call_rounded,
                      onPhotoTap: () => _showPhotoPickerModal(_parentId, 'profiles', _parentName, _parentAvatarUrl),
                    ),
                    const SizedBox(height: 10),

                    // Contact 2: Secondary Guardian (Max 1)
                    if (_guardian != null)
                      _buildContactTile(
                        name: _guardian!['name'] ?? 'Grace Wanjohi',
                        role: _guardian!['relationship'] ?? 'Guardian',
                        phone: _guardian!['phone'] ?? '0700 111 222',
                        iconBg: const Color(0xFFFEF3C7),
                        iconColor: const Color(0xFFD97706),
                        iconData: Icons.person_outline_rounded,
                        onPhotoTap: () => _showPhotoPickerModal(_guardian!['id'], 'guardians', _guardian!['name'], _guardian!['avatar_url']),
                        onDelete: () {
                          showDialog(
                            context: context,
                            builder: (context) => AlertDialog(
                              title: const Text('Remove Guardian'),
                              content: Text('Are you sure you want to remove ${_guardian!['name']} as a guardian?'),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.of(context).pop(),
                                  child: const Text('Cancel'),
                                ),
                                TextButton(
                                  onPressed: () {
                                    setState(() {
                                      _guardian = null;
                                    });
                                    Navigator.of(context).pop();
                                  },
                                  child: const Text('Remove', style: TextStyle(color: Colors.red)),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Log Out Session Action Button
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: () {
                    showDialog(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('Log Out'),
                        content: const Text('Are you sure you want to log out of the parent portal?'),
                        actions: [
                          TextButton(
                            child: const Text('Cancel'),
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
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFEE2E2),
                    foregroundColor: const Color(0xFFEF4444),
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  icon: const Icon(Icons.logout_rounded, size: 20),
                  label: const Text('Log Out Session', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  // Contact Tile Helper with Call, Message, Camera, and Remove
  Widget _buildContactTile({
    required String name,
    required String role,
    required String phone,
    required Color iconBg,
    required Color iconColor,
    required IconData iconData,
    VoidCallback? onPhotoTap,
    VoidCallback? onDelete,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF1F5F9)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
            child: Icon(iconData, color: iconColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$name ($role)',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                ),
                const SizedBox(height: 2),
                Text(phone, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              ],
            ),
          ),
          if (onPhotoTap != null)
            IconButton(
              icon: const Icon(Icons.camera_alt_outlined, color: Color(0xFF64748B), size: 20),
              onPressed: onPhotoTap,
              tooltip: 'Update Photo',
            ),
          IconButton(
            icon: const Icon(Icons.phone_outlined, color: Color(0xFF10B981), size: 20),
            onPressed: () => _callConductor(phone),
            tooltip: 'Call',
          ),
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline_rounded, color: Color(0xFF10B981), size: 20),
            onPressed: () => _callConductor(phone),
            tooltip: 'Message',
          ),
          if (onDelete != null)
            IconButton(
              icon: const Icon(Icons.delete_outline_rounded, color: Color(0xFFEF4444), size: 20),
              onPressed: onDelete,
              tooltip: 'Remove Guardian',
            ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return const Center(
      child: Text(
        'No registered children found under this profile.',
        style: TextStyle(color: Color(0xFF94A3B8), fontSize: 16),
      ),
    );
  }
}
