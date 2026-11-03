/**
 * The fixed catalog of applications and keyboard shortcuts the agent is
 * allowed to touch. Nothing outside these lists can be launched/sent —
 * see agent/actions/apps.ts and agent/actions/input.ts for where these
 * ids are resolved into real Windows executables/key combinations.
 */

export interface ApprovedAppDefinition {
  id: string;
  label: string;
  /** Windows executable used to launch/detect the process. */
  win32Executable: string;
}

export const APPROVED_APPLICATIONS: ApprovedAppDefinition[] = [
  { id: "notepad", label: "Notepad", win32Executable: "notepad.exe" },
  { id: "calculator", label: "Calculator", win32Executable: "CalculatorApp.exe" },
  { id: "explorer", label: "File Explorer", win32Executable: "explorer.exe" },
  { id: "paint", label: "Paint", win32Executable: "mspaint.exe" },
];

export interface ApprovedShortcutDefinition {
  id: string;
  label: string;
}

export const APPROVED_SHORTCUTS: ApprovedShortcutDefinition[] = [
  { id: "save", label: "Save (Ctrl+S)" },
  { id: "copy", label: "Copy (Ctrl+C)" },
  { id: "paste", label: "Paste (Ctrl+V)" },
  { id: "selectAll", label: "Select All (Ctrl+A)" },
  { id: "undo", label: "Undo (Ctrl+Z)" },
];
