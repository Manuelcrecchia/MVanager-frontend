/** A routed view owns its data refresh; never invoke lifecycle hooks or guess loader names. */
export interface RealtimeView {
  readonly realtimeResources: readonly string[];
  /** Existing resource subscriptions handle ordinary events; recovery still calls the hook. */
  readonly realtimeHandledLocally?: boolean;
  /** False means busy/editing: retain the invalidation and retry when safe. */
  refreshRealtimeData(): void | boolean | Promise<void | boolean>;
}

export function isRealtimeView(value: unknown): value is RealtimeView {
  const view = value as Partial<RealtimeView> | null;
  return !!view && Array.isArray(view.realtimeResources) && typeof view.refreshRealtimeData === 'function';
}
