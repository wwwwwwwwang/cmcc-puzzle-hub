const STATUS_LABELS: Record<string, string> = {
  OPEN: "可领取",
  CLAIMED: "已领取",
  PENDING_CONFIRM: "等待确认",
  COMPLETED: "已完成",
  EXPIRED: "已过期",
};

const TYPE_LABELS: Record<string, string> = {
  GIVE: "赠送",
  REQUEST: "求助",
};

const DISCOUNT_LABELS: Record<number, string> = {
  95: "95 折",
  90: "9 折",
  80: "8 折",
};

export function postStatusLabel(status: string, type?: string) {
  if (type === "REQUEST" && status === "OPEN") return "等待助力";
  return STATUS_LABELS[status] ?? status;
}

export function postTypeLabel(type: string) {
  return TYPE_LABELS[type] ?? type;
}

export function discountLabel(discount: number) {
  return DISCOUNT_LABELS[discount] ?? `${discount}`;
}
