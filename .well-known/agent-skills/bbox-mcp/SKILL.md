---
name: bbox-mcp-server
description: Find, analyze, and inspect geospatial data with BoundingBox MCP.
---

# bbox-mcp-server

The geospatial toolkit for AI agents — query, route, elevate, convert, and verify spatial data with zero config. 11 tools for bounding boxes, coordinate projection, H3 indexing, OpenStreetMap Overpass queries, traffic control checks, OSRM routing, Copernicus DEM elevation, spatial geometry math, and shareable map verification links.

- Version: 1.6.0
- Install: `npx -y bbox-mcp-server`
- Setup and samples: https://vibhorsingh.com/boundingbox/mcp/
- Repository: https://github.com/iamvibhorsingh/bbox-mcp-server
- Server card: https://vibhorsingh.com/.well-known/mcp/server-card.json

## Tools

- `get_bounds` — Get converted coordinates for a bounding box or natural-language location search (powered by Nominatim with configurable Photon & optional Mapbox fallbacks). Supports parsing WKT, GeoJSON, ogrinfo extent, Web Mercator tiles ('z/x/y'), single points ('lat,lng'), and raw coordinate strings, plus optional metric buffering.
- `get_h3_indices` — Get Uber H3 cell indices for a polygon (including interior holes), location boundary, or bounding box at a target resolution. When a WKT/GeoJSON polygon or named location boundary is provided, fills the exact polygon geometry (subtracting interior holes) rather than just its bounding rectangle.
- `generate_share_url` — Generates a URL that links to the visual Bounding Box tool to display these coordinates on a map. Supports WKT, GeoJSON, ogrinfo extent, tile 'z/x/y', and raw coordinate strings as input.
- `reverse_geocode` — Reverse geocode latitude and longitude coordinates to discover context, place name, address components, and OSM details ('what is here?').
- `search_overpass` — Execute an Overpass QL query to find POIs, roads, or other OSM features within an admin boundary area, bounding box, or radius. The server wraps your query in spatial filters, detects Overpass runtime errors, and returns structured JSON with provenance, completeness metadata, distance calculations, and a map link.
- `list_osm_tags` — Discovery tool to look up the correct OpenStreetMap tags for any category. Uses built-in category index and live Taginfo API fallback to prevent tag hallucination.
- `aggregate_overpass_h3` — Executes an Overpass query and bins the results into H3 hexagons at a specified resolution to analyze spatial density. Plots the top density hotspots on the shareable verification map.
- `calculate_route` — Calculate real-world travel distance, duration, turn-by-turn summary (with maneuver coordinates), GeoJSON route geometry, and route bounding box between two locations or coordinate pairs using OpenStreetMap routing (FOSSGIS / OSRM, or configurable OSRM_API_URL). Supports optional intermediate 'waypoints' and requesting 'alternatives' (up to 3 OSRM routes for side-by-side comparison with check_traffic_controls).
- `get_elevation` — Query terrain elevation in meters above sea level using the Open-Meteo 90m Copernicus DEM API (free for non-commercial use; commercial use requires a paid key or self-hosted ELEVATION_API_URL). Supports querying specific point coordinates OR sampling an N×N point grid across a bounding box to compute sample statistics (note: finite grid sampling over a 90m DEM reports sample statistics, not guaranteed area-wide true minimum, maximum, or slope).
- `spatial_calc` — Perform deterministic offline geometric calculations on bounding boxes, points, and polygons (with holes, zero network calls): 'relation' (intersects, contains, overlap area %, union & intersection bbox between two geometries), 'point_in_geometry' (check if a point is inside a bbox or WKT/GeoJSON polygon respecting interior holes), 'distance_bearing' (exact Haversine distance, initial compass bearing, and midpoint between two points), or 'split_grid' (subdivide a bbox into an N x M grid of sub-bboxes for chunked queries).
- `check_traffic_controls` — Check OpenStreetMap for traffic signals (traffic lights) and stop signs at a junction, within a radius of a coordinate/place, across a bounding box/area, or along a route corridor. Returns explicit booleans (has_traffic_signal, has_stop_sign), junction classification (control_type: 'traffic_signals' | 'stop_sign' | 'both' | 'none'), separate counts, exact coordinates, and a shareable verification map.

## Map verification

Open a tool's `share_url` to see its map preview. Open structured JSON or GeoJSON from the map's Help menu to inspect a larger result. Tool responses include provenance and warnings when available.

Respect the provider usage limits in the server README. Public endpoints are intended for light use.
