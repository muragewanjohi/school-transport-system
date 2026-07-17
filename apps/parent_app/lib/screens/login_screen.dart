import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:parent_app/screens/dashboard_screen.dart';

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
  bool _otpSent = false;
  String? _sandboxOtp;
  String _selectedCountryCode = '+254';

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

  String _getFormattedPhoneNumber() {
    var rawPhone = _phoneController.text.trim().replaceAll(RegExp(r'[\s\-()]+'), '');
    if (rawPhone.startsWith('0')) {
      rawPhone = rawPhone.substring(1);
    }
    return '$_selectedCountryCode$rawPhone';
  }

  Future<void> _handleRequestOtp() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final phone = _getFormattedPhoneNumber();
      final baseUrl = _getApiBaseUrl();

      final response = await http.post(
        Uri.parse('$baseUrl/api/auth/parent-request-otp'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'phone': phone}),
      ).timeout(const Duration(seconds: 10));

      final result = json.decode(response.body);

      if (response.statusCode == 200 && result['success'] == true) {
        setState(() {
          _otpSent = true;
          _sandboxOtp = result['sandbox_otp'];
        });

        _showSuccessSnackBar(result['message'] ?? 'OTP sent successfully!');
      } else {
        final errorMsg = result['error'] ?? 'Phone verification failed.';
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

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final phone = _getFormattedPhoneNumber();
      final otp = _otpController.text.trim();
      final baseUrl = _getApiBaseUrl();

      final response = await http.post(
        Uri.parse('$baseUrl/api/auth/parent-login'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'phone': phone,
          'otp': otp,
        }),
      ).timeout(const Duration(seconds: 10));

      final Map<String, dynamic> result = json.decode(response.body);

      if (response.statusCode == 200 && result['success'] == true) {
        final session = result['session'];
        final prefs = await SharedPreferences.getInstance();
        
        await prefs.setString('parent_id', session['id'] ?? '');
        await prefs.setString('parent_name', session['name'] ?? '');
        await prefs.setString('parent_phone', session['phone'] ?? '');
        await prefs.setString('parent_role', session['role'] ?? '');
        await prefs.setString('tenant_id', session['tenant_id'] ?? '');
        await prefs.setString('children_json', json.encode(session['children'] ?? []));
        await prefs.setBool('is_logged_in', true);

        if (!mounted) return;

        // Navigate to Parent App Dashboard page and pop Login
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const DashboardScreen()),
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

  void _showSuccessSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        backgroundColor: const Color(0xFF10B981),
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
                  Icons.family_restroom,
                  size: 80,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Parent Portal Dashboard',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _otpSent
                      ? 'We have sent a verification code to your phone.'
                      : 'Sign in using your registered mobile number.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Color(0xFF94A3B8),
                  ),
                ),
                const SizedBox(height: 36),

                if (!_otpSent) ...[
                  // Step 1: Phone Number Input Field
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
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Country Code Selector Dropdown
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF151C2C),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFF223049), width: 1.5),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _selectedCountryCode,
                            dropdownColor: const Color(0xFF151C2C),
                            icon: const Icon(Icons.arrow_drop_down, color: Color(0xFF64748B)),
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                            onChanged: _isLoading ? null : (String? newValue) {
                              if (newValue != null) {
                                  setState(() {
                                    _selectedCountryCode = newValue;
                                  });
                              }
                            },
                            items: const [
                              DropdownMenuItem(value: '+254', child: Text('🇰🇪 +254')),
                              DropdownMenuItem(value: '+256', child: Text('🇺🇬 +256')),
                              DropdownMenuItem(value: '+255', child: Text('🇹🇿 +255')),
                              DropdownMenuItem(value: '+250', child: Text('🇷🇼 +250')),
                              DropdownMenuItem(value: '+1', child: Text('🇺🇸 +1')),
                              DropdownMenuItem(value: '+44', child: Text('🇬🇧 +44')),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Phone input field
                      Expanded(
                        child: TextFormField(
                          controller: _phoneController,
                          enabled: !_isLoading,
                          keyboardType: TextInputType.phone,
                          style: const TextStyle(
                            fontSize: 18, 
                            fontWeight: FontWeight.bold,
                            color: Colors.white
                          ),
                          decoration: InputDecoration(
                            hintText: 'e.g. 755 123 456',
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
                              return 'Phone number is required';
                            }
                            final cleanDigits = value.trim().replaceAll(RegExp(r'[\s\-()]+'), '');
                            if (!RegExp(r'^\d+$').hasMatch(cleanDigits)) {
                              return 'Enter digits only';
                            }
                            if (cleanDigits.length < 7 || cleanDigits.length > 11) {
                              return 'Enter a valid phone number';
                            }
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 36),

                  // Request OTP Button
                  Container(
                    decoration: BoxDecoration(
                      gradient: _isLoading
                          ? LinearGradient(
                              colors: [
                                const Color(0xFF10B981).withOpacity(0.5),
                                const Color(0xFF059669).withOpacity(0.5)
                              ],
                            )
                          : const LinearGradient(
                              colors: [Color(0xFF10B981), Color(0xFF059669)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF10B981).withOpacity(0.2),
                          offset: const Offset(0, 4),
                          blurRadius: 10,
                        )
                      ],
                    ),
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _handleRequestOtp,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              height: 24,
                              width: 24,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2.5,
                              ),
                            )
                          : const Text(
                              'REQUEST OTP',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.5,
                              ),
                            ),
                    ),
                  ),
                ] else ...[
                  // Step 2: OTP Verification Field
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          'OTP SENT TO: ${_getFormattedPhoneNumber()}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF94A3B8),
                            letterSpacing: 0.5,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      TextButton(
                        onPressed: _isLoading
                            ? null
                            : () {
                                setState(() {
                                  _otpSent = false;
                                  _otpController.clear();
                                });
                              },
                        child: const Text(
                          'CHANGE',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF10B981),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _otpController,
                    enabled: !_isLoading,
                    keyboardType: TextInputType.number,
                    obscureText: true,
                    style: const TextStyle(
                      fontSize: 18, 
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      letterSpacing: 8.0,
                    ),
                    maxLength: 6,
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.lock_clock_outlined, color: Color(0xFF64748B)),
                      hintText: '• • • • • •',
                      hintStyle: const TextStyle(color: Color(0xFF64748B), letterSpacing: 8.0),
                      filled: true,
                      fillColor: const Color(0xFF151C2C),
                      counterText: '',
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
                        return 'OTP verification code is required';
                      }
                      if (value.trim().length != 6) {
                        return 'OTP must be exactly 6 digits';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),

                  if (_sandboxOtp != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.info_outline, color: Color(0xFF10B981), size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Sandbox OTP code is: $_sandboxOtp',
                              style: const TextStyle(
                                color: Color(0xFF10B981),
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Verify & Enter Button
                  Container(
                    decoration: BoxDecoration(
                      gradient: _isLoading
                          ? LinearGradient(
                              colors: [
                                const Color(0xFF10B981).withOpacity(0.5),
                                const Color(0xFF059669).withOpacity(0.5)
                              ],
                            )
                          : const LinearGradient(
                              colors: [Color(0xFF10B981), Color(0xFF059669)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF10B981).withOpacity(0.2),
                          offset: const Offset(0, 4),
                          blurRadius: 10,
                        )
                      ],
                    ),
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _handleLogin,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              height: 24,
                              width: 24,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2.5,
                              ),
                            )
                          : const Text(
                              'ENTER DASHBOARD',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.5,
                              ),
                            ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
