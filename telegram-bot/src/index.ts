import { Telegraf, Context, Markup } from 'telegraf';
import dotenv from 'dotenv';
import { chatCommand, chatTextHandler } from './commands/chat';
import { agentCommand, agentCallbackHandler, handleAgentInput } from './commands/agent';
import { analyzeCommand, fileHandler } from './commands/analyze';
import logger from './utils/logger';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  logger.error('BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  logger.info(`Update received: ${ctx.updateType}`, {
    from: ctx.from?.username || ctx.from?.id,
    chat: ctx.chat?.id
  });
  await next();
  const ms = Date.now() - start;
  logger.info(`Response time: ${ms}ms`);
});

// Start command
bot.start(async (ctx) => {
  const welcomeMessage = `
🤖 *Welcome to DRS AI Bot!*

Your personal AI assistant powered by local LLMs.

*Available Commands:*
/chat <message> - Chat with AI
/agent - Run AI agents
/analyze - Analyze files
/models - List available models
/help - Show help

*Features:*
✅ Local AI (No internet needed)
✅ Multi-Agent System
✅ File Analysis
✅ Secure & Private

Just send me a message to start chatting!
  `;

  await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    ...Markup.keyboard([
      ['💬 Chat', '🤖 Agents'],
      ['📄 Analyze File', '📊 Models']
    ]).resize()
  });
});

// Help command
bot.help(async (ctx) => {
  const helpMessage = `
🤖 *DRS AI Bot Help*

*Commands:*
/start - Start the bot
/chat <message> - Chat with AI
/agent [agent-id] [input] - Run AI agent
/analyze - Analyze a file
/models - List available models
/status <task-id> - Check task status

*Keyboard Shortcuts:*
💬 Chat - Start chatting
🤖 Agents - Run agents
📄 Analyze File - Upload file
📊 Models - View models

*Tips:*
• Send any text to chat with AI
• Upload files for analysis
• Use /agent to run specialized agents
  `;

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

// Commands
bot.command('chat', chatCommand);
bot.command('agent', agentCommand);
bot.command('analyze', analyzeCommand);

// Models command
bot.command('models', async (ctx) => {
  try {
    const { default: drsApi } = await import('./services/drsApi');
    const models = await drsApi.getModels();
    
    if (models.length === 0) {
      await ctx.reply('❌ No models available');
      return;
    }

    let message = '📊 *Available Models*\n\n';
    models.forEach((model: any, index: number) => {
      const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(2);
      message += `${index + 1}. *${model.name}*\n`;
      message += `   Size: ${sizeGB} GB\n`;
      message += `   Family: ${model.family}\n\n`;
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    logger.error('Models command error:', error);
    await ctx.reply('❌ Failed to get models');
  }
});

// Status command
bot.command('status', async (ctx) => {
  try {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const args = message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply('❌ Please provide a task ID.\nUsage: /status <task-id>');
      return;
    }

    const taskId = args[0];
    const { default: drsApi } = await import('./services/drsApi');
    const task = await drsApi.getTaskStatus(taskId);

    let statusMessage = `📋 *Task Status*\n\n`;
    statusMessage += `ID: \`${task.id}\`\n`;
    statusMessage += `Status: ${task.status}\n`;
    statusMessage += `Type: ${task.type}\n`;
    
    if (task.result) {
      statusMessage += `\n*Result:*\n${task.result.output?.substring(0, 500) || 'No output'}`;
    }

    if (task.error) {
      statusMessage += `\n*Error:* ${task.error}`;
    }

    await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
  } catch (error: any) {
    logger.error('Status command error:', error);
    await ctx.reply('❌ Failed to get task status');
  }
});

// Keyboard handlers
bot.hears('💬 Chat', async (ctx) => {
  await ctx.reply('Send me any message to chat with AI!');
});

bot.hears('🤖 Agents', agentCommand);
bot.hears('📄 Analyze File', analyzeCommand);

bot.hears('📊 Models', async (ctx) => {
  await ctx.reply('/models');
});

// Callback queries
bot.on('callback_query', async (ctx) => {
  await agentCallbackHandler(ctx);
});

// File handler
bot.on(['document', 'photo', 'audio', 'voice'], fileHandler);

// Text handler (for chat)
bot.on('text', async (ctx, next) => {
  // Check if user is in agent input mode
  await handleAgentInput(ctx);
  
  // If not handled, treat as chat
  if (ctx.message && 'text' in ctx.message && !ctx.message.text.startsWith('/')) {
    await chatTextHandler(ctx);
  }
  await next();
});

// Error handler
bot.catch((err, ctx) => {
  logger.error('Bot error:', err);
  ctx.reply('❌ An error occurred. Please try again.').catch(() => {});
});

// Graceful shutdown
process.once('SIGINT', () => {
  logger.info('SIGINT received, stopping bot...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  logger.info('SIGTERM received, stopping bot...');
  bot.stop('SIGTERM');
});

// Start bot
bot.launch();
logger.info('=================================');
logger.info('DRS AI Telegram Bot');
logger.info('Version: 1.0.0');
logger.info('=================================');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
