import type { DocumentFolder } from '../../shared/document-explorer/document-explorer.component';

export interface SharedFileRef {
  path: string;
  version: string;
}

export interface ArchiveFile extends SharedFileRef {
  filename: string;
  name: string;
  size: number;
  modifiedAt: string;
  uploadedAt?: string;
}

export interface ArchiveListing {
  folders: string[];
  folderMetadata?: DocumentFolder[];
  files: ArchiveFile[];
}

export interface ScopeCustomer {
  id: string;
  name: string;
  canReadDocuments?: boolean;
}

export interface AdminAccessScope {
  customers: string[] | null;
  customerDocuments: { customerId: string; files: SharedFileRef[] }[] | null;
  internalDocuments: SharedFileRef[] | null;
}

export type ScopeKey = keyof AdminAccessScope;
export const FULL_SCOPE: AdminAccessScope = { customers: null, customerDocuments: null, internalDocuments: null };

export const SCOPED_PERMISSION: Readonly<Record<string, ScopeKey>> = {
  CUSTOMERS_VIEW: 'customers',
  CUSTOMER_DOCS_VIEW: 'customerDocuments',
  INTERNAL_DOCS_VIEW: 'internalDocuments',
};

export const SCOPE_TITLES: Record<ScopeKey, string> = {
  customers: 'Clienti',
  customerDocuments: 'Documenti clienti',
  internalDocuments: 'Documenti interni',
};

export function isLimitedScope(scope: AdminAccessScope): boolean {
  return (Object.keys(FULL_SCOPE) as ScopeKey[]).some(key => scope[key] !== null);
}

export function legacyScope(scope?: AdminAccessScope | null): AdminAccessScope {
  return scope ? structuredClone(scope) : { ...FULL_SCOPE };
}

export function setCustomerSelection(scope: AdminAccessScope, customers: string[] | null): void {
  scope.customers = customers;
  if (customers && scope.customerDocuments) {
    scope.customerDocuments = scope.customerDocuments.filter(entry => customers.includes(entry.customerId));
  }
}

