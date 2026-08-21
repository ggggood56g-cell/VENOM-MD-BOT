import mongoose from "mongoose";

const GroupSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, required: true },
    antilink: { type: Boolean, default: false },
    antidelete: { type: Boolean, default: false },
    nsfw: { type: Boolean, default: false },
    bangroup: { type: Boolean, default: false },
    chatBot: { type: Boolean, default: false },
    botSwitch: { type: Boolean, default: true },
    switchNSFW: { type: Boolean, default: false },
    switchWelcome: { type: Boolean, default: false },
  },
  { versionKey: false },
);

const UserSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, required: true },
    ban: { type: Boolean, default: false },
    name: { type: String },
    addedMods: { type: Boolean, default: false },
  },
  { versionKey: false },
);

const CoreSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, default: "1" },
    seletedCharacter: { type: String, default: "0" },
    PMchatBot: { type: Boolean, default: false },
    botMode: {
      type: String,
      enum: ["public", "private", "self"],
      default: "public",
    },
  },
  { versionKey: false },
);

const userData =
  mongoose.models.UserData || mongoose.model("UserData", UserSchema);
const groupData =
  mongoose.models.GroupData || mongoose.model("GroupData", GroupSchema);
const systemData =
  mongoose.models.SystemData || mongoose.model("SystemData", CoreSchema);

export { userData, groupData, systemData };
