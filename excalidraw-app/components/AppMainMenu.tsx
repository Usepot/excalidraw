import {
  loginIcon,
  ExcalLogo,
  eyeIcon,
} from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import { restore, restoreAppState } from "@excalidraw/excalidraw/data/restore";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { MIME_TYPES } from "@excalidraw/common";
import React from "react";

import { isDevEnv } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { LanguageList } from "../app-language/LanguageList";
import { isExcalidrawPlusSignedUser } from "../app_constants";

import { saveDebugState } from "./DebugCanvas";

type SavedBoardMeta = {
  id: string;
  name: string;
  updatedAt: number;
};

type SavedBoardData =
  | { version: 2; dataJSON: string }
  | { version?: 1; elements: any; appState: any; files: any };

const BOARDS_LIST_KEY = "excalidraw.app.boards:list";
const boardDataKey = (id: string) => `excalidraw.app.boards:data:${id}`;

const readBoards = (): SavedBoardMeta[] => {
  try {
    const raw = localStorage.getItem(BOARDS_LIST_KEY);
    return raw ? (JSON.parse(raw) as SavedBoardMeta[]) : [];
  } catch {
    return [];
  }
};

const writeBoards = (boards: SavedBoardMeta[]) => {
  localStorage.setItem(BOARDS_LIST_KEY, JSON.stringify(boards));
};

const readBoardData = (id: string): SavedBoardData | null => {
  try {
    const raw = localStorage.getItem(boardDataKey(id));
    return raw ? (JSON.parse(raw) as SavedBoardData) : null;
  } catch {
    return null;
  }
};

const writeBoardData = (id: string, data: SavedBoardData) => {
  localStorage.setItem(boardDataKey(id), JSON.stringify(data));
};

