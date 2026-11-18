import { Context } from 'telegraf';
import drsApi from '../services/drsApi';
import logger from '../utils/logger';

export const chatCommand = async (ctx: Context) => {
  try {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const text = message.text;
    const args = text.split(' ').slice(1).join(' ');

    if (!args) {
      await ctx.reply('❌ Please provide a message.\nUsage: /chat <your message>');
      return;
    }

    const loadingMsg = await ctx.reply('🤔 Thinking...');

    try {
      const response = await drsApi.sendChatMessage(args);
      
      await ctx.deleteMessage(loadingMsg.message_id);
      
      // Split long messages
      if (response.length > 4000) {
        const chunks = response.match(/.{1,4000}/g) || [];
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } else {
        await ctx.reply(response);
      }
    } catch (error: any) {
      await ctx.deleteMessage(loadingMsg.message_id);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  } catch (error: any) {
    logger.error('Chat command error:', error);
    await ctx.reply('❌ An error occurred');
  }
};

export const chatTextHandler = async (ctx: Context) => {
  try {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    // Skip commands
    if (message.text.startsWith('/')) return;

    const loadingMsg = await ctx.reply('🤔 Thinking...');

    try {
      const response = await drsApi.sendChatMessage(message.text);
      
      await ctx.deleteMessage(loadingMsg.message_id);
      
      if (response.length > 4000) {
        const chunks = response.match(/.{1,4000}/g) || [];
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } else {
        await ctx.reply(response);
      }
    } catch (error: any) {
      await ctx.deleteMessage(loadingMsg.message_id);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  } catch (error: any) {
    logger.error('Chat text handler error:', error);
  }
};
