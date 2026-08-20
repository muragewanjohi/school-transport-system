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

  void _back() {
    _controller.previousPage(
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final page = parentOnboardingPages[_index];
    final isWelcome = page.art == ParentOnboardingArt.welcome;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: SizedBox(
                height: _index > 0 ? 48 : 8,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: _index > 0
                      ? _BackButton(onPressed: _back)
                      : const SizedBox.shrink(),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: parentOnboardingPages.length,
                onPageChanged: (value) => setState(() => _index = value),
                itemBuilder: (context, index) {
                  return _OnboardingPageView(page: parentOnboardingPages[index]);
                },
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(24, isWelcome ? 4 : 8, 24, 20),
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
                        width: selected ? 22 : 8,
                        decoration: BoxDecoration(
                          color: selected
                              ? ParentColors.onboarding
                              : const Color(0xFFD1D5DB),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: ElevatedButton(
                      onPressed: _next,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: ParentColors.onboarding,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(28),
                        ),
                      ),
                      child: Text(
                        page.primaryLabel,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _finish,
                    child: const Text(
                      'Skip',
                      style: TextStyle(
                        color: ParentColors.onboarding,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
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

class _BackButton extends StatelessWidget {
  final VoidCallback onPressed;

  const _BackButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFE8F6EC),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: const SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            Icons.arrow_back_rounded,
            color: ParentColors.onboarding,
            size: 22,
          ),
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
    switch (page.art) {
      case ParentOnboardingArt.welcome:
        return const _WelcomePage();
      case ParentOnboardingArt.liveMap:
        return _LiveMapPage(page: page);
      case ParentOnboardingArt.alerts:
        return _AlertsPage(page: page);
    }
  }
}

class _WelcomePage extends StatelessWidget {
  const _WelcomePage();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 8),
        const _BrandMark(),
        const SizedBox(height: 22),
        const Text.rich(
          TextSpan(
            children: [
              TextSpan(text: 'Peace of mind\n'),
              TextSpan(text: 'on every '),
              TextSpan(
                text: 'journey.',
                style: TextStyle(color: ParentColors.onboarding),
              ),
            ],
          ),
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: Color(0xFF1F3A2E),
            height: 1.15,
            letterSpacing: -0.6,
          ),
        ),
        const SizedBox(height: 10),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 36),
          child: Text(
            "Real-time school bus tracking\nfor your child's safety.",
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              height: 1.4,
              fontWeight: FontWeight.w500,
              color: Color(0xFF6B7280),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: Image.asset(
            'assets/onboarding/welcome_bus.jpg',
            fit: BoxFit.cover,
            alignment: const Alignment(0, 0.55),
            width: double.infinity,
          ),
        ),
      ],
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const SizedBox(
          width: 44,
          height: 52,
          child: CustomPaint(painter: _LogoPinPainter()),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'OnTheBus',
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: Color(0xFF1F3A2E),
                height: 1,
                letterSpacing: -0.6,
              ),
            ),
            const SizedBox(height: 4),
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
      ],
    );
  }
}

class _LogoPinPainter extends CustomPainter {
  const _LogoPinPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final pin = Path()
      ..moveTo(size.width * 0.5, size.height)
      ..quadraticBezierTo(size.width * 0.08, size.height * 0.62, size.width * 0.08, size.height * 0.38)
      ..arcToPoint(
        Offset(size.width * 0.92, size.height * 0.38),
        radius: Radius.circular(size.width * 0.42),
        clockwise: true,
      )
      ..quadraticBezierTo(size.width * 0.92, size.height * 0.62, size.width * 0.5, size.height)
      ..close();
    canvas.drawPath(pin, Paint()..color = ParentColors.onboarding);
    canvas.drawCircle(
      Offset(size.width * 0.5, size.height * 0.38),
      size.width * 0.28,
      Paint()..color = Colors.white,
    );
    final busSize = Size(size.width * 0.42, size.height * 0.28);
    final origin = Offset(
      size.width * 0.5 - busSize.width / 2,
      size.height * 0.38 - busSize.height / 2,
    );
    canvas.save();
    canvas.translate(origin.dx, origin.dy);
    const _MiniBusPainter().paint(canvas, busSize);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _MiniBusPainter extends CustomPainter {
  const _MiniBusPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final body = RRect.fromRectAndRadius(
      Rect.fromLTWH(size.width * 0.08, size.height * 0.18, size.width * 0.84, size.height * 0.62),
      const Radius.circular(4),
    );
    canvas.drawRRect(body, Paint()..color = const Color(0xFFF5C542));
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(size.width * 0.16, size.height * 0.26, size.width * 0.68, size.height * 0.28),
        const Radius.circular(2),
      ),
      Paint()..color = const Color(0xFF1F2937),
    );
    final light = Paint()..color = Colors.white;
    canvas.drawCircle(Offset(size.width * 0.28, size.height * 0.68), size.width * 0.07, light);
    canvas.drawCircle(Offset(size.width * 0.72, size.height * 0.68), size.width * 0.07, light);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _AlertsPage extends StatelessWidget {
  final ParentOnboardingPage page;

  const _AlertsPage({required this.page});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  page.title,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                    height: 1.15,
                    letterSpacing: -0.5,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  page.body,
                  style: const TextStyle(
                    fontSize: 13,
                    height: 1.35,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF6B7280),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Expanded(child: _LockScreenPhone()),
        ],
      ),
    );
  }
}

