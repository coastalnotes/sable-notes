export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface NoteInput {
  title?: string;
  body: string;
}

export type ThemePref = "system" | "light" | "dark";

export interface AppSettings {
  theme: ThemePref;
  lastOpenNoteId?: string;
  selectedTag?: string | null;
}
