#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { chatCommand } from './commands/chat';
import { agentCommand } from './commands/agent';
import { workflowCommand } from './commands/workflow';
import { modelCommand } from './commands/model';
import { statusCommand } from './commands/status';
import { configCommand } from './commands/config';
import { loginCommand } from './commands/login';
import packageJson from '../package.json';

const program = new Command();

program
  .name('drs')
  .description('DRS AI CLI - Command Line Interface for DRS AI OS')
  .version(packageJson.version);

// Login command
program
  .command('login')
  .description('Authenticate with DRS AI')
  .option('-u, --username <username>', 'Username or email')
  .option('-p, --password <password>', 'Password')
  .action(loginCommand);

// Chat command
program
  .command('chat [message]')
  .description('Chat with AI')
  .option('-m, --model <model>', 'Model to use', 'llama3.2')
  .option('-s, --stream', 'Stream response', false)
  .action(chatCommand);

// Agent command
program
  .command('agent')
  .description('Manage and run AI agents')
  .argument('[action]', 'Action: list, run, status')
  .option('-i, --id <id>', 'Agent ID')
  .option('--input <input>', 'Input for the agent')
  .action(agentCommand);

// Workflow command
program
  .command('workflow')
  .description('Manage workflows')
  .argument('[action]', 'Action: list, trigger, status')
  .option('-i, --id <id>', 'Workflow ID')
  .option('-d, --data <data>', 'Trigger data (JSON)')
  .action(workflowCommand);

// Model command
program
  .command('model')
  .description('Manage AI models')
  .argument('[action]', 'Action: list, pull, delete')
  .option('-n, --name <name>', 'Model name')
  .action(modelCommand);

// Status command
program
  .command('status')
  .description('Check system status')
  .action(statusCommand);

// Config command
program
  .command('config')
  .description('Manage configuration')
  .argument('[key]', 'Configuration key')
  .argument('[value]', 'Configuration value')
  .option('--get <key>', 'Get configuration value')
  .option('--set <key> <value>', 'Set configuration value')
  .action(configCommand);

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    console.log(chalk.cyan('🤖 DRS AI Interactive Mode'));
    console.log(chalk.gray('Type "exit" to quit\n'));
    
    const inquirer = (await import('inquirer')).default;
    
    while (true) {
      const { message } = await inquirer.prompt([{
        type: 'input',
        name: 'message',
        message: chalk.green('You:')
      }]);

      if (message.toLowerCase() === 'exit') {
        console.log(chalk.yellow('Goodbye! 👋'));
        break;
      }

      await chatCommand(message, { model: 'llama3.2', stream: false });
    }
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red(`Unknown command: ${program.args.join(' ')}`));
  console.log(chalk.yellow('Run "drs --help" for available commands'));
  process.exit(1);
});

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

program.parse(process.argv);
