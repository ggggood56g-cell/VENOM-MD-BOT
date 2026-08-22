import ai from "./ai.js";
import download from "./download.js";
import fun from "./fun.js";
import general from "./general.js";
import group from "./group.js";
import media from "./media.js";
import owner from "./owner.js";
import utility from "./utility.js";

export default [
  ...general,
  ...owner,
  ...group,
  ...media,
  ...download,
  ...utility,
  ...fun,
  ...ai,
];
