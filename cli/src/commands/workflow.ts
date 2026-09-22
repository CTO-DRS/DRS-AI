import chalk from 'chalk';
import ora from 'ora';
import { drsApi } from '../services/api';

interface WorkflowOptions {
  id?: string;
  data?: string;
}

export async function workflowCommand(action: string | undefined, options: WorkflowOptions): Promise<void> {
  switch (action) {
    case 'list':
      await listWorkflows();
      break;
    case 'trigger':
      await triggerWorkflow(options.id, options.data);
      break;
    case 'status':
      await getWorkflowStatus(options.id);
      break;
    default:
      console.log(chalk.yellow('Usage:'));
      console.log('  drs workflow list              - List workflows');
      console.log('  drs workflow trigger -i <id>   - Trigger a workflow');
      console.log('  drs workflow status -i <id>    - Get workflow status');
  }
}

async function listWorkflows(): Promise<void> {
  const spinner = ora('Fetching workflows...').start();

  try {
    const response = await drsApi.get('/workflows');
    spinner.stop();

    const workflows = response.data.data.workflows;
    
    console.log(chalk.cyan('\n📋 Workflows:\n'));
    
    for (const workflow of workflows) {
      const status = workflow.enabled ? chalk.green('●') : chalk.gray('○');
      console.log(`  ${status} ${workflow.name}`);
      console.log(chalk.gray(`    ID: ${workflow.id}`));
      console.log(chalk.gray(`    Type: ${workflow.trigger?.type}`));
      console.log(chalk.gray(`    Run count: ${workflow.runCount}`));
      console.log();
    }
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}

async function triggerWorkflow(workflowId: string | undefined, data: string | undefined): Promise<void> {
  if (!workflowId) {
    console.log(chalk.red('Error: Workflow ID is required'));
    return;
  }

  const spinner = ora('Triggering workflow...').start();

  try {
    const triggerData = data ? JSON.parse(data) : {};
    const response = await drsApi.post(`/workflows/${workflowId}/trigger`, triggerData);
    
    spinner.stop();
    console.log(chalk.green('\n✅ Workflow triggered!'));
    console.log(chalk.gray(`  Execution ID: ${response.data.data.executionId}`));
    console.log();
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}

async function getWorkflowStatus(executionId: string | undefined): Promise<void> {
  if (!executionId) {
    console.log(chalk.red('Error: Execution ID is required'));
    return;
  }

  try {
    const response = await drsApi.get(`/workflows/executions/${executionId}`);
    const execution = response.data.data.execution;

    console.log(chalk.cyan('\n📋 Execution Status:\n'));
    console.log(chalk.gray(`  ID: ${execution.id}`));
    console.log(chalk.gray(`  Status: ${execution.status}`));
    console.log(chalk.gray(`  Started: ${execution.startedAt}`));
    
    if (execution.completedAt) {
      console.log(chalk.gray(`  Completed: ${execution.completedAt}`));
    }
    
    if (execution.results && execution.results.length > 0) {
      console.log(chalk.gray(`  Results: ${execution.results.length} actions`));
    }
    console.log();
  } catch (error: any) {
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}
