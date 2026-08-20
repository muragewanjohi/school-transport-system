enum ParentOnboardingArt { welcome, liveMap, alerts }

class ParentOnboardingPage {
  final String title;
  final String body;
  final String primaryLabel;
  final ParentOnboardingArt art;

  const ParentOnboardingPage({
    required this.title,
    required this.body,
    required this.primaryLabel,
    required this.art,
  });
}

class ParentOnboardingAlertPreview {
  final String appName;
  final String title;
  final String? detail;
  final String eventTime;
  final String receivedTime;
  final ParentOnboardingAlertKind kind;

  const ParentOnboardingAlertPreview({
    required this.appName,
    required this.title,
    this.detail,
    required this.eventTime,
    required this.receivedTime,
    required this.kind,
  });
}

enum ParentOnboardingAlertKind { pickedUp, enRoute, droppedOff, delay }

class ParentOnboardingMapLabel {
  final String title;
  final String subtitle;
  final ParentOnboardingMapLabelKind kind;

  const ParentOnboardingMapLabel({
    required this.title,
    required this.subtitle,
    required this.kind,
  });
}

enum ParentOnboardingMapLabelKind { enRoute, nextStop }

const parentOnboardingMapLabels = [
  ParentOnboardingMapLabel(
    title: 'En route to School',
    subtitle: '7:45 AM',
    kind: ParentOnboardingMapLabelKind.enRoute,
  ),
  ParentOnboardingMapLabel(
    title: 'Next Stop',
    subtitle: 'Greenview Estate\n2 min away',
    kind: ParentOnboardingMapLabelKind.nextStop,
  ),
];

const parentOnboardingPages = [
  ParentOnboardingPage(
    title: 'Peace of mind on every journey.',
    body: "Real-time school bus tracking for your child's safety.",
    primaryLabel: 'Next',
    art: ParentOnboardingArt.welcome,
  ),
  ParentOnboardingPage(
    title: 'Real-time Tracking',
    body: "See your child's bus location live on the map.",
    primaryLabel: 'Next',
    art: ParentOnboardingArt.liveMap,
  ),
  ParentOnboardingPage(
    title: 'Instant Updates',
    body: 'Get notified about pick-ups, drop-offs and delays.',
    primaryLabel: 'Get started',
    art: ParentOnboardingArt.alerts,
  ),
];

const parentOnboardingAlertPreviews = [
  ParentOnboardingAlertPreview(
    appName: 'OnTheBus',
    title: 'James was picked up',
    eventTime: '7:45 AM',
    receivedTime: '2:15 AM',
    kind: ParentOnboardingAlertKind.pickedUp,
  ),
  ParentOnboardingAlertPreview(
    appName: 'OnTheBus',
    title: 'James is on the way to school',
    eventTime: '7:45 AM',
    receivedTime: '2:15 AM',
    kind: ParentOnboardingAlertKind.enRoute,
  ),
  ParentOnboardingAlertPreview(
    appName: 'OnTheBus',
    title: 'James was dropped off',
    eventTime: '2:15 PM',
    receivedTime: '2:15 AM',
    kind: ParentOnboardingAlertKind.droppedOff,
  ),
  ParentOnboardingAlertPreview(
    appName: 'OnTheBus',
    title: 'Delay Alert',
    detail: 'Bus delayed by 10 mins',
    eventTime: '8:05 AM',
    receivedTime: '2:15 AM',
    kind: ParentOnboardingAlertKind.delay,
  ),
];

bool isLastOnboardingPage(int index) =>
    index >= 0 && index == parentOnboardingPages.length - 1;

String onboardingPrimaryLabel(int index) {
  if (index < 0 || index >= parentOnboardingPages.length) return 'Next';
  return parentOnboardingPages[index].primaryLabel;
}
