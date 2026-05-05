import * as React from "react";
import styles from "../styles.less";

interface SelectionHintProps {
  visible: boolean;
}

export const SelectionHint: React.FC<SelectionHintProps> = ({ visible }) => {
  if (!visible) return null;

  return <div className={styles.selectionHint}>拖拽框选同一段中连续的积木，Esc 退出</div>;
};
