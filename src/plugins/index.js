import ai from "./ai.js";
import anime from "./anime.js";
import autoreply from "./autoreply.js";
import botControl from "./bot-control.js";
import configExtra from "./config-extra.js";
import converter from "./converter.js";
import download from "./download.js";
import economy from "./economy.js";
import fun from "./fun.js";
import general from "./general.js";
import game from "./game.js";
import groupExtra from "./group-extra.js";
import groupModeration from "./group-moderation.js";
import group from "./group.js";
import imageMeme from "./image-meme.js";
import image from "./image.js";
import media from "./media.js";
import misc from "./misc.js";
import owner from "./owner.js";
import pluginControl from "./plugin-control.js";
import reactions from "./reactions.js";
import search from "./search.js";
import targetExtras from "./target-extras.js";
import textmaker from "./textmaker.js";
import tools from "./tools.js";
import userPrivacy from "./user-privacy.js";
import utilityExtra from "./utilities-extra.js";
import utility from "./utility.js";

export default [
  ...general,
  ...ai,
  ...anime,
  ...fun,
  ...reactions,
  ...download,
  ...converter,
  ...search,
  ...economy,
  ...textmaker,
  ...game,
  ...group,
  ...groupExtra,
  ...groupModeration,
  ...tools,
  ...image,
  ...imageMeme,
  ...media,
  ...botControl,
  ...misc,
  ...utility,
  ...utilityExtra,
  ...pluginControl,
  ...configExtra,
  ...userPrivacy,
  ...autoreply,
  ...targetExtras,
  ...owner,
];
