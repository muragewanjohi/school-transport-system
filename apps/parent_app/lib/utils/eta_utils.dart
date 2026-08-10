/// Pure helpers for formatting live trip ETA / delay from `trip_stop_etas`.
class StopEta {
  final DateTime predictedArrival;
  final int delaySeconds;

  const StopEta({
    required this.predictedArrival,
    required this.delaySeconds,
  });

  factory StopEta.fromRow(Map<String, dynamic> row) {
    final rawArrival = row['predicted_arrival'];
    final DateTime arrival;
    if (rawArrival is DateTime) {
      arrival = rawArrival.toUtc();
    } else {
      arrival = DateTime.parse(rawArrival.toString()).toUtc();
    }
    final delay = (row['delay_seconds'] as num?)?.toInt() ?? 0;
    return StopEta(predictedArrival: arrival, delaySeconds: delay);
  }

  int minutesUntil([DateTime? now]) {
    final base = (now ?? DateTime.now()).toUtc();
    final secs = predictedArrival.difference(base).inSeconds;
    if (secs <= 0) return 0;
    return (secs / 60).ceil();
  }

  int get delayMinutes => delaySeconds <= 0 ? 0 : (delaySeconds / 60).ceil();

  bool get isDelayed => delaySeconds >= 300;
}

/// Formats remaining minutes for ETA cards, e.g. `12 mins`.
String formatEtaMinutes(int? minutes) {
  if (minutes == null) return '--';
  if (minutes <= 0) return 'Arriving';
  if (minutes == 1) return '1 min';
  return '$minutes mins';
}

/// Clock time for predicted arrival in the device local zone, e.g. `7:15 AM`.
String formatArrivalClock(DateTime? arrival) {
  if (arrival == null) return '--';
  final local = arrival.toLocal();
  final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final minute = local.minute.toString().padLeft(2, '0');
  final period = local.hour >= 12 ? 'PM' : 'AM';
  return '$hour:$minute $period';
}

/// Delay badge copy when lateness is at/above the 5-minute threshold.
String? formatDelayBadge(int delaySeconds) {
  if (delaySeconds < 300) return null;
  final mins = (delaySeconds / 60).ceil();
  if (mins == 1) return 'Running 1 min late';
  return 'Running $mins min late';
}

/// Picks the ETA row for [stopId] from a Realtime / query payload.
StopEta? pickStopEta(List<Map<String, dynamic>> rows, String? stopId) {
  if (stopId == null || stopId.isEmpty || rows.isEmpty) return null;
  for (final row in rows) {
    if (row['stop_id']?.toString() == stopId) {
      return StopEta.fromRow(row);
    }
  }
  return null;
}
