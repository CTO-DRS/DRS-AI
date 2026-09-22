import { Context } from 'telegraf';
import axios from 'axios';
import drsApi from '../services/drsApi';
import logger from '../utils/logger';

const BOT_TOKEN = process.env.BOT_TOKEN || '';

export const analyzeCommand = async (ctx: Context) => {
  try {
    await ctx.reply(
      '📄 *File Analysis*\n\n' +
      'Send me a file to analyze. Supported formats:\n' +
      '• PDF documents\n' +
      '• Text files (.txt)\n' +
      '• CSV files\n' +
      '• Word documents (.docx)',
      { parse_mode: 'Markdown' }
    );
  } catch (error: any) {
    logger.error('Analyze command error:', error);
    await ctx.reply('❌ An error occurred');
  }
};

export const fileHandler = async (ctx: Context) => {
  try {
    const message = ctx.message;
    if (!message) return;

    let fileId: string | undefined;
    let fileName: string = 'unknown';
    let mimeType: string = 'application/octet-stream';
    let fileSize: number = 0;

    // Handle different file types
    if ('document' in message && message.document) {
      fileId = message.document.file_id;
      fileName = message.document.file_name || 'document';
      mimeType = message.document.mime_type || 'application/octet-stream';
      fileSize = message.document.file_size || 0;
    } else if ('photo' in message && message.photo) {
      const photo = message.photo[message.photo.length - 1];
      fileId = photo.file_id;
      fileName = 'image.jpg';
      mimeType = 'image/jpeg';
      fileSize = photo.file_size || 0;
    } else if ('audio' in message && message.audio) {
      fileId = message.audio.file_id;
      fileName = message.audio.file_name || 'audio';
      mimeType = message.audio.mime_type || 'audio/mpeg';
      fileSize = message.audio.file_size || 0;
    } else if ('voice' in message && message.voice) {
      fileId = message.voice.file_id;
      fileName = 'voice.ogg';
      mimeType = 'audio/ogg';
      fileSize = message.voice.file_size || 0;
    }

    if (!fileId) {
      await ctx.reply('❌ No file found in message');
      return;
    }

    // Check file size (max 20MB)
    if (fileSize > 20 * 1024 * 1024) {
      await ctx.reply('❌ File too large. Maximum size is 20MB');
      return;
    }

    const loadingMsg = await ctx.reply('📥 Downloading file...');

    try {
      // Get file URL from Telegram
      const fileResponse = await axios.get(
        `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
      );

      if (!fileResponse.data.ok) {
        throw new Error('Failed to get file info');
      }

      const filePath = fileResponse.data.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

      await ctx.editMessageText('📤 Uploading to DRS...', {
        chat_id: loadingMsg.chat.id,
        message_id: loadingMsg.message_id
      });

      // Download file
      const fileBuffer = await axios.get(fileUrl, { responseType: 'arraybuffer' });

      // Upload to DRS
      const result = await drsApi.uploadAndAnalyzeFile(
        Buffer.from(fileBuffer.data),
        fileName,
        mimeType
      );

      await ctx.deleteMessage(loadingMsg.message_id);

      // Send analysis result
      let response = `✅ *File Uploaded Successfully*\n\n`;
      response += `📄 *Name:* ${fileName}\n`;
      response += `📊 *Size:* ${(fileSize / 1024).toFixed(2)} KB\n`;
      response += `📋 *Type:* ${mimeType}\n\n`;

      if (result.processed?.text) {
        const preview = result.processed.text.substring(0, 1000);
        response += `📝 *Content Preview:*\n\`\`\`\n${preview}\n\`\`\``;
        
        if (result.processed.text.length > 1000) {
          response += '\n\n...(truncated)';
        }
      }

      await ctx.reply(response, { parse_mode: 'Markdown' });

      // Offer to analyze with AI
      await ctx.reply(
        'Would you like me to analyze this file with AI?',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔍 Analyze', callback_data: `analyze_file:${result.fileId}` },
                { text: '❌ Cancel', callback_data: 'cancel_analyze' }
              ]
            ]
          }
        }
      );
    } catch (error: any) {
      await ctx.deleteMessage(loadingMsg.message_id);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  } catch (error: any) {
    logger.error('File handler error:', error);
    await ctx.reply('❌ An error occurred');
  }
};
