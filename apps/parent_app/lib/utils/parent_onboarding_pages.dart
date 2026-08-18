import 'package:flutter/material.dart';

class ParentOnboardingPage {
  final String title;
  final String body;
  final String primaryLabel;
  final IconData icon;
  final Color accent;

  const ParentOnboardingPage({
    required this.title,
    required this.body,
    required this.primaryLabel,
    required this.icon,
    required this.accent,
  });
}

const parentOnboardingPages = [
  ParentOnboardingPage(
    title: 'Follow the bus',
    body: 'Watch your child’s school bus on a live map — no guessing where they are on the way to school or home.',
    primaryLabel: 'Next',
    icon: Icons.map_rounded,
    accent: Color(0xFF10B981),
  ),
  ParentOnboardingPage(
    title: 'Know when they’re near',
    body: 'Get trip alerts when the bus leaves campus and when it is approaching your stop, so you can be ready.',
    primaryLabel: 'Next',
    icon: Icons.notifications_active_rounded,
    accent: Color(0xFF2563EB),
  ),
  ParentOnboardingPage(
    title: 'Peace of mind, every trip',
    body: 'See boarding updates, ETAs, and today’s status in one calm place — built for OnTheBus parents.',
    primaryLabel: 'Get started',
    icon: Icons.favorite_rounded,
    accent: Color(0xFF7C3AED),
  ),
];

bool isLastOnboardingPage(int index) =>
    index >= 0 && index == parentOnboardingPages.length - 1;

String onboardingPrimaryLabel(int index) {
  if (index < 0 || index >= parentOnboardingPages.length) return 'Next';
  return parentOnboardingPages[index].primaryLabel;
}
