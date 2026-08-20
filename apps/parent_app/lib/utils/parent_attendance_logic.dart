/// Pure rules for parent Present/Absent on Home.
class ParentAttendanceGate {
  const ParentAttendanceGate._();

  /// True when the parent may flip Present ↔ Absent.
  ///
  /// Allowed on pickup trips ([HOME_TO_SCHOOL]) or when there is no active
  /// trip yet — only before the child has been picked up / boarded.
  /// Locked on drop-off ([SCHOOL_TO_HOME]) and after boarding.
  static bool canToggle({
    required String? tripDirection,
    String? transitStatus,
    String? studentStatus,
    String? manifestAttendance,
  }) {
    if (_isPickedUp(
      transitStatus: transitStatus,
      studentStatus: studentStatus,
      manifestAttendance: manifestAttendance,
    )) {
      return false;
    }
    if (tripDirection == 'SCHOOL_TO_HOME') {
      return false;
    }
    return true;
  }

  static bool _isPickedUp({
    String? transitStatus,
    String? studentStatus,
    String? manifestAttendance,
  }) {
    final att = (manifestAttendance ?? '').toLowerCase().trim();
    if (att == 'boarded' || att == 'dropped_off') return true;

    final raw = '${transitStatus ?? ''} ${studentStatus ?? ''}'.toLowerCase();
    return raw.contains('on the bus') ||
        raw.contains('boarded') ||
        raw.contains('in transit') ||
        raw.contains('dropped');
  }

  static String lockReason({
    required String? tripDirection,
    String? transitStatus,
    String? studentStatus,
    String? manifestAttendance,
  }) {
    if (_isPickedUp(
      transitStatus: transitStatus,
      studentStatus: studentStatus,
      manifestAttendance: manifestAttendance,
    )) {
      return 'Locked after pickup — status cannot be changed for this trip.';
    }
    if (tripDirection == 'SCHOOL_TO_HOME') {
      return 'Present / Absent can only be set on pickup trips before boarding.';
    }
    return '';
  }
}
