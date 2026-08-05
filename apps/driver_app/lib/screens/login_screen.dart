import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:driver_app/main.dart';
import 'package:driver_app/config/api_config.dart';
import 'package:driver_app/theme/app_colors.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final phone = _phoneController.text.trim();
      final otp = _otpController.text.trim();
      final baseUrl = ApiConfig.baseUrl;

      final response = await http
          .post(
            Uri.parse('$baseUrl/api/auth/driver-login'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({
              'phone': phone,
              'otp': otp,
            }),
          )
          .timeout(const Duration(seconds: 20));

      final contentType = response.headers['content-type'] ?? '';
      if (!contentType.contains('application/json')) {
        _showErrorSnackBar(
          'Login failed (HTTP ${response.statusCode}). Unexpected response from $baseUrl.',
        );
        return;
      }

      final result = json.decode(response.body) as Map<String, dynamic>;

      if (response.statusCode == 200 && result['success'] == true) {
        final session = result['session'];
        final prefs = await SharedPreferences.getInstance();

        await prefs.setString('driver_id', session['id'] ?? '');
        await prefs.setString('driver_name', session['name'] ?? '');
        await prefs.setString('driver_phone', session['phone'] ?? '');
        await prefs.setString('driver_role', session['role'] ?? '');
        await prefs.setString('tenant_id', session['tenant_id'] ?? '');
        await prefs.setString('vehicle_id', session['vehicle_id'] ?? '');
        await prefs.setString('route_id', session['route_id'] ?? '');
        await prefs.setString('access_token', session['access_token'] ?? '');
        await prefs.setBool('is_logged_in', true);

        if (!mounted) return;

        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const MyHomePage()),
        );
      } else {
        final errorMsg =
            result['error'] ?? 'Authentication failed. Please check phone and OTP.';
        _showErrorSnackBar(errorMsg);
      }
    } on TimeoutException {
      _showErrorSnackBar(
        'Login timed out reaching ${ApiConfig.baseUrl}. Check network or API host.',
      );
    } on SocketException {
      _showErrorSnackBar('Network error: Unable to connect to host API server.');
    } on HttpException {
      _showErrorSnackBar('Connection protocol error occurred.');
    } on FormatException {
      _showErrorSnackBar('Server returned invalid data format.');
    } catch (e) {
      _showErrorSnackBar('An unexpected error occurred: ${e.toString()}');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        backgroundColor: Colors.red,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  InputDecoration _fieldDecoration({
    required IconData icon,
    required String hint,
    String? counterText,
  }) {
    return InputDecoration(
      prefixIcon: Icon(icon, color: AppColors.muted),
      hintText: hint,
      hintStyle: const TextStyle(color: AppColors.muted),
      counterText: counterText,
      filled: true,
      fillColor: AppColors.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.border, width: 1.5),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.border, width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.actionGreen, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.pageBg,
      appBar: AppBar(
        title: const Text(
          'OnTheBus Driver',
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        backgroundColor: AppColors.actionGreen,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Image.asset(
                  'assets/driver-logo.png',
                  height: 96,
                  fit: BoxFit.contain,
                ),
                const SizedBox(height: 16),
                const Text(
                  'OnTheBus Driver',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: AppColors.ink,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Sign in using your registered mobile number and OTP code.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    color: AppColors.mutedLight,
                  ),
                ),
                const SizedBox(height: 36),
                const Text(
                  'MOBILE PHONE NUMBER',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: AppColors.mutedLight,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _phoneController,
                  enabled: !_isLoading,
                  keyboardType: TextInputType.phone,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppColors.ink,
                  ),
                  decoration: _fieldDecoration(
                    icon: Icons.phone_android,
                    hint: 'e.g. +254 712 345 678',
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter your phone number';
                    }
                    if (value.trim().length < 5) {
                      return 'Phone number is too short';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 20),
                const Text(
                  'OTP VERIFICATION CODE',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: AppColors.mutedLight,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _otpController,
                  enabled: !_isLoading,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 8,
                    color: AppColors.ink,
                  ),
                  textAlign: TextAlign.center,
                  decoration: _fieldDecoration(
                    icon: Icons.lock_clock,
                    hint: '123456',
                    counterText: '',
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter the 6-digit OTP code';
                    }
                    if (value.trim().length != 6) {
                      return 'OTP must be exactly 6 digits';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 36),
                ElevatedButton(
                  onPressed: _isLoading ? null : _handleLogin,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.actionGreen,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 60),
                    elevation: 2,
                    shape: const RoundedRectangleBorder(
                      borderRadius: BorderRadius.all(Radius.circular(12)),
                    ),
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          height: 24,
                          width: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 3,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text(
                          'VERIFY & SIGN IN',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.5,
                          ),
                        ),
                ),
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border, width: 1.5),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, size: 20, color: AppColors.actionGreen),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Developer Sandbox Note:\nUse "123456" as the OTP code to bypass SMS authentication.',
                          style: TextStyle(fontSize: 11, color: AppColors.mutedLight, height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
