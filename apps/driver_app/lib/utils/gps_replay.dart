import 'dart:async';
import 'dart:math' as math;

import 'package:driver_app/utils/geo_utils.dart';

/// Play Review campus pin — matches `playReviewProvision.ts`.
const playReviewCampus = GeoPoint(-1.2921, 36.8219);

/// Campus geofence used by parent campus-exit alerts.
const campusGeofenceMeters = 150.0;

/// Distance past the campus pin so campus-exit alerts fire.
const campusExitMeters = 180.0;

/// Outside the default 500 m stage-approach ring.
const farApproachMeters = 600.0;

/// Inside the default 500 m stage-approach ring.
const nearApproachMeters = 400.0;

/// Outside the default 50 m stop pin (Approaching).
const approachingStopMeters = 80.0;

class ReplayNamedStop {
  final String name;
  final double latitude;
  final double longitude;

  const ReplayNamedStop(this.name, this.latitude, this.longitude);
}

/// Play Review corridor — Riverside, Market, Park, Gate.
const playReviewStops = [
  ReplayNamedStop('Stop Riverside', -1.267, 36.8095),
  ReplayNamedStop('Stop Market', -1.275, 36.812),
  ReplayNamedStop('Stop Park', -1.282, 36.816),
  ReplayNamedStop('Play Review Gate', -1.2921, 36.8219),
];

class ReplayWaypoint {
  final double latitude;
  final double longitude;
  final Duration hold;
  final String label;
  final bool isStopCenter;
  final String? stopId;

  const ReplayWaypoint({
    required this.latitude,
    required this.longitude,
    required this.hold,
    required this.label,
    this.isStopCenter = false,
    this.stopId,
  });

  GeoPoint get point => GeoPoint(latitude, longitude);
}

class GpsReplayTick {
  final double latitude;
  final double longitude;
  final double speedMps;
  final double bearing;
  final String label;
  final bool isStopCenter;
  final String? stopId;

  const GpsReplayTick({
    required this.latitude,
    required this.longitude,
    required this.speedMps,
    required this.bearing,
    required this.label,
    this.isStopCenter = false,
    this.stopId,
  });
}

class ReplayStopInput {
  final String id;
  final String name;
  final GeoPoint point;

  const ReplayStopInput({
    required this.id,
    required this.name,
    required this.point,
  });
}

/// Offset [meters] from [lat],[lng] along [bearingDegrees] (0 = north, 90 = east).
GeoPoint offsetByMeters(
  double lat,
  double lng,
  double meters,
  double bearingDegrees,
) {
  const metersPerDegLat = 111320.0;
  final bearing = bearingDegrees * math.pi / 180;
  final latRad = lat * math.pi / 180;
  final dLat = (meters * math.cos(bearing)) / metersPerDegLat;
  final metersPerDegLng = metersPerDegLat * math.cos(latRad);
  final dLng = metersPerDegLng.abs() < 1e-6
      ? 0.0
      : (meters * math.sin(bearing)) / metersPerDegLng;
  return GeoPoint(lat + dLat, lng + dLng);
}

double bearingDegrees(GeoPoint from, GeoPoint to) {
  final lat1 = from.latitude * math.pi / 180;
  final lat2 = to.latitude * math.pi / 180;
  final dLng = (to.longitude - from.longitude) * math.pi / 180;
  final y = math.sin(dLng) * math.cos(lat2);
  final x = math.cos(lat1) * math.sin(lat2) -
      math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
  final deg = math.atan2(y, x) * 180 / math.pi;
  return (deg + 360) % 360;
}

/// Point [metersBefore] short of [to], on the line from [from].
GeoPoint pointBefore({
  required GeoPoint from,
  required GeoPoint to,
  required double metersBefore,
}) {
  final dist = haversineDistanceMeters(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );
  if (dist < 1) {
    return offsetByMeters(to.latitude, to.longitude, metersBefore, 0);
  }
  if (metersBefore >= dist) return from;
  final t = metersBefore / dist;
  return GeoPoint(
    to.latitude + (from.latitude - to.latitude) * t,
    to.longitude + (from.longitude - to.longitude) * t,
  );
}

