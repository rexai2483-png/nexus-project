import { useState } from "react";
import type { DetectedUiElement } from "@shared/types/screenVision";

interface BoundingBoxOverlayProps {
  imageUrl: string;
  elements: DetectedUiElement[];
  selectedElementId?: string | null;
  onSelectElement?: (id: string) => void;
}

/**
 * Renders a captured screenshot with each detected element's bounding
 * box drawn on top, positioned by percentage of the image's own
 * rendered box — so it stays correctly aligned at any display size
 * without any extra math once we know the image's natural pixel
 * dimensions (captured on load). Accessibility-sourced boxes (green)
 * and AI-estimated boxes (blue) use different colors so the two are
 * never visually ambiguous, matching the same distinction carried in
 * each element's `source` field.
 */
export function BoundingBoxOverlay({ imageUrl, elements, selectedElementId, onSelectElement }: BoundingBoxOverlayProps) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  return (
    <div className="relative inline-block max-w-full">
      <img
        src={imageUrl}
        alt="Captured screen"
        onLoad={(event) =>
          setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
        }
        className="block max-w-full rounded-md border border-nexus-border"
      />
      {naturalSize
        ? elements.map((element) => {
            const left = (element.boundingBox.left / naturalSize.width) * 100;
            const top = (element.boundingBox.top / naturalSize.height) * 100;
            const width = (element.boundingBox.width / naturalSize.width) * 100;
            const height = (element.boundingBox.height / naturalSize.height) * 100;
            const isSelected = element.id === selectedElementId;
            return (
              <button
                key={element.id}
                type="button"
                onClick={() => onSelectElement?.(element.id)}
                title={`${element.type}${element.label ? `: ${element.label}` : ""} (${element.source === "ACCESSIBILITY" ? "accessibility" : `AI estimate, ${Math.round(element.confidence * 100)}% confidence`})`}
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                className={[
                  "absolute border-2 transition-colors",
                  element.source === "ACCESSIBILITY" ? "border-nexus-success" : "border-nexus-accent",
                  isSelected ? "bg-white/15" : "bg-transparent hover:bg-white/10",
                ].join(" ")}
              />
            );
          })
        : null}
    </div>
  );
}
