#!/usr/bin/env node

const readline = require('readline');
const chalk = require('chalk');
const ora = require('ora');
const { setupCredentials } = require('./config');
const { chatCompletion } = require('./api');
const { getSystemPrompt, toolDefinitions, executeTool, printToolCall, isModifyingTool } = require('./tools');
const { gitInit, autoCommit, printCommit } = require('./git');
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
  printThinkingHeader,
  printThinkingContent,
  printThinkingEnd,
  printThinkingStatus,
} = require('./ui');

let conversationHistory = [];
let credentials = null;
let isStreaming = false;
let pendingChanges = false;
let thinkingDepth = 0; // 0 = off, 1+ = number of thinking rounds

async function main() {
  printBanner();

  credentials = await setupCredentials();

  // Auto git init
  gitInit();

  // Inject system prompt with filesystem context
  conversationHistory.push({ role: 'system', content: getSystemPrompt() });

  printInfo(`Connected to ${chalk.yellow(credentials.model)} at ${chalk.gray(credentials.baseUrl)}`);
  printInfo(`Working directory: ${chalk.yellow(process.cwd())}`);
  console.log(chalk.gray('  Type /help for commands. Press Ctrl+G to commit changes.\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan.bold('  ❯ '),
    terminal: true,
  });

  // Listen for Ctrl+G (ASCII 7 = BEL = Ctrl+G)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on('data', (key) => {
      const ch = key.toString();

      // Ctrl+G = \x07
      if (ch === '\x07') {
        if (pendingChanges) {
          commitPendingChanges();
        } else {
          console.log('');
          printInfo('No pending changes to commit.');
        }
        rl.prompt();
        return;
      }

      // Ctrl+C
      if (ch === '\x03') {
        console.log('');
        printInfo('Goodbye! 👋');
        process.exit(0);
      }

      // Pass all other keys through to readline
      rl.write(key);
    });
  }

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith('/')) {
      const handled = await handleCommand(input, rl);
      if (!handled) rl.prompt();
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

function commitPendingChanges() {
  const hash = autoCommit('Changes by Super Thinking Agent');
  if (hash) {
    printCommit(hash, 'Changes accepted & committed');
    pendingChanges = false;
  } else {
    printInfo('Nothing to commit.');
  }
}

async function handleCommand(input, rl) {
  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      printHelp();
      return false;
    case '/config':
      credentials = await setupCredentials(true);
      printInfo(`Now using ${chalk.yellow(credentials.model)} at ${chalk.gray(credentials.baseUrl)}`);
      return false;
    case '/clear':
      conversationHistory = [{ role: 'system', content: getSystemPrompt() }];
      printInfo('Conversation history cleared.');
      return false;
    case '/history':
      printHistory(conversationHistory.filter((m) => m.role !== 'system' && m.role !== 'tool'));
      return false;
    case '/model':
      printModelInfo(credentials);
      return false;
    case '/thinking': {
      const n = parseInt(parts[1], 10);
      if (isNaN(n) || n < 0) {
        printError('Usage: /thinking <number> [message]  (e.g. /thinking 3 how does AI work?)');
        return false;
      }
      thinkingDepth = n;
      printThinkingStatus(thinkingDepth);
      // If there's a message after the number, send it immediately
      const inlineMessage = parts.slice(2).join(' ').trim();
      if (inlineMessage) {
        await sendMessage(inlineMessage, rl);
        return true; // sendMessage already prompts
      }
      return false;
    }
    case '/commit':
      commitPendingChanges();
      return false;
    case '/exit':
    case '/quit':
      console.log('');
      printInfo('Goodbye! 👋');
      process.exit(0);
      break;
    default:
      printError(`Unknown command: ${cmd}. Type /help for available commands.`);
      return false;
  }
}

// ─── Deep Thinking Engine ─────────────────────────────────────────

