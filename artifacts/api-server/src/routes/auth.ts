import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
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
import { logger } from "../lib/logger";

const router: IRouter = Router();
const loginLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many tries, wait a minute." },
});
const codeAttempts = new Map<string, { count: number; expiresAt: number }>();

function getDeviceId(value: string) {
  return value.trim();
}

function normalizedCode(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

function isValidAccessCode(value: string) {
  // Existing issued codes may contain visually ambiguous characters; new codes do not.
  return /^[A-Z0-9]{8}$/.test(value);
}

router.post("/auth/team/login", loginLimit, async (req, res): Promise<void> => {
  const parsed = TeamLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const code = normalizedCode(parsed.data.code);
  const deviceId = getDeviceId(parsed.data.deviceId);
  if (!isValidAccessCode(code) || deviceId.length < 8) {
    res.status(401).json({ error: "That code isn't recognised. Check it against your slip." });
    return;
  }

  const now = Date.now();
  for (const [key, value] of codeAttempts) {
    if (value.expiresAt <= now) codeAttempts.delete(key);
  }
  const codeKey = createHash("sha256").update(code).digest("hex");
  const attempt = codeAttempts.get(codeKey);
  const nextAttempt = {
    count: attempt && attempt.expiresAt > now ? attempt.count + 1 : 1,
    expiresAt: attempt && attempt.expiresAt > now ? attempt.expiresAt : now + 60 * 60 * 1000,
  };
  codeAttempts.set(codeKey, nextAttempt);
  if (nextAttempt.count > 20) {
    res.status(429).json({ error: "Too many tries, wait a minute." });
    return;
  }

  const legacyCode = `${code.slice(0, 4)}-${code.slice(4)}`;
  const candidates = await prisma.team.findMany({
    where: { OR: [{ codeHint: code.slice(0, 2) }, { codeHint: "" }] },
  });
  let team = null;
  for (const candidate of candidates) {
    if (
      (await bcrypt.compare(legacyCode, candidate.passcodeHash)) ||
      (await bcrypt.compare(code, candidate.passcodeHash))
    ) {
      team = candidate;
      break;
    }
  }
  if (!team) {
    logger.warn({ ip: req.ip }, "Failed team access-code attempt");
    res.status(401).json({ error: "That code isn't recognised. Check it against your slip." });
    return;
  }

  const captainName = parsed.data.leaderName?.trim();
  const userAgent = req.get("user-agent")?.slice(0, 300) ?? null;
  if (team.deviceId && team.deviceId !== deviceId) {
    res.status(409).json({
      error:
        "This team's captain is already signed in on another phone. Only one phone per team. If that phone is lost or dead, ask an organiser to release the login.",
      code: "DEVICE_ALREADY_CLAIMED",
    });
    return;
  }
  if (!team.deviceId && !captainName) {
    res.status(409).json({
      error: "Enter the captain's name to claim this team's code.",
      code: "NEEDS_LEADER_NAME",
    });
    return;
  }

  if (!team.deviceId) {
    const claim = await prisma.team.updateMany({
      where: { id: team.id, deviceId: null },
      data: {
        deviceId,
        leaderName: captainName,
        claimedAt: new Date(),
        lastLoginAt: new Date(),
        userAgent,
        sessionVersion: { increment: 1 },
      },
    });
    if (claim.count === 0) {
      team = await prisma.team.findUnique({ where: { id: team.id } });
    } else {
      team = await prisma.team.findUnique({ where: { id: team.id } });
    }
  } else {
    await prisma.team.update({
      where: { id: team.id },
      data: { lastLoginAt: new Date(), userAgent },
    });
    team = await prisma.team.findUnique({ where: { id: team.id } });
  }

  if (!team || team.deviceId !== deviceId) {
    res.status(409).json({
      error:
        "This team's captain is already signed in on another phone. Only one phone per team. If that phone is lost or dead, ask an organiser to release the login.",
      code: "DEVICE_ALREADY_CLAIMED",
    });
    return;
  }

  const user = {
    id: team.id,
    role: "TEAM" as const,
    name: team.leaderName ?? team.name,
    teamId: team.id,
    sessionVersion: team.sessionVersion,
    deviceId,
  };
  setSessionCookie(res, signSession(user));
  res.json(TeamLoginResponse.parse({ user: { ...user, name: team.name } }));
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
