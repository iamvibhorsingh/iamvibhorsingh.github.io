let map, rsidebar, lsidebar, drawControl, drawnItems = null;
let bounds = null; // Global bounds variable for the visual black box
let activeScreenshotLayer = null; // The specific layer to be used for the screenshot
let activeBounds = null; // To store the bounds for PNG download

// H3 Globals
let h3Layer = null; // Leaflet layer group for H3 hexagons
let currentH3Cells = []; // Array of current H3 indices
const MAX_H3_RENDER_CELLS = 3000; // Safety limit for rendering

let proj4defs = null;
const projdefs = { "4326": L.CRS.EPSG4326, "3857": L.CRS.EPSG3857 };
let currentproj = "3857";
const currentmouse = L.latLng(0, 0);

const MAX_RECENT_BBOXES = 10;
let coordinatePrecision = 6;

// Satellite view layers
let currentLayer = 'street';
let streetLayer = null;
let satelliteLayer = null;


L.Rectangle.prototype.setBounds = function (latLngBounds) {
    this.setLatLngs(this._boundsToLatLngs(latLngBounds));
    this.fire('bounds-set');
}


const FormatSniffer = (function () {

    'use strict';

    const FormatSniffer = function (options) {

        options || (options = {});

        if (!this || !(this instanceof FormatSniffer)) {
            return new FormatSniffer(options);
        }


        this.regExes = {
            ogrinfoExtent: /Extent\:\s\((.*)\)/,
            bbox: /^\(([\s|\-|0-9]*\.[0-9]*,[\s|\-|0-9]*\.[0-9]*,[\s|\-|0-9]*\.[0-9]*,[\s|\-|0-9]*\.[0-9|\s]*)\)$/
        };
        this.data = options.data || "";
        this.parse_type = null;
    };

    FormatSniffer.prototype.sniff = function () {
        return this._sniffFormat();
    };

    FormatSniffer.prototype._is_ogrinfo = function () {
        const match = this.regExes.ogrinfoExtent.exec(this.data.trim());
        let extent = [];
        if (match) {
            const pairs = match[1].split(") - (");
            for (let indx = 0; indx < pairs.length; indx++) {
                const coords = pairs[indx].trim().split(",");
                extent = (extent.concat([parseFloat(coords[0].trim()), parseFloat(coords[1].trim())]));
            }
        }
        this.parse_type = "ogrinfo";
        return extent;
    };

    FormatSniffer.prototype._is_normal_bbox = function () {
        const match = this.regExes.bbox.exec(this.data.trim());
        let extent = [];
        if (match) {
            const bbox = match[1].split(",");
            for (let indx = 0; indx < bbox.length; indx++) {
                const coord = bbox[indx].trim();
                extent = (extent.concat([parseFloat(coord)]));
            }
        }
        this.parse_type = "bbox";
        return extent;
    };

    FormatSniffer.prototype._is_geojson = function () {
        try {
            // try JSON
            const json = JSON.parse(this.data);

            // try GeoJSON
            const parsed_data = new L.geoJson(json)

        } catch (err) {

            return null;

        }

        this.parse_type = "geojson";
        return parsed_data;
    };

    FormatSniffer.prototype._is_wkt = function () {
        if (this.data === "") {
            throw new Error("empty -- nothing to parse");
        }

        try {
            var parsed_data = new Wkt.Wkt(this.data);
        } catch (err) {
            return null;
        }

        this.parse_type = "wkt";
        return parsed_data;
    };

    FormatSniffer.prototype._sniffFormat = function () {

        let parsed_data = null;
        let fail = false;
        try {
            let next = true;

            // try ogrinfo
            parsed_data = this._is_ogrinfo()
            if (parsed_data.length > 0) {
                next = false;
            }

            // try normal bbox
            if (next) {
                parsed_data = this._is_normal_bbox();
                if (parsed_data.length > 0) next = false;
            }

            // try GeoJSON
            if (next) {
                parsed_data = this._is_geojson();
                if (parsed_data) next = false;
            }

            // try WKT
            if (next) {
                parsed_data = this._is_wkt();
                if (parsed_data) next = false;
            }

            // no matches, throw error
            if (next) {
                fail = true;
                throw {
                    "name": "NoTypeMatchError",
                    "message": "The data is not a recognized format:\n \
1. ogrinfo extent output\n \
2. bbox as (xMin,yMin,xMax,yMax )\n \
3. GeoJSON\n \
4. WKT\n\n "
                }
            }


        } catch (err) {
            console.error("Your paste is not parsable:\n" + err.message);
            fail = true;

        }

        if (!fail) {

            this._formatHandler[this.parse_type].call(this._formatHandler, parsed_data);

        }

        return (fail ? false : true);
    };

    FormatSniffer.prototype._formatHandler = {


        coerce: function (lyr, type_obj) {

            const event_obj = {
                layer: lyr,
                layerType: null,
            }

            // coerce to L.Draw types
            if (/point/i.test(type_obj)) {
                event_obj.layerType = "marker";
            }
            else if (/linestring/i.test(type_obj)) {
                event_obj.layerType = "polyline";
            }
            else if (/polygon/i.test(type_obj)) {
                event_obj.layerType = "polygon";
            }

            return event_obj;

        },

        reduce_layers: function (lyr) {
            let lyr_parts = [];
            if (typeof lyr['getLayers'] === 'undefined') {
                return [lyr];
            }
            else {
                const all_layers = lyr.getLayers();
                for (let i = 0; i < all_layers.length; i++) {
                    lyr_parts = lyr_parts.concat(this.reduce_layers(all_layers[i]));
                }
            }
            return lyr_parts;
        },

        get_leaflet_bounds: function (data) {
            const sw = [data[1], data[0]];
            const ne = [data[3], data[2]];
            return new L.LatLngBounds(sw, ne);
        },

        wkt: function (data) {

            const wkt_layer = data.construct[data.type].call(data);
            const all_layers = this.reduce_layers(wkt_layer);
            for (let indx = 0; indx < all_layers.length; indx++) {
                const lyr = all_layers[indx];
                const evt = this.coerce(lyr, data.type);

                map.fire('draw:created', evt);
            }

        },

        geojson: function (geojson_layer) {

            const all_layers = this.reduce_layers(geojson_layer);
            for (let indx = 0; indx < all_layers.length; indx++) {
                const lyr = all_layers[indx];

                const geom_type = geojson_layer.getLayers()[0].feature.geometry.type;
                const evt = this.coerce(lyr, geom_type);

                map.fire('draw:created', evt);
            }
        },

        ogrinfo: function (data) {
            const lBounds = this.get_leaflet_bounds(data);
            // create a rectangle layer
            const lyr = new L.Rectangle(lBounds);
            const evt = this.coerce(lyr, 'polygon');

            map.fire('draw:created', evt);
        },

        bbox: function (data) {
            const lBounds = this.get_leaflet_bounds(data);
            // create a rectangle layer
            const lyr = new L.Rectangle(lBounds);
            const evt = this.coerce(lyr, 'polygon');

            map.fire('draw:created', evt);
        }


    };

    return FormatSniffer;

})();


function addLayer(layer, name, title, zIndex, on, callback) {
    if (layer && on) {
        layer.setZIndex(zIndex).addTo(map);
    } else if (layer) {
        layer.setZIndex(zIndex);
    }
    // Create a simple layer switcher that toggles layers on and off.
    const ui = document.getElementById('map-ui');
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#';
    if (on) {
        link.className = 'enabled';
    } else {
        link.className = '';
    }
    link.innerHTML = name;
    link.title = title;
    link.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (callback) {
            callback();
            this.className = this.className === 'enabled' ? '' : 'enabled';
        } else if (layer) {
            if (map.hasLayer(layer)) {
                map.removeLayer(layer);
                this.className = '';
            } else {
                map.addLayer(layer);
                this.className = 'enabled';
            }
        }
    };
    item.appendChild(link);
    ui.appendChild(item);
}

