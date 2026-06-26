import * as React from "react";

interface TooltipProps {
  className?: string;
  icon?: React.ReactNode;
  tipText: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const Tooltip = React.forwardRef<HTMLButtonElement, TooltipProps>(({ className, icon, tipText, onClick }, ref) => (
  <button
    ref={ref}
    type="button"
    className={className}
    onClick={onClick}
    title={tipText}
    style={{ background: "transparent", border: 0, padding: 0, pointerEvents: "auto" }}
  >
    {icon}
  </button>
));

Tooltip.displayName = "Tooltip";

export default Tooltip;
