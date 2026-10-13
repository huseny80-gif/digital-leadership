# Verified instructor guide repair

Old private guide JSON is not teaching authority. The admin endpoint rebuilds
its response from the actual currently published files of the exact selected
lectures, checking file bytes, checksums, scope and canonical decision evidence.
It does not read question stems, topics or quotations from a saved legacy guide.

The `source-verified-instructor-v2` policy separates the study scenario,
source-proven teaching focus and short open discussion question. Quotations stay
in the independently expandable citation. Topic identity uses the verified
criterion rather than a PDF cover heading or a truncated paragraph. Source
conditions and numeric restrictions remain intact. URLs, unknown OCR fragments,
broken letters and incomplete or forged case evidence are rejected rather than
rewritten. A lecture without sufficient clear proof is explicitly reported as
unavailable; no topic or weakness is invented.

Guide preparation is labelled as using the **current lecture files**, also when
opened beside an older immutable quiz revision. The response is revalidated on
read and saved in the private guide cache after source-link and lecture-version
checks inside a transaction. A startup pass repairs legacy guides, including
archived selections. It does not generate additional exam groups or alter
historical summaries, question keys, scores or attempts.

Admin authorization and guide-table RLS remain unchanged. No guide fields are
included in learner group, quiz, attempt or export payloads. The frontend refuses
legacy policy or wrong-group responses, aborts requests when the selection
changes and resets the former panel/cache. An explicit recheck action fetches
fresh evidence after a lecture file update.

Regression verification covers the photographed AI week-one debris, two distinct
AI lecture contexts, source-reference integrity, invented topics, wrong digests,
OCR noise, old-guide cache repair, source replacement and checksum failure,
unchanged historical records, startup idempotency, RBAC, stale in-flight
responses, unavailable-source notices and current-file rechecks.
