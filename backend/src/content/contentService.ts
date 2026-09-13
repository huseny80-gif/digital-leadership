import type { Subject } from "@shared/index";
import type { ContentRepository } from "./contentRepository.js";

/**
 * Business logic for educational content. Route handlers call this layer;
 * this layer calls the repository — routes never touch data access
 * directly (ARCHITECTURE.md §3 module separation).
 */
export class ContentService {
  constructor(private readonly repository: ContentRepository) {}

  async listSubjectsVisibleToCurrentUser(): Promise<Subject[]> {
    // Phase 7 will add role-aware filtering here (e.g., admins also see
    // drafts) on top of the repository's published-only query.
    return this.repository.listPublishedSubjects();
  }
}
