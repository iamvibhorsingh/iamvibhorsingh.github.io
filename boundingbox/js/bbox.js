/*
**
** bboxfinder.com
** js/bbox.js
**
** Updated to remove Flash dependency (ZeroClipboard) and modernize JavaScript (ES6+).
**
*/

let map, rsidebar, lsidebar, drawControl, drawnItems = null;
let bounds = null; // Global bounds variable for the visual black box
let activeScreenshotLayer = null; // The specific layer to be used for the screenshot
let activeBounds = null; // To store the bounds for PNG download

// Where we keep the big list of proj defs from the server
let proj4defs = null;
// Where we keep the proj objects we are using in this session
const projdefs = { "4326": L.CRS.EPSG4326, "3857": L.CRS.EPSG3857 };
let currentproj = "3857";
const currentmouse = L.latLng(0, 0);

// Recent bboxes storage
const MAX_RECENT_BBOXES = 10;

// Coordinate precision (default 6 decimal places)
let coordinatePrecision = 6;

/*
**
** override L.Rectangle
** to fire an event after setting
**
** the base parent object L.Path
** includes the L.Mixin.Events
**
** ensures bbox box is always
** the topmost SVG feature
**
*/
L.Rectangle.prototype.setBounds = function (latLngBounds) {
    this.setLatLngs(this._boundsToLatLngs(latLngBounds));
    this.fire('bounds-set');
}


const FormatSniffer = (function () {  // execute immediately

    'use strict';

    /*
    **
    ** constructor
    **
    */
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

    /*
    **
    ** functions
    **
    */
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
                /*
                ** sorry, this block needs to be left aligned
                ** to make the alert more readable
                ** which means, we probably shouldn't use alerts ;-)
                */
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
            // Replaced alert with console.error for a non-blocking user experience.
            console.error("Your paste is not parsable:\n" + err.message);
            fail = true;

        }

        // delegate to format handler
        if (!fail) {

            this._formatHandler[this.parse_type].call(this._formatHandler, parsed_data);

        }

        return (fail ? false : true);
    };


    /*
    ** an object with functions as property names.
    ** if we need to add another format
    ** we can do so here as a property name
    ** to enforce reusability
    **
    ** to add different formats as L.FeatureGroup layer
    ** so they work with L.Draw edit and delete options
    ** we fake passing event information
    ** and triggering draw:created for L.Draw
    */
    FormatSniffer.prototype._formatHandler = {


        // coerce event objects to work with L.Draw types
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
            /*
            ** data comes in an extent ( xMin,yMin,xMax,yMax )
            ** we need to swap lat/lng positions
            ** because leaflet likes it hard
            */
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

                // call L.Draw.Feature.prototype._fireCreatedEvent
                map.fire('draw:created', evt);
            }

        },

        geojson: function (geojson_layer) {

            const all_layers = this.reduce_layers(geojson_layer);
            for (let indx = 0; indx < all_layers.length; indx++) {
                const lyr = all_layers[indx];

                const geom_type = geojson_layer.getLayers()[0].feature.geometry.type;
                const evt = this.coerce(lyr, geom_type);

                // call L.Draw.Feature.prototype._fireCreatedEvent
                map.fire('draw:created', evt);
            }
        },

        ogrinfo: function (data) {
            const lBounds = this.get_leaflet_bounds(data);
            // create a rectangle layer
            const lyr = new L.Rectangle(lBounds);
            const evt = this.coerce(lyr, 'polygon');

            // call L.Draw.Feature.prototype._fireCreatedEvent
            map.fire('draw:created', evt);
        },

        bbox: function (data) {
            const lBounds = this.get_leaflet_bounds(data);
            // create a rectangle layer
            const lyr = new L.Rectangle(lBounds);
            const evt = this.coerce(lyr, 'polygon');

            // call L.Draw.Feature.prototype._fireCreatedEvent
            map.fire('draw:created', evt);
        }


    };

    return FormatSniffer; // return class def

})(); // end FormatSniffer


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
            // For custom callback functions (like satellite toggle)
            callback();
            this.className = this.className === 'enabled' ? '' : 'enabled';
        } else if (layer) {
            // For regular layer toggle
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
};

