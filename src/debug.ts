export const DEBUG_MODE = false;

export function logDebug(topic: string, detail?: unknown) {
  if (!DEBUG_MODE) return;
  const entry = {
    topic,
    detail,
    timestamp: new Date().toISOString(),
  };
  try {
    console.log('[Athena::debug]', entry);
  } catch (error) {
    console.log('[Athena::debug]', topic, detail);
  }
  try {
    figma.ui.postMessage({ type: 'debug-log', payload: entry });
  } catch (error) {
    console.warn('[Athena::debug] failed to forward log to UI', error);
  }
}
