const { execSync } = require('child_process');
const chalk = require('chalk');

const cwd = process.cwd();

function run(cmd) {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function isGitRepo() {
  try {
    run('git rev-parse --is-inside-work-tree');
    return true;
  } catch {
    return false;
  }
}

function gitInit() {
  if (isGitRepo()) {
    console.log(chalk.gray('  ℹ Git repo already initialized.'));
    return true;
  }
  try {
    run('git init');
    run('git add -A');
    try {
      run('git commit -m "Initial commit — Super Thinking Agent"');
    } catch {
      // empty repo, nothing to commit
    }
    console.log(chalk.green('  ✔ Git initialized and initial commit created.'));
    return true;
  } catch (err) {
    console.log(chalk.red('  ✖ Failed to initialize git: ') + chalk.red(err.message));
    return false;
  }
}

function autoCommit(message) {
  try {
    const status = run('git status --porcelain');
    if (!status) return null;

    run('git add -A');
    run(`git commit -m "${message.replace(/"/g, '\\"')}"`);
    const hash = run('git rev-parse --short HEAD');
    return hash;
  } catch {
    return null;
  }
}

function printCommit(hash, message) {
  console.log(chalk.green('  ✔ ') + chalk.gray(`Committed [${chalk.yellow(hash)}] `) + chalk.white(message));
}

module.exports = { gitInit, autoCommit, printCommit };
