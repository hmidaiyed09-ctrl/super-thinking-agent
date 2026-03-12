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
let inputPaused = false; // blocks stdin handler during config prompts
let isCancelled = false; // set by Ctrl+E to abort current response
let abortController = null; // AbortController for the current API request

async function main() {
  printBanner();

  credentials = await setupCredentials();

  // Auto git init
  gitInit();

  // Inject system prompt with filesystem context
  conversationHistory.push({ role: 'system', content: getSystemPrompt() });

  printInfo(`Connected to ${chalk.yellow(credentials.model)} at ${chalk.gray(credentials.baseUrl)}`);
  printInfo(`Working directory: ${chalk.yellow(process.cwd())}`);
  console.log(chalk.gray('  Type /help for commands. Ctrl+G to commit, Ctrl+E to cancel response.\n'));

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
      // Skip when config/other prompts are active
      if (inputPaused) return;

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

      // Ctrl+E = \x05 — cancel current response immediately
      if (ch === '\x05') {
        if (isStreaming) {
          isCancelled = true;
          if (abortController) abortController.abort();
          console.log('');
          printInfo('⏹ Response cancelled.');
        }
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
    case '/config': {
      // Pause raw mode so readline works normally for config prompts
      inputPaused = true;
      if (process.stdin.isTTY && process.stdin.isRaw) {
        process.stdin.setRawMode(false);
      }

      const askFn = (prompt) => new Promise((resolve) => {
        rl.question(prompt, (answer) => resolve(answer));
      });

      credentials = await setupCredentials(true, askFn);

      // Restore raw mode
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      inputPaused = false;

      printInfo(`Now using ${chalk.yellow(credentials.model)} at ${chalk.gray(credentials.baseUrl)}`);
      return false;
    }
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
      thinkingSystemPrompt = `You are a deep analytical reasoning engine for software engineering. Your job is NOT to give the final answer — your job is to THINK.

Do the following:
1. **Parse Intent**: What exactly is the user asking for? Consider multiple interpretations and pick the most likely one.
2. **Map the Problem Space**: Break down the problem into sub-problems. What are the inputs, outputs, constraints, and edge cases?
3. **Explore Solutions**: List all viable approaches. For each one, analyze: architecture, tech stack choices, pros, cons, complexity, and maintainability.
4. **Identify the Best Path**: Based on your analysis, which approach is the strongest? Why?
5. **Generate Clarifying Questions**: What questions, if answered, would lead to an even better solution? (Answer them yourself if possible.)

Output your structured reasoning. Do NOT write code — only analysis and planning.`;

    } else {
      thinkingSystemPrompt = `Continue your deep analysis from the previous round. Focus on:
1. **Gaps**: What important aspects did you miss or under-analyze?
2. **Hidden Complexity**: What edge cases, dependencies, or integration challenges exist?
3. **Stress-Test**: Challenge your chosen approach — what could go wrong? How would you mitigate it?
4. **Refine the Plan**: Produce a more detailed, step-by-step implementation plan with specific file names, folder structure, and technology choices.
5. **Self-Q&A**: Ask yourself hard questions and answer them to sharpen the solution.

Continue from exactly where the previous round ended. Go deeper.`;
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
  isCancelled = false;

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

    // Tool-calling loop — high limit so the AI can work across many rounds
    let iterationLimit = 50;
    let wantsContinue = false;

    while (iterationLimit-- > 0) {
      // Check if user pressed Ctrl+E
      if (isCancelled) break;

      const spinner = ora({
        text: chalk.gray('Thinking...'),
        indent: 2,
        spinner: 'dots',
        color: 'magenta',
      }).start();

      abortController = new AbortController();
      let result;
      try {
        result = await chatCompletion(credentials, conversationHistory, toolDefinitions, { signal: abortController.signal });
      } catch (err) {
        spinner.stop();
        if (isCancelled || err.name === 'AbortError') break;
        throw err;
      }

      // Check cancellation right after API returns
      if (isCancelled) {
        spinner.stop();
        break;
      }

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

        wantsContinue = false;

        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs;
          try {
            fnArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            fnArgs = {};
          }

          // Handle "continue" tool — signals the AI wants to keep working
          if (fnName === 'continue') {
            wantsContinue = true;
            console.log(chalk.gray(`  🔄 `) + chalk.cyan(`Continuing: `) + chalk.gray(fnArgs.reason || '...'));
            conversationHistory.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success: true, message: 'Continue working. Pick up where you left off.' }),
            });
            continue;
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

        // If the AI called "continue", loop back for another round
        if (wantsContinue) {
          wantsContinue = false;
          continue;
        }

        continue;
      }

      // The AI gave a final text response
      spinner.stop();

      const content = message.content || '';
      if (content) {
        conversationHistory.push({ role: 'assistant', content });
        const formatted = formatMarkdown(content);
        console.log(formatted.replace(/^/gm, '  '));
      }

      break;
    }

    // If cancelled, add a marker to conversation so the AI knows it was stopped
    if (isCancelled) {
      printInfo('Response cancelled.');
      conversationHistory.push({ role: 'assistant', content: '(Response cancelled by user)' });
    }
  } catch (err) {
    if (!isCancelled) {
      printError(err.message);
      conversationHistory.pop();
    }
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
