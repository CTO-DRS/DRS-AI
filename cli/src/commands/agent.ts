import chalk from 'chalk';
import ora from 'ora';
import { drsApi } from '../services/api';

interface AgentOptions {
  id?: string;
  input?: string;
}

export async function agentCommand(action: string | undefined, options: AgentOptions): Promise<void> {
  switch (action) {
    case 'list':
      await listAgents();
      break;
    case 'run':
      await runAgent(options.id, options.input);
      break;
    case 'status':
      await getAgentStatus(options.id);
      break;
    default:
      console.log(chalk.yellow('Usage:'));
      console.log('  drs agent list              - List available agents');
      console.log('  drs agent run -i <id>       - Run an agent');
      console.log('  drs agent status -i <id>    - Get agent status');
  }
}

async function listAgents(): Promise<void> {
  const spinner = ora('Fetching agents...').start();

  try {
    const response = await drsApi.get('/agents');
    spinner.stop();

    const agents = response.data.data.agents;
    
    console.log(chalk.cyan('\n🤖 Available Agents:\n'));
    
    for (const agent of agents) {
      console.log(chalk.green(`  ${agent.name}`));
      console.log(chalk.gray(`    ID: ${agent.id}`));
      console.log(chalk.gray(`    Capabilities: ${agent.capabilities.join(', ')}`));
      console.log();
    }
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}

async function runAgent(agentId: string | undefined, input: string | undefined): Promise<void> {
  if (!agentId) {
    console.log(chalk.red('Error: Agent ID is required'));
    console.log(chalk.gray('Use: drs agent run -i <agent-id> --input "your input"'));
    return;
  }

  if (!input) {
    console.log(chalk.red('Error: Input is required'));
    return;
  }

  const spinner = ora(`Running agent ${agentId}...`).start();

  try {
    const response = await drsApi.post('/tasks', {
      agentId,
      input,
      type: 'auto'
    });

    const taskId = response.data.data.task.id;
    spinner.text = `Task created: ${taskId}. Waiting for completion...`;

    // Poll for completion
    const result = await pollTaskCompletion(taskId, spinner);
    spinner.stop();

    if (result.status === 'completed') {
      console.log(chalk.green('\n✅ Task completed!\n'));
      console.log(result.result?.output || 'No output');
    } else {
      console.log(chalk.red('\n❌ Task failed:'), result.error || 'Unknown error');
    }
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}

async function getAgentStatus(taskId: string | undefined): Promise<void> {
  if (!taskId) {
    console.log(chalk.red('Error: Task ID is required'));
    return;
  }

  try {
    const response = await drsApi.get(`/tasks/${taskId}`);
    const task = response.data.data.task;

    console.log(chalk.cyan('\n📋 Task Status:\n'));
    console.log(chalk.gray(`  ID: ${task.id}`));
    console.log(chalk.gray(`  Status: ${task.status}`));
    console.log(chalk.gray(`  Type: ${task.type}`));
    console.log(chalk.gray(`  Created: ${task.createdAt}`));
    
    if (task.result) {
      console.log(chalk.gray(`  Output: ${task.result.output?.substring(0, 200)}...`));
    }
    console.log();
  } catch (error: any) {
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}

async function pollTaskCompletion(taskId: string, spinner: ora.Ora, maxAttempts: number = 60): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await drsApi.get(`/tasks/${taskId}`);
      const task = response.data.data.task;
      
      if (task.status === 'completed' || task.status === 'failed') {
        return task;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      throw error;
    }
  }
  
  throw new Error('Task timeout');
}
