import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:driver_app/providers/trip_providers.dart';
import 'package:driver_app/widgets/student_checklist_widget.dart';
import 'package:driver_app/theme/app_colors.dart';
import 'package:driver_app/utils/geo_utils.dart';

class StudentSelectionScreen extends ConsumerWidget {
  final String routeId;
  final String tenantId;
  final String tripId;
  final List<dynamic> stops;

  const StudentSelectionScreen({
    super.key,
    required this.routeId,
    required this.tenantId,
    required this.tripId,
    this.stops = const [],
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final telemetry = ref.watch(telemetryCoordsProvider);
    final arrived = telemetry == null
        ? null
        : findArrivedStop(
            latitude: telemetry.latitude,
            longitude: telemetry.longitude,
            stops: stops,
          );

    return Scaffold(
      backgroundColor: AppColors.pageBg,
      appBar: AppBar(
        title: Text(
          arrived != null ? 'Board · ${arrived.name}' : 'Boarding Manifest',
          style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        backgroundColor: AppColors.actionGreen,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
          tooltip: 'Back to Route Console',
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: StudentChecklistWidget(
            routeId: routeId,
            tenantId: tenantId,
            tripId: tripId,
            arrivedStopId: arrived?.id,
            arrivedStopName: arrived?.name,
          ),
        ),
      ),
    );
  }
}