class _LockScreenPhone extends StatelessWidget {
  const _LockScreenPhone();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 300, maxHeight: 560),
        child: AspectRatio(
          aspectRatio: 9 / 17.5,
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF1C1C1E),
              borderRadius: BorderRadius.circular(42),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.18),
                  blurRadius: 28,
                  offset: const Offset(0, 16),
                ),
              ],
            ),
            padding: const EdgeInsets.all(8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(34),
              child: ColoredBox(
                color: const Color(0xFFF4F5F8),
                child: Column(
                  children: [
                    const SizedBox(height: 10),
                    Container(
                      width: 72,
                      height: 18,
                      decoration: BoxDecoration(
                        color: const Color(0xFF1C1C1E),
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      '9:41',
                      style: TextStyle(
                        fontSize: 44,
                        fontWeight: FontWeight.w300,
                        color: Color(0xFF111827),
                        height: 1,
                        letterSpacing: -1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Monday, 22 July',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF4B5563),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
                        child: Column(
                          children: [
                            for (var i = 0; i < parentOnboardingAlertPreviews.length; i++) ...[
                              if (i > 0) const SizedBox(height: 8),
                              _LockScreenBanner(
                                alert: parentOnboardingAlertPreviews[i],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LockScreenBanner extends StatelessWidget {
  final ParentOnboardingAlertPreview alert;

  const _LockScreenBanner({required this.alert});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _AlertGlyph(kind: alert.kind),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  alert.appName,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF9CA3AF),
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  alert.title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF111827),
                    height: 1.2,
                  ),
                ),
                if (alert.detail != null) ...[
                  const SizedBox(height: 1),
                  Text(
                    alert.detail!,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFF4B5563),
                    ),
                  ),
                ],
                const SizedBox(height: 2),
                Text(
                  alert.eventTime,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF9CA3AF),
                  ),
                ),
              ],
            ),
          ),
          Text(
            alert.receivedTime,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: Color(0xFF9CA3AF),
            ),
          ),
        ],
      ),
    );
  }
}

class _LiveMapPage extends StatelessWidget {
  final ParentOnboardingPage page;

  const _LiveMapPage({required this.page});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  page.title,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: ParentColors.onboarding,
                    height: 1.15,
                    letterSpacing: -0.5,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  page.body,
                  style: const TextStyle(
                    fontSize: 13,
                    height: 1.35,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF6B7280),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Expanded(child: _LiveMapArt()),
        ],
      ),
    );
  }
}

class _LiveMapArt extends StatelessWidget {
  const _LiveMapArt();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          children: [
            Positioned.fill(
              child: Image.asset(
                'assets/onboarding/live_map.jpg',
                fit: BoxFit.contain,
                alignment: Alignment.center,
              ),
            ),
            Positioned(
              top: constraints.maxHeight * 0.16,
              left: 0,
              child: _MapLabelCard(
                label: parentOnboardingMapLabels[0],
              ),
            ),
            Positioned(
              top: constraints.maxHeight * 0.52,
              right: 0,
              child: _MapLabelCard(
                label: parentOnboardingMapLabels[1],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _MapLabelCard extends StatelessWidget {
  final ParentOnboardingMapLabel label;

  const _MapLabelCard({required this.label});

  @override
  Widget build(BuildContext context) {
    final isEnRoute = label.kind == ParentOnboardingMapLabelKind.enRoute;
    return Container(
      constraints: const BoxConstraints(maxWidth: 188),
      padding: const EdgeInsets.fromLTRB(10, 10, 14, 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: isEnRoute ? const Color(0xFFFFF4D6) : const Color(0xFFE8F6EC),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isEnRoute ? Icons.directions_bus_rounded : Icons.location_on_rounded,
              size: 18,
              color: isEnRoute ? const Color(0xFFE6A817) : ParentColors.onboarding,
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label.title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  label.subtitle,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF6B7280),
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AlertGlyph extends StatelessWidget {
  final ParentOnboardingAlertKind kind;

  const _AlertGlyph({required this.kind});

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg, IconData icon) = switch (kind) {
      ParentOnboardingAlertKind.pickedUp => (
          const Color(0xFFFFF4D6),
          const Color(0xFFE6A817),
          Icons.notifications_rounded,
        ),
      ParentOnboardingAlertKind.enRoute => (
          const Color(0xFFE8F1FF),
          const Color(0xFF3B82F6),
          Icons.directions_bus_rounded,
        ),
      ParentOnboardingAlertKind.droppedOff => (
          const Color(0xFFE7F8EE),
          ParentColors.onboarding,
          Icons.check_circle_rounded,
        ),
      ParentOnboardingAlertKind.delay => (
          const Color(0xFFFEE2E2),
          const Color(0xFFEF4444),
          Icons.schedule_rounded,
        ),
    };

    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      child: Icon(icon, color: fg, size: 18),
    );
  }
}
