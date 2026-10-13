# Legal summary and podcast source review

The legal study view previously reused long OCR fragments as a summary. Scan
watermarks, numeric scanner artefacts and edge marks could reach both the view
and speech. A sideways page in lecture two also lost readable content. This
repair addresses the text the podcast reads; it does not merely hide its error.

`legalAcademicReadings.json` contains reviewed academic readings for the exact
six original PDF editions. The passages were checked against rendered source
pages, with spelling/punctuation and OCR number corrections. Content is organized
into 64 topics, without copying scan metadata, bibliography, question appendices
or invented explanations. Physical PDF page references include cover pages.
In particular the source review checks law 78/2012, civil law 40/1951, articles
204/205/219, the real-estate rental exception, conditions for signature validity,
liability qualifications and the lecture-six distinction between act, result
and causation. The record is an explicit, reviewable content edition; no LLM is
asked to guess unreadable words, complete a page or add material.

The server checks original PDF bytes, digest, size, catalog ownership and lecture
number. A returned section uses this reviewed edition only if the archived
grounding records exactly one matching source checksum for that lecture. An
additional/replaced source or an ungrounded archive does not inherit unrelated
content. New source editions still follow the existing source-extraction path;
this fixed review never silently discards newly added source material.

Both newly generated groups and matching existing bookmarked groups return the
reviewed study view. Original PDFs, extraction caches, stored archive snapshots,
quiz IDs, option keys, grades and attempts remain unchanged. No new exam groups
are created by this repair. Narration, concept maps, preview, narration download
and PDF export all consume the same returned summary. Citations are visible and
printed but are excluded from the spoken text. Exact repeated study points are
not appended to narration. A corrected narration remounts the player to release
prefetched audio from the former content, preserving the user's voice/rate.

Shared scan-layout cleanup removes identifiable watermarks and neighboring page
marks while keeping original line coordinates, legal numbers, dates, negation
and substantive material about scanning. Legal vocabulary is conservatively
vocalized; signer pronunciation changes only in explicit signature contexts,
so an ordinary website is not pronounced as a signer.

Verification covers real original file hashes/page counts, selection isolation,
replaced/additional sources, verified legal numbers/exceptions, noise exclusion,
nonrepeating narration, retained citations and stale audio release. PostgreSQL
integration checks preserve the archived row, answer keys and a graded attempt,
and require normal hidden/wrong-course access restrictions. Live audio smoke
synthesizes one actual corrected curriculum passage per lecture with alternating
Iraqi male/female voices and decodes each MP3 with ffprobe. Production startup
logs file verification and inspects the exact returned published study views;
it creates no fake trainee or attempt and logs only counts and content digests.
