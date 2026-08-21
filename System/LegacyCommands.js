import NodeCache from "node-cache";

import config from "../src/config.js";
import {
  closeDB,
  connectDB,
} from "../src/lib/database.js";
import { loadKeys } from "../src/lib/ai.js";
import { loadVars, getVar } from "../src/lib/vars.js";
import {
  commands as legacyCommands,
  loadIssues,
  loadPlugins,
  middlewares,
  pluginCount,
} from "../src/lib/pluginLoader.js";
import {
  handleMessage,
  isCommandCleanup,
  legacyCommandFor,
} from "../src/handler.js";
import { attachScheduler, stopScheduler } from "../src/lib/scheduler.js";
import { attachSchool } from "../src/lib/school.js";
import { attachCleanup } from "../src/lib/cleanup.js";

const MAX_MESSAGES = 3000;
const messageStore = new Map();
const groupCache = new NodeCache({ stdTTL: 300, useClones: false });

let initialization = null;

function remember(rawMessage) {
  const id = rawMessage?.key?.id;
  if (!id) return;
  messageStore.delete(id);
  messageStore.set(id, rawMessage);
  while (messageStore.size > MAX_MESSAGES) {
    messageStore.delete(messageStore.keys().next().value);
  }
}

/** Load VENOM's original recursive command registry and its data services. */
export function initializeLegacyCommands() {
  if (initialization) return initialization;
  initialization = (async () => {
    await connectDB();
    await Promise.all([loadVars(), loadKeys()]);
    const registry = await loadPlugins();
    if (loadIssues.length > 0) {
      throw new Error(
        `Legacy command registry has ${loadIssues.length} load issue(s): ${loadIssues.join("; ")}`,
      );
    }
    return registry;
  })().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

/** Refresh timers and socket-bound services after each successful reconnect. */
export function activateLegacySocket(socket) {
  attachScheduler(socket);
  attachSchool(socket);
  attachCleanup();
}

export function legacyRegistryStats() {
  return {
    commandObjects: pluginCount(),
    routableKeys: legacyCommands.size,
    hooks: middlewares.length,
    issues: [...loadIssues],
  };
}

export { legacyCommandFor };

/** Run original middleware/commands. Atlas receives only non-legacy keys. */
export async function dispatchLegacyMessage(
  socket,
  rawMessage,
  { externalCommand = "" } = {},
) {
  remember(rawMessage);
  const routing = { blocked: false };
  await handleMessage(socket, rawMessage, {
    externalCommand,
    messageStore,
    groupCache,
    routing,
  });
  return routing;
}

export async function dispatchLegacyGroupUpdate(socket, event) {
  if (!event?.id) return;
  let metadata;
  try {
    metadata = await socket.groupMetadata(event.id);
    groupCache.set(event.id, metadata);
  } catch {
    return;
  }

  for (const middleware of middlewares) {
    if (typeof middleware.onGroupUpdate !== "function") continue;
    await middleware
      .onGroupUpdate({ socket, sock: socket, event, metadata })
      .catch((error) =>
        console.warn(
          `[ VENOM ] Group hook ${middleware.name || "unknown"} failed: ${error.message}`,
        ),
      );
  }
}

export function invalidateLegacyGroupMetadata(groupId) {
  if (groupId) groupCache.del(groupId);
}

export async function dispatchLegacyMessageUpdates(socket, updates = []) {
  for (const { key, update } of updates) {
    const isRevoke = update?.message === null || update?.messageStubType === 1;
    if (isRevoke) {
      if (isCommandCleanup(key)) continue;
      for (const middleware of middlewares) {
        if (typeof middleware.onDelete !== "function") continue;
        await middleware
          .onDelete({ socket, sock: socket, key, messageStore })
          .catch((error) =>
            console.warn(
              `[ VENOM ] Delete hook ${middleware.name || "unknown"} failed: ${error.message}`,
            ),
          );
      }
      continue;
    }

    const edited =
      update?.message?.editedMessage?.message ||
      update?.message?.protocolMessage?.editedMessage;
    if (!edited) continue;
    for (const middleware of middlewares) {
      if (typeof middleware.onEdit !== "function") continue;
      await middleware
        .onEdit({ socket, sock: socket, key, edited, messageStore })
        .catch((error) =>
          console.warn(
            `[ VENOM ] Edit hook ${middleware.name || "unknown"} failed: ${error.message}`,
          ),
        );
    }
  }
}

export async function handleLegacyCalls(socket, calls = []) {
  if (!getVar("REJECT_CALL")) return;
  for (const call of calls) {
    if (call.status !== "offer") continue;
    await socket.rejectCall(call.id, call.from).catch(() => {});
    await socket
      .sendMessage(call.from, {
        text: `📵 Calls are not accepted by ${config.botName}. Your ${call.isVideo ? "video" : "voice"} call was rejected automatically.`,
      })
      .catch(() => {});
  }
}

export async function shutdownLegacyCommands() {
  stopScheduler();
  await closeDB();
}

export default {
  initializeLegacyCommands,
  activateLegacySocket,
  legacyRegistryStats,
  legacyCommandFor,
  dispatchLegacyMessage,
  dispatchLegacyGroupUpdate,
  dispatchLegacyMessageUpdates,
  invalidateLegacyGroupMetadata,
  handleLegacyCalls,
  shutdownLegacyCommands,
};
