import type { Server } from "socket.io";
import {
  loadAdminOverview,
  loadAdminTeam,
  getTeamGameState,
  getEventState,
} from "./game-service";

let io: Server | null = null;

export function setRealtimeServer(server: Server) {
  io = server;
}

export function emitToAdmins(event: string, payload: unknown) {
  io?.to("admins").emit(event, payload);
}

export function emitToTeam(teamId: string, event: string, payload: unknown) {
  io?.to(`team:${teamId}`).emit(event, payload);
}

export function disconnectTeamSessions(teamId: string) {
  io?.in(`team:${teamId}`).disconnectSockets(true);
}

export function disconnectAdminAccountSessions(adminId: string) {
  io?.in(`admin:${adminId}`).disconnectSockets(true);
}

export async function publishTeamUpdate(teamId: string) {
  const team = await loadAdminTeam(teamId);
  if (team) emitToAdmins("admin:team:update", team);
}

export async function publishTeamTarget(teamId: string) {
  const state = await getTeamGameState(teamId);
  if (!state) return;
  if (state.currentCheckpoint) {
    emitToTeam(teamId, "target:update", {
      checkpoint: state.currentCheckpoint,
      progress: state.progress,
      total: state.total,
    });
  }
  if (state.team?.status === "FINISHED") {
    const completedAt = state.team.finishedAt ?? new Date();
    emitToTeam(teamId, "voyage:complete", {
      completedAt,
      total: state.total,
      durationMs: state.team.startedAt
        ? completedAt.getTime() - state.team.startedAt.getTime()
        : null,
      completions: state.completions,
    });
  }
  emitToTeam(teamId, "event:status", {
    status: state.eventStatus,
    currentRound: state.currentRound,
  });
}

export async function publishEventStatus() {
  const { status, currentRound } = await getEventState();
  io?.emit("event:status", { status, currentRound });
  emitToAdmins("admin:snapshot", {
    overview: await loadAdminOverview(),
  });
}
