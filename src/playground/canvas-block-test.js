import './import-first';

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
        height: 54px; display: flex; align-items: center; gap: 12px;
        padding: 0 18px; background: #00baad; color: #fff;
    }
    header h1 { margin: 0; font-size: 18px; }
    header button {
        border: 0; border-radius: 4px; padding: 7px 10px;
        color: #00635d; background: #fff; cursor: pointer;
    }
    #stats { margin-left: auto; }
    main { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; height: calc(100vh - 54px); padding: 12px; }
    section {
        min-width: 0; min-height: 0; display: flex; flex-direction: column;
        border: 1px solid #c8d5db; border-radius: 6px; overflow: hidden; background: #fff;
    }
    section h2 { margin: 0; padding: 9px 12px; font-size: 15px; background: #e7f0f4; }
    .workspace-host { flex: 1; min-height: 0; position: relative; }
    .workspace-host .injectionDiv { border: 0; }
    .blocklyCanvasRenderCanvas { pointer-events: none; }
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
        <button id="zoom-in">Zoom in</button>
        <button id="zoom-out">Zoom out</button>
        <span id="stats"></span>
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
        setInterval(() => updateStats(renderer), 250);
    })
    .catch(error => {
        document.getElementById('stats').textContent = String(error);
        throw error;
    });
