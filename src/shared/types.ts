export type EntityType = "EMAIL" | "PHONE" | "AMT" | "ORG" | "PERSON";

export interface DetectedEntity {
  type: EntityType;
  value: string;
  start: number;
  end: number;
}

export interface MaskTextRequest {
  kind: "maskText";
  tabId?: number;
  text: string;
}

export interface RehydrateTextRequest {
  kind: "rehydrateText";
  tabId?: number;
  text: string;
}

export interface GetStateRequest {
  kind: "getState";
  tabId?: number;
}

export interface SetEnabledRequest {
  kind: "setEnabled";
  tabId: number;
  enabled: boolean;
}

export interface StateChangedMessage {
  kind: "stateChanged";
  enabled: boolean;
  maskedCount: number;
}

export type RuntimeRequest =
  | MaskTextRequest
  | RehydrateTextRequest
  | GetStateRequest
  | SetEnabledRequest;

export interface MaskTextResponse {
  ok: true;
  kind: "maskText";
  maskedText: string;
  entitiesCount: number;
  enabled: boolean;
  maskedCount: number;
}

export interface RehydrateTextResponse {
  ok: true;
  kind: "rehydrateText";
  restoredText: string;
}

export interface GetStateResponse {
  ok: true;
  kind: "getState";
  enabled: boolean;
  maskedCount: number;
}

export interface SetEnabledResponse {
  ok: true;
  kind: "setEnabled";
  enabled: boolean;
  maskedCount: number;
}

export interface ErrorResponse {
  ok: false;
  error: string;
}

export type RuntimeResponse =
  | MaskTextResponse
  | RehydrateTextResponse
  | GetStateResponse
  | SetEnabledResponse
  | ErrorResponse;

export const TOKEN_REGEX = /\[\[([A-Z]+_\d+)\]\]/g;
