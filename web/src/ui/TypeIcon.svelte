<script module lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  // Every picture the BFF has answered with a 404, for the page's life. Each icon
  // used to remember only its own failure, so the same missing picture was asked
  // for again by every row that drew it and every time a window opened (a
  // reward list asked for one missing icon sixteen times per opening). Kept by
  // address and shared, so a picture known to be missing is drawn as its tile at
  // once, and a sibling still waiting on it gives up the moment one fails.
  //
  // A 404 stays true until the icon cache holds more: with auto-fill on the BFF
  // fetches a missing icon before it answers, so a 404 means it cannot be had.
  const failedSources = new SvelteSet<string>();

  /** The icon cache may hold more now (a pull started, auto-fill turned on): try every picture again. */
  export function forgetFailedIcons(): void {
    failedSources.clear();
  }
</script>

<script lang="ts">
  // ONE item icon, used by every panel that shows a thing (goal R27).
  //
  // Before R27 the app was entirely text, and the only icons anywhere were two
  // hand-rolled `<img>` tags inside the fitting window. This is the single
  // implementation they all now share — Overview, Inventory, the ore hold,
  // Market, Industry and Fitting.
  //
  // WHAT IT GUARANTEES
  //
  // 1. A FIXED BOX, ALWAYS. The picture and the fallback tile occupy exactly
  //    the same square, so a row is the same height before, during and after
  //    the image loads. Rows never jitter and the R8 reflow cards never
  //    reshuffle as icons arrive. This is the whole reason the box is a
  //    wrapper `<span>` with the size on IT rather than on the `<img>`.
  //
  // 2. IT NEVER SHOWS A BROKEN IMAGE. A null/absurd typeID never emits an
  //    `src` at all, and a 404 flips to the tile via `onerror`. The BFF mounts
  //    `/icon-cache` with `fallthrough: false` above the SPA catch-all, so a
  //    miss really is a 404 and `onerror` really does fire.
  //
  // 3. THE NAME, NEVER THE ID. `alt` (and the tile's `aria-label`) is the
  //    item's resolved name. R7d permits the typeID inside the `src` path —
  //    an asset path is not data shown to the player — but nothing rendered or
  //    spoken is ever a number. The name also stays visible next to the icon
  //    in every caller, so no information is carried by the icon alone.
  //
  // THE FALLBACK IS THE NORMAL CASE. `data/` is gitignored, so on a fresh
  // clone and in CI there is no cache at all and every single icon takes this
  // path. It is designed first and must always look deliberate.
  import { iconInitials, typeIconUrl } from "./typeIcons.ts";

  interface Props {
    /** The item's type. `null` (or anything absurd) goes straight to the tile. */
    typeID: number | null;
    /**
     * The item's already-resolved NAME. Used for `alt`, for the tile's spoken
     * label, and to derive the tile's letters. Callers pass the same string
     * they render beside the icon — an unresolved name arrives as "—" and
     * becomes a "?" tile, which is honest.
     */
    name: string;
    /**
     * The fixed box. `sm` for table rows, `md` for a heading, `lg` for the
     * ship at the centre of the fitting ring, `socket` for a fitting socket
     * (which grows with the R8 breakpoint along with the socket itself).
     */
    size?: "sm" | "md" | "lg" | "socket";
    /**
     * Overrides the tile's letters. The fitting window passes an abbreviated
     * module name here, because a socket has no visible name beside it — the
     * tile IS the label there, so it needs more than two characters.
     */
    fallbackText?: string | null;
    /**
     * A picture of its own in place of the type's icon: an owner's logo (eveIcon.LogoIcon's texture). It is shown in
     * the same box, and the tile stands where it cannot be had.
     */
    imageUrl?: string | null;
  }

  let { typeID, name, size = "sm", fallbackText = null, imageUrl = null }: Props = $props();

  /**
   * What the box shows: its own picture where it is given one, else the type's icon. A picture already known to be
   * missing (failedSources, above) is not asked for again. Keyed by the address rather than a flag on this instance,
   * so a row reused for a DIFFERENT item (Svelte reusing a DOM node across a keyed list update) tries that item's
   * picture instead of inheriting the previous one's failure.
   */
  const wanted = $derived(imageUrl ?? typeIconUrl(typeID));
  const src = $derived(wanted !== null && failedSources.has(wanted) ? null : wanted);
  const tileText = $derived(fallbackText ?? iconInitials(name));
</script>

<span class="type-icon type-icon-{size}">
  {#if src !== null}
    <img
      {src}
      alt={name}
      loading="lazy"
      decoding="async"
      onerror={() => {
        if (wanted !== null) failedSources.add(wanted);
      }}
    />
  {:else}
    <span class="type-icon-tile" role="img" aria-label={name}>{tileText}</span>
  {/if}
</span>
