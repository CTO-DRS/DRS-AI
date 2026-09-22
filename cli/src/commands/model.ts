import chalk from 'chalk';
import ora from 'ora';
import { drsApi } from '../services/api';

interface ModelOptions {
  name?: string;
}

export async function modelCommand(action: string | undefined, options: ModelOptions): Promise<void> {
  switch (action) {
    case 'list':
      await listModels();
      break;
    case 'pull':
      await pullModel(options.name);
      break;
    case 'delete':
      await deleteModel(options.name);
      break;
    default:
      console.log(chalk.yellow('Usage:'));
      console.log('  drs model list              - List available models');
      console.log('  drs model pull -n <name>    - Pull a model');
      console.log('  drs model delete -n <name>  - Delete a model');
  }
}

async function listModels(): Promise<void> {
  const spinner = ora('Fetching models...').start();

  try {
    const response = await drsApi.get('/models');
    spinner.stop();

    const models = response.data.data.models;
    
    console.log(chalk.cyan('\n🧠 Available Models:\n'));
    
    for (const model of models) {
      const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(2);
      console.log(chalk.green(`  ${model.name}`));
      console.log(chalk.gray(`    Family: ${model.family}`));
      console.log(chalk.gray(`    Size: ${sizeGB} GB`));
      console.log(chalk.gray(`    Parameters: ${model.parameters}`));
      
      const caps = Object.entries(model.capabilities)
        .filter(([, v]) => v)
        .map(([k]) => k);
      console.log(chalk.gray(`    Capabilities: ${caps.join(', ')}`));
      console.log();
    }
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}

async function pullModel(modelName: string | undefined): Promise<void> {
  if (!modelName) {
    console.log(chalk.red('Error: Model name is required'));
    return;
  }

  const spinner = ora(`Pulling model ${modelName}...`).start();

  try {
    await drsApi.post('/models/pull', { name: modelName });
    spinner.stop();
    console.log(chalk.green(`\n✅ Model ${modelName} pulled successfully!`));
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}

async function deleteModel(modelName: string | undefined): Promise<void> {
  if (!modelName) {
    console.log(chalk.red('Error: Model name is required'));
    return;
  }

  const spinner = ora(`Deleting model ${modelName}...`).start();

  try {
    await drsApi.delete(`/models/${modelName}`);
    spinner.stop();
    console.log(chalk.green(`\n✅ Model ${modelName} deleted successfully!`));
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}
