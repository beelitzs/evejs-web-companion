"use strict";

// ── Whether this machine can run the native client layer ─────────────────────
//
// EVEJS_NATIVE_CLIENT=auto runs the layer where there is an install to run, and
// it can only run where its two add-ons can be had (docs/native-layer-optional-
// plan.md, 4a). Both are built on a pilot's first connection, not at start-up
// (scripts/build-native-preferences.js and build-native-clock.js), and the
// first failure is kept until the BFF restarts (clientPreferences.js ready):
// an install with no compiler would refuse every game-port login, as no install
// did before phase 1. So server.js asks here once, before any pilot connects,
// and runs the layer only where everything it will need is on the machine:
//
//   - Windows x64 (the add-ons and python27.dll are Windows x64 only);
//   - the install's tq/bin64/python27.dll and tq/code.ccp;
//   - a Python 3 at EVEJS_PYTHON, which takes the client's modules out of
//     code.ccp on every start (scripts/client-preferences-modules.py);
//   - each add-on already built for its sources as they are now, either in the
//     BFF's cache or shipped with the project (scripts/native-prebuilt,
//     native-prebuilt-binaries.js), or what its build needs: Node's headers and
//     node.lib in node-gyp's cache for this Node, and Visual Studio's x64 C++
//     tools (VsDevCmd.bat, found by vswhere).
//
// This finds what is there; it builds nothing and catches no failure of the
// layer itself. A layer this says can run and that then fails still fails.

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { nativePreferencesShipped, nativePreferencesTarget } = require("../../scripts/build-native-preferences");
const { nativeClockShipped, nativeClockTarget } = require("../../scripts/build-native-clock");

/** What the add-on builds need, as they look for it; null where it is all there, else what is missing. */
function toolchainMissing({ exists, run }) {
  const cache = path.join(os.homedir(), "AppData", "Local", "node-gyp", "Cache", process.versions.node);
  if (!exists(path.join(cache, "include", "node", "node_api.h")) || !exists(path.join(cache, "x64", "node.lib"))) {
    return `no Node ${process.versions.node} headers in node-gyp's cache (${cache})`;
  }
  const vswhere = path.join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (!exists(vswhere)) return "no Visual Studio (vswhere.exe)";
  let installation = "";
  try {
    installation = String(run(vswhere, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"])).trim();
  } catch {
    return "Visual Studio's installer could not be asked for its C++ tools";
  }
  if (!installation || !exists(path.join(installation, "Common7", "Tools", "VsDevCmd.bat"))) return "no Visual Studio x64 C++ tools";
  return null;
}

/**
 * Whether the native layer can run here: {ready, missing}, `missing` each thing it would need and does not have.
 * `preferencesCache` is where the BFF keeps the preference add-on (its data folder's native-preferences/bindings).
 */
function nativeClientReadiness({
  clientRoot,
  python = "python",
  preferencesCache,
  exists = fs.existsSync,
  run = (file, args) => childProcess.execFileSync(file, args, { windowsHide: true, timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] }),
  // Whether the project ships an add-on for its sources as they are now (each build's own *Shipped()).
  shipped = (find) => find() !== null,
} = {}) {
  const missing = [];
  if (process.platform !== "win32" || process.arch !== "x64") {
    return { ready: false, missing: ["Windows x64 (the add-ons and the client's python27.dll are Windows x64 only)"] };
  }
  for (const file of [["tq", "bin64", "python27.dll"], ["tq", "code.ccp"]]) {
    if (!exists(path.join(clientRoot, ...file))) missing.push(`the install's ${file.join("/")}`);
  }
  try {
    const said = String(run(python, ["-c", "import sys; print(sys.version_info[0])"])).trim();
    if (said !== "3") missing.push(`a Python 3 at EVEJS_PYTHON=${python} (it is Python ${said})`);
  } catch {
    missing.push(`a Python 3 at EVEJS_PYTHON=${python}`);
  }
  const unbuilt = [];
  if (!exists(nativePreferencesTarget({ cacheRoot: preferencesCache })) && !shipped(nativePreferencesShipped)) unbuilt.push("the preference add-on");
  if (!exists(nativeClockTarget()) && !shipped(nativeClockShipped)) unbuilt.push("the clock add-on");
  if (unbuilt.length > 0) {
    const toolchain = toolchainMissing({ exists, run });
    if (toolchain !== null) missing.push(`${unbuilt.join(" and ")} built, or what builds ${unbuilt.length > 1 ? "them" : "it"}: ${toolchain}`);
  }
  return { ready: missing.length === 0, missing };
}

module.exports = { nativeClientReadiness };
