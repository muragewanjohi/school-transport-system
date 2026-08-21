import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_trip_details.dart';

void main() {
  test('formatScheduleDeparture normalizes HH:MM', () {
    expect(formatScheduleDeparture('6:45:00'), '06:45');
    expect(formatScheduleDeparture('15:30'), '15:30');
  });

  test('formatDaysOfWeek collapses weekdays', () {
    expect(formatDaysOfWeek([1, 2, 3, 4, 5]), 'Mon–Fri');
    expect(formatDaysOfWeek([1, 3, 5]), 'Mon, Wed, Fri');
  });

  test('parentTripDetailSubtitle joins stop departure days', () {
    expect(
      parentTripDetailSubtitle(
        stopName: 'Greenview',
        schedule: {
          'departure_time': '06:45:00',
          'days_of_week': [1, 2, 3, 4, 5],
        },
        emptyLabel: 'No pickup trip assigned',
      ),
      'Greenview · Departs 06:45 · Mon–Fri',
    );
    expect(
      parentTripDetailSubtitle(
        stopName: null,
        schedule: null,
        emptyLabel: 'No drop-off trip assigned',
      ),
      'No drop-off trip assigned',
    );
  });

  test('scheduleForDirection picks HOME_TO_SCHOOL', () {
    final sch = scheduleForDirection([
      {'direction': 'SCHOOL_TO_HOME', 'departure_time': '15:30'},
      {'direction': 'HOME_TO_SCHOOL', 'departure_time': '06:45'},
    ], 'HOME_TO_SCHOOL');
    expect(sch?['departure_time'], '06:45');
  });
}
