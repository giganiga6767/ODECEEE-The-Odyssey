import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "./env";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "./constants";
import { prisma } from "./prisma";

export type UserRole = "TEAM" | "ADMIN";

export interface SessionUser {
  id: string;
  role: UserRole;
  name: string | null;
  teamId: string | null;
  sessionVersion?: number;
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
      ...(user.role === "TEAM" ? { sessionVersion: user.sessionVersion ?? 0 } : {}),
    },
    env.jwtSecret,
    { subject: user.id, expiresIn: "12h", issuer: "odeceee-the-odyssey" },
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
      issuer: "odeceee-the-odyssey",
    }) as JwtPayload;
    if (
      typeof payload.sub !== "string" ||
      (payload.role !== "TEAM" && payload.role !== "ADMIN")
    ) {
      return null;
    }
    if (
      payload.role === "TEAM" &&
      (!Number.isInteger(payload.sessionVersion) || typeof payload.sessionVersion !== "number")
    ) {
      return null;
    }
    return {
      id: payload.sub,
      role: payload.role,
      name: typeof payload.name === "string" ? payload.name : null,
      teamId: typeof payload.teamId === "string" ? payload.teamId : null,
      ...(payload.role === "TEAM"
        ? { sessionVersion: payload.sessionVersion as number }
        : {}),
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
      select: { sessionVersion: true },
    });
    if (!team || team.sessionVersion !== user.sessionVersion) {
      res.status(401).json({ error: "This team session has been reset. Sign in again." });
      return;
    }
  }
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
