import 'package:flutter/material.dart';

/// Material 3 theme (PHASE 10 §17 "UI / Design"). Colors mirror the web
/// app's design tokens (`web/src/app/globals.css` — `--color-primary:
/// #1e3a5f`, `--color-accent: #2f6fed`) so the two clients read as the
/// same product, rather than introducing unrelated branding. This is a
/// brand-new palette choice for this platform, not anything copied from
/// or resembling the old "quiz digital leadership.html" project, which
/// this phase never inspected or reused.
abstract final class AppTheme {
  static const _primary = Color(0xFF1E3A5F);
  static const _accent = Color(0xFF2F6FED);

  static ThemeData light() {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: _primary,
      primary: _primary,
      secondary: _accent,
      brightness: Brightness.light,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFFF7F8FA),
      appBarTheme: const AppBarTheme(centerTitle: false, elevation: 0),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: colorScheme.outlineVariant),
        ),
      ),
      inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
    );
  }

  static ThemeData dark() {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: _primary,
      secondary: _accent,
      brightness: Brightness.dark,
    );
    return ThemeData(useMaterial3: true, colorScheme: colorScheme);
  }
}
