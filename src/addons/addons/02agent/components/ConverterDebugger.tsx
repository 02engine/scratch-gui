import * as React from "react";
import ReactDOM from "react-dom";
import { useBlockRangeSelection } from "../hooks/useBlockRangeSelection";
import { ucfToScratch } from "../ucf";
import { callGetBlockInfo } from "../converter";

interface ConverterDebuggerProps {
  vm: any;
  workspace: any;
}

export const ConverterDebugger: React.FC<ConverterDebuggerProps> = ({ vm, workspace }) => {
  const [visible, setVisible] = React.useState(true);
  const [dslInput, setDslInput] = React.useState("");

  const { isSelecting, startSelecting, cancelSelecting } = useBlockRangeSelection({
    workspace,
    vm,
    onRangeSelected: (attachment) => {
      console.group("=== [ConverterDebugger] Selected Blocks ===");
      console.log("Attachment Meta:", attachment.meta);

      const target = vm.editingTarget;
      if (target && target.blocks && attachment.meta?.selectedBlockIds) {
        const blockIds = attachment.meta.selectedBlockIds as string[];
        const blocksJson = blockIds.map(id => target.blocks._blocks[id]);
        console.log("Original Blocks JSON:", blocksJson);

        console.groupCollapsed("Block Infos (getBlockInfoTool)");
        blocksJson.forEach(block => {
          if (block && block.opcode) {
            const info = callGetBlockInfo(block.opcode, vm.runtime);
            console.log(`[${block.opcode}] info:`, info);
          }
        });
        console.groupEnd();
      }

      console.log("Converted DSL:\n", attachment.content);

      try {
        const parsedJson = ucfToScratch(attachment.content, { runtime: vm.runtime });
        console.log("Parsed back to JSON (Verification):", parsedJson);
      } catch (e) {
        console.error("Failed to parse DSL back to JSON:", e);
      }
      console.groupEnd();
    },
    onSelectionError: (message) => {
      console.error("[ConverterDebugger] Selection Error:", message);
    }
  });

  const handleParseDsl = () => {
    console.group("=== [ConverterDebugger] Parsing DSL ===");
    console.log("Input DSL:\n", dslInput);
    try {
      const json = ucfToScratch(dslInput, { runtime: vm.runtime });
      console.log("Parsed JSON:", json);
    } catch (e) {
      console.error("[ConverterDebugger] Parse Error:", e);
    }
    console.groupEnd();
  };

  if (!visible) return null;

  const modalStyle: React.CSSProperties = {
    position: "fixed",
    top: "20px",
    right: "20px",
    width: "320px",
    backgroundColor: "#ffffff",
    border: "1px solid #ccc",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    padding: "16px",
    zIndex: 999999,
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    color: "#333",
    fontFamily: "sans-serif"
  };

  return ReactDOM.createPortal(
    <div style={modalStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>Converter Debugger</h3>
        <button
          onClick={() => setVisible(false)}
          style={{ cursor: "pointer", background: "none", border: "none", fontSize: "16px", fontWeight: "bold" }}
        >
          &times;
        </button>
      </div>

      <div>
        <button
          onClick={isSelecting ? cancelSelecting : startSelecting}
          style={{
            width: "100%",
            padding: "8px",
            cursor: "pointer",
            backgroundColor: isSelecting ? "#ff4d4f" : "#1890ff",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            fontWeight: "bold"
          }}
        >
          {isSelecting ? "Cancel Selection" : "Select Blocks (Box Select)"}
        </button>
        {isSelecting && <div style={{ fontSize: "12px", color: "gray", marginTop: "4px" }}>Draw a box around blocks on workspace...</div>}
      </div>

      <hr style={{ borderTop: "1px solid #eee", margin: "4px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <textarea
          placeholder="Paste DSL here..."
          value={dslInput}
          onChange={(e) => setDslInput(e.target.value)}
          style={{
            width: "100%",
            height: "120px",
            resize: "vertical",
            fontFamily: "monospace",
            padding: "8px",
            boxSizing: "border-box",
            border: "1px solid #ccc",
            borderRadius: "4px"
          }}
        />
        <button
          onClick={handleParseDsl}
          style={{
            width: "100%",
            padding: "8px",
            cursor: "pointer",
            backgroundColor: "#52c41a",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            fontWeight: "bold"
          }}
        >
          Parse DSL to JSON
        </button>
      </div>
    </div>,
    document.body
  );
};
