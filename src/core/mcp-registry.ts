
export interface MCPServerDefinition {
    name: string;
    description: string;
    command: string;
    args: string[];
    requiresApiKey?: boolean;
    env?: Record<string, string>;
}

export const MCP_REGISTRY: Record<string, MCPServerDefinition> = {
    'filesystem': {
        name: 'filesystem',
        description: 'Access local files and directories outside the workspace (requires permission)',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/'] // Root access, dangerous but powerful
    },
    'research': {
        name: 'research',
        description: 'Search the web using Brave Search. Excellent for docs and current info.',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        requiresApiKey: true,
        env: {
            'BRAVE_API_KEY': 'Needs Configuration'
        }
    },
    'git': {
        name: 'git',
        description: 'Git repository management operations',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-git']
    },
    'memory': {
        name: 'memory',
        description: 'Persistent knowledge graph for long-term agent memory',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory']
    },
    'google-search': {
        name: 'google-search',
        description: 'Search the web using official Google Custom Search API',
        command: 'npx',
        args: ['-y', '@mcp-get/google-search'],
        requiresApiKey: true,
        env: {
            'GOOGLE_API_KEY': 'Needs Key',
            'GOOGLE_CSE_ID': 'Needs ID'
        }
    },
    'github': {
        name: 'github',
        description: 'Advanced GitHub repository management (Issues, PRs, etc)',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        requiresApiKey: true,
        env: {
            'GITHUB_PERSONAL_ACCESS_TOKEN': 'Needs Token'
        }
    },
    'context7': {
        name: 'context7',
        description: 'Official documentation search and retrieval (Certified Correct Docs)',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        requiresApiKey: true,
        env: {
            'CONTEXT7_API_KEY': 'Needs Key'
        }
    }
};

// Helper to check if a server is "certified" (in our registry)
export function getRegistryDefinition(name: string): MCPServerDefinition | undefined {
    return MCP_REGISTRY[name];
}

export function listRegistry(): MCPServerDefinition[] {
    return Object.values(MCP_REGISTRY);
}
