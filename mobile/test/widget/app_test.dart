import 'package:flutter_test/flutter_test.dart';

import 'package:digital_leadership/app/app.dart';

void main() {
  testWidgets('app opens on the Login screen, never directly into the app', (
    tester,
  ) async {
    await tester.pumpWidget(const DigitalLeadershipApp());

    expect(find.text('Digital Leadership'), findsOneWidget);
    expect(
      find.text('Sign in with Google (not yet implemented)'),
      findsOneWidget,
    );
  });
}
