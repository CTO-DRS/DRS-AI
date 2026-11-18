import chalk from 'chalk';
import ora from 'ora';
import { drsApi } from '../services/api';

export async function statusCommand(): Promise<void> {
  const spinner = ora('Checking system status...').start();

  try {
    const response = await drsApi.get('/admin/health');
    spinner.stop();

    const services = response.data.data;
    
    console.log(chalk.cyan('\n🔍 System Status:\n'));
    
    for (const [service, status] of Object.entries(services)) {
      const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
      const statusIcon = (status as any).status === 'healthy' ? chalk.green('✓') : chalk.red('✗');
      const latency = (status as any).latency ? `(${(status as any).latency}ms)` : '';
      
      console.log(`  ${statusIcon} ${serviceName} ${chalk.gray(latency)}`);
    }
    console.log();
  } catch (error: any) {
    spinner.stop();
    console.error(chalk.red('Error:'), error.response?.data?.error?.message || error.message);
  }
}
