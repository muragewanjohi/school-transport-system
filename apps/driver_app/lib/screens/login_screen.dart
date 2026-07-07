import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:driver_app/main.dart';

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

  // Get the base API URL mapping localhost correctly for Android emulator and iOS simulator
  String _getApiBaseUrl() {
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:3000';
      }
    } catch (_) {}
    return 'http://localhost:3000';
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final phone = _phoneController.text.trim();
      final otp = _otpController.text.trim();
      final baseUrl = _getApiBaseUrl();

      final response = await http.post(
        Uri.parse('$baseUrl/api/auth/driver-login'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'phone': phone,
          'otp': otp,
        }),
      ).timeout(const Duration(seconds: 10));

      final result = json.decode(response.body);

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
        await prefs.setBool('is_logged_in', true);

        if (!mounted) return;

        // Navigate to Driver Console Dashboard page and pop Login
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const MyHomePage()),
        );
      } else {
        final errorMsg = result['error'] ?? 'Authentication failed. Please check phone and OTP.';
        _showErrorSnackBar(errorMsg);
      }
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0E1A), // Dark Navy
      appBar: AppBar(
        title: const Text(
          'Safaricom Track Login',
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        backgroundColor: const Color(0xFF0A0E1A),
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
                // Branding Header Logo
                Icon(
                  Icons.shield_outlined,
                  size: 80,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Driver Console Portal',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Sign in using your registered mobile number and OTP code.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    color: Color(0xFF94A3B8),
                  ),
                ),
                const SizedBox(height: 36),

                // Phone Input Field
                const Text(
                  'MOBILE PHONE NUMBER',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF94A3B8),
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
                    color: Colors.white
                  ),
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.phone_android, color: Color(0xFF64748B)),
                    hintText: 'e.g. +254 712 345 678',
                    hintStyle: const TextStyle(color: Color(0xFF64748B)),
                    filled: true,
                    fillColor: const Color(0xFF151C2C),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF223049), width: 1.5),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF223049), width: 1.5),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF10B981), width: 1.5),
                    ),
                    contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
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

                // OTP Input Field
                const Text(
                  'OTP VERIFICATION CODE',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF94A3B8),
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
                    color: Colors.white
                  ),
                  textAlign: TextAlign.center,
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.lock_clock, color: Color(0xFF64748B)),
                    hintText: '123456',
                    hintStyle: const TextStyle(color: Color(0xFF64748B)),
                    counterText: '',
                    filled: true,
                    fillColor: const Color(0xFF151C2C),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF223049), width: 1.5),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF223049), width: 1.5),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF10B981), width: 1.5),
                    ),
                    contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
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

                // Sign In Button
                ElevatedButton(
                  onPressed: _isLoading ? null : _handleLogin,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.primary,
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
                
                // Sandbox instruction note
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF151C2C),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF223049), width: 1.5),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, size: 20, color: Color(0xFF10B981)),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Developer Sandbox Note:\nUse "123456" as the OTP code to bypass SMS authentication.',
                          style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), height: 1.4),
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
