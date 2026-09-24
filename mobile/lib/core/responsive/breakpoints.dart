import 'package:flutter/widgets.dart';

/// Responsive foundation (PHASE 11 §4H). Pure width-based checks so this
/// logic is testable without a widget pump — the same thresholds are used
/// by [isDesktop]/[isTablet]/[isMobile] (BuildContext convenience) and by
/// unit tests (`test/unit/breakpoints_test.dart`) that call the `*Width`
/// functions directly.
///
/// One Flutter codebase serves mobile, tablet, and desktop/web by
/// switching layout at these widths — not by branching into separate
/// applications (PHASE 11 §4H, §7 "no second competing Flutter application").
abstract final class Breakpoints {
  static const double tablet = 600;
  static const double desktop = 1024;

  static bool isMobileWidth(double width) => width < tablet;
  static bool isTabletWidth(double width) => width >= tablet && width < desktop;
  static bool isDesktopWidth(double width) => width >= desktop;

  static bool isMobile(BuildContext context) => isMobileWidth(MediaQuery.sizeOf(context).width);
  static bool isTablet(BuildContext context) => isTabletWidth(MediaQuery.sizeOf(context).width);
  static bool isDesktop(BuildContext context) => isDesktopWidth(MediaQuery.sizeOf(context).width);
}
