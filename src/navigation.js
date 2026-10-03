export function nextConversationStep(step, questionCount) {
  return Math.min(questionCount, Math.max(0, Number(step) || 0) + 1);
}

export function previousConversationStep(step) {
  return Math.max(0, (Number(step) || 0) - 1);
}
