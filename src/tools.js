const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { execSync } = require('child_process');

const cwd = process.cwd();

function getSystemPrompt() {
  return `You are Super Thinking Agent — an expert senior software engineer and autonomous coding agent running in the user's terminal.
You think like a real developer: you read existing code before writing, you understand project structure before making changes, and you build complete, working solutions.

# Environment
- Working directory: ${cwd}
- OS: ${process.platform} (${process.arch})
- Shell: ${process.platform === 'win32' ? 'powershell' : 'bash'}
- Date: ${new Date().toLocaleDateString()}

# CRITICAL — First Response Behavior
On your VERY FIRST response (no matter what the user says, even "hi"), you MUST:
1. Call list_files on "." to scan the project root
2. Read key files (package.json, README, config files, main entry points) to understand the project
3. THEN respond with a brief summary of what you found: the project name, tech stack, structure, and what it does
4. NEVER give a generic greeting. ALWAYS explore first, then greet with context.

# How You Work

## Step 1: Understand Before Acting
- ALWAYS use list_files and read_file BEFORE responding to ANY question about the codebase.
- Read existing files (package.json, README, config files, existing source code) to understand the project structure, tech stack, conventions, and dependencies BEFORE writing any code.
- If the user references a file (e.g. "the html file"), find it yourself using list_files recursively. NEVER ask the user for paths.

## Step 2: Plan, Then Execute File by File
- When creating a project or making multi-file changes, work methodically: create/edit ONE file at a time across MULTIPLE responses.
- Do NOT try to create an entire project in a single response. Create the folder structure first, then populate files one by one.
- For a new project, follow this order:
  1. Create the project directory structure (mkdir via run_command)
  2. Create config files (package.json, tsconfig.json, .gitignore, etc.)
  3. Create source files one at a time, starting from the foundation (models/types → utilities → core logic → UI/routes → entry point)
  4. Install dependencies (npm install, pip install, etc.)
  5. Verify the project works (run build, run lint, run the app)

## Step 3: Write Production-Quality Code
- Write complete, working code — never use placeholders like "// TODO" or "// add your code here" or "...".
- Every file you create must be fully functional with real implementations.
- Follow the conventions of the project's tech stack (React patterns for React, Express patterns for Express, etc.).
- Include proper imports, error handling, and types where appropriate.

## Step 4: Continue Until Done
- After each response, evaluate if your task is complete. If there are more files to create or steps to finish, CONTINUE working in the next response by using the "continue" tool.
- You MUST call the "continue" tool to keep going when:
  - A project has more files that need to be created
  - Dependencies need to be installed after file creation
  - Code needs to be tested or verified after writing
  - Any multi-step task is not yet finished
- NEVER stop in the middle of a task and ask the user to tell you to continue. Just continue automatically.

# Tools
- list_files: List files/folders in a directory
- read_file: Read any file's contents (always read before editing!)
- create_file: Create or overwrite a file with full content (creates parent dirs automatically)
- edit_file: Edit a file by exact text replacement (read the file first to get the exact text!)
- delete_file: Delete a file or directory
- run_command: Execute ANY shell command (git, npm, pip, node, python, mkdir, curl, etc.)
- continue: Signal that you have more work to do. Call this when your current task is not yet complete.

# Rules
1. NEVER guess file contents — always read_file first before editing.
2. NEVER say "I can't do that" — use run_command for anything not covered by other tools.
3. NEVER leave a task half-finished. Use the "continue" tool to keep working across multiple responses.
4. NEVER output placeholder code. Every line must be real, working code.
5. When reading files, read the FULL file, not just part of it.
6. For large projects, create files one at a time across multiple tool-call rounds — do not rush everything into one response.
7. All file changes are auto-committed to git.`;
}

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all files and directories in the given directory path. Returns file names, sizes, and types (file or directory).',
      parameters: {
        type: 'object',
        properties: {
          dir_path: {
            type: 'string',
            description: 'The absolute or relative path of the directory to list. Use "." for current directory.',
          },
        },
        required: ['dir_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read and return the full contents of a file at the given path.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute or relative path of the file to read.',
          },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create a new file with the given content. Creates parent directories automatically. Can create any file type (.html, .js, .py, .txt, etc). If the file already exists, it will be overwritten.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute or relative path for the new file.',
          },
          content: {
            type: 'string',
            description: 'The full content to write into the file.',
          },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit an existing file by finding and replacing text. The old_text must exist exactly in the file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The path of the file to edit.',
          },
          old_text: {
            type: 'string',
            description: 'The exact text to find in the file.',
          },
          new_text: {
            type: 'string',
            description: 'The text to replace it with.',
          },
        },
        required: ['file_path', 'old_text', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory at the given path. Use with caution.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute or relative path of the file or directory to delete.',
          },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute any shell command on the user\'s computer. Use for: git commands (log, status, diff, reset, push, pull), installing packages (npm install, pip install), running scripts, system commands, and anything else. You have full admin access.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute (e.g. "git log --oneline -10", "npm install express", "dir", "python script.py").',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'continue',
      description: 'Call this tool when you have MORE work to do to complete the user\'s task. This signals that you are not done yet and will continue working in the next round. You MUST call this instead of stopping when: (1) there are more files to create, (2) dependencies need to be installed, (3) code needs testing, (4) any part of the task remains incomplete. Include a brief plan of what you will do next.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Brief description of what remains to be done and what you will do next.',
          },
        },
        required: ['reason'],
      },
    },
  },
];

