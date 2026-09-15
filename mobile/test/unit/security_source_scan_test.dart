import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// PHASE 10 §23 "Security Requirements": static scan of `lib/` for
/// anything that must never be present — a service-role key, a backend
/// secret, a database password, an OAuth client secret, or answer-key
/// data. Mirrors the equivalent scans already established for the web
/// app (`web/tests/unit/noServiceRoleKeyInClient.test.ts`,
/// `web/tests/unit/answerKeyLeakage.test.ts`).
List<File> _dartFilesUnder(Directory dir) {
  return dir
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList();
}

/// Strips `///` and `//` line comments so a scan below matches real code,
/// not prose that merely explains a field's deliberate absence (the same
/// false-positive this project already hit and fixed for the equivalent
/// web scans — `web/tests/unit/answerKeyLeakage.test.ts`,
/// `web/tests/unit/pdfSecurity.test.ts`).
String _stripLineComments(String source) {
  return source
      .split('\n')
      .map((line) {
        final index = line.indexOf('//');
        return index == -1 ? line : line.substring(0, index);
      })
      .join('\n');
}

void main() {
  final libDir = Directory('lib');

  test('lib/ contains no service-role key, database password, or OAuth client secret reference', () {
    final forbidden = RegExp(r'SERVICE_ROLE|service_role|DATABASE_PASSWORD|OAUTH_CLIENT_SECRET|CLIENT_SECRET', caseSensitive: false);
    final offenders = _dartFilesUnder(libDir)
        .where((f) => forbidden.hasMatch(_stripLineComments(f.readAsStringSync())))
        .toList();
    expect(offenders, isEmpty, reason: 'Found forbidden secret reference in: ${offenders.map((f) => f.path).join(', ')}');
  });

  test('lib/ contains no answer-key field (is_correct / isCorrect) outside of comments', () {
    final forbidden = RegExp('is_correct|isCorrect', caseSensitive: false);
    final offenders = _dartFilesUnder(libDir)
        .where((f) => forbidden.hasMatch(_stripLineComments(f.readAsStringSync())))
        .toList();
    expect(offenders, isEmpty, reason: 'Found answer-key reference in: ${offenders.map((f) => f.path).join(', ')}');
  });

  test('no Dart source file logs (print/debugPrint) inside the PDF viewer or quiz attempt screens', () {
    // A signed URL / in-progress answer state must never be logged
    // (PHASE 10 §11/§13). These two files are the ones that ever hold
    // either value.
    final sensitiveFiles = [
      File('lib/features/pdf/pdf_viewer_screen.dart'),
      File('lib/features/assessments/quiz_attempt_screen.dart'),
    ];
    for (final file in sensitiveFiles) {
      expect(file.existsSync(), isTrue, reason: '${file.path} should exist');
      final content = file.readAsStringSync();
      expect(content, isNot(matches(RegExp(r'\bprint\s*\(|debugPrint\s*\('))));
    }
  });

  test('the API client source contains no hardcoded production URL/credential', () {
    final content = File('lib/core/networking/api_client.dart').readAsStringSync();
    expect(content, isNot(contains('https://')));
  });
}
