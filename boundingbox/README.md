bboxfinder
==============

Helper page for finding bbox values from a map to help with interaction with tools like gdal, leaflet, openlayers, etc.

## MCP release metadata

After the MCP package is published, regenerate the site cards, agent skill, and registry manifest from its released Git commit or tag. The script reads only the package manifest and tool catalog from Git.

```sh
node boundingbox/tools/sync-mcp-discovery.mjs ../bbox-mcp-server <released-git-ref>
```

Publish `boundingbox/mcp/server.json` to the [official MCP Registry](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx) with the authenticated publisher for `io.github.iamvibhorsingh/bbox-mcp-server`. The npm package and registry manifest should carry the same version.

### Share links

The viewer accepts legacy BoundingBox fragments. New MCP links can append `|H3:<resolution>,<total>,<cell>[.<count>]...` to show sampled cells and `|MCP:<base64url-json>` with `source`, `warnings`, and an optional `returned` count. The H3 cells come from the server's result. Users can open the corresponding JSON or GeoJSON from Help to inspect a larger result.
