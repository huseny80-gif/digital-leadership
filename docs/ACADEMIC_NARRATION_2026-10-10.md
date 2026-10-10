# Academic Arabic podcast

The exam summary player uses actual neural MP3 narration instead of installed browser voices. Six distinct personas are offered, including Iraqi Bassel and Rana. Default playback is 1.1×; changing speed preserves pitch and the current position.

The shared narration builder removes display markup, preserves numbers, negation and existing diacritics, vocalizes a conservative vocabulary and contextual ambiguous phrases, and expands known abbreviations only for speech. It leaves the archived source summary unchanged. Titles, headings, prose and chapter endings have separate measured pauses.

The backend Edge Read Aloud adapter uses the public client protocol over verified TLS. No account credential is embedded. The service may change or become temporarily unavailable; failures are retryable and never fall back to a fabricated/device voice. The adapter is isolated for future provider replacement.

Every MP3 request rechecks the verified learner/guest session, course, archive and lecture visibility before accessing a bounded content-addressed cache. Clients send only archive/chapter/segment/voice identifiers; arbitrary text and ownership overrides are rejected. The Next.js binary proxy forwards the verified session and supports single byte ranges. Audio responses are private and not stored in shared HTTP caches.

The player starts the media element within the user gesture, prefetches one segment, preserves timed gaps through pause/resume, aborts stale requests and revokes temporary object URLs. A production startup probe verifies the Iraqi personas using a fixed public sentence after the server starts, without blocking readiness or logging lecture text.

Validation includes real MP3 generation for all six personas, native browser decoding/playback on mobile/tablet widths in both themes, playback/voice/rate/cleanup tests, conservative text tests, bounded cache tests, and authenticated source/byte-range integration tests.
