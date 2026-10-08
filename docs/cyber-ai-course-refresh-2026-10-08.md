# AI and cybersecurity course refresh — 2026-10-08

Follow-up: the shared folder has since been downloaded through OneDrive's public browser interface. All five courses and 24 original PDFs are covered by [the source review](onedrive-source-review-2026-10-08.md); the access failure below describes the earlier refresh only.

The two courses now use Arabic lecture, PDF and presentation names, with separate lecture navigation and current quiz editions that include all available questions for each lecture. Existing lecture IDs, original files, reviewed questions, answer keys, grades and unfinished attempts are preserved. Duplicate legacy containers are archived only when their source identity is unambiguous; different source files remain available under the selected lecture.

## Sources and scope

- The approved Finquiz catalog and the existing AI assessment review dated 2026-10-06 are the sources for this refresh. The latter contains 100 previously checked questions and verbatim citations; its content and checksums are unchanged.
- The shared first/second AI PDF remains one original file available to both lectures. The solutions guide for lectures one through four is a separate resource. The distinct uploaded fourth-lecture PDFs are retained, with the inspected main-file checksum identifying the preferred lecture container.
- The NIST PDF explicitly identifies itself as the third cybersecurity lecture. Its old second-lecture order is corrected without changing source bytes or permanent download IDs.
- The former incident-response demo has no approved second-lecture source in the bundled catalog. On existing installations, it becomes a draft only if the entire corresponding slot has neither an active file nor supplied source text. Questions from that empty template are omitted from new quiz editions; old editions and all attempts remain intact. A trainer's real replacement source prevents this withdrawal.
- The ISO 27001 certification roadmap remains a separate cybersecurity lecture. Standard numbers are never interpreted as lecture numbers.
- The shared OneDrive folder returned HTTP 403 on 2026-10-08. This change does not claim to import newer files from that inaccessible folder.

## File integrity

Five actual bundled files are renamed; their SHA-256 values remain unchanged:

| Source ID | Arabic file | SHA-256 |
| --- | --- | --- |
| cae05b9640b56a01c8bf42c9 | المحاضرتان الأولى والثانية في الذكاء الاصطناعي.pdf | 1238ee6a29ca7a835154323915df2e8cb8cbaad122a420906110a7c54ada1095 |
| c71268af93d9b8497abc489d | المحاضرة الأولى في حوكمة الأمن السيبراني.pdf | f9d4c4665e3b3ed6084ead681d222c9397063600fd92e74735ee09b091e418ae |
| df0946f8b2c16118ff75b278 | المحاضرة الثالثة في حوكمة الأمن السيبراني.pdf | 0c91653e8afe2aa80f910c9040c5a994f59d3bed6f9ae16184915fc654ab1828 |
| 5c9e9cdbc978ce812679b0b3 | المحاضرة الثالثة في حوكمة الأمن السيبراني.pptx | f453083ea9ba6438badce0bdd9afeb2ef2d146f02d548d8518beb8a831bb0c2d |
| cd732cc944d300fd90c2dcef | المحاضرة الرابعة في حوكمة الأمن السيبراني.pdf | b2c10f2ccae2d4102ff73a0a7cfcfcaad5511a0cecac42e04ffff9f5cd6b15bd |

## Runtime behavior and validation

`refreshStudyCourses` runs after the existing source synchronization and protected reviews at production startup. Its transactions follow the import worker's job-row/subject lock order. Rename provenance is stored in administrator-only audit records; exact question content and answer rows are not rewritten. Consolidation shares the previously tested legal-course implementation, with profile-specific labels and exact-checksum preferences.

Lecture quiz refreshes preserve previous editions, question IDs, point overrides, deadlines and time limits. Repeated starts do not produce duplicate editions. Import result links follow the current canonical lecture and quiz. Future recognized uploads reuse the Arabic numbered lecture; manually selected lecture IDs and unrelated instructor titles remain respected.

Automated checks cover strict label parsing, guide/range/ISO exclusions, permanent downloads and source checksums, hidden-source authorization, distinct lecture routes, duplicate consolidation, original answer rows and graded attempts, progress transfer, two different fourth-lecture files, a real second cyber source, idempotency and future NIST imports. The existing legal consolidation and independent sixth-lecture integration suites also pass unchanged.

Production startup logs emit counts under `study_courses_content_refreshed`, including duplicate/skipped lecture numbers, current questions, published quiz counts, cross-subject inconsistencies, empty published quizzes and failed import counts. No participant content or answer keys are included in these logs.

The live rollout exposed legacy question UUIDs that differ from the current importer's stable IDs. Unmapped questions in the current source quiz can also be linked by their exact source prompt and type, without overriding an existing instructor mapping. Re-imported AI source copies reuse the already approved review only when the historical original fingerprint, unchanged copy keys, reviewed target keys and exact source checksums all agree. New editions preserve question weights and old memberships; conflicting teacher weights are left untouched. Unmapped-question counts and bounded failed-source metadata support verification of the live result.
