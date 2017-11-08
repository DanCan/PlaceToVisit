
var ViewModel;
var Load = {
  JSON: false,
  GOOGLE: false
};
var $menu = $('#menu');
$('#menu-icon').load('../resources/svg/ic_menu_black_24px.svg');
//
var InitviewModel = function(msg) {
  var keys = Object.keys(Load);
  var waitfor = keys.length;
  var total = 0;
  for(var x of keys ){
    total+=Load[x];
  }

  if(waitfor === total){
    InitApp();
  }
};

// Key value pairing of json to load
var jsonToBeLoaded = [
  { name: "styles", file: 'src/json/mapStyle2.json'},
  { name: "locations", file: 'src/json/locations.json'},
];
var loadedJson = {};
var saveJSON = function(data) {  loadedJson[this] = data;  };
var jsonFail = function(err) { $('#title').text("Error Loading '"+this+"' JSON"); throw err; };

(async function(){
  // Race condition: Might not be available when maps initializes
  for (var json of jsonToBeLoaded) {
    loadedJson[json.name] = "";
    await $.getJSON(json.file)
      .done( saveJSON.bind(json.name) )
      .fail( jsonFail.bind(json.name) );
  }

  Load.JSON = true;
  InitviewModel('json');

}.bind(this))();

var googleMapInit = function() {
  Load.GOOGLE = true;
  InitviewModel('goog');
};



var InitApp = function(){

  var wikiRequestTimeout = function() {
    return setTimeout(function() {
      loadedJson[this.title] = "<div>failed to get wikipedia resources</div>";
    }.bind(this), 2500);
  }

  var wikiSuccess = function (_wikiRequestTimeout, response, result){
    var reply = response[1];
    if(reply && reply.length !== 0){
      clearTimeout(_wikiRequestTimeout);
      reply.forEach(function(article){
        var url = 'http://en.wikipedia.org/wiki/'+article;
        loadedJson[this.title] = '<li><a href="'+url+'">'+article+'</a></li>';
      }.bind(this));
    }
  }

  var wikiError = function (err, data1) {
    loadedJson[this.title] = "<div>Wikipedia Error. Please try again.</div><div>"+err+"</div>";
  }

  // Pre load wiki data
  for (var loc of loadedJson.locations){
    var wikiLink = 'https://en.wikipedia.org/w/api.php?action=opensearch&search='+loc.title+'&format=json';
    var wikiTimeOutHandle = wikiRequestTimeout.bind(loc);
    // Await the wiki
    $.ajax(wikiLink,
    {
      dataType: "jsonp",
      success: wikiSuccess.bind(loc, wikiTimeOutHandle),
      error: wikiError.bind(loc)
    });

  }


  ViewModel = (function() {
    var obj = {};

    $(window).on('resize', function() {
      console.log(window.innerWidth);
      if (window.innerWidth <= 480){
        obj.isMobile(true);
        return;
      } else if (obj.isMobile()){
        obj.isMobile(false);
      }
    });
    obj.isMobile = ko.observable(window.innerWidth <= 480);
    // TODO: Don't think this NEEDS to be a computed???
    obj.MobileIsEnabled = ko.computed( function() {
      console.log('MobileIsEnabled');
      if(obj.isMobile()){
        $menu.addClass('animOut');
        return true
      }

      return false;
    });

    obj.menuIsOut = ko.observable(false);
    obj.toggleAnim = ko.computed(function() {
      if(obj.menuIsOut()){
        $menu.removeClass('animOut').addClass('animIn');
      }else {
          $menu.removeClass('animIn').addClass('animOut');
      }
    });
    obj.map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 65.0, lng: -18.9 },
      zoom: 7,
      styles: null,
      mapTypeControl: false
    });

    //
    google.maps.event.addDomListener(window, 'resize', function() {
      obj.fitBounds();
      if (obj.infowindow.marker){
        obj.map.panTo(obj.infowindow.marker.position);
      }
    });

    // Quick functions for creating bounds
    obj.registerBounds = function() { obj.bounds = new google.maps.LatLngBounds(); }
    obj.extendBounds = function(marker) { obj.bounds.extend(marker.position); }
    obj.fitBounds = function(map) { map.fitBounds(this.bounds); }.bind(obj, obj.map);

    // Using DROP DOWN for filtering markers
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

    // Init Markers
    var markerClick = function() {
      bounceMarker(this);
      obj.setInfoWindowContent(this);
    };
    var markerOver = function() { this.setIcon(highlightIcon); };
    var markerOut = function() { this.setIcon(defaultIcon); };
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
      marker.addListener('click', markerClick);
      marker.addListener('mouseover', markerOver);
      marker.addListener('mouseout', markerOut);
    }
    obj.fitBounds();

    // Init Window and Services
    var pano = '<div id="pano"></div>';
    var asideStart = '<div id="info-window-right">';
    var asideEnd = '</div>';
    obj.infowindow = new google.maps.InfoWindow({ maxWidth: 525 });
    obj.infowindow.addListener('closeclick', function() {
      obj.infowindow.marker = null;
    });
    obj.streetViewService = new google.maps.StreetViewService();

    var setInfoWindowAndPanorama = function(data, status) {
      if (status == google.maps.StreetViewStatus.OK) {
        var streetViewLocation = data.location.latLng;
        var direction = google.maps.geometry.spherical
          .computeHeading(streetViewLocation, marker.position);

        var title = '<h4 id="title">%data%</h4>';
        // I wish i didn't have to replace here and could use a ko.observable
        title = title.replace('%data%', this.marker.title);
        // This setContent coudln't get ko to bind title value
        this.setContent('<div id="info-window">'+title+'<div style="display: flex;">'+pano+asideStart+loadedJson[this.marker.title]+asideEnd+'</div></div>');

        var panoramaOptions = {
          position: streetViewLocation,
          pov: {
            heading: direction,
            pitch: 20
          }
        };

        // Init: I couldn't find a way to abstract this
        var panorama = new google.maps
          .StreetViewPanorama($('#pano')[0], panoramaOptions);

      } else {
        this.setContent('<div>' + marker.title + '</div>' +
          '<div>No Street View Found</div>');
      }
    }.bind(obj.infowindow);

    // Sets up info window
    obj.setInfoWindowContent = function (marker) {
      var infowindow = this.infowindow;
      if (infowindow.marker != marker) {
        infowindow.marker = marker;
        // By setting the radiius to 1500 I get the peak of Hekla
        var radius = 1500;
        this.streetViewService.getPanoramaByLocation(marker.position, radius, setInfoWindowAndPanorama);
      }
      infowindow.open(this.map, marker);
    }.bind(obj);

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

    // Filters out search term
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
      // Don't zoom in to far
      if(filterResult.length === 1) obj.map.setZoom(12);
      // can't find anythign? zoom back out
      if(filterResult.length === 0) obj.showListings(false);
      return filterResult;
    }.bind(obj);

    // Searches for what user typed in the input bar using the markers array.
    // Only displaying the exact item result the user typed.
    obj.filteredList = ko.computed( function() {
      obj.infowindow.close();
      return obj.filter()
    });

    // Selecting list items below filter
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

}.bind(this);

// creates new markers
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

// creates new marker images
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

// Sets a marker to bounce once then stop
function bounceMarker(marker) {
  marker.setAnimation(google.maps.Animation.BOUNCE);
  setTimeout(() => {
    marker.setAnimation(null);
  }, 700);
}

// Error if google doens't load
function errorHandlingMap() {
    $('#map').html('Google Maps failed to load.');
}
