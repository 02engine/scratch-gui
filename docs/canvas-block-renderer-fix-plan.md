# Canvas Blockly Renderer Fix Plan

## Final Goal

The newUI main workspace uses Canvas for all ordinary block painting while
Blockly remains the source of truth for the block graph, layout measurements,
connections, serialization, field editors, gestures, addons, and toolbox
behavior. The old UI remains on the native SVG path.

The final user-visible behavior must match native Scratch Blocks:

- block text, dropdown arrows, field boxes, icons, hats, shadows and custom
  block shapes are aligned with their native positions;
- clicking, editing fields, dragging stacks, reconnecting blocks, scrolling,
  zooming, context menus and toolbox insertion work normally;
- the main workspace contains no block SVG DOM nodes and does not use the SVG
  drag surface for ordinary block interaction;
- Canvas redraws and HTML/Blockly popups use one coordinate transform;
- no loading placeholder or stale SVG fragment is visible during normal use.

## Scope And Non-Goals

- Do not redesign the editor UI.
- Do not change the old UI renderer.
- Do not rewrite Scratch VM graph or addon APIs.
- The toolbox/flyout may remain native SVG because it is a separate palette,
  but no main-workspace block or drag preview may be rendered by SVG.
- Do not optimize by deleting Blockly's authoritative geometry or connection
  state. Canvas is a paint and hit-test surface over that state.

## Work Breakdown

### 1. Baseline And Coordinate Contract

Status: **completed**

Record native SVG and Canvas values for identical blocks: workspace transform,
block origin, block size, field origin/size, text baseline, dropdown arrow,
icon center, and connection offsets. Define the coordinate spaces explicitly:

1. block-local coordinates;
2. workspace coordinates;
3. client/screen coordinates.

Acceptance: one conversion path can translate any model node from block-local
coordinates to client coordinates without applying a parent transform twice.

Baseline recorded on the dedicated test page at scale 1:

- Canvas workspace transform: translate(310, 0), scale 1.
- Test block origin: (80, 80), size 143.15625 x 56.
- The when field geometry: (8, 8), size 38.25 x 32.
- Its text node is a direct child of the block model and has
  transform=translate(8, 8), x=19.125, y=2.
- Therefore the text node transform already contains the field anchor. Adding
  the field anchor again makes the compatibility rectangle eight pixels too
  far right and down.
- The same direct-child rule applies to direct field images and icons. Nodes
  nested below a field group use offsets relative to that field group.

### 2. Headless Block Shape Compiler

Status: **completed**

Use Blockly's layout algorithms with a virtual compatibility model only. The
model is not a DOM tree: no SVG element is inserted into the main workspace,
and Canvas consumes cached path strings, field metrics and icon primitives.
The compiler must prioritize the expanded viewport, keep a small render cache,
and never rebuild every root on each pointer move.

Implementation notes:

- `ModelCanvasBlockRenderer` keeps Blockly's model and connection graph as the
  source of truth.
- A lightweight projection walks every graph edge only to estimate positions;
  it does not initialize fields or run `renderCompute_` for offscreen blocks.
- The current viewport plus `VIEWPORT_MARGIN` is converted to a set of block
  IDs. Only that set (and explicitly forced blocks) enters the native shape
  compiler and Canvas scene.
- A viewport key invalidates the scene when pan, zoom, or workspace size
  changes. Old geometry is removed from hit-testing before the new scene is
  committed, so stale blocks cannot remain interactive.
- `getHeightWidth` falls back to cached estimates for blocks that have not yet
  been compiled. This keeps C-block and value-input layout calls bounded while
  the real geometry is built incrementally.

Acceptance: ordinary and 400-script test-page screenshots compile successfully;
the Canvas workspace reports zero main-workspace block SVG nodes, while the
reference SVG remains unchanged.

### 3. Field, Icon And Hat Painting

Status: **completed**

Use one field-local coordinate helper for Canvas painting and compatibility
rectangles. A field geometry already includes its block-local anchor; a child
node only contributes its coordinates relative to the field root. The hat path
uses the full native path bounds, including the negative Y curve.

Acceptance: the test-page screenshot shows matching field text, number boxes,
dropdown arrows, green-flag icons and complete hat curves. Field compatibility
nodes use the same field-local coordinate path as Canvas painting, so popup
positioning does not add the field anchor twice.

### 4. Blockly Gesture And Connection Handoff

Status: **completed**

Keep Blockly's WorkspaceSvg.getGesture, Gesture, BlockDragger,
RenderedConnection, and Field.showEditor_ contracts intact. Canvas event
capture must only provide a resolved block/field target and must not start a
gesture twice or bypass Blockly's normal event lifecycle.

Acceptance: body drag, stack drag, value connection, statement connection,
shadow replacement, dropdown editing, text editing, right-click context menu,
undo and redo all work without leaving currentGesture_ stuck.

### 5. Canvas Drag Surface And Flyout Handoff

Status: **completed**

