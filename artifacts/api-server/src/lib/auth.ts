import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "./env";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "./constants";
import { prisma } from "./prisma";

export type UserRole = "TEAM" | "ADMIN" | "VOLUNTEER";

export interface SessionUser {
  id: string;
  role: UserRole;
  name: string | null;
  teamId: string | null;
  sessionVersion?: number;
  deviceId?: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: SessionUser;
    }
  }
}

export function signSession(user: SessionUser): string {
  return jwt.sign(
    {
      role: user.role,
      name: user.name,
      teamId: user.teamId,
      ...(user.role === "TEAM"
        ? {
            sessionVersion: user.sessionVersion ?? 0,
            deviceId: user.deviceId,
          }
        : { sessionVersion: user.sessionVersion ?? 0 }),
    },
    env.jwtSecret,
    { subject: user.id, expiresIn: "24h", issuer: "watt-a-play-3-odeceee" },
  );
}

export function setSessionCookie(res: Parameters<RequestHandler>[1], token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Parameters<RequestHandler>[1]): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
  });
}

export function readSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: "watt-a-play-3-odeceee",
    }) as JwtPayload;
    if (
      typeof payload.sub !== "string" ||
      (payload.role !== "TEAM" &&
        payload.role !== "ADMIN" &&
        payload.role !== "VOLUNTEER")
    ) {
      return null;
    }
    if (
      payload.role === "TEAM" &&
      (!Number.isInteger(payload.sessionVersion) ||
        typeof payload.sessionVersion !== "number" ||
        typeof payload.deviceId !== "string")
    ) {
      return null;
    }
    if (
      payload.role !== "TEAM" &&
      payload.sessionVersion !== undefined &&
      (typeof payload.sessionVersion !== "number" ||
        !Number.isInteger(payload.sessionVersion))
    ) {
      return null;
    }
    return {
      id: payload.sub,
      role: payload.role,
      name: typeof payload.name === "string" ? payload.name : null,
      teamId: typeof payload.teamId === "string" ? payload.teamId : null,
      ...(payload.role === "TEAM"
        ? {
            sessionVersion: payload.sessionVersion as number,
            deviceId: payload.deviceId as string,
          }
        : { sessionVersion: (payload.sessionVersion as number | undefined) ?? 0 }),
    };
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const user = readSessionToken(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  if (user.role === "TEAM" && user.sessionVersion !== undefined) {
    const team = await prisma.team.findUnique({
      where: { id: user.id },
      select: { sessionVersion: true, deviceId: true },
    });
    if (
      !team ||
      team.sessionVersion !== user.sessionVersion ||
      team.deviceId !== user.deviceId
    ) {
      clearSessionCookie(res);
      res.status(401).json({ error: "This captain session is no longer active. Sign in again." });
      return;
    }
  } else {
    const account = await prisma.admin.findUnique({
      where: { id: user.id },
      select: { role: true, sessionVersion: true },
    });
    if (
      !account ||
      account.role !== user.role ||
      account.sessionVersion !== (user.sessionVersion ?? 0)
    ) {
      clearSessionCookie(res);
      res.status(401).json({ error: "This volunteer session is no longer active. Sign in again." });
      return;
    }
  }
  setSessionCookie(res, signSession(user));
  req.authUser = user;
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "You do not have permission to do that." });
      return;
    }
    next();
  };
}