async function runThinkingRounds(userInput) {
  const thinkingPrompts = [];

  for (let round = 1; round <= thinkingDepth; round++) {
    printThinkingHeader(round, thinkingDepth);

    const spinner = ora({
      text: chalk.gray(`Deep thinking round ${round}/${thinkingDepth}...`),
      indent: 4,
      spinner: 'dots',
      color: 'yellow',
    }).start();

    let thinkingSystemPrompt;

    if (round === 1) {
      // First round: deep analysis
      thinkingSystemPrompt = `You are in DEEP THINKING MODE. Your job is NOT to answer the user's question yet.
Instead, deeply analyze the problem:
- Break it down into sub-problems
- Consider edge cases, constraints, and potential pitfalls
- Think about multiple approaches and their trade-offs
- Identify what information you need
- Question your own assumptions
- Think outside the box — consider unconventional approaches
- If there's code involved, think about architecture, patterns, and potential bugs

Be thorough and critical. This is internal reasoning — be raw and honest in your analysis.`;
    } else {
      // Subsequent rounds: refine previous reasoning
      thinkingSystemPrompt = `You are in DEEP THINKING MODE (round ${round}/${thinkingDepth}).

Here is your previous reasoning:
---
${thinkingPrompts.join('\n---\n')}
---

Now go DEEPER:
- Find flaws or gaps in your previous reasoning
- Explore approaches you haven't considered
- Challenge your own assumptions — are they actually true?
- If you found an approach, mentally test it — does it actually work?
- Think about what could go wrong
- Refine and improve your analysis
- Consider the user's real intent behind the question
- Think outside the box — would a completely different approach be better?

Build on your previous thinking but push further. Be critical of yourself.`;
    }

    const thinkingMessages = [
      { role: 'system', content: thinkingSystemPrompt },
      { role: 'user', content: userInput },
    ];

    try {
      const result = await chatCompletion(credentials, thinkingMessages, []);
      const thought = result.choices?.[0]?.message?.content || '';
      spinner.stop();

      if (thought) {
        thinkingPrompts.push(thought);
        printThinkingContent(thought);
      }
    } catch (err) {
      spinner.stop();
      printThinkingContent(`(Error in thinking round ${round}: ${err.message})`);
    }

    printThinkingEnd();
  }

  return thinkingPrompts.join('\n\n---\n\n');
}

// ─── Main Message Handler ─────────────────────────────────────────

async function sendMessage(userInput, rl) {
  printUserMessage(userInput);

  isStreaming = true;

  let madeFileChanges = false;
  let changeSummary = [];

  try {
    // If thinking is enabled, run thinking rounds first
    let thinkingContext = '';
    if (thinkingDepth > 0) {
      thinkingContext = await runThinkingRounds(userInput);
    }

    // Build the actual user message with thinking context
    printAssistantHeader();

    if (thinkingContext) {
      // Inject thinking as a system-level context so the AI uses it for the final answer
      conversationHistory.push({
        role: 'user',
        content: userInput,
      });
      conversationHistory.push({
        role: 'system',
        content: `DEEP THINKING ANALYSIS — use this reasoning to craft the best possible response. Do NOT repeat the thinking process to the user. Just use it to give a refined, accurate, and thorough answer.

${thinkingContext}`,
      });
    } else {
      conversationHistory.push({ role: 'user', content: userInput });
    }

    // Tool-calling loop
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

      if (message.tool_calls && message.tool_calls.length > 0) {
        spinner.stop();
        conversationHistory.push(message);

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

          if (isModifyingTool(fnName) && toolResult.success) {
            madeFileChanges = true;
            changeSummary.push(`${fnName}: ${fnArgs.file_path}`);
          }

          conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        continue;
      }

      // Final text response
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
    conversationHistory.pop();
  }

  // Auto-commit if file changes were made
  if (madeFileChanges) {
    const commitMsg = `Agent: ${changeSummary.join(', ')}`;
    const hash = autoCommit(commitMsg);
    if (hash) {
      printCommit(hash, commitMsg);
      pendingChanges = false;
    } else {
      pendingChanges = true;
    }
  }

  printAssistantEnd();
  isStreaming = false;
  rl.prompt();
}

main().catch((err) => {
  printError(err.message);
  process.exit(1);
});
