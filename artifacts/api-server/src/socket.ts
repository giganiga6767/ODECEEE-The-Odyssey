import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { SessionUser } from "./lib/auth";
import { readSessionToken } from "./lib/auth";
import { GAME, SESSION_COOKIE } from "./lib/constants";
import { distanceMeters } from "./lib/haversine";
import {
  getEventStatus,
  getSettings,
  getTeamGameState,
  loadAdminOverview,
  loadAdminTeam,
  loadAdminTeams,
  advancePastInactiveCheckpoints,
} from "./lib/game-service";
import { ArrivePayloadSchema, LocationUpdateSchema } from "./lib/socket-schemas";
import { prisma } from "./lib/prisma";
import { emitToAdmins, emitToTeam, setRealtimeServer } from "./lib/realtime";
import { logger } from "./lib/logger";

type ClientSocket = Socket & {
  data: {
    odysseyUser?: SessionUser;
    lastActionAt?: number;
  };
};

const qualifyingPings = new Map<string, number>();

function tokenFromCookies(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const pair = header
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  return pair?.slice(SESSION_COOKIE.length + 1);
}

function canEmit(socket: ClientSocket): boolean {
  const now = Date.now();
  if (
    socket.data.lastActionAt &&
    now - socket.data.lastActionAt < GAME.socketRateLimitMs
  ) {
    socket.emit("error:flagged", {
      message: "The Siren asks for a moment between signals.",
    });
    return false;
  }
  socket.data.lastActionAt = now;
  return true;
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function sendAdminSnapshot(socket: ClientSocket) {
  const [overview, teams] = await Promise.all([
    loadAdminOverview(),
    loadAdminTeams(),
  ]);
  socket.emit("admin:snapshot", { overview, teams });
}

async function captureCurrentCheckpoint(
  teamId: string,
  position: { lat: number; lng: number; accuracy: number },
) {
  const status = await getEventStatus();
  if (status !== "ACTIVE") return null;

  const [team, settings] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      include: {
        routes: {
          include: { checkpoint: true },
          orderBy: { orderIndex: "asc" },
        },
      },
    }),
    getSettings(),
  ]);
  if (!team || team.status !== "ACTIVE") return null;

  let current = team.routes.find(
    (route) => route.orderIndex === team.currentIndex,
  );
  if (!current || !current.checkpoint.isActive) {
    await advancePastInactiveCheckpoints(teamId);
    return null;
  }

  const distanceAtCaptureM = distanceMeters(position, current.checkpoint);
  const accuracyGate = Math.min(
    Math.max(current.checkpoint.radiusM, settings.accuracySlackM),
    settings.maxAccuracyM,
  );
  if (
    distanceAtCaptureM > current.checkpoint.radiusM ||
    position.accuracy > accuracyGate
  ) {
    return null;
  }

  try {
    const capture = await prisma.$transaction(async (transaction) => {
      const latestEvent = await transaction.eventState.findUnique({
        where: { id: "global" },
      });
      if (latestEvent?.status !== "ACTIVE") return null;

      const latestTeam = await transaction.team.findUnique({
        where: { id: teamId },
        include: {
          routes: {
            include: { checkpoint: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      });
      if (!latestTeam || latestTeam.status !== "ACTIVE") return null;
      current = latestTeam.routes.find(
        (route) => route.orderIndex === latestTeam.currentIndex,
      );
      if (!current || !current.checkpoint.isActive) return null;

      const latestDistance = distanceMeters(position, current.checkpoint);
      const latestGate = Math.min(
        Math.max(current.checkpoint.radiusM, settings.accuracySlackM),
        settings.maxAccuracyM,
      );
      if (latestDistance > current.checkpoint.radiusM || position.accuracy > latestGate) {
        return null;
      }

      const alreadyCaptured = await transaction.completion.findUnique({
        where: {
          teamId_checkpointId: {
            teamId,
            checkpointId: current.checkpointId,
          },
        },
      });
      if (alreadyCaptured) return null;

      const completedAt = new Date();
      const completion = await transaction.completion.create({
        data: {
          teamId,
          checkpointId: current.checkpointId,
          completedAt,
          distanceAtCaptureM: latestDistance,
          accuracyM: position.accuracy,
        },
        include: { checkpoint: true, team: true },
      });
      const nextIndex = latestTeam.currentIndex + 1;
      const finished = nextIndex >= latestTeam.routes.length;
      await transaction.team.update({
        where: { id: teamId },
        data: {
          currentIndex: nextIndex,
          status: finished ? "FINISHED" : "ACTIVE",
          finishedAt: finished ? completedAt : null,
        },
      });
      return {
        completion,
        finished,
        nextIndex,
        total: latestTeam.routes.length,
        startedAt: latestTeam.startedAt,
      };
    });

    if (!capture) return null;

    await advancePastInactiveCheckpoints(teamId);
    const state = await getTeamGameState(teamId);
    if (!state) return null;

    const payload = {
      checkpoint: {
        id: capture.completion.checkpoint.id,
        name: capture.completion.checkpoint.name,
      },
      completedAt: capture.completion.completedAt,
      distanceAtCaptureM: capture.completion.distanceAtCaptureM,
      accuracyM: capture.completion.accuracyM,
      progress: state.progress,
      total: state.total,
      nextCheckpoint: state.currentCheckpoint,
    };
    emitToTeam(teamId, "checkpoint:captured", payload);
    if (state.currentCheckpoint) {
      emitToTeam(teamId, "target:update", {
        checkpoint: state.currentCheckpoint,
        progress: state.progress,
        total: state.total,
      });
    }
    if (state.team?.status === "FINISHED") {
      emitToTeam(teamId, "voyage:complete", {
        completedAt: capture.completion.completedAt,
        total: state.total,
        durationMs:
          capture.startedAt && capture.completion.completedAt
            ? capture.completion.completedAt.getTime() - capture.startedAt.getTime()
            : null,
        completions: state.completions,
      });
    }

    emitToAdmins("admin:completion:new", {
      teamId,
      teamName: capture.completion.team.name,
      checkpointId: capture.completion.checkpointId,
      checkpointName: capture.completion.checkpoint.name,
      completedAt: capture.completion.completedAt,
      distanceAtCaptureM: capture.completion.distanceAtCaptureM,
      accuracyM: capture.completion.accuracyM,
    });
    const updated = await loadAdminTeam(teamId);
    if (updated) emitToAdmins("admin:team:update", updated);
    qualifyingPings.delete(teamId);
    return payload;
  } catch (error) {
    if (isKnownRequestError(error, "P2002")) return null;
    throw error;
  }
}

async function handleLocation(socket: ClientSocket, payload: unknown) {
  const parsed = LocationUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    socket.emit("error:flagged", { message: "The Oracle could not read that location signal." });
    return;
  }
  if (!canEmit(socket)) return;

  const user = socket.data.odysseyUser;
  const teamId = user?.role === "TEAM" ? user.teamId : null;
  if (!teamId) return;

  const [team, status, settings] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    getEventStatus(),
    getSettings(),
  ]);
  if (!team) return;

  const now = new Date();
  const flags: string[] = [];
  if (parsed.data.accuracy === 0) flags.push("GPS accuracy reported as exactly zero.");
  if (
    team.lastLat === parsed.data.lat &&
    team.lastLng === parsed.data.lng
  ) {
    flags.push("Repeated identical coordinates.");
  }
  if (team.lastLat !== null && team.lastLng !== null && team.lastSeenAt) {
    const seconds = Math.max(
      (now.getTime() - team.lastSeenAt.getTime()) / 1000,
      0.001,
    );
    const speed =
      distanceMeters(
        { lat: team.lastLat, lng: team.lastLng },
        { lat: parsed.data.lat, lng: parsed.data.lng },
      ) / seconds;
    if (speed > GAME.speedLimitMps) {
      flags.push(`Location implied movement of ${speed.toFixed(1)} m/s.`);
    }
  }

  await prisma.team.update({
    where: { id: teamId },
    data: {
      lastLat: parsed.data.lat,
      lastLng: parsed.data.lng,
      lastAccuracy: parsed.data.accuracy,
      lastSeenAt: now,
      suspicious: team.suspicious || flags.length > 0,
    },
  });
  if (flags.length) {
    socket.emit("error:flagged", { message: "The Fates have marked this location signal for review." });
    const updated = await loadAdminTeam(teamId);
    if (updated) emitToAdmins("admin:team:update", { ...updated, flagReason: flags });
  } else {
    const updated = await loadAdminTeam(teamId);
    if (updated) emitToAdmins("admin:team:update", updated);
  }

  if (status !== "ACTIVE" || team.status !== "ACTIVE") {
    qualifyingPings.delete(teamId);
    return;
  }

  const target = await prisma.teamRoute.findFirst({
    where: {
      teamId,
      orderIndex: team.currentIndex,
      checkpoint: { isActive: true },
    },
    include: { checkpoint: true },
  });
  if (!target) return;

  const distance = distanceMeters(parsed.data, target.checkpoint);
  const accuracyGate = Math.min(
    Math.max(target.checkpoint.radiusM, settings.accuracySlackM),
    settings.maxAccuracyM,
  );
  const qualifies =
    distance <= target.checkpoint.radiusM &&
    parsed.data.accuracy <= accuracyGate;
  if (!qualifies) {
    qualifyingPings.delete(teamId);
    return;
  }

  const count = (qualifyingPings.get(teamId) ?? 0) + 1;
  qualifyingPings.set(teamId, count);
  if (count >= GAME.qualifyingPingsToCapture) {
    await captureCurrentCheckpoint(teamId, parsed.data);
  }
}

