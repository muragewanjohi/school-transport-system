List<dynamic> resolveParentChildren({
  required List<dynamic> cached,
  List<dynamic>? apiChildren,
  List<dynamic>? supabaseChildren,
}) {
  if (apiChildren != null) return apiChildren;
  if (supabaseChildren != null && supabaseChildren.isNotEmpty) {
    return supabaseChildren;
  }
  return cached;
}

bool isParentUuid(String id) {
  return RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  ).hasMatch(id);
}

/// Completes [future] or returns null when it throws or exceeds [timeout].
/// Home load uses this so a hung Supabase/Auth refresh cannot block the UI.
Future<T?> awaitOrNull<T>(
  Future<T> future, {
  Duration timeout = const Duration(seconds: 8),
}) async {
  try {
    return await future.timeout(timeout);
  } catch (_) {
    return null;
  }
}
