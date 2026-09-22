import chalk from 'chalk';
import ora from 'ora';
import { drsApi } from '../services/api';

interface ChatOptions {
  model: string;
  stream: boolean;
}

export async function chatCommand(message: string | undefined, options: ChatOptions): Promise<void> {
  if (!message) {
    console.log(chalk.yellow('Usage: drs chat <message>'));
    console.log(chalk.gray('Example: drs chat "What is the weather today?"'));
    return;
  }

  const spinner = ora('Thinking...').start();

  try {
    const response = await drsApi.post('/chat', {
      model: options.model,
      messages: [{ role: 'user', content: message }],
      stream: false
    });

    spinner.stop();

    const reply = response.data.data.message?.content || 'No response';
    console.log(chalk.cyan('\n🤖 AI:'));
    console.log(reply);
    console.log();
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}
