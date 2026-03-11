#!/usr/bin/env node

const readline = require('readline');
const chalk = require('chalk');
const ora = require('ora');
const { setupCredentials, getCredentials } = require('./config');
const { streamChat } = require('./api');
const {
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
} = require('./ui');

let conversationHistory = [];
let credentials = null;
let isStreaming = false;

async function main() {
  printBanner();

  // Setup credentials on first run or if missing
  credentials = await setupCredentials();

  printInfo(`Connected to ${chalk.yellow(credentials.model)} at ${chalk.gray(credentials.baseUrl)}`);
  console.log(chalk.gray('  Type /help for commands or just start chatting!\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan.bold('  ❯ '),
    terminal: true,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle slash commands
    if (input.startsWith('/')) {
      await handleCommand(input, rl);
      rl.prompt();
      return;
    }

    if (isStreaming) {
      printInfo('Please wait for the current response to finish...');
      rl.prompt();
      return;
    }

    // Send message to API
    await sendMessage(input, rl);
  });

  rl.on('close', () => {
    console.log('');
    printInfo('Goodbye! 👋');
    process.exit(0);
  });
}

async function handleCommand(input, rl) {
  const cmd = input.toLowerCase().split(' ')[0];

  switch (cmd) {
    case '/help':
      printHelp();
      break;

    case '/config':
      credentials = await setupCredentials(true);
      printInfo(`Now using ${chalk.yellow(credentials.model)} at ${chalk.gray(credentials.baseUrl)}`);
      break;

    case '/clear':
      conversationHistory = [];
      printInfo('Conversation history cleared.');
      break;

    case '/history':
      printHistory(conversationHistory);
      break;

    case '/model':
      printModelInfo(credentials);
      break;

    case '/exit':
    case '/quit':
      console.log('');
      printInfo('Goodbye! 👋');
      process.exit(0);
      break;

    default:
      printError(`Unknown command: ${cmd}. Type /help for available commands.`);
      break;
  }
}

async function sendMessage(userInput, rl) {
  printUserMessage(userInput);

  conversationHistory.push({ role: 'user', content: userInput });

  isStreaming = true;
  printAssistantHeader();

  const spinner = ora({
    text: chalk.gray('Thinking...'),
    indent: 2,
    spinner: 'dots',
    color: 'magenta',
  }).start();

  let firstToken = true;

  await new Promise((resolve) => {
    streamChat(
      credentials,
      conversationHistory,
      // onToken
      (token) => {
        if (firstToken) {
          spinner.stop();
          process.stdout.write('  ');
          firstToken = false;
        }
        process.stdout.write(token);
      },
      // onDone
      (fullResponse) => {
        if (firstToken) {
          spinner.stop();
        }

        // Re-render the full response with markdown formatting
        process.stdout.write('\r\x1b[K'); // Clear current line
        // Move cursor up to clear streamed text
        const lineCount = fullResponse.split('\n').length;
        for (let i = 0; i < lineCount; i++) {
          process.stdout.write('\x1b[A\x1b[K');
        }

        const formatted = formatMarkdown(fullResponse);
        console.log(formatted.replace(/^/gm, '  '));

        conversationHistory.push({ role: 'assistant', content: fullResponse });
        printAssistantEnd();
        isStreaming = false;
        rl.prompt();
        resolve();
      },
      // onError
      (errMsg) => {
        spinner.stop();
        printError(errMsg);
        // Remove the failed user message
        conversationHistory.pop();
        isStreaming = false;
        rl.prompt();
        resolve();
      }
    );
  });
}

main().catch((err) => {
  printError(err.message);
  process.exit(1);
});
