# Academic podcast transport repair

The summary player failed because the legacy `speech.platform.bing.com`
synthesis WebSocket rejected its handshake with HTTP 403. The API correctly
returned 503, so both media playback and next-segment prefetch failed. Changing
the person, pitch, summary text or device speech engine could not repair this.

Synthesis now uses `api.msedgeservices.com/tts/cognitiveservices/websocket/v1`
and the public Read Aloud client identifier in `Ocp-Apim-Subscription-Key`.
No paid subscription key or account credential is embedded. The voice list and
actual Iraqi male/female persons remain unchanged, as do 24 kHz / 96 kbps MP3,
source-bound narration, vocalization, chapter pauses and adjustable playback.
The SSML frame includes the protocol's trailing `Z` timestamp. A 403 with an
HTTPS server Date gets exactly one clock-corrected retry; no voice is silently
substituted. Attempts have 10-second handshake and 25-second total limits.

Completed audio must contain two complete consecutive MPEG Layer III frames
before being cached or returned. Empty, HTML/error, malformed, oversized or
truncated output is rejected. Startup readiness logs expose only voice IDs,
byte counts and safe failure categories/status codes, never text, URLs or keys.
Every content audio request still requires a verified learner/guest principal
and a visible archive/chapter in the requested subject before cache access.
Private response headers and Safari byte-range support are unchanged.

Unit tests cover handshake parameters, framing, completion, payload validation,
timeouts, a bounded clock retry and safe diagnostics. `Academic podcast smoke`
builds the actual adapter, synthesizes a fixed public Arabic sentence for all
six voices and checks actual MP3 decoding with ffprobe. It needs no production
secrets or learner data and can be rerun manually when diagnosing a provider.
Production startup probes verify both Iraqi voices from the deployed Railway
region; a successful CI connection alone is not production readiness evidence.
