const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FEATURES = 3000;
const MAX_POSITIONS = 60000;

function position(lng, lat) {
    return Number.isFinite(lng) && Math.abs(lng) <= 180 && Number.isFinite(lat) && Math.abs(lat) <= 90;
}

function readGeoJSON(input) {
    const features = input.type === 'FeatureCollection' ? input.features : [
        input.type === 'Feature' ? input : { type: 'Feature', geometry: input, properties: {} }
    ];
    if (!Array.isArray(features) || features.length > MAX_FEATURES) throw new Error('The map supports up to 3,000 features per file.');

    const depths = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
    let positions = 0;
    function validCoordinates(coordinates, depth) {
        if (!Array.isArray(coordinates) || !coordinates.length) return false;
        if (depth > 0) return coordinates.every(value => validCoordinates(value, depth - 1));
        if (++positions > MAX_POSITIONS) throw new Error('The geometry has too many vertices to display.');
        return position(coordinates[0], coordinates[1]);
    }

    const validFeatures = features.filter(feature => {
        if (feature?.type !== 'Feature' || !feature.geometry) return false;
        const { type, coordinates } = feature.geometry;
        return Object.hasOwn(depths, type) && validCoordinates(coordinates, depths[type]);
    });
    if (validFeatures.length !== features.length) throw new Error('The file contains unsupported or invalid GeoJSON geometry.');
    return { type: 'FeatureCollection', features: validFeatures };
}

export function normalizeResult(input) {
    const response = input?.result ?? input;
    const data = response?.structuredContent ?? response?.structured_content ?? response;
    if (!data || typeof data !== 'object' || response.isError) throw new Error('Choose a successful MCP JSON result or GeoJSON file.');

    const warnings = Array.isArray(data.warnings) ? data.warnings.filter(value => typeof value === 'string').slice(0, 20) : [];
    if (data.complete === false) warnings.unshift('The provider reported an incomplete result.');
    if (data.has_more === true) warnings.push('More results are available from the MCP tool.');
    const provenance = data.provenance ?? {};
    const source = [provenance.provider, provenance.attribution, provenance.data_timestamp]
        .filter(value => typeof value === 'string').join(' · ');
    const model = { source, warnings, places: [], geometry: null, density: false };

    const places = data.places ?? data.elements;
    if (Array.isArray(places)) {
        if (places.length > MAX_FEATURES) throw new Error('The map supports up to 3,000 places per file.');
        model.places = places.flatMap(place => {
            const lat = place?.coordinates?.lat;
            const lng = place?.coordinates?.lon;
            if (!position(lng, lat)) return [];
            return [{
                lat, lng,
                name: typeof place.name === 'string' && place.name ? place.name : 'Unnamed place',
                detail: [place.basic_category, place.address?.freeform, place.address?.locality,
                    Number.isFinite(place.confidence) ? `${Math.round(place.confidence * 100)}% confidence` : null]
                    .filter(value => typeof value === 'string').join(' · ')
            }];
        });
        const returned = Number.isInteger(data.returned_count) && data.returned_count >= places.length
            ? data.returned_count : places.length;
        model.summary = `Showing ${model.places.length} of ${returned} returned places.`;
    }

    const geometry = data.hex_geojson ?? data.geojson ?? data.route_geometry ?? (data.type ? data : null);
    if (geometry) {
        model.geometry = readGeoJSON(geometry);
        model.density = Boolean(data.hex_geojson);
        const count = model.geometry.features.length;
        model.summary ??= model.density ? `Showing ${count} H3 density cells.` : `Showing ${count} map features.`;
    }
    const cells = data.cells ?? data.sample_cells;
    if (!geometry && Array.isArray(cells) && Number.isInteger(data.resolution)) {
        model.h3 = {
            resolution: data.resolution,
            total: Number.isInteger(data.cell_count) ? Math.max(data.cell_count, cells.length) : cells.length,
            cells: cells.slice(0, MAX_FEATURES).map(id => ({ id, count: null }))
        };
        model.summary = 'Loading H3 cells…';
    }
    if (!model.summary) throw new Error('Choose a result with places, route geometry, or GeoJSON.');
    return model;
}

function hashParts(hash) {
    return hash.includes('|') ? hash.split('|') : hash.split(/%7C/i);
}

