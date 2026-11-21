import 'package:digital_leadership/features/seismic/seismic_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('brand colours match the web tokens', () {
    expect(SeismicColors.petroleum700, const Color(0xFF004D40));
    expect(SeismicColors.gold500, const Color(0xFFD4AF37));
  });

  test('theme uses gold primary on petroleum surfaces', () {
    final theme = buildSeismicTheme();
    expect(theme.colorScheme.brightness, Brightness.dark);
    expect(theme.colorScheme.primary, SeismicColors.gold500);
    expect(theme.scaffoldBackgroundColor, SeismicColors.petroleum900);
  });

  testWidgets('GlassPanel renders its child behind a blur', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildSeismicTheme(),
      home: const Scaffold(body: GlassPanel(child: Text('Fleet F1'))),
    ));
    expect(find.text('Fleet F1'), findsOneWidget);
    expect(find.byType(BackdropFilter), findsOneWidget);
  });
}