The native flyout remains SVG, but once a block is created in the Canvas
workspace, BlockDragger moves it through Canvas state. The SVG drag surface
must never receive a virtual model node. A dragged stack is repainted on the
same Canvas every frame, while Blockly's connection manager and graph events
remain authoritative.

Acceptance: toolbox blocks never disappear when dragged into the workspace;
body drag, stack drag and connection previews remain visible continuously.

### 6. Culling And Repaint Stability

Status: **completed**

During drag, repaint the live drag position continuously and keep connection
highlighting responsive. Layout invalidation must not rebuild unrelated stacks
or recreate field nodes. Native flyout and scrollbars must remain interactive.

Acceptance: moving a block updates every animation frame, no grey SVG ghost or
loading overlay appears, and a large workspace remains responsive while a
nearby stack is materialized.

### 7. Regression Test And Build

Status: **completed with full-editor fixture verification pending**

Run the dedicated canvas-block-test.html page with ordinary, custom-shaped,
dropdown, icon, nested, and stress workspaces. Test the real
Impact - Asteroid Combat.sb3 through the development editor. Run lint,
git diff --check, and the development build.

Acceptance: no runtime errors, no main-workspace .blocklyBlockBackground SVG
nodes in Canvas mode, native UI unchanged, and all interactions above pass.

## Verification Matrix

| Area | Check | Expected result |
| --- | --- | --- |
| Geometry | Compare native and Canvas block/field rects | Difference stays within 1 CSS px after transform |
| Text | Labels, numbers, Chinese text, long labels | Same baseline and horizontal alignment |
| Dropdown | Open menu at several zoom levels | Popup is anchored to the visible field |
| Icons | Green flag, extension and comment icons | Icon is visible and clickable at native location |
| Drag | Move body and long stack | Position updates continuously; no ghost/overlay |
| Connect | Statement, value and shadow connection | Graph and visual position remain synchronized |
| Culling | Pan/zoom into an unloaded area | Blocks materialize without shifting completed blocks |
| Compatibility | Old UI and addons | Native SVG path and addon contracts remain intact |
| Performance | 400-block and Impact workspaces | No synchronous full-workspace rebuild per pointer move |

## Change Log

- [x] Plan document created.
- [x] Baseline coordinate measurements recorded.
- [x] Field/icon coordinate conversion corrected.
- [x] Viewport projection and incremental Canvas materialization implemented.
- [x] Missing workspace viewport bridge and estimated-size APIs implemented.
- [x] Development build and Canvas test-page visual smoke checks completed.
- [x] Canvas text painting now follows the native SVG text node's font,
  anchor, baseline and `dy` attributes instead of using a fixed centered font.
- [x] Nested projection estimates now include recursive value inputs and full
  statement stacks, with correct row-height accumulation and cache invalidation.
- [x] Visible C-blocks now materialize their input dependency closure before
  the Canvas geometry pass, then re-project positions after native measurement.
- [x] Gesture and connection handoff verified on the dedicated interaction
  page, including first flyout insertion, nested reporter drag-out and
  reconnection.
- [x] Development build and static checks completed for this checkpoint.

## Current Findings Log

### 2026-08-16

#### Current eight-issue repair

- [x] Match the native SVG text baseline and shadow-field editor bounds.
- [x] Prepare dragged and visible connection coordinates before the first
  flyout drag, and paint native replacement/input glows.
- [x] Keep recursive value-input descendants visible and hit-test the deepest
  nested block before its parents.
- [x] Use live Blockly theme colours for fields, including broadcast menus.
- [x] Stabilize stack dimensions so wheel scrolling and zooming do not change
  the workspace's horizontal content origin.
- [x] Make recursive size estimation linear through completed-node caching.
- [x] Prevent visible C blocks from synchronously materializing their complete
  offscreen statement stacks.
- [x] Verify the dedicated interaction page. The 7,236-block `main` target
  from `Impact - Asteroid Combat.sb3` was inspected and exercised through the
  lightweight fixture loader; final interaction verification remains in the
  full editor because the isolated VM does not register all project extension
  blocks.

Implementation rule: Canvas may defer painting, but Blockly's authoritative
block dimensions and connection coordinates must be available synchronously
before a gesture or workspace metric calculation reads them.

1. The renderer constructor already called `patchWorkspaceViewportMethods`,
   but the method was missing. The same was true for
   `getEstimatedHeightWidth`; this was a real incomplete-implementation bug,
   not a styling issue.
2. The previous layout task collected and natively rendered every block in a
   root before Canvas culling. The new task first projects approximate block
   rectangles, then compiles only the viewport set.
3. The Canvas test page renders ordinary blocks with `canvas SVG blocks 0` and
   keeps the reference SVG renderer unchanged. The green flag, hat curve, field
   labels, number fields and dropdown arrow were visually compared at scale 1.
4. The Impact test page can initially show an empty Canvas viewport after
   loading because its scripts occupy a very large coordinate space and the
   workspace preserves its current scroll position. This is not treated as a
   successful regression result yet; pan/scroll materialization remains part of
   the next verification stage.
5. The production async workspace-load completion now performs one
   `workspace.resizeContents()` after the complete graph is attached. This
   refreshes the new target's scrollbar content bounds without putting a
   resize/layout call in the pointer or animation-frame path.
