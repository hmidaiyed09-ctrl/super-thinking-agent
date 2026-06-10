/**
 * Assembly Line Engine — The "Factory Assembly Line" method for self-correcting AI code generation.
 *
 * Instead of one AI checking its own work (blind spot problem), this uses:
 *   Step 1: Test-Driven — Write the "grading rubric" (tests) FIRST before any code
 *   Step 2: Two-Brain   — Separate "Maker" and "Breaker" AI personas
 *   Step 3: Three Strikes — Max 3 fix attempts, then scrap and restart from scratch
 */

const chalk = require('chalk');
const ora = require('ora');
const { chatCompletion } = require('./api');

// ─── System Prompts for each persona ───────────────────────────────

const RUBRIC_WRITER_PROMPT = `You are a strict QA architect. Your ONLY job is to write a grading rubric — a set of concrete, testable acceptance criteria — for the task the user describes.

Rules:
1. Output a numbered list of PASS/FAIL checks. Each check must be specific and unambiguous.
2. Include: functional correctness, edge cases, error handling, security considerations, and code quality.
3. For code tasks, write actual test cases or assertions in pseudocode that can be verified.
4. Do NOT write the solution. Do NOT write code that implements the feature. ONLY write the tests/criteria.
5. Be harsh and thorough — you are the last line of defense.

Format your output as:
## Grading Rubric
1. [CHECK] Description of what must be true
2. [CHECK] ...
...
## Test Cases (pseudocode)
- test_name: input → expected_output
- ...`;

const MAKER_PROMPT = `You are an expert senior software engineer — the "Maker." Your ONLY job is to write creative, working solutions as fast as possible.

Rules:
1. You will receive the user's original request AND a grading rubric with test criteria.
2. Write complete, production-quality code that passes ALL rubric checks.
3. Be thorough — think about the rubric criteria as you code.
4. Output ONLY the solution (code, explanations, file contents). No fluff.
5. If you used tools to create/edit files, summarize exactly what you did.`;

const BREAKER_PROMPT = `You are a ruthless code inspector — the "Breaker." Your ONLY job is to find bugs, flaws, and failures.

You did NOT write this code. You have no attachment to it. Be suspicious of everything.

Rules:
1. You will receive: the original request, the grading rubric, and the Maker's solution.
2. Go through EVERY rubric check one by one and grade it PASS or FAIL.
3. Look for: logic errors, off-by-one errors, missing edge cases, security holes, race conditions, incorrect assumptions, missing error handling, bad naming, and violations of the rubric.
4. Be BRUTALLY honest. If something is wrong, say so clearly.
5. Do NOT be nice. Do NOT give the benefit of the doubt.

Format your output as:
## Inspection Report
1. [PASS/FAIL] Rubric check description — explanation
2. [PASS/FAIL] ...
...
## Verdict: PASS or FAIL
## Bugs Found (if any):
- Bug 1: description + location + severity
- ...
## Required Fixes (if FAIL):
- Fix 1: exactly what needs to change`;

const RETRY_MAKER_PROMPT = `You are the Maker. Your previous attempt FAILED inspection.

You will receive:
1. The original request
2. The grading rubric
3. Your PREVIOUS failed attempt
4. The Inspector's report showing exactly what went wrong

Rules:
1. Fix EVERY issue the Inspector found. Do not skip any.
2. Re-check against the FULL rubric — not just the failed items.
3. This is attempt {attempt} of 3. If you fail again, your code gets SCRAPPED entirely.
4. Do NOT repeat the same mistakes. Think differently if needed.`;

const FRESH_START_PROMPT = `You are the Maker. Your previous approach has been SCRAPPED after 3 failed attempts.

The Inspector kept finding the same issues. Your old approach is fundamentally flawed.

Rules:
1. You MUST use a COMPLETELY DIFFERENT approach, architecture, or algorithm.
2. Do NOT look at your old code. Pretend it never existed.
3. Re-read the rubric carefully and design from scratch.
4. Think about WHY your old approach kept failing and avoid those patterns entirely.
5. This is a fresh start — make it count.`;


// ─── Assembly Line Runner ──────────────────────────────────────────

const MAX_STRIKES = 3;

/**
 * Run the full assembly line for a user request.
 *
 * @param {object} credentials - API credentials { baseUrl, apiKey, model }
 * @param {string} userInput   - The user's original request
 * @param {Array}  conversationHistory - The conversation so far (for context)
 * @param {Array}  tools       - Tool definitions for the Maker to use
 * @param {Function} executeTool - Function to execute tool calls
 * @param {Function} printToolCall - Function to print tool call info
 * @param {Function} isModifyingTool - Function to check if a tool modifies files
 * @returns {{ finalResponse: string, madeFileChanges: boolean, changeSummary: string[] }}
 */
