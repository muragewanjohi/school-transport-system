import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_attendance_logic.dart';

void main() {
  group('ParentAttendanceGate.canToggle', () {
    test('allows when no trip and not boarded', () {
      expect(
        ParentAttendanceGate.canToggle(tripDirection: null),
        isTrue,
      );
    });

    test('allows on HOME_TO_SCHOOL before pickup', () {
      expect(
        ParentAttendanceGate.canToggle(
          tripDirection: 'HOME_TO_SCHOOL',
          transitStatus: 'Waiting for pickup',
          manifestAttendance: 'pending',
        ),
        isTrue,
      );
    });

    test('locks after boarded on pickup trip', () {
      expect(
        ParentAttendanceGate.canToggle(
          tripDirection: 'HOME_TO_SCHOOL',
          manifestAttendance: 'boarded',
        ),
        isFalse,
      );
    });

    test('locks on SCHOOL_TO_HOME drop-off trip', () {
      expect(
        ParentAttendanceGate.canToggle(
          tripDirection: 'SCHOOL_TO_HOME',
          transitStatus: 'At school',
        ),
        isFalse,
      );
    });
  });
}