function formatBounds(bounds, proj) {
    // Use default values if form elements are not initialized yet
    const gdal = $("input[name='gdal-checkbox']").prop('checked') || false;
    const lngLatOrder = $("input[name='coord-order']:checked").val() === 'lng-lat';
    const precision = coordinatePrecision;

    let formattedBounds = '';
    let southwest = bounds.getSouthWest();
    let northeast = bounds.getNorthEast();

    let xmin = 0;
    let ymin = 0;
    let xmax = 0;
    let ymax = 0;

    if (proj == '4326') {
        xmin = southwest.lng.toFixed(precision);
        ymin = southwest.lat.toFixed(precision);
        xmax = northeast.lng.toFixed(precision);
        ymax = northeast.lat.toFixed(precision);
    } else {
        try {
            let proj_to_use = null;
            if (typeof (projdefs[proj]) !== 'undefined') {
                proj_to_use = projdefs[proj];
            } else if (proj4defs && proj4defs[proj]) {
                projdefs[proj] = new L.Proj.CRS(proj, proj4defs[proj][1]);
                proj_to_use = projdefs[proj];
            } else {
                // Fallback to 4326 if projection not available
                xmin = southwest.lng.toFixed(6);
                ymin = southwest.lat.toFixed(6);
                xmax = northeast.lng.toFixed(6);
                ymax = northeast.lat.toFixed(6);
            }

            if (proj_to_use) {
                southwest = proj_to_use.project(southwest);
                northeast = proj_to_use.project(northeast);
                xmin = southwest.x.toFixed(precision);
                ymin = southwest.y.toFixed(precision);
                xmax = northeast.x.toFixed(precision);
                ymax = northeast.y.toFixed(precision);
            }
        } catch (error) {
            console.warn('Projection error, falling back to 4326:', error);
            // Fallback to 4326
            xmin = southwest.lng.toFixed(precision);
            ymin = southwest.lat.toFixed(precision);
            xmax = northeast.lng.toFixed(precision);
            ymax = northeast.lat.toFixed(precision);
        }
    }

    if (gdal) {
        if (lngLatOrder) {
            formattedBounds = xmin + ',' + ymin + ',' + xmax + ',' + ymax; // lng,lat,lng,lat
        } else {
            formattedBounds = ymin + ',' + xmin + ',' + ymax + ',' + xmax; // lat,lng,lat,lng
        }
    } else {
        if (lngLatOrder) {
            formattedBounds = xmin + ' ' + ymin + ' ' + xmax + ' ' + ymax; // lng lat lng lat
        } else {
            formattedBounds = ymin + ' ' + xmin + ' ' + ymax + ' ' + xmax; // lat lng lat lng
        }
    }

    return formattedBounds;
}