async function runAssemblyLine(credentials, userInput, conversationHistory, tools, executeTool, printToolCall, isModifyingTool) {
  let madeFileChanges = false;
  const changeSummary = [];

  // ── Step 1: Write the Grading Rubric ──────────────────────────
  printPhase('Step 1', 'Writing Grading Rubric', '📋');

  const spinner1 = makeSpinner('Generating acceptance criteria...');
  const rubric = await callAI(credentials, RUBRIC_WRITER_PROMPT,
    `Here is the task to create a grading rubric for:\n\n${userInput}`, []);
  spinner1.stop();

  printOutput('Rubric', rubric, 'cyan');

  // ── Step 2: Maker + Breaker Loop (with 3-strike rule) ─────────
  let makerOutput = '';
  let attempt = 0;
  let passed = false;
  let inspectionReport = '';
  let freshStart = false;

  while (attempt < MAX_STRIKES && !passed) {
    attempt++;

    // ── Maker Phase ─────────────────────────────────────────────
    const isRetry = attempt > 1;
    const isFreshStart = freshStart;
    freshStart = false; // reset

    let makerSystemPrompt;
    let makerUserContent;

    if (isFreshStart) {
      printPhase('Step 2', `Maker — FRESH START (previous approach scrapped)`, '🔄');
      makerSystemPrompt = FRESH_START_PROMPT;
      makerUserContent = `## Original Request\n${userInput}\n\n## Grading Rubric\n${rubric}\n\nBuild a COMPLETELY NEW solution from scratch. Do NOT repeat the old approach.`;
    } else if (isRetry) {
      printPhase('Step 2', `Maker — Attempt ${attempt}/${MAX_STRIKES} (fixing issues)`, '🔧');
      makerSystemPrompt = RETRY_MAKER_PROMPT.replace('{attempt}', attempt);
      makerUserContent = `## Original Request\n${userInput}\n\n## Grading Rubric\n${rubric}\n\n## Your Previous Attempt\n${makerOutput}\n\n## Inspector's Report\n${inspectionReport}\n\nFix all issues and resubmit.`;
    } else {
      printPhase('Step 2', `Maker — Attempt ${attempt}/${MAX_STRIKES}`, '🔨');
      makerSystemPrompt = MAKER_PROMPT;
      makerUserContent = `## Original Request\n${userInput}\n\n## Grading Rubric\n${rubric}\n\nBuild the solution now. Make sure it passes every rubric check.`;
    }

    const spinnerM = makeSpinner(`Maker is building (attempt ${attempt}/${MAX_STRIKES})...`);

    // Run maker with tool support (so it can create/edit files)
    const makerResult = await callAIWithTools(
      credentials, makerSystemPrompt, makerUserContent, tools,
      executeTool, printToolCall, isModifyingTool, spinnerM
    );

    makerOutput = makerResult.textResponse;
    if (makerResult.madeChanges) madeFileChanges = true;
    changeSummary.push(...makerResult.changeSummary);

    spinnerM.stop();
    printOutput('Maker Output', makerOutput, 'green');

    // ── Breaker Phase ───────────────────────────────────────────
    printPhase('Step 2', `Breaker — Inspecting attempt ${attempt}`, '🔍');

    const spinnerB = makeSpinner('Inspector is reviewing...');
    inspectionReport = await callAI(credentials, BREAKER_PROMPT,
      `## Original Request\n${userInput}\n\n## Grading Rubric\n${rubric}\n\n## Maker's Solution\n${makerOutput}\n\nInspect this solution against every rubric check.`, []);
    spinnerB.stop();

    printOutput('Inspection Report', inspectionReport, 'red');

    // ── Check verdict ───────────────────────────────────────────
    passed = checkVerdict(inspectionReport);

    if (passed) {
      printPhase('Result', 'PASSED inspection! ✅', '✅');
    } else if (attempt < MAX_STRIKES) {
      printPhase('Result', `FAILED inspection (attempt ${attempt}/${MAX_STRIKES}) — retrying...`, '❌');
    } else {
      // 3 strikes — scrap and restart
      printPhase('Step 3', '3 STRIKES — Scrapping code and starting fresh! 🗑️', '🗑️');
      attempt = 0; // Reset counter for the fresh start
      freshStart = true;
      passed = false;

      // Give one more full cycle with fresh start
      attempt++; // Will be attempt 1 of the new cycle

      printPhase('Step 2', `Maker — FRESH START`, '🔄');
      const spinnerFS = makeSpinner('Maker is rebuilding from scratch...');

      const freshResult = await callAIWithTools(
        credentials, FRESH_START_PROMPT,
        `## Original Request\n${userInput}\n\n## Grading Rubric\n${rubric}\n\n## Previous Inspector Reports (what kept failing)\n${inspectionReport}\n\nBuild a COMPLETELY NEW solution. Different approach, different architecture.`,
        tools, executeTool, printToolCall, isModifyingTool, spinnerFS
      );

      makerOutput = freshResult.textResponse;
      if (freshResult.madeChanges) madeFileChanges = true;
      changeSummary.push(...freshResult.changeSummary);
      spinnerFS.stop();

      printOutput('Fresh Start Output', makerOutput, 'green');

      // Final inspection of the fresh start
      printPhase('Step 2', 'Breaker — Final inspection of fresh start', '🔍');
      const spinnerFB = makeSpinner('Inspector reviewing fresh approach...');
      inspectionReport = await callAI(credentials, BREAKER_PROMPT,
        `## Original Request\n${userInput}\n\n## Grading Rubric\n${rubric}\n\n## Maker's Fresh Solution\n${makerOutput}\n\nInspect this completely new solution.`, []);
      spinnerFB.stop();

      printOutput('Final Inspection', inspectionReport, 'red');
      passed = checkVerdict(inspectionReport);

      if (passed) {
        printPhase('Result', 'Fresh start PASSED! ✅', '✅');
      } else {
        printPhase('Result', 'Fresh start still has issues — delivering best effort.', '⚠️');
      }

      break; // Exit the loop regardless after fresh start
    }
  }

  // ── Build final response for the user ─────────────────────────
  const finalResponse = buildFinalResponse(makerOutput, inspectionReport, passed, attempt);

  return { finalResponse, madeFileChanges, changeSummary };
}


