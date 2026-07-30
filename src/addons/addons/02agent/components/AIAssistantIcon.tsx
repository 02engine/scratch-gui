import * as React from "react";
// @ts-expect-error
import Icon02Agent from "../assets/icon-02agent.svg";

// export const AIAssistantIcon = () => (
//   <img src={Icon02Agent} aria-hidden="true" alt="" width={18} height={18} style={{ width: 18, height: 18 }} />
// );
export function AIAssistantIcon() {
    return (
        <img
            src={Icon02Agent}
            aria-hidden="true"
            alt=""
            draggable={false}
            width={18}
            height={18}
            style={{
                width: 18,
                height: 18,
                userSelect: "none"
             }}
        />
    );
}
