"use strict";

// Compile the native client layer's two add-ons from their sources as they are, and put them where the project ships
// them (scripts/native-prebuilt/<platform>-<arch>/, native-prebuilt-binaries.js): each binary, its licence, and a
// manifest naming the digest of the sources it was built from and the SHA-256 of its bytes. Run it on a machine with
// Visual Studio's x64 C++ tools and Node's headers, after any change to scripts/native-prefs or scripts/native-clock,
// and commit what it writes; a source changed without it is compiled on the BFF host as before.
//
//   npm run build:native-prebuilt

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BINDING: PREFERENCES_BINDING, buildNativePreferences, nativePreferencesDigest } = require("./build-native-preferences");
const { BINDING: CLOCK_BINDING, buildNativeClock, nativeClockDigest } = require("./build-native-clock");
const { MANIFEST_PATH, PREBUILT_DIRECTORY, readManifest, sha256 } = require("./native-prebuilt-binaries");

const LICENSES = Object.freeze({
  [PREFERENCES_BINDING]: path.join(__dirname, "..", "src", "gamePort", "clientPreferences-LICENSE.txt"),
  [CLOCK_BINDING]: path.join(__dirname, "..", "src", "gamePort", "clientClock-LICENSE.txt"),
});

async function buildPrebuilt() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "evejs-native-prebuilt-"));
  try {
    // Compiled here even where a binary is shipped already (prebuilt: false), each into a cache of its own.
    const built = {
      [PREFERENCES_BINDING]: { digest: nativePreferencesDigest(), ...(await buildNativePreferences({ cacheRoot: path.join(scratch, "prefs"), prebuilt: false })) },
      [CLOCK_BINDING]: { digest: nativeClockDigest(), ...(await buildNativeClock({ cacheRoot: path.join(scratch, "clock"), prebuilt: false })) },
    };
    fs.mkdirSync(PREBUILT_DIRECTORY, { recursive: true });
    const manifest = readManifest();
    for (const [binding, result] of Object.entries(built)) {
      const bytes = fs.readFileSync(result.target);
      fs.writeFileSync(path.join(PREBUILT_DIRECTORY, binding), bytes);
      fs.copyFileSync(LICENSES[binding], path.join(PREBUILT_DIRECTORY, binding.replace(/\.node$/, "-LICENSE.txt")));
      manifest[binding] = { digest: result.digest, sha256: sha256(bytes), napi: 8, builtWithNode: process.versions.node };
    }
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

module.exports = { buildPrebuilt };
if (require.main === module) {
  buildPrebuilt().then(
    (manifest) => console.log(JSON.stringify(manifest, null, 2)),
    (error) => { console.error(error.message); process.exitCode = 1; },
  );
}
