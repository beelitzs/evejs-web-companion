# Making the native client layer optional (B2)

Plan, 2026-10-28, approved by the operator the same day. **Done:** phases 1 and 2, phase 3, and phase 4's 4a, with
the results under each. 4b, prebuilt add-ons, is left for later. Every line reference was read in the code on master at `f73c7db2`; anything
inferred and not yet seen live is marked *inferred*.

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

**Done 2026-10-28.** The setting and the wiring are `4d37e5b5`. Seen live on a check BFF on 26512 with no client
root, whose start-up log says "Native client layer: off (no EVEJS_CLIENT_ROOT)":
- **Test Pilot:** logged in from the roster.
  - Fitting: took the 1MN Civilian Afterburner offline, unfitted it, moved it hangar to cargo and back, and fitted it
    again. CPU went 2 → 0 → 2 of 130 tf; the module came back online by itself.
  - Space: undocked and ran the afterburner, which settled at 525–526 m/s. Docked.
  - Travel: flew to New Caldari by the autopilot (warp, gate jump).
  - The market's order book for Antimatter Charge S was read.
  - Every Neocom window opened.
- **Test Two:** the test2 account signed in, its character selection (`GetCharacterSelectionData`, where B2 failed)
  listed three pilots, and Test Two came online docked.
- **No fault of the off mode was found:** no failed reply, no page error, nothing in the BFF's error log but the
  empty icon cache's 404s. Nothing was built or started for the native layer, and nothing was written under
  `native-*`.
- **Regression:** on 26510, with the install ("Native client layer: on"), the same fitting and flight steps gave
  the same numbers (CPU 2/130, 687 EHP, 525 m/s), and the native logs were written as before.
- **Seen, not caused by the mode (the same on both BFFs):**
  - The selection list wrote raw numbers. Fixed in `90d5cf2a`.
  - The HUD's capacitor stays at 100% while the afterburner cycles, where 5 GJ every 10 s on 125 GJ should hold it
    near 95%. On the release bug list as B37.
- **The install's absence shows only where phase 2 says:**
  - Skills say "The client's certified plans could not be read".
  - Corporation says its role data could not be read.
  - A UI texture answers 404.
  - The page's own fallback words stand in for the client's (the route's "Take off" for "remove waypoint").

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

**Done 2026-10-28** (`1b3e6134`). The table above was read from the code before phase 1. A sweep of every page reader that throws
when the install's data is missing (`available` false, "could not be read", "installed client") corrected it:

| Where | What the sweep found | Now, with no install |
|---|---|---|
| dogma-types (`/api/client-data/dogma-types`) | Every **Show Info** window stopped: it picks its kind by the type's category from here ("The information type's category could not be read"). The owner-type row and the fitting simulation row are the same route. | Answered from the SDE's tables of the same build, in the client loaders' shapes (`src/clientData/sdeBuiltData.js`). |
| chat rules | Start Conversation was never offered: its player check needs the three role bits and `groupCharacter`. | The four values as the client's code has them (`serviceConst.py`, `inventorycommon/const.py`). |
| `/api/names`, owner 1 | The owner record answered 503. | "EVE System", the install's English for `UI/Chat/ChatEngine/EveSystem`. |
| direct trades | Not the install's: volumes and type lists come from the SDE (`staticData`). | Unchanged. |
| corporation roles and races | The member views (query, role summary, edit member, administration) need the client's role tables. No source outside the install has them: neither the SDE nor EveJS. The race name is read in the edit-member dialog just before the roles, so it is moot without them. | Unchanged: install-only, listed below. |
| config flag spellings | Reached only when the server sets `banned_words_search_enabled`, which EveJS does not. | Unchanged. |
| asset search meta keywords | The keywords are the client's words, so they cannot be typed without the install. | Unchanged. |

The SDE stand-in was compared with the install of the same build, every row of every table it answers, on what the
route reads: 52,590 types, 3,411 effects and 2,855 attributes. Two corrections came from the comparison:
- the SDE leaves empty fields out, and the loaders give 0 (a radius 1);
- an attribute's default is a float32 in the client's file (`Math.fround` matched all 2,855).

What still differs:
- **Required skills:** the order of a type's required skills differs for 1,379 types. The client's table has its own
  order, and no simple rule from the SDE gives it (the best, Python 2 dict order, missed 111 types). The page's
  dogma picks up required-skill modifiers in that order, so a figure can differ in its last binary digit.
- **Radius:** three environment types have a radius of 0, not 1.
- **Empty rows:** the client keeps empty dogma and material rows for some types, which the route reads the same as no
  row.

Seen live on a check BFF on 26512 with no client root:
- **The routes, against 26510 with the install:** the dogma-types answers for 200 types across every category have
  the same digest once required skills are sorted. Their effects (229) and attributes (602) are identical.
- **Show Info:** opened from the market's type menu: "Antimatter Charge S · Item", the same body as on 26510.
- **The fitting window:** Test Pilot's Reaper shows the same figures in both modes (CPU 2/130, grid 1/24, the
  capacitor sustainable at 94.9%, 687 EHP, 341.0 m/s, a 6.98 s align). Only the words differ.