export function readH3Preview(hash) {
    const parts = hashParts(hash);
    const segment = parts.slice(1).find(part => part.startsWith('H3:'));
    if (!segment) return null;

    const [resolutionText, totalText, ...entries] = segment.slice(3).split(',');
    if (!/^\d{1,2}$/.test(resolutionText) || !/^\d{1,8}$/.test(totalText)) throw new Error('Invalid H3 preview.');
    const resolution = Number(resolutionText);
    const total = Number(totalText);
    if (resolution > 15 || entries.length > 100 || total < entries.length) throw new Error('Invalid H3 preview.');
    const cells = entries.map(entry => {
        const match = /^(8[\da-f]{14})(?:\.(\d{1,8}))?$/i.exec(entry);
        if (!match) throw new Error('Invalid H3 cell in share link.');
        return { id: match[1].toLowerCase(), count: match[2] === undefined ? null : Number(match[2]) };
    });
    return { resolution, total, cells };
}

export function readResultMetadata(hash) {
    const overlays = hashParts(hash).slice(1);
    const part = overlays.find(value => value.startsWith('MCP:'));
    if (!part) return null;
    const encoded = part.slice(4);
    if (!/^[\w-]{1,4096}$/.test(encoded)) throw new Error('Invalid map result details.');
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), value => value.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const shown = overlays.filter(value => {
        const match = /^(?:C:)?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/.exec(value);
        return match && position(Number(match[2]), Number(match[1]));
    }).length;
    return {
        source: typeof data.source === 'string' ? data.source : '',
        warnings: Array.isArray(data.warnings) ? data.warnings.filter(value => typeof value === 'string').slice(0, 20) : [],
        summary: Number.isInteger(data.returned) && data.returned >= shown
            ? `Showing ${shown} of ${data.returned} returned places.` : ''
    };
}

async function addH3Geometry(model, preview, loadH3) {
    const h3 = preview.cells.length ? await loadH3() : null;
    const features = preview.cells.flatMap(({ id, count }) => {
        if (typeof id !== 'string' || !h3?.isValidCell(id)) return [];
        return [{
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [h3.cellToBoundary(id, true)] },
            properties: { h3_index: id, count }
        }];
    });
    model.density = preview.cells.some(cell => cell.count !== null);
    model.geometry = { type: 'FeatureCollection', features };
    model.summary = `Showing ${features.length} of ${preview.total} H3 cells at resolution ${preview.resolution}.`;
    if (features.length < preview.total) model.warnings.push('This view contains a subset of the reported cells.');
}

