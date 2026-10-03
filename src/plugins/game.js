import { randomItem } from "../utils.js";

const hangmanGames = new Map();
const tttGames = new Map();
const wordChains = new Map();
const guesses = new Map();

const WORDS = ["javascript", "whatsapp", "lagos", "venom", "computer", "network", "developer", "keyboard"];
const TRIVIA = [
  ["What is the capital of Nigeria?", "abuja"],
  ["How many bits are in one byte?", "8"],
  ["Which planet is known as the Red Planet?", "mars"],
  ["What does HTML stand for?", "hypertext markup language"],
  ["Which ocean is the largest?", "pacific"],
];

function hangmanView(game) {
  const word = [...game.word].map((letter) => game.used.has(letter) ? letter : "_").join(" ");
  return `${word}\nUsed: ${[...game.used].join(", ") || "none"}\nLives: ${"❤️".repeat(game.lives)}`;
}

function boardText(board) {
  return board.map((value, index) => value || String(index + 1))
    .map((value, index) => `${value}${index % 3 === 2 ? "" : " │ "}`)
    .reduce((lines, value, index) => index % 3 === 0 ? [...lines, value] : [...lines.slice(0, -1), lines.at(-1) + value], [])
    .join("\n──┼───┼──\n");
}

function winner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return lines.some(([a,b,c]) => board[a] && board[a] === board[b] && board[b] === board[c]) ? true : false;
}

export default [
  {
    name: "hangman",
    category: "game",
    description: "Start or play a Hangman word game.",
    usage: "hangman start | hangman <letter>",
    async execute(context) {
      const input = context.args[0]?.toLowerCase();
      let game = hangmanGames.get(context.chat);
      if (input === "start" || !game) {
        game = { word: randomItem(WORDS), used: new Set(), lives: 6 };
        hangmanGames.set(context.chat, game);
        await context.reply(`🎮 *HANGMAN STARTED*\n${hangmanView(game)}\n\nUse ${context.prefix}hangman <letter>`);
        return;
      }
      if (!/^[a-z]$/.test(input || "")) throw new Error("Enter one letter.");
      if (game.used.has(input)) throw new Error("That letter was already used.");
      game.used.add(input);
      if (!game.word.includes(input)) game.lives -= 1;
      const solved = [...game.word].every((letter) => game.used.has(letter));
      if (solved || game.lives <= 0) {
        hangmanGames.delete(context.chat);
        await context.reply(solved ? `🏆 Correct! The word was *${game.word}*.` : `💀 Game over. The word was *${game.word}*.`);
        return;
      }
      await context.reply(hangmanView(game));
    },
  },
  {
    name: "delhangman",
    category: "game",
    description: "Delete the current Hangman game.",
    async execute(context) {
      hangmanGames.delete(context.chat);
      await context.reply("✅ Hangman game cleared.");
    },
  },
  {
    name: "ttt",
    category: "game",
    description: "Play tic-tac-toe against VENOM.",
    usage: "ttt start | ttt <1-9>",
    async execute(context) {
      const input = context.args[0]?.toLowerCase();
      let game = tttGames.get(context.chat);
      if (input === "start" || !game) {
        game = { board: Array(9).fill("") };
        tttGames.set(context.chat, game);
        await context.reply(`⭕ *TIC-TAC-TOE*\nYou are X.\n\n${boardText(game.board)}\n\nUse ${context.prefix}ttt <1-9>`);
        return;
      }
      const cell = Number.parseInt(input, 10) - 1;
      if (cell < 0 || cell > 8 || game.board[cell]) throw new Error("Choose an empty position from 1 to 9.");
      game.board[cell] = "X";
      if (winner(game.board)) {
        tttGames.delete(context.chat);
        await context.reply(`🏆 You win!\n\n${boardText(game.board)}`);
        return;
      }
      const open = game.board.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
      if (!open.length) {
        tttGames.delete(context.chat);
        await context.reply(`🤝 Draw!\n\n${boardText(game.board)}`);
        return;
      }
      game.board[randomItem(open)] = "O";
      const botWon = winner(game.board);
      if (botWon || game.board.every(Boolean)) tttGames.delete(context.chat);
      await context.reply(`${botWon ? "🤖 VENOM wins!" : game.board.every(Boolean) ? "🤝 Draw!" : "Your turn."}\n\n${boardText(game.board)}`);
    },
  },
  {
    name: "delttt",
    category: "game",
    description: "Delete the current tic-tac-toe game.",
    async execute(context) {
      tttGames.delete(context.chat);
      await context.reply("✅ Tic-tac-toe game cleared.");
    },
  },
  {
    name: "wcg",
    category: "game",
    description: "Play a word-chain game in the chat.",
    usage: "wcg start | wcg <word>",
    async execute(context) {
      const word = context.args[0]?.toLowerCase().replace(/[^a-z]/g, "");
      if (word === "start" || !wordChains.has(context.chat)) {
        const first = randomItem(["apple", "river", "music", "tiger", "ocean"]);
        wordChains.set(context.chat, { last: first, used: new Set([first]) });
        await context.reply(`🔗 Word chain started with *${first}*.\nNext word must start with *${first.at(-1)}*.`);
        return;
      }
      const game = wordChains.get(context.chat);
      if (word.length < 2 || word[0] !== game.last.at(-1)) throw new Error(`Your word must start with “${game.last.at(-1)}”.`);
      if (game.used.has(word)) throw new Error("That word was already used.");
      game.used.add(word);
      game.last = word;
      await context.reply(`✅ *${word}* accepted. Next letter: *${word.at(-1)}*`);
    },
  },
  {
    name: "delwcg",
    category: "game",
    description: "Delete the current word-chain game.",
    async execute(context) {
      wordChains.delete(context.chat);
      await context.reply("✅ Word-chain game cleared.");
    },
  },
  {
    name: "guess",
    category: "game",
    description: "Guess VENOM's number from 1 to 100.",
    usage: "guess start | guess <number>",
    async execute(context) {
      const input = context.args[0]?.toLowerCase();
      if (input === "start" || !guesses.has(context.chat)) {
        guesses.set(context.chat, { number: 1 + Math.floor(Math.random() * 100), attempts: 0 });
        await context.reply(`🔢 I chose a number from 1 to 100. Use ${context.prefix}guess <number>.`);
        return;
      }
      const number = Number.parseInt(input, 10);
      if (number < 1 || number > 100) throw new Error("Guess a number from 1 to 100.");
      const game = guesses.get(context.chat);
      game.attempts += 1;
      if (number === game.number) {
        guesses.delete(context.chat);
        await context.reply(`🏆 Correct in ${game.attempts} attempt(s)!`);
      } else await context.reply(number < game.number ? "📈 Higher." : "📉 Lower.");
    },
  },
  {
    name: "trivia",
    category: "game",
    description: "Get a trivia question; reveal with “answer”.",
    usage: "trivia | trivia answer",
    async execute(context) {
      if (context.args[0]?.toLowerCase() === "answer") {
        const question = TRIVIA.find(([prompt]) => prompt === guesses.get(`${context.chat}:trivia`));
        await context.reply(question ? `✅ Answer: *${question[1]}*` : "Start a trivia question first.");
        guesses.delete(`${context.chat}:trivia`);
        return;
      }
      const [question] = randomItem(TRIVIA);
      guesses.set(`${context.chat}:trivia`, question);
      await context.reply(`❓ *TRIVIA*\n${question}\n\nUse ${context.prefix}trivia answer to reveal.`);
    },
  },
];
