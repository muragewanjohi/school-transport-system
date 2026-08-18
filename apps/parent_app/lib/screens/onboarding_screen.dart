import 'package:flutter/material.dart';
import 'package:parent_app/screens/login_screen.dart';
import 'package:parent_app/theme/parent_colors.dart';
import 'package:parent_app/utils/parent_onboarding_pages.dart';
import 'package:shared_preferences/shared_preferences.dart';

const parentOnboardingCompleteKey = 'parent_onboarding_complete';

class OnboardingScreen extends StatefulWidget {
  final Future<void> Function()? onFinished;

  const OnboardingScreen({super.key, this.onFinished});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    if (widget.onFinished != null) {
      await widget.onFinished!();
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(parentOnboardingCompleteKey, true);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (context) => const LoginScreen()),
    );
  }

  void _next() {
    if (isLastOnboardingPage(_index)) {
      _finish();
      return;
    }
    _controller.nextPage(
      duration: const Duration(milliseconds: 380),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final page = parentOnboardingPages[_index];

    return Scaffold(
      backgroundColor: ParentColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              child: Row(
                children: [
                  if (_index > 0)
                    IconButton(
                      onPressed: () => _controller.previousPage(
                        duration: const Duration(milliseconds: 320),
                        curve: Curves.easeOutCubic,
                      ),
                      icon: const Icon(Icons.arrow_back_rounded, color: ParentColors.ink),
                    )
                  else
                    const SizedBox(width: 48),
                  const Spacer(),
                  TextButton(
                    onPressed: _finish,
                    child: const Text(
                      'Skip',
                      style: TextStyle(
                        color: ParentColors.muted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: parentOnboardingPages.length,
                onPageChanged: (value) => setState(() => _index = value),
                itemBuilder: (context, index) {
                  final item = parentOnboardingPages[index];
                  return _OnboardingPageView(page: item);
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(parentOnboardingPages.length, (i) {
                      final selected = i == _index;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        height: 8,
                        width: selected ? 28 : 8,
                        decoration: BoxDecoration(
                          color: selected ? ParentColors.primaryFill : const Color(0xFFD1D5DB),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: ElevatedButton(
                      onPressed: _next,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: ParentColors.primaryFill,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: Text(
                        page.primaryLabel,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OnboardingPageView extends StatelessWidget {
  final ParentOnboardingPage page;

  const _OnboardingPageView({required this.page});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxHeight < 560;
        final artSize = compact ? 168.0 : 280.0;
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _Illustration(page: page, size: artSize),
                  SizedBox(height: compact ? 20 : 28),
                  Text(
                    page.title,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: compact ? 26 : 32,
                      fontWeight: FontWeight.w800,
                      color: ParentColors.ink,
                      height: 1.15,
                      letterSpacing: -0.6,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    page.body,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 16,
                      height: 1.5,
                      color: ParentColors.muted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Illustration extends StatelessWidget {
  final ParentOnboardingPage page;
  final double size;

  const _Illustration({required this.page, required this.size});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: size,
      width: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned(
            top: size * 0.04,
            right: size * 0.06,
            child: _blob(size * 0.33, page.accent.withValues(alpha: 0.12)),
          ),
          Positioned(
            bottom: size * 0.03,
            left: size * 0.03,
            child: _blob(size * 0.26, ParentColors.primary.withValues(alpha: 0.14)),
          ),
          Container(
            width: size * 0.67,
            height: size * 0.67,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  page.accent.withValues(alpha: 0.95),
                  ParentColors.primaryFill,
                ],
              ),
              boxShadow: [
                BoxShadow(
                  color: page.accent.withValues(alpha: 0.28),
                  blurRadius: 36,
                  offset: const Offset(0, 18),
                ),
              ],
            ),
            child: Icon(page.icon, size: size * 0.3, color: Colors.white),
          ),
          Positioned(
            top: size * 0.1,
            left: size * 0.05,
            child: _chip(Icons.directions_bus_rounded, 'Live'),
          ),
          Positioned(
            bottom: size * 0.13,
            right: size * 0.03,
            child: _chip(Icons.verified_rounded, 'Safe'),
          ),
        ],
      ),
    );
  }

  Widget _blob(double size, Color color) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }

  Widget _chip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: ParentColors.surface,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
            color: ParentColors.ink.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: ParentColors.primaryFill),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 12,
              color: ParentColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
