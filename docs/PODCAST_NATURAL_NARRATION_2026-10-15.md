# Connected academic narration

The podcast uses neural synthesized voices, not recordings made by a real
person. The six existing voices, including Iraqi male and female voices,
remain available. Voice selection still changes the actual provider voice;
playback preserves pitch and defaults to the provider's natural speed (1×).
Saved listener speed and voice preferences remain respected.

Narration now groups headings and paragraphs into a connected clip of up to
1,800 characters instead of making a separate request for every heading,
paragraph and 650-character fragment. Sentence boundaries come first, then
clause boundaries. A forced split of a long sentence does not add a full stop
or an artificial pause. Short headings stay beside their following paragraph
when possible. Source words, numbers, negation and order remain unchanged;
only the existing conservative pronunciation preparation is applied.

Punctuation supplies natural pauses inside the clip. The Read Aloud transport
accepts its voice/prosody envelope but closes synthesis when custom SSML break
tags are added; no unsupported style or break markup is sent. Explicit pauses
are scheduled only between complete clips, with a longer pause between
chapters. The player continues to buffer the next clip and retains its Safari
user-gesture, cancellation, pause/resume and authorization behavior.

The narration version is bumped to invalidate previously generated clips.
Authorized archives derive their narration on read, so existing summaries
receive the improved delivery without regenerating or changing their content,
quizzes, archived attempts or source citations.

Validation includes source preservation and long-sentence tests, media-player
tests (natural default, saved preferences, buffered continuation, cancellation),
and actual MP3 synthesis/ffprobe decoding for all six voices using a fixed
public paragraph. Production startup probes use the same connected paragraph
for both Iraqi voices. These checks establish functioning audio; they do not
constitute a human listening assessment or a claim of real-person recording.