// Track which tools modify files (for auto-commit)
const MODIFYING_TOOLS = new Set(['create_file', 'edit_file', 'delete_file']);

function isModifyingTool(name) {
  return MODIFYING_TOOLS.has(name);
}

function resolvePath(p) {
  if (path.isAbsolute(p)) return p;
  return path.resolve(cwd, p);
}

function executeTool(name, args) {
  switch (name) {
    case 'list_files':
      return listFiles(args.dir_path);
    case 'read_file':
      return readFile(args.file_path);
    case 'create_file':
      return createFile(args.file_path, args.content);
    case 'edit_file':
      return editFile(args.file_path, args.old_text, args.new_text);
    case 'delete_file':
      return deleteFile(args.file_path);
    case 'run_command':
      return runCommand(args.command);
    case 'continue':
      return { success: true, message: `Continuing: ${args.reason}` };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function listFiles(dirPath) {
  const resolved = resolvePath(dirPath);
  try {
    if (!fs.existsSync(resolved)) {
      return { error: `Directory not found: ${resolved}` };
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { error: `Not a directory: ${resolved}` };
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries.map((entry) => {
      const fullPath = path.join(resolved, entry.name);
      try {
        const s = fs.statSync(fullPath);
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isDirectory() ? null : formatSize(s.size),
          modified: s.mtime.toISOString(),
        };
      } catch {
        return { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' };
      }
    });

    return { path: resolved, total: items.length, items };
  } catch (err) {
    return { error: `Failed to list directory: ${err.message}` };
  }
}

function readFile(filePath) {
  const resolved = resolvePath(filePath);
  try {
    if (!fs.existsSync(resolved)) {
      return { error: `File not found: ${resolved}` };
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return { error: `Path is a directory, not a file: ${resolved}` };
    }
    if (stat.size > 1024 * 1024) {
      return { error: `File too large (${formatSize(stat.size)}). Max 1MB.` };
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    return { path: resolved, size: formatSize(stat.size), content };
  } catch (err) {
    return { error: `Failed to read file: ${err.message}` };
  }
}

function createFile(filePath, content) {
  const resolved = resolvePath(filePath);
  try {
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, 'utf-8');
    return { success: true, message: `Created file: ${resolved}`, size: formatSize(Buffer.byteLength(content, 'utf-8')) };
  } catch (err) {
    return { error: `Failed to create file: ${err.message}` };
  }
}

function editFile(filePath, oldText, newText) {
  const resolved = resolvePath(filePath);
  try {
    if (!fs.existsSync(resolved)) {
      return { error: `File not found: ${resolved}` };
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    if (!content.includes(oldText)) {
      return { error: `Could not find the specified text in ${resolved}` };
    }
    const updated = content.replace(oldText, newText);
    fs.writeFileSync(resolved, updated, 'utf-8');
    return { success: true, message: `Edited file: ${resolved}` };
  } catch (err) {
    return { error: `Failed to edit file: ${err.message}` };
  }
}

function deleteFile(filePath) {
  const resolved = resolvePath(filePath);
  try {
    if (!fs.existsSync(resolved)) {
      return { error: `Path not found: ${resolved}` };
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true });
      return { success: true, message: `Deleted directory: ${resolved}` };
    } else {
      fs.unlinkSync(resolved);
      return { success: true, message: `Deleted file: ${resolved}` };
    }
  } catch (err) {
    return { error: `Failed to delete: ${err.message}` };
  }
}

function runCommand(command) {
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 5,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: output.trim() || '(no output)' };
  } catch (err) {
    return {
      success: false,
      exitCode: err.status,
      output: (err.stdout || '').trim(),
      error: (err.stderr || err.message || '').trim(),
    };
  }
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function printToolCall(name, args) {
  const icons = { list_files: '📂', read_file: '📄', create_file: '✏️', edit_file: '📝', delete_file: '🗑️', run_command: '⚡', continue: '🔄' };
  const icon = icons[name] || '🔧';
  let argStr;
  if (name === 'run_command') {
    argStr = args.command;
  } else if (name === 'create_file') {
    argStr = args.file_path;
  } else {
    argStr = Object.values(args).join(', ');
  }
  console.log(chalk.gray(`  ${icon} `) + chalk.yellow(`${name}`) + chalk.gray(`(${argStr})`));
}

module.exports = { getSystemPrompt, toolDefinitions, executeTool, printToolCall, isModifyingTool };
