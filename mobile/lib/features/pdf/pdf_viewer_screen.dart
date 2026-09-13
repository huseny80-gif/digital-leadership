import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/files_repository.dart';
import '../../widgets/states.dart';

enum _PdfState { idle, loading, error }

/// Secure PDF access screen (PHASE 10 §11 "Secure PDF Viewer").
///
/// The signed URL is requested only when the learner taps "Open PDF",
/// held ONLY in this widget's own `State` (never written to secure
/// storage, shared preferences, a database, or a log — grep this file:
/// there is no `print`/`debugPrint`/logging call anywhere in it), and
/// handed directly to the OS via [launchUrl] to open in the platform's
/// own PDF viewer/browser — never re-requested or reused past that one
/// hand-off. Every retry re-hits `GET /api/v1/files/:fileId`
/// (`FilesRepository`) for a fresh URL; there is no code path that
/// reuses, extends, or decodes a previously-issued one.
///
/// An in-app PDF rendering package (which would need to be verified
/// against a real Flutter build this environment cannot perform) was
/// deliberately not added — launching the OS's own PDF handler is lower
/// risk and needs no additional dependency (MOBILE_ARCHITECTURE.md
/// "Known Limitation").
class PdfViewerScreen extends StatefulWidget {
  const PdfViewerScreen({super.key, required this.fileId, required this.title});

  final String fileId;
  final String title;

  @override
  State<PdfViewerScreen> createState() => _PdfViewerScreenState();
}

class _PdfViewerScreenState extends State<PdfViewerScreen> {
  _PdfState _state = _PdfState.idle;
  String? _errorMessage;

  Future<void> _openPdf() async {
    setState(() {
      _state = _PdfState.loading;
      _errorMessage = null;
    });
    try {
      final repo = context.read<FilesRepository>();
      final signed = await repo.getSignedUrl(widget.fileId);
      final uri = Uri.parse(signed.url);
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!opened) {
        setState(() {
          _state = _PdfState.error;
          _errorMessage = 'Unable to open this PDF. Please try again.';
        });
        return;
      }
      setState(() => _state = _PdfState.idle);
    } on ApiException catch (e) {
      setState(() {
        _state = _PdfState.error;
        _errorMessage = e.toSafeMessage(context: 'this PDF');
      });
    } catch (_) {
      setState(() {
        _state = _PdfState.error;
        _errorMessage = 'Unable to open this PDF. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.picture_as_pdf_outlined, size: 56, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 16),
              Text(widget.title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              if (_state == _PdfState.loading) const LoadingIndicatorState(label: 'Requesting access…'),
              if (_state == _PdfState.error) ErrorContentState(message: _errorMessage!, onRetry: _openPdf),
              if (_state == _PdfState.idle)
                FilledButton.icon(
                  onPressed: _openPdf,
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Open PDF'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