async function handleArrive(socket: ClientSocket, payload: unknown) {
  if (!ArrivePayloadSchema.safeParse(payload).success || !canEmit(socket)) {
    socket.emit("error:flagged", { message: "The Oracle could not confirm arrival." });
    return;
  }
  const user = socket.data.odysseyUser;
  const teamId = user?.role === "TEAM" ? user.teamId : null;
  if (!teamId || (await getEventStatus()) !== "ACTIVE") return;

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (
    !team ||
    team.status !== "ACTIVE" ||
    team.lastLat === null ||
    team.lastLng === null ||
    team.lastAccuracy === null ||
    !team.lastSeenAt ||
    Date.now() - team.lastSeenAt.getTime() > 45_000
  ) {
    socket.emit("error:flagged", { message: "Wait for a fresh location signal before confirming arrival." });
    return;
  }
  await captureCurrentCheckpoint(teamId, {
    lat: team.lastLat,
    lng: team.lastLng,
    accuracy: team.lastAccuracy,
  });
}

export function attachGameSockets(server: HttpServer) {
  const io = new Server(server, {
    path: "/api/socket.io",
    transports: ["websocket", "polling"],
    serveClient: false,
  });
  setRealtimeServer(io);

  io.use((socket, next) => {
    const token = tokenFromCookies(socket.handshake.headers.cookie);
    const user = readSessionToken(token);
    if (!user) {
      next(new Error("Authentication required"));
      return;
    }
    if (user.role === "TEAM") {
      void prisma.team
        .findUnique({
          where: { id: user.id },
          select: { sessionVersion: true, deviceId: true },
        })
        .then((team) => {
          if (
            !team ||
            team.sessionVersion !== user.sessionVersion ||
            team.deviceId !== user.deviceId
          ) {
            next(new Error("Captain session is no longer active"));
            return;
          }
          (socket as ClientSocket).data.odysseyUser = user;
          next();
        })
        .catch((error) => {
          logger.error({ err: error }, "Unable to validate Socket.IO team session");
          next(new Error("Authentication service unavailable"));
        });
      return;
    }
    void prisma.admin
      .findUnique({
        where: { id: user.id },
        select: { role: true, sessionVersion: true },
      })
      .then((account) => {
        if (
          !account ||
          account.role !== user.role ||
          account.sessionVersion !== (user.sessionVersion ?? 0)
        ) {
          next(new Error("Volunteer session is no longer active"));
          return;
        }
        (socket as ClientSocket).data.odysseyUser = user;
        next();
      })
      .catch((error) => {
        logger.error({ err: error }, "Unable to validate Socket.IO volunteer session");
        next(new Error("Authentication service unavailable"));
      });
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as ClientSocket;
    const user = socket.data.odysseyUser;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    if (user.role === "ADMIN" || user.role === "VOLUNTEER") {
      socket.join("admins");
      socket.join(`admin:${user.id}`);
      void sendAdminSnapshot(socket).catch((error) =>
        logger.error({ err: error }, "Unable to send initial admin snapshot"),
      );
    } else if (user.teamId) {
      socket.join(`team:${user.teamId}`);
    }

    socket.on("location:update", (payload: unknown) => {
      void handleLocation(socket, payload).catch((error) =>
        logger.error({ err: error }, "Unable to handle location update"),
      );
    });
    socket.on("checkpoint:arrive", (payload: unknown) => {
      void handleArrive(socket, payload).catch((error) =>
        logger.error({ err: error }, "Unable to confirm checkpoint arrival"),
      );
    });
    socket.on("disconnect", () => {
      if (user.teamId) qualifyingPings.delete(user.teamId);
    });
  });

  return io;
}
