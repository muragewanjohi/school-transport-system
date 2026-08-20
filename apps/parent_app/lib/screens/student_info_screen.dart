import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:parent_app/services/supabase_service.dart';

/// Editable student profile (name, address, photo). School-owned fields are read-only.
class StudentInfoScreen extends StatefulWidget {
  const StudentInfoScreen({
    super.key,
    required this.student,
    this.onSave,
    this.photoUploader,
  });

  final Map<String, dynamic> student;

  /// Override for tests; defaults to [SupabaseService.updateStudentProfile].
  final Future<bool> Function(String studentId, {required String name, String? address})?
      onSave;

  /// Override for tests; defaults to camera/gallery + [SupabaseService.uploadAvatar].
  final Future<String?> Function({
    required String id,
    required List<int> imageBytes,
    required String fileName,
  })? photoUploader;

  @override
  State<StudentInfoScreen> createState() => _StudentInfoScreenState();
}

class _StudentInfoScreenState extends State<StudentInfoScreen> {
  late final TextEditingController _nameController;
  late final TextEditingController _addressController;
  late String? _avatarUrl;
  bool _isSaving = false;
  bool _isUploadingPhoto = false;

  String get _studentId => (widget.student['id'] ?? '').toString();

  String get _schoolName =>
      widget.student['tenant']?['name'] ??
      widget.student['school_name'] ??
      widget.student['school']?['name'] ??
      '—';

  String get _gradeLabel {
    final grade = widget.student['grade'];
    final className = widget.student['class_name'];
    if (grade != null && '$grade'.isNotEmpty) {
      return '$grade${className != null && '$className'.isNotEmpty ? ' $className' : ''}'.trim();
    }
    if (className != null && '$className'.isNotEmpty) return '$className';
    return '—';
  }

  String get _admissionNo {
    final raw = widget.student['admission_no'] ?? widget.student['admission_number'];
    if (raw != null && '$raw'.isNotEmpty) return '$raw';
    if (_studentId.length >= 8) return _studentId.substring(0, 8).toUpperCase();
    return '—';
  }

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.student['name']?.toString() ?? '');
    _addressController = TextEditingController(
      text: (widget.student['address'] ?? widget.student['home_address'] ?? '').toString(),
    );
    _avatarUrl = widget.student['avatar_url'] as String?;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto(ImageSource source) async {
    final picker = ImagePicker();
    final XFile? image = await picker.pickImage(source: source, imageQuality: 80);
    if (image == null || !mounted) return;

    setState(() => _isUploadingPhoto = true);
    final bytes = await image.readAsBytes();
    final upload = widget.photoUploader ??
        ({
          required String id,
          required List<int> imageBytes,
          required String fileName,
        }) =>
            SupabaseService.uploadAvatar(
              id: id,
              targetTable: 'students',
              imageBytes: imageBytes,
              fileName: fileName,
            );

    final publicUrl = await upload(
      id: _studentId,
      imageBytes: bytes,
      fileName: image.name,
    );
    if (!mounted) return;
    setState(() {
      _isUploadingPhoto = false;
      if (publicUrl != null) {
        _avatarUrl = publicUrl;
        widget.student['avatar_url'] = publicUrl;
      }
    });
    if (publicUrl == null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not update photo. Try again.'),
          backgroundColor: Color(0xFFEF4444),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _showPhotoSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF151C2C),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Update Photo for ${_nameController.text.trim().isEmpty ? 'student' : _nameController.text.trim()}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.camera_alt_rounded, color: Color(0xFF2563EB)),
                title: const Text('Take Photo (Camera)', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.of(context).pop();
                  _pickPhoto(ImageSource.camera);
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_rounded, color: Color(0xFF10B981)),
                title: const Text('Choose from Gallery', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.of(context).pop();
                  _pickPhoto(ImageSource.gallery);
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Student name is required.'),
          backgroundColor: Color(0xFFEF4444),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    setState(() => _isSaving = true);
    final save = widget.onSave ??
        (String id, {required String name, String? address}) =>
            SupabaseService.updateStudentProfile(id, name: name, address: address);
    final ok = await save(
      _studentId,
      name: name,
      address: _addressController.text.trim().isEmpty ? null : _addressController.text.trim(),
    );
    if (!mounted) return;
    setState(() => _isSaving = false);

    if (ok) {
      widget.student['name'] = name;
      if (_addressController.text.trim().isNotEmpty) {
        widget.student['address'] = _addressController.text.trim();
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Student information updated.'),
          backgroundColor: Color(0xFF10B981),
          behavior: SnackBarBehavior.floating,
        ),
      );
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not save. Please try again.'),
          backgroundColor: Color(0xFFEF4444),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text(
          'Student Information',
          style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0F172A), fontSize: 18),
        ),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
          Center(
            child: GestureDetector(
              onTap: _isUploadingPhoto ? null : _showPhotoSheet,
              child: Stack(
                children: [
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      color: const Color(0xFFF1F5F9),
                      image: _avatarUrl != null
                          ? DecorationImage(image: NetworkImage(_avatarUrl!), fit: BoxFit.cover)
                          : null,
                    ),
                    child: _isUploadingPhoto
                        ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
                        : (_avatarUrl == null
                            ? const Icon(Icons.person, size: 48, color: Color(0xFF94A3B8))
                            : null),
                  ),
                  Positioned(
                    bottom: 4,
                    right: 4,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: const BoxDecoration(
                        color: Color(0xFF10B981),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.camera_alt_rounded, size: 14, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          _label('Full name'),
          TextField(
            controller: _nameController,
            textCapitalization: TextCapitalization.words,
            decoration: _inputDecoration('Student name'),
          ),
          const SizedBox(height: 16),
          _label('Home address'),
          TextField(
            controller: _addressController,
            maxLines: 2,
            decoration: _inputDecoration('Home address'),
          ),
          const SizedBox(height: 24),
          const Text(
            'School record',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 12),
          _readOnlyRow('School', _schoolName),
          _readOnlyRow('Grade / class', _gradeLabel),
          _readOnlyRow('Admission No.', _admissionNo),
          _readOnlyRow('Status', (widget.student['status'] ?? 'Present').toString()),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: _isSaving ? null : _save,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _isSaving
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Save changes', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ),
          ),
          ],
        ),
      ),
    );
  }

  Widget _label(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF64748B)),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF10B981), width: 1.5),
      ),
    );
  }

  Widget _readOnlyRow(String label, String value) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: const TextStyle(fontSize: 13, color: Color(0xFF64748B))),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF0F172A)),
            ),
          ),
        ],
      ),
    );
  }
}
