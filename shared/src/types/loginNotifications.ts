/** Admin-only login activity. Session credentials and learner contact details
 * are deliberately absent from this contract. */
export interface LoginNotification {
  id: string;
  kind: "trainee" | "visitor";
  displayName: string;
  enteredAt: string;
  read: boolean;
}

export interface LoginNotificationsFeed {
  items: LoginNotification[];
  /** Count across all unread entries, including entries beyond the latest 20. */
  unreadCount: number;
  /** Server entry watermark from this snapshot, used when marking read. */
  latestId: string | null;
}

export interface LearnerEntryResult {
  /** False for a duplicate, a staff session, or a token without a stable login session. */
  recorded: boolean;
}

export interface MarkLoginNotificationsReadInput {
  throughId: string;
}
