export default {
	name: 'spotify_control',
	description: 'Control Spotify playback on macOS - play music by name, pause, resume, skip, get current track. Uses AppleScript for native control.',
	inputSchema: {
		action: {
			type: 'string',
			description: 'Action: play, pause, resume, next, previous, current, search_and_play, volume, shuffle'
		},
		query: {
			type: 'string',
			description: 'Search query for play/search_and_play (e.g. "lofi beats", "Drake - Gods Plan")'
		},
		volume: {
			type: 'number',
			description: 'Volume level 0-100 (for volume action)'
		}
	},
	requiredParams: ['action'],

	async execute(args) {
		const { execSync } = await import('child_process');
		const action = (args.action || '').toLowerCase().trim();
		const query = args.query || '';

		const osascript = (script) => {
			try {
				return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
					encoding: 'utf-8',
					timeout: 10000
				}).trim();
			} catch (e) {
				throw new Error(`AppleScript failed: ${e.message}`);
			}
		};

		// Ensure Spotify is running
		const ensureRunning = () => {
			try {
				osascript('tell application "Spotify" to activate');
			} catch {
				// Spotify not installed
				throw new Error('Spotify is not installed');
			}
		};

		// Search via Spotify AppleScript and play track URI directly
		const searchAndPlay = async (searchQuery) => {
			ensureRunning();

			// Use open with spotify URI to trigger search
			// Then use keyboard simulation via AppleScript to play the first result
			const encoded = encodeURIComponent(searchQuery);

			// Method 1: Use spotify:search URI then simulate keyboard to play first result
			execSync(`open "spotify:search:${encoded}"`, { timeout: 5000 });

			// Wait for Spotify to load search results
			await new Promise(r => setTimeout(r, 2500));

			// Simulate pressing Enter/Return to play the first result
			// This works because Spotify focuses the first result after search
			osascript(`
				tell application "System Events"
					tell process "Spotify"
						set frontmost to true
						delay 0.5
						key code 36
					end tell
				end tell
			`);

			// Wait for track to start
			await new Promise(r => setTimeout(r, 1500));

			// Verify playback started
			try {
				const state = osascript('tell application "Spotify" to player state as string');
				if (state === 'playing') {
					const track = osascript('tell application "Spotify" to name of current track');
					const artist = osascript('tell application "Spotify" to artist of current track');
					return {
						success: true,
						output: `Now playing: "${track}" by ${artist}\nSearched for: ${searchQuery}`
					};
				}
			} catch { /* fall through */ }

			// Fallback: try clicking play button via AppleScript
			try {
				osascript('tell application "Spotify" to play');
				await new Promise(r => setTimeout(r, 1000));
				const track = osascript('tell application "Spotify" to name of current track');
				const artist = osascript('tell application "Spotify" to artist of current track');
				return {
					success: true,
					output: `Playing: "${track}" by ${artist}\nNote: Searched for "${searchQuery}" - verify this is the right track`
				};
			} catch {
				return {
					success: true,
					output: `Opened Spotify search for "${searchQuery}". Press play on the result you want.`
				};
			}
		};

		try {
			switch (action) {
				case 'play':
				case 'search_and_play': {
					if (!query) {
						ensureRunning();
						osascript('tell application "Spotify" to play');
						const track = osascript('tell application "Spotify" to name of current track');
						const artist = osascript('tell application "Spotify" to artist of current track');
						return { success: true, output: `Resumed: "${track}" by ${artist}` };
					}
					return await searchAndPlay(query);
				}

				case 'pause':
					osascript('tell application "Spotify" to pause');
					return { success: true, output: 'Paused playback' };

				case 'resume':
					osascript('tell application "Spotify" to play');
					return { success: true, output: 'Resumed playback' };

				case 'next': {
					osascript('tell application "Spotify" to next track');
					await new Promise(r => setTimeout(r, 500));
					const nTrack = osascript('tell application "Spotify" to name of current track');
					const nArtist = osascript('tell application "Spotify" to artist of current track');
					return { success: true, output: `Skipped to: "${nTrack}" by ${nArtist}` };
				}

				case 'previous': {
					osascript('tell application "Spotify" to previous track');
					await new Promise(r => setTimeout(r, 500));
					const pTrack = osascript('tell application "Spotify" to name of current track');
					const pArtist = osascript('tell application "Spotify" to artist of current track');
					return { success: true, output: `Back to: "${pTrack}" by ${pArtist}` };
				}

				case 'current': {
					const state = osascript('tell application "Spotify" to player state as string');
					if (state === 'stopped') {
						return { success: true, output: 'Spotify is stopped - nothing playing' };
					}
					const name = osascript('tell application "Spotify" to name of current track');
					const art = osascript('tell application "Spotify" to artist of current track');
					const album = osascript('tell application "Spotify" to album of current track');
					const pos = osascript('tell application "Spotify" to player position');
					const dur = osascript('tell application "Spotify" to duration of current track');
					const durSec = Math.round(parseInt(dur) / 1000);
					return {
						success: true,
						output: `${state === 'playing' ? '[PLAYING]' : '[PAUSED]'} "${name}" by ${art}\nAlbum: ${album}\nPosition: ${Math.round(parseFloat(pos))}s / ${durSec}s`
					};
				}

				case 'volume': {
					const vol = Math.max(0, Math.min(100, parseInt(args.volume) || 50));
					osascript(`tell application "Spotify" to set sound volume to ${vol}`);
					return { success: true, output: `Volume set to ${vol}%` };
				}

				case 'shuffle': {
					const current = osascript('tell application "Spotify" to shuffling');
					const newState = current === 'true' ? false : true;
					osascript(`tell application "Spotify" to set shuffling to ${newState}`);
					return { success: true, output: `Shuffle ${newState ? 'ON' : 'OFF'}` };
				}

				default:
					return {
						success: false,
						error: `Unknown action: ${action}. Use: play, pause, resume, next, previous, current, search_and_play, volume, shuffle`
					};
			}
		} catch (error) {
			return {
				success: false,
				error: `Spotify control failed: ${error.message}. Is Spotify installed and running?`
			};
		}
	}
};
