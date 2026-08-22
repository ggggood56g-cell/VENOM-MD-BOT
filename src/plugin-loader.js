import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const COMMAND_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SOURCE_EXTENSIONS = new Set([".js", ".mjs"]);

function sourcePath(input) {
  return input instanceof URL ? fileURLToPath(input) : path.resolve(String(input));
}

async function discoverFiles(root, directory = root) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Plugin discovery attempted to leave the plugin directory.");
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`Plugin symlinks are not allowed: ${relative}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await discoverFiles(root, absolute)));
      continue;
    }
    if (
      entry.isFile() &&
      entry.name !== "index.js" &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(absolute);
    }
  }
  return files;
}

function validateCommand(command, sourceFile, index) {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    throw new Error(`${sourceFile} command ${index + 1} must be an object.`);
  }
  const name = String(command.name || "").toLowerCase();
  if (!COMMAND_NAME.test(name)) {
    throw new Error(`${sourceFile} command ${index + 1} has an invalid name: ${name || "(empty)"}.`);
  }
  if (typeof command.execute !== "function") {
    throw new Error(`${sourceFile} command “${name}” must export an execute function.`);
  }
  const aliases = command.aliases || [];
  if (!Array.isArray(aliases)) {
    throw new Error(`${sourceFile} command “${name}” aliases must be an array.`);
  }
  const normalizedAliases = aliases.map((alias) => String(alias).toLowerCase());
  for (const alias of normalizedAliases) {
    if (!COMMAND_NAME.test(alias)) {
      throw new Error(`${sourceFile} command “${name}” has an invalid alias: ${alias}.`);
    }
  }
  const category = String(command.category || "general").toLowerCase();
  if (!COMMAND_NAME.test(category)) {
    throw new Error(`${sourceFile} command “${name}” has an invalid category: ${category}.`);
  }

  return Object.freeze({
    ...command,
    name,
    category,
    description: String(command.description || "No description provided.").slice(0, 500),
    usage: String(command.usage || "").slice(0, 300),
    aliases: Object.freeze(normalizedAliases),
    sourceFile,
  });
}

/**
 * Discover and import every local plugin module below `directory`.
 *
 * Modules are loaded in deterministic relative-path order. Each must default
 * export one command object or an array of command objects. Remote URLs,
 * symlinks, malformed manifests, and duplicate command names fail startup.
 */
export async function discoverPlugins(directory) {
  const root = sourcePath(directory);
  const rootStat = await fs.promises.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("Plugin root must be a real local directory.");
  }

  const absoluteFiles = (await discoverFiles(root)).sort((first, second) =>
    path.relative(root, first).localeCompare(path.relative(root, second)),
  );
  const commands = [];
  const keys = new Map();
  const files = [];

  for (const absoluteFile of absoluteFiles) {
    const relativeFile = path.relative(root, absoluteFile).split(path.sep).join("/");
    const module = await import(pathToFileURL(absoluteFile).href);
    const exported = Array.isArray(module.default) ? module.default : [module.default];
    if (!exported.length || exported[0] === undefined) {
      throw new Error(`${relativeFile} must default export a command or command array.`);
    }

    const validated = exported.map((command, index) =>
      validateCommand(command, relativeFile, index),
    );
    for (const command of validated) {
      for (const key of [command.name, ...command.aliases]) {
        const previous = keys.get(key);
        if (previous) {
          throw new Error(
            `Duplicate command key “${key}” in ${relativeFile}; already registered by ${previous}.`,
          );
        }
        keys.set(key, relativeFile);
      }
      commands.push(command);
    }
    files.push(relativeFile);
  }

  return Object.freeze({
    commands: Object.freeze(commands),
    files: Object.freeze(files),
    routableCount: keys.size,
  });
}

export default discoverPlugins;
