import chalk from 'chalk';

/**
 * Valid JSON value types
 */
type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
interface JsonObject {
	[key: string]: JsonValue;
}
interface JsonArray extends Array<JsonValue> {}

/**
 * Syntax highlight a JSON object or string for display in the terminal.
 * Returns a string with ANSI color codes.
 */
export function highlightJson(json: string | object): string {
	let jsonStr = '';

	if (typeof json === 'string') {
		try {
			const obj = JSON.parse(json);
			jsonStr = JSON.stringify(obj, null, 2);
		} catch (e) {
			return chalk.gray(json); // Return as gray text if not valid JSON
		}
	} else {
		jsonStr = JSON.stringify(json, null, 2);
	}

	// Colors
	const C = {
		key: chalk.cyan,
		string: chalk.green,
		number: chalk.yellow,
		boolean: chalk.magenta,
		null: chalk.red,
		punctuation: chalk.gray
	};

	// Regex to match JSON tokens
	// Capturing groups:
	// 1. Key (with quotes)
	// 2. String value
	// 3. Number
	// 4. Boolean/Null
	const regex =
		/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

	return jsonStr.replace(regex, (match) => {
		let style = C.number; // Default to number style

		if (/^"/.test(match)) {
			if (/:$/.test(match)) {
				// Key
				return C.key(match.slice(0, -1)) + C.punctuation(':');
			} else {
				// String value
				return C.string(match);
			}
		} else if (/true|false/.test(match)) {
			style = C.boolean;
		} else if (/null/.test(match)) {
			style = C.null;
		}

		return style(match);
	});
}
