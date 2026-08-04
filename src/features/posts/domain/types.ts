export type PostType = "GIVE" | "REQUEST";

export type Discount = 95 | 90 | 80;

export type PayloadKind = "COMMAND" | "URL";

export type PostSources = {
  command?: string;
  url?: string;
};

export type PayloadHashes = {
  command?: string;
  url?: string;
};

export type PuzzleSelection = {
  discount: Discount;
  pieceNumber: number;
};

export type ParsedSource = {
  type: PostType;
  payloadKind: PayloadKind;
  payload: string;
  explicitSelection: PuzzleSelection | null;
};

export type ParsedSources = {
  type: PostType;
  sources: PostSources;
  explicitSelection: PuzzleSelection | null;
};

export type HallPostDto = PuzzleSelection & {
  id: string;
  type: PostType;
  availablePayloadKinds: PayloadKind[];
  createdAt: string;
  expiresAt: string;
};

export type StoredPost = HallPostDto & {
  payloads: PostSources;
  payloadHashes: PayloadHashes;
  publisherDeviceHash: string;
};
