import { EventEmitter } from 'node:events';

export type RecordEvent = {
  type: 'record_created' | 'record_updated' | 'record_deleted';
  appId: string;
  typeId: string;
  recordId: string;
  record: Record<string, unknown>;
  previousRecord?: Record<string, unknown>;
  userId: string;
  triggeredByAutomation?: boolean;
};

export const appEvents = new EventEmitter();

/**
 * Emit a record event non-blocking (fires on next tick so it doesn't delay HTTP response).
 */
export function emitRecordEvent(event: RecordEvent) {
  setImmediate(() => appEvents.emit('record_event', event));
}
