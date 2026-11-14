import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme/theme.css";
import { App } from "./App";
import { registerServiceWorker } from "./pwa/registerServiceWorker";
import { AuthConfigError, createSeismicSupabase } from "./auth/session";

let getToken = async (): Promise<string | null> => null;
try {
  const supabase = createSeismicSupabase({ url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY });
  getToken = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;
} catch (e) {
  // Demo mode: the simulation runs without auth; sync calls go unauthenticated.
  if (!(e instanceof AuthConfigError)) throw e;
  console.info("[seismic] Supabase not configured — running in demo mode");
}

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");
createRoot(root).render(
  <StrictMode>
    <App getToken={getToken} />
  </StrictMode>,
);
void registerServiceWorker();
