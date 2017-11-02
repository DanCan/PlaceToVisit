
var ViewModel;
var googleMapInit = (async function(){

  // Key value pairing of json to load
  var jsonToBeLoaded = [
    { name: "styles", file: 'src/json/mapStyle2.json'},
    { name: "locations", file: 'src/json/locations.json'},
  ];
  var loadedJson = {};
  var getStyle = function(data) {  loadedJson[this] = data;  };
  var jsonFail = function(err) { $('#title').text("Error Loading '"+this+"' JSON"); throw err; };
  for (json of jsonToBeLoaded) {
    loadedJson[json.name] = "";
    await $.getJSON(json.file)
      .done( getStyle.bind(json.name) )
      .fail( jsonFail.bind(json.name) );
  }

  // The network for this maps app
  ViewModel = await ( async function () {
    var obj = {};

    obj.map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 65.0, lng: -18.9 },
      zoom: 7,
      styles: null,
      mapTypeControl: false
    });

    // Quick functions for creating bounds
    obj.registerBounds = function() {
      obj.bounds = new google.maps.LatLngBounds();
    }
    obj.extendBounds = function(marker) {
      obj.bounds.extend(marker.position);
    }
    obj.fitBounds = function(map){
      map.fitBounds(this.bounds);

    }.bind(obj, obj.map);

    obj.selectedLocation = ko.observable();
    obj.selectedLocation.subscribe( function(selectedMarker) {
      if(!selectedMarker) return;
      this.hideListings();
      this.registerBounds();
      this.showListing(selectedMarker, this.map);
      this.fitBounds();
      this.map.setZoom(12);
      this.setInfoWindowContent(selectedMarker);
    }, obj);

    // Init Window
    obj.infowindow = new google.maps.InfoWindow({ maxWidth: 525 });
    obj.infowindow.addListener('closeclick', function() {
      obj.infowindow.marker = null;
    });

    obj.streetViewService = new google.maps.StreetViewService();

    obj.setInfoWindowContent = async function (marker) {
      var infowindow = this.infowindow;
      if (infowindow.marker != marker) {
        infowindow.marker = marker;
        var title = '<h4 id="title">%data%</h4>';
        var pano = '<div id="pano"></div>';
        var aside = '<div id="aside">';
        //
        title = title.replace('%data%', marker.title);
        //
        var wikiRequestTimeout = setTimeout(function() {
          aside = "<div>failed to get wikipedia resources</div>";
          infowindow.setContent('<div id="info-window">'+title+'<div>'+pano+aside+'</div></div>');
        }, 2500);

        // Await the wiki
        await $.ajax('https://en.wikipedia.org/w/api.php?action=opensearch&search='+marker.title+'&format=json',
        {
          dataType: "jsonp",
          success: function (result){
            var response = result[1];
            if(response && response.length !== 0){
              clearTimeout(wikiRequestTimeout);
              response.forEach(function(article){
                var url = 'http://en.wikipedia.org/wiki/'+article;
                aside = aside.concat('<li><a href="'+url+'">'+article+'</a></li>');
              });
              aside = aside.concat('</div>');
            }
          }
        });

        // By setting the radiius to 1500 I get the peak of Hekla
        var radius = 1500;
        // In case the status is OK, which means the pano was found, compute the
        // position of the streetview image, then calculate the heading, then get a
        // panorama from that and set the options
        var getStreetView = function(data, status) {
          if (status == google.maps.StreetViewStatus.OK) {
            var nearStreetViewLocation = data.location.latLng;
            var heading = google.maps.geometry.spherical
              .computeHeading(nearStreetViewLocation, marker.position);
            this.setContent('<div id="info-window">'+title+'<div>'+pano+aside+'</div></div>');
            var panoramaOptions = {
              position: nearStreetViewLocation,
              pov: {
                heading: heading,
                pitch: 20
              }
            };
            var panorama = new google.maps
              .StreetViewPanorama($('#pano')[0], panoramaOptions);
          } else {
            this.setContent('<div>' + marker.title + '</div>' +
              '<div>No Street View Found</div>');
          }
        }.bind(infowindow);
        // Use streetview service to get the closest streetview image within
        // 50 meters of the markers position
        this.streetViewService.getPanoramaByLocation(marker.position, radius, getStreetView);

      }
      infowindow.open(this.map, marker);
    }.bind(obj);

    // Init Markers
    obj.markers = ko.observableArray([]);
    obj.registerBounds();
    var defaultIcon = makeMarkerIcon('585858');
    var highlightIcon = makeMarkerIcon('A61103');
    var l, ls, len, position, title, marker;
    ls = loadedJson.locations;
    len = ls.length;
    for(var i = 0; i < len; i++) {
      l = ls[i];
      position = l.location;
      title = l.title;
      marker = new Marker(position, i, defaultIcon, title);
      obj.markers.push(marker);
      obj.extendBounds(marker);
      marker.addListener('click', function() {
        bounceMarker(this);
        obj.setInfoWindowContent(this);
      });
      marker.addListener('mouseover', function() {
        this.setIcon(highlightIcon);
      });
      marker.addListener('mouseout', function() {
        this.setIcon(defaultIcon);
      });
    }
    obj.fitBounds();

    // Toggles showing of all listings
    obj.showListings = function (visible = true) {
      obj.selectedLocation(null);
      var mark;
      var len = obj.markers().length;
      obj.registerBounds();
      for(var i = 0; i < len; i++){
        mark = obj.markers()[i];
        obj.showListing(mark, obj.map, visible);
      }
      obj.fitBounds();
    };
    obj.showListing = function(marker, map, visible= true) {
      marker.setMap(visible?map:null);
      this.extendBounds(marker);
      marker.setAnimation(google.maps.Animation.DROP);
    }.bind(obj);
    obj.hideListings = function() {
      for(var i = 0; i < obj.markers().length; i++){
        obj.markers()[i].setMap(null);
        obj.markers()[i].setAnimation(null);
      }
    };

    obj.zoomToListings = function(){
      obj.infowindow.close();
      obj.searchLocation('');
      obj.showListings();
    };

    obj.searchLocation = ko.observable('');

    obj.filter = function() {
      var term = this.searchLocation().toLowerCase();
      var title, result;
      obj.registerBounds();
      var filterResult = ko.utils.arrayFilter(this.markers(), function(marker) {
          title = marker.title.toLowerCase();
          result = (title.search(term) >= 0);
          if (result){
            marker.setMap(obj.map);
            obj.extendBounds(marker);
          } else {
            marker.setMap(null);
          }

          return result;
      });
      obj.fitBounds();
      if(filterResult.length === 1) obj.map.setZoom(12);
      if(filterResult.length === 0) obj.showListings(false);
      return filterResult;
    }.bind(obj);

    // Searches for what user typed in the input bar using the markers array.
    // Only displaying the exact item result the user typed.
    obj.filteredList = ko.computed( function() {
      obj.infowindow.close();
      return obj.filter()
    }, obj);

    obj.selectFilterLocation = function(marker) {
      obj.selectedLocation(null);
      obj.showListing(marker, obj.map);
      obj.filter();
      obj.map.panTo(marker.position);
      obj.setInfoWindowContent(marker);
      bounceMarker(marker);
    }

    ko.applyBindings(obj);

    return obj;
  })();

}.bind(this));

var Marker = function(position, id, icon, title = "") {
  return new google.maps.Marker({
    map: null,
    position: position,
    title: title,
    animation: google.maps.Animation.DROP,
    icon: icon,
    id: id
  });
};

function makeMarkerIcon(markerColor) {
  var markerImage = new google.maps.MarkerImage(
    'http://chart.googleapis.com/chart?chst=d_map_spin&chld=1.15|0|'+ markerColor +
    '|40|_|%E2%80%A2',
    new google.maps.Size(21, 34),
    new google.maps.Point(0, 0),
    new google.maps.Point(10, 34),
    new google.maps.Size(21,34));
  return markerImage;
}

function bounceMarker(marker) {
  marker.setAnimation(google.maps.Animation.BOUNCE);
  setTimeout(() => {
    marker.setAnimation(null);
  }, 750);
}
