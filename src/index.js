#!/usr/bin/env node

const readline = require('readline');
const chalk = require('chalk');
const ora = require('ora');
const { setupCredentials } = require('./config');
const { chatCompletion, streamChat } = require('./api');
const { getSystemPrompt, toolDefinitions, executeTool, printToolCall } = require('./tools');
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

  credentials = await setupCredentials();

  // Inject system prompt with filesystem context
  conversationHistory.push({ role: 'system', content: getSystemPrompt() });

  printInfo(`Connected to ${chalk.yellow(credentials.model)} at ${chalk.gray(credentials.baseUrl)}`);
  printInfo(`Working directory: ${chalk.yellow(process.cwd())}`);
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
      conversationHistory = [{ role: 'system', content: getSystemPrompt() }];
      printInfo('Conversation history cleared.');
      break;
    case '/history':
      printHistory(conversationHistory.filter((m) => m.role !== 'system' && m.role !== 'tool'));
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

  try {
    // Tool-calling loop: keep calling until the model gives a final text response
    let iterationLimit = 10;

    while (iterationLimit-- > 0) {
      const spinner = ora({
        text: chalk.gray('Thinking...'),
        indent: 2,
        spinner: 'dots',
        color: 'magenta',
      }).start();

      const result = await chatCompletion(credentials, conversationHistory, toolDefinitions);
      const choice = result.choices?.[0];

      if (!choice) {
        spinner.stop();
        printError('No response from model.');
        break;
      }

      const message = choice.message;

      // If the model wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        spinner.stop();

        // Add assistant message with tool_calls to history
        conversationHistory.push(message);

        // Execute each tool call
        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs;
          try {
            fnArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            fnArgs = {};
          }

          printToolCall(fnName, fnArgs);

          const toolResult = executeTool(fnName, fnArgs);

          // Add tool result to history
          conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        // Continue the loop so the model can process tool results
        continue;
      }

      // No tool calls — this is the final text response
      spinner.stop();

      const content = message.content || '';
      if (content) {
        conversationHistory.push({ role: 'assistant', content });
        const formatted = formatMarkdown(content);
        console.log(formatted.replace(/^/gm, '  '));
      }

      break;
    }
  } catch (err) {
    printError(err.message);
    // Remove the failed user message
    conversationHistory.pop();
  }

  printAssistantEnd();
  isStreaming = false;
  rl.prompt();
}

main().catch((err) => {
  printError(err.message);
  process.exit(1);
});
