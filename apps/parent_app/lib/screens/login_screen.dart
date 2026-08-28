import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/screens/dashboard_screen.dart';
import 'package:parent_app/services/parent_api_auth.dart';
import 'package:parent_app/theme/parent_colors.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

typedef RequestOtpCallback =
    Future<Map<String, dynamic>?> Function(String phone, {String channel});
typedef VerifyOtpCallback =
    Future<Map<String, dynamic>> Function(String phone, String otp);

class _NotRegisteredException implements Exception {
  const _NotRegisteredException(this.message);

  final String message;

  @override
  String toString() => message;
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    this.requestOtp,
    this.verifyOtp,
    this.authenticatedBuilder,
  });

  final RequestOtpCallback? requestOtp;
  final VerifyOtpCallback? verifyOtp;
  final WidgetBuilder? authenticatedBuilder;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  static const int _resendSeconds = 24;

  final _phoneFormKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _otpControllers = List.generate(6, (_) => TextEditingController());
  final _otpFocusNodes = List.generate(6, (_) => FocusNode());

  bool _showVerification = false;
  bool _isLoading = false;
  int _resendRemaining = _resendSeconds;
  Timer? _resendTimer;
  String _phone = '';
  String _versionLabel = '';
  String? _emailHint;

  @override
  void initState() {
    super.initState();
    _loadVersionLabel();
  }

  Future<void> _loadVersionLabel() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() {
        _versionLabel = 'v${info.version}+${info.buildNumber}';
      });
    } catch (_) {
      // Widget tests and some platforms have no package-info channel.
    }
  }

  @override
  void dispose() {
    _resendTimer?.cancel();
    _phoneController.dispose();
    for (final controller in _otpControllers) {
      controller.dispose();
    }
    for (final node in _otpFocusNodes) {
      node.dispose();
    }
    super.dispose();
  }

  String _normalizePhone(String value) {
    var digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.startsWith('254')) digits = digits.substring(3);
    if (digits.startsWith('0')) digits = digits.substring(1);
    return '+254$digits';
  }

  String _formattedPhone() {
    final digits = _phone.replaceAll(RegExp(r'\D'), '');
    if (digits.length != 12) return _phone;
    return '+${digits.substring(0, 3)} ${digits.substring(3, 6)} '
        '${digits.substring(6, 9)} ${digits.substring(9)}';
  }

  String _otpValue() =>
      _otpControllers.map((controller) => controller.text).join();

  String _readError(Map<String, dynamic> result, String fallback) {
    final error = result['error'];
    if (error is String && error.isNotEmpty) return error;
    return fallback;
  }

  bool _isNotRegistered(Map<String, dynamic> result, int statusCode) {
    if (result['code'] == 'not_registered') return true;
    if (statusCode != 404) return false;
    final error = result['error'];
    if (error is! String) return false;
    final lower = error.toLowerCase();
    return lower.contains('not registered') ||
        lower.contains('profile not found');
  }

  bool _looksUnregistered(String message) {
    final lower = message.toLowerCase();
    return lower.contains('not registered') ||
        lower.contains('profile not found');
  }

  Future<Map<String, dynamic>?> _requestOtpFromApi(
    String phone, {
    String channel = 'sms',
  }) async {
    final response = await http
        .post(
          Uri.parse('${ApiConfig.baseUrl}/api/auth/parent-request-otp'),
          headers: {'Content-Type': 'application/json'},
          body: json.encode({
            'phone': phone,
            if (channel != 'sms') 'channel': channel,
          }),
        )
        .timeout(const Duration(seconds: 20));

    final contentType = response.headers['content-type'] ?? '';
    if (!contentType.contains('application/json')) {
      throw const FormatException(
        'The server returned an unexpected response.',
      );
    }

    final result = json.decode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200 || result['success'] != true) {
      final message = _readError(
        result,
        'Unable to send the verification code.',
      );
      if (_isNotRegistered(result, response.statusCode)) {
        throw _NotRegisteredException(message);
      }
      throw Exception(message);
    }

    final sandboxOtp = result['sandbox_otp']?.toString();
    if (sandboxOtp != null && sandboxOtp.isNotEmpty && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Dev OTP: $sandboxOtp'),
          backgroundColor: ParentColors.ink,
          duration: const Duration(seconds: 8),
        ),
      );
    }

    final source = result['source']?.toString();
    final emailHint = result['email_hint']?.toString();
    if (source == 'email' &&
        emailHint != null &&
        emailHint.isNotEmpty &&
        mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Code sent to $emailHint'),
          backgroundColor: ParentColors.ink,
          duration: const Duration(seconds: 6),
        ),
      );
    }

    return {
      'source': source,
      'email_hint': emailHint,
    };
  }

  Future<Map<String, dynamic>> _verifyOtpWithApi(
    String phone,
    String otp,
  ) async {
    final response = await http
        .post(
          Uri.parse('${ApiConfig.baseUrl}/api/auth/parent-login'),
          headers: {'Content-Type': 'application/json'},
          body: json.encode({'phone': phone, 'otp': otp}),
        )
        .timeout(const Duration(seconds: 20));

    final contentType = response.headers['content-type'] ?? '';
    if (!contentType.contains('application/json')) {
      throw const FormatException(
        'The server returned an unexpected response.',
      );
    }

    final result = json.decode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200 || result['success'] != true) {
      final message = _readError(result, 'The verification code is invalid.');
      if (_isNotRegistered(result, response.statusCode)) {
        throw _NotRegisteredException(message);
      }
      throw Exception(message);
    }
    return Map<String, dynamic>.from(result['session'] as Map);
  }

  Future<void> _persistParentSession(Map<String, dynamic> session) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('parent_id', session['id']?.toString() ?? '');
    await prefs.setString('parent_name', session['name']?.toString() ?? '');
    await prefs.setString('parent_phone', session['phone']?.toString() ?? '');
    await prefs.setString('parent_role', session['role']?.toString() ?? '');
    await prefs.setString('tenant_id', session['tenant_id']?.toString() ?? '');
    await prefs.setString(
      'children_json',
      json.encode(session['children'] ?? []),
    );
    await prefs.setBool('is_logged_in', true);
    await ParentApiAuth.persistToken(session['access_token']?.toString());
    final refresh = session['supabase_refresh_token']?.toString();
    await ParentApiAuth.persistSupabaseRefresh(refresh);
    if (refresh == null || refresh.isEmpty) return;
    try {
      if (Supabase.instance.isInitialized) {
        // Exchanges refresh for a live session (uid required for avatar storage RLS).
        await Supabase.instance.client.auth.setSession(refresh);
      }
    } catch (_) {
      // HMAC token still authenticates API calls including photo upload.
    }
  }

  Future<void> _handleSendOtp() async {
    if (!_phoneFormKey.currentState!.validate()) return;
    final phone = _normalizePhone(_phoneController.text);

    setState(() => _isLoading = true);
    try {
      final result = await (widget.requestOtp ?? _requestOtpFromApi)(
        phone,
        channel: 'sms',
      );
      if (!mounted) return;
      setState(() {
        _phone = phone;
        _showVerification = true;
        _emailHint = result?['email_hint']?.toString();
      });
      _startResendTimer();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _otpFocusNodes.first.requestFocus();
      });
    } on TimeoutException {
      _showError('The request timed out. Check your connection and try again.');
    } on SocketException {
      _showError('Unable to connect. Check your internet connection.');
    } on FormatException catch (error) {
      _showError(error.message);
    } on _NotRegisteredException catch (error) {
      _showGuidance(error.message);
    } catch (error) {
      final message = error.toString().replaceFirst('Exception: ', '');
      if (_looksUnregistered(message)) {
        _showGuidance(message);
      } else {
        _showError(message);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleVerifyOtp() async {
    final otp = _otpValue();
    if (otp.length != 6) {
      _showError('Enter the complete 6-digit verification code.');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final session = await (widget.verifyOtp ?? _verifyOtpWithApi)(
        _phone,
        otp,
      );
      await _persistParentSession(session);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder:
              widget.authenticatedBuilder ?? (_) => const DashboardScreen(),
        ),
      );
    } on TimeoutException {
      _showError(
        'Verification timed out. Check your connection and try again.',
      );
    } on SocketException {
      _showError('Unable to connect. Check your internet connection.');
    } on FormatException catch (error) {
      _showError(error.message);
    } on _NotRegisteredException catch (error) {
      _showGuidance(error.message);
    } catch (error) {
      final message = error.toString().replaceFirst('Exception: ', '');
      if (_looksUnregistered(message)) {
        _showGuidance(message);
      } else {
        _showError(message);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _startResendTimer() {
    _resendTimer?.cancel();
    setState(() => _resendRemaining = _resendSeconds);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_resendRemaining <= 1) {
        timer.cancel();
        setState(() => _resendRemaining = 0);
      } else {
        setState(() => _resendRemaining--);
      }
    });
  }

  Future<void> _resendOtp() async {
    if (_resendRemaining > 0 || _isLoading) return;
    setState(() => _isLoading = true);
    try {
      final result = await (widget.requestOtp ?? _requestOtpFromApi)(
        _phone,
        channel: 'sms',
      );
      if (mounted) {
        setState(() {
          _emailHint = result?['email_hint']?.toString() ?? _emailHint;
        });
      }
      _startResendTimer();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('A new verification code was sent.')),
        );
      }
    } on _NotRegisteredException catch (error) {
      _showGuidance(error.message);
    } catch (error) {
      final message = error.toString().replaceFirst('Exception: ', '');
      if (_looksUnregistered(message)) {
        _showGuidance(message);
      } else {
        _showError(message);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _sendOtpViaEmail() async {
    if (_isLoading) return;
    setState(() => _isLoading = true);
    try {
      final result = await (widget.requestOtp ?? _requestOtpFromApi)(
        _phone,
        channel: 'email',
      );
      if (mounted) {
        setState(() {
          _emailHint = result?['email_hint']?.toString() ?? _emailHint;
        });
      }
      _startResendTimer();
    } on _NotRegisteredException catch (error) {
      _showGuidance(error.message);
    } catch (error) {
      final message = error.toString().replaceFirst('Exception: ', '');
      _showError(message);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Theme.of(context).colorScheme.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _showGuidance(String message) {
    if (!mounted) return;
    final body = _looksUnregistered(message)
        ? 'This number is not registered as a parent. Contact your school to get access.'
        : message;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(body),
        backgroundColor: ParentColors.primaryFill,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 5),
      ),
    );
  }

  void _returnToPhone() {
    _resendTimer?.cancel();
    FocusScope.of(context).unfocus();
    for (final controller in _otpControllers) {
      controller.clear();
    }
    setState(() {
      _showVerification = false;
      _emailHint = null;
    });
  }

  Future<void> _contactSupport() async {
    final uri = Uri(
      scheme: 'mailto',
      path: 'support@onthebus.app',
      queryParameters: {'subject': 'Parent app sign-in support'},
    );
    if (!await launchUrl(uri)) {
      _showError(
        'Please contact your school administrator for sign-in support.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ParentColors.surface,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 260),
          child: _showVerification
              ? _VerificationView(
                  key: const ValueKey('verification'),
                  phone: _formattedPhone(),
                  controllers: _otpControllers,
                  focusNodes: _otpFocusNodes,
                  isLoading: _isLoading,
                  resendRemaining: _resendRemaining,
                  versionLabel: _versionLabel,
                  emailHint: _emailHint,
                  onBack: _returnToPhone,
                  onVerify: _handleVerifyOtp,
                  onResend: _resendOtp,
                  onSendViaEmail: _emailHint != null && _emailHint!.isNotEmpty
                      ? _sendOtpViaEmail
                      : null,
                )
              : _PhoneEntryView(
                  key: const ValueKey('phone-entry'),
                  formKey: _phoneFormKey,
                  phoneController: _phoneController,
                  isLoading: _isLoading,
                  versionLabel: _versionLabel,
                  onSendOtp: _handleSendOtp,
                  onContactSupport: _contactSupport,
                ),
        ),
      ),
    );
  }
}