- **Chat:** Contacts offered Start Conversation for Test Two. A private room opened (`CreatePrivateChannel`, then the
  elevated `AddCharacterToChannel`) and a message went in. Test Two answered from 26510 into the same room, and both
  saw both messages and both members.
- **Owner 1:** the record and the display name are "EVE System" in both modes.
- **The BFF's error log:** only the empty icon cache's 404s, the second client's disconnect, and an NPC
  corporation's fitting collection refused. 26510 logs the same refusal for the same pilot, so it is the pilot's,
  not the mode's.

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

**Done 2026-10-28**, as recommended and approved the same day:
- **3a, `GetItemDescriptor` (`d0c3a3ec`).** The JS path now asks it where the client's `invCache` does: once, when
  a container's listing first needs the item header. That is in `List` after the remote listing and in `ListByFlags`
  before it, as the native storage's `begin()` stands. Tranquility asks it right after the ship's first listing
  ("Logging in then renaming ship", 1776 to 1777). Seen live on 26512: after `SelectCharacterID`, the first `List()`
  at 18:16:27.820, then `GetItemDescriptor` at .855, once.
  - *Measured, not changed:* the native path asks it earlier, during godma's preparation and before
    `SelectCharacterID` (call 14 of a login on 26510).
- **3b, the releases: fixed in EveJS, not imitated (eve.js `dc8fb1d29`, on `main`, not pushed by me).** The inferred
  line above was wrong. EveJS released a game-port session's bound objects only on `ClientHasReleasedTheseObjects`,
  and nothing released them when the session ended, so they stayed until EveJS restarted. Today's logs showed 56
  release notices freeing 192 objects, nearly all from the native path on 26510.
  - `ServiceManager.releaseSessionBoundObjects` now lets a session's objects go when its connection closes. An object
    another session still holds (a shared trade) stays until the last holder goes.
  - Seen live: Test Pilot going offline on 26512 logged "released 11 bound objects with the closed session".
  - The JS path still sends no release while a pilot is online. Retail's release follows Python's garbage
    collection, which the JS path has no counterpart for.

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

**4a, done 2026-10-28 (`1111370a`).** Before, `auto` ran the layer wherever a client root was set. The add-ons are
built on a pilot's first connection, and the first failure is kept until restart, so an install without Visual
Studio refused every game-port login. That was B2 again, by another cause.
- At start-up, before any pilot connects, `gamePort/nativeClientReadiness.js` now checks what the layer will need:
  - Windows x64;
  - the install's `python27.dll` and `code.ccp`;
  - a Python 3;
  - each add-on already built for its current sources, or what builds it: Node's headers in node-gyp's cache, and
    Visual Studio's x64 C++ tools.
- Where something is missing, the layer is off and the start-up log names what. It builds nothing and catches no
  failure of the layer itself.
- Seen live on a third BFF (26513) with the client root and Visual Studio hidden. Its log said "lacks the preference
  add-on built, or what builds it: no Visual Studio". test2's character selection listed its pilots, and Test Three
  came online. Nothing native was written, and the install's own tables were still read. 26510, with Visual Studio,
  still runs the layer.

**4b, prebuilt add-ons: not now** (recommended and approved 2026-10-28). Revisit if a release needs the native
layer's exact parity on machines without Visual Studio.

## What a BFF without the install gives up

This is for the release notes, so nobody mistakes it for the native path.
- **Parity:** godma is the JS mirror, not CCP's `StateManager`. The known edge cases are:
  - two attribute ids that share a name;
  - int versus float kinds, and default values;
  - Python's NaN and truth rules;
  - the original session checks on bound inventory objects.
- **The install's page data:** as listed in phase 2, and the corporation member views, which need the client's role
  tables. Show Info and the page's own dogma read the SDE instead, with the required-skill order noted there.
- **Other systems:** on Linux and macOS the off mode is the only mode (`python27.dll` is a Windows file). Whether the
  rest of the BFF runs there has not been checked.

## Decisions for the operator

1. **The setting:** `auto` plus `off` as above (recommended), or off unless asked for.
2. **Phase 3:** port the two wire messages to the JS path, or accept its wire as it was before 2026-10-21.
3. **Phase 4:** ship prebuilt add-ons, or leave the native layer to machines with Visual Studio.

Phases 1 and 2 needed no decision beyond approving this plan. All three are taken:
1. `auto` plus `off`, with the approval.
2. Phase 3, 2026-10-28: port `GetItemDescriptor`; fix the releases in EveJS rather than imitate them.
3. Phase 4, 2026-10-28: `auto` checks the machine (4a); no prebuilt add-ons for now (4b).

## Noticed, not part of this plan

- **Unused dogma port:** `clientDogmaConstruction.js`, `clientDogmaIM.js` and about 14 files that hang only off them
  (about 2,650 lines, from 2026-10-21's first phase) are required by nothing in `src`, `test` or `scripts`.
- **A rebuild was due:** the preference add-on sources hash to `a69936ae…`, which was not in the cache. 26510's next
  start rebuilt it (it is in `bffgp-data`'s cache now).
