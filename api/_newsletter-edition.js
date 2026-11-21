// Private edition catalogue. Only public metadata is copied to the browser.
import { metadata as metadata001, edition as edition001 } from "./_newsletter-edition-001.js";
import { metadata as metadata002, edition as edition002 } from "./_newsletter-edition-002.js";

export const editions = [
  { metadata: metadata002, edition: edition002 },
  { metadata: metadata001, edition: edition001 },
];
export const metadata = editions[0].metadata;
export const edition = editions[0].edition;
export const findEdition = (id) => editions.find((item) => item.metadata.id === id);
