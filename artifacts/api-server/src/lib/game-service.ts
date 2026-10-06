import { randomInt } from "node:crypto";
import type { Prisma, Team } from "@prisma/client";
import {
  GetAdminOverviewResponse,
  GetGameSettingsResponse,
} from "@workspace/api-zod";
import { GAME } from "./constants";
import { prisma } from "./prisma";

const adminTeamInclude = {
  routes: {
    include: { checkpoint: true },
    orderBy: { orderIndex: "asc" },
  },
  completions: {
    include: { checkpoint: true },
    orderBy: { completedAt: "asc" },
  },
} satisfies Prisma.TeamInclude;

export async function getEventStatus() {
  const event = await prisma.eventState.upsert({
    where: { id: "global" },
    create: { id: "global" },
    update: {},
  });
  return event.status;
}

export async function getSettings() {
  const settings = await prisma.gameSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      defaultRadiusM: GAME.defaultRadiusM,
      accuracySlackM: GAME.defaultAccuracySlackM,
      maxAccuracyM: GAME.defaultMaxAccuracyM,
    },
    update: {},
  });
  return GetGameSettingsResponse.parse({
    defaultRadiusM: settings.defaultRadiusM,
    accuracySlackM: settings.accuracySlackM,
    maxAccuracyM: settings.maxAccuracyM,
  });
}

export async function loadAdminTeam(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: adminTeamInclude,
  });
  if (!team) return null;

  const currentRoute = team.routes.find(
    (route) => route.orderIndex === team.currentIndex,
  );

  return {
    id: team.id,
    name: team.name,
    members: team.members,
    status: team.status,
    startedAt: team.startedAt,
    finishedAt: team.finishedAt,
    currentIndex: team.currentIndex,
    totalCheckpoints: team.routes.length,
    currentCheckpoint: currentRoute?.checkpoint.isActive
      ? currentRoute.checkpoint.name
      : null,
    lastLat: team.lastLat,
    lastLng: team.lastLng,
    lastAccuracy: team.lastAccuracy,
    lastSeenAt: team.lastSeenAt,
    suspicious: team.suspicious,
    completionCount: team.completions.length,
    assignedRoute: team.routes.map((route) => ({
      checkpointId: route.checkpointId,
      checkpointName: route.checkpoint.name,
      orderIndex: route.orderIndex,
      lat: route.checkpoint.lat,
      lng: route.checkpoint.lng,
      radiusM: route.checkpoint.radiusM,
      isActive: route.checkpoint.isActive,
    })),
    completions: team.completions.map((completion) => ({
      id: completion.id,
      checkpointId: completion.checkpointId,
      checkpointName: completion.checkpoint.name,
      completedAt: completion.completedAt,
      distanceAtCaptureM: completion.distanceAtCaptureM,
      accuracyM: completion.accuracyM,
    })),
  };
}

