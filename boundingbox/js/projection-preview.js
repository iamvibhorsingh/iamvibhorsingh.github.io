(() => {
    'use strict';

    const WGS84 = 'EPSG:4326';
    const WEB_MERCATOR = 'EPSG:3857';
    const WORLD = [-180, -85.051129, 180, 85.051129];

    function boxRing([west, south, east, north]) {
        const corners = [[west, south], [east, south], [east, north], [west, north]];
        const ring = [];
        for (let i = 0; i < corners.length; i++) {
            const [x1, y1] = corners[i];
            const [x2, y2] = corners[(i + 1) % corners.length];
            // Match the edge sampling used for the projected coordinate output.
            for (let step = 0; step < 20; step++) {
                ring.push([x1 + (x2 - x1) * step / 20, y1 + (y2 - y1) * step / 20]);
            }
        }
        return [...ring, ring[0]];
    }

    function clipRing(ring, [west, south, east, north]) {
        let points = ring.slice(0, -1);
        for (const [axis, edge, side] of [[0, west, 1], [0, east, -1], [1, south, 1], [1, north, -1]]) {
            if (points.length < 3) return null;
            const input = points;
            points = [];
            let previous = input.at(-1);
            for (const point of input) {
                const inside = (point[axis] - edge) * side >= 0;
                const previousInside = (previous[axis] - edge) * side >= 0;
                if (inside !== previousInside) {
                    const t = (edge - previous[axis]) / (point[axis] - previous[axis]);
                    points.push(previous.map((value, i) => i === axis ? edge : value + (point[i] - value) * t));
                }
                if (inside) points.push(point);
                previous = point;
            }
        }
        return points.length >= 3 ? [...points, points[0]] : null;
    }

    function overviewFeatures(ol, data, bounds, project) {
        const features = [];
        for (const { geometry } of data.features) {
            const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
            for (const [outerRing, ...holes] of polygons) {
                const outer = clipRing(outerRing, bounds);
                if (!outer) continue;
                try {
                    const rings = [outer, ...holes.map(ring => clipRing(ring, bounds)).filter(Boolean)];
                    features.push(new ol.Feature(new ol.geom.Polygon(rings.map(ring => ring.map(project)))));
                } catch (error) {
                    if (!(error instanceof RangeError)) throw error;
                }
            }
        }
        return features;
    }

    function expanded([west, south, east, north]) {
        const width = east - west;
        const height = north - south;
        return [west - width, south - height, east + width, north + height];
    }

    async function captureLoadedTiles(ol, map, layer) {
        const container = layer?.options?.crossOrigin && layer.getContainer();
        if (!container) return null;
        const tiles = [...container.querySelectorAll('img.leaflet-tile-loaded')]
            .filter(tile => tile.complete && tile.naturalWidth);
        if (!tiles.length) return null;

        const viewport = map.getContainer().getBoundingClientRect();
        const { width, height } = viewport;
        if (!width || !height) return null;
        const ratio = Math.min(1, 1440 / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        const context = canvas.getContext('2d');
        if (!context) return null;

        // Paint older zoom levels underneath the currently displayed tiles.
        tiles.sort((a, b) => Number(a.parentElement.style.zIndex) - Number(b.parentElement.style.zIndex));
        context.scale(canvas.width / width, canvas.height / height);
        const corner = (x, y) => {
            const { lng, lat } = map.containerPointToLatLng([x, y]);
            return ol.proj.transform([lng, lat], WGS84, WEB_MERCATOR);
        };
        const [west, north] = corner(0, 0);
        const [east, south] = corner(width, height);
        try {
            let hasImagery = false;
            for (const tile of tiles) {
                const rect = tile.getBoundingClientRect();
                if (rect.right <= viewport.left || rect.left >= viewport.right ||
                    rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;
                context.drawImage(tile, rect.left - viewport.left, rect.top - viewport.top, rect.width, rect.height);
                hasImagery = true;
            }
            if (!hasImagery) return null;
            const blob = await new Promise(resolve => canvas.toBlob(resolve));
            return blob && { blob, extent: [west, south, east, north] };
        } catch {
            // Fall back if the browser disallows reading one of the existing tile images.
            return null;
        }
    }

    window.bboxProjectionPreview = async function ({ ol, proj4, code, bounds, hasSelection, sourceMap, sourceLayer, loadOverview, signal }) {
        const target = document.getElementById('projection-preview-map');
        const status = document.getElementById('projection-preview-status');
        const credits = document.getElementById('projection-preview-credits');
        const custom = code !== WGS84 && code !== WEB_MERCATOR;
        if (custom) {
            if (proj4.defs(code)?.projName === 'geocent') throw new Error('Choose a two-dimensional map projection.');
            ol.proj.proj4.register(proj4);
        }
        const projection = ol.proj.get(code);
        if (!projection) throw new Error(`Could not display ${code}.`);

        function project(coordinate) {
            const position = ol.proj.transform(coordinate, WGS84, projection);
            if (!position.every(Number.isFinite)) throw new RangeError(`Choose a smaller area within ${code}.`);
            return position;
        }

        const visibleBounds = ol.extent.getIntersection(bounds, WORLD);
        if (ol.extent.isEmpty(visibleBounds) || visibleBounds[0] === visibleBounds[2] || visibleBounds[1] === visibleBounds[3]) {
            throw new Error('Choose a map area inside the viewable world.');
        }
        const outline = new ol.geom.Polygon([boxRing(visibleBounds).map(project)]);
        const focus = outline.getExtent();
        const coverage = custom ? expanded(focus) : ol.extent.getIntersection(expanded(focus), projection.getExtent());
        if (custom) projection.setExtent(coverage);

        const overview = new ol.layer.Vector({
            source: new ol.source.Vector({ wrapX: false }),
            style: new ol.style.Style({
                fill: new ol.style.Fill({ color: '#e8ede0' }),
                stroke: new ol.style.Stroke({ color: '#687d76', width: 1 })
            })
        });
        const selection = new ol.layer.Vector({ source: new ol.source.Vector({ wrapX: false }) });
        if (hasSelection) {
            const original = new ol.Feature(outline);
            original.setStyle(new ol.style.Style({
                fill: new ol.style.Fill({ color: 'rgba(244, 123, 33, 0.12)' }),
                stroke: new ol.style.Stroke({ color: '#b74700', width: 2.5 })
            }));
            const envelope = new ol.Feature(new ol.geom.Polygon([boxRing(focus)]));
            envelope.setStyle(new ol.style.Style({
                zIndex: 1,
                stroke: new ol.style.Stroke({ color: '#155da2', width: 2, lineDash: [5, 6] })
            }));
            selection.getSource().addFeatures([original, envelope]);
        }
        document.getElementById('projection-preview-legend').hidden = !hasSelection;

        const view = new ol.View({ projection, extent: coverage, showFullExtent: true, enableRotation: false });
        const preview = new ol.Map({ target, view, layers: [overview, selection], controls: [] });
        signal.addEventListener('abort', () => preview.dispose(), { once: true });
        function fitView() {
            preview.updateSize();
            const size = preview.getSize();
            if (size?.every(value => value > 0)) view.fit(focus, { size, padding: [25, 36, 25, 36] });
        }
        fitView();
        document.getElementById('projection-preview-fit').addEventListener('click', fitView, { signal });
        document.getElementById('projection-preview-in').addEventListener('click', () => view.adjustZoom(1), { signal });
        document.getElementById('projection-preview-out').addEventListener('click', () => view.adjustZoom(-1), { signal });

        const overviewCredits = 'Overview from <a href="https://www.naturalearthdata.com/">Natural Earth</a>';
        const world = loadOverview().then(data => {
            if (signal.aborted) return false;
            const region = ol.extent.getIntersection(expanded(visibleBounds), WORLD);
            overview.getSource().addFeatures(overviewFeatures(ol, data, region, project));
            return true;
        }).catch(error => {
            console.error('Projection overview could not be drawn:', error);
            return false;
        });

        async function showOverview() {
            const ready = await world;
            if (signal.aborted) return;
            credits.innerHTML = ready ? overviewCredits : '';
            status.textContent = ready ? 'Showing the bundled overview.' : 'The bundled overview could not be loaded.';
        }

        // Reproject a snapshot of already-loaded tiles. The preview has no tile URL or tile fetcher.
        const snapshot = await captureLoadedTiles(ol, sourceMap, sourceLayer);
        if (signal.aborted) return;
        if (!snapshot) {
            await showOverview();
            return;
        }

        const url = URL.createObjectURL(snapshot.blob);
        signal.addEventListener('abort', () => URL.revokeObjectURL(url), { once: true });
        const source = new ol.source.ImageStatic({ url, projection: WEB_MERCATOR, imageExtent: snapshot.extent });
        const imagery = new ol.layer.Image({ source });
        const { options } = sourceLayer;
        const mapboxCredit = options.id === 'mapbox/streets-v11'
            ? '<a class="projection-mapbox-logo" href="https://www.mapbox.com/"><img src="https://raw.githubusercontent.com/mapbox/mcp-server/main/assets/mapbox-logo-black.svg" alt="Mapbox" height="30"></a>'
            : '';
        const feedback = mapboxCredit ? ' · <a href="https://apps.mapbox.com/feedback/">Improve this map</a>' : '';
        credits.innerHTML = `${mapboxCredit}${options.attribution}${feedback} · ${overviewCredits}`;
        status.textContent = 'Showing imagery from the drawing map’s current view.';
        source.once('imageloaderror', () => {
            if (signal.aborted) return;
            preview.removeLayer(imagery);
            showOverview();
        });
        preview.getLayers().insertAt(1, imagery);
    };
})();
