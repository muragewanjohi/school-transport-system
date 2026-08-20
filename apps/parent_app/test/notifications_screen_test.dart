import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/screens/notifications_screen.dart';
import 'package:parent_app/services/parent_notifications_service.dart';
import 'package:parent_app/utils/parent_notification_logic.dart';

void main() {
  testWidgets('live campus-exit row is shown instead of synthetic boarded copy', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: NotificationsScreen(
          loader: () async => const ParentNotificationsInbox(
            unreadCount: 1,
            items: [
              ParentInboxItem(
                id: 'n1',
                time: '11:07 AM',
                title: 'Bus left school',
                subtitle: 'ETA 12 mins to Riverside',
                type: 'bell',
                dateGroup: 'Today',
                read: false,
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bus left school'), findsOneWidget);
    expect(find.text('ETA 12 mins to Riverside'), findsOneWidget);
    expect(find.textContaining('boarded the bus'), findsNothing);
  });

  testWidgets('empty inbox shows waiting copy', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: NotificationsScreen(
          loader: _emptyInbox,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No Notifications'), findsOneWidget);
    expect(find.textContaining('Trip alerts will show up here'), findsOneWidget);
  });

  testWidgets('embedded tab hides back button', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: NotificationsScreen(
          isEmbedded: true,
          loader: _emptyInbox,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Notifications'), findsOneWidget);
    expect(find.byIcon(Icons.arrow_back_rounded), findsNothing);
  });

  testWidgets('pushed route shows back button', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: NotificationsScreen(
          loader: _emptyInbox,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
  });
}

Future<ParentNotificationsInbox> _emptyInbox() async {
  return const ParentNotificationsInbox(items: [], unreadCount: 0);
}