export function initResultViewer(map, loadH3) {
    const byId = id => document.getElementById(id);
    const panel = byId('result-panel');
    const fileInput = byId('result-file');
    const summary = byId('result-summary');
    const source = byId('result-source');
    const warnings = byId('result-warnings');
    const search = byId('result-search');
    const filter = byId('result-filter');
    const count = byId('result-count');
    const items = byId('result-items');
    const resultLayer = L.featureGroup().addTo(map);
    const renderer = L.canvas({ padding: 0.3 });
    let places = [];
    let revision = 0;

    function textElement(tag, value) {
        const element = document.createElement(tag);
        element.textContent = value;
        return element;
    }

    function renderPlaces() {
        const query = filter.value.trim().toLocaleLowerCase();
        const selection = places.filter(place => `${place.name} ${place.detail}`.toLocaleLowerCase().includes(query));
        const rows = document.createDocumentFragment();
        for (const place of places) {
            if (resultLayer.hasLayer(place.marker)) resultLayer.removeLayer(place.marker);
        }
        for (const place of selection) {
            resultLayer.addLayer(place.marker);
            const row = document.createElement('li');
            const button = textElement('button', place.name);
            button.type = 'button';
            if (place.detail) button.append(textElement('small', place.detail));
            button.addEventListener('click', () => {
                map.setView([place.lat, place.lng], Math.max(map.getZoom(), 15));
                place.marker.openPopup();
            });
            row.append(button);
            rows.append(row);
        }
        items.replaceChildren(rows);
        items.hidden = !selection.length;
        count.textContent = `${selection.length} ${selection.length === 1 ? 'place' : 'places'} shown`;
    }

    function render(model) {
        resultLayer.clearLayers();
        summary.textContent = model.summary;
        source.textContent = model.source;
        source.hidden = !model.source;
        warnings.replaceChildren(...model.warnings.map(warning => textElement('li', warning)));
        warnings.hidden = !model.warnings.length;
        places = model.places.map(place => {
            const marker = L.circleMarker([place.lat, place.lng], {
                renderer, radius: 6, color: '#fff', weight: 1.5, fillColor: '#0e7490', fillOpacity: 1
            });
            marker.bindPopup(textElement('span', place.name));
            return { ...place, marker };
        });
        if (model.geometry) {
            const max = model.geometry.features.reduce((largest, feature) => Math.max(largest, Number(feature.properties?.count) || 0), 1);
            L.geoJSON(model.geometry, {
                renderer,
                pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { renderer, radius: 6 }),
                style: feature => ({
                    color: model.density ? '#9a3412' : '#0e7490',
                    weight: 2,
                    fillOpacity: model.density ? 0.2 + 0.6 * Math.max(0, Number(feature.properties?.count) || 0) / max : 0.24
                }),
                onEachFeature: (feature, layer) => {
                    const { name, count: cellCount, h3_index: cell } = feature.properties || {};
                    const label = model.density ? `${cellCount} features${cell ? ` · ${cell}` : ''}` : (name || cell);
                    if (typeof label === 'string') layer.bindPopup(textElement('span', label));
                }
            }).addTo(resultLayer);
        }
        filter.value = '';
        search.hidden = !places.length;
        renderPlaces();
        const bounds = resultLayer.getBounds();
        if (bounds.isValid()) {
            const narrow = map.getSize().x <= 768;
            const panelPadding = narrow ? [24, panel.offsetHeight + 20] : [panel.offsetWidth + 112, 24];
            map.fitBounds(bounds, { paddingTopLeft: [24, 48], paddingBottomRight: panelPadding, maxZoom: 17 });
            byId('draw-hint').classList.add('hidden');
        }
    }

    async function loadFile(file) {
        if (!file) return;
        const version = ++revision;
        try {
            if (file.size > MAX_FILE_BYTES) throw new Error('Choose a JSON or GeoJSON file up to 5 MB.');
            const model = normalizeResult(JSON.parse(await file.text()));
            if (model.h3) await addH3Geometry(model, model.h3, loadH3);
            if (version === revision) render(model);
        } catch (error) {
            if (version === revision) summary.textContent = error instanceof SyntaxError ? 'This file could not be read as JSON.' : error.message;
        }
    }

    function close() {
        revision++;
        panel.hidden = true;
        resultLayer.clearLayers();
        places = [];
        fileInput.value = '';
        source.hidden = warnings.hidden = search.hidden = items.hidden = true;
        summary.textContent = 'Choose or drop a file here. It stays in your browser.';
        document.querySelector('#help button').focus();
    }

    byId('close-result').addEventListener('click', close);
    panel.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        close();
    });
    filter.addEventListener('input', renderPlaces);
    fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
    panel.addEventListener('dragover', event => event.preventDefault());
    panel.addEventListener('drop', event => {
        event.preventDefault();
        loadFile(event.dataTransfer.files[0]);
    });

    return {
        open() {
            panel.hidden = false;
            fileInput.focus();
        },
        async loadLink(demo, hash) {
            panel.hidden = false;
            const version = ++revision;
            summary.textContent = 'Loading map result…';
            try {
                const preview = readH3Preview(hash);
                const metadata = readResultMetadata(hash);
                let model;
                if (preview) {
                    model = {
                        places: [],
                        source: metadata?.source || 'H3 grid',
                        warnings: metadata?.warnings || []
                    };
                    await addH3Geometry(model, preview, loadH3);
                } else if (metadata) {
                    model = { ...metadata, summary: metadata.summary || 'Shared map preview.', places: [] };
                } else if (demo === 'places') {
                    const response = await fetch(new URL('../examples/places.json', import.meta.url));
                    if (!response.ok) throw new Error('The sample result could not be loaded.');
                    model = normalizeResult(await response.json());
                } else {
                    throw new Error('This map example is unavailable.');
                }
                if (version === revision) render(model);
            } catch (error) {
                if (version === revision) summary.textContent = error.message;
            }
        }
    };
}
