import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const [, , checkout, ref] = process.argv;
if (!checkout || !ref) {
    throw new Error('Usage: node boundingbox/tools/sync-mcp-discovery.mjs <MCP checkout> <released Git ref>');
}

const repo = resolve(checkout).replaceAll('\\', '/');
function git(...args) {
    return execFileSync('git', ['-c', `safe.directory=${repo}`, '-C', repo, ...args], { encoding: 'utf8' });
}

const commit = git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
const pkg = JSON.parse(git('show', `${commit}:package.json`));
if (pkg.name !== 'bbox-mcp-server' || pkg.mcpName !== 'io.github.iamvibhorsingh/bbox-mcp-server') {
    throw new Error('The Git ref must belong to a bbox-mcp-server release.');
}
const source = git('show', `${commit}:index.ts`);
const schemaStart = source.indexOf('const BBOX_OBJ_SCHEMA =');
const start = source.indexOf('server.setRequestHandler(ListToolsRequestSchema,');
const end = source.indexOf('server.setRequestHandler(CallToolRequestSchema,', start);
if (schemaStart < 0 || start <= schemaStart || end <= start) throw new Error('Could not find the static tool catalog.');

// Inspect only the static tool catalog. The server and its providers are never started.
const schemas = source.slice(schemaStart, start).replaceAll(' as const', '');
const { tools } = await runInNewContext(schemas + source.slice(start, end), {
    server: { setRequestHandler: (_schema, listTools) => listTools() },
    ListToolsRequestSchema: {}
}, { timeout: 1000 });
if (!Array.isArray(tools) || !tools.length || tools.some(tool => !tool.name || !tool.description || !tool.inputSchema)) {
    throw new Error('Tool catalog is missing a name, description, or input schema.');
}

const homepage = pkg.homepage;
const repository = pkg.repository.url;
const install = `npx -y ${pkg.name}`;
const npm = `https://www.npmjs.com/package/${pkg.name}`;
const guide = new URL('mcp/', homepage).href;
const cardUrl = new URL('/.well-known/mcp/server-card.json', homepage).href;
const description = pkg.description;
const summary = tools.map(({ name, description }) => `- \`${name}\` — ${description.split('\n\n')[0]}`).join('\n');
const document = `# ${pkg.name}

${description}

- Version: ${pkg.version}
- Install: \`${install}\`
- Setup and samples: ${guide}
- Repository: ${repository}
- Server card: ${cardUrl}

## Tools

${summary}

## Map verification

Open a tool's \`share_url\` to see its map preview. Open structured JSON or GeoJSON from the map's Help menu to inspect a larger result. Tool responses include provenance and warnings when available.

Respect the provider usage limits in the server README. Public endpoints are intended for light use.
`;

const registry = {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: pkg.mcpName,
    title: 'BoundingBox MCP',
    description: 'Geospatial tools with coordinate conversion, OpenStreetMap, H3, and shareable map results.',
    repository: { url: repository, source: 'github' },
    websiteUrl: guide,
    version: pkg.version,
    packages: [{ registryType: 'npm', identifier: pkg.name, version: pkg.version, transport: { type: 'stdio' } }]
};

function write(path, value) {
    writeFileSync(new URL(`../../${path}`, import.meta.url), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

write('boundingbox/mcp/server.json', registry);
write('.well-known/mcp/server-card.json', {
    name: pkg.mcpName,
    title: registry.title,
    version: pkg.version,
    description,
    homepage,
    documentation: guide,
    repository: registry.repository,
    license: pkg.license,
    packages: [{ registryName: 'npm', name: pkg.name, version: pkg.version, runtime: 'node', installArguments: ['-y', pkg.name] }],
    capabilities: { tools: true, resources: false, prompts: false },
    tools: tools.map(({ name, description }) => ({ name, description }))
});
write('.well-known/mcp-server-card.json', {
    schema_version: '1.0',
    name: pkg.name,
    display_name: registry.title,
    version: pkg.version,
    description,
    homepage,
    documentation: guide,
    repository,
    npm,
    license: pkg.license,
    protocol: 'mcp',
    transport: ['stdio'],
    installation: { npx: install },
    capabilities: { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, input_schema: inputSchema })) }
});
const skill = `---\nname: ${pkg.name}\ndescription: Find, analyze, and inspect geospatial data with BoundingBox MCP.\n---\n\n${document}`;
write('.well-known/agent-skills/bbox-mcp/SKILL.md', skill);
write('.well-known/agent-skills/index.json', {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [{
        name: pkg.name,
        type: 'skill-md',
        description,
        url: new URL('/.well-known/agent-skills/bbox-mcp/SKILL.md', homepage).href,
        digest: `sha256:${createHash('sha256').update(skill).digest('hex')}`
    }]
});
write('llms.txt', document);
console.log(`Synced BoundingBox discovery files for ${pkg.version} (${tools.length} tools, ${commit.slice(0, 7)}).`);
