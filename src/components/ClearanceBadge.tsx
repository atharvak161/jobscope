import * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { ClearanceStatus } from "@/lib/types";

interface ClearanceBadgeProps {
  status: ClearanceStatus;
}

export function ClearanceBadge({ status }: ClearanceBadgeProps) {
  switch (status) {
    case "REQUIRED":
      return (
        <Badge variant="danger" aria-label="SC clearance required">
          SC Required
        </Badge>
      );
    case "PREFERRED":
      return (
        <Badge variant="warning" aria-label="SC clearance preferred">
          SC Preferred
        </Badge>
      );
    case "NONE_DETECTED":
    default:
      return null;
  }
}
