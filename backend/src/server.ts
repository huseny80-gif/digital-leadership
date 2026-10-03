import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { initMonitoring } from "./lib/monitoring.js";
import { synchronizeFinquizCore } from "./finquiz/synchronizeCore.js";
import { getPool } from "./lib/db.js";

initMonitoring();

const env = getEnv();
const app = createApp();

if (env.NODE_ENV === "production" && env.DATABASE_URL) {
  const result = await synchronizeFinquizCore(getPool());
  logger.info(result, "finquiz_core_content_synchronized");
}

// Bind explicitly to 0.0.0.0 — Railway's healthcheck prober connects over
// IPv4 to 0.0.0.0:$PORT; without an explicit host, Node's platform default
// can resolve to an IPv6-only or loopback-only bind that the process
// itself sees as "listening" but the prober can never reach.
app.listen(env.PORT, "0.0.0.0", () => {
  logger.info({ port: env.PORT }, "backend_listening");
});
