"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SponsorConfidence } from "@/lib/types";

interface SponsorBadgeProps {
  confidence: SponsorConfidence;
  matchReason?: string;
  registerLastUpdated?: string;
  showTooltip?: boolean;
}

export function SponsorBadge({
  confidence,
  matchReason,
  registerLastUpdated,
  showTooltip = true,
}: SponsorBadgeProps) {
  const badgeContent = (() => {
    switch (confidence) {
      case "CONFIRMED":
        return (
          <Badge variant="confirmed" aria-label="Visa sponsorship confirmed">
            ✓ Sponsor
          </Badge>
        );
      case "LIKELY":
        return (
          <Badge variant="likely" aria-label="Visa sponsorship likely">
            ~ Likely Sponsor
          </Badge>
        );
      case "LOW_CONFIDENCE":
        return (
          <Badge variant="unknown" aria-label="Visa sponsorship confidence low">
            ? Low Confidence
          </Badge>
        );
      case "UNKNOWN":
      default:
        return (
          <Badge variant="unknown" aria-label="Visa sponsorship unknown">
            Sponsor Unknown
          </Badge>
        );
    }
  })();

  const tooltipText = (() => {
    const updated = registerLastUpdated
      ? `Register last updated: ${new Date(registerLastUpdated).toLocaleDateString("en-GB")}.`
      : "Register recently updated.";
    switch (confidence) {
      case "CONFIRMED":
        return `On gov.uk sponsor register. Job ad states sponsorship available. ${updated}`;
      case "LIKELY":
        return `On gov.uk sponsor register (match: ${matchReason ?? "high confidence"}). Ad does not mention sponsorship explicitly. ${updated}`;
      case "LOW_CONFIDENCE":
        return `Partial match on gov.uk sponsor register. Verify directly before applying. ${updated}`;
      case "UNKNOWN":
      default:
        return `Not found on gov.uk sponsor register. Employer may still sponsor — verify directly.`;
    }
  })();

  if (!showTooltip) return badgeContent;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badgeContent}</TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
