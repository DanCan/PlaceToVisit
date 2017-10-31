
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
      this.listings(false);
      this.hideListings();
      this.registerBounds();
      this.showListing(selectedMarker, this.map);
      this.fitBounds();
      this.map.setZoom(12);
    }, obj);

    // Init Markers and window
    obj.infowindow = new google.maps.InfoWindow({ maxWidth: 525 });
    obj.markers = ko.observableArray([]);
    obj.registerBounds();
    var l, ls, len, position, title, marker;
    ls = loadedJson.locations;
    len = ls.length;
    for(var i = 0; i < len; i++) {
      l = ls[i];
      position = l.location;
      title = l.title;
      marker = new Marker(position, i, title);
      obj.markers.push(marker);
      obj.extendBounds(marker);
      marker.addListener('click', function() {
        setInfoWindowContent(this, obj.infowindow);
      });
    }
    obj.fitBounds();

    // Toggles showing of all listings
    obj.listings = ko.observable(false);
    obj.showListings = function () {
      obj.selectedLocation(null);
      var mark;
      var len = obj.markers().length;
      obj.registerBounds();
      for(var i = 0; i < len; i++){
        mark = obj.markers()[i];
        obj.showListing(mark, obj.map);
      }
      obj.fitBounds();
    };
    obj.showListing = function(marker, map) {
      marker.setMap(map);
      this.extendBounds(marker);
      marker.setAnimation(google.maps.Animation.DROP);
    }.bind(obj);
    obj.hideListings = function() {
      for(var i = 0; i < obj.markers().length; i++){
        obj.markers()[i].setMap(null);
        obj.markers()[i].setAnimation(null);
      }
    };

    // Helper for listings text
    obj.toggleListingText = function() {
      var $togList = $('#toggle-listings');
      var currentText = $togList.val().indexOf('Show') > -1 ? 'Show' : 'Hide';
      var replacementText = currentText === 'Show' ? 'Hide' : 'Show';
      $togList.val($togList.val().replace(currentText, replacementText));
    };
    obj.toggleListings = ko.computed(function(value){
      if(obj.listings()){
        obj.toggleListingText();
        obj.showListings();
      }else {
        obj.toggleListingText();
        obj.hideListings();
      }
    });

    // Zoom
    var zoomAutocomplete = new google.maps.places.Autocomplete(
    document.getElementById('zoom-to-area-text'));
    zoomAutocomplete.bindTo('bounds', obj.map);
    document.getElementById('zoom-to-area').addEventListener('click', function() {
      obj.zoomToArea();
    });

    // This function takes the input value in the find nearby area text input
    // locates it, and then zooms into that area. This is so that the user can
    // show all listings, then decide to focus on one area of the map.
    obj.zoomToArea =  function() {
      // Initialize the geocoder.
      var geocoder = new google.maps.Geocoder();
      // Get the address or place that the user entered.
      var address = document.getElementById('zoom-to-area-text').value;
      // Make sure the address isn't blank.
      if (address == '') {
        window.alert('You must enter an area, or address.');
      } else {
        // Geocode the address/area entered to get the center. Then, center the map
        // on it and zoom in

        // TODO: Returning partial matches and zooming to bad locations
        geocoder.geocode(
          { address: address,
            componentRestrictions: { country: 'IS'}
          }, function(results, status) {
            if (status == google.maps.GeocoderStatus.OK) {
              obj.map.setCenter(results[0].geometry.location);
              obj.map.setZoom(12);
            } else {
              window.alert('We could not find that location - try entering a more' +
                  ' specific place.');
            }
          });
        }
      }


    ko.applyBindings(obj);
    return obj;
  })();

}.bind(this));

var Marker = function(position, id, title = "") {
  return new google.maps.Marker({
    map: null,
    position: position,
    title: title,
    animation: google.maps.Animation.DROP,
    id: id
  });
};

setInfoWindowContent = async function (marker, infowindow) {
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

    // Street View
    var streetViewService = new google.maps.StreetViewService();
    // By setting the radiius to 1500 I get the peak of Hekla
    var radius = 1500;
    // In case the status is OK, which means the pano was found, compute the
    // position of the streetview image, then calculate the heading, then get a
    // panorama from that and set the options
    function getStreetView(data, status) {
      if (status == google.maps.StreetViewStatus.OK) {
        var nearStreetViewLocation = data.location.latLng;
        var heading = google.maps.geometry.spherical
          .computeHeading(nearStreetViewLocation, marker.position);
        infowindow.setContent('<div id="info-window">'+title+'<div>'+pano+aside+'</div></div>');
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
        infowindow.setContent('<div>' + marker.title + '</div>' +
          '<div>No Street View Found</div>');
      }
    }
    // Use streetview service to get the closest streetview image within
    // 50 meters of the markers position
    streetViewService.getPanoramaByLocation(marker.position, radius, getStreetView);

    infowindow.addListener('closeclick', function() {
      infowindow.marker = null;
    });
    infowindow.open(map, marker);

  }
}
