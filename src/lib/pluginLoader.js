import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import config from '../config.js'
import log from './logger.js'

/**
 * Loads every .js file under /plugins as a command module.
 *
 * A plugin exports a default object:
 *
 *   export default {
 *     name: 'ping',
 *     alias: ['p', 'speed'],
 *     category: 'BOT',
 *     desc: 'Check bot response time',
 *     usage: '.ping',
 *     cooldown: 3,          // seconds, per user
 *     owner: false,         // owner/sudo only
 *     admin: false,         // group admins only
 *     botAdmin: false,      // bot must be admin
 *     group: false,         // group chats only
 *     private: false,       // DM only
 *     hidden: false,        // hide from .menu
 *     async run({ sock, m, args, text, command, plugins }) { ... }
 *   }
 *
 * A plugin can also export `before` - run on EVERY message before commands
 * (used by antilink, afk, chatbot, anti-delete etc). Return true to stop
 * further command processing.
 */

/** command name/alias -> plugin */
export const commands = new Map()
/** plugins that hook every message */
export const middlewares = []
/** category -> [plugin] for the menu */
export const categories = new Map()
/**
 * Problems found while loading (duplicates, skipped files). Empty on a
 * healthy boot - the self-test asserts this stays empty so collisions and
 * silently-dropped hooks never ship again.
 */
export const loadIssues = []

/** Lifecycle hooks a plugin may implement - see connection.js / handler.js */
const HOOKS = ['before', 'onDelete', 'onEdit', 'onStatus', 'onGroupUpdate']

let loadedCount = 0

function walk(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

function register(plugin, file) {
  if (!plugin?.name || typeof plugin.run !== 'function') {
    /*
     * Not a command - but it may still be a hook-only watcher
     * (e.g. snipe records deletes/edits without exposing a command of its
     * own). Any implemented lifecycle hook earns middleware registration;
     * previously only `before` qualified and the rest were dropped, which
     * silently disabled the features that depend on them.
     */
    if (HOOKS.some((h) => typeof plugin?.[h] === 'function')) {
      middlewares.push(plugin)
      return true
    }
    log.warn(`Skipped ${path.basename(file)} - missing "name" or "run"`)
    loadIssues.push(`Skipped ${path.basename(file)} - missing "name" or "run"`)
    return false
  }

  plugin.file = file
  plugin.category = (plugin.category || 'MISC').toUpperCase()

  const names = [plugin.name, ...(plugin.alias || [])].map((n) => n.toLowerCase())
  for (const n of names) {
    if (commands.has(n)) {
      log.warn(`Duplicate command "${n}" in ${path.basename(file)} - overriding`)
      loadIssues.push(`Duplicate command "${n}" in ${path.basename(file)}`)
    }
    commands.set(n, plugin)
  }

  if (!categories.has(plugin.category)) categories.set(plugin.category, [])
  categories.get(plugin.category).push(plugin)

  /*
   * Any lifecycle hook needs middleware registration, not just `before`.
   * connection.js dispatches onDelete/onEdit/onGroupUpdate by walking
   * `middlewares`, so a plugin with only onDelete (antidelete, snipe) or
   * only onGroupUpdate (welcome) used to be invisible to those events and
   * its feature silently did nothing.
   */
  if (HOOKS.some((h) => typeof plugin[h] === 'function')) middlewares.push(plugin)
  return true
}

/** Load (or reload) every plugin from disk. */
export async function loadPlugins() {
  commands.clear()
  middlewares.length = 0
  categories.clear()
  loadIssues.length = 0
  loadedCount = 0

  const files = walk(config.pluginDir)
  for (const file of files) {
    try {
      // cache-buster query so reloads actually re-read the file
      const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`)
      const plugin = mod.default || mod
      if (Array.isArray(plugin)) {
        for (const p of plugin) if (register(p, file)) loadedCount++
      } else if (register(plugin, file)) {
        loadedCount++
      }
    } catch (e) {
      log.error(`Failed to load ${path.relative(config.pluginDir, file)}:`, e.message)
    }
  }

  // stable menu ordering
  for (const [, list] of categories) list.sort((a, b) => a.name.localeCompare(b.name))

  log.ok(`Loaded ${loadedCount} plugins across ${categories.size} categories`)
  return { commands, categories, middlewares, count: loadedCount }
}

export const pluginCount = () => loadedCount

/** Resolve a command name or alias. */
export const findCommand = (name) => commands.get(String(name || '').toLowerCase())

export default { loadPlugins, commands, categories, middlewares, findCommand, pluginCount, loadIssues }
