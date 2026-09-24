import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/networking/api_exception.dart';
import '../../shared/api/content_repository.dart';
import '../../shared/models/lecture.dart';
import '../../shared/models/subject.dart';
import '../../widgets/states.dart';
import '../assessments/subject_assessments_screen.dart';
import '../lectures/lecture_detail_screen.dart';

class _SubjectDetail {
  const _SubjectDetail(this.subject, this.lectures);
  final Subject subject;
  final List<Lecture> lectures;
}

/// Subject detail (PHASE 10 §9) — `GET /api/v1/subjects/:id` +
/// `GET /api/v1/subjects/:id/lectures`. A real-but-invisible subject
/// (draft, non-admin caller) 404s identically to a nonexistent one
/// (SECURITY_ARCHITECTURE.md §13) — this screen shows the same
/// not-found state for both.
class SubjectDetailScreen extends StatefulWidget {
  const SubjectDetailScreen({super.key, required this.subjectId});

  final String subjectId;

  @override
  State<SubjectDetailScreen> createState() => _SubjectDetailScreenState();
}

class _SubjectDetailScreenState extends State<SubjectDetailScreen> {
  late Future<_SubjectDetail> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_SubjectDetail> _load() async {
    final repo = context.read<ContentRepository>();
    final subject = await repo.getSubject(widget.subjectId);
    final lectures = await repo.listLectures(widget.subjectId);
    return _SubjectDetail(subject, lectures.data);
  }

  void _retry() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Subject')),
      body: FutureBuilder<_SubjectDetail>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingIndicatorState(label: 'Loading subject…');
          }
          if (snapshot.hasError) {
            if (snapshot.error is ApiException && (snapshot.error as ApiException).isNotFound) {
              return const EmptyContentState(
                title: 'Not found',
                message: "This subject doesn't exist or is not available.",
              );
            }
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).toSafeMessage(context: 'this subject')
                : 'Unable to load this subject. Please try again.';
            return ErrorContentState(message: message, onRetry: _retry);
          }
          final detail = snapshot.data!;
          return RefreshIndicator(
            onRefresh: () async => _retry(),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(detail.subject.title, style: Theme.of(context).textTheme.headlineSmall),
                if (detail.subject.description != null) ...[
                  const SizedBox(height: 4),
                  Text(detail.subject.description!, style: Theme.of(context).textTheme.bodyMedium),
                ],
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  icon: const Icon(Icons.quiz_outlined),
                  label: const Text('View Assessments'),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => SubjectAssessmentsScreen(subjectId: widget.subjectId, subjectTitle: detail.subject.title),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text('Lectures', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (detail.lectures.isEmpty)
                  const EmptyContentState(title: 'No lectures yet', message: 'Lectures will appear here once published.')
                else
                  ...detail.lectures.map(
                    (lecture) => Card(
                      child: ListTile(
                        title: Text(lecture.title),
                        subtitle: lecture.description != null ? Text(lecture.description!) : null,
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => LectureDetailScreen(lectureId: lecture.id)),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