6. The projection estimator includes connected statement/value dimensions,
   so an offscreen C-block still reserves enough approximate space for its
   nested stack before that stack becomes visible. It uses cached block
   dimensions only; it does not recursively invoke native rendering.
7. Canvas text was previously drawn with a fixed `500 16px` font and a forced
   `middle` baseline. That is not equivalent to Blockly SVG: truncated fields
   use a smaller font, FieldLabel and custom fields can use different anchors,
   and SVG `dy` contributes to the final baseline. The mismatch explains why
   text could look correct in one block and drift in another.
8. The text path now consumes the model text node after Blockly formats it,
   including truncation, non-breaking spaces and RTL markers. It reads
   `font-size`, `font-family`, `font-weight`, `text-anchor`,
   `dominant-baseline`, `dy` and `fill`, then maps SVG baseline semantics to
   Canvas. Field geometry still contributes the field-root transform exactly
   once; no block graph or native SVG layout contract was changed.
9. Verification on 2026-08-16: `npx eslint
   src/lib/model-canvas-block-renderer.js
   src/playground/canvas-block-test.js` passed; `git diff --check` passed;
   `npm run build:dev` completed successfully. The ordinary test screenshot
   kept text, numeric fields, dropdown arrows, green-flag icons and hat curves
   aligned with the reference SVG. The 100-script stress screenshot rendered
   without main-workspace block SVG nodes. The headless Impact smoke run loaded
   the fixture but ended before its asynchronous XML materialization completed
   (`pendingLayouts` remained nonzero), so it is intentionally not marked as a
   completed Impact interaction test.
10. The first nested-layout implementation had two independent correctness
    defects. Its value-input estimate added each child width to the current
    total without recursively measuring the child, and its statement estimate
    used `childHeight + STACK_HEIGHT - NOTCH_DEPTH` instead of Blockly's
    connected-stack height. Multiple statement rows were also collapsed with
    `Math.max` rather than summed. These errors are especially visible in
    imported projects with nested C blocks.
11. Estimate cache invalidation deleted `block.id`, while the actual keys were
    `block.id:fields` and `block.id:fields:stack`. That left stale imported
    dimensions alive after field, mutation and connection changes. The cache
    now clears all modes for the changed block and all of its ancestors; a
    full workspace invalidation clears the whole estimate cache.
12. Canvas layout now recursively estimates connected value reporters and
    statement stacks. A visible C block additionally materializes only its
    input dependency closure, including the next chain under statement inputs.
    After that native model pass, the root projection is rebuilt before
    geometry is committed, so nested children do not retain pre-measurement
    coordinates.
13. Broadcast menus use a `FieldVariable` inside an `event_broadcast_menu`
    shadow under an `INPUT_VALUE`, unlike direct variable fields. Hit testing
    now checks materialized interactive fields before block outlines, which
    prevents the parent broadcast block from consuming the menu click.
14. Verification on 2026-08-16: the renderer passed the repository ESLint
    rule set and `git diff --check`; `node ./node_modules/webpack/bin/webpack.js
    --colors --bail` completed successfully. Offline fixture inspection found
    195 blocks in `ai3D.sb3` and 7,498 blocks in `Impact - Asteroid Combat.sb3`,
    including 377 C blocks. Browser interaction for those fixtures remains a
    required manual check because this workspace has no installed Playwright
    package.

### 2026-08-17

#### Viewport loading restart fix

- [x] Keep Canvas model-node initialization inside the native compilation
  guard so it cannot invalidate and restart its own layout task.
- [x] Replace full-script synchronous layout from block/field rectangle queries
  with targeted materialization of the requested block and inline inputs.
- [x] Rotate unfinished visible roots between small animation-frame slices so
  one large script cannot keep neighboring scripts blank.
- [x] Re-run the Impact fixture, 400-block viewport-scroll test and first
  flyout-drag checks on the refreshed port 8601 development bundle.

The pre-fix Impact fixture exposed the restart directly: a 57-block isolated
workspace produced layout generation values above 8,000 after only a few
seconds. `BlockSvg.initSvg()` created lightweight Canvas nodes while the
renderer was still outside its internal compilation guard, and each node
invalidated the root being compiled. Compatibility `getBoundingClientRect()`
queries also called `ensureLayoutsForRoot(null, root)`, which disabled viewport
culling and synchronously compiled the complete root. Both paths are now
scoped to the internal pass or requested block respectively.

Runtime stack sampling found one additional self-invalidation path in field
measurement: `layoutModelBlock -> measureField -> FieldLabelSerializable.render_ -> CanvasModelNode.invalidate`.
Field measurement now uses the same internal
compilation guard. After that change the isolated Impact fixture completed with
zero pending tasks and a maximum stable generation of 69 instead of continuing
past 7,000. The 400-block fixture paints 26-32 blocks as the viewport moves,
while all 400 blocks remain in Blockly's graph. The loading indicator waits
120ms before appearing so ordinary edits do not flash a transient status card.
