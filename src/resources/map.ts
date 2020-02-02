import { default as axios, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiOps, LogEntry, RubbishLocation } from '../common';

let map: google.maps.Map;

const is200 = (s: number): boolean => 200 === s;

const request: typeof axios.request = async <
  T = { [k: string]: object },
  R = AxiosResponse<T>
>(
  config: AxiosRequestConfig
): Promise<R> => {
  try {
    const response = await axios.request<T, R>({
      ...config,
      validateStatus: status => {
        if (401 === status) {
          window.location.href = '/?authnViolation=true';
        } else if (403 === status) {
          window.location.href = '/?authzViolation=true';
        } else {
          if (config.validateStatus) {
            return config.validateStatus(status);
          } else {
            return status >= 200 && status < 300;
          }
        }
      }
    });
    return response;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const attachLog = async (
  locationId: string | number,
  map: google.maps.Map
): Promise<void> => {
  if (!map.data.getFeatureById(locationId).getProperty('log')) {
    const res = await request({
      url: `/api/locations/${locationId}`,
      method: 'GET',
      validateStatus: is200
    });
    const location = res.data.data as RubbishLocation;
    console.log(`Got location ${JSON.stringify(location, null, 2)}`);
    map.data.getFeatureById(locationId).setProperty('log', location.log);
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
    const res = await request<ApiOps.Result<ApiOps.RubbishLocations>>({
      url: `/api/locations/search?bounds=${JSON.stringify(
        map.getBounds().toJSON()
      )}&notIn=${JSON.stringify(featuresIds)}`,
      method: 'POST',
      validateStatus: is200
    });

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

function attachPopup(
  drawingManager: google.maps.drawing.DrawingManager,
  button: HTMLButtonElement,
  overlay: google.maps.Marker | google.maps.Polygon,
  locationFeature: google.maps.Data.Feature
): void {
  const cancelBtn = document.getElementById('cancel-edit-btn');
  cancelBtn.setAttribute('style', '');
  cancelBtn.onclick = (): void => {
    drawingManager.setMap(null);
    button.setAttribute('style', '');
    cancelBtn.setAttribute('style', 'display: none');
  };

  const formDiv = document.createElement('div');
  formDiv.setAttribute('id', 'edit-location-dialogue');
  formDiv.innerHTML =
    "<form onsubmit='saveLocation(this); return false;' action='/api/locations'><input type='text' placeholder='Entry description' name='logEntry', id='location-log-entry' /><input type='hidden' id='location-geojson' name='geojson' /><button type='submit'>Submit</button></form>";

  const popup = new google.maps.InfoWindow({
    content: formDiv,
    position:
      overlay instanceof google.maps.Polygon
        ? overlay.getPath().getArray()[overlay.getPath().getArray().length - 1]
        : overlay.getPosition()
  });

  cancelBtn.onclick = (): void => {
    popup.close();
    map.data.remove(locationFeature);
    overlay.setVisible(false);
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
        overlay.setVisible(false);
        button.setAttribute('style', '');
        cancelBtn.setAttribute('style', 'display: none');
        map.data.add(locationFeature);
        drawingManager.setMap(null);
      });
  });
  popup.open(map);
}

function addLocation(): void {
  const button = this as HTMLButtonElement;
  button.setAttribute('style', 'display: none');
  const drawingManager: google.maps.drawing.DrawingManager = new google.maps.drawing.DrawingManager(
    {
      drawingMode: google.maps.drawing.OverlayType.MARKER,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [
          google.maps.drawing.OverlayType.MARKER,
          google.maps.drawing.OverlayType.POLYGON
        ]
      }
    }
  );

  drawingManager.setMap(map);
  google.maps.event.addListener(drawingManager, 'overlaycomplete', function(
    event: google.maps.drawing.OverlayCompleteEvent
  ) {
    let overlay: google.maps.Marker | google.maps.Polygon;
    let locationFeature;

    if (event.type === google.maps.drawing.OverlayType.MARKER) {
      overlay = event.overlay as google.maps.Marker;

      locationFeature = new google.maps.Data.Feature({
        geometry: overlay.getPosition()
      });
      console.log(
        `Overlay coords ${JSON.stringify(overlay.getPosition(), null, 2)}`
      );
    } else if (event.type === google.maps.drawing.OverlayType.POLYGON) {
      overlay = event.overlay as google.maps.Polygon;

      locationFeature = new google.maps.Data.Feature({
        geometry: new google.maps.Data.Polygon([overlay.getPath().getArray()])
      });
      console.log(
        `Overlay coords ${JSON.stringify(
          overlay.getPath().getArray(),
          null,
          2
        )}`
      );
    }

    attachPopup(drawingManager, button, overlay, locationFeature);
  });
}

async function saveLocation(form: HTMLFormElement): Promise<void> {
  const fd = new FormData(form);

  await request<ApiOps.Result<ApiOps.RubbishLocationId>>({
    method: 'POST',
    url: form.action,
    data: new RubbishLocation(JSON.parse(fd.get('geojson').toString()), [
      new LogEntry(fd.get('logEntry').toString())
    ]),
    validateStatus: is200
  });
}

window.addEventListener('load', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).addLocation = addLocation;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).saveLocation = saveLocation;

  if (document.getElementById('add-location-btn')) {
    document
      .getElementById('add-location-btn')
      .addEventListener('click', addLocation);
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).initMap = initMap;
