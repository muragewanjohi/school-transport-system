import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/eta_utils.dart';

void main() {
  group('formatEtaMinutes', () {
    test('null › shows placeholder', () {
      expect(formatEtaMinutes(null), '--');
    });

    test('zero or negative › Arriving', () {
      expect(formatEtaMinutes(0), 'Arriving');
      expect(formatEtaMinutes(-3), 'Arriving');
    });

    test('positive › mins label', () {
      expect(formatEtaMinutes(1), '1 min');
      expect(formatEtaMinutes(12), '12 mins');
    });
  });

  group('formatDelayBadge', () {
    test('under 5 minutes › no badge', () {
      expect(formatDelayBadge(0), isNull);
      expect(formatDelayBadge(299), isNull);
    });

    test('at or above 5 minutes › Running X min late', () {
      expect(formatDelayBadge(300), 'Running 5 min late');
      expect(formatDelayBadge(360), 'Running 6 min late');
      expect(formatDelayBadge(60), isNull);
    });
  });

  group('StopEta / pickStopEta', () {
    test('Parent app › live ETA replaces placeholders', () {
      final now = DateTime.utc(2026, 8, 10, 12, 0);
      final arrival = now.add(const Duration(minutes: 12));
      final rows = [
        {
          'stop_id': 'stop-a',
          'predicted_arrival': arrival.toIso8601String(),
          'delay_seconds': 360,
        },
        {
          'stop_id': 'stop-b',
          'predicted_arrival': arrival.add(const Duration(minutes: 8)).toIso8601String(),
          'delay_seconds': 360,
        },
      ];

      final eta = pickStopEta(rows, 'stop-a');
      expect(eta, isNotNull);
      expect(eta!.minutesUntil(now), 12);
      expect(eta.delayMinutes, 6);
      expect(eta.isDelayed, isTrue);
      expect(formatEtaMinutes(eta.minutesUntil(now)), '12 mins');
      expect(formatDelayBadge(eta.delaySeconds), 'Running 6 min late');
    });

    test('missing stop › returns null', () {
      expect(pickStopEta([], 'stop-a'), isNull);
      expect(pickStopEta([{'stop_id': 'x', 'predicted_arrival': DateTime.now().toIso8601String(), 'delay_seconds': 0}], 'stop-a'), isNull);
    });
  });

  group('formatArrivalClock', () {
    test('null › placeholder', () {
      expect(formatArrivalClock(null), '--');
    });
  });
}
