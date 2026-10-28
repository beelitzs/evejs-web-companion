"use strict";

// The native client layer's two add-ons as the project ships them, compiled
// (docs/native-layer-optional-plan.md, 4b), so a BFF host with the client
// installed and no Visual Studio still runs the layer.
//
// They are kept in scripts/native-prebuilt/<platform>-<arch>/, with a
// manifest that names, for each, the digest of the sources it was built from
// and the SHA-256 of its own bytes. A build that finds the shipped binary of its
// sources as they are now, its bytes as recorded, uses that one and needs no
// compiler; sources changed since are compiled as before. `npm run
// build:native-prebuilt` makes them again from the sources as they are.
//
// A source's digest is taken over its bytes as git keeps them (LF): a Windows
// checkout writes CRLF, and the same sources must find the same binary there.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PREBUILT_DIRECTORY = path.join(__dirname, "native-prebuilt", `${process.platform}-${process.arch}`);
const MANIFEST_PATH = path.join(PREBUILT_DIRECTORY, "manifest.json");

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

/** A source's bytes as git keeps them: CRLF read as LF, nothing else changed. */
function asCommitted(bytes) {
  return Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return {};
  }
}

/** The shipped binary `fileName`, where it was built from sources of `digest` and its bytes are as recorded; else null. */
function shippedBinary(fileName, digest) {
  const entry = readManifest()[fileName];
  if (!entry || entry.digest !== digest) return null;
  const file = path.join(PREBUILT_DIRECTORY, fileName);
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return null;
  }
  return sha256(bytes) === entry.sha256 ? file : null;
}

/**
 * Put a shipped binary at a build's own cached `target`, as a finished build publishes one: copied beside it, then
 * hard-linked into place, so another BFF never loads a half-written file and a concurrent publisher's stays.
 */
function publishShipped(shipped, target) {
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true });
  const staged = path.join(directory, `shipped-${process.pid}-${Date.now()}.node`);
  fs.copyFileSync(shipped, staged);
  try {
    fs.linkSync(staged, target);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  } finally {
    fs.rmSync(staged, { force: true });
  }
}

module.exports = { MANIFEST_PATH, PREBUILT_DIRECTORY, asCommitted, publishShipped, readManifest, sha256, shippedBinary };
