import './import-first';

import JSZip from '@turbowarp/jszip';
import VM from 'scratch-vm';
import VMScratchBlocks from '../lib/blocks';
import LazyScratchBlocks from '../lib/tw-lazy-scratch-blocks';
import CanvasBlockRenderer from '../lib/model-canvas-block-renderer';

const TEST_XML = `
<xml>
  <block type="event_whenflagclicked" x="80" y="80">
    <next>
      <block type="control_repeat">
        <value name="TIMES"><shadow type="math_number"><field name="NUM">10</field></shadow></value>
        <statement name="SUBSTACK">
          <block type="motion_movesteps">
            <value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value>
            <next>
              <block type="looks_sayforsecs">
                <value name="MESSAGE"><shadow type="text"><field name="TEXT">Canvas test</field></shadow></value>
                <value name="SECS"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
              </block>
            </next>
          </block>
        </statement>
      </block>
    </next>
  </block>
  <block type="event_whenkeypressed" x="520" y="120">
    <field name="KEY_OPTION">space</field>
    <next>
      <block type="control_if">
        <value name="CONDITION">
          <block type="operator_equals">
            <value name="OPERAND1"><shadow type="text"><field name="TEXT">a</field></shadow></value>
            <value name="OPERAND2"><shadow type="text"><field name="TEXT">a</field></shadow></value>
          </block>
        </value>
      </block>
    </next>
  </block>
  <block type="event_whenflagclicked" x="120" y="500">
    <next>
      <block type="looks_say">
        <value name="MESSAGE"><shadow type="text"><field name="TEXT">variable test</field></shadow></value>
      </block>
    </next>
  </block>
  <block type="event_broadcast" x="520" y="500">
    <value name="BROADCAST_INPUT">
      <shadow type="event_broadcast_menu">
        <field name="BROADCAST_OPTION" variabletype="broadcast_msg">message1</field>
      </shadow>
    </value>
  </block>
  <block type="event_whenbroadcastreceived" x="760" y="500">
    <field name="BROADCAST_OPTION" variabletype="broadcast_msg">message1</field>
  </block>
  <block type="looks_say" x="760" y="650">
    <value name="MESSAGE">
      <block type="operator_add">
        <value name="NUM1"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
        <value name="NUM2">
          <block type="operator_add">
            <value name="NUM1"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
            <value name="NUM2">
              <block type="operator_add">
                <value name="NUM1"><shadow type="math_number"><field name="NUM">3</field></shadow></value>
                <value name="NUM2"><shadow type="math_number"><field name="NUM">4</field></shadow></value>
              </block>
            </value>
          </block>
        </value>
      </block>
    </value>
  </block>
</xml>`;

