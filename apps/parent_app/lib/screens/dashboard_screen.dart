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
  int _currentIndex = 0;
  int _selectedStudentIndex = 0;
  String _parentName = 'Parent';
  String _parentId = '';
  List<dynamic> _students = [];
  bool _isLoading = true;

  // Attendance Form State
  String _selectedReason = 'Sick';
  final TextEditingController _notesController = TextEditingController();

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

      // Fetch fresh data from Supabase (with vehicle and driver joins)
      if (_parentId.isNotEmpty) {
        final List<dynamic> response = await SupabaseService.client
            .from('students')
            .select('id, name, route_id, status, route:routes(id, name, vehicle:vehicles(id, model, license_plate, driver:profiles(id, name, phone))))')
            .eq('parent_id', _parentId);
        
        setState(() {
          _students = response;
          if (_selectedStudentIndex >= _students.length) {
            _selectedStudentIndex = 0;
          }
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
      backgroundColor: const Color(0xFF0A0E1A), // Dark Navy
      appBar: AppBar(
        title: Text(
          _currentIndex == 0
              ? 'Safaricom Track Parent'
              : _currentIndex == 1
                  ? 'Live Transit Map'
                  : _currentIndex == 2
                      ? 'Attendance Manager'
                      : 'My Profile & Staff',
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
        backgroundColor: const Color(0xFF151C2C),
        selectedItemColor: const Color(0xFF10B981),
        unselectedItemColor: const Color(0xFF64748B),
        showSelectedLabels: true,
        showUnselectedLabels: true,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
        unselectedLabelStyle: const TextStyle(fontSize: 11),
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

  Widget _buildHomeTab() {
    if (_students.isEmpty) {
      return _buildEmptyState();
    }
    
    final student = _students[_selectedStudentIndex];
    final bool isPresent = student['status'] == 'Present';
    final String routeName = student['route'] != null && student['route']['name'] != null
        ? student['route']['name']
        : 'Route Unassigned';
        
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. Children Selector Row (if more than 1 student)
          if (_students.length > 1) ...[
            const Text(
              'SELECT CHILD',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: Color(0xFF94A3B8),
                letterSpacing: 1.0,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 48,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _students.length,
                itemBuilder: (context, index) {
                  final isSelected = index == _selectedStudentIndex;
                  final child = _students[index];
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: InkWell(
                      onTap: () {
                        setState(() {
                          _selectedStudentIndex = index;
                        });
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          gradient: isSelected
                              ? const LinearGradient(
                                  colors: [Color(0xFF10B981), Color(0xFF059669)],
                                )
                              : null,
                          color: isSelected ? null : const Color(0xFF151C2C),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: isSelected ? Colors.transparent : const Color(0xFF223049),
                          ),
                        ),
                        child: Center(
                          child: Text(
                            child['name']?.split(' ')?.first ?? 'Child',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
          ],

          // 2. Large Student transit card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF151C2C),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFF223049), width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  offset: const Offset(0, 8),
                  blurRadius: 20,
                )
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: isPresent
                          ? const Color(0xFF10B981).withOpacity(0.15)
                          : Colors.amber.withOpacity(0.15),
                      child: Icon(
                        Icons.person,
                        size: 28,
                        color: isPresent ? const Color(0xFF10B981) : Colors.amber,
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
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            routeName,
                            style: const TextStyle(
                              fontSize: 14,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                
                // Status Badge
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'TRANSIT STATUS',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF64748B),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: isPresent
                            ? const Color(0xFF10B981).withOpacity(0.12)
                            : Colors.amber.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isPresent
                              ? const Color(0xFF10B981).withOpacity(0.3)
                              : Colors.amber.withOpacity(0.3),
                        ),
                      ),
                      child: Text(
                        isPresent ? '🟢 Active Ride' : '⚪ Marked Absent',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: isPresent ? const Color(0xFF10B981) : Colors.amber,
                        ),
                      ),
                    ),
                  ],
                ),
                
                if (student['route_id'] != null) ...[
                  const SizedBox(height: 20),
                  // Track button CTA
                  Container(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF10B981), Color(0xFF059669)],
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: ElevatedButton.icon(
                      onPressed: () {
                        setState(() {
                          _currentIndex = 1; // Switch to Map Tab!
                        });
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(50),
                      ),
                      icon: const Icon(Icons.gps_fixed),
                      label: const Text(
                        'TRACK LIVE TRANSIT',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          
          const SizedBox(height: 24),
          
          // 3. Today's Timeline
          const Text(
            'TODAY\'S JOURNEY TIMELINE',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Color(0xFF94A3B8),
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 12),
          
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF151C2C),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF223049)),
            ),
            child: Column(
              children: [
                _buildTimelineRow('7:05 AM', 'Trip Started', isPresent),
                _buildTimelineDivider(isPresent),
                _buildTimelineRow('7:15 AM', 'Bus Approaching Pickup Stage', isPresent),
                _buildTimelineDivider(isPresent),
                _buildTimelineRow('7:22 AM', 'Student Boarded', isPresent),
                _buildTimelineDivider(false),
                _buildTimelineRow('7:45 AM', 'Arrived at School', false),
              ],
            ),
          ),

          // 4. Quick Actions Shortcuts
          const SizedBox(height: 24),
          const Text(
            'QUICK SHORTCUTS',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Color(0xFF94A3B8),
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.5,
            children: [
              _buildQuickActionCard(
                Icons.gps_fixed,
                'Track Bus',
                () {
                  setState(() {
                    _currentIndex = 1;
                  });
                },
              ),
              _buildQuickActionCard(
                Icons.check_circle_outline,
                'Attendance',
                () {
                  setState(() {
                    _currentIndex = 2;
                  });
                },
              ),
              _buildQuickActionCard(
                Icons.person_outline,
                'My Profile',
                () {
                  setState(() {
                    _currentIndex = 3;
                  });
                },
              ),
              _buildQuickActionCard(
                Icons.phone_in_talk,
                'Call School',
                () {
                  // Emergency contact triggers (dialer placeholder)
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActionCard(IconData icon, String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF151C2C),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF223049)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: const Color(0xFF10B981), size: 28),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTimelineRow(String time, String title, bool isCompleted) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 65,
          child: Text(
            time,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: isCompleted ? Colors.white : const Color(0xFF64748B),
            ),
          ),
        ),
        Column(
          children: [
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isCompleted ? const Color(0xFF10B981) : Colors.transparent,
                border: Border.all(
                  color: isCompleted ? const Color(0xFF10B981) : const Color(0xFF475569),
                  width: 2.5,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              fontSize: 14,
              fontWeight: isCompleted ? FontWeight.bold : FontWeight.normal,
              color: isCompleted ? Colors.white : const Color(0xFF94A3B8),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTimelineDivider(bool isCompleted) {
    return Row(
      children: [
        const SizedBox(width: 65),
        Container(
          width: 14,
          alignment: Alignment.center,
          child: Container(
            width: 2.5,
            height: 20,
            color: isCompleted ? const Color(0xFF10B981) : const Color(0xFF475569),
          ),
        ),
        const SizedBox(width: 12),
      ],
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
    
    final student = _students[_selectedStudentIndex];
    final bool isPresent = student['status'] == 'Present';
    
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
          
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF151C2C),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFF223049)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Will ${student['name']} use school transport today?',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 20),
                
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: isPresent ? null : () => _toggleAbsenteeism(_selectedStudentIndex, true),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          decoration: BoxDecoration(
                            color: isPresent ? const Color(0xFF10B981).withOpacity(0.15) : const Color(0xFF0A0E1A),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: isPresent ? const Color(0xFF10B981) : const Color(0xFF223049),
                            ),
                          ),
                          child: Center(
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.check_circle_outline, color: isPresent ? const Color(0xFF10B981) : Colors.grey),
                                const SizedBox(width: 8),
                                Text(
                                  'YES, RIDING',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: isPresent ? const Color(0xFF10B981) : Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: InkWell(
                        onTap: !isPresent ? null : () => _toggleAbsenteeism(_selectedStudentIndex, false),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          decoration: BoxDecoration(
                            color: !isPresent ? Colors.amber.withOpacity(0.15) : const Color(0xFF0A0E1A),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: !isPresent ? Colors.amber : const Color(0xFF223049),
                            ),
                          ),
                          child: Center(
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.cancel_outlined, color: !isPresent ? Colors.amber : Colors.grey),
                                const SizedBox(width: 8),
                                Text(
                                  'NO, ABSENT',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: !isPresent ? Colors.amber : Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                
                if (!isPresent) ...[
                  const SizedBox(height: 24),
                  const Text(
                    'REASON FOR ABSENCE',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 8),
                  
                  DropdownButtonFormField<String>(
                    dropdownColor: const Color(0xFF151C2C),
                    value: _selectedReason,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: const Color(0xFF0A0E1A),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF223049)),
                      ),
                    ),
                    items: ['Sick', 'Holiday', 'Personal', 'Other'].map((String val) {
                      return DropdownMenuItem<String>(
                        value: val,
                        child: Text(val),
                      );
                    }).toList(),
                    onChanged: (val) {
                      setState(() {
                        _selectedReason = val ?? 'Sick';
                      });
                    },
                  ),
                  
                  const SizedBox(height: 20),
                  const Text(
                    'MESSAGE TO DRIVER (OPTIONAL)',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                  const SizedBox(height: 8),
                  
                  TextFormField(
                    controller: _notesController,
                    style: const TextStyle(color: Colors.white),
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: 'e.g. Please proceed without picking up James today.',
                      hintStyle: const TextStyle(color: Color(0xFF64748B)),
                      filled: true,
                      fillColor: const Color(0xFF0A0E1A),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF223049)),
                      ),
                    ),
                  ),
                ],
              ],
            ),
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
    
    // Resolve driver details safely
    String driverName = 'John Kamau';
    String driverPhone = '+254 712 345 678';
    String vehicleModel = 'Isuzu FRR 33-Seater';
    String vehiclePlate = 'KBC 104D';
    
    try {
      if (student['route'] != null && student['route']['vehicle'] != null) {
        final vehicle = student['route']['vehicle'];
        if (vehicle['model'] != null) vehicleModel = vehicle['model'];
        if (vehicle['license_plate'] != null) vehiclePlate = vehicle['license_plate'];
        
        if (vehicle['driver'] != null) {
          final driver = vehicle['driver'];
          if (driver['name'] != null) driverName = driver['name'];
          if (driver['phone'] != null) driverPhone = driver['phone'];
        }
      }
    } catch (_) {}

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. Parent Profile Header Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF151C2C),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF223049)),
            ),
            child: Row(
              children: [
                const CircleAvatar(
                  radius: 30,
                  backgroundColor: Color(0xFF10B981),
                  child: Icon(Icons.person, size: 36, color: Colors.white),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _parentName,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Role: Parent Portal User',
                        style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          
          const SizedBox(height: 24),
          
          // 2. Assigned Driver details
          const Text(
            'ASSIGNED DRIVER DETAILS',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Color(0xFF94A3B8),
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 12),
          
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF151C2C),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF223049)),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: const Color(0xFF2563EB).withOpacity(0.15),
                      child: const Icon(Icons.directions_bus, color: Color(0xFF2563EB)),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            driverName,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Vehicle: $vehicleModel ($vehiclePlate)',
                            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Dialing driver at $driverPhone...'),
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF10B981),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        icon: const Icon(Icons.phone),
                        label: const Text('CALL DRIVER', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          
          const SizedBox(height: 32),
          
          // 3. Settings / Log Out
          ElevatedButton(
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
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444).withOpacity(0.1),
              foregroundColor: Colors.red,
              side: const BorderSide(color: Colors.red),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              minimumSize: const Size.fromHeight(50),
            ),
            child: const Text(
              'LOG OUT SESSION',
              style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.5),
            ),
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
