import { publicHttp as axios } from "../src/lib/network.js";
import FormData from "form-data";

const commands = [
  "hd",
  "upscale",
  "upscalehd",
  "calc",
  "calculate",
  "shorturl",
  "short",
  "tinyurl",
];

const calculate = (source) => {
  if (typeof source !== "string" || source.length > 200) {
    throw new Error("Expression is too long.");
  }
  const tokens = source.match(/\d+(?:\.\d+)?|[()+\-*/%^]/g) || [];
  if (tokens.join("") !== source.replace(/\s/g, "")) {
    throw new Error("Only numbers and arithmetic operators are allowed.");
  }
  let position = 0;

  const expression = () => {
    let value = term();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = term();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const term = () => {
    let value = power();
    while (["*", "/", "%"].includes(tokens[position])) {
      const operator = tokens[position++];
      const right = power();
      if ((operator === "/" || operator === "%") && right === 0) {
        throw new Error("Division by zero is not allowed.");
      }
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else value %= right;
    }
    return value;
  };
  const power = () => {
    let value = unary();
    if (tokens[position] === "^") {
      position += 1;
      value **= power();
    }
    return value;
  };
  const unary = () => {
    if (tokens[position] === "+") {
      position += 1;
      return unary();
    }
    if (tokens[position] === "-") {
      position += 1;
      return -unary();
    }
    return primary();
  };
  const primary = () => {
    if (tokens[position] === "(") {
      position += 1;
      const value = expression();
      if (tokens[position++] !== ")") throw new Error("Unmatched parenthesis.");
      return value;
    }
    const value = Number(tokens[position++]);
    if (!Number.isFinite(value)) throw new Error("Invalid number.");
    return value;
  };

  const result = expression();
  if (position !== tokens.length || !Number.isFinite(result)) {
    throw new Error("Invalid expression.");
  }
  return result;
};

export default {
  name: "tools",
  alias: commands,
  uniquecommands: ["upscale", "calc", "shorturl"],
  description: "Safe calculator, image upscale, and URL tools",

  start: async (
    Venom,
    message,
    { inputCMD, text, quoted, mime, doReact, prefix },
  ) => {
    switch (inputCMD) {
      case "hd":
      case "upscale":
      case "upscalehd": {
        const target = quoted || message;
        const mimeType = quoted?.mimetype || mime || "";
        if (!/image/i.test(mimeType)) {
          await doReact("❔");
          return message.reply(`Reply to an image with *${prefix}hd*.`);
        }

        try {
          await doReact("⏳");
          const image = await Venom.downloadMediaMessage(target);
          if (image.length > 10 * 1024 * 1024) {
            throw new Error("Image is larger than 10 MB.");
          }
          const form = new FormData();
          const webp = mimeType.includes("webp");
          form.append("image", image, {
            filename: webp ? "image.webp" : "image.jpg",
            contentType: webp ? "image/webp" : "image/jpeg",
          });
          form.append("scale", "2");

          const upscale = await axios.post(
            "https://api2.pixelcut.app/image/upscale/v1",
            form,
            {
              headers: {
                ...form.getHeaders(),
                accept: "application/json",
                "x-client-version": "web",
                "x-locale": "en",
              },
              timeout: 30_000,
              maxBodyLength: 12 * 1024 * 1024,
            },
          );
          const resultUrl = upscale.data?.result_url;
          if (!resultUrl?.startsWith("https://")) throw new Error("Upscale failed.");
          const result = await axios.get(resultUrl, {
            responseType: "arraybuffer",
            timeout: 30_000,
            maxContentLength: 20 * 1024 * 1024,
          });
          await Venom.sendMessage(
            message.from,
            {
              image: Buffer.from(result.data),
              caption: "✨ *VENOM HD Upscale*\n\nImage enhanced successfully.",
            },
            { quoted: message },
          );
          return doReact("✅");
        } catch (error) {
          console.warn(`[ VENOM ] Upscale failed: ${error.message}`);
          await doReact("❌");
          return message.reply("Upscale failed. Try a smaller image later.");
        }
      }

      case "calc":
      case "calculate": {
        if (!text) return message.reply(`Example: *${prefix}calc (2 + 3) * 4*`);
        try {
          const result = calculate(text);
          await doReact("🧮");
          return message.reply(`🧮 *Result*\n\n${text} = ${result}`);
        } catch (error) {
          await doReact("❌");
          return message.reply(`Invalid expression: ${error.message}`);
        }
      }

      case "shorturl":
      case "short":
      case "tinyurl": {
        if (!text) {
          return message.reply(`Example: *${prefix}shorturl https://example.com*`);
        }
        try {
          const target = new URL(text);
          if (!["http:", "https:"].includes(target.protocol)) {
            throw new Error("Only HTTP(S) links are supported.");
          }
          await doReact("🔗");
          const response = await axios.get("https://tinyurl.com/api-create.php", {
            params: { url: target.href },
            timeout: 15_000,
            responseType: "text",
            maxContentLength: 2048,
          });
          return message.reply(
            `🔗 *Short URL*\n\n*Original:* ${target.href}\n\n*Short:* ${response.data}`,
          );
        } catch (error) {
          await doReact("❌");
          return message.reply(`Could not shorten that URL: ${error.message}`);
        }
      }

      default:
        return undefined;
    }
  },
};
