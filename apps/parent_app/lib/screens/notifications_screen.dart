import 'package:flutter/material.dart';
import 'package:parent_app/services/parent_notifications_service.dart';
import 'package:parent_app/utils/parent_notification_logic.dart';

class NotificationsScreen extends StatefulWidget {
  final Future<ParentNotificationsInbox> Function()? loader;
  final Future<void> Function()? onClearAll;

  const NotificationsScreen({
    super.key,
    this.loader,
    this.onClearAll,
  });

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<ParentInboxItem> _notifications = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  Future<void> _loadNotifications() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final fetch = widget.loader ?? ParentNotificationsService.fetchInbox;
      final inbox = await fetch();
      if (!mounted) return;
      setState(() {
        _notifications = inbox.items;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load notifications.';
        _isLoading = false;
      });
    }
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
          'Mark all notifications as read?',
          style: TextStyle(color: Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              final clear = widget.onClearAll ?? ParentNotificationsService.markAllRead;
              await clear();
              if (!mounted) return;
              setState(() {
                _notifications = _notifications
                    .map(
                      (item) => ParentInboxItem(
                        id: item.id,
                        time: item.time,
                        title: item.title,
                        subtitle: item.subtitle,
                        type: item.type,
                        dateGroup: item.dateGroup,
                        read: true,
                      ),
                    )
                    .toList();
              });
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Notifications marked as read.'),
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
    final Map<String, List<ParentInboxItem>> grouped = {};
    for (final item in _notifications) {
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
            icon: const Icon(Icons.refresh_rounded, color: Color(0xFF0F172A)),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : _loadNotifications,
          ),
          IconButton(
            icon: const Icon(Icons.tune_rounded, color: Color(0xFF0F172A)),
            tooltip: 'Clear Notifications',
            onPressed: _notifications.isEmpty ? null : _clearAllNotifications,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildErrorState()
              : _notifications.isEmpty
                  ? _buildEmptyState()
                  : RefreshIndicator(
                      onRefresh: _loadNotifications,
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
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
                                        color: Colors.black.withValues(alpha: 0.03),
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
                                                    style: TextStyle(
                                                      fontSize: 16,
                                                      fontWeight: item.read ? FontWeight.w600 : FontWeight.bold,
                                                      color: const Color(0xFF0F172A),
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
                    ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 48, color: Color(0xFF94A3B8)),
            const SizedBox(height: 16),
            Text(
              _error ?? 'Could not load notifications.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, color: Color(0xFF0F172A)),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: _loadNotifications,
              child: const Text('Try again'),
            ),
          ],
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
              'Trip alerts will show up here when the bus leaves school or approaches your stop.',
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
