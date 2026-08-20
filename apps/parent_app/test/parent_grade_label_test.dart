import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/parent_grade_label.dart';

void main() {
  test('does not double-prefix Grade when grade already includes it', () {
    expect(formatStudentGradeLabel('Grade 2', 'Nile'), 'Grade 2 Nile');
  });

  test('adds Grade prefix for bare numbers', () {
    expect(formatStudentGradeLabel('5', 'A'), 'Grade 5 A');
  });

  test('handles missing class', () {
    expect(formatStudentGradeLabel('Grade 2', null), 'Grade 2');
  });
}
