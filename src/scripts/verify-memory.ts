import { memory } from '../core/memory.js';
async function test() {
	await memory.store(
		'project_fact',
		'testing_autonomy',
		'Testing Obsidian Next v0.4.6 with semantic search capabilities.'
	);
	console.log('Store successful');
	const results = await memory.search('What features are we testing?');
	console.log('Search results:', results);
}
test();
