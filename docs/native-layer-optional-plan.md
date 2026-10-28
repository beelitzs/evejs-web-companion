# Making the native client layer optional (B2)

Plan, 2026-10-28. A proposal for the operator's approval: no code has changed. Every line reference was read in the
code on master at `f73c7db2`; anything inferred and not yet seen live is marked *inferred*.

## The goal

The operator, 2026-10-27: "a pilot must be able to log in without a client install."

Done when a pilot logs in, undocks, fits and docks on a BFF with no client root and no C++ toolchain, and a BFF with
them behaves exactly as it does now.

## What the native layer is

For game-port pilots, the BFF loads the installed retail client's own `tq/bin64/python27.dll` and `tq/code.ccp`
into a Node add-on and runs CCP's own Python in it:
- the preference and boot settings;
- the session context and the remote-object releases;
- the logging graph and the tasklet timer;
- the dogma static service;
- godma's `StateManager`, the canonical store of the ship's attributes since 2026-10-21;
- the inventory header and its container storage.

A second add-on gives it the client's wallclock. Both add-ons compile on first use with Visual Studio's C++ tools.

It was built in about 53 hours, 2026-10-20 to 2026-10-23: about 80 commits, +16,860 lines.
- `src/gamePort/client*.js` (65 files, 7,794 lines).
- `scripts/native-prefs/` (C, and `bootstrap.py`, 2,911 lines).
- `scripts/native-clock/`.
- The wiring in `src/server.js` 220–352.

Its standard was the transport plan's ("identical to the retail client", `docs/game-port-transport-plan.md:35`). Its
last log entry calls full retail parity still unproved.

Separately, five client-data readers read the install for the page:
- `clientWords`: the client's words and dialog texts.
- `clientTextures`: UI images.
- `clientBuiltData`: about 45 FSD tables through the client's loader `.pyd` files.
- `clientConstants`.
- `clientNotificationFormats`.

These are built in `server.js` 382–409.

## Why a login fails today

`server.js` 220–352 builds the preferences provider and passes every native factory to `createGamePortPilots`,
whether or not `EVEJS_CLIENT_ROOT` is set. The first game-port connection fails like this:
1. `sessionOn` (`src/gamePort/pilots.js` 1233) calls `prepareNativeClientSession`.
2. That calls `createClientSessionOwners`, which calls `provider.createOwner()`, which calls `ready()`.
3. `ready()` throws "An installed client root is required for native preferences"
   (`src/gamePort/clientPreferences.js:107`).

The socket is closed before login, so this kills both the account line (`GetCharacterSelectionData`, character
creation) and the selection. The rejected promise is also kept until the BFF restarts (`clientPreferences.js:105`).

## Why this is smaller than it looks

- **The JS paths were never removed.**
  - Every native hook defaults to `null` (`pilots.js` 1134–1151, `pilotDogma.js` 308–318).
  - Every consumer is guarded. For example: `initializeNativeFreshness` returns null with no godma headers
    (`pilotDogma.js:356`), and inventory binds fall back to `locationBindParams` (`pilots.js` 5827–5834).
  - With null hooks, the pre-2026-10-20 code runs: the JS godma mirror, JS `InventoryItems`, `session.attributes`
    and `pilotClock`.
  - No file was deleted while the layer was built; each canonical-store commit says it keeps the "raw recording
    readers on their existing path".
- **The client-data readers already work without an install.** Each checks `available()` first and answers
  null. About 35 `/api/client-data/*` routes then answer `available: false`, and the page words what it can itself.
- **Until 2026-10-20 the BFF was install-optional by design.** `fb0f2fac` (2026-10-08) says of `EVEJS_CLIENT_ROOT`:
  "Unset, there are no words and nothing is read". The last commit where a game-port login needed no client root
  was `fa0c8f18`. The first that required one was `e08bffe3` (2026-10-21 14:58).

**The risk:** the null-hook paths have not run live since 2026-10-21. A week of features has been built and checked
with the native layer on, and some may assume its owners exist. Most of phase 1 is therefore a live sweep, not code.

## The design

### One setting, read once at start-up

`EVEJS_NATIVE_CLIENT`, with two values:
- **`auto`, the default:** the native layer is on when a client root is set, and off when none is.
- **`off`:** the native layer is off even with a client root. The client-data readers still use the install, so a
  machine with the client but no Visual Studio keeps the client's words and data.

The start-up log says which mode the BFF is in and why. There is no fallback while running. The native era refused
one deliberately (`ecf3513e`: "Failed native bootstrap requires a fresh host, not a fallback"), and that stays true:
a BFF in native mode whose layer fails still fails loudly, as now. The mode is chosen by configuration before any
pilot connects, never by catching a failure.

### Phase 1: a pilot logs in with no install (meets the done criterion)

1. **`server.js`.** In off mode, build no preferences provider and pass `null` for all 18 native values:
   - `prepareNativeClientSession`, `createNativeClientInventoryHeader`, `createNativeClientGodmaHeaders`;
   - `createNativeClientStaticConstructor`, `createNativeClientPreferences`;
   - `createNativeClientLog`, `createNativeClientLogModule`, `createNativeClientTaskletTimer`,
     `createNativeClientClock`;
   - the four static-data factories (`createNativeClientStatic{Attribute,Effect,Group,Load}Data`);
   - `nativeAttributeData`, `nativeEffectData`, `nativeTypeNames`, `nativeTypeAttributes` and
     `nativeClientStaticTypeData`.

   The last group matters: those readers read the install's tables and throw "not ready" without it, so they must
   go too, not only the DLL hooks. Null the static-data group together: `clientDogmaStaticLoadData.js:22` throws
   during `createPilotDogma` when its factory is given with no data. In native mode nothing changes.
