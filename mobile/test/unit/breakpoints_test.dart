import 'package:digital_leadership/core/responsive/breakpoints.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Breakpoints', () {
    test('classifies phone widths as mobile', () {
      expect(Breakpoints.isMobileWidth(360), isTrue);
      expect(Breakpoints.isTabletWidth(360), isFalse);
      expect(Breakpoints.isDesktopWidth(360), isFalse);
    });

    test('classifies tablet widths as tablet', () {
      expect(Breakpoints.isMobileWidth(700), isFalse);
      expect(Breakpoints.isTabletWidth(700), isTrue);
      expect(Breakpoints.isDesktopWidth(700), isFalse);
    });

    test('classifies wide widths as desktop', () {
      expect(Breakpoints.isMobileWidth(1280), isFalse);
      expect(Breakpoints.isTabletWidth(1280), isFalse);
      expect(Breakpoints.isDesktopWidth(1280), isTrue);
    });

    test('boundaries are inclusive on the lower edge of each tier', () {
      expect(Breakpoints.isTabletWidth(Breakpoints.tablet), isTrue);
      expect(Breakpoints.isMobileWidth(Breakpoints.tablet), isFalse);
      expect(Breakpoints.isDesktopWidth(Breakpoints.desktop), isTrue);
      expect(Breakpoints.isTabletWidth(Breakpoints.desktop), isFalse);
    });
  });
}