function formatBounds(bounds, proj) {
    try {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const precision = parseInt($('#precision').val()) || 6;
        const coordOrder = $('input[name="coord-order"]:checked').val() || 'lng-lat';
        const isGDAL = $('#gdal').is(':checked');
        const separator = isGDAL ? ' ' : ', ';

        let minx, miny, maxx, maxy;

        if (proj === '4326') {
            minx = sw.lng; miny = sw.lat;
            maxx = ne.lng; maxy = ne.lat;
        } else {
            if (typeof projdefs !== 'undefined' && projdefs[proj]) {
                const p1 = projdefs[proj].project(sw);
                const p2 = projdefs[proj].project(ne);
                minx = p1.x; miny = p1.y;
                maxx = p2.x; maxy = p2.y;
            } else if (typeof proj4defs !== 'undefined' && proj4defs[proj]) {
                // proj4(dest, point) assumes WGS84 source
                const p1 = proj4(proj4defs[proj][1], [sw.lng, sw.lat]);
                const p2 = proj4(proj4defs[proj][1], [ne.lng, ne.lat]);
                minx = p1[0]; miny = p1[1];
                maxx = p2[0]; maxy = p2[1];
            } else {
                return 'Unknown Projection';
            }
        }

        // Apply coordinate order
        if (coordOrder === 'lat-lng') {
            return `${miny.toFixed(precision)}${separator}${minx.toFixed(precision)}${separator}${maxy.toFixed(precision)}${separator}${maxx.toFixed(precision)}`;
        } else {
            return `${minx.toFixed(precision)}${separator}${miny.toFixed(precision)}${separator}${maxx.toFixed(precision)}${separator}${maxy.toFixed(precision)}`;
        }
    } catch (e) {
        console.error("formatBounds error:", e);
        return '';
    }
}

function formatPoint(latlng, proj) {
    if (!latlng) return '';
    try {
        const precision = parseInt($('#precision').val()) || 6;
        const coordOrder = $('input[name="coord-order"]:checked').val() || 'lng-lat';
        const isGDAL = $('#gdal').is(':checked');
        const separator = isGDAL ? ' ' : ', ';

        let x, y;
        if (proj === '4326') {
            x = latlng.lng; y = latlng.lat;
        } else {
            if (typeof projdefs !== 'undefined' && projdefs[proj]) {
                const p = projdefs[proj].project(latlng);
                x = p.x; y = p.y;
            } else if (typeof proj4defs !== 'undefined' && proj4defs[proj]) {
                const p = proj4(proj4defs[proj][1], [latlng.lng, latlng.lat]);
                x = p[0]; y = p[1];
            } else {
                return '0, 0';
            }
        }

        // Apply coordinate order
        if (coordOrder === 'lat-lng') {
            return `${y.toFixed(precision)}${separator}${x.toFixed(precision)}`;
        } else {
            return `${x.toFixed(precision)}${separator}${y.toFixed(precision)}`;
        }
    } catch (e) { return ''; }
}

function formatTile(latlng, zoom) {
    const x = Math.floor((latlng.lng + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(latlng.lat * Math.PI / 180) + 1 / Math.cos(latlng.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return `${x},${y}`;
}

function validateStringAsBounds(bounds) {
    const splitBounds = bounds ? bounds.split(',') : null;
    if (!splitBounds || splitBounds.length !== 4) {
        return false;
    }

    const lat1 = parseFloat(splitBounds[0]);
    const lng1 = parseFloat(splitBounds[1]);
    const lat2 = parseFloat(splitBounds[2]);
    const lng2 = parseFloat(splitBounds[3]);

    // Check if all values are valid numbers
    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) {
        return false;
    }

    // Check if coordinates are within valid ranges
    if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) {
        return false;
    }
    if (lng1 < -180 || lng1 > 180 || lng2 < -180 || lng2 > 180) {
        return false;
    }

    // Check if bounds are valid (min < max)
    if (lat1 >= lat2 || lng1 >= lng2) {
        return false;
    }

    return true;
}

function getFormattedBox(format) {
    const b = bounds.getBounds();
    if (!b.isValid()) return "Draw a box first.";

    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const xmin = sw.lng;
    const ymin = sw.lat;
    const xmax = ne.lng;
    const ymax = ne.lat;

    switch (format) {
        case 'wkt':
            return `POLYGON((${xmin} ${ymin}, ${xmax} ${ymin}, ${xmax} ${ymax}, ${xmin} ${ymax}, ${xmin} ${ymin}))`;
        case 'geojson-bbox':
            return `[${xmin}, ${ymin}, ${xmax}, ${ymax}]`;
        case 'leaflet':
            return `[[${ymin}, ${xmin}], [${ymax}, ${xmax}]]`;
        default:
            return "Unknown format.";
    }
}

function calculateBboxArea(bounds) {
    if (!bounds || !bounds.isValid()) return 0;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    // Use Haversine formula for more accurate area calculation
    const R = 6371; // Earth's radius in km

    const lat1 = sw.lat * Math.PI / 180;
    const lat2 = ne.lat * Math.PI / 180;
    const lng1 = sw.lng * Math.PI / 180;
    const lng2 = ne.lng * Math.PI / 180;

    const width = R * Math.abs(lng2 - lng1) * Math.cos((lat1 + lat2) / 2);
    const height = R * Math.abs(lat2 - lat1);

    return width * height;
}

function formatArea(areaKm2) {
    if (areaKm2 < 1) {
        return (areaKm2 * 1000000).toFixed(0) + ' m²';
    } else if (areaKm2 < 10000) {
        return areaKm2.toFixed(2) + ' km²';
    } else {
        return areaKm2.toFixed(0) + ' km²';
    }
}

function calculateBboxDimensions(bounds) {
    if (!bounds || !bounds.isValid()) return { width: 0, height: 0 };

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const width = Math.abs(ne.lng - sw.lng);
    const height = Math.abs(ne.lat - sw.lat);

    return { width, height };
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = $('#toast-notification');
    toast.removeClass('success error info').addClass(type);
    toast.text(message);
    toast.fadeIn(300);

    setTimeout(() => {
        toast.fadeOut(300);
    }, duration);
}

function showLoading(text = 'Loading...') {
    $('#loading-overlay .loading-text').text(text);
    $('#loading-overlay').fadeIn(200);
}

function hideLoading() {
    $('#loading-overlay').fadeOut(200);
}

function saveRecentBbox(bounds, name = null) {
    if (!bounds || !bounds.isValid()) return;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const bbox = {
        id: Date.now(),
        name: name || `Bbox ${new Date().toLocaleString()}`,
        bounds: [sw.lat, sw.lng, ne.lat, ne.lng],
        timestamp: Date.now(),
        projection: currentproj
    };

    let recent = JSON.parse(localStorage.getItem('recentBboxes') || '[]');
    recent.unshift(bbox);

    // Keep only the most recent ones
    if (recent.length > MAX_RECENT_BBOXES) {
        recent = recent.slice(0, MAX_RECENT_BBOXES);
    }

    localStorage.setItem('recentBboxes', JSON.stringify(recent));
    updateRecentList();
}

function loadRecentBboxes() {
    return JSON.parse(localStorage.getItem('recentBboxes') || '[]');
}

function deleteRecentBbox(id) {
    let recent = loadRecentBboxes();
    recent = recent.filter(bbox => bbox.id !== id);
    localStorage.setItem('recentBboxes', JSON.stringify(recent));
    updateRecentList();
}

function updateRecentList() {
    const recent = loadRecentBboxes();
    const list = $('#recent-list');

    if (recent.length === 0) {
        list.html('<p style="text-align: center; color: #999; padding: 20px;">No recent bounding boxes</p>');
        return;
    }

    list.empty();
    recent.forEach(bbox => {
        const item = $('<div class="recent-item"></div>');
        const header = $('<div class="recent-item-header"></div>');
        const name = $('<div class="recent-item-name"></div>').text(bbox.name);
        const time = $('<div class="recent-item-time"></div>').text(new Date(bbox.timestamp).toLocaleString());
        const coords = $('<div class="recent-item-coords"></div>').text(
            `[${bbox.bounds[0].toFixed(4)}, ${bbox.bounds[1].toFixed(4)}, ${bbox.bounds[2].toFixed(4)}, ${bbox.bounds[3].toFixed(4)}]`
        );
        const deleteBtn = $('<button class="recent-item-delete">Delete</button>');

        deleteBtn.on('click', (e) => {
            e.stopPropagation();
            deleteRecentBbox(bbox.id);
        });

        item.on('click', () => {
            const sw = L.latLng(bbox.bounds[0], bbox.bounds[1]);
            const ne = L.latLng(bbox.bounds[2], bbox.bounds[3]);
            const loadedBounds = L.latLngBounds(sw, ne);

            // Create a rectangle
            const lyr = new L.Rectangle(loadedBounds);
            const evt = {
                layer: lyr,
                layerType: 'polygon'
            };

            map.fire('draw:created', evt);
            map.fitBounds(loadedBounds);

            $('#recent-sidebar').hide();
            $('#recent-bboxes button').removeClass('enabled');

            showToast('Bounding box loaded', 'success');
        });

        header.append(name);
        item.append(header);
        item.append(time);
        item.append(coords);
        item.append(deleteBtn);
        list.append(item);
    });
}

function generateShareUrl() {
    const b = bounds.getBounds();
    if (!b.isValid()) {
        showToast('Draw a bounding box first', 'error');
        return;
    }

    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const hash = `${sw.lat.toFixed(6)},${sw.lng.toFixed(6)},${ne.lat.toFixed(6)},${ne.lng.toFixed(6)}`;

    const url = `${window.location.origin}${window.location.pathname}#${hash}`;

    navigator.clipboard.writeText(url).then(() => {
        showToast('Share URL copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy URL:', err);
        showToast('Failed to copy URL', 'error');
    });
}

function loadBboxFromHash() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return false;

    const parts = hash.split(',').map(parseFloat);
    if (parts.length !== 4) return false;

    const [lat1, lng1, lat2, lng2] = parts;

    // Validate coordinates
    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return false;
    if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) return false;
    if (lng1 < -180 || lng1 > 180 || lng2 < -180 || lng2 > 180) return false;

    const sw = L.latLng(lat1, lng1);
    const ne = L.latLng(lat2, lng2);
    const loadedBounds = L.latLngBounds(sw, ne);

    // Create a rectangle
    const lyr = new L.Rectangle(loadedBounds);
    const evt = {
        layer: lyr,
        layerType: 'polygon'
    };

    map.fire('draw:created', evt);
    map.fitBounds(loadedBounds);

    console.log('Loaded bounding box from URL');
    return true;
}

