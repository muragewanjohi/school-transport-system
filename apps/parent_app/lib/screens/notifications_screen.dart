import 'package:flutter/material.dart';

class NotificationItem {
  final String id;
  final String time;
  final String title;
  final String subtitle;
  final String type; // 'check', 'bell', 'bus'
  final String dateGroup; // 'Today', 'Yesterday', 'Earlier'
  final String studentName;

  NotificationItem({
    required this.id,
    required this.time,
    required this.title,
    required this.subtitle,
    required this.type,
    required this.dateGroup,
    required this.studentName,
  });
}

class NotificationsScreen extends StatefulWidget {
  final List<dynamic> students;

  const NotificationsScreen({
    super.key,
    required this.students,
  });

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<NotificationItem> _notifications = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  void _loadNotifications() {
    // Generate dynamic notifications for all children of the parent
    final List<NotificationItem> items = [];

    if (widget.students.isNotEmpty) {
      for (int i = 0; i < widget.students.length; i++) {
        final student = widget.students[i];
        final String name = student['name'] ?? 'Child';
        final String firstName = name.split(' ').first;
        final String transitStatus = student['transit_status'] ?? 'On the Bus';
        final bool isOnboarded = transitStatus == 'On the Bus' || 
                                 transitStatus == 'Boarded' || 
                                 student['status'] == 'Boarded';

        // TODAY EVENTS
        if (isOnboarded) {
          items.add(
            NotificationItem(
              id: 't1_$i',
              time: '7:15 AM',
              title: '$firstName boarded the bus',
              subtitle: 'Kiambu Rd Stage',
              type: 'check',
              dateGroup: 'Today',
              studentName: name,
            ),
          );
        } else {
          items.add(
            NotificationItem(
              id: 't1_$i',
              time: '7:15 AM',
              title: '$firstName scheduled pickup',
              subtitle: 'Kiambu Rd Stage',
              type: 'check',
              dateGroup: 'Today',
              studentName: name,
            ),
          );
        }

        items.add(
          NotificationItem(
            id: 't2_$i',
            time: '7:07 AM',
            title: 'Bus is approaching pickup',
            subtitle: 'ETA 6 mins',
            type: 'bell',
            dateGroup: 'Today',
            studentName: name,
          ),
        );

        items.add(
          NotificationItem(
            id: 't3_$i',
            time: '7:00 AM',
            title: 'Trip started',
            subtitle: 'Driver has started the trip',
            type: 'bus',
            dateGroup: 'Today',
            studentName: name,
          ),
        );

        // YESTERDAY EVENTS
        items.add(
          NotificationItem(
            id: 'y1_$i',
            time: '2:52 PM',
            title: '$firstName dropped off',
            subtitle: 'Arrived safely at home',
            type: 'check',
            dateGroup: 'Yesterday',
            studentName: name,
          ),
        );

        items.add(
          NotificationItem(
            id: 'y2_$i',
            time: '2:40 PM',
            title: 'Bus was approaching home',
            subtitle: 'ETA 8 mins',
            type: 'bell',
            dateGroup: 'Yesterday',
            studentName: name,
          ),
        );

        items.add(
          NotificationItem(
            id: 'y3_$i',
            time: '2:30 PM',
            title: 'School dismissed',
            subtitle: 'Trip back home started',
            type: 'bus',
            dateGroup: 'Yesterday',
            studentName: name,
          ),
        );
      }
    } else {
      // Default child fallback
      items.addAll([
        NotificationItem(
          id: 't1',
          time: '7:15 AM',
          title: 'James boarded the bus',
          subtitle: 'Kiambu Rd Stage',
          type: 'check',
          dateGroup: 'Today',
          studentName: 'James Mwangi',
        ),
        NotificationItem(
          id: 't2',
          time: '7:07 AM',
          title: 'Bus is approaching pickup',
          subtitle: 'ETA 6 mins',
          type: 'bell',
          dateGroup: 'Today',
          studentName: 'James Mwangi',
        ),
        NotificationItem(
          id: 't3',
          time: '7:00 AM',
          title: 'Trip started',
          subtitle: 'Driver has started the trip',
          type: 'bus',
          dateGroup: 'Today',
          studentName: 'James Mwangi',
        ),
        NotificationItem(
          id: 'y1',
          time: '2:52 PM',
          title: 'James dropped off',
          subtitle: 'Arrived safely at home',
          type: 'check',
          dateGroup: 'Yesterday',
          studentName: 'James Mwangi',
        ),
        NotificationItem(
          id: 'y2',
          time: '2:40 PM',
          title: 'Bus was approaching home',
          subtitle: 'ETA 8 mins',
          type: 'bell',
          dateGroup: 'Yesterday',
          studentName: 'James Mwangi',
        ),
        NotificationItem(
          id: 'y3',
          time: '2:30 PM',
          title: 'School dismissed',
          subtitle: 'Trip back home started',
          type: 'bus',
          dateGroup: 'Yesterday',
          studentName: 'James Mwangi',
        ),
      ]);
    }

    setState(() {
      _notifications = items;
      _isLoading = false;
    });
  }

