import { ffmpeg } from "./File-Converter.js";

/**
 * Convert a bounded reaction GIF buffer to an MP4 buffer WhatsApp can play inline.
 * Temporary-file isolation, process timeout, argument validation, and cleanup are
 * provided by the shared FFmpeg wrapper.
 */
export const GIFBufferToVideoBuffer = async (image) =>
  ffmpeg(
    image,
    [
      "-movflags",
      "faststart",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-f",
      "mp4",
    ],
    "gif",
    "mp4",
  );

export default { GIFBufferToVideoBuffer };