List<ReplayStopInput> replayStopsFromTrip(List<dynamic> stops) {
  final out = <ReplayStopInput>[];
  for (final s in sortedStopsBySequence(stops)) {
    if (s is! Map) continue;
    final point = stopLatLng(s);
    final id = s['id']?.toString();
    if (point == null || id == null || id.isEmpty) continue;
    out.add(
      ReplayStopInput(
        id: id,
        name: (s['name'] ?? 'Stop').toString(),
        point: point,
      ),
    );
  }
  return out;
}

GeoPoint campusPointForReplay({
  required List<ReplayStopInput> stops,
  required bool isPickup,
}) {
  if (stops.isEmpty) return playReviewCampus;
  if (isPickup) return stops.last.point;
  return stops.first.point;
}

/// Script for the live trip's stops. Falls back to the Play Review corridor
/// when the trip has no coordinates.
List<ReplayWaypoint> buildStopReplayScript({
  required List<dynamic> stops,
  required bool isPickup,
}) {
  final parsed = replayStopsFromTrip(stops);
  if (parsed.isEmpty) {
    return buildPlayReviewReplayScript(isPickup: isPickup);
  }
  return scriptForStops(parsed, isPickup: isPickup);
}

List<ReplayWaypoint> buildPlayReviewReplayScript({required bool isPickup}) {
  final stops = [
    for (var i = 0; i < playReviewStops.length; i++)
      ReplayStopInput(
        id: 'play-review-$i',
        name: playReviewStops[i].name,
        point: GeoPoint(playReviewStops[i].latitude, playReviewStops[i].longitude),
      ),
  ];
  return scriptForStops(
    stops,
    isPickup: isPickup,
    campusOverride: playReviewCampus,
  );
}

List<ReplayWaypoint> scriptForStops(
  List<ReplayStopInput> stops, {
  required bool isPickup,
  GeoPoint? campusOverride,
}) {
  if (stops.isEmpty) return const [];

  final campus = campusOverride ?? campusPointForReplay(stops: stops, isPickup: isPickup);
  GeoPoint toward = stops.first.point;
  final distToFirst = haversineDistanceMeters(
    campus.latitude,
    campus.longitude,
    toward.latitude,
    toward.longitude,
  );
  if (distToFirst < 30 && stops.length > 1) {
    toward = stops[1].point;
  } else if (distToFirst < 30) {
    toward = offsetByMeters(campus.latitude, campus.longitude, 500, 0);
  }

  final insideCampus = pointBefore(
    from: toward,
    to: campus,
    metersBefore: 120,
  );
  final exitPoint = pointBefore(
    from: toward,
    to: campus,
    metersBefore: campusExitMeters,
  );

  final waypoints = <ReplayWaypoint>[
    ReplayWaypoint(
      latitude: insideCampus.latitude,
      longitude: insideCampus.longitude,
      hold: const Duration(seconds: 4),
      label: 'Campus',
    ),
    ReplayWaypoint(
      latitude: exitPoint.latitude,
      longitude: exitPoint.longitude,
      hold: const Duration(seconds: 4),
      label: 'Campus exit',
    ),
  ];

  GeoPoint prev = exitPoint;
  for (var i = 0; i < stops.length; i++) {
    final stop = stops[i];
    final inbound = pointBefore(
      from: prev,
      to: stop.point,
      metersBefore: farApproachMeters,
    );
    waypoints.add(
      ReplayWaypoint(
        latitude: inbound.latitude,
        longitude: inbound.longitude,
        hold: const Duration(seconds: 3),
        label: '600 m from ${stop.name}',
        stopId: stop.id,
      ),
    );
    final near = pointBefore(
      from: prev,
      to: stop.point,
      metersBefore: nearApproachMeters,
    );
    waypoints.add(
      ReplayWaypoint(
        latitude: near.latitude,
        longitude: near.longitude,
        hold: const Duration(seconds: 3),
        label: '400 m from ${stop.name}',
        stopId: stop.id,
      ),
    );
    final approaching = pointBefore(
      from: prev,
      to: stop.point,
      metersBefore: approachingStopMeters,
    );
    waypoints.add(
      ReplayWaypoint(
        latitude: approaching.latitude,
        longitude: approaching.longitude,
        hold: const Duration(seconds: 4),
        label: 'Approaching ${stop.name}',
        stopId: stop.id,
      ),
    );
    waypoints.add(
      ReplayWaypoint(
        latitude: stop.point.latitude,
        longitude: stop.point.longitude,
        hold: const Duration(seconds: 16),
        label: 'At ${stop.name}',
        isStopCenter: true,
        stopId: stop.id,
      ),
    );

    final nextHint = i + 1 < stops.length
        ? stops[i + 1].point
        : offsetByMeters(
            stop.point.latitude,
            stop.point.longitude,
            200,
            bearingDegrees(prev, stop.point),
          );
    final outbound = offsetByMeters(
      stop.point.latitude,
      stop.point.longitude,
      approachingStopMeters,
      bearingDegrees(stop.point, nextHint),
    );
    waypoints.add(
      ReplayWaypoint(
        latitude: outbound.latitude,
        longitude: outbound.longitude,
        hold: const Duration(seconds: 3),
        label: 'Left ${stop.name}',
        stopId: stop.id,
      ),
    );
    prev = outbound;
  }

  return waypoints;
}

