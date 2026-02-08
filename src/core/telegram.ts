import { Bot } from 'grammy';
import { settings } from './settings.js';
import { bus } from './bus.js';
import { AgentEvent } from '../events/types.js';

export class TelegramGateway {
    private bot: Bot | null = null;
    private initialized = false;

    constructor() { }

    async init() {
        if (this.initialized) return;

        const s = await settings.load();
        if (!s.telegram.enabled || !s.telegram.botToken) {
            return;
        }

        try {
            this.bot = new Bot(s.telegram.botToken);

            this.bot.command('start', (ctx) => {
                ctx.reply(`Obsidian Next Autonomous Gateway Active.
Your User ID: ${ctx.from?.id}
Use /status to check daemon health.`);
            });

            this.bot.command('status', async (ctx) => {
                const userId = ctx.from?.id.toString();
                if (!s.telegram.allowedUserIds.includes(userId || '')) return ctx.reply('Unauthorized.');
                ctx.reply('Daemon Status: ONLINE\nMode: Autonomous');
            });

            this.bot.on('message:text', async (ctx) => {
                const userId = ctx.from?.id.toString();
                if (!s.telegram.allowedUserIds.includes(userId || '')) {
                    return ctx.reply('Unauthorized. Add your ID to settings.json.');
                }

                // Bridge to local bus
                bus.emitUser({
                    type: 'user_input',
                    text: ctx.message.text
                } as any);
            });

            // Bridge agent events to Telegram
            bus.on('agent', (event: AgentEvent) => {
                this.handleAgentEvent(event, s.telegram.allowedUserIds);
            });

            this.bot.start().catch(err => {
                console.error('[Telegram] Bot startup failed:', err);
            });

            this.initialized = true;
            bus.emitAgent({
                type: 'thought',
                content: '[Telegram] Remote gateway initialized and active.'
            });
        } catch (error) {
            console.error('[Telegram] Failed to initialize bot:', error);
        }
    }

    private async handleAgentEvent(event: AgentEvent, userIds: string[]) {
        if (!this.bot) return;

        let text = '';
        let parseMode: any = undefined;

        switch (event.type) {
            case 'thought':
                // Clean up markdown-ish formatting for Telegram if needed, 
                // but we strictly use plain text anyway.
                text = `* ${event.content}`;
                break;
            case 'tool_start':
                text = `⏺ *Executing ${event.tool}*...`;
                parseMode = 'Markdown';
                break;
            case 'tool_result':
                text = event.isError ? `✗ *Tool Error*
${event.output}` : `⎿ *Result*
${event.output?.slice(0, 500)}`;
                parseMode = 'Markdown';
                break;
            case 'done':
                text = `✅ *Task Complete*
${event.summary}`;
                parseMode = 'Markdown';
                break;
            case 'error':
                text = `🚨 *System Error*
${event.message}`;
                parseMode = 'Markdown';
                break;
        }

        if (text) {
            for (const id of userIds) {
                try {
                    await this.bot.api.sendMessage(id, text, { parse_mode: parseMode });
                } catch (e) {
                    // Ignore send errors
                }
            }
        }
    }

    async stop() {
        if (this.bot) {
            await this.bot.stop();
        }
        this.initialized = false;
    }
}

export const telegramGateway = new TelegramGateway();
