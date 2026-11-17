import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { useNexusQuery } from "../hooks/useNexusQuery";
import { isPreviewModeActive } from "../lib/nexusBridge";
import { previewAddMemoryRecord, previewDeleteMemoryRecord } from "../preview/mockBridge";
import type { MemoryRecord, MemoryRecordType } from "@shared/types/models";

const CATEGORIES: Array<{ key: MemoryRecordType | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "FACT", label: "Facts" },
  { key: "PREFERENCE", label: "Preferences" },
  { key: "CONTEXT", label: "Context" },
  { key: "SKILL", label: "Skills" },
];

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function Memory() {
  const previewMode = isPreviewModeActive();
  const [refreshKey, setRefreshKey] = useState(0);
  const memoryQuery = useNexusQuery(() => window.nexus.memory.list(), [refreshKey]);
  const [category, setCategory] = useState<MemoryRecordType | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draftType, setDraftType] = useState<MemoryRecordType>("PREFERENCE");
  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");

  const records = memoryQuery.data ?? [];
  const filtered = useMemo(
    () => (category === "ALL" ? records : records.filter((r) => r.type === category)),
    [records, category],
  );
  const selected: MemoryRecord | null = filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

  function addRecord() {
    if (!draftKey.trim() || !draftValue.trim()) return;
    previewAddMemoryRecord({ type: draftType, key: draftKey.trim(), value: draftValue.trim() });
    setDraftKey("");
    setDraftValue("");
    setShowAddForm(false);
    setRefreshKey((k) => k + 1);
  }

  function deleteRecord(id: string) {
    previewDeleteMemoryRecord(id);
    setSelectedId(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <PageHeader
        title="Memory"
        description="Durable context NEXUS retains about you and your environment."
        action={
          previewMode ? (
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="rounded-md border border-nexus-border px-3 py-1.5 text-xs text-nexus-text-muted transition-colors hover:text-nexus-text"
            >
              {showAddForm ? "Cancel" : "+ Add memory record"}
            </button>
          ) : undefined
        }
      />

      {previewMode && showAddForm ? (
        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_1fr_auto]">
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as MemoryRecordType)}
              className="rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-text"
            >
              <option value="FACT">Fact</option>
              <option value="PREFERENCE">Preference</option>
              <option value="CONTEXT">Context</option>
              <option value="SKILL">Skill</option>
            </select>
            <input
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="Key, e.g. default-browser"
              className="rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-text placeholder:text-nexus-text-faint"
            />
            <input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              placeholder="Value"
              className="rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-text placeholder:text-nexus-text-faint"
            />
            <button
              type="button"
              onClick={addRecord}
              disabled={!draftKey.trim() || !draftValue.trim()}
              className="rounded-md bg-nexus-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-[11px] text-nexus-text-faint">
            Preview Mode only — stored locally in this browser tab, never saved to a real database.
          </p>
        </Card>
      ) : null}

      <div className="mb-4 flex gap-1 rounded-md border border-nexus-border p-1 text-xs">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={[
              "rounded px-2.5 py-1 transition-colors",
              category === c.key
                ? "bg-nexus-accent-muted text-nexus-text"
                : "text-nexus-text-faint hover:text-nexus-text",
            ].join(" ")}
          >
            {c.label}
            {c.key !== "ALL" ? (
              <span className="ml-1 text-nexus-text-faint">
                ({records.filter((r) => r.type === c.key).length})
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {memoryQuery.loading ? (
        <Card>
          <p className="text-sm text-nexus-text-faint">Loading…</p>
        </Card>
      ) : memoryQuery.error ? (
        <Card>
          <p className="text-sm text-nexus-danger">Unable to load memory records.</p>
        </Card>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="p-0">
            <ul className="divide-y divide-nexus-border">
              {filtered.map((record) => {
                const isSelected = record.id === selected?.id;
                return (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(record.id)}
                      className={[
                        "block w-full px-4 py-3 text-left transition-colors",
                        isSelected ? "bg-nexus-accent-muted" : "hover:bg-nexus-surface-raised",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm text-nexus-text">{record.key}</p>
                        <span className="shrink-0 rounded border border-nexus-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-nexus-text-faint">
                          {record.type}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-nexus-text-faint">{record.value}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            {selected ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-medium text-nexus-text">{selected.key}</h3>
                    <span className="mt-1 inline-block rounded border border-nexus-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-nexus-text-faint">
                      {selected.type}
                    </span>
                  </div>
                  {previewMode ? (
                    <button
                      type="button"
                      onClick={() => deleteRecord(selected.id)}
                      className="rounded-md border border-nexus-danger/40 px-2.5 py-1 text-xs text-nexus-danger transition-colors hover:bg-nexus-danger/10"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 rounded-md border border-nexus-border bg-nexus-bg p-3">
                  <p className="text-sm leading-relaxed text-nexus-text">{selected.value}</p>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs text-nexus-text-faint">
                  <dt>Created</dt>
                  <dd className="text-right text-nexus-text-muted">{formatTimestamp(selected.createdAt)}</dd>
                  <dt>Last updated</dt>
                  <dd className="text-right text-nexus-text-muted">{formatTimestamp(selected.updatedAt)}</dd>
                </dl>
              </div>
            ) : (
              <EmptyState title="Select a record" description="Choose a memory record from the list to see its details." />
            )}
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No memory records yet"
            description={
              previewMode
                ? "Use \"+ Add memory record\" above to try the management interface with local sample data."
                : "Memory storage is modeled in the database foundation but nothing writes to it yet in this release."
            }
          />
        </Card>
      )}
    </div>
  );
}
