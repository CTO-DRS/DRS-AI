import chalk from 'chalk';
import Conf from 'conf';

const config = new Conf({ projectName: 'drs-cli' });

interface ConfigOptions {
  get?: string;
  set?: string;
}

export async function configCommand(key: string | undefined, value: string | undefined, options: ConfigOptions): Promise<void> {
  if (options.get) {
    const val = config.get(options.get);
    console.log(val || chalk.gray('(not set)'));
    return;
  }

  if (options.set && value) {
    config.set(options.set, value);
    console.log(chalk.green(`✅ Set ${options.set} = ${value}`));
    return;
  }

  if (key && value) {
    config.set(key, value);
    console.log(chalk.green(`✅ Set ${key} = ${value}`));
    return;
  }

  if (key) {
    const val = config.get(key);
    console.log(val || chalk.gray('(not set)'));
    return;
  }

  // Show all config
  const allConfig = config.store;
  
  console.log(chalk.cyan('\n⚙️  Configuration:\n'));
  
  if (Object.keys(allConfig).length === 0) {
    console.log(chalk.gray('  (no configuration set)'));
  } else {
    for (const [k, v] of Object.entries(allConfig)) {
      console.log(`  ${k}: ${v}`);
    }
  }
  console.log();
}
