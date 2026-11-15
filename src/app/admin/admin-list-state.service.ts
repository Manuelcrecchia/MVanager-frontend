import { ViewportScroller } from '@angular/common';
import { Injectable } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { AuthServiceService } from '../auth-service.service';

interface ListFilters {
  quotes: { quoteSearch: string; showCompletedQuotes: boolean; openQuotes: Set<string> };
  employees: { employeeSearch: string; showArchived: boolean; openEmployees: Set<number> };
  customers: {
    customerSearch: string;
    showArchived: boolean;
    customerSort: 'alphabetical' | 'numberAsc' | 'numberDesc';
    openCustomers: Set<string>;
  };
}

type SavedLists = {
  [List in keyof ListFilters]?: { filters: ListFilters[List]; position: [number, number]; url: string };
};

export interface AdminListState {
  readonly restored: boolean;
  restoreScroll(): void;
  disconnect(): void;
}

@Injectable({ providedIn: 'root' })
export class AdminListStateService {
  private token: string | null = null;
  private saved: SavedLists = {};

  constructor(
    private router: Router,
    private viewport: ViewportScroller,
    private auth: AuthServiceService,
  ) {}

  connect<List extends keyof ListFilters>(
    list: List,
    readFilters: () => ListFilters[List],
    applyFilters: (filters: ListFilters[List]) => void,
    restorePrevious = true,
  ): AdminListState {
    const token = this.auth.token;
    if (this.token !== token) {
      this.saved = {};
      this.token = token;
    }
    const saved = this.saved[list];
    const navigationState = this.router.getCurrentNavigation();
    const returningWithBrowser = navigationState?.trigger === 'popstate' &&
      saved?.url === navigationState.finalUrl?.toString();
    const previous = restorePrevious || returningWithBrowser ? saved : undefined;
    let position = previous?.position;
    if (previous) applyFilters(previous.filters);

    const navigation = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart && token && this.auth.token === token) {
        Object.assign(this.saved, {
          [list]: { filters: readFilters(), position: position ?? this.viewport.getScrollPosition(), url: this.router.url },
        });
      }
    });

    let frame: number | undefined;
    return {
      restored: !!previous,
      restoreScroll: () => {
        if (!position || frame !== undefined || navigation.closed) return;
        // Wait for the rendered rows and the router's scroll-to-top after navigation.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            frame = undefined;
            if (position) this.viewport.scrollToPosition(position);
            position = undefined;
          });
        });
      },
      disconnect: () => {
        navigation.unsubscribe();
        if (frame !== undefined) cancelAnimationFrame(frame);
      },
    };
  }
}
