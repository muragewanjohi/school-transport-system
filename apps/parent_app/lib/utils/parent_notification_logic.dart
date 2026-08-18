/// Pure helpers for mapping `notifications` rows into the parent inbox.
class ParentInboxItem {
  final String id;
  final String time;
  final String title;
  final String subtitle;
  final String type;
  final String dateGroup;
  final bool read;

  const ParentInboxItem({
    required this.id,
    required this.time,
    required this.title,
    required this.subtitle,
    required this.type,
    required this.dateGroup,
    required this.read,
  });
}

/// Icon bucket used by the inbox: check / bell / bus.
String iconTypeForNotification(String notificationType) {
  switch (notificationType) {
    case 'student_event':
      return 'check';
    case 'trip_status':
    case 'trip_start':
    case 'delay':
      return 'bus';
    case 'eta':
    default:
      return 'bell';
  }
}

DateTime _nairobiCalendarDay(DateTime utc) {
  final nairobi = utc.toUtc().add(const Duration(hours: 3));
  return DateTime.utc(nairobi.year, nairobi.month, nairobi.day);
}

String notificationDateGroup(DateTime createdAtUtc, DateTime nowUtc) {
  final createdDay = _nairobiCalendarDay(createdAtUtc);
  final today = _nairobiCalendarDay(nowUtc);
  final yesterday = today.subtract(const Duration(days: 1));
  if (createdDay == today) return 'Today';
  if (createdDay == yesterday) return 'Yesterday';
  return 'Earlier';
}

String formatNotificationClock(DateTime createdAtUtc) {
  final nairobi = createdAtUtc.toUtc().add(const Duration(hours: 3));
  final hour24 = nairobi.hour;
  final minute = nairobi.minute.toString().padLeft(2, '0');
  final isPm = hour24 >= 12;
  final hour12 = hour24 % 12 == 0 ? 12 : hour24 % 12;
  return '$hour12:$minute ${isPm ? 'PM' : 'AM'}';
}

int unreadNotificationCount(Iterable<ParentInboxItem> items) {
  return items.where((item) => !item.read).length;
}

ParentInboxItem mapNotificationRow(
  Map<String, dynamic> row, {
  DateTime? nowUtc,
}) {
  final created = DateTime.parse(row['created_at'].toString()).toUtc();
  final now = (nowUtc ?? DateTime.now()).toUtc();
  return ParentInboxItem(
    id: row['id'].toString(),
    time: formatNotificationClock(created),
    title: row['title']?.toString() ?? 'Update',
    subtitle: row['message']?.toString() ?? '',
    type: iconTypeForNotification(row['notification_type']?.toString() ?? ''),
    dateGroup: notificationDateGroup(created, now),
    read: row['read'] == true,
  );
}

List<ParentInboxItem> mapNotificationRows(
  Iterable<dynamic> rows, {
  DateTime? nowUtc,
}) {
  return rows
      .whereType<Map>()
      .map((row) => mapNotificationRow(Map<String, dynamic>.from(row), nowUtc: nowUtc))
      .toList();
}
