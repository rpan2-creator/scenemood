export function feedbackFor(data, local, name) {
  return { kind: 'scenemood-feedback', version: 1, projectId: data.projectId, sceneId: data.sceneId,
    reviewer: name.trim() || 'Reviewer', vote: local.vote, comments: local.comments }
}
export function readFeedback(payload, projectId, sceneId, cameras) {
  if (payload?.kind !== 'scenemood-feedback' || payload.version !== 1 || payload.projectId !== projectId || payload.sceneId !== sceneId || !Array.isArray(payload.comments)) throw new Error('Choose feedback exported for this scene.');
  if (payload.comments.length > 1000) throw new Error('This feedback file is too large.');
  return payload.comments.map((m) => {
    if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 10000 || typeof m.id !== 'string' || typeof m.name !== 'string') throw new Error('Invalid feedback file.');
    return { id: m.id, author: m.name.slice(0, 120), text: m.text, frame: cameras.find((c) => c.label === m.cam)?.id, at: Number.isFinite(m.at) ? m.at : Date.now(), resolved: false };
  });
}
export function downloadFeedback(payload) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'scenemood-feedback.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
