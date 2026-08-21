/// Pure helpers for parent Profile pickup / drop-off trip rows.

String formatScheduleDeparture(String? raw) {
  if (raw == null) return '';
  final match = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(raw.trim());
  if (match == null) return raw.trim();
  final hour = int.tryParse(match.group(1)!);
  final minute = int.tryParse(match.group(2)!);
  if (hour == null || minute == null) return raw.trim();
  return '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
}

String formatDaysOfWeek(dynamic days) {
  if (days is! List || days.isEmpty) return '';
  const labels = {
    0: 'Sun',
    1: 'Mon',
    2: 'Tue',
    3: 'Wed',
    4: 'Thu',
    5: 'Fri',
    6: 'Sat',
  };
  final nums = days.map((d) => int.tryParse(d.toString()) ?? -1).where((n) => n >= 0 && n <= 6).toList()
    ..sort();
  if (nums.isEmpty) return '';
  if (nums.length == 5 && nums.join(',') == '1,2,3,4,5') return 'Mon–Fri';
  return nums.map((n) => labels[n]!).join(', ');
}

Map<String, dynamic>? scheduleForDirection(List<dynamic>? schedules, String direction) {
  if (schedules == null) return null;
  for (final raw in schedules) {
    if (raw is! Map) continue;
    if (raw['direction']?.toString() == direction) {
      return Map<String, dynamic>.from(raw);
    }
  }
  return null;
}

/// Subtitle for a Profile trip row, e.g. `Greenview · Departs 06:45 · Mon–Fri`.
String parentTripDetailSubtitle({
  required String? stopName,
  Map<String, dynamic>? schedule,
  required String emptyLabel,
}) {
  final stop = (stopName ?? '').trim();
  final depart = formatScheduleDeparture(schedule?['departure_time']?.toString());
  final days = formatDaysOfWeek(schedule?['days_of_week']);
  final parts = <String>[];
  if (stop.isNotEmpty) parts.add(stop);
  if (depart.isNotEmpty) parts.add('Departs $depart');
  if (days.isNotEmpty) parts.add(days);
  if (parts.isEmpty) return emptyLabel;
  return parts.join(' · ');
}
