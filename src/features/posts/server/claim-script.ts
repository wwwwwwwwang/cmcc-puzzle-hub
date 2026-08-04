export const CLAIM_POST_SCRIPT = `
local receiptJson = redis.call("GET", KEYS[1])
if receiptJson then
  local receipt = cjson.decode(receiptJson)
  if receipt.claimantDeviceHash == ARGV[1] then
    return cjson.encode({
      status = "CLAIMED",
      payloads = receipt.payloads,
      idempotent = true
    })
  end
  return cjson.encode({ status = "ALREADY_CLAIMED" })
end

local postJson = redis.call("GET", KEYS[2])
if not postJson then
  if tonumber(ARGV[4]) >= tonumber(ARGV[5]) then
    return cjson.encode({ status = "EXPIRED" })
  end
  return cjson.encode({ status = "ALREADY_CLAIMED" })
end

local post = cjson.decode(postJson)
if post.publisherDeviceHash == ARGV[1] then
  return cjson.encode({ status = "SELF_CLAIM_FORBIDDEN" })
end

local payloads = post.payloads
local payloadHashes = post.payloadHashes
if not payloads then
  payloads = {}
  payloadHashes = {}
  if post.payloadKind == "COMMAND" then
    payloads.command = post.payload
    payloadHashes.command = post.payloadHash
  else
    payloads.url = post.payload
    payloadHashes.url = post.payloadHash
  end
end

local receipt = cjson.encode({
  claimantDeviceHash = ARGV[1],
  payloads = payloads
})
redis.call("SET", KEYS[1], receipt, "EX", ARGV[2])
redis.call("DEL", KEYS[2])
for _, hash in pairs(payloadHashes) do
  redis.call("DEL", ARGV[6] .. hash)
end
for index = 3, #KEYS do
  redis.call("ZREM", KEYS[index], ARGV[3])
end

return cjson.encode({
  status = "CLAIMED",
  payloads = payloads,
  idempotent = false
})
`;
