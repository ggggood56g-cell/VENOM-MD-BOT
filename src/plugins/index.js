import { discoverPlugins } from "../plugin-loader.js";

const discovered = await discoverPlugins(new URL("./", import.meta.url));

export const pluginFiles = discovered.files;
export const routableCount = discovered.routableCount;
export const plugins = discovered.commands;
export default plugins;
