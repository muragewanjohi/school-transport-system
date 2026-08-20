/// Formats grade + class without duplicating a leading "Grade".
String formatStudentGradeLabel(String? grade, String? className) {
  final g = (grade ?? '').trim();
  final c = (className ?? '').trim();

  String gradePart;
  if (g.isEmpty) {
    if (c.isEmpty) return '—';
    gradePart = c.toLowerCase().startsWith('grade') ? c : 'Grade $c';
    return gradePart;
  }

  gradePart = g.toLowerCase().startsWith('grade') ? g : 'Grade $g';
  if (c.isEmpty) return gradePart;
  final tokens = gradePart.toLowerCase().split(RegExp(r'\s+'));
  if (tokens.contains(c.toLowerCase())) return gradePart;
  return '$gradePart $c';
}