function updateProjectionInfo(projCode) {
    const descriptions = {
        '3857': 'Web Mercator - Used by Google Maps, OpenStreetMap, and most web mapping services. Good for web display but distorts area at high latitudes.',
        '4326': 'WGS84 Geographic - Standard latitude/longitude coordinates. Used by GPS and most geographic data. No projection distortion.',
        '27700': 'British National Grid - Used for mapping in Great Britain. Accurate for UK but not suitable outside this region.',
        '2154': 'Lambert-93 - Official projection for France. Optimized for accurate measurements within France.',
        '32633': 'UTM Zone 33N - Universal Transverse Mercator for central Europe. Good for accurate measurements in this zone.',
        '3395': 'World Mercator - Similar to Web Mercator but uses WGS84 ellipsoid. Better for scientific applications.',
        '900913': 'Google Mercator - Legacy code for Web Mercator (GOOGLE spelled in numbers).'
    };

    const desc = descriptions[projCode];
    if (desc) {
        $('#proj-description').text(desc);
    } else if (proj4defs && proj4defs[projCode]) {
        $('#proj-description').text(`${proj4defs[projCode][0]} - Custom projection system.`);
    } else {
        $('#proj-description').text('Unknown projection system.');
    }
}



$(function () { // Modern equivalent of $(document).ready
    console.log('BBox Finder: Starting initialization...');

    $('input[type="textarea"]').on('click', function () { this.select() });

    $("#projection").val(currentproj);

    // Initialize H3 Features
    initH3Features();

    var help_text = "BBox Finder - Quick Start Guide\n\n" +
        "TOOLBAR BUTTONS (Top Right):\n" +
        "✏️  Enter Coordinates - Paste GeoJSON, WKT, or bbox coordinates\n" +
        "📍 My Location - GPS positioning with IP fallback\n" +
        "📋 Recent Bboxes - Access your last 10 bounding boxes\n" +
        "🗑️  Clear All - Remove all drawn features\n" +
        "🔗 Share URL - Copy shareable link with current bbox\n" +
        "💬 Feedback - Send us your thoughts or report issues\n" +
        "❓ Help - This guide\n" +
        "⬡ H3 Tools - Toggle Uber H3 hexagonal grid tools\n\n" +

        "DRAWING TOOLS (Left Side):\n" +
        "Use the drawing controls to create:\n" +
        "• Rectangle - Draw rectangular bounding boxes\n" +
        "• Circle - Draw circular areas\n" +
        "• Polygon - Draw custom polygons\n" +
        "• Polyline - Draw lines\n" +
        "• Marker - Place point markers\n" +
        "• Edit/Delete - Modify or remove features\n\n" +

        "UBER H3 TOOLS (New!):\n" +
        "• Resolution Slider - Visualize hexagons (0-15)\n" +
        "• Compact - Toggle optimized coverage\n" +
        "• Copy Indices - Get list of H3 cell IDs\n" +
        "• Code Gen - Get H3 Python/JS snippets\n\n" +

        "NEW FEATURES:\n" +
        "📏 Precision Control - Adjust decimal places (1-12) for coordinates\n" +
        "📐 Area Calculation - See bbox area in m² or km² automatically\n" +
        "📊 Dimensions - View width × height in degrees\n" +
        "🔗 URL Sharing - Share bboxes via URL (auto-loads on page load)\n" +
        "💾 Recent History - Last 10 bboxes saved automatically\n" +
        "ℹ️  Projection Info - Learn about each coordinate system\n\n" +

        "COORDINATE FORMATS (Bottom Panel):\n" +
        "• Lng,Lat ↔ Lat,Lng: Change coordinate order\n" +
        "• GDAL format: Use comma separators instead of spaces\n" +
        "• Precision: Control decimal places (default: 6)\n" +
        "• Copy buttons: Click 📋 next to any coordinate to copy\n\n" +

        "PROJECTIONS (Top Left):\n" +
        "• Type EPSG codes (3857, 4326, 27700, etc.) and press Enter\n" +
        "• Autocomplete available - type 3+ characters\n" +
        "• See projection description in \"Bounding Box Info\" section\n" +
        "• Common: 3857 (Web Mercator), 4326 (WGS84), 27700 (British Grid)\n\n" +

        "EXPORT FORMATS:\n" +
        "• Copy WKT - Well-Known Text format\n" +
        "• Copy GeoJSON BBox - JSON array format\n" +
        "• Copy Leaflet Array - For Leaflet.js library\n" +
        "• Download PNG - Screenshot of map area (when bbox drawn)\n\n" +

        "PASTE DATA:\n" +
        "Click ✏️ \"Enter Coordinates\" to paste:\n" +
        "• GeoJSON features and geometries\n" +
        "• WKT (Well-Known Text) geometries\n" +
        "• Bounding box coordinates (xmin,ymin,xmax,ymax)\n" +
        "• ogrinfo extent output\n\n" +

        "TIPS:\n" +
        "• All bboxes are auto-saved to Recent History\n" +
        "• Use Share URL to collaborate with others\n" +
        "• Adjust precision for your use case (2 for rough, 8 for precise)\n" +
        "• Projection descriptions help choose the right system\n" +
        "• Recent bboxes persist in browser storage\n\n" +

        "SUPPORT:\n" +
        "For help, bug reports, or feature requests:\n" +
        "• Click 💬 Feedback button\n" +
        "• Email: contact@vibhorsingh.com";


    $('#lsidebar textarea').val(help_text);

    // Initialize the map using standard Leaflet
    console.log('BBox Finder: Initializing map...');
    map = L.map('map').setView([0, 0], 3);

    // Define Mapbox Layer
    const mapboxLayer = L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token={accessToken}', {
        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: 'pk.eyJ1IjoidmliaG9yc2luZ2giLCJhIjoiY21id3lxM2R3MTcybzJpcHdhanU1dTB5dCJ9.vBNwuEDJXfsxT-lfLNCbWA'
    });

    // Define OpenStreetMap Layer (Fallback)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    // Add Mapbox first
    mapboxLayer.addTo(map);
    streetLayer = mapboxLayer; // Set as current street layer

    // Initialize satellite layer (not added to map yet)
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });

    // Fallback Logic: If Mapbox fails (e.g. 403 on localhost), switch to OSM
    mapboxLayer.on('tileerror', function (e) {
        // Only trigger once to avoid flickering/loops
        if (map.hasLayer(mapboxLayer)) {
            console.warn('Mapbox tile error (likely token restriction), switching to OpenStreetMap fallback.');
            map.removeLayer(mapboxLayer);
            osmLayer.addTo(map);
            streetLayer = osmLayer; // Update street layer reference
            showToast('Mapbox blocked on localhost. Switched to OpenStreetMap.', 'info');
        }
    });

    mapboxLayer.on('tileload', function () {
        console.log('Mapbox: Tile loaded successfully');
    });

    setTimeout(function () {
        console.log('BBox Finder: Attempting to initialize GeoSearch...');

        const urlParams = new URLSearchParams(window.location.search);
        const skipSearch = urlParams.get('nosearch') === 'true';

        if (skipSearch) {
            console.log('GeoSearch disabled via URL parameter (?nosearch=true)');
            return;
        }

        console.log('Available objects:', {
            GeoSearch: typeof GeoSearch,
            windowGeoSearch: typeof window.GeoSearch,
            leafletVersion: L.version
        });

        try {
            if (!map || !map.getContainer()) {
                console.warn('Map not properly initialized, skipping GeoSearch');
                return;
            }

            if (typeof GeoSearch === 'undefined') {
                throw new Error('GeoSearch library not loaded');
            }

            console.log('Trying basic GeoSearch initialization...');
            const provider = new GeoSearch.OpenStreetMapProvider();
            const searchControl = new GeoSearch.GeoSearchControl({
                provider: provider
            });

            if (!searchControl || typeof searchControl.addTo !== 'function') {
                throw new Error('Invalid search control created');
            }

            map.addControl(searchControl);
            console.log('BBox Finder: GeoSearch control added successfully');

            // Add event listeners for search results
            map.on('geosearch/showlocation', function (result) {
                console.log('Search result found:', result);
            });

        } catch (error) {
            console.error('GeoSearch initialization failed:', error);
            console.log('The application will continue without search functionality.');
            console.log('You can navigate the map manually using mouse/touch controls.');
            console.log('To retry with different settings, add ?nosearch=true to URL to disable completely.');

            // Show fallback manual search
            $('#manual-search').show();
            console.log('Manual search input enabled as fallback');
        }
    }, 1000);

    // Fallback manual search functionality
    function setupManualSearch() {
        $('#search-btn').on('click', function () {
            performManualSearch();
        });

        $('#location-search').on('keypress', function (e) {
            if (e.which === 13) { // Enter key
                performManualSearch();
            }
        });
    }

    function performManualSearch() {
        const query = $('#location-search').val().trim();
        if (!query) {
            showToast('Please enter a location to search for', 'error');
            return;
        }

        console.log('Manual search for:', query);
        showLoading('Searching for location...');

        // Use Nominatim API directly
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                hideLoading();
                if (data && data.length > 0) {
                    const result = data[0];
                    const lat = parseFloat(result.lat);
                    const lon = parseFloat(result.lon);

                    console.log('Search result:', result);

                    map.setView([lat, lon], 15);

                    const marker = L.marker([lat, lon]).addTo(map);
                    marker.bindPopup(`<b>${result.display_name}</b>`).openPopup();

                    setTimeout(() => {
                        map.removeLayer(marker);
                    }, 10000);

                    $('#location-search').val('');
                    showToast('Location found!', 'success');

                } else {
                    showToast('Location not found. Please try a different search term.', 'error');
                }
            })
            .catch(error => {
                hideLoading();
                console.error('Search error:', error);
                showToast('Search failed. Please check your internet connection and try again.', 'error');
            });
    }

    setupManualSearch();

    const crosshairIcon = L.icon({
        iconUrl: 'images/crosshair.png',
        iconSize: [20, 20], // size of the icon
        iconAnchor: [10, 10], // point of the icon which will correspond to marker's location
    });
    let crosshair = new L.marker(map.getCenter(), { icon: crosshairIcon, clickable: false });
    crosshair.addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    drawControl = new L.Control.Draw({
        draw: {
            polyline: true,
            polygon: true,
            circle: true,
            rectangle: true,
            marker: true,
            circlemarker: true
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    map.addControl(drawControl);

    let startBounds = new L.LatLngBounds([0.0, 0.0], [0.0, 0.0]);
    bounds = new L.Rectangle(startBounds,
        {
            fill: false,
            opacity: 1.0,
            color: '#000'
        }
    );
    bounds.on('bounds-set', function (e) {
        // move it to the end of the parent
        const parent = e.target._renderer._container.parentElement;
        $(parent).append(e.target._renderer._container);
        const southwest = this.getBounds().getSouthWest();
        const northeast = this.getBounds().getNorthEast();
        const xmin = southwest.lng.toFixed(6);
        const ymin = southwest.lat.toFixed(6);
        const xmax = northeast.lng.toFixed(6);
        const ymax = northeast.lat.toFixed(6);
        location.hash = ymin + ',' + xmin + ',' + ymax + ',' + xmax;
    });
    map.addLayer(bounds);

    map.on('draw:created', function (e) {
        const layer = e.layer;
        drawnItems.addLayer(layer);

        // Only Rectangles and Polygons can become the active screenshot layer.
        if (layer instanceof L.Rectangle || layer instanceof L.Polygon) {
            activeScreenshotLayer = layer;
            $('#download-png').show();

            try {
                const screenshotBounds = activeScreenshotLayer.getBounds();
                activeBounds = new L.LatLngBounds(screenshotBounds.getSouthWest(), screenshotBounds.getNorthEast());

                bounds.setBounds(screenshotBounds);
                $('#boxbounds').text(formatBounds(screenshotBounds, '4326'));
                $('#boxboundsmerc').text(formatBounds(screenshotBounds, currentproj));
                map.fitBounds(screenshotBounds);

                updateBboxInfo(screenshotBounds);
                saveRecentBbox(screenshotBounds);

            } catch (error) {
                console.error('Error in draw:created handler for box:', error);
            }
        }
    });

    map.on('draw:deleted', function (e) {
        let activeLayerWasDeleted = false;
        e.layers.eachLayer(function (l) {
            if (l === activeScreenshotLayer) {
                activeLayerWasDeleted = true;
            }
            drawnItems.removeLayer(l);
        });

        if (activeLayerWasDeleted) {
            activeScreenshotLayer = null;
            const remainingLayers = drawnItems.getLayers();

            if (remainingLayers.length > 0) {
                for (let i = remainingLayers.length - 1; i >= 0; i--) {
                    if (remainingLayers[i] instanceof L.Rectangle || remainingLayers[i] instanceof L.Polygon) {
                        activeScreenshotLayer = remainingLayers[i];
                        break;
                    }
                }
            }
        }

        if (activeScreenshotLayer) {
            const screenshotBounds = activeScreenshotLayer.getBounds();
            activeBounds = new L.LatLngBounds(screenshotBounds.getSouthWest(), screenshotBounds.getNorthEast());
            bounds.setBounds(screenshotBounds);
            $('#boxbounds').text(formatBounds(screenshotBounds, '4326'));
            $('#boxboundsmerc').text(formatBounds(screenshotBounds, currentproj));
            map.fitBounds(screenshotBounds);
        } else {
            activeBounds = null;
            $('#download-png').hide();
            $('#boxbounds').text('No bounding box drawn');
            $('#boxboundsmerc').text('No bounding box drawn');
            bounds.setBounds(new L.LatLngBounds([0.0, 0.0], [0.0, 0.0]));
        }
    });

    map.on('draw:edited', function (e) {
        const layers = e.layers.getLayers();
        if (layers.length > 0) {
            const editedLayer = layers[layers.length - 1];

            if (editedLayer instanceof L.Rectangle || editedLayer instanceof L.Polygon) {
                activeScreenshotLayer = editedLayer;
            }
        }

        if (activeScreenshotLayer) {
            $('#download-png').show();
            const screenshotBounds = activeScreenshotLayer.getBounds();
            activeBounds = new L.LatLngBounds(screenshotBounds.getSouthWest(), screenshotBounds.getNorthEast());

            bounds.setBounds(screenshotBounds);
            $('#boxbounds').text(formatBounds(screenshotBounds, '4326'));
            $('#boxboundsmerc').text(formatBounds(screenshotBounds, currentproj));
            map.fitBounds(screenshotBounds);

            updateBboxInfo(screenshotBounds);
            saveRecentBbox(screenshotBounds);
        }
    });

    function display() {
        $('.zoomlevel').text(map.getZoom().toString());
        $('.tilelevel').text(formatTile(map.getCenter(), map.getZoom()));
        $('#mapbounds').text(formatBounds(map.getBounds(), '4326'));
        $('#mapboundsmerc').text(formatBounds(map.getBounds(), currentproj));
        $('#center').text(formatPoint(map.getCenter(), '4326'));
        $('#centermerc').text(formatPoint(map.getCenter(), currentproj));

        if (drawnItems.getLayers().length === 0) {
            $('#boxbounds').text('No bounding box drawn');
            $('#boxboundsmerc').text('No bounding box drawn');
        }

        $('#mousepos').text(formatPoint(map.getCenter(), '4326')); // Start with center
        $('#mouseposmerc').text(formatPoint(map.getCenter(), currentproj));
    }

    setTimeout(function () {
        display();
    }, 200);

    map.on('move', function (e) {
        crosshair.setLatLng(map.getCenter());
        display();
    });

    map.on('mousemove', function (e) {
        currentmouse.lat = e.latlng.lat;
        currentmouse.lng = e.latlng.lng;
        $('.tilelevel').text(formatTile(e.latlng, map.getZoom()));
        $('#mousepos').text(formatPoint(e.latlng, '4326'));
        $('#mouseposmerc').text(formatPoint(e.latlng, currentproj));

        $('#mapbounds').text(formatBounds(map.getBounds(), '4326'));
        $('#mapboundsmerc').text(formatBounds(map.getBounds(), currentproj));
        $('#center').text(formatPoint(map.getCenter(), '4326'));
        $('#centermerc').text(formatPoint(map.getCenter(), currentproj));
    });

    map.on('zoomend', function (e) {
        $('.tilelevel').text(formatTile(currentmouse, map.getZoom()));
        $('.zoomlevel').text(map.getZoom().toString());
        $('#mapbounds').text(formatBounds(map.getBounds(), '4326'));
        $('#mapboundsmerc').text(formatBounds(map.getBounds(), currentproj));

        $('#center').text(formatPoint(map.getCenter(), '4326'));
        $('#centermerc').text(formatPoint(map.getCenter(), currentproj));

        if (drawnItems.getLayers().length === 0) {
            $('#boxbounds').text('No bounding box drawn');
            $('#boxboundsmerc').text('No bounding box drawn');
        }
    });

    const showCopyFeedback = (element) => {
        const feedback = $("<span>&nbsp;Copied!&nbsp;</span>").css({
            "position": "absolute",
            "background-color": "#C7C700",
            "color": "#000",
            "font-style": "bold",
            "border-radius": "15px",
            "padding": "5px",
            "box-shadow": "0px 2px 20px #000",
            "z-index": 1000
        });

        $(element).parent().append(feedback);
        feedback.css({
            top: $(element).position().top - 35,
            left: $(element).position().left - 15,
        }).animate({ opacity: 0, top: "-=20" }, 800, function () {
            $(this).remove();
        });
    };

    $('#info').on('click', 'button[data-clipboard-target]', function () {
        const targetId = $(this).data('clipboard-target');
        const textToCopy = $('#' + targetId).text();

        if (!navigator.clipboard) {
            console.error('Clipboard API not available.');
            return;
        }

        navigator.clipboard.writeText(textToCopy).then(() => {
            showCopyFeedback(this);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    });

    $('#copy-wkt').on('click', function () {
        const output = getFormattedBox('wkt');
        navigator.clipboard.writeText(output).then(() => {
            showToast('WKT copied!', 'success', 2000);
        }).catch(err => {
            console.error('Failed to copy WKT:', err);
            showToast('Failed to copy WKT', 'error');
        });
    });

    $('#copy-geojson-bbox').on('click', function () {
        const output = getFormattedBox('geojson-bbox');
        navigator.clipboard.writeText(output).then(() => {
            showToast('GeoJSON BBox copied!', 'success', 2000);
        }).catch(err => {
            console.error('Failed to copy GeoJSON BBox:', err);
            showToast('Failed to copy GeoJSON BBox', 'error');
        });
    });

    $('#copy-leaflet-array').on('click', function () {
        const output = getFormattedBox('leaflet');
        navigator.clipboard.writeText(output).then(() => {
            showToast('Leaflet array copied!', 'success', 2000);
        }).catch(err => {
            console.error('Failed to copy Leaflet array:', err);
            showToast('Failed to copy Leaflet array', 'error');
        });
    });

    $('#download-png').on('click', function () {
        if (!activeBounds) {
            alert("Please draw or select a bounding box first.");
            return;
        }

        $('.leaflet-control-container, #map-ui, #map-ui-proj').hide();

        html2canvas(document.getElementById('map'), {
            useCORS: true,
            logging: false
        }).then(function (canvas) {
            // Show controls again
            $('.leaflet-control-container, #map-ui, #map-ui-proj').show();

            try {
                const nw = map.latLngToContainerPoint(activeBounds.getNorthWest());
                const se = map.latLngToContainerPoint(activeBounds.getSouthEast());

                const cropWidth = se.x - nw.x;
                const cropHeight = se.y - nw.y;

                if (cropWidth <= 0 || cropHeight <= 0) {
                    throw new Error("Invalid bounding box dimensions for capture.");
                }

                // Create a new canvas to hold the cropped image
                const croppedCanvas = document.createElement('canvas');
                croppedCanvas.width = cropWidth;
                croppedCanvas.height = cropHeight;
                const croppedCtx = croppedCanvas.getContext('2d');

                // Crop the original canvas
                croppedCtx.drawImage(canvas,
                    nw.x, nw.y,
                    cropWidth, cropHeight,
                    0, 0,
                    cropWidth, cropHeight
                );

                // Create a link to download the image
                const link = document.createElement('a');
                link.download = 'map_capture.png';
                link.href = croppedCanvas.toDataURL('image/png');
                link.click();
            } catch (error) {
                console.error('Error during canvas cropping:', error);
                alert('Could not create image from the bounding box. Please ensure the box is visible on the map.');
            }

        }).catch(function (error) {
            console.error('html2canvas failed:', error);
            $('.leaflet-control-container, #map-ui, #map-ui-proj').show();
            alert('Could not capture map image. See browser console for more details.');
        });
    });

    $('#create-geojson button').click(function () {
        const isEnabled = $('#create-geojson button').hasClass('enabled');
        if (isEnabled) {
            $('#create-geojson button').removeClass('enabled');
            $('#rsidebar').hide();
        } else {
            $('#create-geojson button').addClass('enabled');
            $('#rsidebar').show();
        }
    });

    // handle help button click events
    $('#help button').click(function () {
        const isEnabled = $('#help button').hasClass('enabled');
        if (isEnabled) {
            $('#help button').removeClass('enabled');
            $('#lsidebar').hide();
        } else {
            $('#help button').addClass('enabled');
            $('#lsidebar').show();
        }
    });

    // handle recent bboxes button click events
    $('#recent-bboxes button').click(function () {
        const isEnabled = $('#recent-bboxes button').hasClass('enabled');
        if (isEnabled) {
            $('#recent-bboxes button').removeClass('enabled');
            $('#recent-sidebar').hide();
        } else {
            $('#recent-bboxes button').addClass('enabled');
            updateRecentList();
            $('#recent-sidebar').show();
        }
    });

    // handle clear all button click events
    $('#clear-all button').click(function () {
        if (drawnItems.getLayers().length === 0) {
            showToast('No features to clear', 'info');
            return;
        }

        if (confirm('Clear all drawn features?')) {
            drawnItems.clearLayers();
            activeScreenshotLayer = null;
            activeBounds = null;
            $('#download-png').hide();
            $('#boxbounds').text('No bounding box drawn');
            $('#boxboundsmerc').text('No bounding box drawn');
            bounds.setBounds(new L.LatLngBounds([0.0, 0.0], [0.0, 0.0]));
            updateBboxInfo(null);
            showToast('All features cleared', 'success');
        }
    });

    // handle share URL button click events
    $('#share-url button').click(function () {
        generateShareUrl();
    });

    // handle precision input change
    $('#precision').on('change', function () {
        const newPrecision = parseInt($(this).val());
        if (newPrecision >= 1 && newPrecision <= 12) {
            coordinatePrecision = newPrecision;

            // Update all displayed coordinates
            $('#mapbounds').text(formatBounds(map.getBounds(), '4326'));
            $('#mapboundsmerc').text(formatBounds(map.getBounds(), currentproj));
            $('#center').text(formatPoint(map.getCenter(), '4326'));
            $('#centermerc').text(formatPoint(map.getCenter(), currentproj));
            $('#mousepos').text(formatPoint(currentmouse, '4326'));
            $('#mouseposmerc').text(formatPoint(currentmouse, currentproj));

            // Update bounding box coordinates if they exist
            if (drawnItems.getLayers().length > 0 && bounds.getBounds().isValid()) {
                $('#boxbounds').text(formatBounds(bounds.getBounds(), '4326'));
                $('#boxboundsmerc').text(formatBounds(bounds.getBounds(), currentproj));
            }

            showToast(`Precision set to ${newPrecision} decimal places`, 'success', 2000);
        }
    });

    // handle geolocation click events
    $('#geolocation button').click(function () {
        $('#geolocation button').addClass('active');
        showLoading('Getting your location...');

        // Check if geolocation is supported
        if (!navigator.geolocation) {
            hideLoading();
            showToast('Geolocation is not supported by this browser', 'error');
            $('#geolocation button').removeClass('active');
            return;
        }

        // Check if we're on HTTPS (required for geolocation in many browsers)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            alert('Geolocation requires HTTPS. Please access this site over HTTPS for location features to work.');
            $('#geolocation button').removeClass('active');
            return;
        }

        // First try to get permission status if available
        if (navigator.permissions) {
            navigator.permissions.query({ name: 'geolocation' }).then(function (result) {
                if (result.state === 'denied') {
                    hideLoading();
                    showToast('Location access is blocked. Please enable location permissions in your browser settings', 'error', 5000);
                    $('#geolocation button').removeClass('active');
                    return;
                }
                attemptGeolocation();
            }).catch(function () {
                attemptGeolocation();
            });
        } else {
            attemptGeolocation();
        }

        function attemptGeolocation() {
            console.log('Attempting geolocation...');

            map.locate({
                setView: true,
                maxZoom: 16,
                timeout: 15000,
                maximumAge: 300000,
                enableHighAccuracy: false
            });

            // Remove active class after timeout
            setTimeout(function () {
                $('#geolocation button').removeClass('active');
            }, 15000);
        }
    });

    map.on('locationfound', function (e) {
        hideLoading();
        console.log('Location found:', e.latlng);

        // Add a temporary marker at the user's location
        const locationMarker = L.marker(e.latlng).addTo(map);
        locationMarker.bindPopup(`You are here!<br/>Accuracy: ${Math.round(e.accuracy)} meters`).openPopup();

        // Remove the marker after 10 seconds
        setTimeout(() => {
            map.removeLayer(locationMarker);
        }, 10000);

        $('#geolocation button').removeClass('active');
        showToast('Location found!', 'success');
    });

    // Fallback IP-based geolocation function
    function tryIPGeolocation() {
        console.log('Trying IP-based geolocation fallback...');
        showLoading('Trying approximate location...');

        // Try ipapi.co first (no API key required)
        fetch('https://ipapi.co/json/')
            .then(response => response.json())
            .then(data => {
                hideLoading();
                if (data.latitude && data.longitude) {
                    console.log('IP geolocation successful:', data);
                    const latlng = L.latLng(data.latitude, data.longitude);
                    map.setView(latlng, 10);

                    const locationMarker = L.marker(latlng).addTo(map);
                    locationMarker.bindPopup(`Approximate location based on IP<br/>City: ${data.city}, ${data.country_name}<br/>Note: This is less accurate than GPS`).openPopup();

                    setTimeout(() => {
                        map.removeLayer(locationMarker);
                    }, 15000);

                    $('#geolocation button').removeClass('active');
                    showToast('Approximate location found', 'info');
                } else {
                    throw new Error('No location data from IP service');
                }
            })
            .catch(error => {
                hideLoading();
                console.error('IP geolocation failed:', error);
                showToast('Could not determine your location. Please use the search box or navigate manually.', 'error', 5000);
                $('#geolocation button').removeClass('active');
            });
    }

    map.on('locationerror', function (e) {
        console.error('Location error details:', {
            code: e.code,
            message: e.message,
            type: e.type
        });

        let errorMessage = 'GPS location failed. ';

        switch (e.code) {
            case 1:
                errorMessage += 'Location access was denied. Please enable location permissions in your browser settings.';
                $('#geolocation button').removeClass('active');
                alert(errorMessage);
                break;
            case 2:
                errorMessage += 'GPS signal unavailable. Trying approximate location...';
                // Try IP-based geolocation as fallback
                tryIPGeolocation();
                break;
            case 3:
                errorMessage += 'GPS request timed out. Trying approximate location...';
                // Try IP-based geolocation as fallback
                tryIPGeolocation();
                break;
            default:
                errorMessage += 'An unknown error occurred. Trying approximate location...';
                tryIPGeolocation();
        }
    });

    $('#info-toggle-button').click(function () {
        $('#wgslabel, #projlabel').fadeToggle(200);
        $('#info').delay(300).slideToggle(200);


        const buttonText = $('#info-toggle-button').text();
        if (buttonText == 'Hide Coordinates') {
            $('#info-toggle-button').text('Show Coordinates');
        } else {
            $('#info-toggle-button').text('Hide Coordinates');
        }
    });

    // toggle coordinate tabs
    $('#wgslabel, #projlabel').click(function () {
        let active = $(this).hasClass('active');
        if (active) {
            //do nothing
        } else {
            $('#wgslabel, #projlabel').toggleClass('active');
            $('#wgscoords, #projcoords').toggle();
        }


    });

    $('button#add').on('click', function () {
        const sniffer = FormatSniffer({ data: $('#rsidebar textarea').val() });
        const is_valid = sniffer.sniff();
        if (is_valid) {
            $('#create-geojson button').toggleClass('enabled');
            map.fitBounds(bounds.getBounds());
        }
    });
    $('button#clear').on('click', function () {
        $('#rsidebar textarea').val('');
    });

    const tiles = new L.tileLayer('images/tile.png', {});
    addLayer(tiles, '🔲', "Google tile boundaries", 10, false);

    addLayer(null, '🛰️', "Toggle satellite view", 11, false, function () {
        if (currentLayer === 'street') {
            map.removeLayer(streetLayer);
            map.addLayer(satelliteLayer);
            currentLayer = 'satellite';
        } else {
            map.removeLayer(satelliteLayer);
            map.addLayer(streetLayer);
            currentLayer = 'street';
        }
    });

    showLoading('Loading projection definitions...');
    fetch("proj/proj4defs.json")
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            hideLoading();
            proj4defs = data;
            const autocompdata = [];
            $.each(data, (key, val) => {
                autocompdata.push({ label: `${key}-${val[0]}`, value: key });
            });

            $("#projection").autocomplete({
                source: autocompdata,
                minLength: 3,
                select: (event, ui) => {
                    $('#projlabel').text(`EPSG:${ui.item.value} - ${proj4defs[ui.item.value][0]}`);
                    currentproj = ui.item.value;
                    $('#boxboundsmerc').text(formatBounds(bounds.getBounds(), currentproj));
                    $('#mouseposmerc').text(formatPoint(new L.LatLng(0, 0), currentproj));
                    $('#mapboundsmerc').text(formatBounds(map.getBounds(), currentproj));
                    $('#centermerc').text(formatPoint(map.getCenter(), currentproj));
                    updateProjectionInfo(ui.item.value);
                    showToast(`Projection changed to EPSG:${ui.item.value}`, 'success', 2000);
                }
            }).val('3857');

            $('#projection').on('click', function () {
                $("#projection").autocomplete("search", currentproj);
            });

            // Add Enter key and blur event handlers for manual EPSG input
            $('#projection').on('keypress blur', function (e) {
                if (e.type === 'keypress' && e.which !== 13) {
                    return;
                }

                const inputValue = $(this).val().trim();
                if (inputValue && inputValue !== currentproj) {
                    console.log('Attempting to change projection to:', inputValue);

                    if (proj4defs && proj4defs[inputValue]) {
                        console.log('Found projection in database:', proj4defs[inputValue][0]);
                        $('#projlabel').text(`EPSG:${inputValue} - ${proj4defs[inputValue][0]}`);
                        currentproj = inputValue;

                        $('#boxboundsmerc').text(formatBounds(bounds.getBounds(), currentproj));
                        $('#mouseposmerc').text(formatPoint(currentmouse, currentproj));
                        $('#mapboundsmerc').text(formatBounds(map.getBounds(), currentproj));
                        $('#centermerc').text(formatPoint(map.getCenter(), currentproj));

                        if (drawnItems.getLayers().length > 0) {
                            const layerBounds = drawnItems.getBounds();
                            if (layerBounds.isValid()) {
                                $('#boxboundsmerc').text(formatBounds(layerBounds, currentproj));
                            }
                        }

                        updateProjectionInfo(inputValue);
                        console.log('Projection changed successfully to:', inputValue);
                        showToast(`Projection changed to EPSG:${inputValue}`, 'success', 2000);
                    } else {
                        // Dynamic fetch from EPSG.io
                        console.log(`Projection ${inputValue} not found locally. Fetching from epsg.io...`);

                        // Show loading state
                        $('#projlabel').text(`EPSG:${inputValue} - Fetching definition...`);

                        fetch(`https://epsg.io/${inputValue}.proj4`)
                            .then(response => {
                                if (!response.ok) throw new Error('Network response was not ok');
                                return response.text();
                            })
                            .then(proj4String => {
                                if (!proj4String || proj4String.includes('<!DOCTYPE html>')) {
                                    throw new Error('Invalid proj4 string received');
                                }

                                console.log(`Fetched definition for ${inputValue}:`, proj4String);

                                // Add to definitions
                                const defName = `EPSG:${inputValue}`;
                                proj4.defs(defName, proj4String);
                                proj4defs[inputValue] = [defName, proj4String];

                                // Update current projection
                                currentproj = inputValue;
                                $('#projlabel').text(`EPSG:${inputValue} - ${defName}`);

                                // Update all coordinate displays
                                $('#boxboundsmerc').text(formatBounds(bounds.getBounds(), currentproj));
                                $('#mouseposmerc').text(formatPoint(currentmouse, currentproj));
                                $('#mapboundsmerc').text(formatBounds(map.getBounds(), currentproj));
                                $('#centermerc').text(formatPoint(map.getCenter(), currentproj));

                                // Update projection info if function exists
                                if (drawnItems.getLayers().length > 0) {
                                    const layerBounds = drawnItems.getBounds();
                                    if (layerBounds.isValid()) {
                                        $('#boxboundsmerc').text(formatBounds(layerBounds, currentproj));
                                    }
                                }

                                updateProjectionInfo(inputValue);
                                showToast(`Projection EPSG:${inputValue} loaded successfully!`, 'success', 2000);
                            })
                            .catch(error => {
                                console.error('Failed to fetch projection:', error);
                                $('#projlabel').text(`EPSG:${inputValue} - Fetch Failed`);
                                showToast(`Could not load projection ${inputValue}.`, 'error');
                                $(this).val(currentproj); // Revert to previous projection
                            });
                    }
                }
            });

            // Set labels for output... left always 4326, right is proj selection
            $('#wgslabel').text('EPSG:4326 - ' + proj4defs['4326'][0]);
            $('#projlabel').text('EPSG:3857 - ' + proj4defs['3857'][0]);

            updateProjectionInfo('3857');

            // Try to load bbox from URL hash
            setTimeout(() => {
                if (loadBboxFromHash()) {
                    showToast('Loaded bounding box from URL', 'success');
                }
            }, 500);
        })
        .catch(err => {
            hideLoading();
            console.error("Projection definitions load failed:", err);
            showToast('Failed to load projection definitions', 'error');
        });

    // Re-render display on any format change to update all coordinates
    $('input[name="coord-order"], #gdal').on('change', function () {
        console.log('Coordinate format changed:', {
            order: $('input[name="coord-order"]:checked').val(),
            gdal: $('#gdal').is(':checked')
        });

        // Update all displayed coordinates with new format
        $('#mapbounds').text(formatBounds(map.getBounds(), '4326'));
        $('#mapboundsmerc').text(formatBounds(map.getBounds(), currentproj));
        $('#center').text(formatPoint(map.getCenter(), '4326'));
        $('#centermerc').text(formatPoint(map.getCenter(), currentproj));
        $('#mousepos').text(formatPoint(currentmouse, '4326'));
        $('#mouseposmerc').text(formatPoint(currentmouse, currentproj));

        // Update bounding box coordinates if they exist
        if (drawnItems.getLayers().length > 0) {
            const layerBounds = drawnItems.getBounds();
            if (layerBounds.isValid()) {
                $('#boxbounds').text(formatBounds(layerBounds, '4326'));
                $('#boxboundsmerc').text(formatBounds(layerBounds, currentproj));
            }
        }

        showToast('Coordinate format updated', 'success', 1500);
    });

    // handle feedback button click events
    $('#feedback button').click(function () {
        const isEnabled = $('#feedback button').hasClass('enabled');
        if (isEnabled) {
            $('#feedback button').removeClass('enabled');
            $('#feedback-sidebar').hide();
        } else {
            $('#feedback button').addClass('enabled');
            $('#feedback-sidebar').show();
        }
    });

    // handle feedback form submission
    $('#feedback-form').on('submit', function (e) {
        e.preventDefault();

        const name = $('#feedback-name').val().trim() || 'Anonymous';
        const email = $('#feedback-email').val().trim() || 'No email provided';
        const message = $('#feedback-message').val().trim();

        if (!message) {
            showToast('Please enter a message', 'error');
            return;
        }

        showLoading('Sending feedback...');

        // Create mailto link with pre-filled content
        const subject = encodeURIComponent('BBox Finder Feedback');
        const body = encodeURIComponent(
            `Name: ${name}\n` +
            `Email: ${email}\n\n` +
            `Message:\n${message}\n\n` +
            `---\n` +
            `Sent from: ${window.location.href}\n` +
            `Browser: ${navigator.userAgent}`
        );

        const mailtoLink = `mailto:contact@vibhorsingh.com?subject=${subject}&body=${body}`;

        // Try to open email client
        window.location.href = mailtoLink;

        hideLoading();

        // Clear form and close sidebar
        $('#feedback-form')[0].reset();
        $('#feedback button').click();

        showToast('Email client opened. Please send the email to complete your feedback.', 'success', 5000);
    });

    // handle feedback cancel button
    $('#cancel-feedback').on('click', function () {
        $('#feedback-form')[0].reset();
        $('#feedback button').click();
    });

    // handle dark mode toggle
    $('#dark-mode button').click(function () {
        $('body').toggleClass('dark-mode');

        // Save preference to localStorage
        const isDarkMode = $('body').hasClass('dark-mode');
        localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');

        showToast(isDarkMode ? 'Dark mode enabled' : 'Light mode enabled', 'success', 2000);
    });

    // Load dark mode preference
    if (localStorage.getItem('darkMode') === 'enabled') {
        $('body').addClass('dark-mode');
    }

    let centerMarker = null;
    let isDraggingMarker = false;

    function updateCenterMarker() {
        if (activeScreenshotLayer && bounds && bounds.getBounds().isValid()) {
            const center = bounds.getBounds().getCenter();

            if (centerMarker) {
                if (!isDraggingMarker) {
                    centerMarker.setLatLng(center);
                }
            } else {
                // Create a draggable marker at the center
                centerMarker = L.marker(center, {
                    draggable: true,
                    icon: L.divIcon({
                        className: 'center-marker-icon',
                        html: '<div style="background: #ff6b6b; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>',
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    })
                });

                centerMarker.addTo(map);

                // Track when dragging starts
                centerMarker.on('dragstart', function () {
                    isDraggingMarker = true;
                });

                // Update bbox in real-time while dragging
                centerMarker.on('drag', function (e) {
                    if (!activeScreenshotLayer) return;

                    const newCenter = e.target.getLatLng();
                    const currentBounds = activeScreenshotLayer.getBounds();
                    const currentCenter = currentBounds.getCenter();

                    // Calculate offset in lat/lng
                    const latOffset = newCenter.lat - currentCenter.lat;
                    const lngOffset = newCenter.lng - currentCenter.lng;

                    // Create new bounds with offset
                    const sw = currentBounds.getSouthWest();
                    const ne = currentBounds.getNorthEast();
                    const newBounds = L.latLngBounds(
                        [sw.lat + latOffset, sw.lng + lngOffset],
                        [ne.lat + latOffset, ne.lng + lngOffset]
                    );

                    // Update the actual drawn layer
                    if (activeScreenshotLayer instanceof L.Rectangle) {
                        activeScreenshotLayer.setBounds(newBounds);
                    } else if (activeScreenshotLayer instanceof L.Polygon) {
                        const latlngs = activeScreenshotLayer.getLatLngs()[0];
                        const newLatLngs = latlngs.map(latlng =>
                            L.latLng(latlng.lat + latOffset, latlng.lng + lngOffset)
                        );
                        activeScreenshotLayer.setLatLngs([newLatLngs]);
                    }

                    // Update bounds outline without triggering bounds-set event
                    bounds.setLatLngs(bounds._boundsToLatLngs(newBounds));
                    activeBounds = newBounds;
                });

                // Finalize when drag ends
                centerMarker.on('dragend', function (e) {
                    isDraggingMarker = false;

                    if (!activeScreenshotLayer) {
                        showToast('No bounding box to move', 'error', 2000);
                        centerMarker.setLatLng(bounds.getBounds().getCenter());
                        return;
                    }

                    const newBounds = activeScreenshotLayer.getBounds();

                    // Update coordinate displays
                    $('#boxbounds').text(formatBounds(newBounds, '4326'));
                    $('#boxboundsmerc').text(formatBounds(newBounds, currentproj));
                    updateBboxInfo(newBounds);

                    // Update URL hash
                    const sw = newBounds.getSouthWest();
                    const ne = newBounds.getNorthEast();
                    location.hash = `${sw.lat.toFixed(6)},${sw.lng.toFixed(6)},${ne.lat.toFixed(6)},${ne.lng.toFixed(6)}`;

                    // Save to recent
                    saveRecentBbox(newBounds);

                    showToast('Bounding box moved', 'success', 2000);
                });
            }
        } else if (centerMarker) {
            map.removeLayer(centerMarker);
            centerMarker = null;
        }
    }

    // Update center marker when bounds change
    bounds.on('bounds-set', function () {
        updateCenterMarker();
    });

    // Remove center marker when bbox is deleted
    map.on('draw:deleted', function () {
        if (centerMarker) {
            map.removeLayer(centerMarker);
            centerMarker = null;
        }
    });
});

