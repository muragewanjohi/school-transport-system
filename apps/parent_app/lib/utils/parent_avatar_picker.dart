import 'dart:typed_data';
import 'package:image_picker/image_picker.dart';
import 'package:parent_app/utils/parent_avatar_image.dart';

class ParentAvatarPicker {
  static Future<XFile?> pick(ImageSource source) {
    return ImagePicker().pickImage(
      source: source,
      maxWidth: 1280,
      maxHeight: 1280,
      imageQuality: 70,
      requestFullMetadata: false,
    );
  }

  static Future<Uint8List> bytesForUpload(XFile image) async {
    final raw = await image.readAsBytes();
    return prepareAvatarBytes(raw);
  }
}
