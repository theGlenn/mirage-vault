export interface SessionSummary {
  id: number;
  name: string;
  status: string;
  item_count: number;
  entry_count: number;
  mcp_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionEntry {
  id: number;
  session_id: number;
  item_id: number | null;
  entry_type: string;
  raw_content: string;
  created_at: string;
}

export interface SessionItem {
  id: number;
  name: string;
  masked_content: string;
  source_type: string;
}

export interface SessionEntity {
  token: string;
  entity_type: string;
}

export interface SessionDetail {
  id: number;
  name: string;
  status: string;
  mcp_shared: boolean;
  created_at: string;
  updated_at: string;
  entries: SessionEntry[];
  items: SessionItem[];
  entities: SessionEntity[];
}

export interface ItemDetail {
  id: number;
  name: string;
  masked_content: string;
  source_type: string;
  entities: SessionEntity[];
}

export interface EntityLegend {
  [entityType: string]: string[];
}
