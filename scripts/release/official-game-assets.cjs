"use strict";

const MAX_OFFICIAL_ARCHIVE_BYTES = 256 * 1024 * 1024;

const officialGames = [
  {
    id: "meowthology.abyss-summoner",
    folder: "abyss-summoner",
    repository: "MeowthologySaga/abyss-summoner",
    tag: "v0.1.2",
    commit: "e4148c3ba0ec8a4de4246580b95ed6b5945047eb",
    version: "0.1.2",
    fileName: "abyss-summoner-0.1.2.lemgame",
    bytes: 59_780_734,
    archiveSha256: "04d9694da80d5d42817f3d32c007a89faf4a5d7a35ed0bdb6df4dffc3b82c156",
    packSha256: "0bde7bec159d2675d6ed4a4214f96276c9066934ced725b0ddde4e69dc45c819"
  },
  {
    id: "meowthology.cat-odyssey",
    folder: "cat-odyssey",
    repository: "MeowthologySaga/Cat_Odyssey",
    tag: "v0.1.1",
    commit: "233813f782732b8e282f38a26465be71c5579df4",
    version: "0.1.1",
    fileName: "cat-odyssey-0.1.1.lemgame",
    bytes: 99_372_443,
    archiveSha256: "a755ee3c74fe6f4d945969faf58b94f19ab4ab7f645ccf0ba7cab14686bbd5b3",
    packSha256: "6a5cbfa685061777f05ab17754e65e3bac19554387e810250ceb6bcc8a3ab0ad"
  },
  {
    id: "meowthology.drillheart-defense",
    folder: "drillheart-defense",
    repository: "MeowthologySaga/Drillheart_Defense",
    tag: "v0.2.0",
    commit: "debc714a83cda1cbe1550e99360ebccde1ec63cb",
    version: "0.2.0",
    fileName: "drillheart-defense-0.2.0.lemgame",
    bytes: 14_853_468,
    archiveSha256: "820b9c7447c897976bc3fa6d787647f7a3f0dc07c8e6d91b1e5291c55d39d423",
    packSha256: "d927ec4e0c7d1da8b095afc175ba705167667877ccb874d89ffb0d6ccc409576"
  }
];

validateOfficialGameDefinitions(officialGames);

module.exports = Object.freeze(
  officialGames.map((definition) => Object.freeze({ ...definition }))
);

function validateOfficialGameDefinitions(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new Error("At least one official game asset definition is required.");
  }
  const uniqueFields = ["id", "folder", "fileName"];
  for (const field of uniqueFields) {
    const values = definitions.map((definition) => definition[field]);
    if (new Set(values.map((value) => String(value).toLowerCase())).size !== values.length) {
      throw new Error(`Official game asset definitions contain a duplicate ${field}.`);
    }
  }
  for (const definition of definitions) {
    if (!/^[a-z0-9][a-z0-9._-]{1,127}$/.test(definition.id)) {
      throw new Error(`Invalid official game id: ${definition.id}`);
    }
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(definition.folder)) {
      throw new Error(`Invalid official game folder: ${definition.folder}`);
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(definition.repository)) {
      throw new Error(`Invalid official game repository: ${definition.repository}`);
    }
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(definition.version)) {
      throw new Error(`Invalid official game version: ${definition.version}`);
    }
    if (definition.tag !== `v${definition.version}`) {
      throw new Error(`Official game tag must match its version: ${definition.folder}`);
    }
    if (!/^[0-9a-f]{40}$/.test(definition.commit)) {
      throw new Error(`Official game commit must be a full lowercase Git SHA: ${definition.folder}`);
    }
    if (definition.fileName !== `${definition.folder}-${definition.version}.lemgame`) {
      throw new Error(`Official game filename must match its folder and version: ${definition.folder}`);
    }
    if (
      !Number.isSafeInteger(definition.bytes) ||
      definition.bytes <= 0 ||
      definition.bytes > MAX_OFFICIAL_ARCHIVE_BYTES
    ) {
      throw new Error(`Official game archive size is invalid: ${definition.fileName}`);
    }
    for (const field of ["archiveSha256", "packSha256"]) {
      if (!/^[0-9a-f]{64}$/.test(definition[field])) {
        throw new Error(`Official game ${field} must be a lowercase SHA-256: ${definition.fileName}`);
      }
    }
  }
}
