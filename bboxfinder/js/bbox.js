/*
**
** bboxfinder.com
** js/bbox.js
**
** Updated to remove Flash dependency (ZeroClipboard) and modernize JavaScript (ES6+).
**
*/

let map, rsidebar, lsidebar, drawControl, drawnItems = null;

// Where we keep the big list of proj defs from the server
let proj4defs = null;
// Where we keep the proj objects we are using in this session
const projdefs = {"4326":L.CRS.EPSG4326, "3857":L.CRS.EPSG3857};
let currentproj = "3857";
const currentmouse = L.latLng(0,0);

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
    this.fire( 'bounds-set' );
}


const FormatSniffer = (function () {  // execute immediately

    'use strict';

    /*
    **
    ** constructor
    **
    */
    const FormatSniffer = function( options ) {

        options || ( options = {} );

        if( !this || !( this instanceof FormatSniffer ) ){
            return new FormatSniffer(options);
        }


        this.regExes = {
            ogrinfoExtent : /Extent\:\s\((.*)\)/ ,
            bbox :  /^\(([\s|\-|0-9]*\.[0-9]*,[\s|\-|0-9]*\.[0-9]*,[\s|\-|0-9]*\.[0-9]*,[\s|\-|0-9]*\.[0-9|\s]*)\)$/
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

    FormatSniffer.prototype._is_ogrinfo = function() {
        const match = this.regExes.ogrinfoExtent.exec( this.data.trim() );
        let extent = [];
        if( match ) {
            const pairs = match[1].split( ") - (" );
            for( let indx = 0; indx < pairs.length; indx ++ ){
                const coords = pairs[ indx ].trim().split(",");
                extent = ( extent.concat(  [ parseFloat(coords[0].trim()), parseFloat(coords[1].trim()) ] ) );
            }
        }
        this.parse_type = "ogrinfo";
        return extent;
    };

    FormatSniffer.prototype._is_normal_bbox = function() {
        const match = this.regExes.bbox.exec( this.data.trim() );
        let extent = [];
        if( match ) {
            const bbox = match[1].split( "," );
            for( let indx = 0; indx < bbox.length; indx ++ ){
                const coord = bbox[ indx ].trim();
                extent = ( extent.concat(  [ parseFloat(coord) ] ) );
            }
        }
        this.parse_type = "bbox";
        return extent;
    };

    FormatSniffer.prototype._is_geojson = function() {
        try {
            // try JSON
            const json = JSON.parse( this.data );

            // try GeoJSON
            const parsed_data = new L.geoJson( json )

        } catch ( err ) {

            return null;

        }

        this.parse_type = "geojson";
        return parsed_data;
    };

    FormatSniffer.prototype._is_wkt = function() {
        if( this.data === "" ){
            throw new Error( "empty -- nothing to parse" );
        }

        try {
            var parsed_data = new Wkt.Wkt( this.data );
        } catch ( err ) {
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
            if ( parsed_data.length > 0 ){
               next = false;
            }

            // try normal bbox
            if ( next ) {
                parsed_data = this._is_normal_bbox();
                if ( parsed_data.length > 0 ) next = false;
            }

            // try GeoJSON
            if ( next ) {
                parsed_data = this._is_geojson();
                if ( parsed_data )  next = false;
            }

            // try WKT
            if ( next ) {
                parsed_data = this._is_wkt();
                if ( parsed_data ) next = false;
            }

            // no matches, throw error
            if ( next ) {
                fail = true;
/*
** sorry, this block needs to be left aligned
** to make the alert more readable
** which means, we probably shouldn't use alerts ;-)
*/
throw {
"name" :  "NoTypeMatchError" ,
"message" : "The data is not a recognized format:\n \
1. ogrinfo extent output\n \
2. bbox as (xMin,yMin,xMax,yMax )\n \
3. GeoJSON\n \
4. WKT\n\n "
}
            }


        } catch(err) {
            // Replaced alert with console.error for a non-blocking user experience.
            console.error( "Your paste is not parsable:\n"  + err.message  );
            fail = true;

        }

        // delegate to format handler
        if ( !fail ){

            this._formatHandler[ this.parse_type ].call( this._formatHandler, parsed_data );

        }

        return ( fail ? false : true );
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
            coerce : function ( lyr, type_obj ) {

                    const event_obj = {
                        layer : lyr,
                        layerType : null,
                    }

                    // coerce to L.Draw types
                    if ( /point/i.test( type_obj ) ){
                        event_obj.layerType = "marker";
                    }
                    else if( /linestring/i.test( type_obj ) ){
                        event_obj.layerType = "polyline";
                    }
                    else if ( /polygon/i.test( type_obj ) ){
                        event_obj.layerType = "polygon";
                    }

                    return event_obj;

            } ,

	    reduce_layers : function( lyr ) {
		    let lyr_parts = [];
	     	    if (  typeof lyr[ 'getLayers' ] === 'undefined' ) {
			return [ lyr ];
		    }
		    else {
			const all_layers = lyr.getLayers();
			for( let i = 0; i < all_layers.length; i++ ){
			    lyr_parts = lyr_parts.concat( this.reduce_layers( all_layers[i] ) );
			}
		    }
		    return lyr_parts;
	    } ,

            get_leaflet_bounds : function( data ) {
                    /*
                    ** data comes in an extent ( xMin,yMin,xMax,yMax )
                    ** we need to swap lat/lng positions
                    ** because leaflet likes it hard
                    */
                    const sw = [ data[1], data[0] ];
                    const ne = [ data[3], data[2] ];
                    return new L.LatLngBounds( sw, ne );
            } ,

            wkt : function( data ) {

                    const wkt_layer = data.construct[data.type].call( data );
                    const all_layers = this.reduce_layers( wkt_layer );
                    for( let indx = 0; indx < all_layers.length; indx++ ) {
                        const lyr = all_layers[indx];
                    	const evt = this.coerce( lyr, data.type );

                        // call L.Draw.Feature.prototype._fireCreatedEvent
                        map.fire( 'draw:created', evt );
                    }

            } ,

            geojson : function( geojson_layer ) {

                    const all_layers = this.reduce_layers( geojson_layer );
                    for( let indx = 0; indx < all_layers.length; indx++ ) {
                        const lyr = all_layers[indx];

                        const geom_type = geojson_layer.getLayers()[0].feature.geometry.type;
                        const evt = this.coerce( lyr, geom_type );

                        // call L.Draw.Feature.prototype._fireCreatedEvent
                        map.fire( 'draw:created', evt );
                    }
            } ,

            ogrinfo : function( data ) {
                    const lBounds = this.get_leaflet_bounds( data );
                    // create a rectangle layer
                    const lyr = new L.Rectangle( lBounds );
                    const evt = this.coerce( lyr, 'polygon' );

                    // call L.Draw.Feature.prototype._fireCreatedEvent
                    map.fire( 'draw:created', evt );
            } ,

            bbox : function( data ) {
                    const lBounds = this.get_leaflet_bounds( data );
                    // create a rectangle layer
                    const lyr = new L.Rectangle( lBounds );
                    const evt = this.coerce( lyr, 'polygon' );

                    // call L.Draw.Feature.prototype._fireCreatedEvent
                    map.fire( 'draw:created', evt );
            }


    };

    return FormatSniffer; // return class def

})(); // end FormatSniffer


function addLayer(layer, name, title, zIndex, on) {
    if (on) {
        layer.setZIndex(zIndex).addTo(map);
    } else {
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
    link.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();

        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
            this.className = '';
        } else {
            map.addLayer(layer);
            this.className = 'enabled';
        }
    };
    item.appendChild(link);
    ui.appendChild(item);
};

function formatBounds(bounds, proj) {
    const gdal = $("input[name='gdal-checkbox']").prop('checked');
    const lngLat = $("input[name='coord-order']").prop('checked');

    let formattedBounds = '';
    let southwest = bounds.getSouthWest();
    let northeast = bounds.getNorthEast();
    let xmin = 0;
    let ymin = 0;
    let xmax = 0;
    let ymax = 0;
    if (proj == '4326') {
        xmin = southwest.lng.toFixed(6);
        ymin = southwest.lat.toFixed(6);
        xmax = northeast.lng.toFixed(6);
        ymax = northeast.lat.toFixed(6);
    } else {
        let proj_to_use = null;
        if (typeof(projdefs[proj]) !== 'undefined') {
            // we have it already, then grab it and use it...
            proj_to_use = projdefs[proj];
        } else {
            // We have not used this one yet... make it and store it...
            projdefs[proj] = new L.Proj.CRS(proj, proj4defs[proj][1]);
            proj_to_use = projdefs[proj];
        }
        southwest = proj_to_use.project(southwest)
        northeast = proj_to_use.project(northeast)
        xmin = southwest.x.toFixed(4);
        ymin = southwest.y.toFixed(4);
        xmax = northeast.x.toFixed(4);
        ymax = northeast.y.toFixed(4);
    }

    if (gdal) {
        if (lngLat) {
            formattedBounds = xmin+','+ymin+','+xmax+','+ymax;
        } else {
            formattedBounds = ymin+','+xmin+','+ymax+','+xmax;
        }
    } else {
        if (lngLat) {
            formattedBounds = xmin+' '+ymin+' '+xmax+' '+ymax;
        } else {
            formattedBounds = ymin+' '+xmin+' '+ymax+' '+xmax;
        }
    }
    return formattedBounds
}

function formatTile(point,zoom) {
    const xTile = Math.floor((point.lng+180)/360*Math.pow(2,zoom));
    const yTile = Math.floor((1-Math.log(Math.tan(point.lat*Math.PI/180) + 1/Math.cos(point.lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom));
    return xTile.toString() + ',' + yTile.toString();
}

function formatPoint(point, proj) {
    const gdal = $("input[name='gdal-checkbox']").prop('checked');
    const lngLat = $("input[name='coord-order']").prop('checked');

    let formattedPoint = '';
    let x, y; // Declare x and y here to make them available throughout the function

    if (proj == '4326') {
        x = point.lng.toFixed(6); // Assign value, don't declare
        y = point.lat.toFixed(6); // Assign value, don't declare
    } else {
        let proj_to_use = null;
        if (typeof(projdefs[proj]) !== 'undefined') {
            proj_to_use = projdefs[proj];
        } else {
            projdefs[proj] = new L.Proj.CRS(proj, proj4defs[proj][1]);
            proj_to_use = projdefs[proj];
        }
        point = proj_to_use.project(point);
        x = point.x.toFixed(4); // Assign value
        y = point.y.toFixed(4); // Assign value
    }

    // FIX: Changed "formattedBounds" to the correct variable "formattedPoint"
    if (gdal) {
        if (lngLat) {
            formattedPoint = x + ',' + y;
        } else {
            formattedPoint = y + ',' + x;
        }
    } else {
        if (lngLat) {
            formattedPoint = x + ' ' + y;
        } else {
            formattedPoint = y + ' ' + x;
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

$(function() { // Modern equivalent of $(document).ready
    /*
    **
    ** make sure all textarea inputs
    ** are selected once they are clicked
    **
    */
    $('input[type="textarea"]').on( 'click', function() { this.select() } );

    // Have to init the projection input box as it is used to format the initial values
    $( "#projection" ).val(currentproj);

    // The L.mapbox.accessToken is no longer needed in this format.
    // We will put the token in the tile layer URL.

    // Initialize the map using standard Leaflet
    // Initialize the map using standard Leaflet
    map = L.map('map').setView([0, 0], 3);

    // Add the tile layer using a modern Mapbox style URL and your token
    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token={accessToken}', {
        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: 'pk.eyJ1IjoidmliaG9yc2luZ2giLCJhIjoiY21id3YwNnZmMTVkcDJrcHVtdzdxbmZwOSJ9.sL9lIQQbsyg3VQ4kkV_yZQ'
    }).addTo(map);

    // Force the map to redraw itself after the page has loaded.
    setTimeout(function() {
        map.invalidateSize();
    }, 100);

    /* --- TEMPORARILY DISABLED FOR TESTING ---

    rsidebar = L.control.sidebar('rsidebar', {
        position: 'right',
        closeButton: true
    });
    rsidebar.on( "sidebar-show", function(){
        $("#map .leaflet-tile-loaded").addClass( "blurred" );
    });
    rsidebar.on( "sidebar-hide", function(){
        $('#map .leaflet-tile-loaded').removeClass('blurred');
        $('#map .leaflet-tile-loaded').addClass('unblurred');
        setTimeout( function(){
            $('#map .leaflet-tile-loaded').removeClass('unblurred');
        },7000);
    });

    map.addControl(rsidebar);


    lsidebar = L.control.sidebar('lsidebar', {
        position: 'left'
    });

    map.addControl(lsidebar);
    --- END OF TEMPORARILY DISABLED BLOCK --- */

    // Add in a crosshair for the map
    const crosshairIcon = L.icon({
        iconUrl: 'images/crosshair.png',
        iconSize:     [20, 20], // size of the icon
        iconAnchor:   [10, 10], // point of the icon which will correspond to marker's location
    });
    let crosshair = new L.marker(map.getCenter(), {icon: crosshairIcon, clickable:false});
    crosshair.addTo(map);

    // Initialize the FeatureGroup to store editable layers
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Initialize the draw control and pass it the FeatureGroup of editable layers
    drawControl = new L.Control.Draw({
        edit: {
            featureGroup: drawnItems
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
    let startBounds = new L.LatLngBounds([0.0,0.0],[0.0,0.0]);
    const bounds = new L.Rectangle(startBounds,
        {
            fill : false,
            opacity : 1.0,
            color : '#000'
        }
    );
    bounds.on('bounds-set', function( e ) {
        // move it to the end of the parent
        const parent = e.target._renderer._container.parentElement;
        $( parent ).append( e.target._renderer._container );
        // Set the hash
        const southwest = this.getBounds().getSouthWest();
        const northeast = this.getBounds().getNorthEast();
        const xmin = southwest.lng.toFixed(6);
        const ymin = southwest.lat.toFixed(6);
        const xmax = northeast.lng.toFixed(6);
        const ymax = northeast.lat.toFixed(6);
        location.hash = ymin+','+xmin+','+ymax+','+xmax;
    });
    map.addLayer(bounds)
    map.on('draw:created', function (e) {
        drawnItems.addLayer(e.layer);
        bounds.setBounds(drawnItems.getBounds())
        $('#boxbounds').text(formatBounds(bounds.getBounds(),'4326'));
        $('#boxboundsmerc').text(formatBounds(bounds.getBounds(),currentproj));
        if (!e.geojson &&
            !((drawnItems.getLayers().length == 1) && (drawnItems.getLayers()[0] instanceof L.Marker))) {
            map.fitBounds(bounds.getBounds());
        } else {
            if ((drawnItems.getLayers().length == 1) && (drawnItems.getLayers()[0] instanceof L.Marker)) {
                map.panTo(drawnItems.getLayers()[0].getLatLng());
            }
        }
    });

    map.on('draw:deleted', function (e) {
        e.layers.eachLayer(function (l) {
            drawnItems.removeLayer(l);
        });
        if (drawnItems.getLayers().length > 0 &&
            !((drawnItems.getLayers().length == 1) && (drawnItems.getLayers()[0] instanceof L.Marker))) {
            bounds.setBounds(drawnItems.getBounds())
            $('#boxbounds').text(formatBounds(bounds.getBounds(),'4326'));
            $('#boxboundsmerc').text(formatBounds(bounds.getBounds(),currentproj));
            map.fitBounds(bounds.getBounds());
        } else {
            bounds.setBounds(new L.LatLngBounds([0.0,0.0],[0.0,0.0]));
            $('#boxbounds').text(formatBounds(bounds.getBounds(),'4326'));
            $('#boxboundsmerc').text(formatBounds(bounds.getBounds(),currentproj));
            if (drawnItems.getLayers().length == 1) {
                map.panTo(drawnItems.getLayers()[0].getLatLng());
            }
        }
    });

    map.on('draw:edited', function (e) {
        bounds.setBounds(drawnItems.getBounds())
        $('#boxbounds').text(formatBounds(bounds.getBounds(),'4326'));
        $('#boxboundsmerc').text(formatBounds(bounds.getBounds(),currentproj));
        map.fitBounds(bounds.getBounds());
    });

    function display() {
        $('.zoomlevel').text(map.getZoom().toString());
        $('.tilelevel').text(formatTile(new L.LatLng(0, 0),map.getZoom()));
        $('#mapbounds').text(formatBounds(map.getBounds(),'4326'));
        $('#mapboundsmerc').text(formatBounds(map.getBounds(),currentproj));
        $('#center').text(formatPoint(map.getCenter(),'4326'));
        $('#centermerc').text(formatPoint(map.getCenter(),currentproj));
        $('#boxbounds').text(formatBounds(bounds.getBounds(),'4326'));
        $('#boxboundsmerc').text(formatBounds(bounds.getBounds(),currentproj));
        $('#mousepos').text(formatPoint(new L.LatLng(0, 0),'4326'));
        $('#mouseposmerc').text(formatPoint(new L.LatLng(0, 0),currentproj));
    }
    display();

    map.on('move', function(e) {
        crosshair.setLatLng(map.getCenter());
    });

    map.on('mousemove', function(e) {
        currentmouse.lat = e.latlng.lat;
        currentmouse.lng = e.latlng.lng;
        $('.tilelevel').text(formatTile(e.latlng,map.getZoom()));
        $('#mousepos').text(formatPoint(e.latlng,'4326'));
        $('#mouseposmerc').text(formatPoint(e.latlng,currentproj));
        $('#mapbounds').text(formatBounds(map.getBounds(),'4326'));
        $('#mapboundsmerc').text(formatBounds(map.getBounds(),currentproj));
        $('#center').text(formatPoint(map.getCenter(),'4326'));
        $('#centermerc').text(formatPoint(map.getCenter(),currentproj));
    });
    map.on('zoomend', function(e) {
        $('.tilelevel').text(formatTile(currentmouse,map.getZoom()));
        $('.zoomlevel').text(map.getZoom().toString());
        $('#mapbounds').text(formatBounds(map.getBounds(),'4326'));
        $('#mapboundsmerc').text(formatBounds(map.getBounds(),currentproj));
    });

    // --- START: Modern Clipboard API Implementation ---
    // Replaces the old ZeroClipboard (Flash-based) implementation.

    const showCopyFeedback = (element) => {
        const feedback = $("<span>&nbsp;Copied!&nbsp;</span>").css({
            "position": "absolute",
            "background-color" : "#C7C700",
            "color": "#000",
            "font-style" : "bold",
            "border-radius" : "15px",
            "padding" : "5px",
            "box-shadow" : "0px 2px 20px #000",
            "z-index": 1000
        });

        $(element).parent().append(feedback);
        feedback.css({
            top: $(element).position().top - 35,
            left: $(element).position().left - 15,
        }).animate({ opacity: 0, top: "-=20" }, 800, function() {
            $(this).remove();
        });
    };

        // CORRECTED SELECTOR on the line below
    $('#info').on('click', 'button[data-clipboard-target]', function() {
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


    // handle create-geojson click events
    $('#create-geojson').click(function(){
        rsidebar.toggle();
        $('#create-geojson a').toggleClass('enabled');
    });
    // close right sidebar with leaflet's "X"
    $('.right a.close').click(function(){
        $('#create-geojson a').toggleClass('enabled');
    });

    // handle help button click events
    $('#help').click(function(){
        lsidebar.toggle();
        $('#help button').toggleClass('enabled');
    });
    // close left sidebar with leaflet's "X"
    $('.left a.close').click(function(){
        $('#help button').toggleClass('enabled');
    });


    // toggle #info-box
    $('#info-toggle-button').click(function(){
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
    $('#wgslabel, #projlabel').click(function(){
        let active = $(this).hasClass('active');
        if(active){
            //do nothing
        } else {
            $('#wgslabel, #projlabel').toggleClass('active');
            $('#wgscoords, #projcoords').toggle();
        }


    });

    // handle geolocation click events
    $('#geolocation').click( function(){
        map.locate({setView: true, maxZoom: 8});
        $('#geolocation a').toggleClass('active');
	    $('#geolocation a').toggleClass('active', 350);
    });



    $('button#add').on( 'click', function(){
        const sniffer = FormatSniffer( { data :  $('div#rsidebar textarea').val() } );
        const is_valid = sniffer.sniff();
        if (is_valid) {
            rsidebar.hide();
	        $('#create-geojson a').toggleClass('enabled');
            map.fitBounds(bounds.getBounds());
        }
    });
    $('button#clear').on( 'click', function(){
        $('div#rsidebar textarea').val('');
    });

    // Add in a layer to overlay the tile bounds of the google grid
    const tiles = new L.tileLayer('/images/tile.png', {});
    addLayer(tiles, '', "Google tile boundaries", 10, false)

    // Modernized data loading with fetch
    fetch("proj/proj4defs.json")
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
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
                }
            }).val('3857');

            $('#projection').on('click', function() {
                $("#projection").autocomplete("search", currentproj);
            });
            // Set labels for output... left always 4326, right is proj selection
            $('#wgslabel').text('EPSG:4326 - ' + proj4defs['4326'][0]);
            $('#projlabel').text('EPSG:3857 - ' + proj4defs['3857'][0]);
        })
        .catch(err => {
            console.log("Request Failed: " + err);
        });

    const initialBBox = location.hash ? location.hash.replace(/^#/,'') : null;
    if (initialBBox) {
        if (validateStringAsBounds(initialBBox)) {
            const splitBounds = initialBBox.split(',');
            startBounds = new L.LatLngBounds([splitBounds[0],splitBounds[1]],
                                             [splitBounds[2],splitBounds[3]]);
            const lyr = new L.Rectangle( startBounds );
            const evt = {
                layer : lyr,
                layerType : "polygon",
            }
            map.fire( 'draw:created', evt );
        } else {
            bounds.setBounds(bounds.getBounds());
        }
    } else {
        bounds.setBounds(bounds.getBounds());
    }

    $("input").click(function() {
        display();
    });
});