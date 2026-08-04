export type PostType = "GIVE" | "REQUEST";

export type Discount = 95 | 90 | 80;

export type PayloadKind = "COMMAND" | "URL";

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

export type HallPostDto = PuzzleSelection & {
  id: string;
  type: PostType;
  payloadKind: PayloadKind;
  createdAt: string;
  expiresAt: string;
};

export type StoredPost = HallPostDto & {
  payload: string;
  publisherDeviceHash: string;
  payloadHash: string;
};
