import { jidNumber } from "../utils.js";

const TEACHER_ROLES = ["teacher", "admin", "owner"];

function canTeach(context) {
  return context.isOwner || context.isAdmin || TEACHER_ROLES.includes(context.store.role(context.sender).toLowerCase());
}

function today(timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Africa/Lagos", dateStyle: "short" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function gradeSummary(school, jid) {
  const grades = school.grades[jid] || [];
  if (!grades.length) return "No grades yet.";
  const total = grades.reduce((sum, grade) => sum + Number(grade.score || 0), 0);
  return `${grades.map((grade) => `${grade.topic}:${grade.score}`).join(", ")} — average ${(total / grades.length).toFixed(1)}`;
}

export default [
  {
    name: "school",
    category: "config",
    description: "Turn school mode on or off (owner only).",
    usage: "school on|off",
    ownerOnly: true,
    async execute(context) {
      const value = context.args[0]?.toLowerCase();
      if (!["on", "off"].includes(value)) throw new Error(`Use ${context.prefix}school on or off.`);
      const school = await context.store.setSchool({ enabled: value === "on" });
      await context.reply(`🏫 School mode: *${school.enabled ? "on" : "off"}*`);
    },
  },
  {
    name: "classmode",
    category: "config",
    description: "Set class mode: class, exam or off (owner only).",
    usage: "classmode class|exam|off",
    ownerOnly: true,
    async execute(context) {
      const value = context.args[0]?.toLowerCase();
      if (!["class", "exam", "off"].includes(value)) throw new Error("Choose class, exam or off.");
      const patch = { mode: value };
      if (value !== "off") patch.enabled = true;
      await context.store.setSchool(patch);
      await context.reply(`📢 Class mode: *${value}*`);
    },
  },
  {
    name: "classtime",
    category: "config",
    description: "Set school start and end time (owner only).",
    usage: "classtime 08:00 15:00",
    ownerOnly: true,
    async execute(context) {
      const [start, end] = context.args;
      if (!/^\d{2}:\d{2}$/.test(start || "") || !/^\d{2}:\d{2}$/.test(end || "")) {
        throw new Error(`Use: ${context.prefix}classtime 08:00 15:00`);
      }
      await context.store.setSchool({ startsAt: start, endsAt: end });
      await context.reply(`⏰ Class time: ${start} — ${end}`);
    },
  },
  {
    name: "classtz",
    category: "config",
    description: "Set the school timezone (owner only).",
    usage: "classtz Africa/Lagos",
    ownerOnly: true,
    async execute(context) {
      if (!context.query) throw new Error("Send a timezone like Africa/Lagos.");
      try {
        new Intl.DateTimeFormat("en", { timeZone: context.query });
      } catch {
        throw new Error("Unknown timezone. Example: Africa/Lagos");
      }
      await context.store.setSchool({ timezone: context.query.slice(0, 60) });
      await context.reply(`🌍 School timezone: ${context.query}`);
    },
  },
  {
    name: "classlock",
    category: "config",
    description: "Lock the group so only teachers can chat during class (admins only).",
    usage: "classlock on|off",
    adminOnly: true,
    async execute(context) {
      const value = context.args[0]?.toLowerCase();
      if (!["on", "off"].includes(value)) throw new Error(`Use ${context.prefix}classlock on or off.`);
      await context.store.setSchool({ locked: value === "on" });
      await context.reply(value === "on"
        ? "🔒 Class locked. Only teachers should chat until *.classlock off*."
        : "🔓 Class unlocked.");
    },
  },
  {
    name: "lesson",
    category: "config",
    description: "Add or list school lessons.",
    usage: "lesson <topic> | lesson list",
    async execute(context) {
      const school = context.store.school();
      if (!context.query || context.query.toLowerCase() === "list") {
        await context.reply(school.lessons.length
          ? `📚 *LESSONS*\n${school.lessons.map((lesson, index) => `${index + 1}. ${lesson}`).join("\n")}`
          : "📚 No lessons added yet.");
        return;
      }
      if (!canTeach(context)) throw new Error("Only teachers can add lessons.");
      const lessons = [...school.lessons, context.query.slice(0, 160)].slice(-40);
      await context.store.setSchool({ lessons });
      await context.reply(`📚 Lesson added (${lessons.length} total).`);
    },
  },
  {
    name: "syllabus",
    category: "config",
    description: "Set or show the class syllabus.",
    usage: "syllabus <text>",
    async execute(context) {
      if (!context.query) {
        const school = context.store.school();
        await context.reply(`📋 *SYLLABUS*\n${school.syllabus || "Not set yet."}`);
        return;
      }
      if (!canTeach(context)) throw new Error("Only teachers can set the syllabus.");
      await context.store.setSchool({ syllabus: context.query.slice(0, 2_000) });
      await context.reply("📋 Syllabus saved.");
    },
  },
  {
    name: "classquestions",
    category: "config",
    description: "List pending class questions.",
    async execute(context) {
      const school = context.store.school();
      const pending = school.questions.filter((question) => !question.answered);
      await context.reply(pending.length
        ? `🙋 *PENDING QUESTIONS*\n${pending.map((question, index) => `${index + 1}. @${jidNumber(question.from)}: ${question.text}`).join("\n")}`
        : "🙋 No pending questions.",
        { mentions: pending.map((question) => question.from) });
    },
  },
  {
    name: "askteacher",
    category: "user",
    description: "Ask the teachers a question.",
    usage: "askteacher <question>",
    async execute(context) {
      if (!context.query) throw new Error("Send your question.");
      const school = context.store.school();
      const questions = [...school.questions, { from: context.sender, text: context.query.slice(0, 400), answered: false }].slice(-100);
      await context.store.setSchool({ questions });
      await context.reply("🙋 Question sent to the teachers. They can reply with *.answer*.");
    },
  },
  {
    name: "answer",
    category: "user",
    description: "Answer the latest pending question (teachers).",
    usage: "answer <reply>",
    async execute(context) {
      if (!canTeach(context)) throw new Error("Only teachers can answer.");
      if (!context.query) throw new Error("Send your answer.");
      const school = context.store.school();
      const index = school.questions.map((question) => question.answered).lastIndexOf(false);
      if (index < 0) throw new Error("No pending questions.");
      const question = school.questions[index];
      const questions = [...school.questions];
      questions[index] = { ...question, answered: true };
      await context.store.setSchool({ questions });
      await context.reply(`💬 @${jidNumber(question.from)} asked: *${question.text}*\n\n${context.query}`, {
        mentions: [question.from],
      });
    },
  },
  {
    name: "attendance",
    category: "user",
    description: "Show today's attendance sheet (teachers).",
    async execute(context) {
      if (!canTeach(context)) throw new Error("Only teachers can view attendance.");
      const school = context.store.school();
      const day = today(school.timezone);
      const present = school.attendance[day] || [];
      await context.reply(
        present.length
          ? `🗓️ *ATTENDANCE ${day}*\n${present.map((jid) => `✅ @${jidNumber(jid)}`).join("\n")}`
          : `🗓️ No attendance recorded for ${day} yet.`,
        { mentions: present },
      );
    },
  },
  {
    name: "present",
    category: "user",
    description: "Mark yourself present for today's class.",
    async execute(context) {
      const school = context.store.school();
      const day = today(school.timezone);
      const list = new Set(school.attendance[day] || []);
      list.add(context.sender);
      await context.store.setSchool({ attendance: { ...school.attendance, [day]: [...list].slice(0, 200) } });
      await context.reply(`✅ @${jidNumber(context.sender)} marked present for ${day}.`, {
        mentions: [context.sender],
      });
    },
  },
  {
    name: "endclass",
    category: "config",
    description: "End the current class (owner/teachers).",
    async execute(context) {
      if (!canTeach(context)) throw new Error("Only teachers can end the class.");
      await context.store.setSchool({ mode: "off", locked: false });
      await context.reply("🔔 Class ended. Enjoy the break!");
    },
  },
  {
    name: "mygrades",
    category: "user",
    description: "Show your recorded grades.",
    async execute(context) {
      const school = context.store.school();
      await context.reply(`🎓 *YOUR GRADES*\n${gradeSummary(school, context.sender)}`);
    },
  },
  {
    name: "addgrade",
    category: "config",
    description: "Record a student's grade (teachers).",
    usage: "addgrade @user <topic> <score>",
    async execute(context) {
      if (!canTeach(context)) throw new Error("Only teachers can add grades.");
      const target = context.targetJid();
      const rest = context.args.filter((argument) => argument !== context.args[0]).join(" ");
      const match = rest.match(/^(.*?)\s+(\d{1,3})$/);
      if (!target || !match) throw new Error(`Use: ${context.prefix}addgrade @user <topic> <score>`);
      const school = context.store.school();
      const grades = school.grades;
      grades[target] = [...(grades[target] || []), { topic: match[1].slice(0, 40), score: Number(match[2]) }].slice(-30);
      await context.store.setSchool({ grades });
      await context.reply(`🎓 @${jidNumber(target)} graded: ${match[1]} — ${match[2]}`, { mentions: [target] });
    },
  },
  {
    name: "topranks",
    category: "user",
    description: "Rank students by average grade.",
    async execute(context) {
      const school = context.store.school();
      const rows = Object.entries(school.grades)
        .map(([jid, grades]) => ({
          jid,
          average: grades.reduce((sum, grade) => sum + Number(grade.score || 0), 0) / Math.max(1, grades.length),
        }))
        .sort((first, second) => second.average - first.average)
        .slice(0, 10);
      if (!rows.length) {
        await context.reply("🏆 No grades recorded yet.");
        return;
      }
      await context.reply(
        `🏆 *TOP RANKS*\n${rows.map((row, index) => `${index + 1}. @${jidNumber(row.jid)} — ${row.average.toFixed(1)}`).join("\n")}`,
        { mentions: rows.map((row) => row.jid) },
      );
    },
  },
  {
    name: "classtop",
    category: "user",
    description: "Show the top student of the class.",
    async execute(context) {
      await context.registry.find("topranks").execute(context);
    },
  },
  {
    name: "rank",
    category: "user",
    description: "Show your class rank by average grade.",
    async execute(context) {
      const school = context.store.school();
      const rows = Object.entries(school.grades)
        .map(([jid, grades]) => ({
          jid,
          average: grades.reduce((sum, grade) => sum + Number(grade.score || 0), 0) / Math.max(1, grades.length),
        }))
        .sort((first, second) => second.average - first.average);
      const position = rows.findIndex((row) => row.jid === context.sender) + 1;
      if (!position) {
        await context.reply("🎓 You have no grades yet. Ask a teacher to grade you with *.addgrade*.");
        return;
      }
      await context.reply(`🎓 Your class rank: *#${position} of ${rows.length}*`);
    },
  },
];