function formatTile(point, zoom) {
    const xTile = Math.floor((point.lng + 180) / 360 * Math.pow(2, zoom));
    const yTile = Math.floor((1 - Math.log(Math.tan(point.lat * Math.PI / 180) + 1 / Math.cos(point.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return xTile.toString() + ',' + yTile.toString();
}

function formatPoint(point, proj) {
    // Use default values if form elements are not initialized yet
    const gdal = $("input[name='gdal-checkbox']").prop('checked') || false;
    const lngLatOrder = $("input[name='coord-order']:checked").val() === 'lng-lat';
    const precision = coordinatePrecision;

    let formattedPoint = '';
    let x, y;

    if (proj == '4326') {
        x = point.lng.toFixed(precision);
        y = point.lat.toFixed(precision);
    } else {
        try {
            let proj_to_use = null;
            if (typeof (projdefs[proj]) !== 'undefined') {
                proj_to_use = projdefs[proj];
            } else if (proj4defs && proj4defs[proj]) {
                projdefs[proj] = new L.Proj.CRS(proj, proj4defs[proj][1]);
                proj_to_use = projdefs[proj];
            } else {
                // Fallback to 4326 if projection not available
                x = point.lng.toFixed(6);
                y = point.lat.toFixed(6);
            }

            if (proj_to_use) {
                point = proj_to_use.project(point);
                x = point.x.toFixed(precision);
                y = point.y.toFixed(precision);
            }
        } catch (error) {
            console.warn('Projection error, falling back to 4326:', error);
            // Fallback to 4326
            x = point.lng.toFixed(precision);
            y = point.lat.toFixed(precision);
        }
    }

    if (gdal) {
        if (lngLatOrder) {
            formattedPoint = x + ',' + y; // lng,lat
        } else {
            formattedPoint = y + ',' + x; // lat,lng
        }
    } else {
        if (lngLatOrder) {
            formattedPoint = x + ' ' + y; // lng lat
        } else {
            formattedPoint = y + ' ' + x; // lat lng
        }
    }
    return formattedPoint;
}

function validateStringAsBounds(bounds) {
    const splitBounds = bounds ? bounds.split(',') : null;
    return ((splitBounds !== null) &&
        (splitBounds.length == 4) &&
        ((-90.0 <= parseFloat(splitBounds[0]) <= 90.0) &&
            (-180.0 <= parseFloat(splitBounds[1]) <= 180.0) &&
            (-90.0 <= parseFloat(splitBounds[2]) <= 90.0) &&
            (-180.0 <= parseFloat(splitBounds[3]) <= 180.0)) &&
        (parseFloat(splitBounds[0]) < parseFloat(splitBounds[2]) &&
            parseFloat(splitBounds[1]) < parseFloat(splitBounds[3])))
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

// Calculate area of bounding box in km²
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

// Format area for display
function formatArea(areaKm2) {
    if (areaKm2 < 1) {
        return (areaKm2 * 1000000).toFixed(0) + ' m²';
    } else if (areaKm2 < 10000) {
        return areaKm2.toFixed(2) + ' km²';
    } else {
        return areaKm2.toFixed(0) + ' km²';
    }
}

// Calculate bbox dimensions
function calculateBboxDimensions(bounds) {
    if (!bounds || !bounds.isValid()) return { width: 0, height: 0 };

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const width = Math.abs(ne.lng - sw.lng);
    const height = Math.abs(ne.lat - sw.lat);

    return { width, height };
}

// Show toast notification
function showToast(message, type = 'info', duration = 3000) {
    const toast = $('#toast-notification');
    toast.removeClass('success error info').addClass(type);
    toast.text(message);
    toast.fadeIn(300);

    setTimeout(() => {
        toast.fadeOut(300);
    }, duration);
}

// Show loading overlay
function showLoading(text = 'Loading...') {
    $('#loading-overlay .loading-text').text(text);
    $('#loading-overlay').fadeIn(200);
}

// Hide loading overlay
function hideLoading() {
    $('#loading-overlay').fadeOut(200);
}

// Recent bboxes management
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

// Generate shareable URL
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

// Load bbox from URL hash
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

// Update bbox info display
function updateBboxInfo(bounds) {
    if (!bounds || !bounds.isValid()) {
        $('#area-value').text('-');
        $('#dimensions-value').text('-');
        return;
    }

    const area = calculateBboxArea(bounds);
    $('#area-value').text(formatArea(area));

    const dims = calculateBboxDimensions(bounds);
    $('#dimensions-value').text(`${dims.width.toFixed(4)}° × ${dims.height.toFixed(4)}°`);
}

// Update projection info
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
        $('#proj-description').text('');
    }
}

$(function () { // Modern equivalent of $(document).ready
    console.log('BBox Finder: Starting initialization...');

    /*
    **
    ** make sure all textarea inputs
    ** are selected once they are clicked
    **
    */
    $('input[type="textarea"]').on('click', function () { this.select() });

    // Have to init the projection input box as it is used to format the initial values
    $("#projection").val(currentproj);

    // The L.mapbox.accessToken is no longer needed in this format.
    // We will put the token in the tile layer URL.

    // Initialize the map using standard Leaflet
    console.log('BBox Finder: Initializing map...');
    map = L.map('map').setView([0, 0], 3);

    // Add the tile layer using a modern Mapbox style URL and your token
    const streetLayer = L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token={accessToken}', {
        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: 'pk.eyJ1IjoidmliaG9yc2luZ2giLCJhIjoiY21id3lxM2R3MTcybzJpcHdhanU1dTB5dCJ9.vBNwuEDJXfsxT-lfLNCbWA'
    });

    // Add satellite layer
    const satelliteLayer = L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token={accessToken}', {
        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
        id: 'mapbox/satellite-v9',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: 'pk.eyJ1IjoidmliaG9yc2luZ2giLCJhIjoiY21id3lxM2R3MTcybzJpcHdhanU1dTB5dCJ9.vBNwuEDJXfsxT-lfLNCbWA'
    });

    // Start with street view
    streetLayer.addTo(map);
    let currentLayer = 'street';

    console.log('BBox Finder: Map and tile layer added');

    // Add help content to left sidebar
    $('#lsidebar textarea').val(`BBox Finder - Quick Start Guide

TOOLBAR BUTTONS (Top Right):
✏️  Enter Coordinates - Paste GeoJSON, WKT, or bbox coordinates
📍 My Location - GPS positioning with IP fallback
📋 Recent Bboxes - Access your last 10 bounding boxes
🗑️  Clear All - Remove all drawn features
🔗 Share URL - Copy shareable link with current bbox
💬 Feedback - Send us your thoughts or report issues
❓ Help - This guide

DRAWING TOOLS (Left Side):
Use the drawing controls to create:
• Rectangle - Draw rectangular bounding boxes
• Circle - Draw circular areas
• Polygon - Draw custom polygons
• Polyline - Draw lines
• Marker - Place point markers
• Edit/Delete - Modify or remove features

NEW FEATURES:
📏 Precision Control - Adjust decimal places (1-12) for coordinates
📐 Area Calculation - See bbox area in m² or km² automatically
📊 Dimensions - View width × height in degrees
🔗 URL Sharing - Share bboxes via URL (auto-loads on page load)
💾 Recent History - Last 10 bboxes saved automatically
ℹ️  Projection Info - Learn about each coordinate system

COORDINATE FORMATS (Bottom Panel):
• Lng,Lat ↔ Lat,Lng: Change coordinate order
• GDAL format: Use comma separators instead of spaces
• Precision: Control decimal places (default: 6)
• Copy buttons: Click 📋 next to any coordinate to copy

PROJECTIONS (Top Left):
• Type EPSG codes (3857, 4326, 27700, etc.) and press Enter
• Autocomplete available - type 3+ characters
• See projection description in "Bounding Box Info" section
• Common: 3857 (Web Mercator), 4326 (WGS84), 27700 (British Grid)

EXPORT FORMATS:
• Copy WKT - Well-Known Text format
• Copy GeoJSON BBox - JSON array format
• Copy Leaflet Array - For Leaflet.js library
• Download PNG - Screenshot of map area (when bbox drawn)

PASTE DATA:
Click ✏️ "Enter Coordinates" to paste:
• GeoJSON features and geometries
• WKT (Well-Known Text) geometries
• Bounding box coordinates (xmin,ymin,xmax,ymax)
• ogrinfo extent output

TIPS:
• All bboxes are auto-saved to Recent History
• Use Share URL to collaborate with others
• Adjust precision for your use case (2 for rough, 8 for precise)
• Projection descriptions help choose the right system
• Recent bboxes persist in browser storage

SUPPORT:
For help, bug reports, or feature requests:
• Click 💬 Feedback button
• Email: contact@vibhorsingh.com
`)

    // Force the map to redraw itself after the page has loaded.
    setTimeout(function () {
        map.invalidateSize();
    }, 100);

    // --- Add Geosearch control after map initialization ---
    // Wait longer to ensure all libraries are fully loaded
    setTimeout(function () {
        console.log('BBox Finder: Attempting to initialize GeoSearch...');

        // Check if we should skip GeoSearch (can be controlled via URL parameter)
        const urlParams = new URLSearchParams(window.location.search);
        const skipSearch = urlParams.get('nosearch') === 'true';

        if (skipSearch) {
            console.log('GeoSearch disabled via URL parameter (?nosearch=true)');
            return;
        }

        // First, let's see what's actually available
        console.log('Available objects:', {
            GeoSearch: typeof GeoSearch,
            windowGeoSearch: typeof window.GeoSearch,
            leafletVersion: L.version
        });

        try {
            // Check if map is properly initialized first
            if (!map || !map.getContainer()) {
                console.warn('Map not properly initialized, skipping GeoSearch');
                return;
            }

            // Simple initialization test first
            if (typeof GeoSearch === 'undefined') {
                throw new Error('GeoSearch library not loaded');
            }

            // Try the most basic initialization possible
            console.log('Trying basic GeoSearch initialization...');
            const provider = new GeoSearch.OpenStreetMapProvider();
            const searchControl = new GeoSearch.GeoSearchControl({
                provider: provider
            });

            // Test if the control is valid before adding
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

                    // Move map to location
                    map.setView([lat, lon], 15);

                    // Add a temporary marker
                    const marker = L.marker([lat, lon]).addTo(map);
                    marker.bindPopup(`<b>${result.display_name}</b>`).openPopup();

                    // Remove marker after 10 seconds
                    setTimeout(() => {
                        map.removeLayer(marker);
                    }, 10000);

                    // Clear search input
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

    // Setup manual search
    setupManualSearch();

    // Add in a crosshair for the map
    const crosshairIcon = L.icon({
        iconUrl: 'images/crosshair.png',
        iconSize: [20, 20], // size of the icon
        iconAnchor: [10, 10], // point of the icon which will correspond to marker's location
    });
    let crosshair = new L.marker(map.getCenter(), { icon: crosshairIcon, clickable: false });
    crosshair.addTo(map);

    // Initialize the FeatureGroup to store editable layers
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Initialize the draw control and pass it the FeatureGroup of editable layers
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

    /*
    **
    ** create bounds layer
    ** and default it at first
    ** to draw on null island
    ** so it's not seen onload
    **
    */
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
        // Set the hash
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

                // Update bbox info
                updateBboxInfo(screenshotBounds);

                // Save to recent bboxes
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

            // Update bbox info
            updateBboxInfo(screenshotBounds);

            // Save to recent bboxes
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

        // Only set "No bounding box drawn" if there are no drawn items
        // This prevents overriding existing bounding box coordinates
        if (drawnItems.getLayers().length === 0) {
            $('#boxbounds').text('No bounding box drawn');
            $('#boxboundsmerc').text('No bounding box drawn');
        }
        // If there are drawn items, leave the existing coordinates alone

        $('#mousepos').text(formatPoint(map.getCenter(), '4326')); // Start with center
        $('#mouseposmerc').text(formatPoint(map.getCenter(), currentproj));
    }

    // Call display after a short delay to ensure map is fully initialized
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

        // Update map and center coordinates but preserve bounding box coordinates
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

        // Update other coordinates but preserve bounding box if it exists
        $('#center').text(formatPoint(map.getCenter(), '4326'));
        $('#centermerc').text(formatPoint(map.getCenter(), currentproj));

        // Only reset bounding box if no items are drawn
        if (drawnItems.getLayers().length === 0) {
            $('#boxbounds').text('No bounding box drawn');
            $('#boxboundsmerc').text('No bounding box drawn');
        }
    });

    // --- START: Modern Clipboard API Implementation ---
    // Replaces the old ZeroClipboard (Flash-based) implementation.

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

    // CORRECTED SELECTOR on the line below
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
    // --- END: Modern Clipboard API Implementation ---

    // --- Handlers for new output format buttons ---
    $('#copy-wkt').on('click', function () {
        const output = getFormattedBox('wkt');
        navigator.clipboard.writeText(output).then(() => alert('WKT copied!'));
    });

    $('#copy-geojson-bbox').on('click', function () {
        const output = getFormattedBox('geojson-bbox');
        navigator.clipboard.writeText(output).then(() => alert('GeoJSON BBox copied!'));
    });

    $('#copy-leaflet-array').on('click', function () {
        const output = getFormattedBox('leaflet');
        navigator.clipboard.writeText(output).then(() => alert('Leaflet array copied!'));
    });

    $('#download-png').on('click', function () {
        if (!activeBounds) {
            alert("Please draw or select a bounding box first.");
            return;
        }

        // Temporarily hide map controls for a cleaner screenshot
        $('.leaflet-control-container, #map-ui, #map-ui-proj').hide();

        html2canvas(document.getElementById('map'), {
            useCORS: true, // Important for map tiles from other domains
            logging: false
        }).then(function (canvas) {
            // Show controls again
            $('.leaflet-control-container, #map-ui, #map-ui-proj').show();

            try {
                // Get the pixel coordinates of the bounding box
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
                    nw.x, nw.y, // Start clipping from top-left of bounds
                    cropWidth, cropHeight, // Dimensions of clipped area
                    0, 0, // Place the clipped area at top-left of new canvas
                    cropWidth, cropHeight // Dimensions of drawn area
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

    // handle create-geojson click events
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
                // If permission is granted or prompt, proceed with geolocation
                attemptGeolocation();
            }).catch(function () {
                // If permissions API not available, just try geolocation
                attemptGeolocation();
            });
        } else {
            // If permissions API not available, just try geolocation
            attemptGeolocation();
        }

        function attemptGeolocation() {
            console.log('Attempting geolocation...');

            // Use Leaflet's built-in locate method with enhanced options
            map.locate({
                setView: true,
                maxZoom: 16,
                timeout: 15000, // Increased timeout
                maximumAge: 300000, // Accept cached position up to 5 minutes old
                enableHighAccuracy: false // Start with low accuracy for faster response
            });

            // Remove active class after timeout
            setTimeout(function () {
                $('#geolocation button').removeClass('active');
            }, 15000);
        }
    });

    // Add geolocation event handlers
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
            case 1: // PERMISSION_DENIED
                errorMessage += 'Location access was denied. Please enable location permissions in your browser settings.';
                $('#geolocation button').removeClass('active');
                alert(errorMessage);
                break;
            case 2: // POSITION_UNAVAILABLE
                errorMessage += 'GPS signal unavailable. Trying approximate location...';
                // Try IP-based geolocation as fallback
                tryIPGeolocation();
                break;
            case 3: // TIMEOUT
                errorMessage += 'GPS request timed out. Trying approximate location...';
                // Try IP-based geolocation as fallback
                tryIPGeolocation();
                break;
            default:
                errorMessage += 'An unknown error occurred. Trying approximate location...';
                // Try IP-based geolocation as fallback
                tryIPGeolocation();
        }
    });

    // toggle #info-box
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

    // Add in a layer to overlay the tile bounds of the google grid
    const tiles = new L.tileLayer('images/tile.png', {});
    addLayer(tiles, '🔲', "Google tile boundaries", 10, false);

    // Add satellite view toggle
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

    // Modernized data loading with fetch
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
                    return; // Only process Enter key for keypress events
                }

                const inputValue = $(this).val().trim();
                if (inputValue && inputValue !== currentproj) {
                    console.log('Attempting to change projection to:', inputValue);

                    // Check if it's a known projection
                    if (proj4defs && proj4defs[inputValue]) {
                        console.log('Found projection in database:', proj4defs[inputValue][0]);
                        $('#projlabel').text(`EPSG:${inputValue} - ${proj4defs[inputValue][0]}`);
                        currentproj = inputValue;

                        // Update all coordinate displays
                        $('#boxboundsmerc').text(formatBounds(bounds.getBounds(), currentproj));
                        $('#mouseposmerc').text(formatPoint(currentmouse, currentproj));
                        $('#mapboundsmerc').text(formatBounds(map.getBounds(), currentproj));
                        $('#centermerc').text(formatPoint(map.getCenter(), currentproj));

                        // Update bounding box coordinates if they exist
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
                        // Unknown projection - show warning but still try to use it
                        console.warn('Unknown projection:', inputValue);
                        $('#projlabel').text(`EPSG:${inputValue} - Unknown projection`);
                        currentproj = inputValue;

                        // Try to update coordinates anyway (might work with proj4js)
                        try {
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
                        } catch (error) {
                            console.error('Failed to apply unknown projection:', error);
                            alert(`EPSG:${inputValue} is not supported. Please use a supported projection code like 3857, 4326, or 27700.`);
                            // Revert to previous projection
                            $(this).val(currentproj);
                        }
                    }
                }
            });

            // Set labels for output... left always 4326, right is proj selection
            $('#wgslabel').text('EPSG:4326 - ' + proj4defs['4326'][0]);
            $('#projlabel').text('EPSG:3857 - ' + proj4defs['3857'][0]);

            // Set initial projection info
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

    // URL hash loading is now handled after proj4defs loads
    // See the fetch promise handler above

    // Re-render display on any format change to update all coordinates
    $("#coord-format").on('change', function () {
        console.log('Coordinate format changed');

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
    });

    // handle feedback button click events
    $('#feedback button').click(function(){
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
    $('#feedback-form').on('submit', function(e){
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
    $('#cancel-feedback').on('click', function(){
        $('#feedback-form')[0].reset();
        $('#feedback button').click();
    });
});