// ─── Helper: Call AI (simple, no tools) ────────────────────────────

async function callAI(credentials, systemPrompt, userContent, tools) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  const result = await chatCompletion(credentials, messages, tools);
  return result.choices?.[0]?.message?.content || '(no response)';
}


// ─── Helper: Call AI with tool execution loop ──────────────────────

async function callAIWithTools(credentials, systemPrompt, userContent, tools, executeTool, printToolCall, isModifyingTool, spinner) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  let textResponse = '';
  let madeChanges = false;
  const changeSummary = [];
  let iterations = 30;

  while (iterations-- > 0) {
    spinner.stop();
    const result = await chatCompletion(credentials, messages, tools);
    const choice = result.choices?.[0];
    if (!choice) break;

    const message = choice.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        if (fnName === 'continue') {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true, message: 'Continue working.' }),
          });
          continue;
        }

        let fnArgs;
        try {
          fnArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          fnArgs = {};
        }

        printToolCall(fnName, fnArgs);
        const toolResult = executeTool(fnName, fnArgs);

        if (isModifyingTool(fnName) && toolResult.success) {
          madeChanges = true;
          changeSummary.push(`${fnName}: ${fnArgs.file_path || fnArgs.path || ''}`);
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      spinner.start();
      continue;
    }

    // Text response — done
    textResponse = message.content || '';
    break;
  }

  return { textResponse, madeChanges, changeSummary };
}


// ─── Helper: Check if the Inspector passed the code ────────────────

function checkVerdict(report) {
  const lower = report.toLowerCase();
  // Look for "Verdict: PASS" — the Breaker's required output format
  const verdictMatch = lower.match(/verdict\s*:\s*(pass|fail)/);
  if (verdictMatch) {
    return verdictMatch[1] === 'pass';
  }
  // Fallback heuristics
  const failCount = (lower.match(/\[fail\]/g) || []).length;
  const passCount = (lower.match(/\[pass\]/g) || []).length;
  return failCount === 0 && passCount > 0;
}


// ─── Helper: Build human-friendly final response ───────────────────

function buildFinalResponse(makerOutput, inspectionReport, passed, attempts) {
  let response = '';

  if (passed) {
    response += `✅ **Solution passed all inspection checks** (${attempts} attempt${attempts > 1 ? 's' : ''}).\n\n`;
  } else {
    response += `⚠️ **Best-effort solution** — some inspection checks may not fully pass.\n\n`;
  }

  response += makerOutput;
  return response;
}


// ─── UI Helpers ────────────────────────────────────────────────────

function printPhase(step, description, icon) {
  console.log('');
  console.log(chalk.cyan(`  ${icon} `) + chalk.cyan.bold(`[${step}] `) + chalk.white(description));
}

function printOutput(label, text, color) {
  const colorFn = chalk[color] || chalk.white;
  const lines = text.split('\n');
  const maxLines = 20;
  const truncated = lines.length > maxLines;
  const display = truncated ? lines.slice(0, maxLines) : lines;

  console.log(colorFn(`  ┌─ ${label} ─────────────────────────────────`));
  for (const line of display) {
    console.log(colorFn('  │ ') + chalk.gray(line));
  }
  if (truncated) {
    console.log(colorFn('  │ ') + chalk.gray(`... (${lines.length - maxLines} more lines)`));
  }
  console.log(colorFn('  └──────────────────────────────────────────'));
}

function makeSpinner(text) {
  return ora({
    text: chalk.gray(text),
    indent: 4,
    spinner: 'dots',
    color: 'yellow',
  }).start();
}


module.exports = { runAssemblyLine };
