const Conf = require('conf');
const inquirer = require('inquirer');
const chalk = require('chalk');

const config = new Conf({ projectName: 'super-thinking-agent' });

const CONFIG_KEYS = {
  BASE_URL: 'baseUrl',
  API_KEY: 'apiKey',
  MODEL: 'model',
};

async function setupCredentials(force = false) {
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

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: chalk.white('Base URL:'),
      default: existing.baseUrl || 'https://api.openai.com/v1',
      validate: (val) => (val.trim() ? true : 'Base URL is required.'),
    },
    {
      type: 'password',
      name: 'apiKey',
      message: chalk.white('API Key:'),
      mask: '•',
      default: existing.apiKey,
      validate: (val) => (val.trim() ? true : 'API Key is required.'),
    },
    {
      type: 'input',
      name: 'model',
      message: chalk.white('Model:'),
      default: existing.model || 'gpt-4o',
      validate: (val) => (val.trim() ? true : 'Model name is required.'),
    },
  ]);

  config.set(CONFIG_KEYS.BASE_URL, answers.baseUrl.trim());
  config.set(CONFIG_KEYS.API_KEY, answers.apiKey.trim());
  config.set(CONFIG_KEYS.MODEL, answers.model.trim());

  console.log('');
  console.log(chalk.green('  ✔ Credentials saved successfully!'));
  console.log('');

  return {
    baseUrl: answers.baseUrl.trim(),
    apiKey: answers.apiKey.trim(),
    model: answers.model.trim(),
  };
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