const escapeXml = value => String(typeof value === 'undefined' || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const primitiveTypes = {
    4: ['math_number', 'NUM'],
    5: ['math_positive_number', 'NUM'],
    6: ['math_whole_number', 'NUM'],
    7: ['math_integer', 'NUM'],
    8: ['math_angle', 'NUM'],
    9: ['colour_picker', 'COLOUR'],
    10: ['text', 'TEXT'],
    11: ['event_broadcast_menu', 'BROADCAST_OPTION'],
    12: ['data_variable', 'VARIABLE'],
    13: ['data_listcontents', 'LIST']
};

const fieldVariableTypes = {
    BROADCAST_OPTION: 'broadcast_msg',
    LIST: 'list'
};

const primitiveToXml = (primitive, options = {}) => {
    if (!Array.isArray(primitive) || !primitiveTypes[primitive[0]]) return '';
    const [type, fieldName] = primitiveTypes[primitive[0]];
    const variableType = primitive[0] === 11 ? ' variabletype="broadcast_msg"' :
        (primitive[0] === 13 ? ' variabletype="list"' : '');
    const fieldId = primitive[2] ? ` id="${escapeXml(primitive[2])}"` : '';
    const tagName = options.topLevel ? 'block' : 'shadow';
    const id = options.id ? ` id="${escapeXml(options.id)}"` : '';
    const position = options.topLevel ?
        ` x="${escapeXml(primitive[3] || 0)}" y="${escapeXml(primitive[4] || 0)}"` : '';
    return `<${tagName} type="${type}"${id}${position}><field name="${fieldName}"${fieldId}` +
        `${variableType}>${escapeXml(primitive[1])}</field></${tagName}>`;
};

const mutationToXml = mutation => {
    if (!mutation || typeof mutation !== 'object') return '';
    const tagName = mutation.tagName || 'mutation';
    const attrs = Object.keys(mutation)
        .filter(key => key !== 'tagName' && key !== 'children')
        .map(key => {
            let value = mutation[key];
            if (key === 'blockInfo' && typeof value !== 'string') value = JSON.stringify(value);
            return ` ${key}="${escapeXml(value)}"`;
        })
        .join('');
    const children = Array.isArray(mutation.children) ? mutation.children.map(mutationToXml).join('') : '';
    return `<${tagName}${attrs}>${children}</${tagName}>`;
};

const blockRefToXml = (ref, blocks, stack) => {
    if (Array.isArray(ref)) return primitiveToXml(ref);
    if (typeof ref !== 'string' || !blocks[ref] || stack.has(ref)) return '';
    // The two helpers are mutually recursive for nested input blocks.
    // eslint-disable-next-line no-use-before-define
    return blockToXml(ref, blocks, stack);
};

const blockToXml = (id, blocks, parentStack = new Set(), topLevel = false) => {
    const serialized = blocks[id];
    if (!serialized) return '';
    if (Array.isArray(serialized)) return primitiveToXml(serialized, {id, topLevel});
    if (typeof serialized !== 'object') return '';

    const stack = new Set(parentStack);
    stack.add(id);
    const tagName = serialized.shadow ? 'shadow' : 'block';
    const opcode = serialized.opcode || '';
    const position = serialized.topLevel ?
        ` x="${escapeXml(serialized.x || 0)}" y="${escapeXml(serialized.y || 0)}"` : '';
    let xml = `<${tagName} id="${escapeXml(id)}" type="${escapeXml(opcode)}"${position}>`;
    xml += mutationToXml(serialized.mutation);

    for (const [name, input] of Object.entries(serialized.inputs || {})) {
        if (!Array.isArray(input) || input.length < 2) continue;
        const inputType = input[0];
        const blockRef = input[1];
        const shadowRef = input[2];
        const blockXml = inputType === 3 ? blockRefToXml(blockRef, blocks, stack) :
            blockRefToXml(blockRef, blocks, stack);
        const shadowXml = inputType === 3 ? blockRefToXml(shadowRef, blocks, stack) :
            (inputType === 1 ? '' : '');
        if (blockXml || shadowXml) {
            xml += `<value name="${escapeXml(name)}">${blockXml}${shadowXml}</value>`;
        }
    }

    for (const [name, field] of Object.entries(serialized.fields || {})) {
        const value = Array.isArray(field) ? field[0] : field;
        const idAttribute = Array.isArray(field) && field[1] ?
            ` id="${escapeXml(field[1])}"` : '';
        const variableType = fieldVariableTypes[name] ?
            ` variabletype="${fieldVariableTypes[name]}"` : '';
        xml += `<field name="${escapeXml(name)}"${idAttribute}${variableType}>` +
            `${escapeXml(value)}</field>`;
    }

    if (serialized.next) xml += `<next>${blockRefToXml(serialized.next, blocks, stack)}</next>`;
    return `${xml}</${tagName}>`;
};

const isStatementInput = name => /^SUBSTACK\d*$/.test(name);

const getReferencedBlockIds = blocks => {
    const referenced = new Set();
    for (const block of Object.values(blocks)) {
        if (!block || Array.isArray(block)) continue;
        if (block.next) referenced.add(block.next);
        for (const input of Object.values(block.inputs || {})) {
            if (!Array.isArray(input)) continue;
            for (const value of input.slice(1)) {
                if (typeof value === 'string') referenced.add(value);
            }
        }
    }
    return referenced;
};

const getReachableBlockIds = (roots, blocks) => {
    const reachable = new Set();
    const visit = id => {
        if (typeof id !== 'string' || reachable.has(id) || !blocks[id]) return;
        const block = blocks[id];
        reachable.add(id);
        if (Array.isArray(block)) return;
        visit(block.next);
        for (const input of Object.values(block.inputs || {})) {
            if (!Array.isArray(input)) continue;
            for (const value of input.slice(1)) visit(value);
        }
    };
    roots.forEach(root => visit(root.id));
    return reachable;
};

const getMissingReferences = blocks => {
    const missing = getReferencedBlockIds(blocks);
    for (const id of Object.keys(blocks)) missing.delete(id);
    return missing;
};

const getBlockUsage = blocks => {
    const usage = new Map();
    const mark = (id, kind) => {
        if (typeof id !== 'string') return;
        const value = usage.get(id) || {usedAsValue: false, usedAsStatement: false};
        value[kind] = true;
        usage.set(id, value);
    };
    for (const block of Object.values(blocks)) {
        if (!block || Array.isArray(block)) continue;
        mark(block.next, 'usedAsStatement');
        for (const [name, input] of Object.entries(block.inputs || {})) {
            if (!Array.isArray(input)) continue;
            for (const id of input.slice(1)) {
                mark(id, isStatementInput(name) ? 'usedAsStatement' : 'usedAsValue');
            }
        }
    }
    return usage;
};

const registerBenchmarkBlockDefinitions = (ScratchBlocks, blocks) => {
    const usageById = getBlockUsage(blocks);
    const specifications = new Map();
    for (const [id, block] of Object.entries(blocks)) {
        if (!block || Array.isArray(block) || !block.opcode) continue;
        const registered = ScratchBlocks.Blocks[block.opcode];
        if (registered && !registered.__02BenchmarkFallback) continue;
        const specification = specifications.get(block.opcode) || {
            fields: new Map(),
            inputs: new Map(),
            usedAsValue: false,
            usedAsStatement: false
        };
        for (const [name, field] of Object.entries(block.fields || {})) {
            if (!specification.fields.has(name)) specification.fields.set(name, field);
        }
        for (const name of Object.keys(block.inputs || {})) {
            specification.inputs.set(name, isStatementInput(name));
        }
        const usage = usageById.get(id);
        if (usage) {
            specification.usedAsValue = specification.usedAsValue || usage.usedAsValue;
            specification.usedAsStatement = specification.usedAsStatement || usage.usedAsStatement;
        }
        specifications.set(block.opcode, specification);
    }

    for (const [opcode, specification] of specifications) {
        ScratchBlocks.Blocks[opcode] = {
            __02BenchmarkFallback: true,
            init () {
                const fields = Array.from(specification.fields.entries());
                const inputs = Array.from(specification.inputs.entries());
                const fieldInput = fields.length ? this.appendDummyInput('__benchmark_fields') : null;
                for (const [name, field] of fields) {
                    const value = Array.isArray(field) ? field[0] : field;
                    const FieldTextInput = ScratchBlocks.FieldTextInput || ScratchBlocks.Field;
                    if (fieldInput && FieldTextInput) {
                        fieldInput.appendField(new FieldTextInput(String(value || '')), name);
                    } else if (fieldInput) {
                        fieldInput.appendField(String(value || ''), name);
                    }
                }
                for (const [name, statement] of inputs) {
                    if (statement) this.appendStatementInput(name);
                    else this.appendValueInput(name);
                }
                this.setInputsInline(true);
                this.setColour('#777777');
                if (specification.usedAsValue && !specification.usedAsStatement) {
                    this.setOutput(true);
                } else {
                    this.setPreviousStatement(true);
                    this.setNextStatement(true);
                }
            }
        };
    }
    return specifications.size;
};

const getScriptLength = (rootId, blocks) => {
    const visited = new Set();
    let current = rootId;
    while (current && blocks[current] && !visited.has(current)) {
        visited.add(current);
        const block = blocks[current];
        current = Array.isArray(block) ? null : block.next;
    }
    return visited.size;
};

const projectTargetToTestXml = (project, targetName) => {
    const target = (project.targets || []).find(item => item.name === targetName);
    if (!target) throw new Error(`Target "${targetName}" was not found in the SB3`);
    const blocks = target.blocks || {};
    let roots = Object.entries(blocks)
        .filter(([, block]) => block &&
            (Array.isArray(block) || block.topLevel))
        .map(([id]) => ({id, length: getScriptLength(id, blocks)}));
    if (!roots.length) throw new Error(`Target "${targetName}" has no top-level scripts`);
    const reachable = getReachableBlockIds(roots, blocks);
    const orphanIds = Object.keys(blocks).filter(id => !reachable.has(id) &&
        blocks[id] && !Array.isArray(blocks[id]));
    if (orphanIds.length) {
        // A valid SB3 should not contain orphan blocks. Loading them as
        // temporary roots keeps the benchmark honest and exposes malformed
        // graph data instead of silently dropping it from the comparison.
        roots = roots.concat(orphanIds.map(id => ({id, length: getScriptLength(id, blocks), orphan: true})));
    }
    const body = roots.map(root => blockToXml(root.id, blocks, new Set(), true)).join('');
    const missingReferences = getMissingReferences(blocks);
    return {
        xml: `<xml xmlns="http://www.w3.org/1999/xhtml">${body}</xml>`,
        targetName,
        totalBlockCount: Object.keys(blocks).length,
        selectedScriptCount: roots.length,
        selectedScriptLengths: roots.map(root => root.length),
        selectedBlockCount: reachable.size,
        reachableBlockCount: reachable.size,
        orphanBlockCount: orphanIds.length,
        missingReferenceCount: missingReferences.size,
        missingReferences: Array.from(missingReferences),
        blocks
    };
};

const workspaceOptions = {
    media: '/static/blocks-media/default/',
    zoom: {
        controls: true,
        wheel: true,
        startScale: 1
    },
    grid: {
        spacing: 40,
        length: 2,
        colour: '#ddd'
    },
    comments: true,
    collapse: false,
    sounds: false
};

const canvasWorkspaceOptions = {
    ...workspaceOptions,
    canvasRenderer: true
};

const style = document.createElement('style');
style.textContent = `
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px sans-serif; color: #333; background: #eef3f7; }
    header {
        min-height: 54px; display: flex; align-items: center; gap: 10px;
        padding: 8px 18px; background: #00baad; color: #fff; flex-wrap: wrap;
    }
    header h1 { margin: 0; font-size: 18px; }
    header button {
        border: 0; border-radius: 4px; padding: 7px 10px;
        color: #00635d; background: #fff; cursor: pointer;
    }
    header input[type=file] { max-width: 250px; }
    #stats { margin-left: auto; font-variant-numeric: tabular-nums; }
    #comparison {
        width: 100%; color: #15343a; background: #f6fbfc; border-radius: 4px;
        padding: 5px 8px; font-size: 12px; white-space: pre-wrap;
    }
    main { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; height: calc(100vh - 100px); padding: 12px; }
    section {
        min-width: 0; min-height: 0; display: flex; flex-direction: column;
        border: 1px solid #c8d5db; border-radius: 6px; overflow: hidden; background: #fff;
    }
    section h2 { margin: 0; padding: 9px 12px; font-size: 15px; background: #e7f0f4; }
    .workspace-host { flex: 1; min-height: 0; position: relative; }
    .workspace-host .injectionDiv { border: 0; }
    .blocklyCanvasRenderCanvas { pointer-events: none; }
    @media (max-width: 900px) {
        main { grid-template-columns: 1fr; height: auto; min-height: calc(100vh - 100px); }
        .workspace-host { min-height: 420px; }
        #stats { margin-left: 0; }
    }
`;
// Keep the test page self-contained. The production editor supplies its own CSS.
document.head.appendChild(style);

const reportTestError = error => {
    const stats = document.getElementById('stats');
    if (stats) stats.textContent = error && error.stack ? error.stack : String(error);
};
window.addEventListener('error', event => reportTestError(event.error || event.message));
window.addEventListener('unhandledrejection', event => reportTestError(event.reason));

const app = document.getElementById('app');
app.innerHTML = `
    <header>
        <h1>Canvas Blockly renderer test</h1>
        <button id="recapture">Re-capture</button>
        <button id="stress">Load 400 blocks</button>
        <button id="impact">Load Impact XML</button>
        <input id="sb3-file" type="file" accept=".sb3,application/zip">
        <button id="load-sb3">Load all main blocks</button>
        <label><input id="full-render" type="checkbox" checked> Full Canvas render</label>
        <label><input id="full-svg" type="checkbox"> Full SVG render</label>
        <button id="zoom-in">Zoom in</button>
        <button id="zoom-out">Zoom out</button>
        <span id="stats"></span>
        <div id="comparison">Choose an SB3 file to compare SVG and Canvas loading.</div>
    </header>
    <main>
        <section><h2>Reference SVG</h2><div id="svg-workspace" class="workspace-host"></div></section>
        <section>
            <h2>Canvas + HTML interaction layer</h2>
            <div id="canvas-workspace" class="workspace-host"></div>
        </section>
    </main>`;

const updateStats = renderer => {
    const stats = renderer && renderer.getStats ? renderer.getStats() : {};
    const canvasSvgBlocks = renderer && renderer.workspace && renderer.workspace.getCanvas ?
        renderer.workspace.getCanvas().querySelectorAll('.blocklyBlockBackground').length : 0;
    const canvasSize = renderer && renderer.canvas ? `${renderer.canvas.width}x${renderer.canvas.height}` : '0x0';
    const statsElement = document.getElementById('stats');
    const workspace = renderer && renderer.workspace;
    const gesture = workspace && workspace.currentGesture_;
    statsElement.dataset.state = JSON.stringify({
        gesture: gesture ? {
            started: gesture.hasStarted(),
            draggingBlock: !!gesture.isDraggingBlock_,
            ending: !!gesture.isEnding_
        } : null,
        viewport: workspace ? {
            scrollX: workspace.scrollX,
            scrollY: workspace.scrollY,
            scale: workspace.scale,
            transform: workspace.getCanvas().getAttribute('transform')
        } : null,
        roots: workspace ? workspace.getTopBlocks(false).map(block => {
            const position = block.getRelativeToSurfaceXY();
            return {id: block.id, type: block.type, x: position.x, y: position.y};
        }) : [],
        pendingLayouts: renderer ? renderer.layoutTasks.size : 0
    });
    statsElement.textContent = `${Number(stats.layoutCount || 0)} scripts / ` +
        `${Number(stats.visibleBlockCount || 0)} visible blocks` +
        ` | draw ${Number(stats.lastDrawDuration || 0).toFixed(2)}ms` +
        ` | layout ${Number(stats.lastLayoutDuration || 0).toFixed(2)}ms` +
        ` | canvas ${canvasSize} | canvas SVG blocks ${canvasSvgBlocks}`;
};

const loadWorkspace = (ScratchBlocks, workspace, xml) => {
    const dom = ScratchBlocks.Xml.textToDom(xml);
    ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
};

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

const loadXmlAsync = (ScratchBlocks, workspace, xml) => {
    const dom = ScratchBlocks.Xml.textToDom(xml);
    const loadAsync = ScratchBlocks.Xml.clearWorkspaceAndLoadFromXmlAsync;
    if (loadAsync) return loadAsync(dom, workspace, () => false);
    return ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
};

const getSvgMetrics = workspace => ({
    blocks: workspace.getAllBlocks(false).length,
    renderedBlocks: workspace.getCanvas().querySelectorAll('.blocklyBlockBackground').length
});

const materializeAllSvgBlocksForBenchmark = workspace => {
    const blocks = workspace.getAllBlocks(false);
    // Lazy SVG initialization is normally viewport-driven. For a fair
    // full-scene comparison, initialize every node first and render child
    // reporters before their parents so C-block dimensions converge in one
    // pass, matching the Canvas renderer's dependency order.
    for (const block of blocks) {
        if (block && typeof block.setIntersects === 'function') block.setIntersects(true);
        if (block && !block.getSvgRoot() && typeof block.initSvg === 'function') block.initSvg();
    }
    for (let index = blocks.length - 1; index >= 0; index--) {
        const block = blocks[index];
        if (block && typeof block.render === 'function') block.render(true);
    }
    if (typeof workspace.resizeContents === 'function') workspace.resizeContents();
};

const getCanvasMetrics = renderer => {
    const performance = renderer.performance || {};
    const layouts = Array.from(renderer.rootLayouts.values());
    const materializedBlocks = layouts.reduce((count, layout) =>
        count + (layout.geometries || []).length, 0);
    const projectionPending = layouts.filter(layout => layout.projectionPending).length;
    const layoutPending = layouts.filter(layout => layout.inProgress).length;
    return {
        blocks: renderer.workspace.getAllBlocks(false).length,
        visibleBlocks: renderer.visibleBlockCount || 0,
        materializedBlocks,
        pending: renderer.layoutTasks.size + projectionPending + layoutPending,
        layouts: performance.layouts || 0,
        layoutMs: performance.layoutTime || 0,
        layoutMaxMs: performance.layoutMax || 0,
        native: performance.nativeMeasurements || 0,
        nativeMs: performance.nativeTime || 0,
        nativeMaxMs: performance.nativeMax || 0,
        projection: performance.projections || 0,
        projectionMs: performance.projectionTime || 0,
        projectionMaxMs: performance.projectionMax || 0,
        draws: performance.draws || 0,
        drawMs: performance.drawTime || 0,
        drawMaxMs: performance.drawMax || 0,
        queue: renderer.layoutTasks.size,
        errors: performance.errors || 0
    };
};

const waitForCanvasIdle = async (renderer, timeout = 180000) => {
    const started = performance.now();
    let idleFrames = 0;
    while (performance.now() - started < timeout) {
        await nextFrame();
        const metrics = getCanvasMetrics(renderer);
        const allMaterialized = !renderer.renderAllBlocks ||
            metrics.materializedBlocks >= metrics.blocks;
        if (metrics.queue === 0 && metrics.pending === 0 && allMaterialized) idleFrames++;
        else idleFrames = 0;
        if (idleFrames >= 3) return {settled: true, metrics};
    }
    return {settled: false, metrics: getCanvasMetrics(renderer)};
};

const formatMs = value => `${Number(value || 0).toFixed(1)} ms`;

const renderComparison = (label, metadata, svg, canvas) => {
    const speedup = canvas.settleMs > 0 ? svg.settleMs / canvas.settleMs : 0;
    const sortedLengths = metadata.selectedScriptLengths.slice().sort((a, b) => b - a);
    const scriptSummary = sortedLengths.slice(0, 8).join(', ') +
        (sortedLengths.length > 8 ? ', ...' : '');
    const lines = [
        `${label}: ${metadata.targetName}, ${metadata.totalBlockCount} total blocks`,
        `SVG ${metadata.fullSvg ? 'full-scene' : 'viewport'} / ` +
            `Canvas ${metadata.fullRender ? 'full-scene' : 'viewport'}; ` +
            `loaded all ${metadata.selectedScriptCount} roots; longest next chains: ${scriptSummary}`,
        `Reachable project blocks: ${metadata.reachableBlockCount}; ` +
            `orphans loaded as roots: ${metadata.orphanBlockCount}; ` +
            `missing references: ${metadata.missingReferenceCount}`,
        `Fallback extension block types: ${metadata.fallbackBlockTypeCount}`,
        '',
        'Metric                 SVG                 Canvas',
        `Import call            ${formatMs(svg.importMs)}          ${formatMs(canvas.importMs)}`,
        `First frame            ${formatMs(svg.firstFrameMs)}          ${formatMs(canvas.firstFrameMs)}`,
        `Settled / queue empty  ${formatMs(svg.settleMs)}          ${formatMs(canvas.settleMs)}`,
        `Imported Blockly nodes ${svg.blocks}                  ${canvas.blocks}`,
        `Rendered blocks        ${svg.renderedBlocks}                  ${canvas.visibleBlocks}`,
        `Canvas geometry        n/a                 ${canvas.materializedBlocks}`,
        `Native measurements    n/a                 ${canvas.native} (${formatMs(canvas.nativeMs)})`,
        `Layout total / max     n/a                 ${formatMs(canvas.layoutMs)} / ${formatMs(canvas.layoutMaxMs)}`,
        `Draw total / max       n/a                 ${formatMs(canvas.drawMs)} / ${formatMs(canvas.drawMaxMs)}`,
        `Projection total / max n/a                 ` +
            `${formatMs(canvas.projectionMs)} / ${formatMs(canvas.projectionMaxMs)}`,
        `Canvas errors          n/a                 ${canvas.errors}`,
        '',
        `SVG / Canvas settled ratio: ${speedup ? speedup.toFixed(2) : 'n/a'}x`
    ];
    document.getElementById('comparison').textContent = lines.join('\n');
};

const measurePair = async (ScratchBlocks, svgWorkspace, canvasWorkspace, renderer, xml, metadata) => {
    const emptyXml = '<xml xmlns="http://www.w3.org/1999/xhtml"></xml>';
    metadata.fullRender = document.getElementById('full-render').checked;
    metadata.fullSvg = document.getElementById('full-svg').checked;
    if (typeof svgWorkspace.setOffscreenTopBlockCullingEnabled === 'function') {
        svgWorkspace.setOffscreenTopBlockCullingEnabled(!metadata.fullSvg);
    }
    if (typeof renderer.setRenderAllBlocks === 'function') {
        renderer.setRenderAllBlocks(metadata.fullRender);
    }
    renderer.setLoading(true);
    renderer.reset();
    await loadXmlAsync(ScratchBlocks, svgWorkspace, emptyXml);
    await loadXmlAsync(ScratchBlocks, canvasWorkspace, emptyXml);
    renderer.setLoading(false);

    const svgStart = performance.now();
    await loadXmlAsync(ScratchBlocks, svgWorkspace, xml);
    if (metadata.fullSvg &&
        typeof svgWorkspace.setOffscreenTopBlockCullingEnabled === 'function') {
        // Toggle after import so Scratch Blocks materializes roots that were
        // created while its lazy loader still considered them offscreen.
        svgWorkspace.setOffscreenTopBlockCullingEnabled(true);
        svgWorkspace.setOffscreenTopBlockCullingEnabled(false);
    }
    if (metadata.fullSvg) materializeAllSvgBlocksForBenchmark(svgWorkspace);
    const svgImportEnd = performance.now();
    await nextFrame();
    const svgFirstFrameEnd = performance.now();
    await nextFrame();
    const svgSettleEnd = performance.now();
    const svgMetrics = getSvgMetrics(svgWorkspace);
    const svg = {
        importMs: svgImportEnd - svgStart,
        firstFrameMs: svgFirstFrameEnd - svgStart,
        settleMs: svgSettleEnd - svgStart,
        blocks: svgMetrics.blocks,
        renderedBlocks: svgMetrics.renderedBlocks
    };

    renderer.resetPerformance();
    renderer.reset();
    renderer.setLoading(true);
    const canvasStart = performance.now();
    await loadXmlAsync(ScratchBlocks, canvasWorkspace, xml);
    const canvasImportEnd = performance.now();
    renderer.setLoading(false);
    renderer.setEnabled(true);
    renderer.invalidateAll();
    let fullRenderSettled = true;
    if (metadata.fullRender && typeof renderer.materializeAllBlocksForBenchmark === 'function') {
        fullRenderSettled = await renderer.materializeAllBlocksForBenchmark();
    } else {
        await nextFrame();
    }
    const canvasFirstFrameEnd = performance.now();
    const canvasIdle = metadata.fullRender ? {
        settled: fullRenderSettled,
        metrics: getCanvasMetrics(renderer)
    } : await waitForCanvasIdle(renderer);
    const canvasSettleEnd = performance.now();
    const canvasStats = canvasIdle.metrics;
    const canvas = {
        importMs: canvasImportEnd - canvasStart,
        firstFrameMs: canvasFirstFrameEnd - canvasStart,
        settleMs: canvasSettleEnd - canvasStart,
        ...canvasStats
    };
    renderComparison(canvasIdle.settled ? 'SB3 benchmark complete' : 'SB3 benchmark timed out',
        metadata, svg, canvas);
    return {svg, canvas, settled: canvasIdle.settled};
};

LazyScratchBlocks.load()
    .then(() => {
        const vm = new VM();
        const ScratchBlocks = VMScratchBlocks(vm, false);
        CanvasBlockRenderer.enableBlocklyCanvasMode(ScratchBlocks);
        const svgWorkspace = ScratchBlocks.inject(
            document.getElementById('svg-workspace'), workspaceOptions);
        const canvasWorkspace = ScratchBlocks.inject(
            document.getElementById('canvas-workspace'), canvasWorkspaceOptions);
        const renderer = new CanvasBlockRenderer(canvasWorkspace, ScratchBlocks);
        renderer.attach();
        renderer.setEnabled(true);
        window.__canvasBlockTest = {vm, ScratchBlocks, svgWorkspace, canvasWorkspace, renderer};
        window.__canvasBlockTest.loadStress = async () => {
            let xml = '<xml>';
            for (let i = 0; i < 100; i++) {
                xml += `<block type="event_whenflagclicked" x="${(i % 10) * 360}" ` +
                    `y="${Math.floor(i / 10) * 260}"><next>` +
                    '<block type="motion_movesteps"><next>' +
                    '<block type="motion_turnright"><next>' +
                    '<block type="motion_movesteps"></block>' +
                    '</next></block></next></block></next></block>';
            }
            xml += '</xml>';
            const dom = ScratchBlocks.Xml.textToDom(xml);
            canvasWorkspace.scrollX = 0;
            canvasWorkspace.scrollY = 0;
            canvasWorkspace.resize();
            renderer.setLoading(true);
            renderer.reset();
            try {
                const loadAsync = ScratchBlocks.Xml.clearWorkspaceAndLoadFromXmlAsync;
                if (loadAsync) {
                    await Promise.all([
                        loadAsync(dom.cloneNode(true), svgWorkspace, () => false),
                        loadAsync(dom, canvasWorkspace, () => false)
                    ]);
                } else {
                    ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom.cloneNode(true), svgWorkspace);
                    ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, canvasWorkspace);
                }
            } finally {
                renderer.setLoading(false);
            }
            renderer.setEnabled(true);
            renderer.invalidateAll();
        };
        document.getElementById('stress').onclick = () => window.__canvasBlockTest.loadStress();
        document.getElementById('load-sb3').onclick = async () => {
            const input = document.getElementById('sb3-file');
            const file = input.files && input.files[0];
            if (!file) {
                reportTestError(new Error('Choose an .sb3 file first'));
                return;
            }
            const button = document.getElementById('load-sb3');
            button.disabled = true;
            button.textContent = 'Loading SB3...';
            try {
                const zip = await JSZip.loadAsync(await file.arrayBuffer());
                const projectFile = zip.file('project.json');
                if (!projectFile) throw new Error('The selected archive has no project.json');
                const project = JSON.parse(await projectFile.async('string'));
                const benchmark = projectTargetToTestXml(project, 'main');
                benchmark.fallbackBlockTypeCount = registerBenchmarkBlockDefinitions(
                    ScratchBlocks,
                    benchmark.blocks
                );
                delete benchmark.blocks;
                document.getElementById('comparison').textContent =
                    `Preparing ${file.name}...\n` +
                    `main has ${benchmark.totalBlockCount} blocks; ` +
                    `loading all ${benchmark.selectedScriptCount} scripts.`;
                window.__canvasBlockTest.lastSb3 = await measurePair(
                    ScratchBlocks,
                    svgWorkspace,
                    canvasWorkspace,
                    renderer,
                    benchmark.xml,
                    benchmark
                );
            } catch (error) {
                reportTestError(error);
                document.getElementById('comparison').textContent =
                    `SB3 benchmark failed: ${error && error.message ? error.message : error}`;
            } finally {
                button.disabled = false;
                button.textContent = 'Load all main blocks';
            }
        };
        document.getElementById('impact').onclick = async () => {
            const response = await fetch('/__impact_workspace.xml');
            const xml = await response.text();
            canvasWorkspace.scrollX = 0;
            canvasWorkspace.scrollY = 0;
            canvasWorkspace.resize();
            renderer.setLoading(true);
            renderer.reset();
            try {
                const dom = ScratchBlocks.Xml.textToDom(xml);
                const loadAsync = ScratchBlocks.Xml.clearWorkspaceAndLoadFromXmlAsync;
                if (loadAsync) await loadAsync(dom, canvasWorkspace, () => false);
                else ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, canvasWorkspace);
            } finally {
                renderer.setLoading(false);
                renderer.setEnabled(true);
            }
        };
        loadWorkspace(ScratchBlocks, svgWorkspace, TEST_XML);
        loadWorkspace(ScratchBlocks, canvasWorkspace, TEST_XML);
        document.getElementById('recapture').onclick = () => {
            renderer.reset();
            renderer.setEnabled(true);
            renderer.invalidateAll();
        };
        document.getElementById('zoom-in').onclick = () => {
            canvasWorkspace.setScale(canvasWorkspace.scale + 0.1);
            renderer.scheduleDraw();
        };
        document.getElementById('zoom-out').onclick = () => {
            canvasWorkspace.setScale(canvasWorkspace.scale - 0.1);
            renderer.scheduleDraw();
        };
        if (new URLSearchParams(window.location.search).has('stress')) {
            setTimeout(() => window.__canvasBlockTest.loadStress(), 0);
        }
        if (new URLSearchParams(window.location.search).has('impact')) {
            setTimeout(() => document.getElementById('impact').click(), 0);
        }
        window.__canvasBlockTest.loadSb3Project = file => {
            const input = document.getElementById('sb3-file');
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            return document.getElementById('load-sb3').click();
        };
        setInterval(() => updateStats(renderer), 250);
    })
    .catch(error => {
        document.getElementById('stats').textContent = String(error);
        throw error;
    });
