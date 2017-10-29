import 'googlemaps';
import * as Ax from 'axios';
import { ApiOps, LogEntry, RubbishLocation } from '../common';

const axios = Ax.default;
let map: google.maps.Map;

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

  map.addListener('tilesloaded', function () {
    var bounds: google.maps.LatLngBounds = map.getBounds();
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

function addLocation(button: HTMLButtonElement) {
  button.setAttribute('style', 'display: none');
  var drawingManager: google.maps.drawing.DrawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: google.maps.drawing.OverlayType.POLYGON,
    drawingControl: true,
    drawingControlOptions: {
      position: google.maps.ControlPosition.TOP_CENTER,
      drawingModes: [google.maps.drawing.OverlayType.POLYGON]
    },
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
  google.maps.event.addListener(drawingManager, 'overlaycomplete', function (event: google.maps.drawing.OverlayCompleteEvent) {
    if (event.type === google.maps.drawing.OverlayType.POLYGON) {

      const overlay: google.maps.Polygon = event.overlay as google.maps.Polygon;

      var locationFeature: google.maps.Data.Feature;
      console.log(`Overlay coords ${JSON.stringify(overlay.getPath().getArray(), null, 2)}`);
      if (event.type === google.maps.drawing.OverlayType.POLYGON) {
        locationFeature = new google.maps.Data.Feature({ geometry: new google.maps.Data.Polygon([overlay.getPath().getArray()]) });
      }

      var formDiv = document.createElement('div');
      formDiv.setAttribute('id', 'edit-location-dialogue');
      formDiv.innerHTML = "<form onsubmit='saveLocation(this); return false;' action='/api/locations'><input type='text' placeholder='Entry description' name='logEntry', id='location-log-entry' /><input type='hidden' id='location-geojson' name='geojson' /><button type='submit'>Submit</button></form>";

      var popup = new google.maps.InfoWindow({
        content: formDiv,
        position: overlay.getPath().getArray()[overlay.getPath().getArray().length - 1]
      });

      cancelBtn.onclick = function (this: HTMLElement, ev: MouseEvent) {
        popup.close();
        map.data.remove(locationFeature);
        event.overlay.setVisible(false);
        drawingManager.setMap(null);
        button.setAttribute('style', '');
        cancelBtn.setAttribute('style', 'display: none');
      }

      popup.addListener('domready', function (ev) {
        locationFeature.toGeoJson(function (geojson) {
          document.getElementById('location-geojson').setAttribute('value', JSON.stringify(geojson));
        });
        document.getElementById('edit-location-dialogue').getElementsByTagName('form')[0].addEventListener('change', function (e) {
          locationFeature.setProperty('log', [{ description: document.getElementById('location-log-entry').getAttribute('value') }]);
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

function saveLocation(form: HTMLFormElement) {
  var fd = new FormData(form);

  console.log(`Sending poly data ${JSON.stringify(location, null, 2)}`);
  axios.post(form.action, new RubbishLocation(JSON.parse(fd.get('geojson').toString()), [new LogEntry(fd.get('logEntry').toString())]));
}

function loadLocations(map: google.maps.Map) {
  var xhr = new XMLHttpRequest();
  var featuresIds: Array<string | number> = [];
  map.data.forEach(function (feature: google.maps.Data.Feature) {
    if (feature.getId()) {
      featuresIds.push(feature.getId());
    }
  });

  axios.post<ApiOps.Result>(`/api/locations/search?bounds=${JSON.stringify(map.getBounds().toJSON())}&notIn=${JSON.stringify(featuresIds)}`)
    .then((res: Ax.AxiosResponse<ApiOps.Result>) => {
      if (res.status === 200) {
        for (var loc of res.data.data as Array<RubbishLocation>) {
          if (!map.data.getFeatureById(loc.id)) {
            map.data.addGeoJson(loc.geojson).forEach((feature: google.maps.Data.Feature) => {
              map.data.add(new google.maps.Data.Feature({
                geometry: feature.getGeometry(),
                id: loc.id,
                properties: { log: loc.log }
              }));
            });
          }
        }
      } else {
        throw new Error(`Got unexpected response ${JSON.stringify(res, null, 2)}`);
      }
    })
    .catch((err: Error) => {
      console.error(err);
    });
}

function attachLog(locationId: string | number, cb: () => void) {
  if (!map.data.getFeatureById(locationId).getProperty('log')) {
    axios.get<ApiOps.Result>(`/api/locations/${locationId}`)
      .then((res: Ax.AxiosResponse<ApiOps.Result>) => {
        if (res.status === 200) {
          var location = res.data.data as RubbishLocation;
          console.log(`Got location ${JSON.stringify(location, null, 2)}`);
          map.data.getFeatureById(locationId).setProperty('log', location.log);
          cb();
        }
      });
  } else {
    cb();
  }
}

(<any>window).initMap = initMap;