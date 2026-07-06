import type { Env } from './types';

export class TelegramAPI {
  private base: string;

  constructor(env: Env) {
    this.base = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  }

  async sendMessage(
    chatId: number,
    text: string,
    options: {
      parseMode?: 'Markdown' | 'MarkdownV2' | null;
      disablePreview?: boolean;
      replyMarkup?: { inline_keyboard: { text: string; callback_data: string }[][] };
    } = {}
  ): Promise<Response> {
    return fetch(`${this.base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parseMode === null ? undefined : options.parseMode || 'Markdown',
        disable_web_page_preview: options.disablePreview ?? true,
        reply_markup: options.replyMarkup,
      }),
    });
  }

  // txt 등 파일 첨부 전송
  async sendDocument(chatId: number, filename: string, content: string, caption?: string): Promise<Response> {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('document', new File([content], filename, { type: 'text/plain' }));
    if (caption) form.append('caption', caption);
    return fetch(`${this.base}/sendDocument`, { method: 'POST', body: form });
  }

  // 인라인 버튼 눌렀을 때 로딩 스피너 해제 (안 하면 버튼이 계속 빙글빙글 돎)
  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<Response> {
    return fetch(`${this.base}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  }
}
