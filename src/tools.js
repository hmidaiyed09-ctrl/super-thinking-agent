const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const cwd = process.cwd();

function getSystemPrompt() {
  return `You are Super Thinking Agent, a powerful AI coding assistant running inside the user's terminal.
You have full access to the user's filesystem with administrator privileges.

Current working directory: ${cwd}
Operating System: ${process.platform} (${process.arch})
Date: ${new Date().toLocaleDateString()}

You have the following tools available:
- list_files: List files and folders in a directory
- read_file: Read the contents of any file
- create_file: Create a new file (any extension) with content, or overwrite an existing file
- edit_file: Edit an existing file by replacing old text with new text
- delete_file: Delete any file or empty folder

IMPORTANT RULES:
1. When the user asks about files, ALWAYS start by listing the ROOT working directory "." FIRST, then explore subdirectories. Never skip the root.
2. Be proactive and thorough. If the user mentions a file (e.g. "the html file"), YOU must find it yourself by searching. NEVER ask the user for the filename or path — use your tools to locate it.
3. If you don't find something in the first directory, keep searching subdirectories until you find it or exhaust all options.
4. When the user asks you to look at files, read code, list directories, or delete things — USE the tools. Don't guess file contents.
5. Always confirm before deleting files by telling the user what you're about to delete, unless they explicitly told you to delete it.
6. NEVER say "I can't find it, can you tell me the path?" — instead, search harder.`;
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
      description: 'Delete a file or empty directory at the given path. Use with caution.',
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
];

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

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function printToolCall(name, args) {
  const icons = { list_files: '📂', read_file: '📄', create_file: '✏️', edit_file: '📝', delete_file: '🗑️' };
  const icon = icons[name] || '🔧';
  const argStr = Object.values(args).join(', ');
  console.log(chalk.gray(`  ${icon} `) + chalk.yellow(`${name}`) + chalk.gray(`(${argStr})`));
}

module.exports = { getSystemPrompt, toolDefinitions, executeTool, printToolCall };
