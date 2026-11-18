import chalk from 'chalk';
import ora from 'ora';
import Conf from 'conf';
import { drsApi } from '../services/api';

const config = new Conf({ projectName: 'drs-cli' });

interface LoginOptions {
  username?: string;
  password?: string;
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  let username = options.username;
  let password = options.password;

  const inquirer = (await import('inquirer')).default;

  if (!username) {
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'username',
      message: 'Username or email:'
    }]);
    username = answer.username;
  }

  if (!password) {
    const answer = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '*'
    }]);
    password = answer.password;
  }

  const spinner = ora('Authenticating...').start();

  try {
    const response = await drsApi.post('/auth/login', {
      email: username,
      password
    });

    const token = response.data.data.tokens.accessToken;
    config.set('token', token);
    config.set('username', response.data.data.user.username);

    spinner.stop();
    console.log(chalk.green('\n✅ Login successful!'));
    console.log(chalk.gray(`  Welcome, ${response.data.data.user.username}!`));
    console.log();
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Login failed:'), error.response?.data?.error?.message || error.message);
  }
}