2. **In off mode nothing native starts.** No add-on is built, no system Python is started for the native layer, and
   nothing is written under `data/native-preferences`, `data/native-clock` or `data/native-client-logs`.
3. **Live proof on a third check BFF on 26512**, started with no `EVEJS_CLIENT_ROOT`:
   - Test Pilot and Test Two each log in, open the selection, select, undock, fit a module, dock and log out.
   - Then the rotation areas that lean on dogma and inventory: fitting, the hangar and cargo moves, modules online
     and offline, the HUD's capacitor and shield, warp, gate, and the market.
   - The store is saved and restored around it, as in the bug pass.
   - Each fault found is fixed in its own commit.
4. **Regression on 26510, the BFF with the install.** The same flows, with the native logs written as before.

The wiring is one small commit. The sweep's fixes are the unknown part of this plan.

### Phase 2: the page's hard failures without the install

Most of the page already copes without install data. These places throw or refuse instead:

| Where | What fails | A source that needs no install |
|---|---|---|
| `web/src/app/api.ts:2000` (chat rules) | Chat cannot open: "The installed client's chat constants are unavailable." | `groupCharacter` is SDE group 1. The three role bits come from EveJS's own constants, never invented. |
| `src/server.js:14835` (`/api/names`, owner 1) | 503 `CLIENT_DATA_UNAVAILABLE` for the "EVE System" owner | EveJS's or the SDE's owner name |
| `web/src/app/flow.ts:16574` | Corp member view: the race name | SDE races |
| `web/src/app/directTrades.ts:197` | Direct trades: an item's volume | SDE types, as `staticData.js` already reads them |
| `web/src/app/flow.ts:4274` | An owner's type | SDE / `staticData.resolveNames` |
| `src/server.js` ~14368 | The fitting window's derived stats get no dogma types | SDE `typeDogma` and `dogmaEffects`, the same build (3396210) as the client |

The no-install source is used only when there is no install; with one, nothing changes.

The cosmetic gaps stay as they are, listed in the release notes:
- the client's own words and dialog texts (the page words what it can);
- UI textures (skill group icons and medals answer 404);
- built tables the SDE does not have: mission text, objectives, skill plans, expert systems and notification
  formats.

### Phase 3: the wire without the install (operator's choice)

The native path sends two things the JS path does not:
- **`invbroker.GetItemDescriptor`,** once per pilot, before the inventory header (`pilots.js:2006`). Porting it is
  easy: the answer is decoded by the JS marshal already.
- **`ClientHasReleasedTheseObjects`,** every 30 s (`session.js` 699–714), for the bound objects the client has let
  go. Porting it is moderate: retail releases when Python collects an object, so the JS path would have to release
  explicitly wherever it drops a bound object.

The BFF sent neither before 2026-10-21, and EveJS accepted that. *Inferred:* without the releases, EveJS keeps every
object bound for a pilot until the session ends, which matters for long sessions.

### Phase 4: an install but no compiler (optional)

Ship the two add-ons prebuilt:
- **Licences:** both are MIT, CCP Games (`src/gamePort/clientPreferences-LICENSE.txt`, `clientClock-LICENSE.txt`).
- **Node versions:** they are built for Node-API 8, so *inferred*, one binary loads on any current Node.
- **Dependencies:** they import only `KERNEL32.dll` and `node.exe`, so no runtime redistributable is needed.

Two catches:
- The cache key hashes the checked-out bytes: CRLF here, LF in git. A shipped binary needs a pinned digest, or a hash
  over normalised line endings.
- Both are Windows x64 only.

With phase 1's `off`, this is only for someone who wants the native layer without Visual Studio.

## What a BFF without the install gives up

This is for the release notes, so nobody mistakes it for the native path.
- **Parity:** godma is the JS mirror, not CCP's `StateManager`. The known edge cases are:
  - two attribute ids that share a name;
  - int versus float kinds, and default values;
  - Python's NaN and truth rules;
  - the original session checks on bound inventory objects.
- **The install's page data:** as listed in phase 2.
- **Other systems:** on Linux and macOS the off mode is the only mode (`python27.dll` is a Windows file). Whether the
  rest of the BFF runs there has not been checked.

## Decisions for the operator

1. **The setting:** `auto` plus `off` as above (recommended), or off unless asked for.
2. **Phase 3:** port the two wire messages to the JS path, or accept its wire as it was before 2026-10-21.
3. **Phase 4:** ship prebuilt add-ons, or leave the native layer to machines with Visual Studio.

Phases 1 and 2 need no decision beyond approving this plan.

## Noticed, not part of this plan

- **Unused dogma port:** `clientDogmaConstruction.js`, `clientDogmaIM.js` and about 14 files that hang only off them
  (about 2,650 lines, from 2026-10-21's first phase) are required by nothing in `src`, `test` or `scripts`.
- **A rebuild is due:** the current preference add-on sources hash to `a69936ae…`, which is not in the cache, so the
  next start with a client root rebuilds it. That is fine on this machine.
