/** Normalize subscriber user IDs and ensure the task creator is included (array of string ids). */
export function mergeCreatorIntoSubscribers(subscribersInput, creatorId) {
  const list = Array.isArray(subscribersInput)
    ? subscribersInput.filter(Boolean).map((id) => String(id))
    : [];
  const unique = [...new Set(list)];
  if (creatorId) {
    const cid = String(creatorId);
    if (!unique.includes(cid)) unique.push(cid);
  }
  return unique;
}
