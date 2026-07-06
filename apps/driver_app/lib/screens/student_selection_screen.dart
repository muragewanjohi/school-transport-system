import 'package:flutter/material.dart';
import 'package:driver_app/widgets/student_checklist_widget.dart';

class StudentSelectionScreen extends StatelessWidget {
  final String routeId;
  final String tenantId;
  final String tripId;

  const StudentSelectionScreen({
    super.key,
    required this.routeId,
    required this.tenantId,
    required this.tripId,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Boarding Manifest',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
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
          ),
        ),
      ),
    );
  }
}
