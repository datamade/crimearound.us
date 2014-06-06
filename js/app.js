$(window).resize(function () {
  var h = $(window).height(),
    offsetTop = 80; // Calculate the top offset

  $('#map').css('height', (h - offsetTop));
  $('#mapinfo').css('height', (h - offsetTop));
}).resize();

var map;

(function(){
    var drawnItems = new L.FeatureGroup();
    var crimes = new L.FeatureGroup();
    var beats = new L.FeatureGroup();
    var community_areas_group = new L.FeatureGroup();

    var meta = L.control({position: 'bottomright'});
    var meta_data;
    var start_date;
    var end_date;
    var default_view = false;
    var cookiename = 'crimearound_us_v2'
    var endpoint = 'http://api.crimearound.us';
    //var endpoint = 'http://127.0.0.1:5000';

    var colors = [
       '#377eb8',
       '#ff7f00',
       '#4daf4a',
       '#984ea3'
    ];
    meta.onAdd = function(map){
        this._div = L.DomUtil.create('div', 'meta');
        return this._div;
    }
    meta.update = function(meta_data){
        if(typeof meta_data !== 'undefined'){
            var tpl = new EJS({url: 'js/views/metaTemplate.ejs?2'});
            meta_data['start_date'] = start_date.format('M/D/YYYY');
            meta_data['end_date'] = end_date.format('M/D/YYYY');
            $(this._div).html(tpl.render(meta_data));
        } else {
            $(this._div).empty();
            meta.removeFrom(map);
        }
    }

    map = L.mapbox.map('map', 'datamade.hn83a654', {attributionControl: false})
        .fitBounds([[41.644286009999995, -87.94010087999999], [42.023134979999995, -87.52366115999999]]);
    map.addLayer(drawnItems);
    var drawControl = new L.Control.Draw({
        edit: {
                featureGroup: drawnItems
        },
        draw: {
            polyline: false,
            circle: false,
            marker: false
        }
    });

    drawControl.setPosition('topleft')
    map.addControl(drawControl);
    map.on('draw:created', draw_create);
    map.on('draw:edited', draw_edit);
    map.on('draw:deleted', draw_delete);
    map.on('draw:drawstart', draw_delete);
    start_date = moment().subtract('d', 9);
    end_date = moment().subtract('d', 8);
    $('#date_range').daterangepicker(
      {
        format: 'M/D/YYYY',
        showDropdowns: true,
        startDate: start_date,
        endDate: end_date,
        maxDate: end_date,
        minDate: moment("01/01/2001")
      },
      function(start, end, label) {
            start_date = start;
            end_date = end;
      }
    )
    update_date_range();

    $('#date_range').on('apply.daterangepicker', function(ev, picker) {
      $('#submit-query').trigger('click');
    });

    $('#time-slider').slider({
        orientation: "horizontal",
        range: true,
        min: 0,
        max: 23,
        values: [0,23],
        slide: function(event, ui){
            var s = ui.values[0]
            var e = ui.values[1]
            var start = convertTime(s);
            var end = convertTime(e);
            $('#time-start').html(start);
            $('#time-end').html(end);
            $('#time-start').data('value', s);
            $('#time-end').data('value', e);
        }
    });
    if (typeof $.cookie(cookiename) === 'undefined'){
        $.cookie(cookiename, JSON.stringify([]), {
            json: true,
            expires: 365
        });
    } else {
        var saves = $.cookie(cookiename);
        saves = $.parseJSON(saves);
        if (saves.length > 0){
            $.each(saves, function(i, save){
                $('.saved-searches').append('<li><a class="saved-search" href="#"><i class="fa fa-star"></i> ' + save.name + '</a></li>');
            })
            $('.saved-search').on('click', load_remembered_search);
        }
    }

    $.getJSON(endpoint + '/api/group-to-location/', function(resp){
        var opts = '';
        $.each(resp, function(key, locations){
            // Need to show common types on top. Maybe handle this in API endpoint...
            if (key == 'cta' || key == 'cha'){
                opts += "<optgroup label='" + key.toUpperCase() + "'>";
            } else {
                opts += "<optgroup label='" + toTitleCase(key).split('_').join(' ') + "'>";
            }
            $.each(locations, function(i, location){
                opts += "<option value='" + location + "'>" + location + "</option>";
            });
            opts += "</optgroup>"
        });
        $('#crime-location').append(opts);
        $('#crime-location').trigger('chosen:updated');
    })

    //populate beats
    var beat_select = "<select id='police-beat' data-placeholder='All police beats' class='select2 form-control' multiple>";
    var keys = [];
    for (k in police_beats){
        if (police_beats.hasOwnProperty(k)){
            keys.push(k)
        }
    }
    keys.sort();
    sorted_beats = {};
    for (i = 0; i < keys.length; i++){
        var k = keys[i];
        sorted_beats[k] = police_beats[k];
    }
    $.each(sorted_beats, function(district, s_beats){
        beat_select += "<optgroup label='" + district + "'>";
        $.each(s_beats, function(i, beat){
            beat_select += "<option value='" + beat + "'>" + beat + "</option>";
        })
        beat_select += "</optgroup>";
    });
    beat_select += "</select>";
    $('#beat-filters').append(beat_select);

    //populate community areas
    var comm_select = "<select id='community-area' data-placeholder='All community areas' class='select2 form-control' multiple>";
    $.each(community_areas, function(region, areas){
        comm_select += '<optgroup label="' + region + '">';
        $.each(areas, function(i, area){
            comm_select += "<option value='" + area.number + "'>" + area.name + "</option>";
        });
        comm_select += '</optgroup>'
    });
    comm_select += "</select>";
    $('#comm-area-filters').append(comm_select);

    // init map, filters and events
    $('.select2').select2();

    // format select2 for crime types
    $("#crime-type").select2({
        formatResult: crime_type_format,
        formatSelection: crime_type_format,
        escapeMarkup: function(m) { return m; }
    });

    $('#submit-query').on('click', function(e){
        e.preventDefault();
        submit_search();
    });
    $('#reset').on('click', function(e){
        e.preventDefault();
        window.location.hash = '';
        window.location.reload();
    });

    $('#report').on('click', get_report);
    $('#remember').on('click', remember_search);
    $('#print').on('click', print);
    $('#collapse-advanced').collapse('hide');

    if(window.location.hash){
        var hash = window.location.hash.slice(1,window.location.hash.length);
        var query = parseParams(hash);
        $('#map').spin('large');
        $.when(get_results(query)).then(
            function(resp){
                reload_state(query, resp);
            }
        ).fail();
    } else {
        // set default filters
        var crime_types = "THEFT,BATTERY,CRIMINAL DAMAGE,NARCOTICS";
        $.each(crime_types.split(","), function(i,e){
            $("#crime-type option[value='" + e + "']").prop("selected", true);
        });
        $('#crime-type').trigger('change');
        submit_search();
    }

    function draw_edit(e){
        var layers = e.layers;
        crimes.clearLayers();
        var query = meta_data['query'];
        layers.eachLayer(function(layer){
            drawnItems.addLayer(layer);
            query['location_geom__within'] = JSON.stringify(layer.toGeoJSON());
        });
        $('#map').spin('large');
        $.when(get_results(query)).then(function(resp){
            $('#map').spin(false);
            add_resp_to_map(query, resp);
            map.fitBounds(drawnItems.getBounds());
        })
    }

    function draw_create(e){
        drawnItems.addLayer(e.layer);
        var query = meta_data['query'];
        query['location_geom__within'] = JSON.stringify(e.layer.toGeoJSON());
        $('#map').spin('large');
        $.when(get_results(query)).then(function(resp){
            $('#map').spin(false);
            add_resp_to_map(query, resp);
            map.fitBounds(drawnItems.getBounds());
        })
    }

    function draw_delete(e){
        crimes.clearLayers();
        drawnItems.clearLayers();
        meta.update();
    }

    function submit_search(){
        $('#remember i').attr('class', 'fa fa-star-o');
        $('#map').spin('large');
        var query = {'dataset_name': 'chicago_crimes_all'};
        var layers = drawnItems.getLayers();
        if (layers.length > 0){
            drawnItems.eachLayer(function(layer){
                query['location_geom__within'] = JSON.stringify(layer.toGeoJSON());
            })
        }
        if ($('#crime-location').val()){
            var locations = [];
            $.each($('#crime-location').val(), function(i, location){
                locations.push(location);
            });
            if(locations.length > 0){
                query['location_description__in'] = locations.join(',');
            }
        }

        query['obs_date__ge'] = start_date.format('YYYY/MM/DD');
        query['obs_date__le'] = end_date.format('YYYY/MM/DD');
        var time_start = $('#time-start').data('value');
        var time_end = $('#time-end').data('value');
        query['orig_date__time_of_day_ge'] = time_start;
        query['orig_date__time_of_day_le'] = time_end;
        if($('#crime-type').val()){
            var types = []
            $.each($('#crime-type').val(), function(i, type){
                types.push(type);
            });
            if(types.length > 0){
                query['primary_type__in'] = types.join(',');
            }
        }
        if ($('#police-beat').val()){
            var bts = [];
            $.each($('#police-beat').val(), function(i, beat){
                bts.push(beat);
            });
            if(bts.length > 0){
                query['beat__in'] = bts.join(',');
            }
        }
        if ($('#community-area').val()){
            var comms = [];
            $.each($('#community-area').val(), function(i, area){
                comms.push(parseInt(area));
            });
            if(comms.length > 0){
                query['community_area__in'] = comms.join(',');
            }
        }

        $.when(get_results(query)).then(function(resp){
            if (typeof query.beat__in !== 'undefined'){
                add_beats(query.beat__in.split(','));
            }
            if (typeof query.community_area__in !== 'undefined'){
                add_community_areas(query.community_area__in.split(','));
            }
            add_resp_to_map(query, resp);
            if (beats.getLayers().length > 0){
                map.fitBounds(beats.getBounds());
            } else if (community_areas_group.getLayers().length > 0) {
                map.fitBounds(community_areas_group.getBounds());
            } else if (crimes.getLayers().length > 0){
                map.fitBounds(crimes.getBounds());
            }

        }).fail(function(data){
            console.log(data);
        })
    }

    function add_beats(b){
        beats.clearLayers();
        $.each(b, function(i, beat){
            $.getJSON('/data/beats/' + beat + '.geojson', function(geo){
                beats.addLayer(L.geoJson(geo, {
                    style: function(){
                        return {
                            stroke: true,
                            color: '#7B3294',
                            weight: 4,
                            opacity: 0.9,
                            fill: false
                        }
                    }
                }))
            })
        });
        map.addLayer(beats, true);
    }

    function add_community_areas(areas){
        community_areas_group.clearLayers();
        $.each(areas, function(i, area){
            if(area.length < 2){
                area = '0' + area
            }
            $.getJSON('/data/community_areas/' + area + '.geojson', function(a){
                community_areas_group.addLayer(L.geoJson(a, {
                    style: function(){
                        return {
                            stroke: true,
                            color: '#7B3294',
                            weight: 4,
                            opacity: 0.9,
                            fill: false
                        }
                    }
                }))
            })
        });
        map.addLayer(community_areas_group, true);
    }

    function add_resp_to_map(query, resp){
        crimes.clearLayers();
        var marker_opts = {
            radius: 5,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.6
        };
        $('#map').spin(false);
        meta_data = resp.meta;
        if($('.meta.leaflet-control').length){
            meta.removeFrom(map);
        }
        meta.addTo(map);
        meta.update(meta_data);
        var geo = []
        $.each(resp.results, function(i, result){
            if (result.latitude && result.longitude){
                result.location.properties = result;
                crimes.addLayer(L.geoJson(result.location, {
                    pointToLayer: function(feature, latlng){
                        var crime_type = feature.properties.crime_type
                        if (crime_type == 'violent'){
                            marker_opts.color = colors[3];
                            marker_opts.fillColor = colors[3];
                        } else if (crime_type == 'property'){
                            marker_opts.color = colors[0];
                            marker_opts.fillColor = colors[0];
                        } else if (crime_type == 'quality'){
                            marker_opts.color = colors[2];
                            marker_opts.fillColor = colors[2];
                        } else {
                            marker_opts.color = colors[1];
                            marker_opts.fillColor = colors[1];
                        }
                        var jitter = 0.0001;
                        var ll = [latlng.lat + (Math.random() * jitter), latlng.lng - (Math.random() * jitter)]
                        return L.circleMarker(ll, marker_opts)
                    },
                    onEachFeature: bind_popup
                }));
            }
        });
        map.addLayer(crimes);
        window.location.hash = $.param(query);
    }

    function reload_state(query, resp){
        $('#map').spin(false);
        var location = resp['meta']['query']['location__within'];
        if (typeof location !== 'undefined'){
            var shape_opts = {
                stroke: true,
                color: '#f06eaa',
                weight: 4,
                opacity: 0.5,
                fill: true,
                fillOpacity: 0.2,
                clickable: true
            }
            var geo = L.geoJson(location,{
                style: function(feature){
                    return shape_opts;
                }
            });
            drawnItems.addLayer(geo);
        }

        start_date = moment(query['obs_date__ge']);
        end_date = moment(query['obs_date__le']);
        update_date_range();

        $('#date_range').data('daterangepicker').setStartDate(start_date);
        $('#date_range').data('daterangepicker').setEndDate(end_date);

        if(typeof query['beat__in'] !== 'undefined'){
            $.each(query['beat__in'].split(','), function(i, beat){
                $('#police-beat').find('[value="' + beat + '"]').attr('selected', 'selected');
            });
            $('#police-beat').trigger('change');
        }
        if(typeof query['primary_type__in'] !== 'undefined'){
            $.each(query['primary_type__in'].split(','), function(i, pt){
                $('#crime-type').find('[value="' + pt + '"]').attr('selected', 'selected');
            });
            $('#crime-type').trigger('change');
        }
        if(typeof query['locations'] !== 'undefined'){
            $.each(query['locations'].split(','), function(i, loc){
                $('#crime-location').find('[value="' + loc + '"]').attr('selected', 'selected');
            });
            $('#crime-location').trigger('change');
        }
        if(typeof query['orig_date__time_of_day_le'] !== 'undefined'){
            var s = query['orig_date__time_of_day_ge'];
            var e = query['orig_date__time_of_day_le'];
            var start = convertTime(s);
            var end = convertTime(e);
            $('#time-start').html(start);
            $('#time-end').html(end);
            $('#time-start').data('value', s);
            $('#time-end').data('value', e);
            $('#time-slider').slider('values', 0, s);
            $('#time-slider').slider('values', 1, e);
        }
        if (typeof query['beat__in'] !== 'undefined'){
            add_beats(query['beat__in'].split(','));
        }
        if (typeof query['community_area__in'] !== 'undefined'){
            add_community_areas(query['community_area__in'].split(','));
        }
        add_resp_to_map(query, resp);
        if (beats.getLayers().length > 0){
            map.fitBounds(beats.getBounds());
        } else if (community_areas_group.getLayers().length > 0){
            map.fitBounds(community_areas_group.getBounds())
        } else if (crimes.getLayers().length > 0){
            map.fitBounds(crimes.getBounds());
        }

        if (map.getZoom() <= 11)
            map.setZoom(map.getZoom() + 1);
    }

    function remember_search(){
        var hash = window.location.hash.slice(1,window.location.hash.length);
        var query = parseParams(hash);
        query['name'] = moment(query['obs_date__ge']).format('M/D/YYYY') + " - " + moment(query['obs_date__le']).format('M/D/YYYY');
        var cookie_val = $.parseJSON($.cookie(cookiename));
        cookie_val.push(query);
        $.cookie(cookiename, JSON.stringify(cookie_val));
        $('#remember i').attr('class', 'fa fa-star');

        var item = '<li><a class="saved-search" href="#"><i class="fa fa-star"></i> ' + query['name'] + '</a></li>'
        $('.saved-searches').append(item);

        $('.saved-search').each(function(r){
            if(typeof $._data(this, 'events') === 'undefined'){
                $(this).on('click', load_remembered_search);
            }
        })
    }

    function delete_search(e){
        var name = $(e.currentTarget).prev().text();
        var cookie_val = $.parseJSON($.cookie(cookiename));
        var new_cookie = []
        $.each(cookie_val, function(i, val){
            if(val.name != name){
                new_cookie.push(val);
            }
        })
        $.cookie(cookiename, JSON.stringify(new_cookie));
        $(e.currentTarget).parent().remove();
    }

    function load_remembered_search(e){
        $('#map').spin('large');
        var name = $(e.target).text().trim();
        var cookie_val = $.parseJSON($.cookie(cookiename));
        var query = null;
        $.each(cookie_val, function(i, val){
            if(val.name == name){
                query = val;
            }
        });
        delete query['name'];
        $.when(get_results(query)).then(
            function(resp){
                reload_state(query, resp);
            }
        ).fail();
    }

    function bind_popup(feature, layer){
        var crime_template = new EJS({url: 'js/views/crimeTemplate.ejs?v=2'});
        var props = feature.properties;
        var pop_content = crime_template.render(props);

        var hoverText = feature.properties['primary_type'] + " - " + feature.properties['description'] + "\
                        <br />" + moment(feature.properties['orig_date']).format('MMM D, YYYY h:mma');
        layer.bindLabel(hoverText);
        layer.bindPopup(pop_content, {
            closeButton: true,
            minWidth: 320
        })
    }

    function get_report(e){
        e.preventDefault();
        var query = JSON.stringify(meta_data.query);
        if (typeof query !== 'undefined'){
            window.location = endpoint + '/api/report/?query=' + query;
        } else {
            $('#report-modal').reveal()
        }
    }

    function print(e){
        e.preventDefault();
        if (typeof meta_data.query !== 'undefined'){
            var query = {'query': meta_data.query}
            query['center'] = [map.getCenter().lng, map.getCenter().lat];
            query['dimensions'] = [map.getSize().x, map.getSize().y];
            query['zoom'] = map.getZoom();
            query = JSON.stringify(query);
            window.location = endpoint + '/api/print/?query=' + query;
        } else {
            $('#report-modal').reveal()
        }
    }

    function get_results(query){
        return $.getJSON(endpoint + '/api/crime/', query)
    }

    // utility functions
    function crime_type_format(el) {
        var originalOption = el.element;

        if (!el.id) return el.text; // optgroup
        return "<span class='" + $(originalOption).data('type') + "'>" + el.text + "</span>";
    }

    function toTitleCase(str){
        return str.replace(/\w\S*/g, function(txt){
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }

    function convertTime(time){
        var meridian = time < 12 ? 'am' : 'pm';
        var hour = time % 12 || 12;
        return hour + meridian;
    }

    function parseParams(query){
        var re = /([^&=]+)=?([^&]*)/g;
        var decodeRE = /\+/g;  // Regex for replacing addition symbol with a space
        var decode = function (str) {return decodeURIComponent( str.replace(decodeRE, " ") );};
        var params = {}, e;
        while ( e = re.exec(query) ) {
            var k = decode( e[1] ), v = decode( e[2] );
            if (k.substring(k.length - 2) === '[]') {
                k = k.substring(0, k.length - 2);
                (params[k] || (params[k] = [])).push(v);
            }
            else params[k] = v;
        }
        return params;
    }

    function update_date_range(){
        $('#date_range').val(start_date.format('M/D/YYYY') + " - " + end_date.format('MM/DD/YYYY'));
    }
})()
