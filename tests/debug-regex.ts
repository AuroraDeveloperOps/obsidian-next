import { redactor } from '../src/core/redactor.js';

const input = 'Call me at 555-0123-4567';
const result = redactor.redact(input);

console.log('Input:', input);
console.log('Output:', result.text);
console.log('Matches:', result.redactionCount);

if (result.text.includes('[REDACTED:phone]')) {
    console.log('✅ Regex works!');
} else {
    console.log('❌ Regex failed.');
}
