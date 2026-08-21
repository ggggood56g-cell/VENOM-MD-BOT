import { checkWelcome } from "./MongoDB/MongoDb_Core.js";

export default async (Venom, anu) => {
  try {
    const metadata = await Venom.groupMetadata(anu.id);
    const participants = anu.participants;
    let desc = metadata.desc;
    if (desc == undefined) desc = "No Description";

    for (const numEntry of participants) {
      // Baileys v7 returns participants as objects {id, lid} instead of plain strings
      const num = typeof numEntry === "string" ? numEntry : numEntry.id;
      let ppuser;
      try {
        ppuser = await Venom.profilePictureUrl(num, "image");
      } catch {
        ppuser = "https://i.imgur.com/MClOeqe.jpeg";
      }

      if (anu.action == "add") {
        const WELstatus = await checkWelcome(anu.id);
        const WAuserName = num;

        const Venomtext = `
Hello @${WAuserName.split("@")[0]} Senpai,

Welcome to *${metadata.subject}*.

*🧣 Group Description 🧣*

${desc}

*Thank You.*
  `;
        if (WELstatus) {
          await Venom.sendMessage(anu.id, {
            image: { url: ppuser },
            caption: Venomtext,
            mentions: [num],
          });
        }
      } else if (anu.action == "remove") {
        const WELstatus = await checkWelcome(anu.id);
        const WAuserName = num;

        const Venomtext = `
  @${WAuserName.split("@")[0]} Senpai left the group.
  `;
        if (WELstatus) {
          await Venom.sendMessage(anu.id, {
            image: { url: ppuser },
            caption: Venomtext,
            mentions: [num],
          });
        }
      }
    }
  } catch (err) {
    console.error("[ EXCEPTION ]", err);
  }
};