function updateBboxInfo(bounds) {
    if (!bounds) {
        $('#area-value').text('-');
        $('#dimensions-value').text('-');
        return;
    }

    // Update H3 Grid if enabled
    if (typeof updateH3Grid === 'function') {
        try {
            updateH3Grid();
        } catch (e) {
            console.error('H3 Grid update failed:', e);
        }
    }

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    // Calculate distance/area using Leaflet
    const southWest = L.latLng(sw.lat, sw.lng);
    const northEast = L.latLng(ne.lat, ne.lng);
    const northWest = L.latLng(ne.lat, sw.lng);

    // Distance in meters
    const width = southWest.distanceTo(L.latLng(sw.lat, ne.lng));
    const height = southWest.distanceTo(northWest);

    const widthKm = (width / 1000).toFixed(2);
    const heightKm = (height / 1000).toFixed(2);

    $('#dimensions-value').text(`${widthKm} km x ${heightKm} km`);

    // Approximate area (treat as rectangle for simple display)
    const areaSqKm = (widthKm * heightKm).toFixed(2);
    $('#area-value').text(`${areaSqKm} km²`);
}

function initH3Features() {
    // 1. Sidebar Toggle
    $('#h3-tools button').on('click', function () {
        const sidebar = $('#h3-sidebar');
        const isActive = $(this).hasClass('active');

        // Close other sidebars
        $('.sidebar-content').parent().hide();
        $('.simple-sidebar').hide();
        $('#map-ui button').removeClass('active');

        if (!isActive) {
            sidebar.show();
            $(this).addClass('active');
            updateH3Grid();

            // Discovery: Remove badge on first click
            localStorage.setItem('h3_badge_seen', 'true');
            $('#h3-new-badge').fadeOut();
        } else {
            clearH3Grid();
        }
    });

    // 2. Controls
    $('#h3-resolution').on('input change', function () {
        $('#h3-res-val').text($(this).val());
        updateH3Grid();
    });

    $('#h3-compact').on('change', function () {
        updateH3Grid();
    });

    // 3. Copy Button
    $('#copy-h3-indices').on('click', function () {
        if (!currentH3Cells || currentH3Cells.length === 0) {
            showToast('No hexagons to copy', 'error');
            return;
        }

        const content = JSON.stringify(currentH3Cells);
        navigator.clipboard.writeText(content).then(() => {
            showToast(`Copied ${currentH3Cells.length} H3 indices!`, 'success');
        }).catch(() => {
            showToast('Failed to copy', 'error');
        });
    });


    function clearH3Grid() {
        if (h3Layer && map) {
            map.removeLayer(h3Layer);
            h3Layer = null;
        }
        currentH3Cells = [];
        $('#h3-count').text('-');
    }

    function updateH3Grid() {
        // Only update if sidebar is open
        if (!$('#h3-sidebar').is(':visible')) return;

        // Check if bounds exist. 
        // We use activeBounds which is the global LatLngBounds object for the current box.
        if (!activeBounds || !activeBounds.isValid()) {
            $('#h3-count').text('Draw a box first');
            return;
        }

        // Get current bounds from the global activeBounds
        const leafBounds = activeBounds;

        const resolution = parseInt($('#h3-resolution').val());
        const isCompact = $('#h3-compact').is(':checked');

        const sw = leafBounds.getSouthWest();
        const ne = leafBounds.getNorthEast();

        // H3 v4 polygon definition: [lat, lng] loops
        const polygon = [
            [sw.lat, sw.lng],
            [ne.lat, sw.lng], // NW
            [ne.lat, ne.lng], // NE
            [sw.lat, ne.lng], // SE
            [sw.lat, sw.lng]  // Close loop
        ];

        try {
            // 0. Safety Check: Estimate cell count before computing
            // OOM Protection: polygonToCells crashes browser if > 5-10M cells are attempted.
            // We use a hard limit for *computation* attempt.
            const COMPUTATION_LIMIT = 100000;

            const avgHexArea = h3.getHexagonAreaAvg(resolution, h3.UNITS.km2);

            // Calculate Box Area in km^2
            const southWest = L.latLng(sw.lat, sw.lng);
            const northWest = L.latLng(ne.lat, sw.lng);
            // Width at center latitude for better approximation
            const centerLat = (sw.lat + ne.lat) / 2;
            const centerWest = L.latLng(centerLat, sw.lng);
            const centerEast = L.latLng(centerLat, ne.lng);

            const widthKm = centerWest.distanceTo(centerEast) / 1000;
            const heightKm = southWest.distanceTo(northWest) / 1000;
            const areaKm2 = widthKm * heightKm;

            const estimatedCount = areaKm2 / avgHexArea;

            if (estimatedCount > COMPUTATION_LIMIT) {
                $('#h3-count').text('~' + Math.floor(estimatedCount).toLocaleString() + ' (Too large)'); // Est.
                showToast(`Area too large for Res ${resolution} (Est. ${Math.floor(estimatedCount).toLocaleString()} cells). Zoom in.`, 'error');
                clearH3Grid();
                return;
            }

            let cells = h3.polygonToCells(polygon, resolution);

            if (isCompact) {
                cells = h3.compactCells(cells);
            }

            const count = cells.length;
            $('#h3-count').text(count.toLocaleString());

            if (count > MAX_H3_RENDER_CELLS) {
                showToast(`Too many cells (${count}) to render. Previous grid still visible. Cells available for copy.`, 'info', 3000);
                currentH3Cells = cells;
                updateH3Code(resolution, leafBounds.getCenter());
                return;
            }

            if (h3Layer) map.removeLayer(h3Layer);

            const geoJsonFeatures = cells.map(cell => {
                const boundary = h3.cellToBoundary(cell);
                return {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [boundary.map(p => [p[1], p[0]])] // Flip to [lng, lat]
                    },
                    "properties": { "id": cell }
                };
            });

            h3Layer = L.geoJSON({
                "type": "FeatureCollection",
                "features": geoJsonFeatures
            }, {
                style: {
                    color: '#ff4757',
                    weight: 1,
                    opacity: 0.6,
                    fillOpacity: 0.2
                },
                onEachFeature: function (feature, layer) {
                    layer.bindTooltip(feature.properties.id, { sticky: true });
                }
            }).addTo(map);

            currentH3Cells = cells;
            updateH3Code(resolution, leafBounds.getCenter());

        } catch (err) {
            console.error("H3 Error:", err);
        }
    }

    function updateH3Code(res, center) {
        const lat = center.lat.toFixed(4);
        const lng = center.lng.toFixed(4);
        const code = `import h3\n\n# Center point at Resolution ${res}\ncenter = h3.latlng_to_cell(${lat}, ${lng}, ${res})\n\n# Get neighbors\nring = h3.grid_disk(center, 1)\n`;
        $('#h3-code-output').val(code);
    }

    // 4. Feature Discovery
    checkH3Discovery();
}

function checkH3Discovery() {
    // 1. Badge logic
    const seen = localStorage.getItem('h3_badge_seen');
    if (seen) {
        $('#h3-new-badge').hide();
    }

    // 2. Toast logic
    const toastSeen = localStorage.getItem('h3_toast_shown');
    if (!toastSeen) {
        setTimeout(() => {
            showToast("New: Uber H3 Hexagon Tools available!", 'info', 5000);
            localStorage.setItem('h3_toast_shown', 'true');
        }, 3000);
    }
}