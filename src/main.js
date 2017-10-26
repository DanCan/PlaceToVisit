
var ViewModel;
var googleMapInit = (async function(){

  var loadedJson = {styles:"", locations:""};
  // Load Data
  var getStyle = function(data) {
      loadedJson[this] = data;
  }
  await $.getJSON('src/json/mapStyle.json', null, getStyle.bind("styles"));
  await $.getJSON('src/json/locations.json', null, getStyle.bind("locations"));

  // The network for this maps app
  ViewModel = function() {

    this.map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 65.0, lng: -18.9 },
      zoom: 7,
      styles: loadedJson.styles,
      mapTypeControl: false
    });

    this.infowindow = new google.maps.InfoWindow();
    this.bounds = new google.maps.LatLngBounds();
    this.markers = ko.observableArray([]);
    var l, ls, len, position, title, marker;
    ls = loadedJson.locations;
    len = ls.length;
    for(var i = 0; i < len; i++) {
      l = ls[i];
      position = l.location;
      title = l.title;
      marker = new Marker(position, i, title);
      this.markers.push(marker);
      this.bounds.extend(marker.position);
      marker.addListener('click', function() {
        setInfoWindowContent(this, this.infowindow);
      });
    }
    this.map.fitBounds(this.bounds);

    // Toggles showing of all listings
    this.listings = ko.observable(false);
    this.showListings = function () {
      var bounds = new google.maps.LatLngBounds();

      for(var i = 0; i < this.markers.length; i++){
        this.markers[i].setMap(this.map);
        bounds.extend(markers[i].position);

      }
      this.map.fitBounds(bounds);
    }.bind(this);

    this.hideListings = function() {
      for(var i = 0; i < this.markers.length; i++){
        this.markers[i].setMap(null);
      }
    }.bind(this);
    this.toggleListings = ko.computed(function(value){
      if(this.listings()){
        $('#toggle-listings').val('Hide Listings');
        this.showListings();
      }else {
        $('#toggle-listings').val('Show Listings');
        this.hideListings();
      }
    }.bind(this));
  };

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

setInfoWindowContent = function (marker, infowindow) {
  if (infowindow.marker != marker) {
    infowindow.marker = marker;
    infowindow.setContent('<div>'+marker.title+'</div>');
    infowindow.open(map, marker);
    infowindow.addListener('closeclick', function() {
      infowindow.setmarker(null);
    })
  }
}
