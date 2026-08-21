import assert from "node:assert/strict";
import test from "node:test";
import BRAND, { BRAND as namedBrand } from "../System/Branding.js";

test("canonical VENOM identity is immutable and complete", () => {
  assert.strictEqual(BRAND, namedBrand);
  assert.ok(Object.isFrozen(BRAND));
  assert.deepEqual(
    {
      botName: BRAND.botName,
      creator: BRAND.creator,
      creatorNumber: BRAND.creatorNumber,
      githubUser: BRAND.githubUser,
      repository: BRAND.repository,
      whatsappUrl: BRAND.whatsappUrl,
      youtubeTutorial: BRAND.youtubeTutorial,
      logoPath: BRAND.logoPath,
    },
    {
      botName: "VENOM MD BOT",
      creator: "TAPRUSH EMP (Micheal)",
      creatorNumber: "2348021016309",
      githubUser: "MykelGoal",
      repository: "https://github.com/MykelGoal/VENOM-MD-BOT",
      whatsappUrl: "https://wa.me/2348021016309",
      youtubeTutorial: "https://youtu.be/ct4k9tfL1Fg",
      logoPath: "./Assets/Venom.jpg",
    },
  );
});
