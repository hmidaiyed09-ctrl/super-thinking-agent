const chalk = require('chalk');
const { marked } = require('marked');
const TerminalRenderer = require('marked-terminal');

marked.setOptions({
  renderer: new TerminalRenderer({
    reflowText: true,
    width: Math.min(process.stdout.columns || 80, 100),
    tab: 2,
    code: chalk.yellow,
    codespan: chalk.yellow,
    blockquote: chalk.gray.italic,
    heading: chalk.cyan.bold,
    strong: chalk.bold,
    em: chalk.italic,
    listitem: chalk.white,
  }),
});

function printBanner() {
  console.log('');
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   ⚡ Super Thinking Agent CLI ⚡          ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.gray('   Your AI assistant in the terminal       ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════╝'));
  console.log('');
}

function printHelp() {
  console.log('');
  console.log(chalk.cyan.bold('  Commands:'));
  console.log(chalk.gray('  ─────────────────────────────────'));
  console.log(chalk.yellow('  /help     ') + chalk.white(' Show this help message'));
  console.log(chalk.yellow('  /config   ') + chalk.white(' Reconfigure credentials'));
  console.log(chalk.yellow('  /clear    ') + chalk.white(' Clear conversation history'));
  console.log(chalk.yellow('  /history  ') + chalk.white(' Show conversation history'));
  console.log(chalk.yellow('  /model    ') + chalk.white(' Show current model info'));
  console.log(chalk.yellow('  /exit     ') + chalk.white(' Exit the CLI'));
  console.log('');
}

function printModelInfo(credentials) {
  console.log('');
  console.log(chalk.cyan.bold('  Current Configuration:'));
  console.log(chalk.gray('  ─────────────────────────────────'));
  console.log(chalk.yellow('  Base URL: ') + chalk.white(credentials.baseUrl));
  console.log(chalk.yellow('  Model:    ') + chalk.white(credentials.model));
  console.log(chalk.yellow('  API Key:  ') + chalk.white(credentials.apiKey.slice(0, 8) + '•'.repeat(20)));
  console.log('');
}

function printHistory(messages) {
  console.log('');
  console.log(chalk.cyan.bold('  Conversation History:'));
  console.log(chalk.gray('  ─────────────────────────────────'));
  if (messages.length === 0) {
    console.log(chalk.gray('  (empty)'));
  } else {
    for (const msg of messages) {
      if (msg.role === 'user') {
        console.log(chalk.green.bold('  You: ') + chalk.white(msg.content.slice(0, 80) + (msg.content.length > 80 ? '...' : '')));
      } else if (msg.role === 'assistant') {
        console.log(chalk.magenta.bold('  AI:  ') + chalk.gray(msg.content.slice(0, 80) + (msg.content.length > 80 ? '...' : '')));
      }
    }
  }
  console.log('');
}

function formatMarkdown(text) {
  try {
    return marked(text);
  } catch {
    return text;
  }
}

function printUserMessage(text) {
  console.log('');
  console.log(chalk.green.bold('  You ') + chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('  ' + chalk.white(text));
  console.log('');
}

function printAssistantHeader() {
  console.log(chalk.magenta.bold('  AI ') + chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
}

function printAssistantEnd() {
  console.log('');
  console.log(chalk.gray('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
}

function printError(message) {
  console.log('');
  console.log(chalk.red.bold('  ✖ Error: ') + chalk.red(message));
  console.log('');
}

function printInfo(message) {
  console.log(chalk.cyan('  ℹ ') + chalk.white(message));
}

module.exports = {
  printBanner,
  printHelp,
  printModelInfo,
  printHistory,
  formatMarkdown,
  printUserMessage,
  printAssistantHeader,
  printAssistantEnd,
  printError,
  printInfo,
};
