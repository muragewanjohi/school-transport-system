import 'dart:async';
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
import 'package:parent_app/screens/student_info_screen.dart';
import 'package:parent_app/utils/eta_utils.dart';
import 'package:parent_app/widgets/eta_display.dart';
import 'package:parent_app/widgets/crew_contact_card.dart';
import 'package:parent_app/widgets/delete_account_link.dart';
import 'package:parent_app/widgets/logout_button.dart';
import 'package:parent_app/services/parent_etas_service.dart';
import 'package:parent_app/services/parent_notifications_service.dart';
import 'package:parent_app/services/parent_children_service.dart';
import 'package:parent_app/utils/parent_children_logic.dart';
import 'package:parent_app/services/parent_push_service.dart';
import 'package:parent_app/services/parent_live_service.dart';
import 'package:parent_app/utils/parent_attendance_logic.dart';
import 'package:parent_app/utils/parent_avatar_logic.dart';
import 'package:parent_app/utils/parent_grade_label.dart';
import 'package:parent_app/utils/parent_map_logic.dart';
import 'package:parent_app/utils/parent_trip_details.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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

  // Live ETA for the selected child (polled via /api/parent/etas)
  StopEta? _selectedStopEta;
  Timer? _etaPollTimer;
  Timer? _notificationPollTimer;
  RealtimeChannel? _notificationsChannel;
  int _unreadCount = 0;
  NotificationsScreen? _notificationsTab;
  String? _latestNotificationId;
  bool _inboxPrimed = false;

  /// Active trip snapshot for Home status / bus / ETA cards + attendance gate.
  ParentLiveSnapshot? _homeLive;
  String? get _attendanceTripDirection => _homeLive?.direction;
  String? get _attendanceManifest => _homeLive?.attendance;

  Future<void> _showPhotoPickerModal(
    String id,
    String targetTable,
    String name,
    String? currentAvatarUrl, {
    String? guardianPhone,
    String? studentIdForGuardian,
  }) async {
    final isGuardianJson = targetTable == 'guardian_json';

    Future<void> applyPicked(XFile image) async {
      final bytes = await image.readAsBytes();
      String? publicUrl;
      if (isGuardianJson) {
        final phone = guardianPhone ?? '';
        final studentId = studentIdForGuardian ?? '';
        if (phone.isEmpty || studentId.isEmpty) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Could not update guardian photo.'),
              backgroundColor: Color(0xFFEF4444),
              behavior: SnackBarBehavior.floating,
            ),
          );
          return;
        }
        publicUrl = await SupabaseService.uploadGuardianAvatar(
          studentId: studentId,
          guardianPhone: phone,
          imageBytes: bytes,
          fileName: image.name,
        );
      } else {
        publicUrl = await SupabaseService.uploadAvatar(
          id: id,
          targetTable: targetTable,
          imageBytes: bytes,
          fileName: image.name,
        );
      }

      if (!mounted) return;
      if (publicUrl == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not update photo. Try again.'),
            backgroundColor: Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
          ),
        );
        return;
      }

      setState(() {
        if (targetTable == 'profiles' && id == _parentId) {
          _parentAvatarUrl = publicUrl;
        } else if (targetTable == 'students') {
          for (var s in _students) {
            if (s['id'] == id) s['avatar_url'] = publicUrl;
          }
        } else if (isGuardianJson && _guardian != null) {
          _guardian!['avatar_url'] = publicUrl;
          final sid = studentIdForGuardian;
          if (sid != null) {
            for (var s in _students) {
              if (s['id'] != sid) continue;
              final list = s['guardians'];
              if (list is List) {
                s['guardians'] = withGuardianAvatarUrl(
                  guardians: list,
                  guardianPhone: guardianPhone ?? '',
                  avatarUrl: publicUrl,
                );
              }
            }
          }
        }
      });
      _loadSessionAndData();
    }

    Future<void> removePhoto() async {
      bool success = false;
      if (isGuardianJson) {
        success = await SupabaseService.deleteGuardianAvatar(
          studentId: studentIdForGuardian ?? '',
          guardianPhone: guardianPhone ?? '',
          currentAvatarUrl: currentAvatarUrl ?? '',
        );
      } else {
        success = await SupabaseService.deleteAvatar(
          id: id,
          targetTable: targetTable,
          currentAvatarUrl: currentAvatarUrl ?? '',
        );
      }
      if (!mounted) return;
      if (!success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not remove photo. Try again.'),
            backgroundColor: Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
          ),
        );
        return;
      }
      setState(() {
        if (targetTable == 'profiles' && id == _parentId) {
          _parentAvatarUrl = null;
        } else if (targetTable == 'students') {
          for (var s in _students) {
            if (s['id'] == id) s['avatar_url'] = null;
          }
        } else if (isGuardianJson && _guardian != null) {
          _guardian!['avatar_url'] = null;
        }
      });
      _loadSessionAndData();
    }

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
                  final XFile? image =
                      await picker.pickImage(source: ImageSource.camera, imageQuality: 80);
                  if (image != null) await applyPicked(image);
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_rounded, color: Color(0xFF10B981)),
                title: const Text('Choose from Gallery', style: TextStyle(color: Colors.white)),
                onTap: () async {
                  Navigator.of(context).pop();
                  final picker = ImagePicker();
                  final XFile? image =
                      await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
                  if (image != null) await applyPicked(image);
                },
              ),
              if (currentAvatarUrl != null && currentAvatarUrl.isNotEmpty) ...[
                const Divider(color: Color(0xFF223049)),
                ListTile(
                  leading: const Icon(Icons.delete_forever_rounded, color: Color(0xFFEF4444)),
                  title: const Text('Remove Photo', style: TextStyle(color: Color(0xFFEF4444))),
                  onTap: () async {
                    Navigator.of(context).pop();
                    await removePhoto();
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
    _etaPollTimer?.cancel();
    _notificationPollTimer?.cancel();
    _notificationsChannel?.unsubscribe();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _refreshSelectedStudentEta() async {
    if (_students.isEmpty || _selectedStudentIndex >= _students.length) {
      if (mounted) setState(() => _selectedStopEta = null);
      return;
    }
    final student = Map<String, dynamic>.from(_students[_selectedStudentIndex] as Map);
    final studentId = student['id']?.toString() ?? '';
    final eta = await ParentEtasService.fetchStudentEta(studentId);
    if (!mounted) return;
    setState(() => _selectedStopEta = eta);
  }

  Future<void> _refreshAttendanceGate() async {
    if (_students.isEmpty || _selectedStudentIndex >= _students.length) {
      if (mounted) setState(() => _homeLive = null);
      return;
    }
    final student = Map<String, dynamic>.from(_students[_selectedStudentIndex] as Map);
    final studentId = student['id']?.toString() ?? '';
    final routeId = student['route_id']?.toString();
    try {
      final live = await ParentLiveService.fetchLive(studentId, routeId: routeId)
          .timeout(const Duration(seconds: 8), onTimeout: () => null);
      if (!mounted) return;
      setState(() {
        _homeLive = live;
        if (live?.transitStatus != null && live!.transitStatus!.isNotEmpty) {
          student['transit_status'] = live.transitStatus;
          _students[_selectedStudentIndex] = student;
        }
      });
    } catch (_) {
      // Keep last known live card; toggle still uses local transit_status.
    }
  }

  void _startEtaPolling() {
    _refreshSelectedStudentEta();
    _refreshAttendanceGate();
    _etaPollTimer?.cancel();
    _etaPollTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      _refreshSelectedStudentEta();
      _refreshAttendanceGate();
    });
  }

  void _startNotificationInbox() {
    ParentPushService.registerAfterLogin();
    _refreshUnread(announceNew: false);
    _notificationPollTimer?.cancel();
    _notificationPollTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      _refreshUnread();
    });
    _subscribeNotifications();
  }

  Future<void> _refreshUnread({bool announceNew = true}) async {
    try {
      final inbox = await ParentNotificationsService.fetchInbox();
      if (!mounted) return;
      final latestId = inbox.items.isEmpty ? null : inbox.items.first.id;
      final isNew = announceNew &&
          _inboxPrimed &&
          latestId != null &&
          latestId != _latestNotificationId;
      if (isNew) {
        final newest = inbox.items.first;
        await ParentPushService.showLocal(newest.title, newest.subtitle);
      }
      setState(() {
        _unreadCount = inbox.unreadCount;
        _latestNotificationId = latestId ?? _latestNotificationId;
        _inboxPrimed = true;
      });
    } catch (_) {}
  }

  void _subscribeNotifications() {
    if (_parentId.isEmpty) return;
    _notificationsChannel?.unsubscribe();
    _notificationsChannel = SupabaseService.client
        .channel('parent-notifications-$_parentId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'notifications',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'user_id',
            value: _parentId,
          ),
          callback: (payload) {
            final rec = payload.newRecord;
            final title = rec['title']?.toString();
            final message = rec['message']?.toString();
            if (title != null && message != null) {
              ParentPushService.showLocal(title, message);
            }
            _refreshUnread(announceNew: false);
          },
        )
        .subscribe();
  }

  Future<void> _openNotifications() async {
    setState(() {
      _currentIndex = 2;
    });
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

  void _applyStudentRoster(List<dynamic> nextStudents) {
    _students = nextStudents;
    if (_selectedStudentIndex >= _students.length) {
      _selectedStudentIndex = 0;
    }
    if (_students.isEmpty || _selectedStudentIndex >= _students.length) return;
    final sel = _students[_selectedStudentIndex];
    if (sel is! Map) return;
    final rawGuardians = sel['guardians'];
    if (rawGuardians is! List || rawGuardians.isEmpty) return;
    final guardian = rawGuardians.length > 1 ? rawGuardians[1] : rawGuardians[0];
    if (guardian is Map) {
      _guardian = Map<String, dynamic>.from(guardian);
    }
  }

  Future<List<dynamic>?> _fetchStudentsFromSupabase() async {
    if (_parentId.isEmpty || !isParentUuid(_parentId)) return null;

    final nested = await awaitOrNull(
      SupabaseService.client
          .from('students')
          .select(
            'id, name, grade, class_name, address, route_id, status, guardians, avatar_url, transit_status, tenant:tenants(id, name), pickup_stop:stops!students_pickup_stop_id_fkey(id, name, location), dropoff_stop:stops!students_dropoff_stop_id_fkey(id, name, location), route:routes(id, name, schedules(id, name, departure_time, direction, days_of_week))',
          )
          .eq('parent_id', _parentId),
    );
    if (nested is List) return nested;

    final simple = await awaitOrNull(
      SupabaseService.client
          .from('students')
          .select(
            'id, name, grade, class_name, address, route_id, status, guardians, avatar_url, transit_status',
          )
          .eq('parent_id', _parentId),
    );
    return simple is List ? simple : null;
  }

  Future<void> _refreshProfile() async {
    if (_parentId.isEmpty || !isParentUuid(_parentId)) return;
    final profileRes = await awaitOrNull(
      SupabaseService.client
          .from('profiles')
          .select('id, name, phone, email, avatar_url')
          .eq('id', _parentId)
          .maybeSingle(),
    );
    if (!mounted || profileRes == null) return;
    setState(() {
      if (profileRes['name'] != null) _parentName = profileRes['name'];
      if (profileRes['avatar_url'] != null) _parentAvatarUrl = profileRes['avatar_url'];
      if (profileRes['phone'] != null) _parentPhone = profileRes['phone'];
      if (profileRes['email'] != null) _parentEmail = profileRes['email'];
    });
  }

  Future<void> _loadSessionAndData() async {
    if (mounted) setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      _parentId = prefs.getString('parent_id') ?? '';
      _parentName = prefs.getString('parent_name') ?? 'Parent';

      final cachedJson = prefs.getString('children_json');
      if (cachedJson != null) {
        _applyStudentRoster(json.decode(cachedJson) as List<dynamic>);
      }

      // HMAC parent login often has no usable Supabase session. Never block Home
      // on PostgREST (default client wait is ~60s per query).
      if (mounted) setState(() => _isLoading = false);

      final apiChildren = await ParentChildrenService.fetchChildren();
      final supabaseChildren =
          apiChildren == null ? await _fetchStudentsFromSupabase() : null;
      final nextStudents = resolveParentChildren(
        cached: _students,
        apiChildren: apiChildren,
        supabaseChildren: supabaseChildren,
      );

      if (!mounted) return;
      setState(() => _applyStudentRoster(nextStudents));
      await prefs.setString('children_json', json.encode(nextStudents));
      _startEtaPolling();
      await _refreshProfile();
    } catch (e) {
      debugPrint('Error loading parent dashboard data');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
        _startNotificationInbox();
      }
    }
  }

  Future<void> _toggleAbsenteeism(int index, bool markPresent) async {
    if (index < 0 || index >= _students.length) return;
    final student = Map<String, dynamic>.from(_students[index] as Map);
    final String studentId = student['id']?.toString() ?? '';
    if (studentId.isEmpty) return;

    final canToggle = ParentAttendanceGate.canToggle(
      tripDirection: _attendanceTripDirection,
      transitStatus: student['transit_status']?.toString(),
      studentStatus: student['status']?.toString(),
      manifestAttendance: _attendanceManifest,
    );
    if (!canToggle) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.lock, color: Colors.white, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    ParentAttendanceGate.lockReason(
                      tripDirection: _attendanceTripDirection,
                      transitStatus: student['transit_status']?.toString(),
                      studentStatus: student['status']?.toString(),
                      manifestAttendance: _attendanceManifest,
                    ),
                  ),
                ),
              ],
            ),
            backgroundColor: const Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 4),
          ),
        );
      }
      return;
    }

    final String previous = (student['status'] ?? 'Present').toString();
    final String newStatus = markPresent ? 'Present' : 'Absent';
    if (previous == newStatus) return;

    setState(() {
      _students[index]['status'] = newStatus;
    });

    final success = await SupabaseService.updateStudentStatus(studentId, newStatus);
    if (!success) {
      setState(() {
        _students[index]['status'] = previous;
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
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('children_json', json.encode(_students));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${student['name']} marked as $newStatus.'),
            backgroundColor: markPresent ? const Color(0xFF10B981) : Colors.amber,
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
                  final String grade = formatStudentGradeLabel(
                    child['grade']?.toString(),
                    child['class_name']?.toString(),
                  );

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
                        _refreshSelectedStudentEta();
                        _refreshAttendanceGate();
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
    _notificationPollTimer?.cancel();
    await _notificationsChannel?.unsubscribe();
    await ParentPushService.unregisterOnLogout();
    try {
      await SupabaseService.client.auth.signOut();
    } catch (_) {}
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
        _notificationsTab ??= NotificationsScreen(
          isEmbedded: true,
          onUnreadCountChanged: (count) {
            if (!mounted) return;
            setState(() => _unreadCount = count);
          },
        );
        currentTabWidget = _notificationsTab!;
        break;
      case 3:
        currentTabWidget = _buildProfileTab();
        break;
      default:
        currentTabWidget = _buildHomeTab();
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC), // Clean white-slate canvas background
      appBar: (_currentIndex == 0 || _currentIndex == 2 || _currentIndex == 3)
          ? null // Home, Notifications, and Profile tabs render their own chrome
          : AppBar(
              title: const Text(
                'Live Transit Map',
                style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 18),
              ),
              backgroundColor: const Color(0xFF0A0E1A),
              foregroundColor: Colors.white,
              elevation: 0,
              centerTitle: true,
            ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF10B981)))
          : _currentIndex == 2
              ? currentTabWidget
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
        items: [
          const BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: 'Home',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.map_outlined),
            activeIcon: Icon(Icons.map),
            label: 'Map',
          ),
          BottomNavigationBarItem(
            icon: _navNotificationsIcon(active: false),
            activeIcon: _navNotificationsIcon(active: true),
            label: 'Notifications',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  Widget _navNotificationsIcon({required bool active}) {
    final icon = Icon(
      active ? Icons.notifications : Icons.notifications_outlined,
    );
    if (_unreadCount <= 0) return icon;
    return Badge(
      label: Text(_unreadCount > 9 ? '9+' : '$_unreadCount'),
      child: icon,
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
    final String studentName = student['name'] ?? 'Child';
    final String firstName = studentName.split(' ').first;
    final String gradeText = formatStudentGradeLabel(
      student['grade']?.toString(),
      student['class_name']?.toString(),
    );

    final live = _homeLive;
    final String transitStatusText = () {
      if (live != null) {
        return parentChildStatusLabel(
          live.transitStatus,
          attendance: live.attendance,
          direction: live.direction ?? live.nextTrip?.direction,
          tripActive: live.tripActive,
        );
      }
      return parentChildStatusLabel(
        student['transit_status']?.toString(),
        tripActive: false,
      );
    }();

    final String vehicleLabel = () {
      final plate = live?.vehiclePlate?.trim();
      if (plate != null && plate.isNotEmpty) return plate;
      try {
        final vehicle = student['route']?['vehicle'];
        final nested = vehicle is Map ? vehicle['license_plate']?.toString() : null;
        if (nested != null && nested.isNotEmpty) return nested;
      } catch (_) {}
      return '—';
    }();

    final ParentCrewContact? driverContact = () {
      if (live?.driver != null && live!.driver!.hasAnyDetail) return live.driver;
      final name = live?.driverName?.trim();
      if (name != null && name.isNotEmpty) {
        return ParentCrewContact(name: name);
      }
      try {
        final vehicle = student['route']?['vehicle'];
        if (vehicle is Map) {
          final drv = vehicle['driver'];
          if (drv is Map) {
            return ParentCrewContact(
              name: drv['name']?.toString(),
              phone: drv['phone']?.toString(),
              avatarUrl: drv['avatar_url']?.toString(),
            );
          }
        }
      } catch (_) {}
      return null;
    }();

    final ParentCrewContact? conductorContact = () {
      if (live?.conductor != null && live!.conductor!.hasAnyDetail) {
        return live.conductor;
      }
      try {
        final vehicle = student['route']?['vehicle'];
        if (vehicle is Map) {
          final cond = vehicle['conductor'];
          if (cond is Map) {
            final c = ParentCrewContact(
              name: cond['name']?.toString(),
              phone: cond['phone']?.toString(),
              avatarUrl: cond['avatar_url']?.toString(),
            );
            if (c.hasAnyDetail) return c;
          }
        }
      } catch (_) {}
      return null;
    }();

    final bool tripActive = live?.tripActive == true;

    final String nextStopName = live?.nextStopName?.trim().isNotEmpty == true
        ? live!.nextStopName!
        : (student['pickup_stop']?['name']?.toString() ??
            student['dropoff_stop']?['name']?.toString() ??
            '—');

    final int? etaMinutes = live?.etaMinutes ?? _selectedStopEta?.freshMinutesUntil();
    final int delaySeconds = live?.delaySeconds ?? _selectedStopEta?.delaySeconds ?? 0;
    final String etaTitle = live?.direction == 'SCHOOL_TO_HOME'
        ? 'ETA to Home'
        : (live?.direction == 'HOME_TO_SCHOOL' ? 'ETA to School' : 'ETA');

    final String parentFirstName = _parentName.split(' ').first;
    final bool canToggleAttendance = ParentAttendanceGate.canToggle(
      tripDirection: live?.direction,
      transitStatus: transitStatusText,
      studentStatus: student['status']?.toString(),
      manifestAttendance: live?.attendance,
    );
    final String attendanceLockReason = ParentAttendanceGate.lockReason(
      tripDirection: live?.direction,
      transitStatus: transitStatusText,
      studentStatus: student['status']?.toString(),
      manifestAttendance: live?.attendance,
    );

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
                  onTap: _openNotifications,
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
                      if (_unreadCount > 0)
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
                              _unreadCount > 9 ? '9+' : '$_unreadCount',
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
                          _refreshSelectedStudentEta();
                          _refreshAttendanceGate();
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
                                  vehicleLabel,
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
                        if (tripActive &&
                            ((driverContact?.hasAnyDetail ?? false) ||
                                (conductorContact?.hasAnyDetail ?? false))) ...[
                          const SizedBox(height: 12),
                          const Divider(color: Color(0xFFA7F3D0), height: 1),
                          const SizedBox(height: 10),
                          if (driverContact != null && driverContact.hasAnyDetail)
                            CrewContactCard(
                              roleLabel: 'DRIVER',
                              contact: driverContact,
                              onCall: (driverContact.phone?.trim().isNotEmpty == true)
                                  ? () => _callConductor(driverContact.phone!)
                                  : null,
                            ),
                          if (driverContact != null &&
                              driverContact.hasAnyDetail &&
                              conductorContact != null &&
                              conductorContact.hasAnyDetail)
                            const SizedBox(height: 8),
                          if (conductorContact != null && conductorContact.hasAnyDetail)
                            CrewContactCard(
                              roleLabel: 'CONDUCTOR',
                              contact: conductorContact,
                              onCall: (conductorContact.phone?.trim().isNotEmpty == true)
                                  ? () => _callConductor(conductorContact.phone!)
                                  : null,
                            ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ETA & Next Stop Metrics Sub-Cards
                  Row(
                    children: [
                      Expanded(
                        child: EtaMetricCard(
                          title: etaTitle,
                          etaMinutes: etaMinutes,
                          delaySeconds: delaySeconds,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFFF1F5F9)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Next Stop',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                nextStopName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                formatEtaMinutes(etaMinutes),
                                style: const TextStyle(
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

            // 3. TODAY'S RIDING STATUS — Present / Absent toggle (pickup, before boarding)
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
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'TODAY\'S RIDING STATUS',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF64748B),
                            letterSpacing: 0.8,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isPresent ? const Color(0xFFD1FAE5) : const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          isPresent ? 'PRESENT' : 'ABSENT',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: isPresent ? const Color(0xFF065F46) : const Color(0xFF92400E),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      isPresent ? 'Riding today' : 'Not riding today',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    subtitle: Text(
                      canToggleAttendance
                          ? 'Toggle before pickup on a pickup trip'
                          : attendanceLockReason,
                      style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                    ),
                    value: isPresent,
                    activeThumbColor: Colors.white,
                    activeTrackColor: const Color(0xFF10B981),
                    inactiveThumbColor: Colors.white,
                    inactiveTrackColor: const Color(0xFFFECACA),
                    onChanged: canToggleAttendance
                        ? (value) => _toggleAbsenteeism(_selectedStudentIndex, value)
                        : null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // 4. PRIMARY CTA BUTTON: Track Bus
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

  Widget _buildProfileTab() {
    if (_students.isEmpty) {
      return Scaffold(
        backgroundColor: const Color(0xFFF8FAFC),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Profile',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const Spacer(),
                const Text(
                  'No registered children found under this profile.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 16),
                ),
                const Spacer(),
                LogoutButton(onConfirm: _handleLogout),
                const SizedBox(height: 8),
                const Center(child: DeleteAccountLink()),
              ],
            ),
          ),
        ),
      );
    }
    
    final student = _students[_selectedStudentIndex];
    final String studentId = student['id'] ?? '';
    final String studentName = student['name'] ?? 'Reuel Njiru';
    final String studentGrade = student['grade'] != null 
        ? '${student['grade']} ${student['class_name'] ?? ''}'.trim() 
        : 'Grade 1 Nile';
    final String homeAddress = student['address'] ?? student['home_address'] ?? 'Kiambu Road, Nairobi';
    final String? studentAvatarUrl = student['avatar_url'] as String?;

    final route = student['route'];
    final schedules = route is Map ? route['schedules'] as List? : null;
    final pickupSchedule = scheduleForDirection(schedules, 'HOME_TO_SCHOOL');
    final dropoffSchedule = scheduleForDirection(schedules, 'SCHOOL_TO_HOME');
    final pickupTripSubtitle = parentTripDetailSubtitle(
      stopName: student['pickup_stop']?['name']?.toString(),
      schedule: pickupSchedule,
      emptyLabel: 'No pickup trip assigned',
    );
    final dropoffTripSubtitle = parentTripDetailSubtitle(
      stopName: student['dropoff_stop']?['name']?.toString(),
      schedule: dropoffSchedule,
      emptyLabel: 'No drop-off trip assigned',
    );

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
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'Profile',
                                style: TextStyle(
                                  fontSize: 28,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                            ),
                            LogoutButton(compact: true, onConfirm: _handleLogout),
                          ],
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
                    onTap: _openNotifications,
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
                          if (_unreadCount > 0)
                            Positioned(
                              top: 8,
                              right: 8,
                              child: Container(
                                padding: const EdgeInsets.all(4),
                                decoration: const BoxDecoration(
                                  color: Color(0xFFEF4444),
                                  shape: BoxShape.circle,
                                ),
                                child: Text(
                                  _unreadCount > 9 ? '9+' : '$_unreadCount',
                                  style: const TextStyle(
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
                    final String transit = parentChildStatusLabel(
                      childItem['transit_status']?.toString(),
                      tripActive: isSelected && (_homeLive?.tripActive ?? false),
                      direction: isSelected ? _homeLive?.direction : null,
                      attendance: isSelected ? _homeLive?.attendance : null,
                    );
                    final String? childAvatar = childItem['avatar_url'] as String?;

                    Color statusColor = const Color(0xFF16A34A);
                    Color statusBg = const Color(0xFFDCFCE7);
                    if (transit == 'At school' || transit == 'At School') {
                      statusColor = const Color(0xFF2563EB);
                      statusBg = const Color(0xFFDBEAFE);
                    } else if (transit == 'Waiting for pickup') {
                      statusColor = const Color(0xFFD97706);
                      statusBg = const Color(0xFFFEF3C7);
                    } else if (transit == 'Dropped Home' ||
                        transit == 'Dropped' ||
                        transit == 'Dropped off') {
                      statusColor = const Color(0xFF9333EA);
                      statusBg = const Color(0xFFF3E8FF);
                    }

                    return GestureDetector(
                      onTap: () {
                        setState(() {
                          _selectedStudentIndex = index;
                        });
                        _refreshSelectedStudentEta();
                        _refreshAttendanceGate();
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
                    // Student Information — single row → editable detail page
                    InkWell(
                      onTap: () async {
                        final updated = await Navigator.of(context).push<bool>(
                          MaterialPageRoute(
                            builder: (context) => StudentInfoScreen(student: student),
                          ),
                        );
                        if (updated == true) _loadSessionAndData();
                      },
                      borderRadius: BorderRadius.circular(16),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(14),
                                color: const Color(0xFFF1F5F9),
                                image: studentAvatarUrl != null
                                    ? DecorationImage(
                                        image: NetworkImage(studentAvatarUrl),
                                        fit: BoxFit.cover,
                                      )
                                    : null,
                              ),
                              child: studentAvatarUrl == null
                                  ? const Icon(Icons.person, size: 28, color: Color(0xFF94A3B8))
                                  : null,
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Student Information',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF0F172A),
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '$studentName · $studentGrade',
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: Color(0xFF64748B),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8), size: 22),
                          ],
                        ),
                      ),
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
                            const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8), size: 22),
                          ],
                        ),
                      ),
                    ),

                    const Divider(color: Color(0xFFF1F5F9)),

                    // Pickup trip
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: const BoxDecoration(color: Color(0xFFF1F5F9), shape: BoxShape.circle),
                            child: const Icon(Icons.wb_sunny_outlined, size: 20, color: Color(0xFFD97706)),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Pickup trip', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                Text(pickupTripSubtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),

                    const Divider(color: Color(0xFFF1F5F9)),

                    // Drop-off trip
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: const BoxDecoration(color: Color(0xFFF1F5F9), shape: BoxShape.circle),
                            child: const Icon(Icons.nights_stay_outlined, size: 20, color: Color(0xFF8B5CF6)),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Drop-off trip', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                                Text(dropoffTripSubtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                              ],
                            ),
                          ),
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
                      avatarUrl: _parentAvatarUrl,
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
                        avatarUrl: _guardian!['avatar_url']?.toString(),
                        onPhotoTap: () {
                          final student = _students.isNotEmpty &&
                                  _selectedStudentIndex < _students.length
                              ? _students[_selectedStudentIndex]
                              : null;
                          final studentId = student is Map
                              ? student['id']?.toString() ?? ''
                              : '';
                          _showPhotoPickerModal(
                            studentId,
                            'guardian_json',
                            _guardian!['name']?.toString() ?? 'Guardian',
                            _guardian!['avatar_url']?.toString(),
                            guardianPhone: _guardian!['phone']?.toString(),
                            studentIdForGuardian: studentId,
                          );
                        },
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

              LogoutButton(onConfirm: _handleLogout),
              const SizedBox(height: 8),
              const Center(child: DeleteAccountLink()),
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
    String? avatarUrl,
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
          GestureDetector(
            onTap: onPhotoTap,
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: iconBg,
                shape: BoxShape.circle,
                image: avatarUrl != null && avatarUrl.isNotEmpty
                    ? DecorationImage(image: NetworkImage(avatarUrl), fit: BoxFit.cover)
                    : null,
              ),
              child: avatarUrl != null && avatarUrl.isNotEmpty
                  ? null
                  : Icon(iconData, color: iconColor, size: 20),
            ),
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
