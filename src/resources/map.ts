import { default as axios } from 'axios';
import { ApiOps, LogEntry, RubbishLocation } from '../common';

let map: google.maps.Map;

const attachLog = async (
  locationId: string | number,
  map: google.maps.Map
): Promise<void> => {
  if (!map.data.getFeatureById(locationId).getProperty('log')) {
    const res = await axios.get<ApiOps.Result<RubbishLocation>>(
      `/api/locations/${locationId}`
    );
    if (res.status === 200) {
      const location = res.data.data as RubbishLocation;
      console.log(`Got location ${JSON.stringify(location, null, 2)}`);
      map.data.getFeatureById(locationId).setProperty('log', location.log);
    }
  }
};

const loadLocations = async (map: google.maps.Map): Promise<void> => {
  const featuresIds: Array<string | number> = [];
  map.data.forEach((feature: google.maps.Data.Feature) => {
    if (feature.getId()) {
      featuresIds.push(feature.getId());
    }
  });

  try {
    const res = await axios.post<ApiOps.Result<ApiOps.RubbishLocations>>(
      `/api/locations/search?bounds=${JSON.stringify(
        map.getBounds().toJSON()
      )}&notIn=${JSON.stringify(featuresIds)}`
    );

    if (res.status === 200) {
      for (const loc of res.data.data as Array<RubbishLocation>) {
        if (!map.data.getFeatureById(loc.id)) {
          map.data
            .addGeoJson(loc.geojson)
            .forEach((feature: google.maps.Data.Feature) => {
              map.data.add(
                new google.maps.Data.Feature({
                  geometry: feature.getGeometry(),
                  id: loc.id,
                  properties: { log: loc.log }
                })
              );
            });
        }
      }
    } else {
      throw new Error(
        `Got unexpected response ${JSON.stringify(res, null, 2)}`
      );
    }
  } catch (err) {
    console.error(err);
  }
};

function initMap(): void {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: -34.397, lng: 150.644 },
    zoom: 8
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(position => {
      map.setCenter({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
    });
  }

  map.addListener('tilesloaded', function() {
    loadLocations(map);
  });
  map.data.addListener(
    'click',
    async (dataClick: google.maps.Data.MouseEvent) => {
      const div = document.createElement('div');

      await attachLog(dataClick.feature.getId(), map);

      for (const logEntry of dataClick.feature.getProperty('log')) {
        const entrySpan = document.createElement('span');
        entrySpan.innerHTML = `Description: ${logEntry.description}`;
        div.appendChild(entrySpan);
      }

      const popup = new google.maps.InfoWindow({
        content: div,
        position: dataClick.latLng
      });
      popup.open(map);
      map.data.addListener('click', () => {
        popup.close();
      });
    }
  );
}

function addLocation(): void {
  const button = this as HTMLButtonElement;
  button.setAttribute('style', 'display: none');
  const drawingManager: google.maps.drawing.DrawingManager = new google.maps.drawing.DrawingManager(
    {
      drawingMode: google.maps.drawing.OverlayType.POLYGON,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [google.maps.drawing.OverlayType.POLYGON]
      }
    }
  );

  const cancelBtn = document.getElementById('cancel-edit-btn');
  cancelBtn.setAttribute('style', '');
  cancelBtn.onclick = (): void => {
    drawingManager.setMap(null);
    button.setAttribute('style', '');
    cancelBtn.setAttribute('style', 'display: none');
  };

  drawingManager.setMap(map);
  google.maps.event.addListener(drawingManager, 'overlaycomplete', function(
    event: google.maps.drawing.OverlayCompleteEvent
  ) {
    if (event.type === google.maps.drawing.OverlayType.POLYGON) {
      const overlay: google.maps.Polygon = event.overlay as google.maps.Polygon;

      let locationFeature: google.maps.Data.Feature;
      console.log(
        `Overlay coords ${JSON.stringify(
          overlay.getPath().getArray(),
          null,
          2
        )}`
      );
      if (event.type === google.maps.drawing.OverlayType.POLYGON) {
        locationFeature = new google.maps.Data.Feature({
          geometry: new google.maps.Data.Polygon([overlay.getPath().getArray()])
        });
      }

      const formDiv = document.createElement('div');
      formDiv.setAttribute('id', 'edit-location-dialogue');
      formDiv.innerHTML =
        "<form onsubmit='saveLocation(this); return false;' action='/api/locations'><input type='text' placeholder='Entry description' name='logEntry', id='location-log-entry' /><input type='hidden' id='location-geojson' name='geojson' /><button type='submit'>Submit</button></form>";

      const popup = new google.maps.InfoWindow({
        content: formDiv,
        position: overlay.getPath().getArray()[
          overlay.getPath().getArray().length - 1
        ]
      });

      cancelBtn.onclick = (): void => {
        popup.close();
        map.data.remove(locationFeature);
        event.overlay.setVisible(false);
        drawingManager.setMap(null);
        button.setAttribute('style', '');
        cancelBtn.setAttribute('style', 'display: none');
      };

      popup.addListener('domready', () => {
        locationFeature.toGeoJson(function(geojson) {
          document
            .getElementById('location-geojson')
            .setAttribute('value', JSON.stringify(geojson));
        });
        document
          .getElementById('edit-location-dialogue')
          .getElementsByTagName('form')[0]
          .addEventListener('change', () => {
            locationFeature.setProperty('log', [
              {
                description: document
                  .getElementById('location-log-entry')
                  .getAttribute('value')
              }
            ]);
          });
        document
          .getElementById('edit-location-dialogue')
          .getElementsByTagName('form')[0]
          .addEventListener('submit', () => {
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

const saveLocation = async (form: HTMLFormElement): Promise<void> => {
  const fd = new FormData(form);

  const res = await axios.post<ApiOps.Result<ApiOps.RubbishLocationId>>(
    form.action,
    new RubbishLocation(JSON.parse(fd.get('geojson').toString()), [
      new LogEntry(fd.get('logEntry').toString())
    ]),
    {
      validateStatus: s => [200, 401, 403].includes(s)
    }
  );

  if (401 === res.status) {
    window.location.href = '/?authnViolation=true';
  } else if (403 === res.status) {
    window.location.href = '/?authzViolation=true';
  }
};

window.addEventListener('load', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).addLocation = addLocation;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).saveLocation = saveLocation;

  if (document.getElementById('login-btn')) {
    document.getElementById('login-btn').addEventListener('click', () =>
      axios.get('/login', {
        withCredentials: true
      })
    );
  }
  if (document.getElementById('logout-btn')) {
    document
      .getElementById('logout-btn')
      .addEventListener('click', () => axios.get('/logout'));
  }
  document
    .getElementById('add-location-btn')
    .addEventListener('click', addLocation);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).initMap = initMap;
