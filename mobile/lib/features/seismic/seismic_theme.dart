// Petroleum Turquoise / Metallic Gold theme for the 7th Seismic Crew
// screens. Mirrors seismic/src/theme/tokens.ts — keep both in sync.
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

class SeismicColors {
  SeismicColors._();
  static const petroleum900 = Color(0xFF00251F);
  static const petroleum800 = Color(0xFF00332B);
  static const petroleum700 = Color(0xFF004D40); // brand primary
  static const petroleum300 = Color(0xFF4DB6AC);
  static const gold700 = Color(0xFFA8832A);
  static const gold500 = Color(0xFFD4AF37); // metallic gold accent
  static const gold300 = Color(0xFFF1D27A);
  static const ink100 = Color(0xFFE8F3F1);
  static const ink300 = Color(0xFFA9C4BF);
  static const danger = Color(0xFFFF6B6B);

  static const goldGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [gold700, gold300, gold500, gold700],
    stops: [0, 0.45, 0.6, 1],
  );
}

ThemeData buildSeismicTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: SeismicColors.petroleum700,
    brightness: Brightness.dark,
  ).copyWith(
    primary: SeismicColors.gold500,
    onPrimary: SeismicColors.petroleum900,
    secondary: SeismicColors.petroleum300,
    surface: SeismicColors.petroleum800,
    onSurface: SeismicColors.ink100,
    error: SeismicColors.danger,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: SeismicColors.petroleum900,
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(44, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
  );
}

/// Frosted-glass surface: blur, translucent petroleum fill, gold hairline.
class GlassPanel extends StatelessWidget {
  const GlassPanel({super.key, required this.child, this.padding = const EdgeInsets.all(18)});

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(18);
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: const [BoxShadow(color: Color(0x8C001410), blurRadius: 40, offset: Offset(0, 18))],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              color: const Color(0x59004D40), // petroleum700 @ 35%
              borderRadius: radius,
              border: Border.all(color: const Color(0x47D4AF37)), // gold500 @ 28%
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}
