import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:parent_app/utils/parent_avatar_logic.dart';

/// iPhone camera/library often yields HEIC or multi-MB JPEGs. The avatar API
/// only accepts JPEG/PNG/WebP under 3.5 MB (base64 would also exceed Vercel).
Future<Uint8List> prepareAvatarBytes(Uint8List raw) async {
  if (!shouldReencodeAvatar(raw)) return raw;
  try {
    var encoded = await _encodePng(raw, targetWidth: 960);
    if (encoded != null && encoded.length <= 3_200_000) return encoded;
    encoded = await _encodePng(raw, targetWidth: 640);
    if (encoded != null) return encoded;
  } catch (_) {}
  return raw;
}

Future<Uint8List?> _encodePng(Uint8List raw, {required int targetWidth}) async {
  final codec = await ui.instantiateImageCodec(raw, targetWidth: targetWidth);
  final frame = await codec.getNextFrame();
  final png = await frame.image.toByteData(format: ui.ImageByteFormat.png);
  frame.image.dispose();
  codec.dispose();
  if (png == null) return null;
  return png.buffer.asUint8List();
}
