var map;

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: -34.397, lng: 150.644 },
    zoom: 8
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function (position) {
      var pos = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      map.setCenter(pos);
    }, function () { });
  }

  map.addListener('tilesloaded', function (event) {
    var bounds = map.getBounds();
    console.log(`Map is dragged to ${JSON.stringify(bounds.toJSON())}`);
    loadLocations(map);
  });
  map.data.addListener('click', function (dataClick) {

    var div = document.createElement('div');

    attachLog(dataClick.feature.getId(), function () {
      for (var logEntry of dataClick.feature.getProperty('log')) {
        var entrySpan = document.createElement('span');
        entrySpan.innerHTML = `Description: ${logEntry.description}`;
        div.appendChild(entrySpan);
      }
    });

    var popup = new google.maps.InfoWindow({
      content: div,
      position: dataClick.latLng
    });
    popup.open(map);
    map.data.addListener('click', function (dataClick) {
      popup.close();
    });
  });
}

function addLocation(button) {
  button.setAttribute('style', 'display: none');
  var drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: google.maps.drawing.OverlayType.MARKER,
    drawingControl: true,
    drawingControlOptions: {
      position: google.maps.ControlPosition.TOP_CENTER,
      drawingModes: ['polygon', 'polyline']
    },
    markerOptions: { icon: 'https://developers.google.com/maps/documentation/javascript/examples/full/images/beachflag.png' },
    circleOptions: {
      fillColor: '#ffff00',
      fillOpacity: 1,
      strokeWeight: 5,
      clickable: false,
      editable: true,
      zIndex: 1
    }
  });

  var cancelBtn = document.getElementById('cancel-edit-btn');
  cancelBtn.setAttribute('style', '');
  cancelBtn.onclick = function () {
    drawingManager.setMap(null);
    button.setAttribute('style', '');
    cancelBtn.setAttribute('style', 'display: none');
  }

  drawingManager.setMap(map);
  google.maps.event.addListener(drawingManager, 'overlaycomplete', function (event) {
    if (event.type === 'polygon') {

      var locationFeature;
      console.log(`Overlay coords ${JSON.stringify(event.overlay.getPath().getArray(), null, 2)}`);
      if (event.type === 'polygon') {
        locationFeature = new google.maps.Data.Feature({ geometry: new google.maps.Data.Polygon([event.overlay.getPath().getArray()]) });
      }

      var formDiv = document.createElement('div');
      formDiv.setAttribute('id', 'edit-location-dialogue');
      formDiv.innerHTML = "<form onsubmit='saveLocation(this); return false;' action='/api/locations'><input type='text' placeholder='Entry description' name='logEntry', id='location-log-entry' /><input type='hidden' id='location-geojson' name='geojson' /><button type='submit'>Submit</button></form>";

      var popup = new google.maps.InfoWindow({
        content: formDiv,
        position: event.overlay.getPath().getArray()[event.overlay.getPath().getArray().length - 1]
      });

      var f = cancelBtn.onclick;
      cancelBtn.onclick = function () {
        popup.close();
        map.data.remove(locationFeature);
        event.overlay.setVisible(false);
        f();
      }

      popup.addListener('domready', function (ev) {
        locationFeature.toGeoJson(function (geojson) {
          document.getElementById('location-geojson').value = JSON.stringify(geojson);
        });
        document.getElementById('edit-location-dialogue').getElementsByTagName('form')[0].addEventListener('change', function (e) {
          locationFeature.setProperty('log', [{ description: document.getElementById('location-log-entry').value }]);
        });
        document.getElementById('edit-location-dialogue').getElementsByTagName('form')[0].addEventListener('submit', function (e) {
          popup.close();
          event.overlay.setVisible(false);
          button.setAttribute('style', '');
          cancelBtn.setAttribute('style', 'display: none');
          map.data.add(locationFeature);
          drawingManager.setMap(null);
        });
      });
      popup.open(map);
    }
  });
}

function saveLocation(form) {
  var fd = new FormData(form);
  var location = {
    geojson: JSON.parse(fd.get('geojson')),
    log: [{
      description: fd.get('logEntry')
    }]
  };
  console.log(`Sending poly data ${JSON.stringify(location, null, 2)}`);
  var xhr = new XMLHttpRequest();
  xhr.open('POST', form.action);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify(location));
}


function loadLocations(map) {
  var xhr = new XMLHttpRequest();
  var featuresIds = [];
  map.data.forEach(function (feature) {
    if (feature.getId()) {
      featuresIds.push(feature.getId());
    }
  });
  xhr.open('POST', `/api/locations/search?bounds=${JSON.stringify(map.getBounds().toJSON())}&notIn=${JSON.stringify(featuresIds)}`);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
      var locations = JSON.parse(xhr.responseText).data;
      console.log(`Got locations ${JSON.stringify(locations, null, 2)}`);
      for (var loc of locations) {
        if (!map.data.getFeatureById(loc.id)) {
          map.data.addGeoJson(loc.geojson).forEach((feature) => {
            map.data.add({
              geometry: feature.getGeometry(),
              id: loc.id,
              properties: {log: loc.log}
            });
          });
        }
      }
    }
  };
  xhr.send();
}

function attachLog(locationId, cb) {
  if (!map.data.getFeatureById(locationId).getProperty('log')) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', `/api/locations/${locationId}`);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
        var location = JSON.parse(xhr.responseText).data;
        console.log(`Got location ${JSON.stringify(location, null, 2)}`);
        map.data.getFeatureById(locationId).setProperty('log', location.log ? location.log : []);
        cb();
      }
    };
    xhr.send();
  } else {
    cb();
  }
}