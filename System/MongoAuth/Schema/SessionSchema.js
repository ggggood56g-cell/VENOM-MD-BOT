import { model, Schema } from "mongoose";

const schema = new Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
  },
  files: {
    type: Schema.Types.Mixed,
    default: {},
  },
  // Kept temporarily so older single-blob sessions can be migrated safely.
  session: {
    type: String,
    default: undefined,
  },
  lastSync: {
    type: Date,
    default: null,
  },
});

export default model("sessionschemas", schema);
