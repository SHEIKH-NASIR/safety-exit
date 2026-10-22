import { Space } from "@mappedin/mappedin-js";

export function populateSpaceSelector(
  spaces: Space[],
  selectElement: HTMLSelectElement
) {
  // Clear existing options
  for (let i = selectElement.options.length - 1; i >= 0; i--) {
    selectElement.remove(i);
  }
  const spacesSortedByName = [...spaces].sort((a, b) =>
    a.name < b.name ? -1 : 1
  );
  spacesSortedByName.forEach((space) => {
    if (space.name) {
      const option = document.createElement("option");
      option.text = space.name ? space.name : space.id;
      option.value = space.id;
      option.id = `${selectElement.id}-${space.id}`;

      selectElement.add(option);
    }
  });
}
