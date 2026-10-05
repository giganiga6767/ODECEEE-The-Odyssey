import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import {
  AdminLoginBody,
  AdminLoginResponse,
  GetCurrentUserResponse,
  LogoutResponse,
  TeamLoginBody,
  TeamLoginResponse,
} from "@workspace/api-zod";
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  signSession,
} from "../lib/auth";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";

const router: IRouter = Router();
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Wait a little before trying again." },
});

router.post("/auth/team/login", loginLimit, async (req, res): Promise<void> => {
  const parsed = TeamLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const team = await prisma.team.findFirst({
    where: { name: { equals: parsed.data.teamName.trim(), mode: "insensitive" } },
  });
  if (!team || !(await bcrypt.compare(parsed.data.passcode, team.passcodeHash))) {
    res.status(401).json({ error: "The Fates Have Spoken: check the team name and passcode." });
    return;
  }

  const user = {
    id: team.id,
    role: "TEAM" as const,
    name: team.name,
    teamId: team.id,
    sessionVersion: team.sessionVersion,
  };
  setSessionCookie(res, signSession(user));
  res.json(TeamLoginResponse.parse({ user }));
});

router.post("/auth/admin/login", loginLimit, async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const admin = await prisma.admin.findUnique({
    where: { username: parsed.data.username },
  });
  const valid =
    parsed.data.username === env.adminUsername &&
    admin !== null &&
    (await bcrypt.compare(parsed.data.password, admin.passwordHash));
  if (!valid) {
    res.status(401).json({ error: "The Fates Have Spoken: those admin credentials were not recognized." });
    return;
  }

  const user = { id: admin.id, role: "ADMIN" as const, name: admin.username, teamId: null };
  setSessionCookie(res, signSession(user));
  res.json(AdminLoginResponse.parse({ user }));
});

router.post("/auth/logout", (_req, res): void => {
  clearSessionCookie(res);
  res.json(LogoutResponse.parse({ ok: true }));
});

router.get("/auth/me", requireAuth, (req, res): void => {
  res.json(GetCurrentUserResponse.parse({ user: req.authUser }));
});

export default router;
