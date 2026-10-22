import { MapData, MapView } from "@mappedin/mappedin-js";

const floorSelectElement = document.getElementById(
  "floorSelector"
)! as HTMLSelectElement;

export function populateFloorSelector(
  selectElement: HTMLSelectElement,
  mapData: MapData,
  mapView: MapView
) {
  // Clear existing options
  for (let i = selectElement.options.length - 1; i >= 0; i--) {
    selectElement.remove(i);
  }

  // Sort maps by elevation
  const floors = mapData
    .getByType("floor")
    .sort((a, b) => b.elevation - a.elevation);

  function onLevelChange(event: any) {
    const id = event.target.value;
    mapView.setFloor(id);
  }
  floorSelectElement.onchange = onLevelChange;

  // Add each floor as an option to the level select
  floors.forEach((floor) => {
    const option = document.createElement("option");
    option.text = floor.name;
    option.value = floor.id;

    floorSelectElement.add(option);
  });
  // Set the initial value of the level selector to the current map
  floorSelectElement.value = mapView.currentFloor.id;
}

export function setSelectedFloor(id: string) {
  floorSelectElement.value = id;
}
