# Project Scope

This document defines what is IN SCOPE and OUT OF SCOPE for the overall project, and separates the MVP (first working release) from FUTURE FEATURES (post-MVP). Nothing here authorizes implementation — Phase 1 is planning-only (see IMPLEMENTATION_ROADMAP.md).

## IN SCOPE

- Web application (responsive: desktop, tablet, mobile browsers).
- Native iOS application.
- Native Android application.
- One shared backend serving all clients.
- One shared database.
- Authentication via Google OAuth, designed to allow additional auth methods later.
- Role-based authorization with Admin and User roles, designed to allow additional roles later.
- Educational content management: Subjects, Lectures, PDFs/resources, Summaries, Assignments, Exercises, Interactive Quizzes, Question Banks.
- File storage for PDFs and other educational resources, with access control.
- Administrative management console.
- Responsive UI across all supported form factors.
- Baseline security controls (see PROJECT_REQUIREMENTS.md, Security).
- Baseline accessibility (WCAG 2.1 AA target for web).

## OUT OF SCOPE (for now)

- Multi-tenancy / supporting multiple separate organizations or schools with data isolation.
- Payments, billing, or subscription management.
- Real-time collaboration features (live co-editing, live classrooms/video conferencing).
- Discussion forums, messaging, or social features between users.
- Offline-first data sync (beyond basic network-failure tolerance).
- Advanced analytics/BI dashboards beyond basic admin reporting.
- Non-Google authentication methods at launch (OTP/email, other OAuth providers) — planned but not built until a later phase.
- Additional roles beyond Admin/User at launch (e.g., Instructor) — planned but not built until a later phase.
- Third-party LMS integrations (e.g., SCORM, LTI).
- Native desktop applications (Windows/macOS/Linux) — desktop is covered via the responsive web app, not a separate native app.
- Localization / multi-language content (structure should not preclude it, but translation is not part of MVP).

## MVP (Minimum Viable Product)

The smallest end-to-end system that proves the core value: a learner can log in, consume content, and take a quiz; an admin can manage that content.

- Login via Google OAuth (web first; mobile apps follow once backend/auth is stable).
- Role-based access: Admin and User.
- Admin can create/edit/delete: Subjects, Lectures, PDFs, Summaries, Assignments, Exercises, Question Banks, Quizzes.
- User can browse Subjects → Lectures, view/download PDFs and Summaries, complete Assignments and Exercises, take Quizzes drawn from Question Banks, and see their own results.
- Responsive web application covering desktop, tablet, and mobile browsers.
- Secure file storage and retrieval for PDFs with access control.
- Core security controls: HTTPS, server-side authorization on every protected route/API, secret management, basic input validation.

## FUTURE FEATURES (post-MVP)

- Native iOS app (if not already delivered in the MVP timeline; treated as an early post-MVP milestone per the roadmap).
- Native Android app (same note as above).
- Additional authentication methods: OTP/email verification, other OAuth providers.
- Additional roles: Instructor/content-author role, possibly Moderator/Support.
- Advanced admin reporting/analytics (usage stats, quiz performance analytics, cohort views).
- Notifications (email/push) for new content, assignment deadlines, quiz results.
- Content versioning and revision history for educational materials.
- Search across all educational content.
- Accessibility enhancements beyond the AA baseline, and full localization/i18n.
- Any item listed under OUT OF SCOPE above, if later approved.
