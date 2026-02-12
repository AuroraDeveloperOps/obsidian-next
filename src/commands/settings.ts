import { bus } from '../core/bus.js';
import { settings } from '../core/settings.js';
import { CommandHandler } from '../core/commands.js';

export const settingsCommand: CommandHandler = async (args) => {
	const s = await settings.load();

	// No args - show all settings
	if (args.length === 0) {
		const content = [
			'User Settings Overview',
			`   ⎿  Mode        ${s.mode}`,
			`   ⎿  AutoAccept  ${s.autoAccept.enabled ? 'Enabled' : 'Disabled'}`,
			`   ⎿  PII Redact  ${s.security.piiRedaction ? 'ON' : 'OFF'}`,
			`   ⎿  Audit Log   ${s.security.auditLogging ? 'ON' : 'OFF'}`,
			`   ⎿  Sandbox     ${s.security.sandbox ? 'ON' : 'OFF'}`,
			'',
			'   [Permissions]',
			`   ⎿  Allowed     ${s.permissions.allow.length} patterns`,
			`   ⎿  Denied      ${s.permissions.deny.length} patterns`,
			'',
			'   [UI Context]',
			`   ⎿  Syntax      ${s.ui.syntaxHighlight ? 'ON' : 'OFF'}`,
			`   ⎿  Line Nos    ${s.ui.showLineNumbers ? 'ON' : 'OFF'}`,
			''
		].join('\n');

		bus.emitAgent({
			type: 'thought',
			content
		});
		return;
	}

	const [key, ...valueParts] = args;
	const value = valueParts.join(' ');

	// Get specific key
	if (!value) {
		const keys = key.split('.');
		let current: any = s;
		for (const k of keys) {
			if (current && typeof current === 'object' && k in current) {
				current = current[k];
			} else {
				bus.emitAgent({
					type: 'error',
					message: `Unknown setting: ${key}`
				});
				return;
			}
		}
		bus.emitAgent({
			type: 'thought',
			content: `${key} = ${JSON.stringify(current, null, 2)}`
		});
		return;
	}

	// Set value
	try {
		const keys = key.split('.');
		let parsed: any;

		// Parse value
		if (value === 'true') parsed = true;
		else if (value === 'false') parsed = false;
		else if (!isNaN(Number(value))) parsed = Number(value);
		else if (value.startsWith('[') || value.startsWith('{'))
			parsed = JSON.parse(value);
		else parsed = value;

		// Build nested update object
		if (keys.length === 1) {
			await settings.save({ [keys[0]]: parsed } as any);
		} else if (keys.length === 2) {
			const current = await settings.load();
			const topKey = keys[0] as keyof typeof current;
			const subKey = keys[1];

			if (typeof current[topKey] === 'object' && current[topKey] !== null) {
				await settings.save({
					[topKey]: {
						...(current[topKey] as object),
						[subKey]: parsed
					}
				} as any);
			}
		}

		const updated = await settings.reload();
		bus.emitAgent({
			type: 'done',
			summary: `Set ${key} = ${JSON.stringify(parsed)}`
		});
	} catch (err: any) {
		bus.emitAgent({
			type: 'error',
			message: `Failed to set ${key}: ${err.message}`
		});
	}
};
