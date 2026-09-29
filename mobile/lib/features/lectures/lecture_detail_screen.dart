import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/content_repository.dart';
import '../../shared/models/file_metadata.dart';
import '../../shared/models/lecture.dart';
import '../../widgets/states.dart';
import '../pdf/pdf_viewer_screen.dart';

class _LectureDetail {
  const _LectureDetail(this.lecture, this.items);
  final Lecture lecture;
  final List<LectureItem> items;
}

const _itemTypeLabels = {
  'pdf': 'PDF',
  'summary': 'Summary',
  'assignment': 'Assignment',
  'exercise': 'Exercise',
};

/// Lecture detail (PHASE 10 §10) — `GET /api/v1/lectures/:id` +
/// `GET /api/v1/lectures/:id/items`. Renders only the existing content
/// types the schema defines (`DATABASE_DESIGN.md` §3's generalized
/// `lecture_items` model) — no new type invented. `assignment`/`exercise`
/// items show a read-only placeholder, matching the web app's Phase 9A
/// behavior exactly (no submission-tracking table exists — DECISIONS.md D23).
class LectureDetailScreen extends StatefulWidget {
  const LectureDetailScreen({super.key, required this.lectureId});

  final String lectureId;

  @override
  State<LectureDetailScreen> createState() => _LectureDetailScreenState();
}

class _LectureDetailScreenState extends State<LectureDetailScreen> {
  late Future<_LectureDetail> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_LectureDetail> _load() async {
    final repo = context.read<ContentRepository>();
    final lecture = await repo.getLecture(widget.lectureId);
    final items = await repo.listLectureItems(widget.lectureId);
    return _LectureDetail(lecture, items.data);
  }

  void _retry() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lecture')),
      body: FutureBuilder<_LectureDetail>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingIndicatorState(label: 'Loading lecture…');
          }
          if (snapshot.hasError) {
            if (snapshot.error is ApiException && (snapshot.error as ApiException).isNotFound) {
              return const EmptyContentState(title: 'Not found', message: "This lecture doesn't exist or is not available.");
            }
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).toSafeMessage(context: 'this lecture')
                : 'Unable to load this lecture. Please try again.';
            return ErrorContentState(message: message, onRetry: _retry);
          }
          final detail = snapshot.data!;
          return RefreshIndicator(
            onRefresh: () async => _retry(),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(detail.lecture.title, style: Theme.of(context).textTheme.headlineSmall),
                if (detail.lecture.description != null) ...[
                  const SizedBox(height: 4),
                  Text(detail.lecture.description!, style: Theme.of(context).textTheme.bodyMedium),
                ],
                const SizedBox(height: 16),
                if (detail.items.isEmpty)
                  const EmptyContentState(title: 'No content yet', message: 'Items will appear here once published.')
                else
                  ...detail.items.map(_buildItem),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildItem(LectureItem item) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(item.title, style: Theme.of(context).textTheme.titleSmall)),
                Chip(label: Text(_itemTypeLabels[item.itemType] ?? item.itemType), visualDensity: VisualDensity.compact),
              ],
            ),
            if (item.itemType == 'pdf') ...[
              const SizedBox(height: 8),
              FilledButton.icon(
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: const Text('View PDF'),
                onPressed: item.fileId == null
                    ? null
                    : () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => PdfViewerScreen(fileId: item.fileId!, title: item.title),
                          ),
                        ),
              ),
              if (item.fileId == null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('No file attached yet.', style: Theme.of(context).textTheme.bodySmall),
                ),
            ] else if (item.itemType == 'summary' && item.bodyText != null) ...[
              const SizedBox(height: 8),
              Text(item.bodyText!),
            ] else if (item.itemType == 'assignment' || item.itemType == 'exercise') ...[
              if (item.bodyText != null) ...[
                const SizedBox(height: 8),
                Text(item.bodyText!),
              ],
              const SizedBox(height: 8),
              Text(
                'Submitting ${item.itemType == 'assignment' ? 'assignments' : 'exercises'} is not available yet.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
