const Conf = require('conf');
const chalk = require('chalk');

const config = new Conf({ projectName: 'super-thinking-agent' });

const CONFIG_KEYS = {
  BASE_URL: 'baseUrl',
  API_KEY: 'apiKey',
  MODEL: 'model',
};

/**
 * Ask a question using a provided askFn.
 * askFn(prompt) => Promise<string>
 */
async function setupCredentials(force = false, askFn = null) {
  const existing = {
    baseUrl: config.get(CONFIG_KEYS.BASE_URL),
    apiKey: config.get(CONFIG_KEYS.API_KEY),
    model: config.get(CONFIG_KEYS.MODEL),
  };

  if (existing.baseUrl && existing.apiKey && existing.model && !force) {
    return existing;
  }

  console.log('');
  console.log(chalk.cyan.bold('  ⚙  Credentials Setup'));
  console.log(chalk.gray('  ─────────────────────────────────'));
  console.log('');

  // If no askFn provided (first run, no rl yet), use basic stdin
  if (!askFn) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    askFn = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    const result = await doPrompts(askFn, existing);

    rl.close();
    return result;
  }

  return doPrompts(askFn, existing);
}

async function doPrompts(askFn, existing) {
  const defUrl = existing.baseUrl || 'https://api.openai.com/v1';
  const defModel = existing.model || 'gpt-4o';

  const baseUrl = await askFn(chalk.white('  Base URL') + chalk.gray(` (${defUrl}): `));
  const apiKey = await askFn(chalk.white('  API Key') + chalk.gray(existing.apiKey ? ` (${existing.apiKey.slice(0, 8)}•••): ` : ': '));
  const model = await askFn(chalk.white('  Model') + chalk.gray(` (${defModel}): `));

  const finalUrl = baseUrl.trim() || defUrl;
  const finalKey = apiKey.trim() || existing.apiKey || '';
  const finalModel = model.trim() || defModel;

  if (!finalKey) {
    console.log(chalk.red('  ✖ API Key is required.'));
    return existing;
  }

  config.set(CONFIG_KEYS.BASE_URL, finalUrl);
  config.set(CONFIG_KEYS.API_KEY, finalKey);
  config.set(CONFIG_KEYS.MODEL, finalModel);

  console.log('');
  console.log(chalk.green('  ✔ Credentials saved successfully!'));
  console.log('');

  return { baseUrl: finalUrl, apiKey: finalKey, model: finalModel };
}

function getCredentials() {
  return {
    baseUrl: config.get(CONFIG_KEYS.BASE_URL),
    apiKey: config.get(CONFIG_KEYS.API_KEY),
    model: config.get(CONFIG_KEYS.MODEL),
  };
}

function clearCredentials() {
  config.clear();
}

module.exports = { setupCredentials, getCredentials, clearCredentials };
