import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_notification_logic.dart';

void main() {
  final now = DateTime.utc(2026, 8, 18, 12);

  group('mapNotificationRow', () {
    test('eta campus-exit › uses server title and Today group', () {
      final item = mapNotificationRow(
        {
          'id': 'n1',
          'title': 'Bus left school',
          'message': 'ETA 12 mins to Riverside',
          'notification_type': 'eta',
          'read': false,
          'created_at': '2026-08-18T08:07:00.000Z',
        },
        nowUtc: now,
      );

      expect(item.title, 'Bus left school');
      expect(item.subtitle, 'ETA 12 mins to Riverside');
      expect(item.type, 'bell');
      expect(item.dateGroup, 'Today');
      expect(item.time, '11:07 AM');
      expect(item.read, isFalse);
    });

    test('does not invent a synthetic boarded placeholder', () {
      final items = mapNotificationRows(const [], nowUtc: now);
      expect(items, isEmpty);
      expect(items.any((item) => item.title.contains('boarded the bus')), isFalse);
    });
  });

  group('unreadNotificationCount', () {
    test('two unread and one read › count is 2', () {
      const items = [
        ParentInboxItem(
          id: '1',
          time: '11:00 AM',
          title: 'Bus left school',
          subtitle: 'ETA',
          type: 'bell',
          dateGroup: 'Today',
          read: false,
        ),
        ParentInboxItem(
          id: '2',
          time: '11:10 AM',
          title: 'Bus Approaching Stop',
          subtitle: '500m',
          type: 'bell',
          dateGroup: 'Today',
          read: false,
        ),
        ParentInboxItem(
          id: '3',
          time: '10:00 AM',
          title: 'Trip started',
          subtitle: 'On the way',
          type: 'bus',
          dateGroup: 'Today',
          read: true,
        ),
      ];
      expect(unreadNotificationCount(items), 2);
    });
  });

  group('iconTypeForNotification', () {
    test('student_event › check; delay › bus; eta › bell', () {
      expect(iconTypeForNotification('student_event'), 'check');
      expect(iconTypeForNotification('delay'), 'bus');
      expect(iconTypeForNotification('eta'), 'bell');
    });
  });
}