const deleteBoardData = (id: string) => {
  localStorage.removeItem(boardDataKey(id));
};

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
  excalidrawAPI?: ExcalidrawImperativeAPI | null;
}> = React.memo((props) => {
  const [boards, setBoards] = React.useState<SavedBoardMeta[]>(readBoards());
  const [selectedBoardId, setSelectedBoardId] = React.useState<string | null>(
    boards[0]?.id || null,
  );

  const handleLoadSelectedBoard = () => {
    if (!selectedBoardId) {
      window.alert("Select a board first");
      return;
    }
    const data = readBoardData(selectedBoardId);
    if (!data) {
      window.alert("Board data missing");
      return;
    }
    if ((data as any).dataJSON) {
      // Built-in load path: convert stored JSON to a Blob and use loadFromBlob
      const json = (data as { version: 2; dataJSON: string }).dataJSON;
      const blob = new Blob([json], { type: MIME_TYPES.excalidraw });
      loadFromBlob(blob, props.excalidrawAPI!.getAppState(), null)
        .then((loaded) => {
          props.excalidrawAPI?.updateScene({
            elements: loaded.elements as any,
            appState: loaded.appState as any,
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
        })
        .catch(() => {
          window.alert("Failed to load board");
        });
    } else {
      const legacy = data as { elements: any; appState: any; files: any };
      // sanitize legacy appState: ensure collaborators is not a plain object
      const legacyAppState = { ...(legacy.appState || {}) } as any;
      if (legacyAppState && legacyAppState.collaborators) {
        delete legacyAppState.collaborators;
      }
      const restored = restore(
        { elements: legacy.elements, appState: legacyAppState, files: legacy.files },
        null,
        null,
        { repairBindings: true },
      );
      try {
        // @ts-ignore addFiles accepts BinaryFiles mapping
        props.excalidrawAPI?.addFiles(legacy.files);
      } catch {}
      const mergedAppState = restoreAppState(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore allow possibly null
        restored.appState || null,
        props.excalidrawAPI!.getAppState(),
      );
      props.excalidrawAPI?.updateScene({
        elements: restored.elements as any,
        appState: mergedAppState as any,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    }
  };

  const handleSaveSelectedBoard = () => {
    if (!props.excalidrawAPI) {
      return;
    }
    if (!selectedBoardId) {
      window.alert("Select a board or use Save as New");
      return;
    }
    const meta = boards.find((b) => b.id === selectedBoardId);
    if (!meta) {
      return;
    }
    const dataJSON = serializeAsJSON(
      props.excalidrawAPI.getSceneElements(),
      props.excalidrawAPI.getAppState(),
      props.excalidrawAPI.getFiles(),
      "local",
    );
    const payload: SavedBoardData = { version: 2, dataJSON };
    writeBoardData(selectedBoardId, payload);
    const updated: SavedBoardMeta = { ...meta, updatedAt: Date.now() };
    const next = boards.map((b) => (b.id === updated.id ? updated : b));
    setBoards(next);
    writeBoards(next);
    window.alert(`Saved board: ${updated.name}`);
  };

  const handleSaveAsNewBoard = () => {
    if (!props.excalidrawAPI) {
      return;
    }
    const defaultName = `Board ${boards.length + 1}`;
    const name = window.prompt("New board name", defaultName)?.trim();
    if (!name) {
      return;
    }
    const id = Math.random().toString(36).slice(2);
    const dataJSON = serializeAsJSON(
      props.excalidrawAPI.getSceneElements(),
      props.excalidrawAPI.getAppState(),
      props.excalidrawAPI.getFiles(),
      "local",
    );
    const payload: SavedBoardData = { version: 2, dataJSON };
    writeBoardData(id, payload);
    const meta: SavedBoardMeta = { id, name, updatedAt: Date.now() };
    const next = [meta, ...boards];
    setBoards(next);
    writeBoards(next);
    setSelectedBoardId(id);
  };

  const handleRenameSelectedBoard = () => {
    if (!selectedBoardId) {
      window.alert("Select a board first");
      return;
    }
    const meta = boards.find((b) => b.id === selectedBoardId);
    if (!meta) {
      return;
    }
    const nextName = window.prompt("Rename board", meta.name)?.trim();
    if (!nextName) {
      return;
    }
    const next = boards.map((b) => (b.id === selectedBoardId ? { ...b, name: nextName } : b));
    setBoards(next);
    writeBoards(next);
  };

  const handleDeleteSelectedBoard = () => {
    if (!selectedBoardId) {
      window.alert("Select a board first");
      return;
    }
    const confirmed = window.confirm("Delete this board?");
    if (!confirmed) {
      return;
    }
    deleteBoardData(selectedBoardId);
    const next = boards.filter((b) => b.id !== selectedBoardId);
    setBoards(next);
    writeBoards(next);
    setSelectedBoardId(next[0]?.id || null);
  };

  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.onCollabDialogOpen()}
        />
      )}
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.Group title="Boards">
        <MainMenu.ItemCustom>
          <select
            value={selectedBoardId || ""}
            onChange={(e) => setSelectedBoardId(e.target.value || null)}
            style={{
              width: "100%",
              padding: "4px 8px",
              border: "1px solid var(--color-surface-low)",
              borderRadius: "4px",
              background: "var(--color-surface-lowest)",
              color: "var(--color-on-surface)",
              fontSize: "0.875rem",
              fontFamily: "inherit",
              outline: "none",
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-surface-low)";
              e.currentTarget.style.borderColor = "var(--color-surface-mid)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-surface-lowest)";
              e.currentTarget.style.borderColor = "var(--color-surface-low)";
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = "0 0 0 2px var(--focus-highlight-color)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <option value="">(none selected)</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </MainMenu.ItemCustom>
        <MainMenu.Item onClick={handleLoadSelectedBoard}>
          Load Board
        </MainMenu.Item>
        <MainMenu.Item onClick={handleSaveSelectedBoard}>
          Save Board
        </MainMenu.Item>
        <MainMenu.Item onClick={handleSaveAsNewBoard}>
          Save as New
        </MainMenu.Item>
        <MainMenu.Item onClick={handleRenameSelectedBoard}>
          Rename Board
        </MainMenu.Item>
        <MainMenu.Item onClick={handleDeleteSelectedBoard}>
          Delete Board
        </MainMenu.Item>
      </MainMenu.Group>
      <MainMenu.Separator />
      <MainMenu.ItemLink
        icon={ExcalLogo}
        href={`${
          import.meta.env.VITE_APP_PLUS_LP
        }/plus?utm_source=excalidraw&utm_medium=app&utm_content=hamburger`}
        className=""
      >
        Excalidraw+
      </MainMenu.ItemLink>
      <MainMenu.DefaultItems.Socials />
      <MainMenu.ItemLink
        icon={loginIcon}
        href={`${import.meta.env.VITE_APP_PLUS_APP}${
          isExcalidrawPlusSignedUser ? "" : "/sign-up"
        }?utm_source=signin&utm_medium=app&utm_content=hamburger`}
        className="highlighted"
      >
        {isExcalidrawPlusSignedUser ? "Sign in" : "Sign up"}
      </MainMenu.ItemLink>
      {isDevEnv() && (
        <MainMenu.Item
          icon={eyeIcon}
          onClick={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props?.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme
        theme={props.theme}
        onSelect={props.setTheme}
      />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
