import type { RefObject } from "react";

import type { EntryTreeNode } from "@/lib/types";

export interface BranchNavigatorProps {
  tree: EntryTreeNode[];
  activeLeafId: string | null;
  onLeafChange: (leafId: string | null) => void;
  inline?: boolean;
  containerRef?: RefObject<HTMLElement | null>;
  open?: boolean;
  onToggle?: () => void;
  hasSession?: boolean;
  disabled?: boolean;
  hideWhenEmpty?: boolean;
}
