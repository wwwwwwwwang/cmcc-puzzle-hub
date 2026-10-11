export type PostType = "GIVE" | "REQUEST";

export type RequestPostStatus =
  | "OPEN"
  | "PENDING_CONFIRM"
  | "COMPLETED"
  | "EXPIRED";

export type HelpAttemptStatus = "PENDING" | "REJECTED" | "COMPLETED";

export type ConfirmationMethod = "MANUAL" | "AUTO";

export type Discount = 95 | 90 | 80;

export type PayloadKind = "URL";

export type PostSources = {
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
  identity: string;
};

export type ParsedSources = {
  type: PostType;
  sources: PostSources;
  identity: string;
};

export type HallPostDto = PuzzleSelection & {
  id: string;
  type: PostType;
  publisherId: string;
  availablePayloadKinds: PayloadKind[];
  createdAt: string;
  expiresAt: string;
};

export type HallPostPage = {
  items: HallPostDto[];
  nextCursor: string | null;
};