  void _clearAllNotifications() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF151C2C),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text(
          'Clear Notifications',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        content: const Text(
          'Are you sure you want to clear all notifications?',
          style: TextStyle(color: Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              setState(() {
                _notifications.clear();
              });
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('All notifications cleared.'),
                  backgroundColor: Color(0xFF10B981),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
            child: const Text('Clear All', style: TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationIcon(String type) {
    if (type == 'check') {
      return Container(
        width: 44,
        height: 44,
        decoration: const BoxDecoration(
          color: Color(0xFF10B981),
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.check_rounded,
          color: Colors.white,
          size: 24,
        ),
      );
    } else if (type == 'bell') {
      return Container(
        width: 44,
        height: 44,
        decoration: const BoxDecoration(
          color: Color(0xFFF59E0B),
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.notifications_rounded,
          color: Colors.white,
          size: 24,
        ),
      );
    } else {
      return Container(
        width: 44,
        height: 44,
        decoration: const BoxDecoration(
          color: Color(0xFF2563EB),
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.directions_bus_rounded,
          color: Colors.white,
          size: 24,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    // Group notifications by dateGroup
    final Map<String, List<NotificationItem>> grouped = {};
    for (var item in _notifications) {
      grouped.putIfAbsent(item.dateGroup, () => []).add(item);
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text(
          'Notifications',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: Color(0xFF0F172A),
            fontSize: 20,
          ),
        ),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Color(0xFF0F172A)),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune_rounded, color: Color(0xFF0F172A)),
            tooltip: 'Clear Notifications',
            onPressed: _notifications.isEmpty ? null : _clearAllNotifications,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _notifications.isEmpty
              ? _buildEmptyState()
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: grouped.keys.map((group) {
                      final items = grouped[group]!;
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            group,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
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
                            child: ListView.separated(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              itemCount: items.length,
                              separatorBuilder: (context, index) => const Divider(
                                color: Color(0xFFF1F5F9),
                                height: 1,
                              ),
                              itemBuilder: (context, index) {
                                final item = items[index];
                                return Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 14),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.center,
                                    children: [
                                      _buildNotificationIcon(item.type),
                                      const SizedBox(width: 14),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              item.time,
                                              style: const TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.bold,
                                                color: Color(0xFF64748B),
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              item.title,
                                              style: const TextStyle(
                                                fontSize: 16,
                                                fontWeight: FontWeight.bold,
                                                color: Color(0xFF0F172A),
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              item.subtitle,
                                              style: const TextStyle(
                                                fontSize: 13,
                                                fontWeight: FontWeight.w500,
                                                color: Color(0xFF64748B),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                          ),
                          const SizedBox(height: 24),
                        ],
                      );
                    }).toList(),
                  ),
                ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: const BoxDecoration(
                color: Color(0xFFF1F5F9),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.notifications_off_outlined,
                size: 56,
                color: Color(0xFF94A3B8),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'No Notifications',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'You have no active notifications at this time.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: Color(0xFF64748B),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
