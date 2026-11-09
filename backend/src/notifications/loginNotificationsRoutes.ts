import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/authInstance.js";
import { getPool } from "../lib/db.js";
import { ValidationError } from "../lib/validation.js";
import { LoginNotificationsRepository, type LoginNotificationsStore } from "./loginNotificationsRepository.js";

const readSchema = z.object({ throughId: z.string().uuid() }).strict();

export function loginNotificationsRoutes(
  getStore: () => Pick<LoginNotificationsStore, "feed" | "acknowledge"> = () => new LoginNotificationsRepository(getPool()),
): Router {
  const router = Router();
  // Retain a local boundary as well as the central /admin mount: the router
  // stays protected when composed alone by tests or future callers.
  router.use(requireAdmin, (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.get("/", async (req, res, next) => {
    try {
      res.json({ data: await getStore().feed(req.user!.id) });
    } catch (error) { next(error); }
  });
  router.post("/read", async (req, res, next) => {
    try {
      const parsed = readSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("معرّف الإشعار غير صالح.");
      await getStore().acknowledge(req.user!.id, parsed.data.throughId);
      res.json({ data: { recorded: true } });
    } catch (error) { next(error); }
  });
  return router;
}
