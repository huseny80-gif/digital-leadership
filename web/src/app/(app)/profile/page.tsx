import type { UserProfile } from "@shared/index";
import { apiGet } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { ErrorState } from "@/components/ui/States";

export const metadata = { title: "Profile | Digital Leadership" };

/**
 * Profile page (API_V1.md `GET /me`). Always the authenticated caller's
 * own profile — there is no ID parameter anywhere in this route to
 * substitute another user's ID into (AUTHENTICATION_TEST_PLAN.md "cannot
 * impersonate another user").
 */
export default async function ProfilePage() {
  let profile: UserProfile | null = null;
  let errorMessage: string | null = null;

  try {
    const { data } = await apiGet<UserProfile>("/api/v1/me");
    profile = data;
  } catch (err) {
    errorMessage = toSafeErrorMessage(err, "your profile").message;
  }

  if (errorMessage || !profile) {
    return <ErrorState message={errorMessage ?? "Unable to load your profile. Please try again."} retryHref="/profile" />;
  }

  return (
    <section>
      <h1 className="page-heading">Profile</h1>
      <dl className="item-list">
        <div className="item-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <dt className="item-row-meta">Name</dt>
          <dd className="item-row-title">{profile.displayName}</dd>
        </div>
        <div className="item-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <dt className="item-row-meta">Email</dt>
          <dd className="item-row-title">{profile.email}</dd>
        </div>
        <div className="item-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <dt className="item-row-meta">Role</dt>
          <dd className="item-row-title" style={{ textTransform: "capitalize" }}>
            {profile.role}
          </dd>
        </div>
      </dl>
    </section>
  );
}