class _PhoneEntryView extends StatelessWidget {
  const _PhoneEntryView({
    super.key,
    required this.formKey,
    required this.phoneController,
    required this.isLoading,
    required this.versionLabel,
    required this.onSendOtp,
    required this.onContactSupport,
  });

  final GlobalKey<FormState> formKey;
  final TextEditingController phoneController;
  final bool isLoading;
  final String versionLabel;
  final VoidCallback onSendOtp;
  final VoidCallback onContactSupport;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Column(
              children: [
                _LoginHero(height: constraints.maxHeight < 700 ? 270 : 330),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 20),
                  child: Form(
                    key: formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Welcome to OnTheBus',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: ParentColors.ink,
                            fontSize: 26,
                            height: 1.1,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.7,
                          ),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Parent App',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: ParentColors.primary,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          "Sign in to follow your child's trips and\nstay informed.",
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: ParentColors.muted,
                            fontSize: 13,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 24),
                        const Text(
                          'MOBILE NUMBER',
                          style: TextStyle(
                            color: ParentColors.muted,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.7,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextFormField(
                          key: const Key('parent-phone-field'),
                          controller: phoneController,
                          enabled: !isLoading,
                          autovalidateMode: AutovalidateMode.onUserInteraction,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.done,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(10),
                          ],
                          onFieldSubmitted: (_) => onSendOtp(),
                          style: const TextStyle(
                            color: ParentColors.ink,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                          cursorColor: ParentColors.ink,
                          decoration: InputDecoration(
                            hintText: '712 345 678',
                            hintStyle: const TextStyle(
                              color: ParentColors.mutedLight,
                              fontWeight: FontWeight.w600,
                            ),
                            prefixIconConstraints: const BoxConstraints(
                              minWidth: 104,
                            ),
                            prefixIcon: const Padding(
                              padding: EdgeInsets.only(left: 14, right: 10),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text('🇰🇪', style: TextStyle(fontSize: 20)),
                                  SizedBox(width: 7),
                                  Text(
                                    '+254',
                                    style: TextStyle(
                                      color: ParentColors.ink,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  SizedBox(width: 9),
                                  SizedBox(
                                    height: 24,
                                    child: VerticalDivider(
                                      color: ParentColors.border,
                                      width: 1,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            filled: true,
                            fillColor: ParentColors.surface,
                            border: _inputBorder(ParentColors.border),
                            enabledBorder: _inputBorder(ParentColors.border),
                            focusedBorder: _inputBorder(ParentColors.primary),
                            errorBorder: _inputBorder(
                              Theme.of(context).colorScheme.error,
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 17,
                            ),
                          ),
                          validator: (value) {
                            final digits =
                                value?.replaceAll(RegExp(r'\D'), '') ?? '';
                            final localDigits = digits.startsWith('0')
                                ? digits.substring(1)
                                : digits;
                            if (localDigits.length != 9) {
                              return 'Enter a valid 9-digit mobile number';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 10),
                        const Row(
                          children: [
                            Icon(
                              Icons.verified_user_outlined,
                              size: 16,
                              color: ParentColors.primary,
                            ),
                            SizedBox(width: 7),
                            Expanded(
                              child: Text(
                                "We'll send a 6-digit OTP to verify your number.",
                                style: TextStyle(
                                  color: ParentColors.muted,
                                  fontSize: 11.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 18),
                        _PrimaryButton(
                          key: const Key('send-otp-button'),
                          label: 'SEND OTP',
                          icon: Icons.arrow_forward,
                          isLoading: isLoading,
                          onPressed: onSendOtp,
                        ),
                        const SizedBox(height: 18),
                        InkWell(
                          onTap: onContactSupport,
                          borderRadius: BorderRadius.circular(14),
                          child: const Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 10,
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.headset_mic_outlined,
                                  color: ParentColors.primary,
                                  size: 25,
                                ),
                                SizedBox(width: 13),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Having trouble?',
                                        style: TextStyle(
                                          color: ParentColors.ink,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      Text(
                                        'Contact your school administrator\nor support.',
                                        style: TextStyle(
                                          color: ParentColors.muted,
                                          fontSize: 10.5,
                                          height: 1.3,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Icon(
                                  Icons.chevron_right,
                                  color: ParentColors.muted,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                _SafetyFooter(versionLabel: versionLabel),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _LoginHero extends StatelessWidget {
  const _LoginHero({required this.height});

  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: ClipPath(
        clipper: _HeroBottomClipper(),
        child: Stack(
          alignment: Alignment.center,
          children: [
            const Positioned.fill(
              child: ColoredBox(color: ParentColors.paleGreen),
            ),
            Positioned.fill(
              child: Image.asset(
                'assets/onboarding/welcome_bus.jpg',
                fit: BoxFit.cover,
                alignment: const Alignment(0, 0.35),
              ),
            ),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.white.withValues(alpha: 0.55),
                      Colors.white.withValues(alpha: 0.08),
                      ParentColors.paleGreen.withValues(alpha: 0.35),
                    ],
                    stops: const [0, 0.42, 1],
                  ),
                ),
              ),
            ),
            const Positioned(top: 16, child: _LoginBrandMark()),
          ],
        ),
      ),
    );
  }
}

class _LoginBrandMark extends StatelessWidget {
  const _LoginBrandMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Column(
        children: [
          Text(
            'OnTheBus',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: Color(0xFF1F3A2E),
              height: 1,
              letterSpacing: -0.6,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'PARENT APP',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.4,
              color: ParentColors.onboarding,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroBottomClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    return Path()
      ..lineTo(0, size.height - 24)
      ..quadraticBezierTo(
        size.width * 0.47,
        size.height - 54,
        size.width,
        size.height - 14,
      )
      ..lineTo(size.width, 0)
      ..close();
  }

  @override
  bool shouldReclip(_HeroBottomClipper oldClipper) => false;
}

class _VerificationView extends StatelessWidget {
  const _VerificationView({
    super.key,
    required this.phone,
    required this.controllers,
    required this.focusNodes,
    required this.isLoading,
    required this.resendRemaining,
    required this.versionLabel,
    this.emailHint,
    required this.onBack,
    required this.onVerify,
    required this.onResend,
    this.onSendViaEmail,
  });

  final String phone;
  final List<TextEditingController> controllers;
  final List<FocusNode> focusNodes;
  final bool isLoading;
  final int resendRemaining;
  final String versionLabel;
  final String? emailHint;
  final VoidCallback onBack;
  final VoidCallback onVerify;
  final VoidCallback onResend;
  final VoidCallback? onSendViaEmail;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          children: [
            const Positioned(
              left: -70,
              right: -70,
              bottom: -125,
              child: _BottomWave(),
            ),
            SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                18,
                8,
                18,
                24 + MediaQuery.viewInsetsOf(context).bottom,
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: constraints.maxHeight - 32,
                  maxWidth: 520,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: IconButton(
                        key: const Key('otp-back-button'),
                        onPressed: isLoading ? null : onBack,
                        icon: const Icon(Icons.arrow_back),
                        color: ParentColors.ink,
                      ),
                    ),
                    const SizedBox(height: 14),
                    const _OtpIllustration(),
                    const SizedBox(height: 22),
                    const Text(
                      'Verify your number',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: ParentColors.ink,
                        fontSize: 27,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.7,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      "We've sent a 6-digit code to",
                      textAlign: TextAlign.center,
                      style: TextStyle(color: ParentColors.muted, fontSize: 13),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      phone,
                      key: const Key('verification-phone'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: ParentColors.primary,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 30),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: List.generate(6, (index) {
                        return SizedBox(
                          width: 47,
                          child: TextField(
                            key: Key('otp-digit-$index'),
                            controller: controllers[index],
                            focusNode: focusNodes[index],
                            enabled: !isLoading,
                            autofocus: index == 0,
                            textAlign: TextAlign.center,
                            keyboardType: TextInputType.number,
                            textInputAction: index == 5
                                ? TextInputAction.done
                                : TextInputAction.next,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(1),
                            ],
                            style: const TextStyle(
                              color: ParentColors.ink,
                              fontSize: 23,
                              fontWeight: FontWeight.w800,
                            ),
                            cursorColor: ParentColors.ink,
                            decoration: InputDecoration(
                              hintText: '—',
                              hintStyle: const TextStyle(
                                color: ParentColors.mutedLight,
                                fontSize: 18,
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                vertical: 14,
                              ),
                              border: _inputBorder(ParentColors.border),
                              enabledBorder: _inputBorder(ParentColors.border),
                              focusedBorder: _inputBorder(ParentColors.primary),
                            ),
                            onChanged: (value) {
                              if (value.isNotEmpty && index < 5) {
                                focusNodes[index + 1].requestFocus();
                              } else if (value.isEmpty && index > 0) {
                                focusNodes[index - 1].requestFocus();
                              }
                            },
                            onSubmitted: (_) {
                              if (index == 5) onVerify();
                            },
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 30),
                    const Text(
                      "Didn't receive the code?",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: ParentColors.ink,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 5),
                    TextButton(
                      key: const Key('resend-otp-button'),
                      onPressed: resendRemaining == 0 && !isLoading
                          ? onResend
                          : null,
                      child: Text.rich(
                        TextSpan(
                          text: resendRemaining == 0
                              ? 'Resend code'
                              : 'Resend code in ',
                          children: resendRemaining == 0
                              ? const []
                              : [
                                  TextSpan(
                                    text: '${resendRemaining}s',
                                    style: const TextStyle(
                                      color: ParentColors.primary,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ],
                        ),
                        style: const TextStyle(
                          color: ParentColors.muted,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    if (onSendViaEmail != null) ...[
                      TextButton(
                        key: const Key('send-otp-email-button'),
                        onPressed: isLoading ? null : onSendViaEmail,
                        child: Text(
                          emailHint != null && emailHint!.isNotEmpty
                              ? 'Send code via email ($emailHint)'
                              : 'Send code via email',
                          style: const TextStyle(
                            color: ParentColors.primary,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 22),
                    _PrimaryButton(
                      key: const Key('verify-otp-button'),
                      label: 'VERIFY & CONTINUE',
                      isLoading: isLoading,
                      onPressed: onVerify,
                    ),
                    const SizedBox(height: 30),
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: ParentColors.softGreen,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Row(
                        children: [
                          Icon(
                            Icons.verified_user_outlined,
                            color: ParentColors.primary,
                            size: 31,
                          ),
                          SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Secure & Private',
                                  style: TextStyle(
                                    color: ParentColors.ink,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                SizedBox(height: 3),
                                Text(
                                  'Your information is protected and\nused only to keep your child safe.',
                                  style: TextStyle(
                                    color: ParentColors.muted,
                                    fontSize: 11,
                                    height: 1.35,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (versionLabel.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      Text(
                        versionLabel,
                        key: const Key('app-version-label'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: ParentColors.mutedLight,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _OtpIllustration extends StatelessWidget {
  const _OtpIllustration();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 122,
            height: 122,
            decoration: BoxDecoration(
              color: ParentColors.softGreen,
              shape: BoxShape.circle,
              border: Border.all(color: ParentColors.border),
            ),
            child: Center(
              child: Container(
                width: 58,
                height: 88,
                decoration: BoxDecoration(
                  color: ParentColors.surface,
                  border: Border.all(color: ParentColors.ink, width: 2),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: ParentColors.ink.withValues(alpha: 0.12),
                      blurRadius: 12,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: ParentColors.primary,
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: const Text(
                      '***',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const Positioned(
            right: -3,
            top: 8,
            child: Icon(
              Icons.notifications_rounded,
              color: ParentColors.accentYellow,
              size: 36,
            ),
          ),
          const Positioned(
            left: -13,
            top: 28,
            child: Icon(Icons.circle, color: ParentColors.primary, size: 6),
          ),
          const Positioned(
            right: 2,
            bottom: 12,
            child: Icon(
              Icons.auto_awesome,
              color: ParentColors.primary,
              size: 17,
            ),
          ),
        ],
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    super.key,
    required this.label,
    required this.isLoading,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final bool isLoading;
  final VoidCallback onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: isLoading ? null : onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: ParentColors.primaryFill,
        disabledBackgroundColor: ParentColors.primaryFill.withValues(
          alpha: 0.55,
        ),
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 56),
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
      ),
      child: isLoading
          ? const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.6,
                color: Colors.white,
              ),
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.4,
                  ),
                ),
                if (icon != null) ...[
                  const SizedBox(width: 12),
                  Icon(icon, size: 20),
                ],
              ],
            ),
    );
  }
}

class _SafetyFooter extends StatelessWidget {
  const _SafetyFooter({required this.versionLabel});

  final String versionLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 12),
      color: ParentColors.paleGreen,
      child: Column(
        children: [
          const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.lock_outline,
                size: 12,
                color: ParentColors.primaryFill,
              ),
              SizedBox(width: 5),
              Text(
                'Your data is safe with us',
                style: TextStyle(
                  color: ParentColors.muted,
                  fontSize: 9.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          if (versionLabel.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              versionLabel,
              key: const Key('app-version-label'),
              style: const TextStyle(
                color: ParentColors.mutedLight,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _BottomWave extends StatelessWidget {
  const _BottomWave();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 210,
      decoration: const BoxDecoration(
        color: ParentColors.paleGreen,
        borderRadius: BorderRadius.vertical(top: Radius.elliptical(300, 80)),
      ),
    );
  }
}

OutlineInputBorder _inputBorder(Color color) {
  return OutlineInputBorder(
    borderRadius: BorderRadius.circular(10),
    borderSide: BorderSide(color: color, width: 1.3),
  );
}
