import { Context, Markup } from 'telegraf';
import drsApi from '../services/drsApi';
import logger from '../utils/logger';

const userAgentSessions: Map<number, { agentId: string; step: string }> = new Map();

export const agentCommand = async (ctx: Context) => {
  try {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const text = message.text;
    const args = text.split(' ').slice(1);

    if (args.length === 0) {
      // Show available agents
      const agents = await drsApi.getAgents();
      
      if (agents.length === 0) {
        await ctx.reply('❌ No agents available');
        return;
      }

      const buttons = agents.map((agent: any) => [
        Markup.button.callback(`${agent.name}`, `select_agent:${agent.id}`)
      ]);

      await ctx.reply(
        '🤖 *Available Agents*\n\nSelect an agent to run:',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        }
      );
      return;
    }

    // Direct agent execution: /agent <agent-id> <input>
    const agentId = args[0];
    const input = args.slice(1).join(' ');

    if (!input) {
      await ctx.reply('❌ Please provide input for the agent.\nUsage: /agent <agent-id> <input>');
      return;
    }

    await runAgent(ctx, agentId, input);
  } catch (error: any) {
    logger.error('Agent command error:', error);
    await ctx.reply('❌ An error occurred');
  }
};

export const runAgent = async (ctx: Context, agentId: string, input: string) => {
  const loadingMsg = await ctx.reply(`🤖 Running ${agentId} agent...`);

  try {
    const task = await drsApi.runAgent(agentId, input);
    
    // Poll for task completion
    const maxAttempts = 30;
    let attempts = 0;
    
    const pollInterval = setInterval(async () => {
      try {
        attempts++;
        const taskStatus = await drsApi.getTaskStatus(task.id);
        
        if (taskStatus.status === 'completed') {
          clearInterval(pollInterval);
          await ctx.deleteMessage(loadingMsg.message_id);
          
          const result = taskStatus.result?.output || 'Task completed';
          
          if (result.length > 4000) {
            const chunks = result.match(/.{1,4000}/g) || [];
            for (const chunk of chunks) {
              await ctx.reply(chunk);
            }
          } else {
            await ctx.reply(`✅ *Result:*\n\n${result}`, { parse_mode: 'Markdown' });
          }
        } else if (taskStatus.status === 'failed') {
          clearInterval(pollInterval);
          await ctx.deleteMessage(loadingMsg.message_id);
          await ctx.reply(`❌ Task failed: ${taskStatus.error || 'Unknown error'}`);
        } else if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          await ctx.deleteMessage(loadingMsg.message_id);
          await ctx.reply('⏱️ Task is still running. Check later with /status ' + task.id);
        }
      } catch (error: any) {
        clearInterval(pollInterval);
        await ctx.deleteMessage(loadingMsg.message_id);
        await ctx.reply(`❌ Error: ${error.message}`);
      }
    }, 2000);
  } catch (error: any) {
    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
};

export const agentCallbackHandler = async (ctx: Context) => {
  try {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    const data = callbackQuery.data;
    
    if (data.startsWith('select_agent:')) {
      const agentId = data.split(':')[1];
      const userId = callbackQuery.from.id;
      
      userAgentSessions.set(userId, { agentId, step: 'waiting_input' });
      
      await ctx.answerCbQuery();
      await ctx.reply(`🤖 Agent *${agentId}* selected.\n\nPlease enter your request:`, {
        parse_mode: 'Markdown'
      });
    }
  } catch (error: any) {
    logger.error('Agent callback handler error:', error);
  }
};

export const handleAgentInput = async (ctx: Context) => {
  try {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const userId = message.from?.id;
    if (!userId) return;

    const session = userAgentSessions.get(userId);
    if (!session || session.step !== 'waiting_input') return;

    userAgentSessions.delete(userId);
    await runAgent(ctx, session.agentId, message.text);
  } catch (error: any) {
    logger.error('Handle agent input error:', error);
  }
};