List<GpsReplayTick> expandReplayWaypoints(
  List<ReplayWaypoint> waypoints, {
  Duration step = const Duration(seconds: 2),
  double cruiseMps = 11,
}) {
  if (waypoints.isEmpty) return const [];

  final ticks = <GpsReplayTick>[];
  final stepMs = step.inMilliseconds <= 0 ? 2000 : step.inMilliseconds;

  void holdAt(ReplayWaypoint w, {double speed = 0, double bearing = 0}) {
    final n = math.max(1, (w.hold.inMilliseconds / stepMs).round());
    for (var i = 0; i < n; i++) {
      ticks.add(
        GpsReplayTick(
          latitude: w.latitude,
          longitude: w.longitude,
          speedMps: speed,
          bearing: bearing,
          label: w.label,
          isStopCenter: w.isStopCenter,
          stopId: w.stopId,
        ),
      );
    }
  }

  holdAt(waypoints.first);
  for (var i = 0; i < waypoints.length - 1; i++) {
    final a = waypoints[i];
    final b = waypoints[i + 1];
    final dist = haversineDistanceMeters(
      a.latitude,
      a.longitude,
      b.latitude,
      b.longitude,
    );
    final brg = bearingDegrees(a.point, b.point);
    if (dist > 1) {
      final stepMeters = cruiseMps * (stepMs / 1000);
      final n = math.max(1, (dist / stepMeters).ceil());
      for (var s = 1; s <= n; s++) {
        final t = s / n;
        ticks.add(
          GpsReplayTick(
            latitude: a.latitude + (b.latitude - a.latitude) * t,
            longitude: a.longitude + (b.longitude - a.longitude) * t,
            speedMps: cruiseMps,
            bearing: brg,
            label: b.label,
            stopId: b.stopId,
          ),
        );
      }
    }
    holdAt(b, bearing: brg);
  }
  return ticks;
}

class GpsReplayPlayer {
  Timer? _timer;
  int _index = 0;
  List<GpsReplayTick> _ticks = const [];
  void Function(GpsReplayTick tick)? _onTick;
  void Function()? _onDone;

  bool get isRunning => _timer != null;

  String? get currentLabel {
    if (_index < 0 || _index >= _ticks.length) return null;
    return _ticks[_index].label;
  }

  void start({
    required List<GpsReplayTick> ticks,
    required void Function(GpsReplayTick tick) onTick,
    void Function()? onDone,
    Duration step = const Duration(seconds: 2),
  }) {
    stop();
    _ticks = ticks;
    _index = 0;
    _onTick = onTick;
    _onDone = onDone;
    if (_ticks.isEmpty) {
      onDone?.call();
      return;
    }
    _emit();
    _timer = Timer.periodic(step, (_) {
      _index++;
      if (_index >= _ticks.length) {
        final done = _onDone;
        stop();
        done?.call();
        return;
      }
      _emit();
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _ticks = const [];
    _index = 0;
    _onTick = null;
    _onDone = null;
  }

  void _emit() {
    if (_index < 0 || _index >= _ticks.length) return;
    _onTick?.call(_ticks[_index]);
  }
}