export async function loadAdminTeams() {
  const teams = await prisma.team.findMany({
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const detailed = await Promise.all(teams.map(({ id }) => loadAdminTeam(id)));
  return detailed.filter((team) => team !== null);
}

export async function loadAdminOverview() {
  const [eventStatus, teamData, checkpointCount, completionCount, recent] =
    await Promise.all([
      getEventStatus(),
      loadAdminTeams(),
      prisma.checkpoint.count({ where: { isActive: true } }),
      prisma.completion.count(),
      prisma.completion.findMany({
        take: 12,
        orderBy: { completedAt: "desc" },
        include: { team: true, checkpoint: true },
      }),
    ]);

  const now = Date.now();
  const leaderboard = [...teamData].sort((a, b) => {
    if (a.currentIndex !== b.currentIndex) return b.currentIndex - a.currentIndex;
    if (a.status === "FINISHED" && b.status === "FINISHED") {
      return (
        (a.finishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.finishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
      );
    }
    return (
      (a.startedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.startedAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
    );
  });

  return GetAdminOverviewResponse.parse({
    eventStatus,
    teamCount: teamData.length,
    activeCount: teamData.filter((team) => team.status === "ACTIVE").length,
    finishedCount: teamData.filter((team) => team.status === "FINISHED").length,
    stalledCount: teamData.filter(
      (team) =>
        team.status === "ACTIVE" &&
        (!team.lastSeenAt || now - team.lastSeenAt.getTime() > 90_000),
    ).length,
    checkpointCount,
    completionCount,
    leaderboard,
    recentCompletions: recent.map((completion) => ({
      teamName: completion.team.name,
      checkpointName: completion.checkpoint.name,
      completedAt: completion.completedAt,
    })),
  });
}

function shuffled<T>(input: T[]): T[] {
  const output = [...input];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

async function createTeamRoute(
  transaction: Prisma.TransactionClient,
  teamId: string,
) {
  const existing = await transaction.teamRoute.findMany({
    where: { teamId },
    orderBy: { orderIndex: "asc" },
  });
  if (existing.length) return;

  const checkpoints = await transaction.checkpoint.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!checkpoints.length) {
    throw new Error("Add at least one active checkpoint before starting a voyage.");
  }

  const otherRoutes = await transaction.teamRoute.findMany({
    where: { teamId: { not: teamId } },
    orderBy: { orderIndex: "asc" },
  });
  const usedFirstIds = new Set(
    otherRoutes
      .filter((route) => route.orderIndex === 0)
      .map((route) => route.checkpointId),
  );
  const routeGroups = new Map<string, string[]>();
  for (const route of otherRoutes) {
    const group = routeGroups.get(route.teamId) ?? [];
    group.push(route.checkpointId);
    routeGroups.set(route.teamId, group);
  }
  const otherOrders = [...routeGroups.values()].map((route) =>
    route.join("|"),
  );

  let order = shuffled(checkpoints);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidate = shuffled(checkpoints);
    const uniqueFirst =
      usedFirstIds.size >= checkpoints.length ||
      !usedFirstIds.has(candidate[0]?.id ?? "");
    const uniqueOrder = !otherOrders.includes(
      candidate.map((checkpoint) => checkpoint.id).join("|"),
    );
    order = candidate;
    if (uniqueFirst && uniqueOrder) break;
  }

  await transaction.teamRoute.createMany({
    data: order.map((checkpoint, orderIndex) => ({
      teamId,
      checkpointId: checkpoint.id,
      orderIndex,
    })),
  });
}

export async function startTeamVoyage(teamId: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(734921601)`;
    await createTeamRoute(transaction, teamId);
    const currentTeam = await transaction.team.findUnique({
      where: { id: teamId },
    });
    if (!currentTeam) throw new Error("Team not found.");
    if (currentTeam.status === "FINISHED") return currentTeam;
    const team = await transaction.team.update({
      where: { id: teamId },
      data: {
        status: "ACTIVE",
        ...(currentTeam.startedAt ? {} : { startedAt: new Date() }),
      },
    });
    return team;
  });
}

export async function advancePastInactiveCheckpoints(teamId: string) {
  return prisma.$transaction(async (transaction) => {
    const team = await transaction.team.findUnique({
      where: { id: teamId },
      include: {
        routes: { include: { checkpoint: true }, orderBy: { orderIndex: "asc" } },
      },
    });
    if (!team) return null;

    let index = team.currentIndex;
    while (
      index < team.routes.length &&
      !team.routes[index]?.checkpoint.isActive
    ) {
      index += 1;
    }

    const finished = index >= team.routes.length;
    if (index !== team.currentIndex || (finished && team.status !== "FINISHED")) {
      await transaction.team.update({
        where: { id: teamId },
        data: {
          currentIndex: index,
          status: finished ? "FINISHED" : team.status,
          finishedAt: finished ? new Date() : team.finishedAt,
        },
      });
    }
    return { currentIndex: index, total: team.routes.length, finished };
  });
}

export function teamGameSummary(team: Team, totalCheckpoints: number) {
  return {
    id: team.id,
    name: team.name,
    status: team.status,
    startedAt: team.startedAt,
    finishedAt: team.finishedAt,
    currentIndex: team.currentIndex,
    totalCheckpoints,
  };
}

export async function getTeamGameState(teamId: string) {
  const [team, eventStatus] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      include: {
        routes: {
          include: { checkpoint: true },
          orderBy: { orderIndex: "asc" },
        },
        completions: {
          include: { checkpoint: true },
          orderBy: { completedAt: "asc" },
        },
      },
    }),
    getEventStatus(),
  ]);
  if (!team) return null;

  const activeRoute =
    eventStatus === "ACTIVE" && team.status !== "FINISHED"
      ? team.routes.find(
          (route) =>
            route.orderIndex === team.currentIndex && route.checkpoint.isActive,
        )
      : undefined;

  return {
    eventStatus,
    team: teamGameSummary(team, team.routes.length),
    currentCheckpoint: activeRoute
      ? {
          id: activeRoute.checkpoint.id,
          name: activeRoute.checkpoint.name,
          lat: activeRoute.checkpoint.lat,
          lng: activeRoute.checkpoint.lng,
          radiusM: activeRoute.checkpoint.radiusM,
          hint: activeRoute.checkpoint.hint,
        }
      : null,
    progress: team.currentIndex,
    total: team.routes.length,
    completions: team.completions.map((completion) => ({
      id: completion.id,
      checkpointId: completion.checkpointId,
      checkpointName: completion.checkpoint.name,
      completedAt: completion.completedAt,
      distanceAtCaptureM: completion.distanceAtCaptureM,
      accuracyM: completion.accuracyM,
    })),
  };
}

export async function createProvisioningPasscode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export async function createPasscodeHash(passcode: string) {
  const bcrypt = await import("bcrypt");
  return bcrypt.default.hash(passcode, 12);
}
